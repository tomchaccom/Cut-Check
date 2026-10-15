"""JS 엔진(js/core/pipeline.js) 과 Python 엔진(api/_pipeline.py) 이 같은 답을 내는가.

엔진이 두 군데 있으면 반드시 갈라진다. 갈라진 날 서버는 "진짜 반례"라고 통과시킨
자료가 학생 화면에서는 반례가 아니게 된다. 그날 이 테스트가 깨진다.

생성기가 쓰는 7개 유형 × 모든 빈칸 조합 × 까다로운 입력을 양쪽에 넣고 비교한다.

  uv run --with-requirements requirements.txt python test/test_pipeline_parity.py
"""
import itertools
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
from _pipeline import run  # noqa: E402
from _schema import SPEC  # noqa: E402

INPUTS = [
    '사과,바나나,우유',
    '사과,바나나,우유,사과,빵',
    ' 민수,지우 , 현우',
    '사과 바나나 우유',
    '사과/바나나/우유',
    '',
    '1000,2000,500',
    '1000,메모,2000',
    '우유,우유,달걀',
]
PARAMS = {'filterTarget': ['우유', '달걀', '메모']}

cases = []
for pid, spec in SPEC.items():
    names = list(spec['slots'])
    for combo in itertools.product(*spec['slots'].values()):
        for text in INPUTS:
            cases.append([pid, dict(zip(names, combo)), PARAMS, text])

js = subprocess.run(['node', '-e', '''
global.window = {};
require(process.argv[1]);
const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = cases.map(([id, slots, params, text]) => {
  const r = window.CC.pipeline.run(id, slots, params, text);
  return r.err ? {err: 1, msg: r.msg} : {err: 0, type: r.type, value: r.value};
});
process.stdout.write(JSON.stringify(out));
''', os.path.join(ROOT, 'js/core/pipeline.js')], input=json.dumps(cases), capture_output=True, text=True, check=True)

fail = 0
for case, want in zip(cases, json.loads(js.stdout)):
    got = run(*case)
    same = got['err'] == want['err'] and (got['err'] or (got['type'] == want['type'] and got['value'] == want['value']))
    if not same:
        fail += 1
        print('  FAIL', case, '\n       js:', want, '\n       py:', got)

print(f'\n{len(cases) - fail}/{len(cases)} 같음')

# 학생이 고른 대로 도는가. 위 비교는 양쪽이 같은지만 보므로, 둘 다 틀리면 못 잡는다.
# 여기 값이 맞고 위 비교가 통과하면 JS 도 맞다.
print('\n[고른 대로 돈다]')
F = {'filterTarget': ['메모']}
for name, got, want in [
    ("'빼고 숫자만 남긴다' → 숫자만 더한다",
     run('split-filter-num-sum', {'sep': '쉼표', 'cond': '빼고 숫자만 남긴다'}, F, '1000,메모,2000'), 3000),
    ("'그대로 둔다' → 메모를 숫자로 못 바꾼다",
     run('split-filter-num-sum', {'sep': '쉼표', 'cond': '그대로 둔다'}, F, '1000,메모,2000'), 'err'),
    ("'각각 남긴다' → 겹쳐도 다 센다",
     run('split-unique-count', {'sep': '쉼표', 'dedup': '각각 남긴다'}, {}, '사과,바나나,사과'), 3),
    ("'하나만 남긴다' → 겹치면 하나로 센다",
     run('split-unique-count', {'sep': '쉼표', 'dedup': '하나만 남긴다'}, {}, '사과,바나나,사과'), 2),
    ("'항상 숫자 3' → 무엇이 와도 3",
     run('split-unique-count', {'sep': '쉼표', 'dedup': '각각 남긴다', 'output': '항상 숫자 3'}, {}, '사과'), 3),
    ('빈칸 없는 유형은 예전처럼 중복을 뺀다',
     run('split-unique-count', {'sep': '쉼표'}, {}, '사과,바나나,사과'), 2),
]:
    ok = (got['err'] == 1) if want == 'err' else (got['err'] == 0 and got['value'] == want)
    print(('  ok  ' if ok else '  FAIL') + ' ' + name + ('' if ok else f'  → {got}'))
    fail += 0 if ok else 1
sys.exit(1 if fail else 0)
