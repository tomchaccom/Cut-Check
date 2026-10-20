"""강사별 미션 생성 한도 — 예약 · 반환 · 재요청 · 기록 (docs/superpowers/specs/2026-10-20-admin-quota-design.md).

규칙은 DB 함수(supabase/migrations/20261020000000_gen_quota.sql)에 있고 여기는 service role 로 부르기만 한다.
성공했을 때만 차감: AI 호출 전에 reserve → 실패하면 refund. 동시에 눌러도 DB 의 조건부 update 하나가 줄 세운다.
"""
import sys

from _accounts import UUID_RE
from _auth import NO_LINK, Fail, urllib_http
from _generate import MODEL

OUT = '생성 횟수를 다 썼어요. 관리자에게 문의해 주세요.'


def _rpc(name, args, env, http):
    url, service = env.get('SUPABASE_URL'), env.get('SUPABASE_SERVICE_ROLE_KEY')
    if not (url and service):
        raise Fail(502, '서버에 계정 설정이 없어요. 관리자에게 알려 주세요.')
    st, out = http('POST', url.rstrip('/') + '/rest/v1/rpc/' + name,
                   {'apikey': service, 'Authorization': 'Bearer ' + service}, args)
    if not 200 <= st < 300:
        raise Fail(502, NO_LINK)
    return out


def reserve(tid, env, http=urllib_http):
    """1 예약 → 남은 수. 0개 · 꺼짐이면 Fail(403, OUT, left 0)."""
    n = _rpc('gen_reserve', {'tid': tid}, env, http)
    if not isinstance(n, int) or isinstance(n, bool):
        raise Fail(502, NO_LINK)
    if n < 0:
        raise Fail(403, OUT, {'left': 0})
    return n


def refund(tid, env, http=urllib_http):
    _rpc('gen_refund', {'tid': tid}, env, http)


def retry_ok(tid, ticket, env, http=urllib_http):
    """이 강사의 ticket 이고 재요청 < 2 이면 True (그리고 DB 가 재요청 수를 1 올린다)."""
    if not isinstance(ticket, str) or not UUID_RE.fullmatch(ticket):
        return False
    return _rpc('gen_retry', {'tid': tid, 'ticket': ticket}, env, http) is True


def record(tid, kind, lesson, concept, model, env, http=urllib_http):
    """성공한 생성 한 줄 → ticket(gen_log id)."""
    out = _rpc('gen_record', {'tid': tid, 'kind': kind, 'lesson': lesson, 'concept': concept, 'model': model}, env, http)
    if not isinstance(out, str):
        raise Fail(502, NO_LINK)
    return out


def left(tid, env, http=urllib_http):
    """→ {'left', 'disabled'} — 차감 없음. 한도를 낮춰도 음수는 없다."""
    rows = _rpc('gen_left', {'tid': tid}, env, http)
    if not isinstance(rows, list) or not rows:
        raise Fail(502, NO_LINK)
    r = rows[0]
    off = bool(r.get('disabled'))
    return {'left': 0 if off else max(0, int(r['quota']) - int(r['used'])), 'disabled': off}


def _try(what, fn, *a):
    """성공 뒤 · 실패 뒤의 뒷정리 — 못 해도 응답은 그대로 보낸다. 로그엔 예외 이름만 (키가 섞이지 않게)."""
    try:
        return fn(*a)
    except Exception as e:  # noqa: BLE001 — Fail · 시간 초과 모두
        print(f'[quota] {what} 실패', type(e).__name__, file=sys.stderr)
        return None


def charge(tid, ticket, kind, lesson, concept, run, env, http=urllib_http):
    """예약 → run() → 성공이면 기록 · left(와 step 은 ticket), 실패면 반환. run() → (status, json).
    ticket 이 이 강사의 재요청이면 예약 · 기록 없이 돌리고 같은 ticket 을 돌려준다."""
    try:
        retry = retry_ok(tid, ticket, env, http)
        n = None if retry else reserve(tid, env, http)
    except Fail as f:
        return f.status, {'error': f.msg, **f.extra}
    except Exception as e:  # noqa: BLE001 — 시간 초과면 AI 를 부르지 않는다
        print('[quota] 예약 실패', type(e).__name__, file=sys.stderr)
        return 502, {'error': NO_LINK}
    st, out = run()
    if st != 200:
        if not retry:
            _try('refund', refund, tid, env, http)
        return st, out
    if retry:
        n = (_try('left', left, tid, env, http) or {}).get('left')
    else:
        ticket = _try('record', record, tid, kind, lesson, concept, MODEL, env, http)
    out = dict(out)
    if kind == 'step' and ticket:
        out['ticket'] = ticket
    if n is not None:
        out['left'] = n
    return st, out
