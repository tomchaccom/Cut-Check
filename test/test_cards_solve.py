"""설계 카드가 정말 그 문제를 푸는 카드인가 — 카드대로 파이썬을 쓰면 엔진과 같은 답이 나오는지.

생성기는 그 유형의 엔진(api/_pipeline.py)으로 세 자료를 돌려 미션을 검사한다. 학생 화면의 카드는
js/core/cards.js 가 같은 유형에서 꺼낸다. 이 테스트는 그 사이를 잇는다:
  1. 진짜 카드의 세부 보기 안에 엔진이 쓰는 정답 값이 있다 (보기에 정답이 없으면 학생은 풀 수 없다)
  2. 카드 한 장을 중1 수준 파이썬 한 줄로 옮겨 순서대로 실행하면, 세 자료 모두 엔진 정답과 같다
  3. 헷갈리는 카드를 끼워 넣으면 답이 달라지는가 — 정보로만 출력 (달라지지 않으면 '없어도 되는 카드')

  /usr/local/bin/python3 test/test_cards_solve.py
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
from _pipeline import WHITELIST, run  # noqa: E402
from _schema import SPEC  # noqa: E402

JS = """
global.window = global;
require('./js/core/pipeline.js'); require('./js/core/cards.js');
const out = {};
CC.pipeline.WHITELIST.forEach(w => { out[w.id] = CC.cards.forMission({ pipelineId: w.id, filterDesc: '대상' }); });
console.log(JSON.stringify(out));
"""
CARDS = json.loads(subprocess.run(['node', '-e', JS], cwd=ROOT, capture_output=True, text=True, check=True).stdout)

# 엔진의 정답 빈칸 값 → 카드 세부 보기 (같은 뜻, 화면 문구만 다르다)
RIGHT = {'split': '쉼표', 'filter': '있는 것만', 'transform': '앞뒤 공백 없애기', 'sort': '가나다순', 'join': '쉼표'}

# 카드 한 장 = 파이썬 한 줄. 학생이 쓸 법한 모양으로 (리스트 컴프리헨션 대신 for 를 써도 같다)
LINE = {
    'split': 'items = data.split(",")',
    'filter': 'items = [x for x in items if x.strip() in target]',
    'filterNum': 'items = [x for x in items if x.strip() not in target]',
    'toNumber': 'items = [int(x) for x in items]',
    'transform': 'items = [x.strip() for x in items]',
    'unique': 'items = list(dict.fromkeys(items))',
    'sort': 'items = sorted(items)',
    'join': 'items = ",".join(items)',
    'count': 'items = len(items)',
    'sum': 'items = sum(items)',
    'max': 'items = max(items)',
    'min': 'items = min(items)',
    'groupCount': 'items = {k: [x.strip() for x in items].count(k) for k in dict.fromkeys(x.strip() for x in items)}',
}

WORDS = (['밥', '우유', '김치', '우유'], ['빵', '달걀', '국', '우유', '빵'], ['우유', '밥', ' 떡 ', '밥', '달걀'])
TRIM = ([' 민수', '지우 ', '민수'], ['서연', ' 도윤', '서연 '], [' 하은 ', '하은', ' 지호'])
NUMS = (['1000', '2000', '500'], ['300', '700', '100', '700'], ['5', '9', '1'])
MIXED = (['1000', '메모', '2000'], ['300', '간식', '700'], ['메모', '간식', '5'])
TARGET = ['우유', '달걀', '메모', '간식']

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


def data_for(pid):
    ops = WHITELIST[pid]
    if 'toNumber' in ops:
        return MIXED if 'filter' in ops else NUMS
    return TRIM if 'transform' in ops else WORDS


def solve(lines, text):
    ns = {'data': text, 'target': TARGET}
    exec('\n'.join(lines), {}, ns)
    return ns.get('items')


def key_of(op, ops):
    return 'filterNum' if op == 'filter' and 'toNumber' in ops else op


print('[카드대로 쓰면 엔진과 같은 답]')
decoy_changes = {}
for pid, ops in WHITELIST.items():
    cards = CARDS[pid]
    real = {c['op']: c for c in cards if not c['decoy']}
    t(f'{pid}: 진짜 카드가 연산마다 하나', sorted(real) == sorted(ops), sorted(real))
    for op, c in real.items():
        if c['detail'] and key_of(op, ops) in RIGHT:
            t(f"{pid}: '{c['label']}' 보기에 정답 '{RIGHT[op]}' 이 있다", RIGHT[op] in c['detail']['options'], c['detail'])
    lines = [LINE[key_of(op, ops)] for op in ops]
    slots = next(iter(SPEC[pid]['keys'].values()))
    params = {'filterTarget': TARGET} if 'filter' in ops else {}
    for items in data_for(pid):
        text = ','.join(items)
        want = run(pid, slots, params, text)
        got = solve(lines, text)
        t(f'{pid}: {text!r}', not want['err'] and got == want['value'], (got, want))
    decoy = next(c for c in cards if c['decoy'])
    changed = []
    for at in range(1, len(ops) + 1):  # 나누기 뒤 어느 자리에 끼워도
        try:
            with_decoy = lines[:at] + [LINE[key_of(decoy['op'], ops)]] + lines[at:]
            changed.append(any(solve(with_decoy, ','.join(i)) != solve(lines, ','.join(i)) for i in data_for(pid)))
        except Exception:  # noqa: BLE001 — 끼우면 에러가 나는 자리도 '답이 달라진다' 로 친다
            changed.append(True)
    decoy_changes[pid] = (decoy['label'], all(changed), any(changed))

print('\n[헷갈리는 카드를 끼우면 답이 달라지는가 — 정보]')
for pid, (label, always, some) in decoy_changes.items():
    print(f"  {pid:30} {label:14} {'늘 달라짐' if always else ('자리에 따라' if some else '안 달라짐 — 없어도 되는 카드')}")

print(f'\n{"FAIL " + str(fail) if fail else "ALL PASS"}')
sys.exit(1 if fail else 0)
