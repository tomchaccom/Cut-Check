"""강사 확인 — 부른 사람의 Supabase 토큰으로 사용자를 묻고, 역할이 teacher 인지 본다.

LLM 을 부르는 함수(생성)는 이걸로 비용 남용을 막는다. 보안 경계는 아니다 — 이메일로 가입하면 누구나 강사다.
그래서 AI 가 쓴 코드는 서버에서 돌리지 않는다 (docs/superpowers/specs/2026-10-19-stepwise-generation-design.md 서버 절).
Supabase 호출은 http(method, url, headers, body) -> (status, json) 로 받아서 테스트가 가짜를 끼운다.
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

# 호출 하나의 한도. create-student 는 한 요청에 최대 9번 부른다 — 9 × 3초 = 27초 < maxDuration 30초 (_accounts.py)
TIMEOUT = 3
NO_LINK = 'Supabase 에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.'


class Fail(Exception):
    def __init__(self, status, msg, extra=None):
        super().__init__(msg)
        self.status = status
        self.msg = msg
        self.extra = extra or {}  # 응답에 error 와 같이 실을 것 (한도 0 이면 {'left': 0})


def bearer(header):
    """'Bearer <token>' 에서 토큰만. 형식이 다르면 빈 문자열 → 401"""
    parts = str(header or '').split()
    return parts[1] if len(parts) == 2 and parts[0].lower() == 'bearer' else ''


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


def teacher(token, env, http=urllib_http):
    """→ 강사 user id. 아니면 Fail(401 · 403 · 502)."""
    return whoami(token, env, http)['id']


def whoami(token, env, http=urllib_http):
    """→ {'id', 'email'} — 강사일 때만. 아니면 teacher() 와 같은 Fail."""
    if not token:
        raise Fail(401, '다시 로그인해 주세요.')
    url, anon, service = env.get('SUPABASE_URL'), env.get('SUPABASE_ANON_KEY'), env.get('SUPABASE_SERVICE_ROLE_KEY')
    if not (url and anon and service):
        raise Fail(502, '서버에 계정 설정이 없어요. 관리자에게 알려 주세요.')
    url = url.rstrip('/')
    # 1) 부른 사람이 누구인가 — 그 사람의 토큰으로 묻는다
    st, me = http('GET', url + '/auth/v1/user', {'apikey': anon, 'Authorization': 'Bearer ' + token})
    if st in (401, 403):
        raise Fail(401, '다시 로그인해 주세요.')
    if st != 200 or not isinstance(me, dict) or not me.get('id'):
        raise Fail(502, NO_LINK)
    # 2) 강사인가 — 학생 토큰으로는 아무것도 못 한다
    st, rows = http('GET', url + '/rest/v1/profiles?select=role&id=eq.' + urllib.parse.quote(me['id']),
                    {'apikey': service, 'Authorization': 'Bearer ' + service})
    if st != 200 or not isinstance(rows, list):
        raise Fail(502, NO_LINK)
    if not rows or rows[0].get('role') != 'teacher':
        raise Fail(403, '선생님 계정만 할 수 있어요.')
    return {'id': me['id'], 'email': me.get('email')}


def ident(token, env, http=urllib_http):
    """핸들러용 — (강사 id, None) 또는 (None, 보낼 (status, json)). 원문 에러는 로그에만."""
    try:
        return teacher(token, env, http), None
    except Fail as f:
        return None, (f.status, {'error': f.msg, **f.extra})
    except Exception as e:  # 시간 초과·연결 끊김
        print('[auth] 오류', type(e).__name__, file=sys.stderr)
        return None, (502, {'error': NO_LINK})


def refuse(token, env, http=urllib_http):
    """강사면 None, 아니면 보낼 (status, json)."""
    return ident(token, env, http)[1]
