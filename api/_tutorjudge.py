"""튜터 답 유출 판정. 정규식은 형식만 보고, 이 답이 미션을 풀어 주는지는 여기서 LLM 이 본다."""
import json

from _generate import _json

SCHEMA = {
    'type': 'object',
    'properties': {'leak': {'type': 'boolean'}, 'why': {'type': 'string', 'description': '유출이면 무엇이 샜는지 한 문장'}},
    'required': ['leak', 'why'], 'additionalProperties': False,
}
SYSTEM = '\n'.join([
    '당신은 중학교 1학년 파이썬 수업의 튜터 답변을 학생에게 보내기 직전에 검수한다.',
    '학생 코드에 이 답을 그대로 옮기거나 답의 단계를 따라 하면 이 미션의 요청이 풀리는가?',
    '미션과 다른 값으로 든 한 줄 문법 예시, 개념 설명, 학생 코드에서 틀린 줄의 위치를 짚는 것은 유출이 아니다.',
    '풀이 단계 순서(먼저 나누고 그다음 세기 같은)를 알려주는 것은 유출이다.',
    'leak 과 why 를 JSON 하나로 응답한다. why 는 한 문장.',
])


def judge(answer, ctx, call_llm, timeout):
    """→ [] 통과, ['leak: <why>'] 유출. 응답이 JSON 객체가 아니거나 항목이 빠지면 ValueError."""
    m = ctx.get('mission') or {}
    shown = {'답': answer, '요청': m.get('brief', ''), '상황': m.get('situation', ''),
             '자료': m.get('inputs', []), '학생 코드': ctx.get('code', '')}
    raw = call_llm([{'role': 'system', 'content': SYSTEM},
                    {'role': 'user', 'content': json.dumps(shown, ensure_ascii=False)}], SCHEMA, timeout)
    d = _json(raw)
    if not isinstance(d, dict) or not isinstance(d.get('leak'), bool) or not isinstance(d.get('why'), str):
        raise ValueError('판정 응답이 JSON 객체가 아니거나 leak/why 가 빠짐')
    return [f"leak: {d['why'] or '유출'}"] if d['leak'] else []
