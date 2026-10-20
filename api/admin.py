"""POST /api/admin  { action, ... }  + Authorization: Bearer <Supabase 토큰>  — 관리자만

  list         {}                    → { teachers: [{id, name, email, used, quota, left, disabled}], default_quota }
  set_quota    { id, quota }         → 그 강사 한 줄
  set_disabled { id, disabled }      → 그 강사 한 줄
  log          {}                    → { log: [{at, teacher, lesson, concept, kind, retries}] }  (최근 50건)
  set_default  { quota }             → { default_quota }

관리자 = 강사이면서 이메일이 환경변수 ADMIN_EMAILS(쉼표 구분, 대소문자·공백 무시)에 있는 사람. 비었으면 아무도 아니다.
한도 값은 0..1000 정수(bool 제외). 한도를 쓴 횟수보다 낮춰도 left 는 0 — 음수 없음.
호출 수는 vercel.json maxDuration 30초 안에: 강사 확인 2 + 일 최대 3(list) · 5(set_*, 행이 없을 때) = 7번 × TIMEOUT 3초 = 21초.
"""
import json
import os
import sys
import urllib.parse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _accounts import UUID_RE  # noqa: E402
from _auth import NO_LINK, Fail, bearer, urllib_http, whoami  # noqa: E402

BAD = (400, {'error': '요청 형식이 잘못됐어요.'})
NOT_ADMIN = '관리자만 볼 수 있어요.'
MAX_QUOTA = 1000
q = urllib.parse.quote


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _quota_of(body, key='quota'):
    v = body.get(key)
    if not is_int(v) or not 0 <= v <= MAX_QUOTA:
        raise Fail(400, f'한도는 0 이상 {MAX_QUOTA} 이하 정수로 정해 주세요.')
    return v


def _line(tid, name, email, row, default):
    row = row if isinstance(row, dict) else {}
    quota, used, off = int(row.get('quota', default)), int(row.get('used', 0)), bool(row.get('disabled'))
    return {'id': tid, 'name': name, 'email': email, 'used': used, 'quota': quota,
            'left': 0 if off else max(0, quota - used), 'disabled': off}


def handle(body, token, env, http=urllib_http):
    """→ (status, json). 응답에는 키도 Supabase 원문 에러도 넣지 않는다."""
    try:
        me = whoami(token, env, http)
        allowed = {e.strip().lower() for e in str(env.get('ADMIN_EMAILS') or '').split(',') if e.strip()}
        if str(me.get('email') or '').strip().lower() not in allowed:
            raise Fail(403, NOT_ADMIN)
        if not isinstance(body, dict):
            return BAD
        return 200, _run(body, env, http)
    except Fail as f:
        return f.status, {'error': f.msg, **f.extra}
    except Exception as e:  # 시간 초과·연결 끊김 — 원문은 로그에만
        print('[admin] 오류', type(e).__name__, file=sys.stderr)
        return 502, {'error': NO_LINK}


class _Db:
    def __init__(self, env, http):
        self.url = env['SUPABASE_URL'].rstrip('/')
        key = env['SUPABASE_SERVICE_ROLE_KEY']
        self.h, self.http = {'apikey': key, 'Authorization': 'Bearer ' + key}, http

    def call(self, method, path, body=None, prefer=None, ok=(200, 201, 204)):
        h = {**self.h, 'Prefer': prefer} if prefer else self.h
        st, out = self.http(method, self.url + path, h, body)
        if st not in ok:
            raise Fail(502, NO_LINK)
        return out

    def rows(self, method, path, body=None, prefer=None):
        out = self.call(method, path, body, prefer)
        if not isinstance(out, list):
            raise Fail(502, NO_LINK)
        return out

    def default(self):
        rows = self.rows('GET', '/rest/v1/gen_settings?select=default_quota&id=eq.1')
        return int(rows[0]['default_quota']) if rows else 3

    def emails(self, only=None):
        if only:
            u = self.call('GET', '/auth/v1/admin/users/' + q(only))
            return {only: u.get('email') or ''} if isinstance(u, dict) else {}
        out = self.call('GET', '/auth/v1/admin/users?per_page=1000')
        users = out.get('users') if isinstance(out, dict) else None
        if not isinstance(users, list):
            raise Fail(502, NO_LINK)
        return {u['id']: u.get('email') or '' for u in users if isinstance(u, dict) and u.get('id')}


def _run(body, env, http):
    db = _Db(env, http)
    a = body.get('action')
    if a == 'list':
        # gen_quota 는 profiles 를 가리키는 1:1 FK — 한 번에 붙여 받는다 (호출 수 절약)
        profiles = db.rows('GET', '/rest/v1/profiles?select=id,name,gen_quota(quota,used,disabled)&role=eq.teacher&order=name')
        default, emails = db.default(), db.emails()
        return {'teachers': [_line(p['id'], p.get('name') or '', emails.get(p['id'], ''), _embed(p.get('gen_quota')), default)
                             for p in profiles], 'default_quota': default}
    if a == 'log':
        rows = db.rows('GET', '/rest/v1/gen_log?select=created_at,lesson,concept,kind,retries,profiles(name)&order=created_at.desc&limit=50')
        return {'log': [{'at': r.get('created_at'), 'teacher': (r.get('profiles') or {}).get('name', ''), 'lesson': r.get('lesson'),
                         'concept': r.get('concept'), 'kind': r.get('kind'), 'retries': r.get('retries')} for r in rows]}
    if a == 'set_default':
        v = _quota_of(body)
        db.rows('PATCH', '/rest/v1/gen_settings?id=eq.1', {'default_quota': v}, 'return=representation')
        return {'default_quota': v}
    if a in ('set_quota', 'set_disabled'):
        tid = body.get('id')
        if not isinstance(tid, str) or not UUID_RE.fullmatch(tid):
            raise Fail(400, '요청 형식이 잘못됐어요.')
        if a == 'set_quota':
            change = {'quota': _quota_of(body)}
        elif isinstance(body.get('disabled'), bool):
            change = {'disabled': body['disabled']}
        else:
            raise Fail(400, '요청 형식이 잘못됐어요.')
        return _set(db, tid, change)
    raise Fail(400, '요청 형식이 잘못됐어요.')


def _embed(v):
    return v[0] if isinstance(v, list) and v else v


def _set(db, tid, change):
    """강사 확인 → 있는 행을 고친다 → 없으면 만든다. 행이 없는 강사의 기본값은 default_quota."""
    who = db.rows('GET', '/rest/v1/profiles?select=name&role=eq.teacher&id=eq.' + q(tid))
    if not who:
        raise Fail(404, '선생님을 찾을 수 없어요.')
    rows = db.rows('PATCH', '/rest/v1/gen_quota?teacher_id=eq.' + q(tid), {**change, 'updated_at': _now()}, 'return=representation')
    if not rows:
        # 같은 강사를 동시에 만들면 한쪽은 충돌 → 502. ponytail: 재시도 없이 다시 누르게 둔다
        new = {'teacher_id': tid, 'quota': change['quota'] if 'quota' in change else db.default(), **change}
        rows = db.rows('POST', '/rest/v1/gen_quota', new, 'return=representation')
    row = rows[0] if rows else {}
    return _line(tid, who[0].get('name') or '', db.emails(tid).get(tid, ''), row, 0)


def _now():
    return datetime.now(timezone.utc).isoformat()


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(200, {})

    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        except (ValueError, TypeError, UnicodeDecodeError):
            body = None  # 강사 확인이 먼저 — 로그인 안 했으면 401 이 먼저 나간다
        self._send(*handle(body, bearer(self.headers.get('Authorization')), os.environ, urllib_http))
