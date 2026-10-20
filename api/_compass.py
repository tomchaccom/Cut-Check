"""나침반 판단 규칙 — 이벤트 → 사실 → 방향별 상한 → AI 가 근거 안에서 고른 단계 → 벡터 바늘 (api/compass.py 가 HTTP 를 다룬다)

설계: docs/superpowers/specs/2026-10-20-compass-design.md
  - 단계(0~3)는 코드가 건 상한 아래에서만 선다. AI 는 주어진 사실·질문 id 로만 근거를 댄다 — 없는 id 면 그 방향은 0.
  - 학생 이름은 모델에 가지 않는다. 단계는 강사 화면 전용이라 이벤트·학생 응답에 넣지 않는다.
  - hard_kinds 는 js/core/facts.js 를 옮겨 심은 것이다 — 갈라지면 test_compass.py 의 JS 대조가 깨진다.
"""
import json
import math
import re
import sys
import time

from _generate import GenerateError, _json
from _schema import PRAISE
from _steps import mini_llm

DEADLINE, CALL_CAP, RETRY_NEEDS = 24, 20, 5  # 초. maxDuration 30 안에서 응답까지
NOTE_LEN, TUTOR_MAX = 60, 20
DIRS = 'NESW'
ORDER_END = re.compile(r'세요[.!]?$')
FAIL = '지금은 읽지 못했어요. 잠시 뒤 다시 눌러 주세요.'

# 방향 · 사실 · 상한 — 이 표가 루브릭이다. SYSTEM 에도 그대로 싣는다.
RUBRIC = '\n'.join([
    'N 북쪽 이해: define(성공 조건을 골랐다 · 없으면 N≤0) / trap-avoided·trap-fixed(함정 보기를 피했다·고쳤다 · 둘 다 없으면 N≤1) / reason(이유를 적었다 · 없고 튜터 질문도 없으면 N≤2)',
    'E 동쪽 설계: design(설계·방법을 확정했다 · 없으면 E≤0) / remethod(방법을 고쳤다 · 없으면 E≤1) / remethod-reason(고친 이유를 적었다 · 없으면 E≤2)',
    'S 남쪽 구현: run(코드를 실행했다 · 없으면 S≤0) / fixed-error(에러 뒤 코드를 고쳐 다시 실행했다 · 없으면 S≤1) / counter-clean(반례 자료로 에러·같은 결과 없이 실행했다 · 없으면 S≤2)',
    'W 서쪽 검증: judge(결과를 판정했다 · 없으면 W≤0) / basis(판정 근거를 적었다 · 없으면 W≤1) / counter-fix·predict(반례 뒤 고쳤다·실행 전 예상을 적었다 · 둘 다 없으면 W≤2)',
])
SYSTEM = '\n'.join([
    '중학교 1학년 파이썬 수업에서 학생 한 명의 활동 사실을 읽고 네 방향의 단계(0~3 정수)를 고른다. JSON 하나만 응답한다.',
    '아래 루브릭의 사실(f)과 튜터 질문(t)만이 근거다. 근거는 주어진 f·t id 로만 댄다.',
    RUBRIC,
    '- levels 는 N·E·S·W 각각 0~3 정수. 단계를 올릴 근거가 없으면 낮게 고른다. 근거가 없는 방향은 0.',
    '- evidence 는 방향별로 그 단계의 근거 id 목록. 튜터 질문 t 는 N 에만 쓴다.',
    '- 사실 상한(caps)보다 높게 고르지 않는다.',
    f'- ai_note 는 강사가 읽을 사실 한두 문장, {NOTE_LEN}자 이하. 칭찬·평가·지시("~하세요")는 쓰지 않는다.',
])
SCHEMA = {'type': 'object', 'required': ['levels', 'evidence'], 'properties': {
    'levels': {'type': 'object', 'properties': {d: {'type': 'integer'} for d in DIRS}},
    'evidence': {'type': 'object', 'properties': {d: {'type': 'array', 'items': {'type': 'string'}} for d in DIRS}},
    'ai_note': {'type': 'string'}}}


def sig(code):
    """js/core/codemission.js sig — djb2 16진. JS 는 UTF-16 코드 단위로 센다."""
    h = 5381
    u = ('' if code is None else str(code)).encode('utf-16-le')
    for i in range(0, len(u), 2):
        h = ((h * 33) ^ int.from_bytes(u[i:i + 2], 'little')) & 0xFFFFFFFF
    return format(h, 'x')


def _txt(v):
    return v.strip() if isinstance(v, str) else ''


def _of(events, *types):
    return [e for e in events if isinstance(e, dict) and e.get('type') in types]


def _dicts(v):
    return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []


def hard_kinds(events, mission):
    """facts.js 의 nocounter · error · hardcode 만 — 반례를 돌렸는지, 돌린 결과가 외운 것인지."""
    inputs = _dicts((mission or {}).get('inputs') if isinstance(mission, dict) else None)
    if not inputs:
        return []
    first = inputs[0]
    counter = None
    for x in inputs:
        if x.get('counter'):
            counter = x
    codes, out = _of(events, 's-code'), []
    probes = _of(events, 's-probe')
    probe = probes[-1] if probes else None
    if counter and not any(c.get('dataId') == counter.get('v') for c in codes):
        out.append('nocounter')
    if not probe or not codes or probe.get('sig') != sig(codes[-1].get('code')):
        return out
    outs = _dicts(probe.get('outs'))
    if any(o.get('error') for o in outs):
        out.append('error')
    elif counter:
        o1 = next((o for o in outs if o.get('dataId') == first.get('v')), None)
        oc = None
        for o in outs:
            if o.get('dataId') == counter.get('v'):
                oc = o
        if o1 and oc and counter.get('v') != first.get('v') and \
                str(oc.get('output') or '').strip() == str(o1.get('output') or '').strip():
            out.append('hardcode')
    return out


def _define_path(events, mission):
    """성공 조건 선택의 처음·마지막 문장과 그 둘의 trap 여부. s-redefine 의 to 가 새 선택이다."""
    seq = []
    for e in _of(events, 's-define', 's-redefine'):
        seq.append(e.get('choice') if e['type'] == 's-define' else e.get('to'))
    seq = [c for c in seq if isinstance(c, str)]
    if not seq:
        return None, None
    trap = {o.get('v'): o.get('trap') for o in ((mission or {}).get('define') or {}).get('options') or []}
    return bool(trap.get(seq[0])), bool(trap.get(seq[-1]))


def facts(events, mission):
    """이벤트(시간순) → 사실 [{id, dir, kind, text}]. 판정·점수가 아니라 한 일의 기록."""
    events = [e for e in events if isinstance(e, dict)]
    out = []

    def add(d, kind, text):
        out.append({'id': 'f%d' % (len(out) + 1), 'dir': d, 'kind': kind, 'text': text})

    first_trap, last_trap = _define_path(events, mission)
    if first_trap is not None:
        add('N', 'define', '성공 조건을 골랐다')
        if first_trap and not last_trap:
            add('N', 'trap-fixed', '처음 고른 성공 조건이 함정 보기였다가 다른 보기로 바꿨다')
        elif not last_trap:
            add('N', 'trap-avoided', '함정 보기가 아닌 성공 조건을 골랐다')
    if any(_txt(e.get('reason')) for e in _of(events, 's-define', 's-redefine')):
        add('N', 'reason', '성공 조건을 고른 이유를 적었다')

    if _of(events, 's-design', 's-method'):
        add('E', 'design', '설계를 확정했다')
    rem = _of(events, 's-remethod')
    if rem:
        add('E', 'remethod', '방법을 고쳤다')
    if any(_txt(e.get('reason')) for e in rem):
        add('E', 'remethod-reason', '방법을 고친 이유를 적었다')

    codes = _of(events, 's-code')
    if codes:
        add('S', 'run', '코드를 실행했다')
    if any(c.get('error') and any(sig(d.get('code')) != sig(c.get('code')) for d in codes[i + 1:])
           for i, c in enumerate(codes)):
        add('S', 'fixed-error', '에러가 난 뒤 코드를 고쳐 다시 실행했다')
    counter = next((x for x in reversed(_dicts((mission or {}).get('inputs') if isinstance(mission, dict) else None)) if x.get('counter')), None)
    ran = [c for c in codes if counter and c.get('dataId') == counter.get('v')]
    hk = hard_kinds(events, mission)
    if ran and not ran[-1].get('error') and 'error' not in hk and 'hardcode' not in hk:
        add('S', 'counter-clean', '반례 자료로 에러 없이 실행했다')

    judges = _of(events, 's-code-judge')
    if judges:
        add('W', 'judge', '코드 결과를 판정했다')
        if _txt(judges[-1].get('basis')):
            add('W', 'basis', '판정 근거를 적었다')
    if ran:
        at = next(i for i, e in enumerate(events) if e is ran[0])
        later = events[at + 1:]
        if any(e.get('type') == 's-redefine' for e in later) or \
                any(e.get('type') == 's-code' and sig(e.get('code')) != sig(ran[0].get('code')) for e in later):
            add('W', 'counter-fix', '반례를 돌린 뒤 코드나 성공 조건을 바꿨다')
    if _of(events, 's-predict'):
        add('W', 'predict', '실행 전에 결과를 예상했다')
    return out


def tutor_items(events):
    qs = [_txt(e.get('question')) for e in _of(events, 's-tutor')]
    return [{'id': 't%d' % (i + 1), 'q': q[:200]} for i, q in enumerate([q for q in qs if q][-TUTOR_MAX:])]


def caps(fs, ts=()):
    """방향별 단계 상한. 튜터 질문은 N 의 reason 을 대신한다."""
    k = {d: {f['kind'] for f in fs if f['dir'] == d} for d in DIRS}
    c = {d: 3 for d in DIRS}

    def need(d, kinds, cap):
        if not (k[d] & set(kinds)):
            c[d] = min(c[d], cap)
    need('N', ['define'], 0)
    need('N', ['trap-avoided', 'trap-fixed'], 1)
    need('E', ['design'], 0)
    need('E', ['remethod'], 1)
    need('E', ['remethod-reason'], 2)
    need('S', ['run'], 0)
    need('S', ['fixed-error'], 1)
    need('S', ['counter-clean'], 2)
    need('W', ['judge'], 0)
    need('W', ['basis'], 1)
    need('W', ['counter-fix', 'predict'], 2)
    if not k['N'] & {'reason'} and not ts:
        c['N'] = min(c['N'], 2)
    return c


def vet(raw, fs, ts):
    """LLM 답 → 검사 통과분. 근거 id 는 그 방향의 f(N 은 t 도)여야 하고, 근거 없는 방향은 0, 단계는 상한 아래로."""
    raw = raw if isinstance(raw, dict) else {}
    lv = raw.get('levels') if isinstance(raw.get('levels'), dict) else {}
    ev = raw.get('evidence') if isinstance(raw.get('evidence'), dict) else {}
    cap = caps(fs, ts)
    levels, evidence = {}, {}
    for d in DIRS:
        ok = {f['id'] for f in fs if f['dir'] == d} | ({t['id'] for t in ts} if d == 'N' else set())
        ids = ev.get(d) if isinstance(ev.get(d), list) else []
        evidence[d] = [i for i in dict.fromkeys(ids) if isinstance(i, str) and i in ok]
        n = lv.get(d)
        n = n if isinstance(n, int) and not isinstance(n, bool) and 0 <= n <= 3 else 0
        levels[d] = min(n, cap[d]) if evidence[d] else 0
        if not levels[d]:
            evidence[d] = []
    note = raw.get('ai_note')
    note = note.strip() if isinstance(note, str) else ''
    if len(note) > NOTE_LEN or PRAISE.search(note) or ORDER_END.search(note):
        note = ''
    return {'levels': levels, 'evidence': evidence, 'ai_note': note}


def _sector(deg):
    return DIRS[int(((deg + 45) % 360) // 90)]  # N [315,45) · E [45,135) · S [135,225) · W [225,315)


def needle(levels, evidence):
    """x = E − W, y = N − S, 북 0° 시계 방향. 길이 < 1 이면 (None, None)."""
    x, y = levels.get('E', 0) - levels.get('W', 0), levels.get('N', 0) - levels.get('S', 0)
    if math.hypot(x, y) < 1:
        return None, None
    deg = math.degrees(math.atan2(x, y)) % 360
    return deg, _sector(deg)


def override(deg, d):
    """선생님이 방위를 고르면 — 바늘이 그 부채꼴 안이면 그대로, 아니면 정중앙."""
    if d not in tuple(DIRS):
        return deg  # 고르지 않았으면 바늘 그대로
    return deg if deg is not None and _sector(deg) == d else DIRS.index(d) * 90


def read(events, mission, call_llm=mini_llm, t0=None, now=time.monotonic):
    t0 = now() if t0 is None else t0
    fs, ts = facts(events, mission), tutor_items(events)
    m = mission if isinstance(mission, dict) else {}
    body = {'mission': {k: _txt(m.get(k))[:200] for k in ('title', 'brief', 'keyPoint')},
            'facts': fs, 'tutor': ts, 'caps': caps(fs, ts)}
    messages = [{'role': 'system', 'content': SYSTEM},
                {'role': 'user', 'content': json.dumps(body, ensure_ascii=False)}]
    for attempt in (1, 2):
        raw = call_llm(messages, SCHEMA, min(CALL_CAP, t0 + DEADLINE - now()))
        data = _json(raw)
        if data is not None and isinstance(data.get('levels'), dict):
            r = vet(data, fs, ts)
            r['needle_deg'], r['strongest'] = needle(r['levels'], r['evidence'])
            r['facts'] = fs
            r['tutor'] = ts
            return r
        print('[compass] 형식 오류', attempt, file=sys.stderr)
        if t0 + DEADLINE - now() < RETRY_NEEDS:
            break
        messages = messages + [{'role': 'assistant', 'content': raw if isinstance(raw, str) else ''},
                               {'role': 'user', 'content': '{"levels": {...}, "evidence": {...}, "ai_note": ""} 형태의 JSON 하나만 다시 보내세요.'}]
    raise GenerateError(FAIL, {'format': ['JSON 아님']})
