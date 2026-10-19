"""미션 생성 흐름(api/_generate.py) 검증 — LLM 은 가짜로 바꿔 끼운다.

  uv run --with-requirements requirements.txt python test/test_generate.py
"""
import copy
import importlib.util
import io
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
import _generate  # noqa: E402
from _generate import GenerateError, by_keyword, generate  # noqa: E402
from _pipeline import run  # noqa: E402
from _schema import KEY_TARGET, SPEC  # noqa: E402

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


def fake(pid, *drafts):
    """첫 호출엔 유형을, 그다음엔 초안을 차례로 답하는 가짜 LLM."""
    calls = []

    def call(messages, schema, timeout):
        calls.append({'messages': copy.deepcopy(messages), 'schema': schema, 'timeout': timeout})
        if len(calls) == 1:
            return json.dumps({'pipelineId': pid})
        a = drafts[len(calls) - 2]
        return a if isinstance(a, str) else json.dumps(a, ensure_ascii=False)
    call.calls = calls
    return call


def quiet(fn, *a):
    err, sys.stderr = sys.stderr, io.StringIO()
    try:
        return fn(*a), sys.stderr.getvalue()
    finally:
        sys.stderr = err


def base(d1, d2, **extra):
    m = {'title': '급식 재료 확인', 'brief': '이번 주 재료 목록을 확인해 주세요.',
         'situation': '우리 반이 급식 당번이에요.', 'itemName': '재료',
         'data': [{'name': '민지 메모', 'items': d1}, {'name': '준호 메모', 'items': d2}]}
    m.update(extra)
    return m


FT = {'filterTarget': ['우유', '달걀', '땅콩'], 'filterDesc': '알레르기 목록'}
NUM = (['1000', '2000', '500'], ['300', '700', '100'])
DATA = {  # 자료만 있는 초안 — 나머지 칸은 기본 틀이 채운다
    'split-count': base(['밥', '우유', '김치'], ['빵', '국', '떡']),
    'split-unique-count': base(['밥', '우유', '김치'], ['빵', '국', '떡']),
    'split-filter-count': base(['밥', '우유', '김치'], ['빵', '달걀', '국', '우유'], **FT),
    'split-filter-join': base(['밥', '우유', '김치'], ['빵', '달걀', '국', '우유'], **FT),
    'split-filter-unique-count': base(['밥', '우유', '우유'], ['빵', '달걀', '우유'], **FT),
    'split-sort-join': base(['우유', '밥', '김치'], ['빵', '국', '떡']),
    'split-filter-sort-join': base(['우유', '밥', '달걀'], ['빵', '달걀', '우유'], **FT),
    'split-transform-join': base([' 민수', '지우 ', '현우'], ['서연', ' 도윤', '하은']),
    'split-transform-unique-count': base([' 민수', '지우 ', '민수'], ['서연', ' 도윤', '하은']),
    'split-num-sum': base(*NUM),
    'split-num-max': base(*NUM),
    'split-num-min': base(*NUM),
    'split-group': base(['우유', '우유', '밥'], ['국', '빵', '국']),
    'split-filter-num-sum': base(['1000', '메모', '2000'], ['300', '간식', '700'],
                                 filterTarget=['메모', '간식'], filterDesc='메모 항목'),
}
t('평가 셋이 14개 유형을 모두 덮는다', set(DATA) == set(SPEC))

U = 'split-unique-count'
GOOD = {**DATA[U], 'brief': '이번 주 재료가 모두 몇 가지인지 알려 주세요.',
        'counter': {'name': '서연 메모'}}

print('\n[한 번에 통과]')
llm = fake(U, GOOD)
m, _ = quiet(generate, '리스트', '중복', llm)
t('유형 고르기 + 초안 = 두 번 불린다', len(llm.calls) == 2)
t('초안 스키마에 성공 조건·방법 칸이 없다 — 코드가 쓴다',
  'pipelineId' in json.dumps(llm.calls[0]['schema'])
  and '"goals"' not in json.dumps(llm.calls[1]['schema']) and '"sentences"' not in json.dumps(llm.calls[1]['schema']))
t('폴백 없음 · 재요청 없음 · LLM 이 고름',
  m['guard'] == {'fallback': [], 'reasons': {}, 'retried': 0, 'picked': 'llm', 'repaired': []}, m['guard'])
t('학생 화면 모양 — 자료 3개, 마지막이 반례', [i['id'] for i in m['inputs']] == ['d01', 'd02', 'd03']
  and m['inputs'][2].get('counter') is True, m['inputs'])
t('미션에 method 가 없다 — 카드는 화면이 pipelineId 로 꺼낸다', 'method' not in m and m['pipelineId'] == U)
t('성공 조건 보기는 코드 문장: 요청이 묻는 진짜 하나 + 함정 둘',
  sorted(o.get('key') or o['trap'] for o in m['define']['options']) == ['hardcode', 'luck', 'unique'], m['define'])
traps = sorted(str(o['trap']) for o in m['define']['options'])
t('보기 = 하드코딩 1 + 진짜 1 + 요행 1', traps == ['None', 'hardcode', 'luck'], m['define']['options'])
hard = next(o['v'] for o in m['define']['options'] if o['trap'] == 'hardcode')
t('하드코딩 함정은 어느 자료의 답인지 밝힌다', hard == '민지 메모의 답과 같은 3이 나오면 성공', hard)
t('보기는 모두 "성공" 으로 끝난다', all(o['v'].endswith('성공') for o in m['define']['options']), m['define']['options'])
t('함정 보기에는 key 가 없다', all('key' not in o for o in m['define']['options'] if o['trap']))
t('성공 질문은 존댓말', m['define']['q'].endswith('요?'))

print('\n[틀렸다가 고쳐 옴]')
bad = copy.deepcopy(GOOD)
bad['brief'] = '재료 좀 세어봐'
llm = fake(U, bad, GOOD)
m, log = quiet(generate, '리스트', '중복', llm)
t('세 번 불린다 (유형 · 초안 · 재요청)', len(llm.calls) == 3)
t('재요청에 칸별 사유가 들어간다', 'brief' in llm.calls[2]['messages'][-1]['content']
  and '반말' in llm.calls[2]['messages'][-1]['content'])
t('재요청에 처음 답이 들어간다', llm.calls[2]['messages'][-2]['role'] == 'assistant')
t('고쳐 왔으니 폴백 없음', m['guard']['fallback'] == [] and m['guard']['retried'] == 1, m['guard'])
t('처음 사유는 서버 로그에 남는다', '1차 사유' in log and 'brief' in log, log)

print('\n[두 번 다 틀림 → 틀린 칸만 기본 틀로]')
bad = copy.deepcopy(GOOD)
bad['brief'] = '재료 목록을 정리해 주세요.'  # 구할 값이 없다
m, _ = quiet(generate, '리스트', '중복', fake(U, bad, bad, bad))
t('brief 만 바뀐다', m['guard']['fallback'] == ['brief'], m['guard'])
t('요청 기본 틀에는 구할 값이 있다', '몇' in m['brief'], m['brief'])
t('맞았던 칸은 LLM 것 그대로', m['title'] == GOOD['title'])
t('반례 이름은 LLM 것, 자료는 코드가 만든다', m['inputs'][2]['name'] == GOOD['counter']['name']
  and 'counter' not in m['guard']['fallback'], m['inputs'][2])

print('\n[빠진 칸을 채운 뒤에야 드러나는 칸도 갈아 끼운다]')
hidden = {**DATA[U], 'brief': '재료 좀 세어봐'}  # 빠진 칸 때문에 1차엔 brief 가 안 보인다
try:
    m, _ = quiet(generate, '수업', '핵심', fake(U, hidden, hidden, hidden))
    t('빠진 칸 다음에 brief 까지', m['guard']['fallback'][-1] == 'brief'
      and m['brief'] != hidden['brief'], m['guard'])
except GenerateError as e:
    t('빠진 칸 다음에 brief 까지', False, e.reasons)

print('\n[자료만 맞으면 나머지 기본 틀이 14개 유형 모두 검사를 통과하고, 코드가 만든 반례가 실제로 깨진다]')
for pid, d in DATA.items():
    try:
        m, _ = quiet(generate, '수업', '핵심', fake(pid, d, d, d))
        first_key = next(iter(SPEC[pid]['keys']))
        ok = re.search(KEY_TARGET[first_key], m['brief'])  # 기본 틀로 바뀌었든 아니든 최종 요청에 구할 값이 있다
        # 학생 화면에서 정말로 깨지는가 — 정답 빈칸으로 돌리면 반례 결과가 첫 자료와 달라야 한다
        slots = next(iter(SPEC[pid]['keys'].values()))
        params = m.get('pipelineParams', {})
        r1, rc = (run(pid, slots, params, m['inputs'][i]['v']) for i in (0, 2))
        t(pid, ok and not r1['err'] and not rc['err'] and r1['value'] != rc['value'], (m['guard'], r1, rc))
    except GenerateError as e:
        t(pid, False, e.reasons)

print('\n[자료가 틀리면 두 번까지 다시 묻는다 — 자료는 기본 틀이 없다]')
nodata = copy.deepcopy(GOOD)
nodata['data'][0]['items'] = ['항목1', '항목2', '항목3']
llm = fake(U, nodata, nodata, GOOD)
m, _ = quiet(generate, '리스트', '중복', llm)
t('세 번째에 고쳐 오면 생성된다', len(llm.calls) == 4 and m['guard']['retried'] == 2 and not m['guard']['fallback'], m['guard'])

print('\n[재요청이 시간 초과면 이미 받은 초안으로 마무리]')
first = {**GOOD, 'brief': '세어봐'}
def timeout_on_retry(messages, schema, timeout):
    timeout_on_retry.n = getattr(timeout_on_retry, 'n', 0) + 1
    if timeout_on_retry.n == 1:
        return json.dumps({'pipelineId': U})
    if timeout_on_retry.n == 2:
        return json.dumps(first, ensure_ascii=False)
    raise TimeoutError('The read operation timed out')
m, log = quiet(generate, '리스트', '중복', timeout_on_retry)
t('brief 만 기본 틀로 바꾸고 생성', m['guard']['fallback'] == ['brief'] and '재요청 실패' in log, m['guard'])

print('\n[기본 틀은 자기 규칙을 통과한다]')
rude = {**GOOD, 'situation': '간식을 조사했습니다'}  # '~요' 로 안 끝남 → 기본 틀('')로
m, _ = quiet(generate, '리스트', '중복', fake(U, rude, rude, rude))
t("situation 기본 틀('')이 존댓말 규칙에 걸리지 않는다", m['guard']['fallback'] == ['situation'] and m['situation'] == '', m['guard'])

print('\n[자료 보정 — 관계만 고친다]')
nums = {**DATA['split-num-sum'], 'data': [{'name': '월', 'items': ['1,000원', '2000', '500원']},
                                          {'name': '화', 'items': [300, '700', '100']}]}
m, _ = quiet(generate, '형변환', '숫자', fake('split-num-sum', nums, nums, nums))
t('단위·쉼표를 떼고 숫자로 보낸 것도 받는다', m['inputs'][0]['v'] == '1000,2000,500' and m['inputs'][1]['v'] == '300,700,100'
  and m['guard']['repaired'], (m['inputs'][:2], m['guard']))
ft = {**DATA['split-filter-count'], 'filterTarget': ['땅콩', '새우'], 'filterDesc': '알레르기'}
m, _ = quiet(generate, '조건문', '거르기', fake('split-filter-count', ft, ft, ft))
t('걸러낼 대상이 자료에 없으면 넣는다', '땅콩' in m['inputs'][0]['v'] and '새우' in m['inputs'][1]['v'], m['inputs'][:2])
mix = {**DATA['split-filter-num-sum'], 'filterTarget': ['메모']}
m, _ = quiet(generate, '예외', '숫자만', fake('split-filter-num-sum', mix, mix, mix))
t('숫자 걸러내기에서 글자 항목은 걸러낼 대상이 된다', set(m['pipelineParams']['filterTarget']) == {'메모', '간식'},
  m.get('pipelineParams'))
dirty = {**DATA['split-filter-num-sum'], 'filterTarget': [''],
         'data': [{'name': '월', 'items': ['1000', '메모 ', '2000', '']}, {'name': '화', 'items': ['300', ' 간식', '700']}]}
m, _ = quiet(generate, '예외', '숫자만', fake('split-filter-num-sum', dirty, dirty, dirty))
r = run('split-filter-num-sum', next(iter(SPEC['split-filter-num-sum']['keys'].values())), m['pipelineParams'], m['inputs'][0]['v'])
t('빈 항목은 빼고, 공백 붙은 단어도 걸러낸다', r['value'] == 3000 and '' not in m['pipelineParams']['filterTarget'], (r, m['pipelineParams']))
nodup = {**DATA['split-group'], 'data': [{'name': '1반', 'items': ['A형', 'B형', 'O형']}, {'name': '2반', 'items': ['AB형', 'A형', 'B형']}]}
m, _ = quiet(generate, '딕셔너리', '빈도', fake('split-group', nodup, nodup, nodup))
t('묶어 세기에 겹치는 항목이 없으면 하나 더 넣는다', m['inputs'][0]['v'] == 'A형,B형,O형,A형', m['inputs'][0])
hard = next(o['v'] for o in m['define']['options'] if o['trap'] == 'hardcode')
t("묶어 세기 하드코딩 함정은 '1반처럼 A형이 2번 나오면 성공'", hard == '1반처럼 A형이 2번 나오면 성공', hard)
t('보정이 없으면 repaired 는 비어 있다', quiet(generate, '리스트', '중복', fake(U, GOOD))[0]['guard']['repaired'] == [])

print('\n[유형 고르기가 실패하면 키워드로]')
llm = fake('split-없는유형', *[DATA['split-num-max']] * 3)
m, _ = quiet(generate, '리스트에서 가장 큰 값', 'max 함수', llm)
t('없는 유형 → 키워드 규칙', m['pipelineId'] == 'split-num-max' and m['guard']['picked'] == 'keyword', m['guard'])
t('키워드가 없으면 개수 세기', by_keyword('오늘', '수업') == 'split-unique-count')

print('\n[갈아 끼울 틀이 없으면 포기한다]')
bad = copy.deepcopy(GOOD)
bad['data'][0]['items'] = ['항목1', '항목2', '항목3']
for name, answers in [('자료가 세 번 다 틀림', (bad, bad, bad)),
                      ('JSON 이 세 번 다 아님', ('모르겠어요', '정말 모르겠어요', '...'))]:
    try:
        quiet(generate, '수업', '핵심', fake(U, *answers))
        t(name, False, '통과해버림')
    except GenerateError as e:
        t(name, bool(e.reasons), e.reasons)

print('\n[시간이 모자라면 재요청 없이 기본 틀로]')
_generate.DEADLINE, saved = 10, _generate.DEADLINE  # 재요청에 15초가 필요한데 10초뿐
m, _ = quiet(generate, '리스트', '중복', fake(U, {**GOOD, 'brief': '세어봐'}))
_generate.DEADLINE = saved
t('재요청 없이 brief 만 기본 틀', m['guard']['retried'] == 0 and m['guard']['fallback'] == ['brief'], m['guard'])

print('\n[핸들러 — 네트워크 없이 확인할 수 있는 것]')
spec = importlib.util.spec_from_file_location('gm', os.path.join(ROOT, 'api', 'generate-mission.py'))
gm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gm)


def post(body):
    h = gm.handler.__new__(gm.handler)
    raw = json.dumps(body).encode()
    h.rfile, h.wfile = io.BytesIO(raw), io.BytesIO()
    h.headers = {'Content-Length': str(len(raw))}
    h.request_version, h.requestline, h.command = 'HTTP/1.1', 'POST /', 'POST'
    h.client_address, h.server = ('t', 0), None
    h.log_request = lambda *a: None
    h.do_POST()
    head, _, payload = h.wfile.getvalue().partition(b'\r\n\r\n')
    return int(head.split()[1]), json.loads(payload)


t('수업 내용이 없으면 400', post({'keyPoint': 'x'})[0] == 400)
t('핵심이 없으면 400', post({'lesson': 'x'})[0] == 400)
key = os.environ.pop('PICKLE_API_KEY', None)
(code, body), _ = quiet(post, {'lesson': '리스트', 'keyPoint': '중복'})
if key:
    os.environ['PICKLE_API_KEY'] = key
t('키가 없으면 502 와 사람이 읽는 말', code == 502 and '다시 시도' in body['error'], (code, body))

print('\n[진단 분포 → 문제 생성]')
from _generate import level_note  # noqa: E402
_L = lambda **s: {'difficulty': 'easy', 'stages': {'base': 0, 'combine': 0, 'ready': 0, 'hardcode': 0, 'none': 0, **s}}  # noqa: E731
t('None 이면 빈 문장', level_note(None) == '')
t('기초가 가장 많으면 한 가지 개념만', '한 가지 개념만' in level_note(_L(base=5, combine=1)))
t('조합 전이 가장 많으면 두 개념을 엮는', '두 개념을 엮는' in level_note(_L(base=1, combine=4)))
t('hardcode 가 응답자 절반 이상이면 개수 반례', '반례는 항목 개수를 바꾸는 것으로' in level_note(_L(base=2, combine=2, hardcode=2)))
t('절반 미만이면 개수 반례 없음', '항목 개수' not in level_note(_L(base=2, combine=2, hardcode=1, none=9)))
_lv = {'difficulty': 'easy', 'stages': {'base': 5, 'combine': 1, 'ready': 0, 'hardcode': 4, 'none': 2}}
def _try(*a, **k):
    try:
        generate(*a, **k)
    except GenerateError:  # 초안이 일부러 엉터리 — ask 만 보면 된다
        pass


_f = fake('split-unique-count', 'x')
quiet(lambda: _try('리스트', '중복', _f, level=_lv))
t('가짜 LLM 이 받은 ask 에 level_note 가 든다', level_note(_lv) in _f.calls[1]['messages'][1]['content'] and '한 가지 개념만' in _f.calls[1]['messages'][1]['content'])
_f0, _f1 = fake('split-unique-count', 'x'), fake('split-unique-count', 'x')
quiet(lambda: _try('리스트', '중복', _f0)); quiet(lambda: _try('리스트', '중복', _f1, level=None))
t('level 이 None 이면 ask 는 예전과 같다', _f0.calls[1]['messages'][1]['content'] == _f1.calls[1]['messages'][1]['content'] and 'level' not in _f0.calls[1]['messages'][1]['content'] and '난이도' not in _f0.calls[1]['messages'][1]['content'])
_got = {}
_orig = gm.make_mission
gm.make_mission = lambda l, k, **kw: _got.update(kw) or {'ok': 1}
t('이상한 difficulty·stages 는 400 이 아니라 무시', post({'lesson': 'a', 'keyPoint': 'b', 'difficulty': 'x', 'stages': [1]})[0] == 200 and _got['level'] is None, _got)
post({'lesson': 'a', 'keyPoint': 'b', 'difficulty': 'hard', 'stages': {'base': 3, 'ready': 'x', 'none': True}})
t('정수 값만 걸러 level 이 된다', _got['level'] == {'difficulty': 'hard', 'stages': {'base': 3}}, _got)
gm.make_mission = _orig

print('\n[eval 에서 실패한 두 경우]')
_m = {'itemName': '과일', 'data': [{'name': 'a', 'items': ['사과', '배', '사과', '귤']},
                                 {'name': 'b', 'items': ['배', '사과', '배', '귤']}]}
t('두 자료의 개수가 같아도 반례 기본 틀이 나온다', _generate._fallback('counter', 'split-unique-count', _m) is not None)
_d = {'filterTarget': ['1', '2', '3', '4', '5', '6'], 'data': [{'name': 'a', 'items': ['1', '2', '3', '간식']},
                                                              {'name': 'b', 'items': ['4', '5', '메모', '6']}]}
_generate._repair('split-filter-num-sum', _d)
t('숫자 거르기 유형은 걸러낼 대상에서 숫자를 뺀다', _d['filterTarget'] == ['간식', '메모'], _d['filterTarget'])
_d = {'filterTarget': ['숫자', '문자', '우유'], 'data': [{'name': 'a', 'items': ['3', '우유', '5', '빵']},
                                                  {'name': 'b', 'items': ['1', '빵', '2']}]}
_generate._repair('split-filter-num-sum', _d)
t("'숫자'·'문자' 같은 분류 이름은 걸러낼 대상이 아니다", _d['filterTarget'] == ['우유', '빵'], _d['filterTarget'])
_d = {'counter': {'name': '반례 목록'}, 'data': [{'name': 'a', 'items': ['사과', '배', '사과']},
                                              {'name': 'b', 'items': ['배', '사과', '배', '귤']}]}
_generate._make_counter('split-unique-count', _d)
t("반례 이름에 '반례'가 있으면 바꾼다", '반례' not in _d['counter']['name'] and _d['counter']['text'], _d['counter'])

print('\n[게이트웨이 504 는 한 번 다시 보낸다]')
import urllib.error  # noqa: E402


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


_calls = []


def _fake_urlopen(req, timeout):
    _calls.append(timeout)
    if len(_calls) == 1:
        raise urllib.error.HTTPError(req.full_url, 504, 'Gateway Timeout', {}, None)
    return _Resp(json.dumps({'choices': [{'message': {'content': '{"ok":1}'}}]}).encode())


_orig = _generate.urllib.request.urlopen
_generate.urllib.request.urlopen = _fake_urlopen
try:
    t('504 뒤 재시도해서 응답을 받는다', _generate._post({}, 'k', 30) == '{"ok":1}' and len(_calls) == 2, _calls)
    _calls.clear()
    try:
        _generate._post({}, 'k', 3)
        t('남은 시간이 5초 안이면 다시 보내지 않는다', False)
    except urllib.error.HTTPError:
        t('남은 시간이 5초 안이면 다시 보내지 않는다', len(_calls) == 1, _calls)
finally:
    _generate.urllib.request.urlopen = _orig

print('\n[요청에는 구할 값이 있어야 한다]')
from _schema import DRAFTS  # noqa: E402
for brief, ok in [('이번 주 재료가 모두 몇 가지인지 알려 주세요.', True), ('재료 목록을 정리해 주세요.', False)]:
    _, b = _generate._parse(U, {**copy.deepcopy(GOOD), 'brief': brief})
    t(f"'{brief}' → {'통과' if ok else '걸림'}", ('brief' not in b) == ok, b)
for pid in ('split-filter-join', 'split-transform-join'):
    _, b = _generate._parse(pid, {**copy.deepcopy(DATA[pid]), 'brief': '이번 주 재료 목록을 확인해 주세요.'})
    t(f'{pid}: 모호한 "목록을 확인해" 는 걸린다', 'brief' in b, b)
for pid in SPEC:
    k = next(iter(SPEC[pid]['keys']))
    fb = _generate.BRIEF_FALLBACK[k].format(item='재료', iga='가', eunneun='는', eulreul='를')
    t(f'{pid}: 요청 기본 틀이 구할 값 규칙을 지킨다', re.search(KEY_TARGET[k], fb), fb)
    t(f'{pid}: 요청 기본 틀에 항목 이름', '재료' in fb, fb)
_, b = _generate._parse(U, {**copy.deepcopy(GOOD), 'brief': '모두 몇 개인지 알아내 주세요.'})
t("'몇 개인지 알아내 주세요' 처럼 무엇인지 없으면 걸린다", any('항목 이름' in r for r in b.get('brief', [])), b)

print('\n[정답 보기 문장 틀 — 14개 유형 모두 빈칸 없이 채워지고 같은 틀로 끝난다]')
for k, tpl in _generate.CORRECT.items():
    v = tpl.format(item='재료', iga='가', eunneun='는', eulreul='를')
    t(f'{k}: {v}', '{' not in v and v.endswith('나오면 성공'), v)

print('\n[숫자뿐인 자료로 "글자 빼고 더하기" 를 고르면 "숫자 더하기" 로 바꾼다]')
_num = {**base(['1000', '2000', '500'], ['300', '700', '100'], itemName='금액'),
        'brief': '금액을 모두 더하면 얼마인지 알려 주세요.', 'counter': {'name': '서연 금액'},
        'filterTarget': ['메모'], 'filterDesc': '메모 항목'}
m, _ = quiet(generate, '숫자 더하기', 'int로 바꿔서 합계', fake('split-filter-num-sum', _num, _num, _num))
t('유형이 split-num-sum', m['pipelineId'] == 'split-num-sum', m['pipelineId'])
t('걸러낼 대상은 떼고, 바꾼 이유를 남긴다', 'pipelineParams' not in m and 'filterDesc' not in m
  and any('숫자 더하기' in x for x in m['guard']['repaired']), m['guard'])
t('반례도 새 유형으로 깨진다', m['inputs'][2]['v'] and m['guard']['fallback'] == [], m['guard'])

print('\n[골라내기 유형은 걸러낼 대상 이름을 미션에 싣는다 — 카드 세부 이름]')
m, _ = quiet(generate, '수업', '핵심', fake('split-filter-count', *[DATA['split-filter-count']] * 3))
t('filterDesc', m.get('filterDesc') == '알레르기 목록', m.get('filterDesc'))

print('\n[검수 이유를 받아 다시 만들 때 프롬프트에 넣는다]')
llm = fake(U, GOOD)
quiet(lambda: generate('리스트', '중복', llm, feedback=['세 자료가 다른 이야기예요']))
t('feedback 이 사용자 메시지에', '세 자료가 다른 이야기예요' in llm.calls[1]['messages'][-1]['content'])

print('\n[반례 — 모델이 쓴 것을 돌려 보고, 깨지면 쓰고 안 깨지면 코드 후보로]')
own = {**GOOD, 'counter': {'name': '서연 메모', 'text': '국,밥,빵,국,떡', 'axis': 'count'}}
m, _ = quiet(generate, '리스트', '중복', fake(U, own))
t('깨지는 모델 반례는 그대로 쓴다', m['inputs'][2]['v'] == '국,밥,빵,국,떡' and m['guard']['repaired'] == [], (m['inputs'][2], m['guard']))
weak = {**GOOD, 'counter': {'name': '서연 메모', 'text': '빵,국,떡,빵', 'axis': 'count'}}  # 결과 3 = 첫 자료와 같다
m, _ = quiet(generate, '리스트', '중복', fake(U, weak))
first = m['inputs'][0]['v'].split(',')
t('안 깨지는 모델 반례는 코드 후보로 바꾸고 이름은 둔다', m['inputs'][2]['v'] != weak['counter']['text']
  and m['inputs'][2]['name'] == '서연 메모' and any('다시 만들었어요' in x for x in m['guard']['repaired']), (m['inputs'][2], m['guard']))
t('코드 후보는 첫 자료로 그대로 시작하지 않는다', m['inputs'][2]['v'].split(',')[:len(first)] != first, m['inputs'][2])
copied = {**GOOD, 'counter': {'name': '서연 메모', 'text': '밥,우유,김치,빵,국', 'axis': 'count'}}
m, _ = quiet(generate, '리스트', '중복', fake(U, copied))
t('첫 자료를 베끼고 덧붙인 모델 반례도 바꾼다', not m['inputs'][2]['v'].startswith('밥,우유,김치'), m['inputs'][2])
for pid, d in DATA.items():
    items1, items2 = d['data'][0]['items'], d['data'][1]['items']
    for c in _generate._counter_candidates(pid, items1, items2, d.get('filterTarget') or []):
        if not _generate.counter_problems(pid, d['data'], d.get('filterTarget') or [], c):
            t(f'{pid}: 쓰이는 코드 후보가 첫 자료로 시작하지 않는다', [x.strip() for x in c['text'].split(',')][:len(items1)] != [x.strip() for x in items1], c)
            break
t('반례 스키마는 이름·내용·축을 다 묻는다', set(_generate._ask_schema(U)['properties']['counter'].get('required', [])) >= {'name', 'text', 'axis'}
  or set(_generate._ask_schema(U)['$defs']['Counter']['required']) >= {'name', 'text', 'axis'}, _generate._ask_schema(U)['properties']['counter'])

print('\n[자료 이름 — 요일·날짜만 다르면 다시 묻는다]')
day = copy.deepcopy(GOOD)
day['data'][0]['name'], day['data'][1]['name'] = '수요일 간식', '금요일 간식'
llm = fake(U, day, GOOD)
m, log = quiet(generate, '리스트', '중복', llm)
t('요일만 다른 자료 이름은 재요청 사유', len(llm.calls) == 3 and '요일' in llm.calls[2]['messages'][-1]['content'], log)
dayc = {**GOOD, 'counter': {'name': '민지 메모 2일', 'text': '국,밥,빵,국,떡', 'axis': 'count'}}
dayc['data'] = [{'name': '민지 메모 1일', 'items': ['밥', '우유', '김치']}, {'name': '준호 메모', 'items': ['빵', '국', '떡']}]
_, b = _generate._parse(U, copy.deepcopy(dayc))
t('반례 이름이 날짜만 다른 것도 걸린다', 'counter' in b, b)
p = json.dumps(_generate._ask_schema(U), ensure_ascii=False) + _generate.SYSTEM
t('모델에게 주는 글에 요일 예시가 없다', not re.search(r'[월화수목금]요일|다른 날', p), re.findall(r'.{10}(?:요일|다른 날).{10}', p))

print('\n[목적이 있는 요청은 통과한다]')
J = 'split-filter-join'
snack = {'title': '같이 먹을 간식 찾기', 'situation': '지훈이와 서연이가 간식을 같이 사려고 해요. 둘 다 먹을 수 있는 걸로 메뉴를 정해야 해요.',
         'brief': '둘 다 먹을 수 있는 간식을 찾아 메뉴를 정해 주세요.', 'itemName': '간식',
         'filterTarget': ['젤리', '쿠키', '바나나', '우유'], 'filterDesc': '지훈이 간식',
         'data': [{'name': '서연이 쪽지', 'items': ['쿠키', '사탕', '바나나']}, {'name': '하린이 쪽지', 'items': ['초콜릿', '젤리', '과자']}],
         'counter': {'name': '도윤이 쪽지', 'text': '사탕,초콜릿,과자', 'axis': 'empty'}}
_, b = _generate._parse(J, copy.deepcopy(snack))
t('"둘 다 먹을 수 있는 간식을 찾아 메뉴를 정해 주세요." 통과', b == {}, b)
for brief in ['친구들이 모두 되는 간식만 알아내 메뉴를 정해 주세요.', '모두가 함께 먹을 간식을 찾아 주세요.']:
    _, b = _generate._parse(J, {**copy.deepcopy(snack), 'brief': brief})
    t(f"'{brief}' 통과", 'brief' not in b, b)

print('\n[고정 목록에 정답을 미리 넣으면 걸린다]')
leak = {**copy.deepcopy(snack), 'filterTarget': ['쿠키'], 'data': [
    {'name': '서연이 쪽지', 'items': ['쿠키', '사탕', '바나나']}, {'name': '하린이 쪽지', 'items': ['쿠키', '젤리', '과자']}]}
_, b = _generate._parse(J, leak)
t('목록 = 두 자료에 모두 있는 것 → filterTarget', 'filterTarget' in b, b)
leak2 = {**copy.deepcopy(snack), 'filterTarget': ['쿠키', '바나나']}
_, b = _generate._parse(J, leak2)
t('목록 = 한 자료의 답 그대로 → filterTarget', 'filterTarget' in b, b)
try:
    quiet(generate, '집합', '교집합', fake(J, leak, leak, leak))
    t('세 번 다 새면 내보내지 않는다', False, '통과해버림')
except GenerateError as e:
    t('세 번 다 새면 내보내지 않는다', 'filterTarget' in e.reasons, e.reasons)

print('\n[자료 이름이 자료 항목으로 끼어들지 않는다]')
named = {**copy.deepcopy(snack), 'filterTarget': ['서연이 쪽지', '하린이 쪽지']}
m2, b = _generate._parse(J, named)
t('_repair 가 자료 이름을 걸러낼 대상에서 빼고 자료에 넣지 않는다',
  not any(x in ('서연이 쪽지', '하린이 쪽지') for ds in m2['data'] for x in ds['items']) and b, (m2['data'], b))
inname = {**copy.deepcopy(snack)}
inname['data'] = [{'name': '서연이 쪽지', 'items': ['쿠키', '하린이 쪽지', '바나나']}, snack['data'][1]]
_, b = _generate._parse(J, inname)
t('자료 항목이 자료 이름이면 걸린다', any('이름' in r for r in b.get('data', [])), b)

print('\n[기본 모델]')
t("LLM_MODEL 이 없으면 openai/gpt-5.4", subprocess.run(
    [sys.executable, '-c', 'import sys; sys.path.insert(0, "api"); import _generate; print(_generate.MODEL)'],
    cwd=ROOT, capture_output=True, text=True, env={k: v for k, v in os.environ.items() if k != 'LLM_MODEL'}).stdout.strip() == 'openai/gpt-5.4')

print('\n[보내는 스키마 — $ref 없이, 모든 객체가 닫혀 있다]')


def _objs(o):
    if isinstance(o, dict):
        if o.get('type') == 'object':
            yield o
        for v in o.values():
            yield from _objs(v)
    elif isinstance(o, list):
        for v in o:
            yield from _objs(v)


for pid, M in DRAFTS.items():
    f = _generate._flat(M.model_json_schema())
    t(f'{pid}: $ref·$defs 없음', '$ref' not in json.dumps(f) and '$defs' not in json.dumps(f))
    t(f'{pid}: maxLength 는 설명으로 (모델이 그 길이에서 자른다)', 'maxLength' not in json.dumps(f) and '자 안)' in json.dumps(f, ensure_ascii=False))
    t(f'{pid}: 객체마다 additionalProperties false', all(o.get('additionalProperties') is False for o in _objs(f)))

if __name__ == '__main__':
    print(f'\n{"FAIL " + str(fail) if fail else "ALL PASS"}')
    sys.exit(1 if fail else 0)
