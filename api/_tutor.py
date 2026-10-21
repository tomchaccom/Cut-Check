"""AI 튜터 흐름: 답 생성 → 형식 검사 → LLM 검수(유출·하드코딩) → (걸리면) 다시 요청 → 그래도 안 되면 '보내지 않음' 사실 문장.

답 쓰는 프롬프트는 역할과 형식만 준다. 무엇을 말하면 안 되는지는 검수(_tutorjudge.py)가 맡는다.
튜터는 학생이 물은 것에 먼저 답한다. 되묻기는 답 뒤에 덧붙일 때만 — 답 없이 고정 되묻기만 돌려주던 것이
학생을 10분 동안 같은 문장 앞에 세웠다 (2026-10-17 기록, docs/eval-2026-10-20-tutor-guardrail.md).

LLM 호출은 call_llm(messages, schema, timeout) 로 주입받는다. 테스트는 가짜를 넣는다.
시간: 전체 26초(vercel 한도 30초). 답 10초, 판정 5초. 다시 요청은 남은 시간이 10초 이상일 때마다, 최대 RETRIES 번.
다시 쓴 답도 판정한다 — 남은 시간이 판정 5초 이상일 때만. 첫 판정이 실패(타임아웃·JSON 아님)해도 다시 요청한다.
now() 는 시작, 그리고 다시 요청할 때마다 요청 전·재판정 전에 부른다.
"""
import json
import time

from _generate import _json
from _tutorguard import MAX, problems
from _tutorjudge import judge

REFUSE = {
    'blocked': '미션 풀이가 섞일 수 있는 답이라 보내지 않았어요. 궁금한 문법 이름으로 한 번 더 물어봐 주세요.',
    'off_topic': '파이썬 질문만 받을 수 있어요. 코드에서 막힌 곳을 물어봐 주세요.',
    # 같은 거절을 연달아 받은 학생은 무엇을 물어야 할지 모른다 (2026-10-17 실제 기록: 한 학생이 같은 문장을 7번 받고
    # "그래서 뭐 우짜라는 거예요"). 두 번째부터는 물을 수 있는 꼴을 보여 준다 — 예시는 미션과 상관없는 문법이다
    'ask_again': "이번 답도 보내지 않았어요. '리스트에 값 넣는 법'처럼 문법 이름으로 물어봐 주세요.",
}

# 다시 쓰는 시간 = min(10, 남은 - 판정 5 - 여유 1), 4초 미만이면 안 한다 → RETRY_NEEDS = 4+5+1 = 10.
# 최악: 경과 e + 재답 (26-e-6) + 판정 5 = 25초 ≤ 26. 두 번째 재요청도 같은 셈이라 한도를 넘지 않는다.
BUDGET, ANSWER_T, JUDGE_T, RETRY_MIN = 26, 10, 5, 4
RETRY_NEEDS = RETRY_MIN + JUDGE_T + 1
RETRIES = 2

SCHEMA = {
    'type': 'object',
    'properties': {
        'kind': {'type': 'string', 'enum': ['answer', 'off_topic'],
                 'description': 'answer: 학생이 물은 것에 대한 답(개념·문법 이름·생김새·다른 값 예시·에러 뜻·틀린 위치). '
                                'off_topic: 파이썬과 상관없는 질문.'},
        'answer': {'type': 'string', 'maxLength': MAX, 'description': 'off_topic 이면 빈 문자열.'},
    },
    'required': ['kind', 'answer'],
    'additionalProperties': False,
}

SYSTEM = '\n'.join([
    '당신은 중학교 1학년의 파이썬 튜터다. 학생은 아래 미션과 자기가 정한 목표를 향해 코드를 짜는 중이다.',
    '학생이 물은 것에 먼저 바로 답한다. 첫 문장부터 학생이 원한 정보를 담는다.',
    '문법·함수 이름·생김새를 물으면(문법 질문, "어떻게 써요", "~하는 법"): 문법 이름, 생김새(`딕셔너리[키] = 값` 처럼 한글 자리표시),',
    '미션 자료·학생 변수와 상관없는 값으로 든 예시 1~2줄. 예: `d = {}` 다음 줄 `d[\'a\'] = 1`.',
    '개념을 물으면 그 개념이 하는 일을 미션 자료와 다른 값으로 든 예시로 설명한다. 이 미션에 어떻게 쓸지는 학생이 정하게 둔다.',
    '에러를 물으면 그 에러 이름이 뜻하는 것과, 몇 번째 줄에서 무슨 일이 났는지 사실을 말한다. 고칠 코드는 학생이 쓴다.',
    '"어떻게 풀어요", "코드 짜 줘" 처럼 풀이 전체를 물으면, 풀이와 쓸 문법 고르기는 학생 몫이라고 한 문장으로 말하고,',
    '지금 학생 코드가 무엇을 하는지(몇 번째 줄이 무엇을 만들거나 출력하는지) 사실을 알려 준다. 다음에 쓸 문법을 골라 주지 않는다.',
    '필요한 문법이 여럿이면 그중 하나만 알려 주고 나머지는 학생이 다시 묻게 둔다. 문법을 여럿 엮은 풀이 코드와 풀이 순서는 학생이 짠다.',
    '답을 준 뒤에만, 학생이 다음에 확인할 것 하나를 물음표로 끝나는 짧은 문장으로 덧붙일 수 있다. 답 없이 되묻기만 하지 않는다.',
    '설계 카드와 코드가 다르게 가면 답 뒤에 "설계 2번 카드랑 지금 코드가 같은 일을 하나요?"처럼 덧붙인다.',
    f'형식: 존댓말("~요"), 칭찬 없이, {MAX}자 이내. 학생을 "너"라고 부르지 않는다.',
    '코드 예시는 모두 합쳐 두 줄까지, 백틱으로 감싼다. 함수·문법 이름은 백틱 없이 쓴다.',
    'JSON 하나만 응답한다.',
])

# 걸린 답을 다시 쓰게 할 때마다 붙인다 — 고친다고 답을 비우거나 되묻기만 남기면 학생은 또 아무것도 못 받는다
GENERAL = ('학생이 물은 문법·개념에는 그대로 답한다: 이름, 하는 일, 미션 자료·학생 변수와 상관없는 값으로 든 예시 한 줄까지. '
           '이 미션 자료·학생 코드에 어떻게 쓸지와 풀이 순서만 뺀다. 되묻기만으로 바꾸지 않는다.\n'
           '다시 쓴 답은 학생에게 하는 말만 담는다. 무엇을 지웠거나 고쳤는지는 적지 않는다.')


def _messages(question, ctx):
    msgs = [{'role': 'system', 'content': SYSTEM}]
    for h in ctx.get('history') or []:
        msgs += [{'role': 'user', 'content': str(h.get('q', ''))}, {'role': 'assistant', 'content': str(h.get('a', ''))}]
    shown = {k: v for k, v in ctx.items() if k != 'define'}
    shown['학생이 정한 목표'] = ctx.get('define', '')
    msgs.append({'role': 'user', 'content': json.dumps({**shown, 'question': question}, ensure_ascii=False)})
    return msgs


def _fix(a, reasons, cut):
    # 검수가 짚은 부분이 답에 그대로 있으면 그것만 지우게 한다 — 통째로 다시 쓰면 멀쩡한 설명까지 사라진다
    if cut and cut in a and cut.strip() != a.strip():
        head = '아래 부분만 빼고 나머지 설명은 그대로 둔다: ' + cut
    else:
        real = [r for r in reasons if r != 'judge_failed']  # 검수가 응답을 못 한 건 답의 문제가 아니다
        head = ('아래 문제를 고쳐 다시 답한다: ' + ' / '.join(real)) if real else '같은 질문에 다시 답한다.'
    return head + '\n' + GENERAL


def _out(kind, answer, refused, reasons, retried, judged):
    return {'kind': kind, 'answer': answer, 'refused': refused, 'reasons': reasons, 'retried': retried, 'judged': judged}


def ask(question, ctx, call_llm, now=time.monotonic):
    r = _ask(question, ctx, call_llm, now)
    hist = ctx.get('history') or []
    if r['answer'] == REFUSE['blocked'] and hist and str(hist[-1].get('a', '')) in (REFUSE['blocked'], REFUSE['ask_again']):
        r['answer'] = REFUSE['ask_again']
    return r


def _ask(question, ctx, call_llm, now):
    t0 = now()
    msgs = _messages(question, ctx)
    raw = call_llm(msgs, SCHEMA, ANSWER_T)
    jctx = {**ctx, 'question': question}  # 검수도 무엇을 물었는지 본다 — 문법 질문에 문법 답은 유출이 아니다
    seen, retried, judged = [], False, False
    for n in range(RETRIES + 1):
        d = _json(raw) or {}
        kind, a = d.get('kind'), str(d.get('answer') or '').strip()
        if kind == 'off_topic':
            return _out('off_topic', REFUSE['off_topic'], True, seen, retried, judged)
        # 되묻기만 하는 답(옛 ask_back)도 kind 밖이다 — 답 없이 묻기만 하면 다시 요청한다
        reasons, cut = (problems(a, kind, ctx) if kind == 'answer' else ['kind 가 answer 가 아님']), ''
        if not reasons:
            limit = JUDGE_T
            if n:
                limit = min(JUDGE_T, BUDGET - (now() - t0))
                if limit < JUDGE_T:
                    seen.append('no_time_to_judge_retry')
                    break
            try:
                (reasons, cut), judged = judge(a, jctx, call_llm, limit), True
            except Exception:  # noqa: BLE001 — 타임아웃·JSON 아님. 판정 못 한 답은 보내지 않고 다시 요청한다
                reasons = ['judge_failed']
            if not reasons:
                return _out('answer', a, False, seen, retried, judged)
        seen += reasons
        if n == RETRIES:
            break
        left = BUDGET - (now() - t0)
        if left < RETRY_NEEDS:
            break
        msgs += [{'role': 'assistant', 'content': str(raw)}, {'role': 'user', 'content': _fix(a, reasons, cut)}]
        retried = True
        try:
            raw = call_llm(msgs, SCHEMA, min(ANSWER_T, left - JUDGE_T - 1))
        except Exception:  # noqa: BLE001 — 재답 실패로 502 를 내지 않는다. 첫 답은 이미 막혔다
            seen.append('retry_failed')
            break
    return _out('blocked', REFUSE['blocked'], True, seen, retried, judged)
