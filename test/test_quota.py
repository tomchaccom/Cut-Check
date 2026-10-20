"""강사별 생성 한도(api/_quota.py) · whoami — Supabase 는 가짜.

  uv run --with-requirements requirements.txt python test/test_quota.py
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
import _quota  # noqa: E402
from _auth import Fail, teacher, whoami  # noqa: E402

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


ENV = {'SUPABASE_URL': 'https://x.supabase.co/', 'SUPABASE_ANON_KEY': 'ANON', 'SUPABASE_SERVICE_ROLE_KEY': 'SERVICE-FAKE'}
TID = 't1'
TICKET = '11111111-2222-3333-4444-555555555555'


def fake(**answers):
    """RPC 이름 → (status, json). 부른 것을 남긴다."""
    calls = []

    def http(method, url, headers, body=None):
        calls.append((method, url, headers, body))
        if url.endswith('/auth/v1/user'):
            return 200, {'id': 't1', 'email': 'T@x.test'}
        if '/rest/v1/profiles' in url:
            return 200, [{'role': 'teacher'}]
        name = url.rsplit('/rpc/', 1)[1]
        return answers[name]
    http.calls = calls
    return http


def raises(fn, *a):
    try:
        fn(*a)
    except Fail as f:
        return f
    return None


# ── reserve ──
h = fake(gen_reserve=(200, 2))
t('reserve 2 → 2', _quota.reserve(TID, ENV, h) == 2)
m, url, hd, body = h.calls[0]
t('POST rpc/gen_reserve · service 키 · tid', m == 'POST' and url == 'https://x.supabase.co/rest/v1/rpc/gen_reserve'
  and hd['apikey'] == 'SERVICE-FAKE' and hd['Authorization'] == 'Bearer SERVICE-FAKE' and body == {'tid': TID}, h.calls)

f = raises(_quota.reserve, TID, ENV, fake(gen_reserve=(200, -1)))
t('reserve -1 → 403 OUT · left 0', f and f.status == 403 and f.msg == _quota.OUT and f.extra == {'left': 0}, f and vars(f))
t('OUT 문장 그대로', _quota.OUT == '생성 횟수를 다 썼어요. 관리자에게 문의해 주세요.')

f = raises(_quota.reserve, TID, ENV, fake(gen_reserve=(502, None)))
t('RPC 502 → Fail 502', f and f.status == 502)
f = raises(_quota.reserve, TID, ENV, fake(gen_reserve=(200, 'x')))
t('reserve 이상한 응답 → 502', f and f.status == 502)
f = raises(_quota.reserve, TID, {}, fake())
t('env 없음 → 502', f and f.status == 502)

# ── refund ──
h = fake(gen_refund=(204, None))
_quota.refund(TID, ENV, h)
t('refund → rpc/gen_refund {tid}', h.calls[0][1].endswith('/rpc/gen_refund') and h.calls[0][3] == {'tid': TID})
f = raises(_quota.refund, TID, ENV, fake(gen_refund=(500, None)))
t('refund 500 → 502', f and f.status == 502)

# ── retry_ok ──
h = fake()
t("retry_ok('not-a-uuid') → False", _quota.retry_ok(TID, 'not-a-uuid', ENV, h) is False)
t('… http 0회', h.calls == [])
t('retry_ok(None) → False', _quota.retry_ok(TID, None, ENV, h) is False and h.calls == [])
h = fake(gen_retry=(200, True))
t('retry_ok RPC true → True', _quota.retry_ok(TID, TICKET, ENV, h) is True)
t('… {tid, ticket}', h.calls[0][3] == {'tid': TID, 'ticket': TICKET})
t('retry_ok RPC false → False', _quota.retry_ok(TID, TICKET, ENV, fake(gen_retry=(200, False))) is False)

# ── record ──
h = fake(gen_record=(200, TICKET))
t('record → ticket', _quota.record(TID, 'step', '수업', '개념', 'm', ENV, h) == TICKET)
t('… 인자 이름', h.calls[0][3] == {'tid': TID, 'kind': 'step', 'lesson': '수업', 'concept': '개념', 'model': 'm'}, h.calls)

# ── left ──
t('left 3-1 → 2', _quota.left(TID, ENV, fake(gen_left=(200, [{'quota': 3, 'used': 1, 'disabled': False}])))
  == {'left': 2, 'disabled': False})
t('한도 낮춤 → 0 (음수 없음)', _quota.left(TID, ENV, fake(gen_left=(200, [{'quota': 1, 'used': 3, 'disabled': False}])))
  == {'left': 0, 'disabled': False})
t('disabled → left 0', _quota.left(TID, ENV, fake(gen_left=(200, [{'quota': 9, 'used': 0, 'disabled': True}])))
  == {'left': 0, 'disabled': True})
f = raises(_quota.left, TID, ENV, fake(gen_left=(200, [])))
t('left 빈 응답 → 502', f and f.status == 502)

# ── whoami / teacher ──
h = fake()
t('whoami → id · email', whoami('TOK', ENV, h) == {'id': 't1', 'email': 'T@x.test'})
t('teacher → id 만 (기존 그대로)', teacher('TOK', ENV, fake()) == 't1')

print('\n' + ('통과' if not fail else '실패 %d' % fail))
sys.exit(1 if fail else 0)
