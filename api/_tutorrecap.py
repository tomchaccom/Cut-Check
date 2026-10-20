"""수업에서 짚을 거리 — 학생들의 튜터 대화에서 막힌 지점을 개념 단위로 묶는다 (api/tutor-recap.py 가 HTTP 를 다룬다)

설계: docs/superpowers/specs/2026-10-20-tutor-guardrail-recap-design.md B 절.
  - 학생 이름은 서버에 오지 않는다 (s1, s2 …). 돌려주는 who 도 기호다.
  - point 는 우리 문장 규칙으로 거르고, quote 는 학생 원문이라 거르지 않는다 — 대신 입력의 q 와 글자 그대로 같아야 한다.
    LLM 이 지어낸 인용이 교사 화면에 '학생이 한 말'로 뜨면 안 된다.
"""
import json
import re
import sys

from _generate import GenerateError, _json
from _schema import BANMAL, FOREIGN, PRAISE, YOU
from _steps import mini_llm

MAX_STUDENTS, MAX_PAIRS, PER_STUDENT, TOTAL, POINT_LEN = 40, 20, 3, 8, 60
ORDER_END = re.compile(r'세요[.!]?$')
FAIL = '지금은 뽑지 못했어요. 잠시 뒤 다시 눌러 주세요.'

SYSTEM = '\n'.join([
    '중학교 1학년 파이썬 수업이 끝난 뒤, 교사가 다음 수업에서 짚을 거리를 학생들의 AI 튜터 대화에서 뽑는다. JSON 하나만 응답한다.',
    '- 학생이 끝낸 미션의 질문(q)과 튜터 답(a)에서 실제로 막혔던 지점을 개념 단위 명사구로 쓴다. 예: split 결과는 문자열',
    '- 같은 지점에 막힌 학생은 한 항목으로 묶고 who 에 모두 적는다.',
    f'- 학생당 최대 {PER_STUDENT}항목, 전체 최대 {TOTAL}항목.',
    '- 평가·칭찬·방법 지시는 쓰지 않는다. point 는 명사구이고 "~하세요" 로 끝나지 않는다.',
    f'- point 는 {POINT_LEN}자 이하.',
    '- quote 는 그 항목을 보여주는 학생 질문(q) 하나를 글자 그대로 옮긴다. mid 는 그 학생의 mid.',
    '- refused 가 true 인 쌍은 튜터가 답하지 못한 막힘이다.',
    '- 막힘이 보이지 않으면 items 를 빈 목록으로 보낸다.',
])
SCHEMA = {'type': 'object', 'required': ['items'], 'properties': {'items': {'type': 'array', 'items': {
    'type': 'object', 'required': ['point', 'who', 'mid', 'quote'],
    'properties': {'point': {'type': 'string'}, 'who': {'type': 'array', 'items': {'type': 'string'}},
                   'mid': {'type': 'string'}, 'quote': {'type': 'string'}}}}}}


def _s(v, n):
    return v.strip()[:n] if isinstance(v, str) else ''


def clean(students):
    """서버도 상한을 지킨다 — 앞 40명 · 학생당 최근 20쌍. 모양이 틀린 건 버린다."""
    out = []
    for s in (students if isinstance(students, list) else [])[:MAX_STUDENTS]:
        if not isinstance(s, dict) or not _s(s.get('who'), 20):
            continue
        pairs = [{'q': _s(p.get('q'), 300), 'a': _s(p.get('a'), 400), 'refused': p.get('refused') is True}
                 for p in (s.get('pairs') if isinstance(s.get('pairs'), list) else []) if isinstance(p, dict)]
        out.append({'who': _s(s['who'], 20), 'mid': _s(s.get('mid'), 40), 'title': _s(s.get('title'), 60),
                    'brief': _s(s.get('brief'), 200), 'define': _s(s.get('define'), 200),
                    'pairs': [p for p in pairs if p['q']][-MAX_PAIRS:]})
    return out


def _point_ok(p):
    return (isinstance(p, str) and 0 < len(p.strip()) <= POINT_LEN and not PRAISE.search(p)
            and not BANMAL.search(p.strip()) and not YOU.search(p) and not FOREIGN.search(p)
            and not ORDER_END.search(p.strip()))


def vet(raw_items, students):
    """항목 → 검사 통과분. who ⊆ 입력, quote 는 who 중 한 학생의 q 와 글자 그대로 같을 것."""
    by = {s['who']: s for s in students}
    kept = []
    for it in raw_items if isinstance(raw_items, list) else []:
        if not isinstance(it, dict) or not _point_ok(it.get('point')):
            continue
        who = it.get('who')
        if not isinstance(who, list) or not who or not all(isinstance(w, str) and w in by for w in who):
            continue
        who = list(dict.fromkeys(who))
        hit = next(((by[w], p) for w in who for p in by[w]['pairs'] if p['q'] == it.get('quote')), None)
        if not hit:
            continue
        kept.append({'point': it['point'].strip(), 'who': who, 'mid': hit[0]['mid'],
                     'quote': hit[1]['q'], 'refused': hit[1]['refused']})
    kept.sort(key=lambda i: -len(i['who']))  # 안정 정렬 — 묶인 학생이 많은 항목이 상한에서 살아남는다
    out, per = [], {}
    for i in kept:
        if len(out) >= TOTAL or any(per.get(w, 0) >= PER_STUDENT for w in i['who']):
            continue
        out.append(i)
        for w in i['who']:
            per[w] = per.get(w, 0) + 1
    return out


def recap(students, call_llm=mini_llm):
    students = clean(students)
    if not students:
        return {'items': []}
    messages = [{'role': 'system', 'content': SYSTEM},
                {'role': 'user', 'content': json.dumps({'students': students}, ensure_ascii=False)}]
    for attempt in (1, 2):
        raw = call_llm(messages, SCHEMA, 20)
        data = _json(raw)
        if data is not None and isinstance(data.get('items'), list):
            return {'items': vet(data['items'], students)}
        print('[tutor-recap] 형식 오류', attempt, file=sys.stderr)
        messages = messages + [{'role': 'assistant', 'content': raw if isinstance(raw, str) else ''},
                               {'role': 'user', 'content': '{"items": [...]} 형태의 JSON 하나만 다시 보내세요.'}]
    raise GenerateError(FAIL, {'format': ['JSON 아님']})
