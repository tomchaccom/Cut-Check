"""AI 튜터 흐름: 분류+답변(한 번의 structured output) → 검사 → 1회 재요청 → 고정 문장.

LLM 호출은 call_llm(messages, schema, timeout) 로 주입받는다. 테스트는 가짜를 넣는다.
"""
import json

from _generate import _json
from _tutorguard import MAX, problems

REFUSE = {
    'solution_request': '코드는 직접 써 보는 거예요. 궁금한 문법이 있으면 물어봐 주세요.',
    'off_topic': '파이썬 문법 질문만 받을 수 있어요.',
    'guarded': '이 질문에는 답하기 어려워요. 궁금한 문법 이름으로 다시 물어봐 주세요.',
}

SCHEMA = {
    'type': 'object',
    'properties': {
        'kind': {'type': 'string', 'enum': ['syntax', 'solution_request', 'off_topic'],
                 'description': 'syntax: 파이썬 문법·함수·에러 이름에 대한 질문. '
                                'solution_request: 이 미션을 어떻게 푸는지, 코드를 써 달라는 질문. off_topic: 그 밖.'},
        'answer': {'type': 'string', 'maxLength': MAX,
                   'description': 'kind 가 syntax 일 때만. 존댓말 두 문장 이내. 코드 예시는 백틱 한 줄 하나까지, '
                                  '미션과 상관없는 자료로.'},
    },
    'required': ['kind', 'answer'],
    'additionalProperties': False,
}

SYSTEM = '\n'.join([
    '당신은 중학교 1학년의 파이썬 문법 튜터다.',
    '학생은 문제를 풀 방법을 이미 스스로 정했고, 그걸 코드로 옮기는 중이다.',
    '문법·함수·에러 메시지가 무슨 뜻인지만 알려준다.',
    '이 미션을 어떻게 풀지, 학생 코드를 어떻게 고칠지, 정답 코드는 절대 말하지 않는다.',
    '예시는 백틱으로 감싼 한 줄 하나까지, 미션 자료와 다른 단어로 든다.',
    '존댓말, 칭찬 없이, 200자 이내. JSON 하나만 응답한다.',
])


def ask(question, mission, code, call_llm, timeout=20):
    user = json.dumps({'question': question, 'mission_title': mission.get('title', ''),
                       'student_code': code}, ensure_ascii=False)
    msgs = [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': user}]
    for _ in range(2):
        raw = call_llm(msgs, SCHEMA, timeout)
        d = _json(raw) or {}
        kind = d.get('kind')
        if kind in ('solution_request', 'off_topic'):
            return {'kind': kind, 'answer': REFUSE[kind], 'refused': True}
        reasons = problems(d.get('answer'), mission, code) if kind == 'syntax' else ['kind 가 없음']
        if not reasons:
            return {'kind': 'syntax', 'answer': str(d['answer']).strip(), 'refused': False}
        msgs = msgs + [{'role': 'assistant', 'content': str(raw)},
                       {'role': 'user', 'content': '아래 문제를 고쳐 다시 답한다: ' + ' / '.join(reasons)}]
    return {'kind': 'guarded', 'answer': REFUSE['guarded'], 'refused': True}
