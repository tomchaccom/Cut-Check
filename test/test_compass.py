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


# 바늘
def near(a, b):
    return a is not None and abs(a - b) < 0.01


d, s = C.needle({'N': 3, 'E': 2, 'S': 0, 'W': 1}, {})
t('needle N3E2W1', near(d, 18.43) and s == 'N', (d, s))
t('needle E', C.needle({'N': 0, 'E': 3, 'S': 0, 'W': 0}, {}) == (90.0, 'E'))
t('needle 모두 같음 → null', C.needle({'N': 2, 'E': 2, 'S': 2, 'W': 2}, {}) == (None, None))
t('needle 길이 0 → null', C.needle({'N': 1, 'E': 0, 'S': 1, 'W': 0}, {}) == (None, None))
t('needle W', C.needle({'N': 0, 'E': 0, 'S': 0, 'W': 3}, {}) == (270.0, 'W'))
t('needle 45도 → E', C.needle({'N': 1, 'E': 1, 'S': 0, 'W': 0}, {})[1] == 'E')

t('override 부채꼴 안', C.override(18.4, 'N') == 18.4)
t('override 밖 → 정중앙', C.override(18.4, 'E') == 90)
t('override null → 정중앙', C.override(None, 'S') == 180)
t('override 둘 다 없음', C.override(None, None) is None)

# 사실·상한
fs = C.facts(EVS, MISSION)
t('사실 kind', {'trap-fixed', 'fixed-error', 'basis', 'reason', 'design', 'judge', 'counter-clean'} <= kinds(fs), kinds(fs))
t('id 는 f1…', [f['id'] for f in fs] == ['f%d' % (i + 1) for i in range(len(fs))])
cp = C.caps(fs)
t('E 상한 1', cp['E'] == 1, cp)
t('N 3', cp['N'] == 3)
t('빈 이벤트 → 모두 0', C.caps(C.facts([], MISSION)) == {'N': 0, 'E': 0, 'S': 0, 'W': 0})
t('trap 그대로면 trap-avoided 없음', 'trap-avoided' not in kinds(C.facts([{'type': 's-define', 'choice': TRAP, 'reason': 'x'}], MISSION)))
t('trap 아니면 trap-avoided', 'trap-avoided' in kinds(C.facts([{'type': 's-define', 'choice': GOOD, 'reason': ''}], MISSION)))
ts = C.tutor_items([{'type': 's-tutor', 'question': 'q%d' % i} for i in range(25)])
t('tutor 최근 20개', len(ts) == 20 and ts[0] == {'id': 't1', 'q': 'q5'} and ts[-1]['q'] == 'q24', ts[:1])

# vet
fid = {f['kind']: f['id'] for f in fs}
raw = {'levels': {'N': 3, 'E': 3, 'S': 0, 'W': 0}, 'evidence': {'N': ['f99'], 'E': [fid['design']]}, 'ai_note': ''}
v = C.vet(raw, fs, [])
t('없는 근거 → 0', v['levels']['N'] == 0 and v['evidence']['N'] == [], v)
t('상한 깎기', v['levels']['E'] == 1 and v['evidence']['E'] == [fid['design']], v)
t('다른 방향 근거는 버림', C.vet({'levels': {'S': 2}, 'evidence': {'S': [fid['design']]}}, fs, [])['levels']['S'] == 0)
for bad in ('3', True, 5, -1, 2.0, None):
    lv = C.vet({'levels': {'S': bad}, 'evidence': {'S': [fid['run']]}}, fs, [])['levels']['S']
    t('levels %r 거름' % (bad,), lv == 0, lv)
t('정상 단계', C.vet({'levels': {'S': 2}, 'evidence': {'S': [fid['run']]}}, fs, [])['levels']['S'] == 2)
t('튜터 근거는 N 만', C.vet({'levels': {'N': 1}, 'evidence': {'N': ['t1']}}, [f for f in fs if f['dir'] == 'N'][:0] + fs, ts[:1])['levels']['N'] == 1)
t('raw 가 이상해도 안 죽음', C.vet({'levels': 'x', 'evidence': [1]}, fs, [])['levels'] == {'N': 0, 'E': 0, 'S': 0, 'W': 0})
for note, ok in (('반례에서 에러가 났다', True), ('참 잘했어요', False), ('다시 해 보세요', False), ('가' * 61, False), (7, False)):
    n = C.vet({'levels': {}, 'evidence': {}, 'ai_note': note}, fs, [])['ai_note']
    t('ai_note %r' % (str(note)[:12],), (n == note) == ok and (ok or n == ''), n)


# read
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
    C.read(EVS, MISSION, llm)
    t('두 번 JSON 아님 → GenerateError', False)
except GenerateError as e:
    t('두 번 JSON 아님 → GenerateError', len(llm.calls) == 2 and str(e) == C.FAIL, e)
good = {'levels': {'N': 3, 'E': 1, 'S': 2, 'W': 0}, 'evidence': {'N': [fid['trap-fixed']], 'E': [fid['design']], 'S': [fid['run']]}, 'ai_note': '반례를 돌렸다'}
llm = fake('아님', good)
r = C.read(EVS, MISSION, llm)
t('재요청에서 살아남', len(llm.calls) == 2 and r['levels'] == {'N': 3, 'E': 1, 'S': 2, 'W': 0} and r['strongest'] == 'E' and near(r['needle_deg'], 45), r)
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
    ok = C.hard_kinds(junk, {'inputs': [None, 3, {'v': FIRST}, {'v': COUNTER, 'counter': True}]}) is not None and C.facts(junk, {'inputs': [None, 'x']}) is not None
except Exception as e:
    ok = repr(e)
t('학생이 보낸 쓰레기(dict 아닌 outs·inputs)에도 안 죽는다', ok is True, ok)


# 부채꼴 이름은 JS(CC.compass.dirOf) 와 같은 규칙이다
DEGS = [0, 44.9, 45, 134.9, 135, 224.9, 225, 314.9, 315, 359.9, None]
jd = json.loads(subprocess.run(['node', '-e', "global.window={};require(process.argv[1]+'/js/core/compass.js');var d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify(d.map(function(x){return window.CC.compass.dirOf(x)})))", ROOT],
                               input=json.dumps(DEGS), capture_output=True, text=True, check=True).stdout)
pd = [None if d is None else C._sector(d) for d in DEGS]
t('부채꼴 이름이 JS 와 같다', jd == pd, (jd, pd))

print('\nFAIL ' + str(fail) if fail else '\nOK')
sys.exit(1 if fail else 0)
