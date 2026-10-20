"""AI 튜터 흐름: 답 생성 → 형식 검사 → LLM 검수(유출·하드코딩) → (걸리면) 걸린 부분만 빼고 1회 재요청 → 되묻기 고정 문장.

답 쓰는 프롬프트는 역할과 형식만 준다. 무엇을 말하면 안 되는지는 검수(_tutorjudge.py)가 맡는다.

LLM 호출은 call_llm(messages, schema, timeout) 로 주입받는다. 테스트는 가짜를 넣는다.
시간: 전체 26초(vercel 한도 30초). 답 10초, 판정 5초, 재요청은 남은 시간 10초 이상일 때 한 번.
재답도 판정한다 — 형식 검사를 통과한 뒤 남은 시간이 판정 5초 이상일 때만. 못 하면 고정 되묻기.
now() 는 시작·재요청 전·재판정 전 세 번 부른다.
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

# 재답 시간 = min(10, 남은 - 판정 5 - 여유 1), 4초 미만이면 안 한다 → RETRY_NEEDS = 4+5+1 = 10.
# 최악: 경과 e + 재답 (26-e-6) + 판정 5 = 25초 ≤ 26.
BUDGET, ANSWER_T, JUDGE_T, RETRY_MIN = 26, 10, 5, 4
RETRY_NEEDS = RETRY_MIN + JUDGE_T + 1

SCHEMA = {
    'type': 'object',
    'properties': {
        'kind': {'type': 'string', 'enum': ['answer', 'ask_back', 'off_topic'],
                 'description': 'answer: 개념 설명·문법(이름·생김새·다른 값 예시)·틀린 위치. '
                                'ask_back: 학생이 다음에 확인할 것 하나를 묻는다. off_topic: 파이썬과 상관없는 질문.'},
        'answer': {'type': 'string', 'maxLength': MAX,
                   'description': 'off_topic 이면 빈 문자열. ask_back 은 ? 로 끝나는 80자 이하 한 문장.'},
    },
    'required': ['kind', 'answer'],
    'additionalProperties': False,
}

SYSTEM = '\n'.join([
    '당신은 중학교 1학년의 파이썬 튜터다. 학생은 아래 미션과 자기가 정한 목표를 향해 코드를 짜는 중이다.',
    '학생이 막힌 곳을 스스로 이해하도록 개념과 학생 코드의 위치를 설명한다.',
    '개념을 물으면 그 개념이 하는 일을 미션 자료와 다른 값으로 든 예시로 설명한다. 이 미션에 어떻게 쓸지는 학생이 정하게 둔다.',
    '학생이 하려는 일에 어떤 문법이 필요한데 그 문법을 몰라 막혔으면(문법 질문, "어떻게 써요", "~하는 법") kind 를 answer 로 하고 그 문법을 알려 준다:',
    '문법 이름, 생김새(`딕셔너리[키] = 값` 처럼 한글 자리표시), 미션 자료·학생 변수와 상관없는 값으로 든 예시 1~2줄. 예: `d = {}` 다음 줄 `d[\'a\'] = 1`.',
    '문법 답은 문법 이름, 생김새, 예시 순으로 존댓말 두세 문장에 담고 거기서 끝낸다. 필요한 문법이 여럿이면 그중 하나만 알려 주고 나머지는 학생이 다시 묻게 둔다.',
    '문법을 여럿 엮어 이 미션을 해내는 코드와 풀이 순서는 학생이 짠다. 학생이 할 일을 정하지 않고 풀이 전체를 물으면 ask_back 으로 먼저 하려는 일을 묻는다.',
    '에러를 물으면 몇 번째 줄에서 무슨 일이 났는지 사실을 말한다. 원인의 결론은 학생이 찾게 둔다.',
    '설계 카드와 코드가 다르게 가면 "설계 2번 카드랑 지금 코드가 같은 일을 하나요?"처럼 되묻는다.',
    f'형식: 존댓말("~요"), 칭찬 없이, {MAX}자 이내. 학생을 "너"라고 부르지 않는다.',
    '코드 예시는 모두 합쳐 두 줄까지, 백틱으로 감싼다. 함수·문법 이름은 백틱 없이 쓴다.',
    '바로 답하기 어려우면 kind 를 ask_back 으로 하고, 학생이 다음에 확인할 것 하나를 물음표로 끝나는 80자 이하 한 문장으로 묻는다.',
    'JSON 하나만 응답한다.',
])


def _messages(question, ctx):
    msgs = [{'role': 'system', 'content': SYSTEM}]
    for h in ctx.get('history') or []:
        msgs += [{'role': 'user', 'content': str(h.get('q', ''))}, {'role': 'assistant', 'content': str(h.get('a', ''))}]
    shown = {k: v for k, v in ctx.items() if k != 'define'}
    shown['학생이 정한 목표'] = ctx.get('define', '')
    msgs.append({'role': 'user', 'content': json.dumps({**shown, 'question': question}, ensure_ascii=False)})
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
    reasons = problems(a, kind, ctx)
    judged, cut = False, ''
    jctx = {**ctx, 'question': question}  # 검수도 무엇을 물었는지 본다 — 문법 질문에 문법 답은 유출이 아니다
    if not reasons:
        try:
            (reasons, cut), judged = judge(a, jctx, call_llm, JUDGE_T), True
        except Exception:  # noqa: BLE001 — 타임아웃·JSON 아님. 새는 쪽보다 막는 쪽이 안전하다
            return _refuse(['judge_failed'])
        if not reasons:
            return _out(kind, a, False, [], False, True)
    left = BUDGET - (now() - t0)
    if left < RETRY_NEEDS:
        return _refuse(reasons, judged=judged)
    # 검수가 짚은 부분이 답에 그대로 있으면 그것만 지우게 한다 — 통째로 다시 쓰면 멀쩡한 설명까지 사라진다
    fix = ('아래 부분만 빼고 나머지 설명은 그대로 둔다: ' + cut if cut and cut in a and cut.strip() != a.strip()
           else '아래 문제를 고쳐 다시 답한다: ' + ' / '.join(reasons))
    fix += '\n다시 쓴 답은 학생에게 하는 말만 담는다. 무엇을 지웠거나 고쳤는지는 적지 않는다.'
    msgs += [{'role': 'assistant', 'content': str(raw)}, {'role': 'user', 'content': fix}]
    try:
        d2 = _json(call_llm(msgs, SCHEMA, min(ANSWER_T, left - JUDGE_T - 1))) or {}
    except Exception:  # noqa: BLE001 — 재답 실패로 502 를 내지 않는다. 첫 답은 이미 막혔다
        return _refuse(reasons + ['retry_failed'], retried=True, judged=judged)
    k2, a2 = d2.get('kind'), str(d2.get('answer') or '').strip()
    if k2 not in ('answer', 'ask_back') or problems(a2, k2, ctx):
        return _refuse(reasons, retried=True, judged=judged)
    left = BUDGET - (now() - t0)
    if left < JUDGE_T:
        return _refuse(reasons + ['no_time_to_judge_retry'], retried=True, judged=judged)
    try:
        again, _ = judge(a2, jctx, call_llm, min(JUDGE_T, left))
    except Exception:  # noqa: BLE001
        return _refuse(reasons + ['judge_failed'], retried=True, judged=judged)
    if again:
        return _refuse(reasons + again, retried=True, judged=True)
    return _out(k2, a2, False, reasons, True, True)
