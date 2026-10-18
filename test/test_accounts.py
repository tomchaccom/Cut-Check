"""학생 계정 만들기 — Supabase 는 가짜.

  python3 test/test_accounts.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
from _accounts import ALPHABET, bearer, email_of, handle, new_password, valid_login  # noqa: E402

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


ENV = {'SUPABASE_URL': 'https://x.supabase.co', 'SUPABASE_ANON_KEY': 'ANON', 'SUPABASE_SERVICE_ROLE_KEY': 'SERVICE-SECRET'}
U = 'https://x.supabase.co'
R1 = '11111111-2222-3333-4444-555555555555'   # t1 의 교실
ROLES = {'t1': 'teacher', 't2': 'teacher', 's5': 'student'}


def fake(enrolled=(), create_status=200, enroll='ok', delete_status=204, creates=None, existing=None, lookup_status=200):
    """토큰 TOK1→t1(R1 주인), TOK2→t2(다른 선생님), STU→s5(학생).
    학생 kim-1(s9). tch-1 은 아이디가 같은 강사 행 — role=eq.student 필터가 없으면 잡힌다."""
    users = {'TOK1': 't1', 'TOK2': 't2', 'STU': 's5'}
    calls = []
    # creates: 생성 호출마다 돌려줄 상태 순서 (422 = 이미 있음). existing: filter 로 찾힐 사용자들
    creates = list(creates) if creates is not None else [create_status]

    def http(method, url, headers, body=None):
        calls.append((method, url, headers, body))
        if url == U + '/auth/v1/user':
            tok = headers['Authorization'][7:]
            return (200, {'id': users[tok]}) if tok in users else (401, {'msg': 'bad jwt'})
        if '/rest/v1/profiles?select=role&id=eq.' in url:
            uid = url.rsplit('eq.', 1)[1]
            return 200, ([{'role': ROLES[uid]}] if uid in ROLES else [])
        if '/rest/v1/classrooms' in url:
            return 200, ([{'id': R1}] if 'id=eq.' + R1 in url and 'teacher_id=eq.t1' in url else [])
        if '/rest/v1/profiles' in url:
            rows = []
            if 'login_id=eq.kim-1' in url:
                rows.append({'id': 's9'})
            if 'login_id=eq.tch-1' in url and 'role=eq.student' not in url:
                rows.append({'id': 't9'})
            return 200, rows
        if '/rest/v1/enrollments' in url and method == 'GET':
            sid = url.rsplit('student_id=eq.', 1)[1]
            return 200, ([{'id': 'e1'}] if sid in enrolled else [])
        if '/rest/v1/enrollments' in url:
            if enroll == 'raise':
                raise TimeoutError('timed out')
            return (201, None) if enroll == 'ok' else (500, {'message': 'SERVICE-SECRET leaked?'})
        if url.startswith(U + '/auth/v1/admin/users?'):
            return lookup_status, ({'users': existing or [], 'aud': 'authenticated'} if lookup_status == 200 else None)
        if url == U + '/auth/v1/admin/users':
            if (creates.pop(0) if len(creates) > 1 else creates[0]) == 422:
                return 422, {'code': 422, 'error_code': 'email_exists', 'msg': 'A user with this email address has already been registered'}
            return 200, {'id': 'new1'}
        if '/auth/v1/admin/users/' in url and method == 'DELETE':
            return delete_status, None
        if '/auth/v1/admin/users/' in url:
            return 200, {'id': 's9'}
        return 500, None
    return http, calls


def call(body, token, **kw):
    http, calls = fake(**kw)
    st, out = handle(body, token, ENV, http)
    return st, out, calls


def deletes(calls):
    return [c for c in calls if c[0] == 'DELETE']


C = {'action': 'create', 'classroomId': R1, 'name': '김가은', 'loginId': 'kim-1'}

st, out, _ = call(C, '')
t('토큰 없으면 401', st == 401, out)
st, out, _ = call(C, 'NOPE')
t('잘못된 토큰 401', st == 401, out)
t('Authorization 형식', bearer('Bearer abc') == 'abc' and bearer('bearer abc') == 'abc'
  and bearer('abc') == '' and bearer('Basic abc') == '' and bearer('Bearer') == '' and bearer('Bearer a b') == ''
  and bearer(None) == '')
st, out, _ = call(C, bearer('Token TOK1'))
t('형식이 틀린 Authorization 이면 401', st == 401, out)
st, out, calls = call(C, 'TOK2')
t('다른 선생님이면 403', st == 403, out)
t('403 이면 계정을 만들지 않는다', not any('/admin/users' in c[1] for c in calls))
st, out, calls = call(C, 'STU')
t('학생 토큰이면 403', st == 403 and not any('/admin/users' in c[1] for c in calls), out)
for bad in ('r1', '', 123, R1 + 'x', "x' or 1=1"):
    st, out, _ = call({**C, 'classroomId': bad}, 'TOK1')
    t('UUID 아닌 classroomId 400: ' + repr(bad), st == 400, out)
for bad in ('ab', 'kim_1', 'a' * 31, '김', 'kim 1'):
    st, out, _ = call({**C, 'loginId': bad}, 'TOK1')
    t('잘못된 아이디 400: ' + bad, st == 400, out)
st, out, _ = call({**C, 'loginId': 'Kim-1'}, 'TOK1')
t('대문자는 소문자로 받는다', st == 200 and out['loginId'] == 'kim-1', out)
t('valid_login', valid_login('ab-3') and not valid_login('ab') and not valid_login('a.b'))
st, out, _ = call({**C, 'password': '123'}, 'TOK1')
t('짧은 비밀번호 400', st == 400, out)
st, out, calls = call(C, 'TOK1', create_status=422, existing=[{'id': 's9', 'email': 'kim-1@students.invalid', 'app_metadata': {'provider': 'email', 'role': 'student'}}])
t('이미 있는 아이디(진짜 학생) 409 + 아무것도 지우지 않는다', st == 409 and out['error'] == '이미 있는 아이디예요.' and not deletes(calls), out)

# 공개 가입으로 학생 도메인을 먼저 차지한 계정 — filter 는 부분 일치라 xkim-1 도 같이 온다
SQ = [{'id': 'x1', 'email': 'xkim-1@students.invalid', 'app_metadata': {'role': 'student'}},
      {'id': 'q1', 'email': 'kim-1@students.invalid', 'app_metadata': {'provider': 'email'}}]
st, out, calls = call(C, 'TOK1', creates=[422, 200], existing=SQ)
d = deletes(calls)
mk = [c for c in calls if c[1] == U + '/auth/v1/admin/users']
t('차지한 계정 → 찾기 → 지우기 → 다시 만들기 → 200', st == 200 and len(d) == 1 and d[0][1].endswith('/admin/users/q1')
  and len(mk) == 2, (st, out, d))
lk = [c for c in calls if '/admin/users?' in c[1]]
t('찾기는 filter=이메일, service 키', lk and 'filter=kim-1%40students.invalid' in lk[0][1]
  and lk[0][2]['Authorization'] == 'Bearer SERVICE-SECRET', lk)
st, out, calls = call(C, 'TOK1', creates=[422, 422], existing=SQ)
mk = [c for c in calls if c[1] == U + '/auth/v1/admin/users']
t('다시 만들기는 한 번만 — 또 막히면 409', st == 409 and len(mk) == 2 and len(deletes(calls)) == 1, (st, out))
st, out, calls = call(C, 'TOK1', create_status=422, lookup_status=500)
t('찾기 실패 → 502, 아무것도 지우지 않는다', st == 502 and not deletes(calls), (st, out))
st, out, calls = call(C, 'TOK1', create_status=422, existing=SQ[:1])
t('정확히 같은 이메일이 없으면 502, 아무것도 지우지 않는다', st == 502 and not deletes(calls), (st, out))
st, out, calls = call(C, 'TOK1', creates=[422, 200], existing=SQ, delete_status=500)
mk = [c for c in calls if c[1] == U + '/auth/v1/admin/users']
t('차지한 계정을 못 지우면 502, 다시 만들지 않는다', st == 502 and len(mk) == 1, (st, out))

st, out, calls = call(C, 'TOK1')
t('성공 200 + 비밀번호', st == 200 and len(out['password']) == 8 and out['loginId'] == 'kim-1', out)
t('비밀번호는 헷갈리지 않는 글자만', all(c in ALPHABET for c in out['password']))
mk = [c for c in calls if c[1] == U + '/auth/v1/admin/users']
t('admin 생성 — app_metadata role student, 이메일 매핑',
  len(mk) == 1 and mk[0][3]['app_metadata'] == {'role': 'student'} and mk[0][3]['email'] == 'kim-1@students.invalid'
  and mk[0][3]['email_confirm'] is True and mk[0][3]['user_metadata'] == {'name': '김가은'}, mk)
t('admin 호출은 service 키로', mk[0][2]['Authorization'] == 'Bearer SERVICE-SECRET')
t('사용자 확인은 anon 키 + 선생님 토큰', calls[0][2] == {'apikey': 'ANON', 'Authorization': 'Bearer TOK1'})
en = [c for c in calls if c[0] == 'POST' and '/rest/v1/enrollments' in c[1]]
t('수강 한 줄을 넣는다', en and en[0][3] == {'student_id': 'new1', 'classroom_id': R1}, en)
t('성공이면 지우지 않는다', not deletes(calls))
st, out, _ = call({**C, 'password': 'mypass12'}, 'TOK1')
t('선생님이 정한 비밀번호를 쓴다', out.get('password') == 'mypass12')

st, out, calls = call(C, 'TOK1', enroll='fail')
d = deletes(calls)
t('수강 넣기 실패 → 502 + 만든 계정 DELETE', st == 502 and len(d) == 1 and d[0][1].endswith('/admin/users/new1'), (st, out, d))
st, out, calls = call(C, 'TOK1', enroll='raise')
d = deletes(calls)
t('수강 넣기 예외(시간 초과) → 502 + 만든 계정 DELETE', st == 502 and len(d) == 1 and d[0][1].endswith('/admin/users/new1'), (st, out, d))
st, out, calls = call(C, 'TOK1', enroll='fail', delete_status=500)
t('되돌리기도 실패하면 그래도 502 (로그만)', st == 502, out)

R = {'action': 'reset', 'classroomId': R1, 'loginId': 'kim-1'}
st, out, calls = call(R, 'TOK1')
t('수강하지 않은 학생은 reset 403', st == 403 and not any(c[0] == 'PUT' for c in calls), out)
st, out, calls = call(R, 'TOK1', enrolled=('s9',))
put = [c for c in calls if c[0] == 'PUT']
t('수강 중인 학생 reset 200', st == 200 and put and put[0][1].endswith('/admin/users/s9')
  and put[0][3]['password'] == out['password'], (st, out))
look = [c[1] for c in calls if '/rest/v1/profiles' in c[1] and 'login_id=' in c[1]]
t('reset 은 role=eq.student 로만 찾는다', look and all('role=eq.student' in u for u in look), look)
st, out, calls = call({**R, 'loginId': 'tch-1'}, 'TOK1', enrolled=('t9',))
t('같은 아이디의 강사 행은 reset 되지 않는다', st == 403 and not any(c[0] == 'PUT' for c in calls), out)
st, out, _ = call(R, 'TOK2', enrolled=('s9',))
t('다른 선생님은 reset 403', st == 403)

everything = []
for body, tok, kw in [(C, '', {}), (C, 'TOK2', {}), (C, 'TOK1', {'create_status': 422}), (C, 'TOK1', {}),
                      (C, 'TOK1', {'enroll': 'fail'}), (C, 'TOK1', {'enroll': 'raise'}), (R, 'TOK1', {}), ('x', 'TOK1', {})]:
    st, out, _ = call(body, tok, **kw)
    everything.append(json.dumps(out, ensure_ascii=False))
t('응답 어디에도 service 키·Supabase 원문이 없다',
  not any('SERVICE-SECRET' in s or 'already been registered' in s or 'timed out' in s for s in everything), everything)
t('키가 없으면 502', handle(C, 'TOK1', {}, fake()[0])[0] == 502)
t('email_of', email_of('kim-1') == 'kim-1@students.invalid')
t('new_password 길이', len(new_password()) == 8 and new_password() != new_password())

print(f'\n{"FAIL " + str(fail) if fail else "ALL PASS"}')
sys.exit(1 if fail else 0)
