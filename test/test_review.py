"""생성 직전 LLM 검수 흐름 — LLM 은 가짜.

  /usr/local/bin/python3 test/test_review.py
"""
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
import _review  # noqa: E402
from _review import make_mission, review  # noqa: E402

sys.path.insert(0, os.path.join(ROOT, 'test'))
from test_generate import DATA  # noqa: E402  — 14개 유형 자료 초안 (모듈 끝의 sys.exit 는 아래에서 막는다)

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


U = 'split-unique-count'
DRAFT = {**DATA[U], 'brief': '이번 주 재료가 모두 몇 가지인지 알려 주세요.', 'counter': {'name': '수요일 재료'}}
OK = {k: {'ok': True, 'why': '좋아요'} for k in ('understand', 'sameStory', 'noAnswer', 'easy')}
BAD = {**OK, 'sameStory': {'ok': False, 'why': '셋째 자료만 다른 이야기예요'}}


def fake(*reviews):
    """스키마로 누구를 부르는지 가린다: 유형 고르기 / 초안 / 검수. reviews 는 차례대로 쓰고, 예외면 던진다."""
    calls = {'type': 0, 'draft': 0, 'review': 0, 'feedback': []}

    def call(messages, schema, timeout):
        s = json.dumps(schema)
        if '"understand"' in s:
            r = reviews[calls['review']]
            calls['review'] += 1
            if isinstance(r, Exception):
                raise r
            return r if isinstance(r, str) else json.dumps(r, ensure_ascii=False)
        if '"pipelineId"' in s:
            calls['type'] += 1
            return json.dumps({'pipelineId': U})
        calls['draft'] += 1
        calls['feedback'].append('검수에서' in messages[-1]['content'])
        return json.dumps(DRAFT, ensure_ascii=False)
    call.calls = calls
    return call


def quiet(fn):
    err, sys.stderr = sys.stderr, io.StringIO()
    try:
        return fn()
    finally:
        sys.stderr = err


print('[통과]')
llm = fake(OK)
m = quiet(lambda: make_mission('리스트', '중복', llm))
t('한 번에 통과', m['guard']['review'] == {'status': 'pass', 'reasons': [], 'rounds': 1}, m['guard'].get('review'))

print('[1번 탈락 후 통과]')
llm = fake(BAD, OK)
m = quiet(lambda: make_mission('리스트', '중복', llm))
t('다시 만들어 통과', m['guard']['review']['status'] == 'pass' and m['guard']['review']['rounds'] == 2, m['guard']['review'])
t('다시 만들 때 검수 이유를 넣는다', llm.calls['feedback'] == [False, True], llm.calls['feedback'])

print('[3번 탈락 → 교사]')
llm = fake(BAD, BAD, BAD, OK)
m = quiet(lambda: make_mission('리스트', '중복', llm))
r = m['guard']['review']
t('재생성은 2번까지', llm.calls['review'] == 3 and llm.calls['draft'] == 3, llm.calls)
t('교사 검수 + 이유', r['status'] == 'teacher' and any('다른 이야기' in x for x in r['reasons']), r)

print('[검수 호출 실패 · JSON 아님 → 교사]')
for name, bad in [('호출 실패', RuntimeError('504')), ('JSON 아님', '검수 못 함'), ('항목 빠짐', {'understand': {'ok': True, 'why': ''}})]:
    llm = fake(bad, OK)
    m = quiet(lambda: make_mission('리스트', '중복', llm))
    r = m['guard']['review']
    t(name + ' — 생성은 실패하지 않고 교사로, 다시 만들지 않는다',
      r['status'] == 'teacher' and r['reasons'] == ['검수를 못 했어요'] and llm.calls['review'] == 1 and llm.calls['draft'] == 1,
      (r, llm.calls))

print('[시간 부족 → 재생성 없음]')
real = _review.DEADLINE
_review.DEADLINE = 20  # 첫 검수 뒤 남은 시간이 25초 안
try:
    llm = fake(BAD, OK)
    m = quiet(lambda: make_mission('리스트', '중복', llm))
    t('다시 만들지 않고 교사로', llm.calls['draft'] == 1 and m['guard']['review']['status'] == 'teacher', llm.calls)
finally:
    _review.DEADLINE = real

print('[검수할 시간도 없으면 → 검수 없이 교사]')
_review.DEADLINE = 3
try:
    llm = fake(OK)
    m = quiet(lambda: make_mission('리스트', '중복', llm))
    r = m['guard']['review']
    t('검수 호출 없이 교사로', llm.calls['review'] == 0 and r['status'] == 'teacher' and r['reasons'] == ['검수할 시간이 모자랐어요'], (r, llm.calls))
finally:
    _review.DEADLINE = real

print('[다시 만들다 LLM 이 터지면 → 앞 초안을 교사로]')
base = fake(BAD, OK)


def flaky(messages, schema, timeout):
    if '"understand"' not in json.dumps(schema) and '"pipelineId"' not in json.dumps(schema) and base.calls['draft'] == 1:
        raise RuntimeError('504')
    return base(messages, schema, timeout)


m = quiet(lambda: make_mission('리스트', '중복', flaky))
r = m['guard']['review']
t('앞 초안을 남기고 교사로', r['status'] == 'teacher' and m['title'] and r['rounds'] == 1
  and '다시 만들기에 실패해서 앞 문제를 보여 드려요' in r['reasons'] and any('다른 이야기' in x for x in r['reasons']), r)

print('[생성 SYSTEM 과 검수 항목은 이야기 속 방법 노출을 본다]')
from _generate import SYSTEM as GEN_SYSTEM
from _review import ITEMS
t('생성 SYSTEM 에 이야기 속 방법 금지 문구', '이야기 속에 푸는 방법' in GEN_SYSTEM)
t('noAnswer 가 이야기를 본다', '이야기' in ITEMS['noAnswer'])

print('[review 는 학생이 볼 문장만 넘긴다]')
seen = {}


def spy(messages, schema, timeout):
    seen['user'] = messages[-1]['content']
    return json.dumps(OK)


mission = {'title': '급식', 'brief': '몇 가지인지 알려 주세요.', 'situation': '', 'guard': {'reasons': {'x': ['비밀']}},
           'inputs': [{'name': '월', 'v': '밥,국'}], 'define': {'options': [{'v': '2가 나오면 성공', 'trap': 'hardcode'}]}}
t('통과면 빈 목록', review(mission, spy, 10) == [])
t('guard·함정 표시는 넘기지 않는다', '비밀' not in seen['user'] and 'hardcode' not in seen['user'], seen['user'])

print(f'\n{"FAIL " + str(fail) if fail else "ALL PASS"}')
sys.exit(1 if fail else 0)
