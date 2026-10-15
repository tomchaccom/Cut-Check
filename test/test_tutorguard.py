"""AI 튜터 답변 검사기(api/_tutorguard.py) · 튜터 흐름(api/_tutor.py) 검증.

막아야 하는 것을 통과시킬 것보다 많이 넣는다. 이 검사기의 일은 막는 것이다.

  uv run --with-requirements requirements.txt python test/test_tutorguard.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
from _tutor import REFUSE, ask  # noqa: E402
from _tutorguard import problems  # noqa: E402

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


M = {'title': '창고 주문서 정리', 'itemName': '상품', 'items': ['사과', '바나나', '우유']}
CODE = 'data = "사과,바나나,사과"\nparts = data.split(",")\nprint(len(set(parts)))\n'

print('[막는다]')
for name, ans in [
    ('미션 자료 값', '`"사과,배".split(",")` 처럼 쓰면 쉼표로 나눠져요.'),
    ('미션 제목', '창고 주문서 정리에서는 `split`을 써요.'),
    ('여러 줄 코드', '```\nparts = s.split(",")\nprint(len(parts))\n```'),
    ('코드 조각 둘', '`a.split()` 다음에 `len(a)` 를 쓰면 돼요.'),
    ('학생 코드 그대로', '`print(len(set(parts)))` 는 서로 다른 개수를 세요.'),
    ('방법 판단', '이 문제에서는 중복을 빼야 해요.'),
    ('정답 언급', '정답은 set 을 쓰는 거예요.'),
    ('고치는 법', '`set`으로 고치면 맞아요.'),
    ('칭찬', '훌륭한 질문이에요. `split`은 문자열을 나누는 함수예요.'),
    ('반말', '`split`은 문자열을 나누는 함수야.'),
    ('너', '너 코드에서는 `split`을 쓰고 있어요.'),
    ('너무 김', '`split`은 문자열을 나눠요. ' + '가' * 200),
    ('한 줄이지만 학생 코드와 같은 줄', '이렇게 써요. `parts = data.split(",")`'),
    ('빈 답', ''),
]:
    r = problems(ans, M, CODE)
    t(name, bool(r), r)

print('[통과]')
for name, ans in [
    ('문법 설명 + 한 줄 예시', '`"a b c".split()` 처럼 쓰면 공백을 기준으로 나눈 목록이 나와요.'),
    ('에러 설명', 'IndentationError 는 들여쓰기가 맞지 않을 때 나오는 에러예요.'),
    ('for 문', '`for x in 목록:` 다음 줄을 들여 쓰면 목록의 값을 하나씩 꺼내요.'),
]:
    r = problems(ans, M, CODE)
    t(name, not r, r)


def fake(*replies):
    calls = []

    def call(messages, schema, timeout):
        calls.append(messages)
        return json.dumps(replies[min(len(calls) - 1, len(replies) - 1)], ensure_ascii=False)
    call.calls = calls
    return call


print('[흐름]')
llm = fake({'kind': 'solution_request', 'answer': ''})
r = ask('정답 코드 알려줘', M, CODE, llm)
t('정답 요청은 고정 문장으로 거절', r == {'kind': 'solution_request', 'answer': REFUSE['solution_request'], 'refused': True}, r)

r = ask('점심 뭐 먹어?', M, CODE, fake({'kind': 'off_topic', 'answer': ''}))
t('범위 밖은 고정 문장', r['answer'] == REFUSE['off_topic'] and r['refused'], r)

good = {'kind': 'syntax', 'answer': '`"a b".split()` 처럼 쓰면 공백으로 나눈 목록이 나와요.'}
r = ask('split 이 뭐예요?', M, CODE, fake(good))
t('문법 질문은 답한다', r['kind'] == 'syntax' and not r['refused'] and r['answer'] == good['answer'], r)

llm = fake({'kind': 'syntax', 'answer': '`"사과,배".split(",")` 처럼 써요.'}, good)
r = ask('split 이 뭐예요?', M, CODE, llm)
t('검사에 걸리면 사유를 붙여 한 번 더 묻는다', len(llm.calls) == 2 and '사과' in llm.calls[1][-1]['content'] and r == {**good, 'refused': False}, r)

bad = {'kind': 'syntax', 'answer': '이 문제에서는 중복을 빼야 해요.'}
llm = fake(bad, bad)
r = ask('어떻게 해요?', M, CODE, llm)
t('두 번 다 걸리면 고정 문장', len(llm.calls) == 2 and r['kind'] == 'guarded' and r['refused'] and r['answer'] == REFUSE['guarded'], r)

r = ask('split?', M, CODE, fake('이건 JSON 이 아님'))
t('JSON 이 아니면 고정 문장', r['kind'] == 'guarded' and r['refused'], r)

print('\n전부 통과' if not fail else f'\n실패 {fail}건')
sys.exit(1 if fail else 0)
