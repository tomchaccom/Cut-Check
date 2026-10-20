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
t('retry_ok(uuid + 줄바꿈) → False, http 0회', _quota.retry_ok(TID, TICKET + '\n', ENV, h) is False and h.calls == [])
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


# ── 흐름: build · 빠른 생성에 한도 (api/mission-steps.py · api/generate-mission.py) ──
import importlib.util  # noqa: E402
import io  # noqa: E402
import json  # noqa: E402
from _generate import GenerateError  # noqa: E402


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), os.path.join(ROOT, 'api', name + '.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ms, gm = load('mission-steps'), load('generate-mission')
FULL = dict(gen_reserve=(200, 2), gen_refund=(204, None), gen_record=(200, TICKET), gen_retry=(200, True),
            gen_left=(200, [{'quota': 3, 'used': 1, 'disabled': False}]))


def sbx(**over):
    """FULL 위에 덮어쓴 가짜 Supabase. 값이 Exception 이면 그 RPC 에서 던진다(시간 초과)."""
    a = {**FULL, **over}
    base = fake(**a)

    def http(method, url, headers, body=None):
        r = base(method, url, headers, body)
        if isinstance(r, Exception):
            raise r
        return r
    http.calls = base.calls
    http.rpc = lambda: [c[1].rsplit('/rpc/', 1)[1] for c in base.calls if '/rpc/' in c[1]]
    return http


def gen(result):
    """가짜 생성 — result 가 Exception 이면 던진다. 부른 횟수를 센다."""
    def f(*a, **k):
        f.n += 1
        if isinstance(result, Exception):
            raise result
        return result
    f.n = 0
    return f


def run(mod, attr, result, body, http):
    g = gen(result)
    orig = getattr(mod, attr)
    setattr(mod, attr, g)
    err, sys.stderr = sys.stderr, io.StringIO()
    try:
        st, out = mod.handle(body, 'TOK', ENV, http)
    finally:
        setattr(mod, attr, orig)
        log, sys.stderr = sys.stderr.getvalue(), err
    return st, out, g.n, http, log


class _Steps:  # ms._steps 자리에 끼우는 가짜 — build 만 바꾸고 나머지는 진짜
    def __init__(self, build):
        self.build, self._real = build, ms._steps

    def __getattr__(self, k):
        return getattr(self._real, k)


def build(result, body=None, http=None, **over):
    http = http or sbx(**over)
    g = gen(result)
    orig, ms._steps = ms._steps, _Steps(g)
    err, sys.stderr = sys.stderr, io.StringIO()
    try:
        st, out = ms.handle({'action': 'build', 'concept': 'for', 'example': {'title': '영수증'}, **(body or {})},
                            'TOK', ENV, http)
    finally:
        ms._steps = orig
        log, sys.stderr = sys.stderr.getvalue(), err
    return st, out, g.n, http, log


DRAFT = {'draft': {'title': 't'}}
st, out, n, h, _ = build(DRAFT)
t('build 성공 → reserve 1 · record 1', h.rpc() == ['gen_reserve', 'gen_record'], h.rpc())
t('… {draft, ticket, left}', st == 200 and out == {'draft': {'title': 't'}, 'ticket': TICKET, 'left': 2}, (st, out))
rec = [c[3] for c in h.calls if c[1].endswith('/gen_record')][0]
t("… record kind 'step' · concept", rec['kind'] == 'step' and rec['concept'] == 'for' and rec['tid'] == 't1' and rec['model'], rec)

st, out, n, h, _ = build(GenerateError('못 만들었어요', {'draft': ['x']}))
t('build GenerateError → 422 · reserve 1 · refund 1', st == 422 and out.get('reasons') and h.rpc() == ['gen_reserve', 'gen_refund'], (st, h.rpc()))
st, out, n, h, _ = build(RuntimeError('down'))
t('build LLM 예외 → 502 · refund 1', st == 502 and h.rpc() == ['gen_reserve', 'gen_refund'], (st, h.rpc()))

st, out, n, h, _ = build(DRAFT, {'ticket': TICKET})
t('build + 유효 ticket → reserve 0 · retry 1 · record 0', h.rpc() == ['gen_retry', 'gen_left'], h.rpc())
t('… 같은 ticket · left 는 gen_left', st == 200 and out['ticket'] == TICKET and out['left'] == 2, out)
st, out, n, h, _ = build(RuntimeError('down'), {'ticket': TICKET})
t('재요청이 실패해도 반환 없음 (예약 안 했으니)', st == 502 and 'gen_refund' not in h.rpc(), h.rpc())
st, out, n, h, _ = build(DRAFT, {'ticket': TICKET}, gen_retry=(200, False))
t('남의 · 다 쓴 ticket → 새 미션 (reserve 1 · record 1)', h.rpc() == ['gen_retry', 'gen_reserve', 'gen_record'], h.rpc())
st, out, n, h, _ = build(DRAFT, {'ticket': TICKET}, gen_left=TimeoutError('t'))
t('재요청 성공 뒤 left 를 못 구하면 left 없이 draft · ticket', st == 200 and out == {'draft': {'title': 't'}, 'ticket': TICKET}, out)

st, out, n, h, _ = build(DRAFT, gen_reserve=(200, -1))
t('한도 0 → 403 {error: OUT, left: 0} · 생성 0', (st, out, n) == (403, {'error': _quota.OUT, 'left': 0}, 0), (st, out, n))
st, out, n, h, log = build(DRAFT, gen_reserve=TimeoutError('slow'))
t('reserve 시간 초과 → 502 · 생성 0', st == 502 and n == 0 and out.get('error'), (st, out, n))
st, out, n, h, log = build(RuntimeError('down'), gen_refund=TimeoutError('slow'))
t('refund 시간 초과 → 원래 502 그대로 · 로그', st == 502 and 'refund' in log and 'SERVICE-FAKE' not in log, (st, out, log))
st, out, n, h, log = build(GenerateError('못 만들었어요', {'draft': ['x']}), gen_refund=(500, None))
t('refund 실패여도 422 그대로', st == 422, (st, out))
st, out, n, h, log = build(DRAFT, gen_record=TimeoutError('slow'))
t('record 시간 초과 → draft · left 는 돌려주고 ticket 없음 · 로그', st == 200 and out == {'draft': {'title': 't'}, 'left': 2}
  and 'record' in log, (st, out, log))
st, out, n, h, _ = build(DRAFT, {'example': 'x'})
t('build 형식이 틀리면 400 · 예약 없음', st == 400 and h.rpc() == [], (st, h.rpc()))

for body in [{'action': 'concept', 'lesson': 'for 반복'}, {'action': 'examples', 'concept': 'for'},
             {'action': 'solve', 'situation': 's', 'brief': 'b', 'inputs': []}]:
    h = sbx()
    err, sys.stderr = sys.stderr, io.StringIO()
    try:
        ms.handle(body, 'TOK', ENV, h, llm=lambda *a: json.dumps({'examples': [], 'code': 'print(1)'}))
    finally:
        sys.stderr = err
    t(f"{body['action']} → 한도 RPC 0", h.rpc() == [], h.rpc())

h = sbx(gen_left=(200, [{'quota': 3, 'used': 3, 'disabled': True}]))
t("action quota → {left, disabled} · reserve 0", ms.handle({'action': 'quota'}, 'TOK', ENV, h) == (200, {'left': 0, 'disabled': True})
  and h.rpc() == ['gen_left'], h.rpc())
t('quota 도 강사만', ms.handle({'action': 'quota'}, '', ENV, sbx())[0] == 401)

# ── 빠른 생성 ──
QB = {'lesson': '리스트', 'keyPoint': '중복'}
M = {'title': 'm', 'guard': {}}
st, out, n, h, _ = run(gm, 'make_mission', M, QB, sbx())
t("빠른 생성 성공 → reserve 1 · record kind 'quick' · 미션 + left", st == 200 and out == {**M, 'left': 2}
  and h.rpc() == ['gen_reserve', 'gen_record'] and [c[3] for c in h.calls if c[1].endswith('/gen_record')][0]['kind'] == 'quick', (st, out, h.rpc()))
st, out, n, h, _ = run(gm, 'make_mission', GenerateError('x', {'a': ['b']}), QB, sbx())
t('빠른 생성 422 → refund', st == 422 and h.rpc() == ['gen_reserve', 'gen_refund'], (st, h.rpc()))
st, out, n, h, _ = run(gm, 'make_mission', RuntimeError('down'), QB, sbx())
t('빠른 생성 502 → refund', st == 502 and h.rpc() == ['gen_reserve', 'gen_refund'], (st, h.rpc()))
st, out, n, h, _ = run(gm, 'make_mission', M, QB, sbx(gen_reserve=(200, -1)))
t('빠른 생성 한도 0 → 403 OUT · left 0 · 생성 0', (st, out, n) == (403, {'error': _quota.OUT, 'left': 0}, 0), (st, out, n))
st, out, n, h, _ = run(gm, 'make_mission', M, QB, sbx(gen_reserve=TimeoutError('t')))
t('빠른 생성 reserve 시간 초과 → 502 · 생성 0', st == 502 and n == 0, (st, n))
st, out, n, h, _ = run(gm, 'make_mission', M, QB, sbx(gen_record=TimeoutError('t')))
t('빠른 생성 record 실패 → 미션은 돌려준다', st == 200 and out == {**M, 'left': 2}, (st, out))
st, out, n, h, _ = run(gm, 'make_mission', M, {'lesson': ''}, sbx())
t('빠른 생성 입력 없음 → 400 · 예약 없음', st == 400 and h.rpc() == [], (st, h.rpc()))
t('빠른 생성 학생/토큰 없음은 401 (handle)', gm.handle(QB, '', ENV, sbx())[0] == 401)

print('\n' + ('통과' if not fail else '실패 %d' % fail))
sys.exit(1 if fail else 0)
