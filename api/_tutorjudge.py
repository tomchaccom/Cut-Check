"""튜터 답 유출 판정. 정규식은 형식만 보고, 이 답이 미션을 풀어 주는지는 여기서 LLM 이 본다."""
import json

from _generate import _json

SCHEMA = {
    'type': 'object',
    'properties': {'leak': {'type': 'boolean'}, 'why': {'type': 'string', 'description': '유출이면 무엇이 샜는지 한 문장'}},
    'required': ['leak', 'why'], 'additionalProperties': False,
}
SYSTEM = '\n'.join([
    '당신은 중학교 1학년 파이썬 수업의 튜터 답변을 학생에게 보내기 직전에 검수한다. 개념은 알려 주되 이 미션은 학생이 풀어야 한다.',
    '유출은 셋뿐이다.',
    '1) 이 미션의 실제 자료에 바로 동작하는 코드나 절차. 예시 안에 자료 문자열을 그대로 쓰거나 학생 코드의 변수(data 등)에 바로 쓰면 여기에 든다.',
    '2) 풀이 단계의 순서. "~한 뒤/다음 ~" 처럼 두 단계를 잇는 것은 질문 꼴("나눈 뒤 무엇을 세려고 하나요?")이어도 유출이다.',
    '3) 이 미션 요청의 핵심 동작을 해내는 관용구. 다른 자료로 써도 유출이다. 예: 세기 미션의 `c[x] = c.get(x, 0) + 1`, "없으면 0, 있으면 +1". 딕셔너리가 키→값을 담는다, get() 이 무엇을 돌려준다 같은 개념 설명은 통과.',
    '유출이 아닌 것: 함수·개념이 하는 일 설명, 학생이 물은 도구의 이름, 자료와 다른 값으로 든 한 줄 예시(쉼표가 들어 있어도),',
    '학생 코드의 줄·위치를 짚고 그 줄에 대한 사실을 말하는 것.',
    '예) 통과: "split 은 문자열을 기준 글자로 잘라 목록을 만들어요. 예: `\'a,b,c\'.split(\',\')`"',
    '예) 통과: "2번째 줄은 data 를 그대로 출력해요."',
    '예) 유출: "예: `print(data.split(\',\'))`" — 한 단계뿐이어도 학생 코드의 data 에 바로 쓰는 코드다.',
    '예) 유출: "메뉴를 나눈 다음, 같은 값이 나올 때마다 숫자를 올리는 생각까지 정했나요?"',
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
