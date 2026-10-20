"""나침반 2차 판단 규칙 — 이벤트 → 12칸 체크리스트(코드 8 · AI 4) → 누적 바늘 (api/compass.py 가 HTTP 를 다룬다)

설계: docs/superpowers/specs/2026-10-20-compass-v2-design.md
  - 코드 항목은 이벤트만 보는 순수 함수 → 같은 기록이면 늘 같은 답.
  - AI 항목은 {ok, quote}. quote 가 그 항목의 기록(코드 · 튜터 질문 · 학생 문장)에 글자 그대로 없으면 ok=False.
  - 점수·평균은 저장하지 않는다. 저장은 원본 판정(checks)뿐이고 score/cumulative 가 그때그때 계산한다.
  - hard_kinds 는 js/core/facts.js 를 옮겨 심은 것이다 — 갈라지면 test_compass.py 의 JS 대조가 깨진다.
"""
import json
import math
import re
import sys
import time

from _generate import GenerateError, _json
from _steps import mini_llm

DEADLINE, CALL_CAP, RETRY_NEEDS = 24, 20, 5  # 초. maxDuration 30 안에서 응답까지
TUTOR_MAX = 20
DIRS = 'NESW'
FAIL = '지금은 읽지 못했어요. 잠시 뒤 다시 눌러 주세요.'

# 가중치·상쇄 기준 — 해 보면서 고친다. 여기 한 곳.
WEIGHTS = [1.0, 0.85, 0.7, 0.55, 0.4]  # 최근 미션부터
CANCEL = 0.5                           # 누적 벡터 크기가 이보다 작으면 자동으로 정하지 않는다
MIN_LEN, MAX_LEN, FULL = 0.25, 0.90, 3.0  # 바늘 길이 = 반지름 비율. 크기 FULL(한 방향 만점) 이상이면 MAX_LEN
CODE_ITEMS = ('N1', 'E1', 'E3', 'S1', 'S2', 'S3', 'W1', 'W3')
AI_ITEMS = ('N2', 'N3', 'E2', 'W2')
ITEMS = ('N1', 'N2', 'N3', 'E1', 'E2', 'E3', 'S1', 'S2', 'S3', 'W1', 'W2', 'W3')

SYSTEM = '\n'.join([
    '중학교 1학년 파이썬 수업에서 학생 한 명의 기록을 읽고 예/아니오 네 항목과 튜터 질문 분류를 JSON 하나로 답한다.',
    '항목마다 {"ok": true|false, "quote": "근거 문장"} 를 쓴다. quote 는 아래 지정한 기록에서 글자 그대로 복사한다. 지어내지 않는다. 근거가 없으면 ok=false, quote="".',
    '- N2: 학생이 성공 조건을 코드로 직접 옮겼다(코드가 성공 조건과 같은 것을 확인·출력한다). quote 는 code 에서.',
    '- N3: 튜터에게 자기가 이해한 것을 설명하고 맞는지 물었다. quote 는 tutor 질문에서.',
    '- E2: 설계 이유를 자기 말로 적었다. 보기 베끼기·"."·한 단어는 false. quote 는 design_reasons 에서.',
    '- W2: 판정 근거를 실제 실행 결과에 기대어 적었다(출력값·자료를 말한다). quote 는 judge_basis 에서.',
    '- tutor: 튜터 질문(t id)마다 dir 하나. N 이해(요구·성공 조건) / E 설계(나누기·순서) / S 구현(문법·에러·코드) / W 검증(결과가 맞는지·반례). "답 알려줘"처럼 어느 쪽도 아니면 dir 를 null 로 둔다.',
])
SCHEMA = {'type': 'object', 'required': ['items'], 'properties': {
    'items': {'type': 'object', 'properties': {k: {'type': 'object', 'properties': {
        'ok': {'type': 'boolean'}, 'quote': {'type': 'string'}}} for k in AI_ITEMS}},
    'tutor': {'type': 'array', 'items': {'type': 'object', 'properties': {
        'id': {'type': 'string'}, 'dir': {'type': ['string', 'null']}}}}}}


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


def _first_counter(mission):
    return next((x for x in reversed(_dicts((mission or {}).get('inputs') if isinstance(mission, dict) else None)) if x.get('counter')), None)


def _item(ok, quote=''):
    return {'ok': bool(ok), 'quote': quote}


def code_checks(events, mission):
    """코드가 판정하는 8칸 {id: {ok, quote}}. 코드 항목의 quote 는 비어 있다."""
    events = [e for e in events if isinstance(e, dict)]
    codes = _of(events, 's-code')
    counter = _first_counter(mission)
    cv = counter.get('v') if counter else None
    err_at = next((i for i, e in enumerate(events) if e.get('type') == 's-code' and e.get('error')), None)
    # N1 — 고른 것 중 하나라도 함정이 아니면 예(골랐다가 바꾼 것 포함)
    trap = {o.get('v'): o.get('trap') for o in ((mission or {}).get('define') or {}).get('options') or [] if isinstance(o, dict)}
    seq = [e.get('choice') if e['type'] == 's-define' else e.get('to') for e in _of(events, 's-define', 's-redefine')]
    n1 = any(isinstance(c, str) and not trap.get(c) for c in seq)
    # E3 — 에러가 난 실행 뒤에 설계·방법을 다시 냈다
    e3 = err_at is not None and any(e.get('type') in ('s-design', 's-method', 's-remethod') for e in events[err_at + 1:])
    # S2 — 에러가 한 번도 없었으면 예. 있었다면 그 뒤에 다른 코드로 다시 돌렸다
    s2 = not any(c.get('error') for c in codes) or any(
        c.get('error') and any(sig(d.get('code')) != sig(c.get('code')) for d in codes[i + 1:]) for i, c in enumerate(codes))
    # S3 — 반례 자료를 에러 없이 돌렸고 그 코드가 다른 자료에서도 돌았으며, 외운 신호(hardcode)가 없다
    ran = [c for c in codes if counter and c.get('dataId') == cv]
    hk = hard_kinds(events, mission)
    s3 = bool(ran) and not ran[-1].get('error') and 'hardcode' not in hk and 'error' not in hk and any(
        c.get('dataId') != cv and sig(c.get('code')) == sig(ran[-1].get('code')) for c in codes)
    # W3 — 반례가 깨진 뒤(에러, 또는 같은 코드의 다른 자료 출력과 같음) 코드나 성공 조건을 고쳤다
    w3 = False
    for r in ran:
        at = next(i for i, e in enumerate(events) if e is r)
        same = [c for c in codes if c.get('dataId') != cv and sig(c.get('code')) == sig(r.get('code'))]
        broke = bool(r.get('error')) or any(str(c.get('output') or '').strip() == str(r.get('output') or '').strip() for c in same)
        later = events[at + 1:]
        if broke and (any(e.get('type') == 's-redefine' for e in later) or
                      any(e.get('type') == 's-code' and sig(e.get('code')) != sig(r.get('code')) for e in later)):
            w3 = True
    return {'N1': _item(n1), 'E1': _item(_of(events, 's-design', 's-method')), 'E3': _item(e3),
            'S1': _item(any(not c.get('error') and _txt(c.get('code')) for c in codes)), 'S2': _item(s2), 'S3': _item(s3),
            'W1': _item(bool(ran)), 'W3': _item(w3)}


def corpora(events):
    """AI 항목이 quote 를 찾을 곳. N2 코드 · N3 튜터 질문 · E2 설계 이유 · W2 판정 근거(마무리 문장 포함)."""
    events = [e for e in events if isinstance(e, dict)]
    judges = _of(events, 's-code-judge')
    return {
        'N2': [_txt(e.get('code')) for e in _of(events, 's-code')],
        'N3': [_txt(e.get('question')) for e in _of(events, 's-tutor')],
        'E2': [_txt(e.get('reason')) for e in _of(events, 's-design', 's-method', 's-remethod')],
        'W2': [_txt(e.get('basis')) for e in judges] + [_txt(e.get('text')) for e in _of(events, 's-wrap')],
    }


def _norm(s):
    return re.sub(r'\s+', ' ', s).strip()


def vet(raw, events):
    """LLM 답 → (AI 4칸, 튜터 방향 개수). quote 가 그 항목의 기록에 그대로 없거나 두 글자 미만이면 ok=False."""
    raw = raw if isinstance(raw, dict) else {}
    its = raw.get('items') if isinstance(raw.get('items'), dict) else {}
    src = corpora(events)
    out = {}
    for k in AI_ITEMS:
        v = its.get(k) if isinstance(its.get(k), dict) else {}
        q = _norm(v['quote']) if isinstance(v.get('quote'), str) else ''
        found = len(re.sub(r'\W', '', q)) >= 2 and any(q in _norm(s) for s in src[k])
        out[k] = _item(v.get('ok') is True and found, q if found else '')
    ids = {t['id'] for t in tutor_items(events)}
    cls = {}
    for x in raw.get('tutor') if isinstance(raw.get('tutor'), list) else []:
        if isinstance(x, dict) and x.get('id') in ids and x.get('dir') in tuple(DIRS):
            cls[x['id']] = x['dir']  # 같은 id 가 두 번 오면 뒤의 것
    return out, {d: sum(1 for v in cls.values() if v == d) for d in DIRS}


def tutor_items(events):
    qs = [_txt(e.get('question')) for e in _of(events, 's-tutor')]
    return [{'id': 't%d' % (i + 1), 'q': q[:200]} for i, q in enumerate([q for q in qs if q][-TUTOR_MAX:])]


def score(checks):
    """checks → {N,E,S,W} 0~3. checks 가 없는 옛 행(1차)은 None."""
    if not isinstance(checks, dict) or not checks:
        return None
    return {d: sum(1 for k in ITEMS if k[0] == d and isinstance(checks.get(k), dict) and checks[k].get('ok') is True) for d in DIRS}


_UNIT = {'N': (0, 1), 'E': (1, 0), 'S': (0, -1), 'W': (-1, 0)}  # (x, y)


def _sector(deg):
    return DIRS[int(((deg + 45) % 360) // 90)]  # N [315,45) · E [45,135) · S [135,225) · W [225,315)


def _view(x, y):
    mag = math.hypot(x, y)
    deg = math.degrees(math.atan2(x, y)) % 360
    return {'needle_deg': deg, 'dir': _sector(deg), 'length': MIN_LEN + (MAX_LEN - MIN_LEN) * min(mag, FULL) / FULL}


def cumulative(rows_newest_first):
    """최근 5개 미션 가중 평균 바늘. 행은 최신순 dict({checks, teacher_dir}). checks 없는 1차 행은 건너뛴다(없는 자료).
    x = E−W, y = N−S. teacher_dir 이 있는 미션은 그 방향 단위벡터 × 3(= 한 방향 만점) 으로 그 미션의 벡터를 바꾼다.
    크기 < CANCEL 이면 자동으로 정하지 않는다(cancel=True, candidates). 선택 없이 계산한 벡터(raw)가 상쇄이거나
    선택을 넣은 벡터가 상쇄이면 — 창 안의 선생님 선택 가운데 가장 최근 것이 답이다: 방향은 그 방위의 정중앙, 길이는 최소 길이."""
    used = []
    for r in rows_newest_first if isinstance(rows_newest_first, list) else []:
        r = r if isinstance(r, dict) else {}
        s = score(r.get('checks'))
        if s is not None:
            used.append((s, r.get('teacher_dir') if r.get('teacher_dir') in tuple(DIRS) else None))
        if len(used) == len(WEIGHTS):
            break
    out = {'needle_deg': None, 'dir': None, 'length': None, 'cancel': False, 'candidates': [], 'n': len(used)}
    if not used:
        return out
    w = WEIGHTS[:len(used)]
    tw = sum(w)
    mean = {d: sum(wi * s[d] for wi, (s, _) in zip(w, used)) / tw for d in DIRS}
    def vec(use_pick):
        vx = vy = 0.0
        for wi, (sc, td) in zip(w, used):
            x, y = (_UNIT[td][0] * 3, _UNIT[td][1] * 3) if td and use_pick else (sc['E'] - sc['W'], sc['N'] - sc['S'])
            vx, vy = vx + wi * x, vy + wi * y
        return vx / tw, vy / tw
    raw, rep = vec(False), vec(True)
    if math.hypot(*raw) >= CANCEL and math.hypot(*rep) >= CANCEL:
        out.update(_view(*rep))
        return out
    pick = next((td for _, td in used if td), None)
    if pick:
        out.update({'needle_deg': DIRS.index(pick) * 90, 'dir': pick, 'length': MIN_LEN})
        return out
    ns, ew = round(max(mean['N'], mean['S']), 9), round(max(mean['E'], mean['W']), 9)
    out['cancel'] = True
    out['candidates'] = ['N', 'S'] if ns > ew else ['E', 'W'] if ew > ns else list(DIRS)
    return out


def read(events, mission, call_llm=mini_llm, t0=None, now=time.monotonic):
    """→ {checks(12칸), tutor_dirs, tutor}. AI 를 못 읽으면 GenerateError — 코드 항목만 저장하지 않는다."""
    t0 = now() if t0 is None else t0
    events = [e for e in events if isinstance(e, dict)]
    m = mission if isinstance(mission, dict) else {}
    ts = tutor_items(events)
    body = {'mission': {k: _txt(m.get(k))[:200] for k in ('title', 'brief', 'keyPoint')},
            'code': [c[:600] for c in corpora(events)['N2']][-6:], 'tutor': ts,
            'design_reasons': [s[:300] for s in corpora(events)['E2'] if s],
            'judge_basis': [s[:300] for s in corpora(events)['W2'] if s]}
    messages = [{'role': 'system', 'content': SYSTEM},
                {'role': 'user', 'content': json.dumps(body, ensure_ascii=False)}]
    for attempt in (1, 2):
        if t0 + DEADLINE - now() < RETRY_NEEDS:  # 앞의 REST 호출이 느려 남은 시간이 없으면 0초짜리 호출 대신 깔끔한 실패
            break
        raw = call_llm(messages, SCHEMA, min(CALL_CAP, t0 + DEADLINE - now()))
        data = _json(raw)
        if data is not None and isinstance(data.get('items'), dict):
            ai, tdirs = vet(data, events)
            checks = {**code_checks(events, mission), **ai}
            return {'checks': {k: checks[k] for k in ITEMS}, 'tutor_dirs': tdirs, 'tutor': ts}
        print('[compass] 형식 오류', attempt, file=sys.stderr)
        if t0 + DEADLINE - now() < RETRY_NEEDS:
            break
        messages = messages + [{'role': 'assistant', 'content': raw if isinstance(raw, str) else ''},
                               {'role': 'user', 'content': '{"items": {"N2": {"ok": false, "quote": ""}, ...}, "tutor": [{"id": "t1", "dir": "N"}]} 형태의 JSON 하나만 다시 보내세요.'}]
    raise GenerateError(FAIL, {'format': ['JSON 아님']})
