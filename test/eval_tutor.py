"""튜터 리플레이 — 실제 학생 질문 25건을 새 ask() 에 다시 넣는다. (실제 LLM, 커밋 전 테스트 목록에는 없다)

  uv run -q -p 3.12 --with-requirements requirements.txt python test/eval_tutor.py
결과: docs/overnight/2026-10-18-tutor-replay.md
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
sys.path.insert(0, os.path.join(ROOT, 'test'))
import eval_generate  # noqa: E402  (load_key 재사용)
from _generate import pickle_llm  # noqa: E402
from _tutor import ask  # noqa: E402

eval_generate.load_key()
rows = json.load(open(os.path.join(ROOT, 'test/fixtures/tutor_real_questions.json'), encoding='utf-8'))
hist, out = {}, []
for r in rows:
    m = r['mission']
    ctx = {'mission': {'title': m['title'], 'itemName': m['itemName'], 'items': [], 'situation': m['situation'],
                       'brief': m['brief'], 'inputs': m['inputs']},
           'code': r['code'], 'define': '', 'design': '', 'last_output': r['last_output'],
           'last_error': r['last_error'], 'history': hist.setdefault(r['student'], [])[-3:]}
    try:
        res = ask(r['question'], ctx, pickle_llm)
    except Exception as e:  # noqa: BLE001
        res = {'kind': 'error', 'answer': f'{type(e).__name__}: {e}', 'reasons': ['call_failed']}
    if res['kind'] != 'error':
        hist[r['student']].append({'q': r['question'], 'a': res['answer']})
    out.append((r, res))


def cell(s):
    return str(s).replace('|', '\\|').replace('\n', ' ')


refused = sum(res['kind'] in ('ask_back', 'off_topic') for _, res in out)
failed = sum('judge_failed' in res['reasons'] for _, res in out)
errs = sum(res['kind'] == 'error' for _, res in out)
lines = ['# 튜터 리플레이 — 실제 질문 25건', '', '| 학생 | 질문 | 예전 kind | 새 kind | 새 답 | reasons |', '|---|---|---|---|---|---|']
for r, res in out:
    lines.append(f"| {r['student']} | {cell(r['question'])} | {r['old_kind']} | {res['kind']} | {cell(res['answer'])} | {cell(', '.join(res['reasons']))} |")
lines += ['', f'거절(ask_back·off_topic) 예전 19/25 → 새 {refused}/25', f'judge_failed {failed}건, 호출 오류 {errs}건']
open(os.path.join(ROOT, 'docs/overnight/2026-10-18-tutor-replay.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(lines[-2], lines[-1])
