"""학생 계정 만들기 · 비밀번호 다시 만들기 — 선생님만, 자기 교실 학생만.

HTTP 는 create-student.py 가 다루고, 여기는 규칙과 Supabase 호출 순서만 둔다.
Supabase 호출은 http(method, url, headers, body) -> (status, json) 로 받아서 테스트가 가짜를 끼운다.
"""
import json
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request

DOMAIN = 'students.invalid'
LOGIN_RE = re.compile(r'^[a-z0-9-]{3,30}$')
# 헷갈리는 글자(0/o, 1/l/i)를 뺐다 — 선생님이 칠판에 쓰고 학생이 받아 적는다
ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
UUID_RE = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
# 한 요청의 Supabase 호출은 최대 6번(사용자·역할·교실·생성·수강·되돌리기 / reset 도 6번).
# 6 × 4초 = 24초 < vercel.json maxDuration 30초 — 호출을 늘리면 이 숫자도 다시 계산한다.
TIMEOUT = 4


class Fail(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status = status
        self.msg = msg


def bearer(header):
    """'Bearer <token>' 에서 토큰만. 형식이 다르면 빈 문자열 → 401"""
    parts = str(header or '').split()
    return parts[1] if len(parts) == 2 and parts[0].lower() == 'bearer' else ''


def valid_login(s):
    return isinstance(s, str) and bool(LOGIN_RE.match(s))


def email_of(login_id):
    return login_id + '@' + DOMAIN


def new_password(n=8):
    return ''.join(secrets.choice(ALPHABET) for _ in range(n))


def urllib_http(method, url, headers, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={**headers, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else None
        except ValueError:
            return e.code, None


def _password(body):
    pw = body.get('password')
    if pw in (None, ''):
        return new_password()
    if not isinstance(pw, str) or not 6 <= len(pw) <= 72:
        raise Fail(400, '비밀번호는 6자 이상 72자 이하로 정해 주세요.')
    return pw


def handle(body, token, env, http=urllib_http):
    """→ (status, json). 응답에는 키도 Supabase 원문 에러도 넣지 않는다."""
    url, anon, service = env.get('SUPABASE_URL'), env.get('SUPABASE_ANON_KEY'), env.get('SUPABASE_SERVICE_ROLE_KEY')
    if not (url and anon and service):
        return 502, {'error': '서버에 계정 설정이 없어요. 관리자에게 알려 주세요.'}
    url = url.rstrip('/')
    try:
        return 200, _run(body, token, url, anon, service, http)
    except Fail as f:
        return f.status, {'error': f.msg}
    except Exception as e:  # 시간 초과·연결 끊김 — 원문은 로그에만
        print('[create-student] 오류', type(e).__name__, file=sys.stderr)
        return 502, {'error': 'Supabase 에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.'}


def _run(body, token, url, anon, service, http):
    if not token:
        raise Fail(401, '다시 로그인해 주세요.')
    if not isinstance(body, dict):
        raise Fail(400, '요청 형식이 잘못됐어요.')
    action = body.get('action')
    room = body.get('classroomId')
    login = str(body.get('loginId') or '').strip().lower()
    if action not in ('create', 'reset') or not isinstance(room, str) or not UUID_RE.match(room):
        raise Fail(400, '요청 형식이 잘못됐어요.')
    if not valid_login(login):
        raise Fail(400, '아이디는 영어 소문자·숫자·- 로 3~30자예요.')
    name = str(body.get('name') or '').strip()[:40]
    if action == 'create' and not name:
        raise Fail(400, '학생 이름을 적어 주세요.')
    pw = _password(body)

    # 1) 부른 사람이 누구인가 — 그 사람의 토큰으로 묻는다
    st, me = http('GET', url + '/auth/v1/user', {'apikey': anon, 'Authorization': 'Bearer ' + token})
    if st == 401 or st == 403:
        raise Fail(401, '다시 로그인해 주세요.')
    if st != 200 or not isinstance(me, dict) or not me.get('id'):
        raise Fail(502, 'Supabase 에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.')

    adm = {'apikey': service, 'Authorization': 'Bearer ' + service}
    rest = url + '/rest/v1/'

    def get(path):
        st, rows = http('GET', rest + path, adm)
        if st != 200 or not isinstance(rows, list):
            raise Fail(502, 'Supabase 에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.')
        return rows

    q = urllib.parse.quote
    # 2) 강사인가 — 학생 토큰으로는 아무것도 못 한다
    prof = get('profiles?select=role&id=eq.' + q(me['id']))
    if not prof or prof[0].get('role') != 'teacher':
        raise Fail(403, '선생님 계정만 할 수 있어요.')

    # 3) 이 교실의 선생님인가
    rooms = get('classrooms?select=id&id=eq.' + q(room) + '&teacher_id=eq.' + q(me['id']))
    if not rooms:
        raise Fail(403, '이 교실의 선생님만 할 수 있어요.')

    if action == 'reset':
        found = get('profiles?select=id&role=eq.student&login_id=eq.' + q(login))
        if not found or not get('enrollments?select=id&classroom_id=eq.' + q(room) + '&student_id=eq.' + q(found[0]['id'])):
            raise Fail(403, '이 교실 학생이 아니에요.')
        st, _ = http('PUT', url + '/auth/v1/admin/users/' + q(found[0]['id']), adm, {'password': pw})
        if st != 200:
            raise Fail(502, '비밀번호를 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.')
        return {'loginId': login, 'password': pw}

    # 4) 계정 만들기 — role 은 app_metadata 로만 (트리거가 이것만 본다)
    st, user = http('POST', url + '/auth/v1/admin/users', adm, {
        'email': email_of(login), 'password': pw, 'email_confirm': True,
        'app_metadata': {'role': 'student'}, 'user_metadata': {'name': name}})
    err = user if isinstance(user, dict) else {}
    if st == 409 or err.get('error_code') == 'email_exists' or 'already' in str(err.get('msg') or err.get('message') or ''):
        raise Fail(409, '이미 있는 아이디예요.')
    if st == 422:   # 약한 비밀번호 등 — 원문은 넘기지 않는다
        raise Fail(400, '이 아이디나 비밀번호로는 만들 수 없어요. 다른 걸로 해 주세요.')
    if st not in (200, 201) or not isinstance(user, dict) or not user.get('id'):
        raise Fail(502, '계정을 만들지 못했어요. 잠시 뒤 다시 해 주세요.')

    # 5) 교실에 넣기 — 어떤 이유로든 실패하면 방금 만든 계정을 지운다.
    #    교실 없는 계정이 남으면 아이디가 묶여서(다시 만들기 409, reset 403) 선생님이 풀 길이 없다.
    try:
        st, _ = http('POST', rest + 'enrollments', {**adm, 'Prefer': 'return=minimal'},
                     {'student_id': user['id'], 'classroom_id': room})
        ok = st in (200, 201, 204)
    except Exception:
        ok = False
    if not ok:
        _rollback(http, url + '/auth/v1/admin/users/' + q(user['id']), adm, user['id'])
        raise Fail(502, '교실에 넣지 못했어요. 잠시 뒤 다시 해 주세요.')
    return {'loginId': login, 'password': pw, 'id': user['id'], 'name': name}


def _rollback(http, user_url, adm, uid):
    try:
        st, _ = http('DELETE', user_url, adm)
        if st in (200, 204):
            return
    except Exception:
        st = 'exception'
    # ponytail: 로그만 남긴다. 남은 계정은 Supabase 대시보드에서 지운다 (자동 재시도 큐는 아직 필요 없다)
    print('[create-student] 되돌리기 실패 — 교실 없는 계정이 남음', uid, st, file=sys.stderr)
