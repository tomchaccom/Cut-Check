"""미션 생성 평가 — 실제 LLM 을 부른다. (키가 필요하고 돈이 들어서 커밋 전 테스트 목록에는 없다)

수업 주제 10개로 생성해 보고, 호출마다 걸린 시간·방식, 1차 검증 실패 사유,
재요청 여부, 기본 틀로 바뀐 칸, 최종 미션을 docs/eval.md 에 남긴다.
원본 응답은 docs/eval-raw.json.

  PICKLE_API_KEY 를 환경 변수나 저장소 루트의 .env 에 두고
  uv run --with-requirements requirements.txt python test/eval_generate.py
"""
import io
import json
import os
import sys
import time
from contextlib import redirect_stderr
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
import _generate  # noqa: E402
from _generate import GenerateError, _parse, generate  # noqa: E402
from _review import make_mission  # noqa: E402
from _schema import DESC  # noqa: E402

CASES = [  # (수업, 핵심, 기대 유형 — 참고용. 유형 선택은 LLM 판단이라 맞는지만 기록한다)
    ('파이썬 리스트와 반복문. for문으로 하나씩 꺼내서 처리하는 법', '같은 값이 여러 번 있을 때 전체와 서로 다른 개수가 다르다', 'split-unique-count'),
    ('조건문 if-else. 조건이 참이면 A, 거짓이면 B', '어떤 기준으로 걸러내는지를 학생이 직접 정하게', 'split-filter-count'),
    ('딕셔너리. 키와 값 쌍으로 저장', '같은 키가 여러 번 나오면 묶어서 센다', 'split-group'),
    ('함수 정의와 호출. def로 만들고 여러 번 호출', '같은 작업을 항목마다 반복할 때 함수로 묶는다', 'split-transform-join'),
    ('문자열 다루기. split, strip, replace', '데이터를 나누고 정리하는 과정에서 공백이 문제를 일으킨다', 'split-transform-join'),
    ('정렬. sorted와 sort의 차이', '순서가 뒤섞인 목록을 기준에 맞게 늘어놓는다', 'split-sort-join'),
    ('숫자 형변환. int()로 문자열을 숫자로', '문자로 된 숫자는 더하기 전에 바꿔야 한다', 'split-num-sum'),
    ('예외 처리. try-except', '숫자가 아닌 값이 섞여 있으면 계산이 멈춘다', 'split-filter-num-sum'),
    ('집합 set. 중복 없는 모음', '중복을 없애면 개수가 달라진다', 'split-unique-count'),
    ('파일 입출력. open, read', '파일에서 읽은 줄마다 쓸 것만 골라낸다', 'split-filter-count'),
]


def load_key():
    if os.environ.get('PICKLE_API_KEY'):
        return
    for name in ('.env', '.env.local'):
        path = os.path.join(ROOT, name)
        if os.path.exists(path):
            for line in open(path, encoding='utf-8'):
                k, _, v = line.strip().partition('=')
                if k == 'PICKLE_API_KEY' and v:
                    os.environ['PICKLE_API_KEY'] = v.strip().strip('"\'')
                    return
    sys.exit('PICKLE_API_KEY 가 없습니다. 환경 변수나 저장소 루트 .env 에 넣어 주세요.')


# HTTP 호출마다 시간·방식·결과를 남긴다 (_generate._post 를 감싼다)
HTTP = []
_real_post = _generate._post


def _timed_post(body, key, timeout):
    schema = json.dumps((body.get('response_format') or {}).get('json_schema', {}))
    step = '유형' if '"Choice"' in schema or len(HTTP) == 0 else '초안'
    rec = {'step': step, 'mode': (body.get('response_format') or {}).get('type', '-'), 'ms': 0, 'status': 'ok'}
    t0 = time.perf_counter()
    try:
        out = _real_post(body, key, timeout)
        rec['chars'] = len(out)
        return out
    except Exception as e:
        rec['status'] = getattr(e, 'code', None) or type(e).__name__
        raise
    finally:
        rec['ms'] = round((time.perf_counter() - t0) * 1000)
        HTTP.append(rec)


_generate._post = _timed_post


def run_case(i, lesson, key_point, expect):
    HTTP.clear()
    raws = []

    def call(messages, schema, timeout):  # LLM 단위 호출 — 유형·초안·재요청 원본을 남긴다
        out = _generate.pickle_llm(messages, schema, timeout)
        raws.append(out)
        return out

    t0 = time.perf_counter()
    log = io.StringIO()
    result = {'no': i, 'lesson': lesson, 'keyPoint': key_point, 'expect': expect}
    try:
        with redirect_stderr(log):
            m = make_mission(lesson, key_point, call)
        result.update(ok=True, mission=m, guard=m['guard'])
    except GenerateError as e:
        result.update(ok=False, error=str(e), reasons=e.reasons)
    except Exception as e:  # 네트워크·서버 오류
        result.update(ok=False, error=f'{type(e).__name__}: {e}', reasons={})
    result['ms'] = round((time.perf_counter() - t0) * 1000)
    result['http'] = list(HTTP)
    result['raws'] = raws
    # 시도별 검증 결과를 다시 계산해 둔다. 첫 원본은 유형 고르기라 뺀다
    pid = result['mission']['pipelineId'] if result['ok'] else (result.get('reasons', {}).get('pipelineId') or [None])[0]
    result['attempts'] = [_parse(pid, r)[1] for r in raws[1:]] if pid else []
    return result


def md_cell(s):
    return str(s).replace('|', '\\|').replace('\n', ' ')


def write_md(results, path):
    ok = [r for r in results if r['ok']]
    first_pass = [r for r in results if r['attempts'] and not r['attempts'][0]]
    times = [r['ms'] for r in results]
    calls = [h for r in results for h in r['http']]
    L = []
    L.append('# 미션 생성 평가\n')
    L.append(f'실행 {datetime.now():%Y-%m-%d %H:%M} · 모델 `{_generate.MODEL}` · 수업 주제 {len(results)}개\n')
    L.append('`uv run --with-requirements requirements.txt python test/eval_generate.py` 로 다시 만든다. '
             '원본 응답은 `docs/eval-raw.json`.\n')
    L.append('## 요약\n')
    L.append('| 항목 | 값 |\n|---|---|')
    L.append(f'| 미션 생성 성공 | {len(ok)} / {len(results)} |')
    L.append(f'| 1차 응답이 검사를 바로 통과 | {len(first_pass)} / {len(results)} |')
    L.append(f'| 재요청 | {sum(1 for r in ok if r["guard"]["retried"])} 건 |')
    L.append(f'| 기본 틀로 바뀐 칸이 없는 미션 | {sum(1 for r in ok if not r["guard"]["fallback"])} / {len(ok)} |')
    L.append(f'| 기본 틀로 바뀐 칸이 있는 미션 | {sum(1 for r in ok if r["guard"]["fallback"])} 건 |')
    L.append(f'| 자료를 보정한 미션 | {sum(1 for r in ok if r["guard"].get("repaired"))} 건 |')
    L.append(f'| 유형을 LLM 이 고름 | {sum(1 for r in ok if r["guard"]["picked"] == "llm")} / {len(ok)} |')
    L.append(f'| 유형이 기대와 같음 | {sum(1 for r in ok if r["mission"]["pipelineId"] == r["expect"])} / {len(ok)} |')
    L.append(f'| 나온 유형 가짓수 | {len({r["mission"]["pipelineId"] for r in ok})} |')
    rv = [r['guard'].get('review', {}) for r in ok]
    L.append(f'| 검수 1차 통과 | {sum(1 for x in rv if x.get("status") == "pass" and x.get("rounds") == 1)} / {len(ok)} |')
    L.append(f'| 검수 통과 (재생성 포함) | {sum(1 for x in rv if x.get("status") == "pass")} / {len(ok)} |')
    L.append(f'| 교사 검수로 넘어감 | {sum(1 for x in rv if x.get("status") == "teacher")} / {len(ok)} |')
    if times:
        L.append(f'| 미션 하나 걸린 시간 | 평균 {sum(times) / len(times) / 1000:.1f}초 · 최대 {max(times) / 1000:.1f}초 |')
    modes = {}
    for h in calls:
        modes.setdefault(f'{h["step"]} · {h["mode"]} → {h["status"]}', []).append(h['ms'])
    for k, v in modes.items():
        L.append(f'| HTTP `{k}` | {len(v)}회 · 평균 {sum(v) / len(v) / 1000:.1f}초 |')

    reasons = {}
    for r in results:
        for a in r['attempts']:
            for f in a:
                reasons[f] = reasons.get(f, 0) + 1
    if reasons:
        L.append('\n### 검증에 걸린 칸 (시도 기준)\n')
        L.append('| 칸 | 횟수 |\n|---|---|')
        for f, n in sorted(reasons.items(), key=lambda x: -x[1]):
            L.append(f'| `{f}` | {n} |')

    L.append('\n## 주제별\n')
    L.append('| # | 수업 | 기대 유형 | 나온 유형 | 시간 | LLM 호출 | 1차 검증 | 기본 틀 칸 | 결과 |')
    L.append('|---|---|---|---|---|---|---|---|---|')
    for r in results:
        got = r['mission']['pipelineId'] if r['ok'] else '-'
        first = '통과' if r['attempts'] and not r['attempts'][0] else ', '.join(r['attempts'][0]) if r['attempts'] else '-'
        fb = ', '.join(r['guard']['fallback']) if r['ok'] and r['guard']['fallback'] else '-'
        L.append(f'| {r["no"]} | {md_cell(r["lesson"][:24])} | `{r["expect"]}` | `{got}` | {r["ms"] / 1000:.1f}초 | '
                 f'{len(r["raws"])} | {md_cell(first)} | {fb} | {"생성" if r["ok"] else "실패"} |')

    L.append('\n## 상세\n')
    for r in results:
        L.append(f'### {r["no"]}. {r["lesson"]}\n')
        L.append(f'- 핵심: {r["keyPoint"]}')
        L.append('- HTTP: ' + ' → '.join(f'{h["step"]} {h["status"]} {h["ms"] / 1000:.1f}초' for h in r['http']))
        if r['ok']:
            L.append(f'- 유형: `{r["mission"]["pipelineId"]}` ({DESC[r["mission"]["pipelineId"]]}) · 고른 쪽: {r["guard"]["picked"]}')
        for n, a in enumerate(r['attempts'], 1):
            if a:
                L.append(f'- 초안 {n}차 검증 실패')
                for f, msgs in a.items():
                    for msg in msgs:
                        L.append(f'  - `{f}` {md_cell(msg)}')
            else:
                L.append(f'- 초안 {n}차 검증 통과')
        if not r['ok']:
            L.append(f'- **실패**: {r["error"]}\n')
            continue
        m = r['mission']
        if m['guard']['fallback']:
            L.append('- 기본 틀로 바뀐 칸: ' + ', '.join(m['guard']['fallback']))
        for note in m['guard'].get('repaired', []):
            L.append(f'- 자료 보정: {md_cell(note)}')
        L.append(f'\n**{m["title"]}** · `{m["pipelineId"]}`\n')
        L.append(f'> {m["brief"]}  ')
        if m.get('situation'):
            L.append(f'> {m["situation"]}')
        L.append('\n| 성공 조건 보기 | 표시 |\n|---|---|')
        for o in m['define']['options']:
            L.append(f'| {md_cell(o["v"])} | {o["trap"] or "진짜 (" + o.get("key", "") + ")"} |')
        rv = m['guard'].get('review', {})
        if rv.get('status') == 'teacher':
            L.append('\n- 검수: ' + ' / '.join(rv.get('reasons', [])))
        L.append('\n| 자료 | 값 |\n|---|---|')
        for inp in m['inputs']:
            tag = f' (반례 · {inp.get("axis")})' if inp.get('counter') else ''
            L.append(f'| {md_cell(inp["name"])}{tag} | `{md_cell(inp["v"])}` |')
        if m.get('pipelineParams'):
            L.append(f'\n걸러낼 대상: {", ".join(m["pipelineParams"]["filterTarget"])}')
        L.append('')
    open(path, 'w', encoding='utf-8').write('\n'.join(L) + '\n')


if __name__ == '__main__':
    load_key()
    results = []
    for i, (lesson, kp, expect) in enumerate(CASES, 1):
        r = run_case(i, lesson, kp, expect)
        print(f'{i:2d}. {"생성" if r["ok"] else "실패"} {r["ms"] / 1000:5.1f}초 호출 {len(r["raws"])} '
              f'{(r["mission"]["pipelineId"] if r["ok"] else r["error"])[:60]}', flush=True)
        results.append(r)
    write_md(results, os.path.join(ROOT, 'docs', 'eval.md'))
    json.dump(results, open(os.path.join(ROOT, 'docs', 'eval-raw.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('→ docs/eval.md, docs/eval-raw.json')
