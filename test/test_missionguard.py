"""생성 미션 검사기(api/_schema.py) 검증.

docs/llm.md 7절대로 통과해야 하는 것보다 **막아야 하는 것을 더 많이** 넣는다.
이 검사기의 일은 통과시키는 게 아니라 막는 것이다.

  uv run --with-requirements requirements.txt python test/test_missionguard.py
"""
import copy
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'api'))
from pydantic import ValidationError  # noqa: E402
from _schema import MissionDraft, failed_fields  # noqa: E402

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra))


def check(m):
    try:
        MissionDraft.model_validate({'mission': m})
        return {}
    except ValidationError as e:
        return failed_fields(e)


def S(*pairs):
    return [{'template': tpl, 'slot': slot} for slot, tpl in pairs]


def base(pid, data, counter, options, sentences, **extra):
    m = {'pipelineId': pid, 'title': '급식 재료 확인', 'situation': '우리 반이 급식 당번이에요.',
         'brief': '이번 주 급식 재료 목록을 확인해 주세요.', 'itemName': '재료',
         'data': [{'name': '월요일 재료', 'items': data[0]}, {'name': '화요일 재료', 'items': data[1]}],
         'counter': counter, 'options': options, 'sentences': sentences}
    m.update(extra)
    return m


def opts(hard, key):
    return [{'v': hard + ' 나오면 성공', 'trap': 'hardcode'},
            {'v': '어떤 목록이 와도 맞는 답이 나오면 성공', 'trap': None, 'key': key},
            {'v': '에러 안 나면 성공', 'trap': 'luck'}]


SEP_STEP = ('sep', '목록을 {sep} 기준으로 본다.')

GOOD = {
    'split-unique-count': base(
        'split-unique-count', [['밥', '우유', '김치'], ['빵', '국', '떡']],
        {'name': '수요일 재료', 'text': '밥,우유,김치,밥,국', 'axis': 'count'}, opts('3이', 'unique'),
        S(SEP_STEP, ('dedup', '같은 재료는 {dedup}.'), ('output', '{output}을 보여준다.'))),
    'split-filter-count': base(
        'split-filter-count', [['밥', '우유', '김치'], ['빵', '달걀', '국', '우유']],
        {'name': '수요일 재료', 'text': '밥 우유 김치 달걀', 'axis': 'sep'}, opts('1이', 'filtered_count'),
        S(SEP_STEP, ('cond', '알레르기 목록에 {cond} 것만 본다.')),
        filterTarget=['우유', '달걀'], filterDesc='알레르기 목록'),
    'split-sort-join': base(
        'split-sort-join', [['우유', '밥', '김치'], ['빵', '국', '떡']],
        {'name': '수요일 재료', 'text': '떡,국', 'axis': 'count'}, opts('김치,밥,우유가', 'sorted'),
        S(SEP_STEP, ('dir', '{dir} 늘어놓는다.'), ('joinSep', '{joinSep}로 이어 붙인다.'))),
    'split-num-sum': base(
        'split-num-sum', [['1000', '2000', '500'], ['300', '700', '100']],
        {'name': '수요일 지출', 'text': '', 'axis': 'empty'}, opts('3500이', 'sum'),
        S(SEP_STEP)),
    'split-group': base(
        'split-group', [['우유', '우유', '밥'], ['국', '빵', '국']],
        {'name': '수요일 재료', 'text': '밥,국,빵,떡', 'axis': 'count'}, opts('우유가 2개', 'group'),
        S(SEP_STEP)),
    'split-transform-join': base(
        'split-transform-join', [[' 민수', '지우 ', '현우'], ['서연', ' 도윤', '하은']],
        {'name': '3반 신청', 'text': '가은 ,  나래', 'axis': 'invisible'}, opts('민수,지우,현우가', 'transformed'),
        S(SEP_STEP, ('op', '이름마다 {op}.'), ('joinSep', '{joinSep}로 이어 붙인다.'))),
    'split-filter-num-sum': base(
        'split-filter-num-sum', [['1000', '메모', '2000'], ['300', '간식', '700']],
        {'name': '수요일 기록', 'text': '메모,간식', 'axis': 'empty'}, opts('3000이', 'filtered_sum'),
        S(SEP_STEP, ('cond', '숫자가 아닌 항목은 {cond}.')),
        filterTarget=['메모', '간식'], filterDesc='메모 항목'),
}

print('\n[통과해야 하는 것 — 유형마다 하나]')
for pid, m in GOOD.items():
    r = check(m)
    t(pid, not r, r)


def broken(pid, why, edit, field):
    m = copy.deepcopy(GOOD[pid])
    edit(m)
    r = check(m)
    t(f'[{field}] {why}', field in r, r or '통과해버림')


def setp(path, value):
    def f(m):
        cur = m
        for k in path[:-1]:
            cur = cur[k]
        cur[path[-1]] = value
    return f


print('\n[막아야 하는 것]')
U, F = 'split-unique-count', 'split-filter-count'
broken(U, '칭찬', setp(['situation'], '정말 잘했어요.'), 'situation')
broken(U, '반말 brief', setp(['brief'], '급식 재료 좀 세어봐.'), 'brief')
broken(U, "학생을 '너'라고 부름", setp(['brief'], '너 이거 정리해 주세요.'), 'brief')
broken(U, 'brief 가 답을 암시', setp(['brief'], '중복을 빼고 세어 주세요.'), 'brief')
broken(U, '두 문장', setp(['brief'], '목록이 왔어요. 확인해 주세요.'), 'brief')
broken(U, '괄호 덧붙임', setp(['situation'], '급식 당번이에요(이번 주만).'), 'situation')
broken(U, '줄표 덧붙임', setp(['options', 1, 'v'], '맞는 답 — 몇 개든 나오면 성공'), 'options')
broken(U, "'예를 들어' 부연", setp(['brief'], '예를 들어 재료를 확인해 주세요.'), 'brief')
broken(U, '요청이 40자 넘음', setp(['brief'], '이번 주 월요일부터 금요일까지 급식에 들어간 재료 목록을 전부 확인해 주세요.'), 'brief')
broken(U, '한자 섞임', setp(['title'], '給食 재료'), 'title')
broken(U, '코드 조각', setp(['situation'], 'items.split(",") 해요.'), 'situation')
broken(U, '반례가 첫 자료와 결과가 같음', setp(['counter', 'text'], '빵,국,떡,빵'), 'counter')
broken(U, 'axis=sep 인데 쉼표만 있음', setp(['counter'], {'name': 'x', 'text': '밥,우유', 'axis': 'sep'}), 'counter')
broken(U, 'axis=invisible 인데 공백 없음', setp(['counter'], {'name': 'x', 'text': '밥,우유', 'axis': 'invisible'}), 'counter')
broken(U, 'axis=empty 인데 결과가 있음', setp(['counter'], {'name': 'x', 'text': '밥', 'axis': 'empty'}), 'counter')
broken(U, 'hardcode 함정에 실제 결과값이 없음', setp(['options', 0, 'v'], '7이 나오면 성공'), 'options')
broken(U, 'luck 함정 없음', lambda m: m['options'].pop(2), 'options')
broken(U, '진짜 성공 조건 없음', setp(['options', 1, 'trap'], 'luck'), 'options')
broken(U, '정답 보기에 방법이 적힘', setp(['options', 1, 'v'], '쉼표로 나눈 개수가 나오면 성공'), 'options')
broken(U, '유형에 없는 정답 key', setp(['options', 1, 'key'], 'sorted'), 'options')
broken(U, '빈칸 밖에 보기 값 노출', setp(['sentences', 1, 'template'], '같은 재료는 하나만 남긴다 {dedup}.'), 'sentences')
broken(U, '빈칸 표시 없음', setp(['sentences', 0, 'template'], '목록을 기준으로 본다.'), 'sentences')
broken(U, '유형에 없는 빈칸 이름', setp(['sentences', 0, 'slot'], 'cond'), 'sentences')
broken(U, '자료 항목에 플레이스홀더', setp(['data', 0, 'items'], ['항목1', '항목2', '항목3']), 'data')
broken(U, '자료 항목 안에 쉼표', setp(['data', 0, 'items'], ['밥,국', '우유', '김치']), 'data')
broken(U, '자료가 2개가 아님', lambda m: m['data'].pop(), 'data')
broken(U, '유형 태그가 없는 유형', setp(['pipelineId'], 'split-count'), 'pipelineId')
broken(F, '걸러낼 대상이 자료에 없음', setp(['filterTarget'], ['땅콩', '새우']), 'data')
broken('split-num-sum', '합계 유형에 숫자 아닌 항목', setp(['data', 0, 'items'], ['1000', '메모', '500']), 'data')
broken('split-transform-join', '정리 유형인데 공백 항목 없음',
       setp(['data'], [{'name': 'a', 'items': ['민수', '지우', '현우']}, {'name': 'b', 'items': ['서연', '도윤', '하은']}]), 'data')
broken('split-group', '묶어 세기인데 겹치는 항목 없음',
       setp(['data'], [{'name': 'a', 'items': ['밥', '국', '빵']}, {'name': 'b', 'items': ['떡', '김치', '우유']}]), 'data')

print('\n[사유를 한 번에 전부 낸다 — 재요청은 한 번뿐이다]')
m = copy.deepcopy(GOOD[U])
m['brief'] = '세어봐'
m['counter']['text'] = '빵,국,떡,빵'
m['options'][0]['v'] = '7이 나오면 성공'
r = check(m)
t('brief · counter · options 가 함께 나온다', {'brief', 'counter', 'options'} <= set(r), r)
m['situation'] = '가' * 50
r = check(m)
t('글자 수가 넘는 칸이 있어도 나머지 사유가 함께 나온다', {'situation', 'counter', 'options'} <= set(r), r)

print('\n[LLM 에 넘기는 스키마]')
schema = MissionDraft.model_json_schema()
t('최상위가 객체', schema.get('type') == 'object')
t('유형 7개가 모두 들어 있음', len(schema['properties']['mission']['oneOf']) == 7)
t('description 이 생성 지시로 들어감', 'description' in schema['$defs']['Counter']['properties']['axis'])

print('\n[우리가 손으로 쓴 미션 문장도 같은 규칙 — 모델에게만 시킬 수는 없다]')
import json  # noqa: E402
import subprocess  # noqa: E402
from _schema import _LIMIT, _brief_problem, _plain_problem, _sentence_problem, _text_problem  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ours = json.loads(subprocess.run(
    ['node', '-e', 'global.window={};require(process.argv[1]);'
     'process.stdout.write(JSON.stringify(window.CC.SENTENCE_MISSIONS))',
     os.path.join(ROOT, 'js/core/missions.js')],
    capture_output=True, text=True, check=True).stdout)
for m in ours:
    said = [('brief', m['brief'], _LIMIT['brief']),
            ('define.q', m['define']['q'], _LIMIT['brief'])]
    said += [('options', o['v'], _LIMIT['options']) for o in m['define']['options']]
    said += [('sentences', s['template'], _LIMIT['sentences']) for s in m['method']['sentences']]
    for field, text, limit in said:
        why = (f'{len(text)}자 > {limit}자' if len(text) > limit else None) or _text_problem(text) or \
            _sentence_problem(text) or _plain_problem(text) or (field == 'brief' and _brief_problem(text))
        t(f"{m['id']} {field}: {text}", not why, why)

print(f'\n{"FAIL " + str(fail) if fail else "ALL PASS"}')
sys.exit(1 if fail else 0)
