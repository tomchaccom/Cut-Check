"""학생 계정 만들기 — Supabase 는 가짜.

  python3 test/test_accounts.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
from _accounts import ALPHABET, email_of, handle, new_password, valid_login  # noqa: E402

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


def fake(users=None, enrolled=(), create_status=200):
    """users: token → 선생님 id. 교실 r1 의 선생님은 t1. 학생 kim-1(s9) 은 enrolled 에 있으면 r1 수강 중"""
    users = users or {'TOK1': 't1', 'TOK2': 't2'}
    calls = []

    def http(method, url, headers, body=None):
        calls.append((method, url, headers, body))
        if url == U + '/auth/v1/user':
            tok = headers['Authorization'][7:]
            return (200, {'id': users[tok]}) if tok in users else (401, {'msg': 'bad jwt'})
        if '/rest/v1/classrooms' in url:
            return 200, ([{'id': 'r1'}] if 'id=eq.r1' in url and 'teacher_id=eq.t1' in url else [])
        if '/rest/v1/profiles' in url:
            return 200, ([{'id': 's9'}] if 'login_id=eq.kim-1' in url else [])
        if '/rest/v1/enrollments' in url and method == 'GET':
            return 200, ([{'id': 'e1'}] if 's9' in enrolled and 'student_id=eq.s9' in url else [])
        if '/rest/v1/enrollments' in url:
            return 201, None
        if url == U + '/auth/v1/admin/users':
            if create_status == 422:
                return 422, {'code': 422, 'error_code': 'email_exists', 'msg': 'A user with this email address has already been registered'}
            return 200, {'id': 'new1'}
        if '/auth/v1/admin/users/' in url:
            return 200, {'id': 's9'}
        return 500, None
    return http, calls


def call(body, token, **kw):
    http, calls = fake(**kw)
    st, out = handle(body, token, ENV, http)
    return st, out, calls


C = {'action': 'create', 'classroomId': 'r1', 'name': '김가은', 'loginId': 'kim-1'}

st, out, _ = call(C, '')
t('토큰 없으면 401', st == 401, out)
st, out, _ = call(C, 'NOPE')
t('잘못된 토큰 401', st == 401, out)
st, out, calls = call(C, 'TOK2')
t('다른 선생님이면 403', st == 403, out)
t('403 이면 계정을 만들지 않는다', not any('/admin/users' in c[1] for c in calls))
for bad in ('ab', 'kim_1', 'a' * 31, '김', 'kim 1'):
    st, out, _ = call({**C, 'loginId': bad}, 'TOK1')
    t('잘못된 아이디 400: ' + bad, st == 400, out)
st, out, _ = call({**C, 'loginId': 'Kim-1'}, 'TOK1')
t('대문자는 소문자로 받는다', st == 200 and out['loginId'] == 'kim-1', out)
t('valid_login', valid_login('ab-3') and not valid_login('ab') and not valid_login('a.b'))
st, out, _ = call({**C, 'password': '123'}, 'TOK1')
t('짧은 비밀번호 400', st == 400, out)
st, out, _ = call(C, 'TOK1', create_status=422)
t('이미 있는 아이디 409', st == 409 and out['error'] == '이미 있는 아이디예요.', out)

st, out, calls = call(C, 'TOK1')
t('성공 200 + 비밀번호', st == 200 and len(out['password']) == 8 and out['loginId'] == 'kim-1', out)
t('비밀번호는 헷갈리지 않는 글자만', all(c in ALPHABET for c in out['password']))
mk = [c for c in calls if c[1] == U + '/auth/v1/admin/users']
t('admin 생성 — app_metadata role student, 이메일 매핑',
  len(mk) == 1 and mk[0][3]['app_metadata'] == {'role': 'student'} and mk[0][3]['email'] == 'kim-1@students.invalid'
  and mk[0][3]['email_confirm'] is True and mk[0][3]['user_metadata'] == {'name': '김가은'}, mk)
t('admin 호출은 service 키로', mk[0][2]['Authorization'] == 'Bearer SERVICE-SECRET')
t('사용자 확인은 anon 키 + 선생님 토큰',
  calls[0][2] == {'apikey': 'ANON', 'Authorization': 'Bearer TOK1'})
en = [c for c in calls if c[0] == 'POST' and '/rest/v1/enrollments' in c[1]]
t('수강 한 줄을 넣는다', en and en[0][3] == {'student_id': 'new1', 'classroom_id': 'r1'}, en)
st, out, _ = call({**C, 'password': 'mypass12'}, 'TOK1')
t('선생님이 정한 비밀번호를 쓴다', out.get('password') == 'mypass12')

R = {'action': 'reset', 'classroomId': 'r1', 'loginId': 'kim-1'}
st, out, calls = call(R, 'TOK1')
t('수강하지 않은 학생은 reset 403', st == 403 and not any(c[0] == 'PUT' for c in calls), out)
st, out, calls = call(R, 'TOK1', enrolled=('s9',))
put = [c for c in calls if c[0] == 'PUT']
t('수강 중인 학생 reset 200', st == 200 and put and put[0][1].endswith('/admin/users/s9')
  and put[0][3]['password'] == out['password'], (st, out))
st, out, _ = call(R, 'TOK2', enrolled=('s9',))
t('다른 선생님은 reset 403', st == 403)

everything = []
for body, tok, kw in [(C, '', {}), (C, 'TOK2', {}), (C, 'TOK1', {'create_status': 422}), (C, 'TOK1', {}), (R, 'TOK1', {}), ('x', 'TOK1', {})]:
    st, out, _ = call(body, tok, **kw)
    everything.append(json.dumps(out, ensure_ascii=False))
t('응답 어디에도 service 키가 없다', not any('SERVICE-SECRET' in s or 'already been registered' in s for s in everything), everything)
t('키가 없으면 502', handle(C, 'TOK1', {}, fake()[0])[0] == 502)
t('email_of', email_of('kim-1') == 'kim-1@students.invalid')
t('new_password 길이', len(new_password()) == 8 and new_password() != new_password())

print(f'\n{"FAIL " + str(fail) if fail else "ALL PASS"}')
sys.exit(1 if fail else 0)
