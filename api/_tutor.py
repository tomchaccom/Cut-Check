"""AI 튜터 흐름: 답 생성 → 형식 검사 → LLM 유출 판정 → (걸리면) 1회 재요청 → 되묻기 고정 문장.

LLM 호출은 call_llm(messages, schema, timeout) 로 주입받는다. 테스트는 가짜를 넣는다.
시간: 전체 26초(vercel 한도 30초). 답 10초, 판정 5초, 재요청은 남은 시간 10초 이상일 때 한 번.
재답은 판정하지 않는다 — 형식 검사를 통과하고 백틱 코드가 없을 때만 내보낸다.
"""
import json
import time

from _generate import _json
from _tutorguard import MAX, problems
from _tutorjudge import judge

REFUSE = {
    'ask_back': '지금 코드를 실행하면 무엇이 나오고, 원하는 결과와 어디가 달라요?',
    'off_topic': '파이썬 질문만 받을 수 있어요. 코드에서 막힌 곳을 물어봐 주세요.',
}

BUDGET, ANSWER_T, JUDGE_T, RETRY_NEEDS = 26, 10, 5, 10

SCHEMA = {
    'type': 'object',
    'properties': {
        'kind': {'type': 'string', 'enum': ['answer', 'ask_back', 'off_topic'],
                 'description': 'answer: 개념 설명·틀린 위치·다른 자료로 든 사용법. '
                                'ask_back: 학생이 다음에 확인할 것 하나를 묻는다. off_topic: 파이썬과 상관없는 질문.'},
        'answer': {'type': 'string', 'maxLength': MAX,
                   'description': 'off_topic 이면 빈 문자열. ask_back 은 ? 로 끝나는 80자 이하 한 문장.'},
    },
    'required': ['kind', 'answer'],
    'additionalProperties': False,
}

SYSTEM = '\n'.join([
    '당신은 중학교 1학년의 파이썬 튜터다. 학생은 풀 방법을 스스로 정했고 그걸 코드로 옮기는 중이다.',
    '개념 설명, 학생 코드에서 틀린 위치 짚기, 미션과 다른 자료로 든 사용법 한 줄 예시까지 해 준다.',
    '이 미션을 푸는 방법, 풀이 단계의 순서, 이 자료로 동작하는 코드는 말하지 않는다.',
    '입력의 자료와 설계는 학생 상황을 이해하라고 주는 것이지 답에 쓰라는 게 아니다.',
    '에러는 위치와 사실만 말한다. 원인의 결론은 학생이 찾는다. 예: "6번째 줄에서 숫자로 바꿀 수 없는 글자가 들어왔어요."',
    '설계와 코드가 다르게 가면 "설계 2번 카드랑 지금 코드가 같은 일을 하나요?" 처럼 되묻는다.',
    '답하기 어려우면 거절하지 말고 kind 를 ask_back 으로 하고, 학생이 다음에 확인할 것 하나를 물음표로 끝나는 80자 이하 한 문장으로 묻는다.',
    '예시는 백틱 한 줄 하나까지, 함수·문법 이름에는 백틱을 쓰지 않는다.',
    f'존댓말("~요"), 칭찬 없이, {MAX}자 이내. 학생을 "너"라고 부르지 않는다. JSON 하나만 응답한다.',
])


def _messages(question, ctx):
    msgs = [{'role': 'system', 'content': SYSTEM}]
    for h in ctx.get('history') or []:
        msgs += [{'role': 'user', 'content': str(h.get('q', ''))}, {'role': 'assistant', 'content': str(h.get('a', ''))}]
    msgs.append({'role': 'user', 'content': json.dumps({**ctx, 'question': question}, ensure_ascii=False)})
    return msgs


def _out(kind, answer, refused, reasons, retried, judged):
    return {'kind': kind, 'answer': answer, 'refused': refused, 'reasons': reasons, 'retried': retried, 'judged': judged}


def _refuse(reasons, retried=False, judged=False):
    return _out('ask_back', REFUSE['ask_back'], True, reasons, retried, judged)


def ask(question, ctx, call_llm, now=time.monotonic):
    t0 = now()
    msgs = _messages(question, ctx)
    raw = call_llm(msgs, SCHEMA, ANSWER_T)
    d = _json(raw) or {}
    kind, a = d.get('kind'), str(d.get('answer') or '').strip()
    if kind == 'off_topic':
        return _out('off_topic', REFUSE['off_topic'], True, [], False, False)
    if kind not in ('answer', 'ask_back'):
        return _refuse(['kind 가 없음'])
    reasons = problems(a, kind)
    if kind == 'ask_back':  # 되묻기는 답이 아니라 질문이다 — 판정 없이 형식만
        return _out('ask_back', a, False, [], False, False) if not reasons else _refuse(reasons)
    judged = False
    if not reasons:
        try:
            reasons, judged = judge(a, ctx, call_llm, JUDGE_T), True
        except Exception:  # noqa: BLE001 — 타임아웃·JSON 아님. 새는 쪽보다 막는 쪽이 안전하다
            return _refuse(['judge_failed'])
        if not reasons:
            return _out('answer', a, False, [], False, True)
    left = BUDGET - (now() - t0)
    if left < RETRY_NEEDS:
        return _refuse(reasons, judged=judged)
    msgs += [{'role': 'assistant', 'content': str(raw)},
             {'role': 'user', 'content': '아래 문제를 고쳐 다시 답한다: ' + ' / '.join(reasons)}]
    d2 = _json(call_llm(msgs, SCHEMA, min(ANSWER_T, left))) or {}
    k2, a2 = d2.get('kind'), str(d2.get('answer') or '').strip()
    if k2 in ('answer', 'ask_back') and not problems(a2, k2) and (k2 == 'ask_back' or '`' not in a2):
        return _out(k2, a2, False, reasons, True, judged)
    return _refuse(reasons, retried=True, judged=judged)
