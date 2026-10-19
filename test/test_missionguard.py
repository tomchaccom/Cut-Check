"""생성 미션 검사기(api/_schema.py) 검증.

docs/llm.md 7절대로 통과해야 하는 것보다 **막아야 하는 것을 더 많이** 넣는다.
이 검사기의 일은 통과시키는 게 아니라 막는 것이다.

  uv run --with-requirements requirements.txt python test/test_missionguard.py
"""
import copy
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
from _schema import (CHOICE, DRAFTS, SPEC, _LIMIT, _brief_problem, _plain_problem,  # noqa: E402
                     _sentence_problem, _text_problem, failed_fields)
from pydantic import ValidationError  # noqa: E402

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


def check(pid, m):
    try:
        DRAFTS[pid].model_validate(m)
        return {}
    except ValidationError as e:
        return failed_fields(e)


U, F = 'split-unique-count', 'split-filter-count'
GOOD = {
    U: {'title': '급식 재료 확인', 'brief': '이번 주 급식 재료가 몇 가지인지 알려 주세요.', 'situation': '우리 반이 급식 당번이에요.',
        'itemName': '재료',
        'data': [{'name': '1반 신청', 'items': ['밥', '우유', '김치']}, {'name': '2반 신청', 'items': ['빵', '국', '떡']}],
        'counter': {'name': '3반 신청', 'text': '국,밥,우유,밥,떡', 'axis': 'count'}},
    F: {'title': '급식 알레르기 찾기', 'brief': '주의할 재료가 몇 개인지 알려 주세요.', 'situation': '우리 반이 급식 당번이에요.',
        'itemName': '재료', 'filterTarget': ['우유', '달걀', '땅콩'], 'filterDesc': '알레르기 목록',
        'data': [{'name': '1반 신청', 'items': ['밥', '우유', '김치']}, {'name': '2반 신청', 'items': ['빵', '달걀', '국', '우유']}],
        'counter': {'name': '3반 신청', 'text': '달걀 빵 김치 우유', 'axis': 'sep'}},
}

print('\n[통과해야 하는 것]')
for pid, m in GOOD.items():
    r = check(pid, m)
    t(pid, not r, r)


def broken(pid, why, edit, field):
    m = copy.deepcopy(GOOD[pid])
    edit(m)
    r = check(pid, m)
    t(f'[{field}] {why}', field in r, r or '통과해버림')


def setp(path, value):
    def f(m):
        cur = m
        for k in path[:-1]:
            cur = cur[k]
        cur[path[-1]] = value
    return f


print('\n[막아야 하는 것]')
broken(U, '칭찬', setp(['situation'], '정말 잘했어요.'), 'situation')
broken(U, '요청에 구할 값이 없음', setp(['brief'], '재료 목록을 정리해 주세요.'), 'brief')
broken(U, '반말 brief', setp(['brief'], '급식 재료 좀 세어봐.'), 'brief')
broken(U, "학생을 '너'라고 부름", setp(['brief'], '너 이거 정리해 주세요.'), 'brief')
broken(U, 'brief 가 답을 암시', setp(['brief'], '중복을 빼고 세어 주세요.'), 'brief')
broken(U, '두 문장', setp(['brief'], '목록이 왔어요. 확인해 주세요.'), 'brief')
broken(U, '괄호 덧붙임', setp(['situation'], '급식 당번이에요(이번 주만).'), 'situation')
broken(U, "'예를 들어' 부연", setp(['brief'], '예를 들어 재료를 확인해 주세요.'), 'brief')
broken(U, '요청이 60자 넘음', setp(['brief'], '이번 주 월요일부터 금요일까지 급식에 들어간 재료 목록을 하나도 빠짐없이 전부 꼼꼼하게 다시 한 번 확인해서 정리해 주세요.'), 'brief')
STORY = '엄마가 명성이 번호를 물어봤어요. 내 연락처에는 있는데 엄마 폰에는 없어요.'
m = copy.deepcopy(GOOD[U]); m['situation'] = STORY
t('이야기 situation 두 문장은 통과', 'situation' not in check(U, m), check(U, m))
m['situation'] = '가' * 90 + '요.'  # 92자
t('situation 91자 이상은 걸린다', 'situation' in check(U, m))
m['situation'] = '엄마가 물어봤어요. 폰에 없어요. 내 폰에는 있어요.'
t('situation 세 문장은 걸린다', 'situation' in check(U, m))
for bad in ['딕셔너리에서 명성 키를 찾아 주세요', '리스트에서 골라 주세요']:
    m = copy.deepcopy(GOOD[U]); m['brief'] = bad
    t(f'brief 방법 단어 막는다: {bad}', 'brief' in check(U, m), check(U, m))
for ok in ['재료가 몇 가지인지 값을 알려 주세요.', '플레이리스트에 재료가 몇 가지인지 알려 주세요.']:
    m = copy.deepcopy(GOOD[U]); m['brief'] = ok
    t(f'brief 통과: {ok}', 'brief' not in check(U, m), check(U, m))
m = copy.deepcopy(GOOD[U]); m['situation'] = '민지의 플레이리스트가 길어졌어요.'
t('situation 플레이리스트는 통과', 'situation' not in check(U, m), check(U, m))
m['situation'] = '선생님이 딕셔너리를 쓰라고 하셨어요.'
t('situation 에 딕셔너리는 막는다', 'situation' in check(U, m))
m['situation'] = '가' * 89 + '요.'
m['situation'] = '가' * 88 + '요.'
t('situation 정확히 90자는 통과', len(m['situation']) == 90 and 'situation' not in check(U, m), check(U, m))
m['situation'] = '가' * 89 + '요.'
t('situation 91자는 걸린다', len(m['situation']) == 91 and 'situation' in check(U, m))
broken(U, '한자 섞임', setp(['title'], '給食 재료'), 'title')
broken(U, '코드 조각', setp(['situation'], 'items.split(",") 해요.'), 'situation')
broken(U, '반례가 첫 자료와 결과가 같음', setp(['counter', 'text'], '빵,국,떡,빵'), 'counter')
broken(U, 'axis=sep 인데 쉼표만 있음', setp(['counter'], {'name': 'x', 'text': '밥,우유', 'axis': 'sep'}), 'counter')
broken(U, 'axis=invisible 인데 공백 없음', setp(['counter'], {'name': 'x', 'text': '밥,우유', 'axis': 'invisible'}), 'counter')
broken(U, 'axis=empty 인데 결과가 있음', setp(['counter'], {'name': 'x', 'text': '밥', 'axis': 'empty'}), 'counter')
broken(U, '자료 항목에 플레이스홀더', setp(['data', 0, 'items'], ['항목1', '항목2', '항목3']), 'data')
broken(U, '자료 항목 안에 쉼표', setp(['data', 0, 'items'], ['밥,국', '우유', '김치']), 'data')
broken(U, '자료가 2개가 아님', lambda m: m['data'].pop(), 'data')
# 평가 3회차에서 실제로 새어 나간 것들
broken(U, "명령형 brief ('결정해라')", setp(['brief'], '기준을 스스로 결정해라.'), 'brief')
broken(U, "평서형 brief ('작성한다')", setp(['brief'], '날의 수를 세는 프로그램을 작성한다.'), 'brief')
broken(U, '반례가 문장', setp(['counter'], {'name': 'x', 'text': '항목의 개수를 세어라. 같은 값은 여러 번', 'axis': 'count'}), 'counter')
broken(U, '항목에 목록을 통째로', setp(['data', 0, 'items'], ['7 3 2 4 6 5 7', '밥', '국']), 'data')
broken(U, "반례가 이름표 ('data1')", setp(['counter'], {'name': 'x', 'text': 'data1', 'axis': 'count'}), 'counter')
broken(U, "반례가 이름표 ('과일 개수')", setp(['counter'], {'name': 'x', 'text': '과일 개수', 'axis': 'count'}), 'counter')
broken(U, "항목 이름이 영어 ('count')", setp(['itemName'], 'count'), 'itemName')
broken(F, '걸러낼 대상이 자료에 없음', setp(['filterTarget'], ['땅콩', '새우']), 'data')
broken(F, '걸러내기 유형인데 대상이 없음', lambda m: m.pop('filterTarget'), 'filterTarget')

# 2026-10-18 '간식 세기' 불만 조사에서 실제로 나온 것들
broken(U, '자료 이름이 요일만 다름', lambda m: m['data'][0].update(name='수요일 재료') or m['data'][1].update(name='금요일 재료'), 'data')
broken(U, '자료 이름이 날짜만 다름', lambda m: m['data'][0].update(name='3월 2일 신청') or m['data'][1].update(name='3월 9일 신청'), 'data')
broken(U, '자료 이름이 요일 하나뿐', lambda m: m['data'][0].update(name='월요일') or m['data'][1].update(name='화요일'), 'data')
broken(U, '반례 이름만 요일 바꿈', lambda m: m['data'][0].update(name='월요일 신청') or m['counter'].update(name='금요일 신청'), 'counter')
broken(U, '반례가 첫 자료로 그대로 시작', setp(['counter', 'text'], '밥,우유,김치,빵,국'), 'counter')
broken(U, '요청에 칸 이름 itemName', setp(['brief'], '적어 낸 itemName마다 몇 가지인지 알려 주세요.'), 'brief')
broken(U, "요청에 방법 '한 번만 세어'", setp(['brief'], '겹쳐도 한 번만 세어 재료가 몇 가지인지 알려 주세요.'), 'brief')
broken(U, "가지 수를 묻는데 '몇 개'", setp(['brief'], '이번 주 급식 재료가 몇 개인지 알려 주세요.'), 'brief')
m = copy.deepcopy(GOOD[U]) | {'brief': '이번 주 급식 재료가 몇 가지인지 알려 주세요.',
                              'counter': {'name': '3반 신청', 'text': '국,밥,국,떡', 'axis': 'count'}}
t("[brief] 전부 세는데 '몇 가지' (겹친 항목이 있다)", 'brief' in check('split-count', m), check('split-count', m))
broken(F, '고정 목록 = 두 자료에 모두 있는 것', setp(['filterTarget'], ['우유']), 'filterTarget')
broken(F, '고정 목록 = 한 자료의 답', setp(['filterTarget'], ['우유', '달걀']), 'filterTarget')
broken(F, '자료 항목이 자료 이름', setp(['data', 0, 'items'], ['밥', '우유', '2반 신청']), 'data')
for ok in ['1반 신청', '민지 쪽지']:
    m = copy.deepcopy(GOOD[U]); m['data'][0]['name'] = ok
    t(f'출처가 다른 이름은 통과: {ok}', 'data' not in check(U, m), check(U, m))
m = copy.deepcopy(GOOD[F]); m['filterTarget'] = ['우유', '달걀', '땅콩']
t('고정 목록에 자료에 없는 항목이 섞이면 통과', 'filterTarget' not in check(F, m), check(F, m))
m = copy.deepcopy(GOOD[U]); m['brief'] = '재료가 몇 가지인지 알아내서 장 볼 목록을 정해 주세요.'
t('목적이 있는 요청은 통과', 'brief' not in check(U, m), check(U, m))

print('\n[중1이 모르는 개발 용어와 지시문 — 밤샘 스펙 3.3 학생 문장 규칙]')
for bad in ['데이터 집계 로직을 검토해 주세요.', '처리 결과의 타당성을 확인해 주세요.',
            '카운터 자료를 만들어 주세요.', '성공 조건을 명시하세요.', '처리 방법을 기술하세요.']:
    t(f'막는다: {bad}', bool(_text_problem(bad)), _text_problem(bad))
for ok in ['주문서에 상품이 몇 개인지 알려 주세요.', '출석부에 학생이 몇 명인지 세어 주세요.']:
    t(f'통과: {ok}', not _text_problem(ok), _text_problem(ok))

print('\n[유형마다 다른 자료 조건]')
num = {'title': '용돈 합계', 'brief': '이번 주 쓴 돈을 알려 주세요.', 'situation': '용돈 기록을 정리해요.', 'itemName': '금액',
       'data': [{'name': '월요일', 'items': ['1000', '메모', '500']}, {'name': '화요일', 'items': ['300', '700', '100']}],
       'counter': {'name': '수요일', 'text': '1000,2000,500,300', 'axis': 'count'}}
t('합계 유형에 숫자 아닌 항목 → data', 'data' in check('split-num-sum', num))
grp = copy.deepcopy(num) | {'data': [{'name': 'a', 'items': ['밥', '국', '빵']}, {'name': 'b', 'items': ['떡', '김치', '우유']}],
                            'counter': {'name': 'c', 'text': '밥,밥,국,빵', 'axis': 'count'}}
t('묶어 세기인데 겹치는 항목 없음 → data', 'data' in check('split-group', grp))

print('\n[사유를 한 번에 전부 낸다 — 재요청은 한 번뿐이다]')
m = copy.deepcopy(GOOD[U])
m['brief'] = '세어봐'
m['counter']['text'] = '빵,국,떡,빵'
m['situation'] = '가' * 50
r = check(U, m)
t('brief · counter · situation 이 함께 나온다', {'brief', 'counter', 'situation'} <= set(r), r)

print('\n[LLM 에 넘기는 스키마]')
choice = CHOICE.model_json_schema()
t('유형 고르기 — 14개', len(choice['properties']['pipelineId']['enum']) == 14)
s = DRAFTS[F].model_json_schema()
t('초안 — 다른 유형이 섞이지 않는다', 'oneOf' not in json.dumps(s) and 'anyOf' not in json.dumps(s))
t('초안 — 성공 조건·방법 칸이 없다 (코드가 쓴다)', 'goals' not in s['properties'] and 'sentences' not in s['properties'])
t('초안 — 글자 수 한도가 스키마에 보인다', s['properties']['brief'].get('maxLength') == 60 and s['properties']['situation'].get('maxLength') == 90)
t('초안 — description 이 생성 지시로 들어간다', '반례' in s['properties']['counter']['description'])
t('14개 유형 모두 초안 스키마가 만들어진다', len(DRAFTS) == 14 == len(SPEC))

print('\n[우리가 손으로 쓴 미션 문장도 같은 규칙 — 모델에게만 시킬 수는 없다]')
ours = json.loads(subprocess.run(
    ['node', '-e', 'global.window={};require(process.argv[1]);'
     'process.stdout.write(JSON.stringify(window.CC.SENTENCE_MISSIONS))',
     os.path.join(ROOT, 'js/core/missions.js')],
    capture_output=True, text=True, check=True).stdout)
for m in ours:
    said = [('brief', m['brief'], _LIMIT['brief']), ('define.q', m['define']['q'], _LIMIT['brief'])]
    said += [('goals', o['v'], _LIMIT['goals']) for o in m['define']['options']]
    said += [('sentences', s['template'], _LIMIT['sentences']) for s in m.get('method', {}).get('sentences', [])]  # 문장형 기본 미션은 이제 카드 설계 — 빈칸 문장이 없다
    for field, text, limit in said:
        why = (f'{len(text)}자 > {limit}자' if len(text) > limit else None) or _text_problem(text) or \
            _sentence_problem(text) or _plain_problem(text) or (field == 'brief' and _brief_problem(text))
        t(f"{m['id']} {field}: {text}", not why, why)

print(f'\n{"FAIL " + str(fail) if fail else "ALL PASS"}')
sys.exit(1 if fail else 0)
