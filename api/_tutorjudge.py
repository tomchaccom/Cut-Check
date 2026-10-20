"""튜터 답 검수(유출·하드코딩). 정규식은 형식만 보고, 이 답이 미션을 풀어 주는지는 여기서 LLM 이 본다."""
import json

from _generate import _json

SCHEMA = {
    'type': 'object',
    'properties': {
        'verdict': {'type': 'string', 'enum': ['pass', 'leak', 'hardcode']},
        'why': {'type': 'string', 'description': '걸렸으면 무엇이 문제인지 한 문장'},
        'cut': {'type': 'string', 'description': '답에서 그대로 지울 부분. 답 안의 문장을 글자 그대로'},
    },
    'required': ['verdict', 'why', 'cut'], 'additionalProperties': False,
}
SYSTEM = '\n'.join([
    '당신은 중학교 1학년 파이썬 수업의 튜터 답변을 학생에게 보내기 직전에 검수한다. 개념은 알려 주되 이 미션은 학생이 풀어야 한다.',
    '유출은 셋뿐이다.',
    '1) 이 미션의 실제 자료에 바로 동작하는 코드나 절차. 예시 안에 자료 문자열을 그대로 쓰거나 학생 코드의 변수(data 등)에 바로 쓰면 여기에 든다.',
    '2) 풀이 단계의 순서. "~한 뒤/다음 ~" 처럼 두 단계를 잇는 것은 질문 꼴("나눈 뒤 무엇을 세려고 하나요?")이어도 유출이다.',
    '3) 이 미션 요청의 핵심 동작을 해내는 관용구. 다른 자료로 써도 유출이다. 예: 세기 미션의 `c[x] = c.get(x, 0) + 1`, "없으면 0, 있으면 +1". 딕셔너리가 키→값을 담는다, get() 이 무엇을 돌려준다 같은 개념 설명은 통과.',
    '하드코딩(hardcode)은 이번 자료의 결과값을 그대로 쓰거나, 특정 값에 맞춘 조건을 걸거나, 자료를 코드에 옮겨 적도록 이끄는 답이다.',
    '질문 꼴이거나 긍정만 해도 든다. 예: 학생이 "print(3) 하면 돼요?" 라고 물었을 때 "print(3) 해도 돼요".',
    '유출이 아닌 것: 함수·개념이 하는 일 설명, 학생이 물은 도구의 이름, 자료와 다른 값으로 든 한 줄 예시(쉼표가 들어 있어도),',
    '학생 코드의 줄·위치를 짚고 그 줄에 대한 사실을 말하는 것.',
    '예) 통과: "split 은 문자열을 기준 글자로 잘라 목록을 만들어요. 예: `\'a,b,c\'.split(\',\')`"',
    '예) 통과: "2번째 줄은 data 를 그대로 출력해요."',
    '예) 통과: "for 문은 목록의 값을 하나씩 꺼내 같은 일을 되풀이해요" — 학생이 이 미션의 핵심 개념 이름을 물었을 때. 관용구 코드가 없으면 통과.',
    '예) 유출: "예: `print(data.split(\',\'))`" — 한 단계뿐이어도 학생 코드의 data 에 바로 쓰는 코드다.',
    '예) 유출: "메뉴를 나눈 다음, 같은 값이 나올 때마다 숫자를 올리는 생각까지 정했나요?"',
    'verdict 는 pass(통과)·leak(유출)·hardcode(하드코딩) 중 하나. why 는 한 문장.',
    'cut 은 답에서 그대로 지울 부분이다. 답 안의 문장을 글자 그대로 옮긴다. 통과면 빈 문자열.',
    'verdict·why·cut 을 JSON 하나로 응답한다.',
])


def judge(answer, ctx, call_llm, timeout):
    """→ ([], '') 통과, (['leak: <why>'] 또는 ['hardcode: <why>'], cut). 응답 모양이 다르면 ValueError."""
    m = ctx.get('mission') or {}
    shown = {'답': answer, '요청': m.get('brief', ''), '상황': m.get('situation', ''),
             '자료': m.get('inputs', []), '학생이 정한 목표': ctx.get('define', ''), '학생 코드': ctx.get('code', '')}
    raw = call_llm([{'role': 'system', 'content': SYSTEM},
                    {'role': 'user', 'content': json.dumps(shown, ensure_ascii=False)}], SCHEMA, timeout)
    d = _json(raw)
    if (not isinstance(d, dict) or d.get('verdict') not in ('pass', 'leak', 'hardcode')
            or not isinstance(d.get('why'), str) or not isinstance(d.get('cut'), str)):
        raise ValueError('판정 응답이 JSON 객체가 아니거나 verdict/why/cut 이 맞지 않음')
    v = d['verdict']
    return ([], '') if v == 'pass' else ([f"{v}: {d['why'] or v}"], d['cut'])
