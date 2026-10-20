"""관리자 API(api/admin.py) — Supabase 는 가짜.

  uv run --with-requirements requirements.txt python test/test_admin.py
"""
import importlib.util
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
spec = importlib.util.spec_from_file_location('admin', os.path.join(ROOT, 'api', 'admin.py'))
admin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(admin)

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


A, B, C = 'a' * 8 + '-1111-2222-3333-' + 'a' * 12, 'b' * 8 + '-1111-2222-3333-' + 'b' * 12, 'c' * 8 + '-1111-2222-3333-' + 'c' * 12
ENV = {'SUPABASE_URL': 'https://x.supabase.co/', 'SUPABASE_ANON_KEY': 'ANON', 'SUPABASE_SERVICE_ROLE_KEY': 'SERVICE-FAKE',
       'ADMIN_EMAILS': ' A@Example.com , b@x.com'}


def fake(me=A, me_email='a@example.com', quota_rows=None, patch_rows=None):
    """admin 이 부르는 Supabase 경로만 흉내 낸다. 부른 것을 남긴다."""
    calls = []

    def http(method, url, headers, body=None):
        calls.append((method, url, body))
        if url.endswith('/auth/v1/user'):
            return 200, {'id': me, 'email': me_email}
        if '/rest/v1/profiles?select=role' in url:
            return 200, [{'role': 'teacher'}]
        if '/rest/v1/profiles?select=name' in url:
            return 200, [{'name': '김선생'}]
        if '/rest/v1/profiles' in url:   # list
            return 200, [{'id': A, 'name': '가', 'gen_quota': {'quota': 5, 'used': 3, 'disabled': False}},
                         {'id': B, 'name': '나', 'gen_quota': None},
                         {'id': C, 'name': '다', 'gen_quota': {'quota': 2, 'used': 3, 'disabled': True}}]
        if '/auth/v1/admin/users?' in url:
            return 200, {'users': [{'id': A, 'email': 'a@example.com'}, {'id': B, 'email': 'b@x.com'}]}
        if '/auth/v1/admin/users/' in url:
            return 200, {'id': A, 'email': 'a@example.com'}
        if '/rest/v1/gen_settings' in url:
            return 200, [{'default_quota': 3}]
        if method == 'PATCH' and '/rest/v1/gen_quota' in url:
            return 200, patch_rows if patch_rows is not None else [{'teacher_id': A, 'quota': body.get('quota', 5), 'used': 3, 'disabled': body.get('disabled', False)}]
        if method == 'POST' and '/rest/v1/gen_quota' in url:
            return 201, [{'teacher_id': A, 'quota': body['quota'], 'used': 0, 'disabled': body.get('disabled', False)}]
        if '/rest/v1/gen_log' in url:
            return 200, [{'created_at': '2026-10-20T01:00:00Z', 'lesson': '쉼표', 'concept': '나누기', 'kind': 'step', 'retries': 1, 'profiles': {'name': '가'}}]
        return 404, None
    http.calls = calls
    return http


def run(body, token='tok', env=ENV, **kw):
    h = fake(**kw)
    st, out = admin.handle(body, token, env, h)
    return st, out, h


st, out, h = run({'action': 'list'}, token='')
t('토큰 없음 → 401', st == 401, (st, out))
st, out, h = run({'action': 'list'}, env={k: v for k, v in ENV.items() if k != 'ADMIN_EMAILS'})
t('ADMIN_EMAILS 없음 → 403', st == 403 and out == {'error': '관리자만 볼 수 있어요.'}, (st, out))
st, out, h = run({'action': 'list'}, env={**ENV, 'ADMIN_EMAILS': ' , '})
t('ADMIN_EMAILS 빈 값 → 403', st == 403, (st, out))
st, out, h = run({'action': 'list'}, me_email='z@x.com')
t('목록에 없는 강사 → 403', st == 403 and h.calls[-1][1].endswith('role=eq.teacher') is False and not any('gen_quota' in c[1] for c in h.calls), (st, out))
st, out, h = run({'action': 'list'}, me_email='A@EXAMPLE.COM')
t('대소문자·공백 무시하고 통과', st == 200, (st, out))
st, out, h = run({'action': 'list'}, me_email=None)
t('이메일 없으면 아무도 아님 → 403', st == 403, (st, out))

st, out, h = run({'action': 'list'})
rows = {r['id']: r for r in out.get('teachers', [])}
t('list 모양', st == 200 and out['default_quota'] == 3 and set(rows[A]) == {'id', 'name', 'email', 'used', 'quota', 'left', 'disabled'}, (st, out))
t('행 있는 강사', rows[A]['quota'] == 5 and rows[A]['used'] == 3 and rows[A]['left'] == 2 and rows[A]['email'] == 'a@example.com', rows.get(A))
t('행 없는 강사 → used 0 · quota=default', rows[B]['used'] == 0 and rows[B]['quota'] == 3 and rows[B]['left'] == 3, rows.get(B))
t('한도 < 쓴 횟수 → left 0 (음수 없음)', rows[C]['left'] == 0 and rows[C]['disabled'] is True and rows[C]['email'] == '', rows.get(C))
t('list 호출 수: 호출 5번 이하 (5 × 3초 ≤ maxDuration 15)', len(h.calls) <= 5, len(h.calls))

for bad in (1001, -1, '3', True, 2.5, None):
    st, out, h = run({'action': 'set_quota', 'id': A, 'quota': bad})
    t('set_quota %r → 400 · 쓰기 없음' % (bad,), st == 400 and not any(c[0] in ('PATCH', 'POST') and 'gen_quota' in c[1] for c in h.calls), (st, out))
st, out, h = run({'action': 'set_quota', 'id': 'not-a-uuid', 'quota': 3})
t('set_quota id 형식 → 400', st == 400, (st, out))
st, out, h = run({'action': 'set_quota', 'id': A, 'quota': 2})
t('set_quota 2 (used 3) → left 0', st == 200 and out['quota'] == 2 and out['used'] == 3 and out['left'] == 0 and out['name'] == '김선생' and out['email'] == 'a@example.com', (st, out))
t('PATCH 는 quota 만 바꾼다', ('PATCH' in [c[0] for c in h.calls]) and [c[2] for c in h.calls if c[0] == 'PATCH'] == [{'quota': 2, 'updated_at': out and h.calls[[c[0] for c in h.calls].index('PATCH')][2]['updated_at']}], h.calls)
st, out, h = run({'action': 'set_quota', 'id': A, 'quota': 0})
t('set_quota 0 허용 · 1000 허용', st == 200 and out['left'] == 0 and run({'action': 'set_quota', 'id': A, 'quota': 1000})[0] == 200)
st, out, h = run({'action': 'set_quota', 'id': B, 'quota': 4}, patch_rows=[])
posts = [c for c in h.calls if c[0] == 'POST' and 'gen_quota' in c[1]]
t('행이 없으면 만든다', st == 200 and out['quota'] == 4 and out['left'] == 4 and len(posts) == 1 and posts[0][2]['teacher_id'] == B, (st, out, posts))

st, out, h = run({'action': 'set_disabled', 'id': A, 'disabled': True})
t('set_disabled 켜기', st == 200 and out['disabled'] is True and out['left'] == 0, (st, out))
st, out, h = run({'action': 'set_disabled', 'id': A, 'disabled': 'yes'})
t('set_disabled 불리언 아님 → 400', st == 400, (st, out))
st, out, h = run({'action': 'set_disabled', 'id': B, 'disabled': True}, patch_rows=[])
posts = [c for c in h.calls if c[0] == 'POST' and 'gen_quota' in c[1]]
t('set_disabled 행 없음 → 기본 한도로 만들며 끈다', st == 200 and posts[0][2] == {'teacher_id': B, 'quota': 3, 'disabled': True}, (st, out, posts))

st, out, h = run({'action': 'log'})
t('log 모양', st == 200 and out == {'log': [{'at': '2026-10-20T01:00:00Z', 'teacher': '가', 'lesson': '쉼표', 'concept': '나누기', 'kind': 'step', 'retries': 1}]}, (st, out))
t('log 는 최근 50건', any('limit=50' in c[1] and 'order=created_at.desc' in c[1] for c in h.calls), h.calls)

st, out, h = run({'action': 'set_default', 'quota': 7})
t('set_default', st == 200 and out == {'default_quota': 7}, (st, out))
t('set_default 는 settings id=1 만 고친다', any(c[0] == 'PATCH' and 'gen_settings?id=eq.1' in c[1] and c[2] == {'default_quota': 7} for c in h.calls), h.calls)
for bad in (1001, -1, '3', True):
    t('set_default %r → 400' % (bad,), run({'action': 'set_default', 'quota': bad})[0] == 400)

t('모르는 action → 400', run({'action': 'x'})[0] == 400)
t('본문이 객체 아님 → 400', run([])[0] == 400)


def boom(*a, **k):
    raise TimeoutError('secret-SERVICE-FAKE')


st, out = admin.handle({'action': 'list'}, 'tok', ENV, boom)
t('네트워크 실패 → 502 · 원문 노출 없음', st == 502 and 'SERVICE' not in str(out), (st, out))
t('응답에 키가 없다', 'SERVICE-FAKE' not in str(run({'action': 'list'})[1]))

print('\n' + ('통과' if not fail else '실패 %d' % fail))
sys.exit(1 if fail else 0)
