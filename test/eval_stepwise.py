"""단계별 생성 완성 확인 — 실제 LLM 을 부른다 (키가 필요하고 돈이 들어서 커밋 전 테스트 목록에는 없다)

스펙 '완성 확인': 개념마다 2개를 끝까지 만든다. 두 단계로 나눠 돈다 —
  examples : 개념 8개 × 예시 목록 → eval/examples.json
  (사람 대신 고르기: 돌리는 에이전트가 기준 1~4 로 개념마다 2개를 골라 eval/picks.json 을 쓴다)
  build    : picks.json → 만들기 → 모범 답안을 자료마다 실행 → CC.codemission.solcheck → 걸리면 이유를 붙여
             다시 만들기(최대 2번, 강사 화면 genflow.js 와 같은 흐름) → 따로 풀기 → eval/builds.json

모범 답안 실행은 강사 브라우저(Pyodide) 대신 로컬 `python3 -I` 하위 프로세스(5초, 환경변수 비움).
로컬 평가 전용이다 — 서버는 여전히 AI 가 쓴 코드를 실행하지 않는다.

호출마다 usage 토큰을 쌓아 단가(mini $0.6/M, gpt-5.4 $2.2/M)로 금액을 추정하고, $3 에 닿기 전에 멈춘다.
PICKLE_API_KEY 는 환경변수에서만 읽는다 — 없으면 멈춘다(파일에서 찾지 않는다).

  uv run --with-requirements requirements.txt python test/eval_stepwise.py examples [--dry] [--only for,while]
  uv run --with-requirements requirements.txt python test/eval_stepwise.py build [--dry] [--only set] [--tag r2]
"""
import argparse
import http.client
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
import _generate  # noqa: E402
import _steps  # noqa: E402
from _generate import GenerateError  # noqa: E402

OUT = os.path.join(ROOT, '.superpowers', 'sdd', '2026-10-20-stepwise-generation', 'eval')
PRICE = {'mini': 0.6, 'big': 2.2}   # $/백만 토큰 (스펙 '비용')
BUDGET, MARGIN = 3.0, 0.12           # 만들기 한 번(재요청 포함)이 넘을 수 있는 여유
LEVEL = {'difficulty': 'easy', 'stages': {'base': 12, 'combine': 6, 'ready': 2}}
LESSONS = {  # 개념 확인 단계 입력 — 강사가 적을 법한 문장. 글자 규칙에 걸리면 AI 를 안 부른다
    'split': ('문자열 split 으로 쉼표 기준 나누기', '나눈 조각 개수'),
    'index': ('리스트와 인덱스, 몇 번째 값 꺼내기', '마지막은 -1'),
    'if': ('if 조건문으로 기준 넘는지 확인', '이상과 초과의 차이'),
    'for': ('for 문으로 목록 하나씩 꺼내기', '하나씩 꺼내 더해 가기'),
    'while': ('while 문, 조건이 참인 동안', '언제 멈추는지'),
    'dict': ('딕셔너리 키와 값', '키로 값을 찾는다'),
    'set': ('집합 set 과 교집합', '겹치는 것만 남기기'),
    'func': ('def 로 함수 만들기', '같은 계산을 여러 번'),
}

CALLS = []  # 호출마다 {phase, model, prompt, completion, ms, status}
PHASE = ['-']


class Budget(Exception):
    pass


def spent():
    return sum(c['cost'] for c in CALLS)


def _tier(model):
    return 'mini' if 'mini' in model else 'big'


def _record(body, usage, ms, status):
    p, c = (usage or {}).get('prompt_tokens', 0), (usage or {}).get('completion_tokens', 0)
    CALLS.append({'phase': PHASE[0], 'model': body['model'], 'prompt': p, 'completion': c, 'ms': ms, 'status': status,
                  'cost': (p + c) * PRICE[_tier(body['model'])] / 1e6})


def real_post(body, key, timeout):
    """_generate._post 와 같은 재시도 규칙 + usage 기록. 키는 헤더에만 쓴다."""
    if spent() > BUDGET - MARGIN:
        raise Budget(f'예산 ${BUDGET} 에 닿기 전에 멈춤 (추정 ${spent():.3f})')
    end = time.monotonic() + timeout
    for attempt in (1, 2):
        req = urllib.request.Request(_generate.API_URL, data=json.dumps(body).encode(), method='POST', headers={
            'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
        t0 = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=max(1, end - time.monotonic())) as r:
                j = json.loads(r.read())
            _record(body, j.get('usage'), round((time.monotonic() - t0) * 1000), 'ok')
            return j['choices'][0]['message']['content']
        except urllib.error.HTTPError as e:
            _record(body, None, round((time.monotonic() - t0) * 1000), e.code)
            if e.code not in (502, 503, 504) or attempt == 2 or end - time.monotonic() < 5:
                raise
        except (http.client.RemoteDisconnected, ConnectionResetError) as e:
            _record(body, None, round((time.monotonic() - t0) * 1000), type(e).__name__)
            if attempt == 2 or end - time.monotonic() < 5:
                raise


# ── 가짜 LLM (--dry) ─────────────────────────────────────────

def fake_post(body, key, timeout):
    sys_ = body['messages'][0]['content']
    if sys_.startswith(_steps.EX_SYSTEM[:20]):
        out = {'examples': [{'title': f'예시 {i}', 'situation': '친구들 점수가 목록으로 있어요. 몇 명이 넘었는지 알아내요.',
                             'why': '하나씩 보며 세기'} for i in range(4)]}
    elif sys_.startswith(_steps.BUILD_SYSTEM[:20]):
        out = {'title': '매점 영수증', 'situation': '민지가 매점에서 간식을 샀어요. 모두 얼마인지 알고 싶어요.',
               'brief': '모두 얼마 썼는지 알려 주세요.', 'axis': 'empty',
               'inputs': [{'name': '민지 영수증', 'v': '[1500, 800, 2000]'}, {'name': '준호 영수증', 'v': '[1000, 1200]'},
                          {'name': '서아 영수증', 'v': '[]'}],
               'cards': [{'label': '가격 꺼내기', 'decoy': False}, {'label': '합 쌓기', 'decoy': False},
                         {'label': '합 보여 주기', 'decoy': False}, {'label': '가격 정렬', 'decoy': True}],
               'success': '산 간식 값을 모두 더한 금액이 나오면 성공',
               'solution': 't = 0\nfor x in data:\n    t += x\nprint(t)'}
    else:
        out = {'code': 'print(sum(data))'}
    _record(body, {'prompt_tokens': 1000, 'completion_tokens': 300}, 0, 'dry')
    return json.dumps(out, ensure_ascii=False)


# ── 브라우저 대신: 로컬 실행 + core 검사 ──────────────────────

NODE = r"""
global.window = global;
require(process.argv[1] + '/js/core/hangul.js'); require(process.argv[1] + '/js/core/pyerr.js');
require(process.argv[1] + '/js/core/codemission.js');
const CM = CC.codemission, a = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = a.op === 'uses' ? CM.usesCode(a.src)
  : a.op === 'check' ? CM.solcheck(a.draft, a.runs, a.uses)
  : a.op === 'line' ? CM.dataLine(a.draft, a.v)
  : a.op === 'hard' ? CM.hardcodeOption(a.name, a.value) : CC.pyerr.TIMEOUT;
process.stdout.write(JSON.stringify(out));
"""


def node(**a):
    r = subprocess.run(['node', '-e', NODE, ROOT], input=json.dumps(a), capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def py(code):
    """Pyodide 대신. 환경변수를 비워 키가 하위 프로세스로 새지 않게 한다. 5초 = 학생·강사 실행기와 같은 제한"""
    try:
        r = subprocess.run([sys.executable, '-I', '-c', code], capture_output=True, text=True, timeout=5,
                           env={'PATH': '/usr/bin:/bin'}, cwd=OUT)
    except subprocess.TimeoutExpired:
        return {'output': '', 'error': TIMEOUT[0]}
    err = r.stderr.strip().splitlines()[-1] if r.returncode else ''
    return {'output': r.stdout, 'error': err}


TIMEOUT = ['']


def run_all(d):
    runs = [py(f'import ast as _ast\n_ast.literal_eval({json.dumps(x["v"])})\n' + node(op='line', draft=d, v=x['v']) +
               '\n' + d['solution']) for x in d['inputs']]
    u = py(node(op='uses', src=d['solution']))
    try:
        uses = None if u['error'] else json.loads(u['output'].strip())
    except ValueError:
        uses = None
    return runs, uses


def build_one(concept, ex, wish):
    """genflow.make 와 같은 흐름: 만들고 돌려 보고, 걸리면 이유를 붙여 다시(최대 2번)"""
    rounds, probs = [], []
    for left in (2, 1, 0):
        PHASE[0] = f'build:{concept}'
        try:
            d = _steps.build(concept, ex, wish, LEVEL, probs)['draft']
        except GenerateError as e:
            rounds.append({'problems_in': probs, 'server_error': str(e), 'detail': getattr(e, 'detail', None)})
            return {'rounds': rounds, 'ok': False}
        runs, uses = run_all(d)
        p = [x['msg'] for x in node(op='check', draft=d, runs=runs, uses=uses)]
        rounds.append({'problems_in': probs, 'draft': d, 'runs': runs, 'uses': uses, 'problems': p})
        if not p or not left:
            break
        probs = p
    d['expected'] = [('' if r['error'] else r['output'].strip()) for r in runs]
    d['hardcode'] = node(op='hard', name=d['inputs'][0]['name'], value=d['expected'][0])
    PHASE[0] = f'solve:{concept}'
    solved = None
    try:
        code = _steps.solve(d['situation'], d['brief'], d['inputs'])['code']
        sr = [py(node(op='line', draft=d, v=x['v']) + '\n' + code) for x in d['inputs']]
        solved = {'code': code, 'runs': sr,
                  'same': all(not r['error'] and r['output'].strip() == e for r, e in zip(sr, d['expected']))}
    except GenerateError as e:
        solved = {'error': str(e)}
    return {'rounds': rounds, 'ok': not p, 'final': d, 'solve': solved}


def save(name, obj):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def load(name):
    with open(os.path.join(OUT, name), encoding='utf-8') as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('phase', choices=['examples', 'build'])
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--tag', default='')
    ap.add_argument('--more', action='store_true', help='examples: 이미 받은 묶음에 "다른 예시 더 보기" 한 번')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    pre = 'dry-' if a.dry else ''
    if a.dry:
        _generate._post = fake_post
    else:
        if not os.environ.get('PICKLE_API_KEY', '').strip():
            sys.exit('키 없음 — PICKLE_API_KEY 환경변수가 없어 멈춘다 (파일에서 찾지 않는다).')
        _generate._post = real_post
    TIMEOUT[0] = node(op='timeout')
    only = [c for c in a.only.split(',') if c] or list(_steps.CONCEPTS)
    try:
        prev = load(pre + 'calls.json')
    except FileNotFoundError:
        prev = []
    CALLS.extend(prev)
    n0 = len(CALLS)
    try:
        if a.phase == 'examples':
            res = load(pre + 'examples.json') if a.more else {}
            for c in only:
                if a.more:  # 강사가 '다른 예시 더 보기' 를 누른 것과 같다 — 보인 제목을 넘긴다
                    PHASE[0] = f'examples-more:{c}'
                    seen = [e['title'] for e in res[c]['examples']]
                    got = _steps.examples(c, LEVEL, seen)['examples']
                    res[c]['examples'] += got
                    res[c]['more'] = [e['title'] for e in got]
                    print(c, 'more', res[c]['more'], file=sys.stderr)
                    continue
                PHASE[0] = f'concept:{c}'
                got = _steps.concept(*LESSONS[c])
                PHASE[0] = f'examples:{c}'
                res[c] = {'concept': got, 'examples': _steps.examples(c, LEVEL, [])['examples']}
                print(c, got['by'], [e['title'] for e in res[c]['examples']], file=sys.stderr)
            save(pre + 'examples.json', res)
        else:
            exs = load(pre + 'examples.json')
            picks = load(pre + 'picks.json') if not a.dry else {
                c: [{'title': v['examples'][0]['title'], 'reason': 'dry'}] for c, v in exs.items()}
            out = {}
            for c in only:
                for pk in picks.get(c, []):
                    ex = next(e for e in exs[c]['examples'] if e['title'] == pk['title'])
                    r = build_one(c, ex, pk.get('wish', ''))
                    r.update(pick=pk, example=ex)
                    out.setdefault(c, []).append(r)
                    print(c, pk['title'], 'ok' if r['ok'] else 'FAIL', f'${spent():.3f}', file=sys.stderr)
                    save(f'{pre}builds{a.tag}.json', out)
    except Budget as e:
        print(e, file=sys.stderr)
    finally:
        save(pre + 'calls.json', CALLS)
        new = CALLS[n0:]
        print(f'이번 호출 {len(new)}회 · 토큰 {sum(c["prompt"] + c["completion"] for c in new)} · '
              f'추정 ${sum(c["cost"] for c in new):.3f} / 누적 ${spent():.3f}', file=sys.stderr)


if __name__ == '__main__':
    main()
