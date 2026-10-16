"""생성 직전 LLM 검수와 재생성 루프.

학생이 볼 문장과 자료 그대로 넘겨 네 가지를 묻는다. 탈락하면 이유를 붙여 처음부터 다시 만든다
(최대 2번). 그래도 탈락하거나 시간이 모자라거나 검수를 못 하면 교사 검수로 넘긴다 — 내보낼지는
교사가 정한다 (사람 결정 2026-10-16). 검수 문장은 교사 화면에만 간다.
"""
import json
import sys
import time

from _generate import DEADLINE, GenerateError, _json, generate, pickle_llm

MAX_REGEN = 2
REGEN_NEEDS = 25   # 초. 다시 만들고(~8초) 다시 검수(~3초)할 여유
REVIEW_NEEDS = 5   # 초. 이만큼도 없으면 검수 없이 교사에게

ITEMS = {
    'understand': '중1이 요청을 읽고 무엇을 구해야 하는지 아는가',
    'sameStory': '세 자료가 같은 이야기인가 (과일 목록과 문구 목록이 섞이면 아니다)',
    'noAnswer': '요청·상황 문장에 답이나 푸는 방법이 드러나지 않았나',
    'easy': '쉬운 말로 짧게 썼나',
}
SCHEMA = {
    'type': 'object',
    'properties': {k: {'type': 'object', 'description': v,
                       'properties': {'ok': {'type': 'boolean'}, 'why': {'type': 'string', 'description': '교사에게 한 문장'}},
                       'required': ['ok', 'why'], 'additionalProperties': False} for k, v in ITEMS.items()},
    'required': list(ITEMS), 'additionalProperties': False,
}
SYSTEM = '\n'.join([
    '당신은 중학교 1학년 수업에 쓸 문제를 학생에게 내기 직전에 검수한다.',
    '학생이 볼 문장과 자료만 보고 항목마다 ok 와 이유 한 문장을 쓴다.',
    *[f'- {k}: {v}' for k, v in ITEMS.items()],
    'JSON 하나만 응답한다.',
])


def review(mission, call_llm, timeout):
    """→ 걸린 이유 목록. 빈 목록이면 통과. 응답이 JSON 이 아니면 ValueError."""
    shown = {  # guard · 함정 표시는 넘기지 않는다 — 학생이 보는 것만
        '제목': mission.get('title', ''), '요청': mission.get('brief', ''), '상황': mission.get('situation', ''),
        '자료': [f"{i['name']}: {i['v']}" for i in mission.get('inputs', [])],
        '성공 조건 보기': [o['v'] for o in mission.get('define', {}).get('options', [])],
    }
    raw = call_llm([{'role': 'system', 'content': SYSTEM},
                    {'role': 'user', 'content': json.dumps(shown, ensure_ascii=False)}], SCHEMA, timeout)
    d = _json(raw)
    if not isinstance(d, dict):
        raise ValueError('검수 응답이 JSON 이 아님')
    out = []
    for k, label in ITEMS.items():
        v = d.get(k) if isinstance(d.get(k), dict) else {}
        if v.get('ok') is not True:
            out.append(f"{label.split(' (')[0]} — {v.get('why') or '답이 없어요'}")
    return out


def make_mission(lesson, key_point, call_llm=pickle_llm):
    t0 = time.monotonic()
    left = lambda: DEADLINE - (time.monotonic() - t0)  # noqa: E731
    m, feedback, rounds, status, reasons = None, None, 0, 'teacher', []
    while True:
        try:
            m = generate(lesson, key_point, call_llm, feedback=feedback, t0=t0)
        except GenerateError:
            if m is None:
                raise
            reasons = reasons + ['다시 만들기에 실패해서 앞 문제를 보여 드려요']
            break
        if left() < REVIEW_NEEDS:
            reasons = ['검수할 시간이 모자랐어요']
            break
        rounds += 1
        try:
            reasons = review(m, call_llm, min(15, left()))
        except Exception as e:  # noqa: BLE001 — 504·JSON 아님 등. 생성은 살리고 교사에게
            print('[generate-mission] 검수 실패', repr(e), file=sys.stderr)
            reasons = ['검수를 못 했어요']
            break
        if not reasons:
            status = 'pass'
            break
        print(f'[generate-mission] 검수 {rounds}차 탈락', json.dumps(reasons, ensure_ascii=False), file=sys.stderr)
        if rounds > MAX_REGEN or left() < REGEN_NEEDS:
            break
        feedback = reasons
    m['guard']['review'] = {'status': status, 'reasons': reasons, 'rounds': rounds}
    return m
