"""나침반 판단 규칙(api/_compass.py) — LLM 은 가짜로 끼운다.

  uv run -q --with-requirements requirements.txt python test/test_compass.py
"""
import json
import math
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
import _compass as C  # noqa: E402
from _generate import GenerateError  # noqa: E402

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


MISSION = json.load(open(os.path.join(ROOT, 'test/fixtures/mission.json'), encoding='utf-8'))
OPTS = MISSION['define']['options']
TRAP = next(o['v'] for o in OPTS if o['trap'] == 'hardcode')
GOOD = next(o['v'] for o in OPTS if o['trap'] is None)
FIRST, COUNTER = MISSION['inputs'][0]['v'], MISSION['inputs'][2]['v']


def code(c, data, out='', err=None):
    return {'type': 's-code', 'code': c, 'dataId': data, 'output': out, 'error': err}


EVS = [
    {'type': 's-define', 'choice': TRAP, 'reason': ''},
    {'type': 's-redefine', 'from': TRAP, 'to': GOOD, 'reason': '개수가 달라져도 되어야 해서'},
    {'type': 's-design', 'define': GOOD, 'cards': ['a'], 'pipelineId': 'x'},
    code('print(1', FIRST, '', 'SyntaxError'),
    code('print(1)', FIRST, '1'),
    code('print(2)', COUNTER, '2'),
    {'type': 's-code-judge', 'verdict': 'ok', 'basis': '반례에서도 2가 나와서'},
]


def kinds(fs):
    return {f['kind'] for f in fs}


def ck(**ok):
    """점수 시험용 checks — 이름을 준 칸만 예."""
    return {k: {'ok': k in ok, 'quote': ''} for k in C.ITEMS}


def row(n=0, e=0, s=0, w=0, td=None):
    """N/E/S/W 점수가 정확히 그 값이 되는 행."""
    on = [d + str(i + 1) for d, v in zip('NESW', (n, e, s, w)) for i in range(v)]
    return {'checks': ck(**{k: 1 for k in on}), 'teacher_dir': td}


def near(a, b):
    return a is not None and abs(a - b) < 0.01


SAME = [code('print(2)', FIRST, '2'), code('print(2)', COUNTER, '2')]
SOK = [code('print(1)', FIRST, '1'), code('print(1)', COUNTER, '7')]
# 코드 8항목 — 반드시 예/아니오가 갈리는 기록으로
cc = C.code_checks(EVS, MISSION)
t('N1 골랐다 바꾼 것 포함', cc['N1']['ok'] and C.code_checks([EVS[0]], MISSION)['N1']['ok'] is False, cc['N1'])
t('N1 good → trap 으로 바꾸면 아니오', not C.code_checks([{'type': 's-define', 'choice': GOOD}, {'type': 's-redefine', 'to': TRAP}], MISSION)['N1']['ok'])
t('N1 처음부터 trap 아닌 것', C.code_checks([{'type': 's-define', 'choice': GOOD}], MISSION)['N1']['ok'])
t('E1 설계 카드', cc['E1']['ok'] and not C.code_checks([], MISSION)['E1']['ok'])
t('E1 s-method 도 설계', C.code_checks([{'type': 's-method', 'cards': ['a']}], MISSION)['E1']['ok'])
t('E3 에러 뒤 설계 안 고침 → 아니오', not cc['E3']['ok'], cc['E3'])
t('E3 에러 뒤 s-remethod → 예', C.code_checks([code('x(', FIRST, '', 'E'), {'type': 's-remethod', 'toCards': ['b']}], MISSION)['E3']['ok'])
t('E3 반례가 깨진 뒤(같은 출력) s-remethod → 예', C.code_checks(SAME + [{'type': 's-remethod', 'toCards': ['b']}], MISSION)['E3']['ok'])
t('E3 반례가 안 깨졌으면 아니오', not C.code_checks(SOK + [{'type': 's-remethod', 'toCards': ['b']}], MISSION)['E3']['ok'])
t('E3 에러 전 설계만이면 아니오', not C.code_checks([{'type': 's-design'}, code('x(', FIRST, '', 'E')], MISSION)['E3']['ok'])
t('S1 에러 없는 실행', cc['S1']['ok'] and not C.code_checks([code('x(', FIRST, '', 'E')], MISSION)['S1']['ok'])
t('S2 에러 뒤 고쳐 다시 → 예', cc['S2']['ok'])
t('S2 에러 뒤 그대로 → 아니오', not C.code_checks([code('x(', FIRST, '', 'E'), code('x(', FIRST, '', 'E')], MISSION)['S2']['ok'])
t('S2 에러 한 번도 없으면 예', C.code_checks([code('print(1)', FIRST, '1')], MISSION)['S2']['ok'])
t('S3 같은 코드·다른 결과 → 예', C.code_checks(SOK, MISSION)['S3']['ok'])
PRB = {'type': 's-probe', 'sig': C.sig('print(2)'), 'outs': [{'dataId': FIRST, 'output': '2'}, {'dataId': COUNTER, 'output': '2'}], 'uses': []}
t('S3 hardcode 신호 → 아니오', not C.code_checks(SAME + [PRB], MISSION)['S3']['ok'])
t('S3 반례를 안 돌렸으면 아니오', not C.code_checks(SAME[:1], MISSION)['S3']['ok'])
t('S3 반례에서 에러 → 아니오', not C.code_checks([code('print(1)', FIRST, '1'), code('print(1)', COUNTER, '', 'E')], MISSION)['S3']['ok'])
t('W1 반례 자료를 돌렸다', cc['W1']['ok'] and not C.code_checks(SAME[:1], MISSION)['W1']['ok'])
t('W3 반례가 깨진 뒤 코드 고침 → 예', C.code_checks(SAME + [code('print(3)', COUNTER, '3')], MISSION)['W3']['ok'])
t('W3 깨지지 않았으면 고쳐도 아니오', not C.code_checks(SOK + [code('print(3)', COUNTER, '3')], MISSION)['W3']['ok'])
t('W3 반례 에러 뒤 성공 조건 바꿈 → 예', C.code_checks([code('x(', COUNTER, '', 'E'), {'type': 's-redefine', 'to': GOOD}], MISSION)['W3']['ok'])
t('W3 깨진 뒤 그대로 → 아니오', not C.code_checks(SAME, MISSION)['W3']['ok'])
t('빈 기록·이상한 미션에도 안 죽음', all(not v['ok'] for k, v in C.code_checks([], {}).items() if k not in ('S2',)) and C.code_checks([None, 3], None) is not None)
t('코드 항목 8개', set(cc) == set(C.CODE_ITEMS))

# AI 항목 — quote 가 기록에 글자 그대로 있어야 예
EV2 = EVS + [{'type': 's-tutor', 'question': '성공 조건은 개수가 달라도 되는 거 맞나요?'}]
EV2[2] = {**EV2[2], 'reason': '먼저 나누고 그다음에 센다'}
TUT = C.tutor_items(EV2)
good_items = {'N2': {'ok': True, 'quote': 'print(2)'}, 'N3': {'ok': True, 'quote': '개수가 달라도 되는 거 맞나요'},
              'E2': {'ok': True, 'quote': '먼저 나누고   그다음에 센다'}, 'W2': {'ok': True, 'quote': '반례에서도 2가 나와서'}}
ai, td = C.vet({'items': good_items, 'tutor': [{'id': 't1', 'dir': 'N'}]}, EV2)
t('quote 가 기록에 있으면 예(공백 정규화)', all(v['ok'] for v in ai.values()) and ai['E2']['quote'] == '먼저 나누고 그다음에 센다', ai)
t('튜터 분류 개수', td == {'N': 1, 'E': 0, 'S': 0, 'W': 0}, td)
for k, q in (('N2', 'print(99)'), ('N3', '개수가 달라도 되는 거 맞나요 없는 말'), ('E2', '지어낸 설계 이유'), ('W2', '지어낸 근거')):
    ai, _ = C.vet({'items': {**good_items, k: {'ok': True, 'quote': q}}}, EV2)
    t(k + ' quote 가 기록에 없으면 아니오 · quote 비움', ai[k] == {'ok': False, 'quote': ''}, ai[k])
t('W2 quote 가 마무리 문장(s-wrap)에만 있으면 아니오', not C.vet({'items': {'W2': {'ok': True, 'quote': '마무리 말'}}}, [{'type': 's-code-judge', 'basis': '다른 말'}, {'type': 's-wrap', 'text': '마무리 말'}])[0]['W2']['ok'])
t('quote 를 다른 항목의 기록에서 찾아도 아니오', not C.vet({'items': {**good_items, 'N3': {'ok': True, 'quote': 'print(2)'}}}, EV2)[0]['N3']['ok'])
t('ok=false 면 quote 가 있어도 아니오', not C.vet({'items': {**good_items, 'N2': {'ok': False, 'quote': 'print(2)'}}}, EV2)[0]['N2']['ok'])
t('"." 같은 quote 는 아니오', not C.vet({'items': {'W2': {'ok': True, 'quote': '.'}}}, [{'type': 's-code-judge', 'basis': '.'}])[0]['W2']['ok'])
for bad in (None, 'x', [], {'items': 3}, {'items': {'N2': 'ok'}}, {'items': {'N2': {'ok': 'true', 'quote': 'print(2)'}}}):
    t('이상한 답 %r 에 안 죽고 모두 아니오' % (str(bad)[:20],), not any(v['ok'] for v in C.vet(bad, EV2)[0].values()))
_, td = C.vet({'items': {}, 'tutor': [{'id': 't1', 'dir': 'X'}, {'id': 't9', 'dir': 'N'}, {'id': 't1', 'dir': None}, 5]}, EV2)
t('튜터 분류: 없는 id · 이상한 방향 · 미분류(null)는 세지 않음', td == {'N': 0, 'E': 0, 'S': 0, 'W': 0}, td)
ts = C.tutor_items([{'type': 's-tutor', 'question': 'q%d' % i} for i in range(25)])
t('tutor 최근 20개', len(ts) == 20 and ts[0] == {'id': 't1', 'q': 'q5'} and ts[-1]['q'] == 'q24', ts[:1])

# score
t('score 충족 개수', C.score(ck(N1=1, N2=1, E1=1, S1=1, S2=1, S3=1)) == {'N': 2, 'E': 1, 'S': 3, 'W': 0})
t('score 1차 행(checks 없음) → None', C.score(None) is None and C.score({}) is None and C.score('x') is None)
t('score ok 가 true 가 아니면 아니오', C.score({'N1': {'ok': 'yes'}, 'N2': {'ok': 1}, 'N3': 5}) == {'N': 0, 'E': 0, 'S': 0, 'W': 0})

# 누적 — 가중 평균
def cum(*rows):
    return C.cumulative(list(rows))


t('가중치 상수', C.WEIGHTS == [1.0, 0.85, 0.7, 0.55, 0.4] and C.CANCEL == 0.5)
c = cum(row(n=3))
t('1개: N3 → 0도 · 최대 길이', c['n'] == 1 and c['dir'] == 'N' and near(c['needle_deg'], 0) and near(c['length'], C.MAX_LEN) and not c['cancel'], c)
c = cum(row(e=3))
t('1개: E3 → 90도', near(c['needle_deg'], 90) and c['dir'] == 'E')
c = cum(row(n=1, e=1))
t('길이는 크기 비례 · 최소 25% 이상', C.MIN_LEN < c['length'] < C.MAX_LEN and near(c['needle_deg'], 45), c)
c = cum(row(n=3), row(e=3))   # (0.0*1 + 3*.85)/1.85 , (3*1+0)/1.85
x, y = 3 * 0.85 / 1.85, 3 / 1.85
t('2개: 가중 평균 각도', near(c['needle_deg'], math.degrees(math.atan2(x, y))) and c['dir'] == 'N', c)
rows = [row(n=3), row(e=3), row(s=3), row(w=3), row(n=3)]
tw = sum(C.WEIGHTS)
x = (3 * .85 - 3 * .55) / tw
y = (3 * 1 - 3 * .7 + 3 * .4) / tw
c = C.cumulative(rows)
t('5개: 모두 반영', c['n'] == 5 and near(c['needle_deg'], math.degrees(math.atan2(x, y)) % 360), (c, x, y))
c6 = C.cumulative(rows + [row(w=3)] * 3)
t('6개째부터는 빠진다', c6 == c, c6)
t('3·4개도 같은 순서', C.cumulative(rows[:3])['n'] == 3 and C.cumulative(rows[:4])['n'] == 4)
t('최신이 가장 세다', cum(row(n=3), row(s=1))['dir'] == 'N' and cum(row(s=3), row(n=1))['dir'] == 'S')
t('행 없음 → 바늘 없음 · 상쇄 아님', C.cumulative([]) == {'needle_deg': None, 'dir': None, 'length': None, 'cancel': False, 'candidates': [], 'n': 0})
t('1차 행은 건너뛰고 5개를 채운다', C.cumulative([{'levels': {'N': 3}}, {'checks': None}] + rows) == C.cumulative(rows))
t('1차 행뿐이면 자료 없음', C.cumulative([{'levels': {'N': 3, 'E': 0, 'S': 0, 'W': 0}, 'needle_deg': 10}])['n'] == 0)
t('쓰레기 행에도 안 죽음', C.cumulative([None, 3, 'x', {'checks': 'x'}])['n'] == 0 and C.cumulative(None)['n'] == 0)

# 상쇄와 후보
c = cum(row(n=3, s=3))
t('북·남 상쇄 → N/S', c['cancel'] and c['candidates'] == ['N', 'S'] and c['needle_deg'] is None and c['dir'] is None, c)
c = cum(row(e=2, w=2))
t('동·서 상쇄 → E/W', c['cancel'] and c['candidates'] == ['E', 'W'], c)
c = cum(row(n=2, e=2, s=2, w=2))
t('넷 다 같음 → 넷', c['cancel'] and c['candidates'] == ['N', 'E', 'S', 'W'], c)
t('전부 0 → 넷', cum(row())['candidates'] == ['N', 'E', 'S', 'W'])
t('북남이 동서보다 크면 N/S', cum(row(n=3, s=3, e=1, w=1))['candidates'] == ['N', 'S'])
t('크기가 기준 바로 아래면 상쇄, 이상이면 아님', cum(row(n=1))['cancel'] is False and cum(row(n=1), row(s=1), row(s=1))['cancel'] is True)

# 선생님이 고르면 — 그 미션의 벡터를 그 방위 단위벡터 × 3 으로 바꾼다. 상쇄 때는 정중앙
sel = [row(n=3, s=3, td='S')]
c = C.cumulative(sel)
t('선택으로 상쇄가 풀린다 · 정중앙 · 최소 길이', not c['cancel'] and c['dir'] == 'S' and c['needle_deg'] == 180 and c['length'] == C.MIN_LEN, c)
t('선택 재계산이 같다(두 번)', C.cumulative(sel) == C.cumulative(sel) == c)
c = C.cumulative([row(e=2, w=2, td='E'), row(w=3)])
t('선택을 넣으면 상쇄가 되는 경우도 선택 방위의 정중앙', c['dir'] == 'E' and c['needle_deg'] == 90 and c['length'] == C.MIN_LEN, c)
c = C.cumulative([row(n=3, td='N'), row(n=3, s=3)])
t('선택이 있고 상쇄가 아니면 보통 계산(단위벡터 × 3 로 대체)', not c['cancel'] and c['dir'] == 'N' and near(c['needle_deg'], 0) and c['length'] > C.MIN_LEN, c)
c = C.cumulative([row(e=3, w=3), row(n=3, s=3, td='S')])
t('옛 선택은 새 상쇄를 풀지 못한다 → E/W', c['cancel'] and c['candidates'] == ['E', 'W'] and c['dir'] is None, c)
c = C.cumulative([row(n=3, s=3), row(n=3, s=3, td='S')])
t('최신 행에 선택이 없으면 옛 선택도 소용없다', c['cancel'], c)
t('window 는 cumulative 가 쓰는 5개', len(C.window([{'levels': {}}] + [row(n=1)] * 7)) == 5)
t('선택된 행 + 같은 기록 = 항상 같은 답', C.cumulative([row(n=2, e=3, td='W'), row(s=1)]) == C.cumulative([row(n=2, e=3, td='W'), row(s=1)]))
t('잘못된 teacher_dir 은 무시', C.cumulative([row(n=3, s=3, td='X')])['cancel'])

# read — LLM 은 가짜
def fake(*answers):
    calls = []

    def call(messages, schema, timeout):
        calls.append(messages)
        a = answers[min(len(calls), len(answers)) - 1]
        return a if isinstance(a, str) else json.dumps(a, ensure_ascii=False)
    call.calls = calls
    return call


llm = fake('아님', '이것도 아님')
try:
    C.read(EV2, MISSION, llm)
    t('두 번 JSON 아님 → GenerateError', False)
except GenerateError as e:
    t('두 번 JSON 아님 → GenerateError', len(llm.calls) == 2 and str(e) == C.FAIL, e)
llm = fake('아님', {'items': good_items, 'tutor': [{'id': 't1', 'dir': 'N'}]})
r = C.read(EV2, MISSION, llm)
t('재요청에서 살아남 · 12칸 · 순서', len(llm.calls) == 2 and list(r['checks']) == list(C.ITEMS) and r['checks']['N3']['ok'] and r['checks']['N1']['ok'], r)
t('read 가 낸 점수', C.score(r['checks']) == {'N': 3, 'E': 2, 'S': 2, 'W': 2}, C.score(r['checks']))
t('tutor_dirs 가 같이 나온다', r['tutor_dirs'] == {'N': 1, 'E': 0, 'S': 0, 'W': 0} and r['tutor'] == TUT, r)
llm = fake({'items': {k: {'ok': True, 'quote': '없는 문장'} for k in C.AI_ITEMS}})
r = C.read(EV2, MISSION, llm)
t('AI 가 전부 지어내도 AI 4칸은 아니오 · 코드 8칸은 그대로', not any(r['checks'][k]['ok'] for k in C.AI_ITEMS) and r['checks']['S1']['ok'], r)
t('모델 입력에 이름 없음', '학생' not in llm.calls[0][1]['content'])

# hardcode/error 사실 — JS facts.js 와 같은 답
JS = '''
global.window = {};
['hangul','codemission','facts','fold'].forEach(f => require(process.argv[1] + '/js/core/' + f + '.js'));
const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(cases.map(([evs, m]) => {
  const s = window.CC.fold.fold(evs.map((e, i) => Object.assign({t: i + 1}, e)), {id: 's'});
  return window.CC.facts.of(s, m).map(f => f.kind).filter(k => k === 'hardcode' || k === 'error' || k === 'nocounter').sort();
})));
'''
sg = C.sig('print(2)')
c1, c2 = code('print(2)', FIRST, '2'), code('print(2)', COUNTER, '2')
cases = [
    [[c1, c2, {'type': 's-probe', 'sig': sg, 'outs': [{'dataId': FIRST, 'output': '2'}, {'dataId': COUNTER, 'output': '2 '}], 'uses': []}], MISSION],
    [[c1, c2, {'type': 's-probe', 'sig': sg, 'outs': [{'dataId': FIRST, 'output': '2'}, {'dataId': COUNTER, 'output': '3'}], 'uses': []}], MISSION],
    [[c1, c2, {'type': 's-probe', 'sig': sg, 'outs': [{'dataId': FIRST, 'output': '2'}, {'dataId': COUNTER, 'output': '', 'error': 'E'}], 'uses': []}], MISSION],
    [[c1, c2, {'type': 's-probe', 'sig': sg, 'outs': [{'dataId': FIRST, 'output': '2'}, {'dataId': COUNTER, 'output': '2'}], 'uses': []}, code('print(3)', FIRST, '3')], MISSION],
    [[c1], MISSION],
    [[], MISSION],
    [[code('print("가😀")', FIRST, '1'), {'type': 's-probe', 'sig': C.sig('print("가😀")'), 'outs': [{'dataId': FIRST, 'output': '1'}, {'dataId': COUNTER, 'output': '1'}], 'uses': []}], MISSION],
]
js = json.loads(subprocess.run(['node', '-e', JS, ROOT], input=json.dumps(cases), capture_output=True, text=True, check=True).stdout)
py = [sorted(C.hard_kinds(e, m)) for e, m in cases]
t('hardcode/error 사실이 JS 와 같다', js == py, (js, py))
t('JS 가 hardcode 를 실제로 잡는 사례 포함', ['hardcode'] in js and ['error'] in js)

junk = [{'type': 's-code', 'code': 'x', 'dataId': FIRST}, {'type': 's-probe', 'sig': C.sig('x'), 'outs': [1, None, 'a', {'dataId': FIRST, 'output': '1'}]}]
try:
    ok = C.hard_kinds(junk, {'inputs': [None, 3, {'v': FIRST}, {'v': COUNTER, 'counter': True}]}) is not None and C.code_checks(junk, {'inputs': [None, 'x']}) is not None and C.corpora(junk) is not None
except Exception as e:
    ok = repr(e)
t('학생이 보낸 쓰레기(dict 아닌 outs·inputs)에도 안 죽는다', ok is True, ok)


# 부채꼴 이름은 JS(CC.compass.dirOf) 와 같은 규칙이다
DEGS = [0, 44.9, 45, 134.9, 135, 224.9, 225, 314.9, 315, 359.9, None]
jd = json.loads(subprocess.run(['node', '-e', "global.window={};require(process.argv[1]+'/js/core/compass.js');var d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify(d.map(function(x){return window.CC.compass.dirOf(x)})))", ROOT],
                               input=json.dumps(DEGS), capture_output=True, text=True, check=True).stdout)
pd = [None if d is None else C._sector(d) for d in DEGS]
t('부채꼴 이름이 JS 와 같다', jd == pd, (jd, pd))

# 앞의 REST 호출로 시간이 다 갔으면 LLM 을 부르지 않고 깔끔히 실패한다 (0초짜리 호출 금지)
called = []
try:
    C.read([], {}, call_llm=lambda *a: called.append(a), t0=0, now=lambda: 23)
    t('시간 없음 → GenerateError', False)
except GenerateError:
    t('시간 없음 → LLM 안 부르고 GenerateError', not called, called)

print('\nFAIL ' + str(fail) if fail else '\nOK')
sys.exit(1 if fail else 0)
