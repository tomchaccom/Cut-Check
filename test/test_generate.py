"""미션 생성 흐름(api/_generate.py) 검증 — LLM 은 가짜로 바꿔 끼운다.

  uv run --with-requirements requirements.txt python test/test_generate.py
"""
import copy
import importlib.util
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
from _generate import GenerateError, generate  # noqa: E402
from _schema import MissionDraft  # noqa: E402

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


def fake(*answers):
    """차례로 답하는 가짜 LLM. 받은 메시지는 calls 에 남는다."""
    calls = []

    def call(messages):
        calls.append(copy.deepcopy(messages))
        a = answers[len(calls) - 1]
        return a if isinstance(a, str) else json.dumps({'mission': a}, ensure_ascii=False)
    call.calls = calls
    return call


def draft(pid, d1, d2, **extra):
    """자료만 있는 초안. 나머지 칸은 extra 로 채운다."""
    m = {'pipelineId': pid, 'title': '급식 재료 확인', 'brief': '이번 주 재료 목록을 확인해 주세요.',
         'situation': '우리 반이 급식 당번이에요.', 'itemName': '재료',
         'data': [{'name': '월요일 재료', 'items': d1}, {'name': '화요일 재료', 'items': d2}]}
    m.update(extra)
    return m


DATA = {
    'split-unique-count': draft('split-unique-count', ['밥', '우유', '김치'], ['빵', '국', '떡']),
    'split-filter-count': draft('split-filter-count', ['밥', '우유', '김치'], ['빵', '달걀', '국', '우유'],
                                filterTarget=['우유', '달걀'], filterDesc='알레르기 목록'),
    'split-sort-join': draft('split-sort-join', ['우유', '밥', '김치'], ['빵', '국', '떡']),
    'split-num-sum': draft('split-num-sum', ['1000', '2000', '500'], ['300', '700', '100']),
    'split-group': draft('split-group', ['우유', '우유', '밥'], ['국', '빵', '국']),
    'split-transform-join': draft('split-transform-join', [' 민수', '지우 ', '현우'], ['서연', ' 도윤', '하은']),
    'split-filter-num-sum': draft('split-filter-num-sum', ['1000', '메모', '2000'], ['300', '간식', '700'],
                                  filterTarget=['메모', '간식'], filterDesc='메모 항목'),
}

GOOD = {**DATA['split-unique-count'],
        'counter': {'name': '수요일 재료', 'text': '밥,우유,김치,밥,국', 'axis': 'count'},
        'options': [{'v': '3이 나오면 성공', 'trap': 'hardcode'},
                    {'v': '어떤 목록이든 맞는 수가 나오면 성공', 'trap': None, 'key': 'unique'},
                    {'v': '에러 안 나면 성공', 'trap': 'luck'}],
        'sentences': [{'template': '목록을 {sep} 기준으로 본다.', 'slot': 'sep'},
                      {'template': '같은 재료는 {dedup}.', 'slot': 'dedup'},
                      {'template': '{output}을 보여준다.', 'slot': 'output'}]}


print('\n[한 번에 통과]')
llm = fake(GOOD)
m = generate('리스트', '중복', llm)
t('LLM 은 한 번만 불린다', len(llm.calls) == 1)
t('폴백 없음 · 재요청 없음', m['guard'] == {'fallback': [], 'reasons': {}, 'retried': False}, m['guard'])
t('학생 화면 모양 — 자료 3개, 마지막이 반례', [i['id'] for i in m['inputs']] == ['d01', 'd02', 'd03']
  and m['inputs'][2].get('counter') is True, m['inputs'])
t('빈칸 보기는 코드가 붙인다', m['method']['sentences'][1]['options'] == ['각각 남긴다', '하나만 남긴다'])
t('함정 보기에는 key 가 없다', all('key' not in o for o in m['define']['options'] if o['trap']))
t('성공 질문은 존댓말', m['define']['q'].endswith('요?'))

print('\n[틀렸다가 고쳐 옴]')
bad = copy.deepcopy(GOOD)
bad['brief'] = '재료 좀 세어봐'
llm = fake(bad, GOOD)
err, sys.stderr = sys.stderr, io.StringIO()
m = generate('리스트', '중복', llm)
log, sys.stderr = sys.stderr.getvalue(), err
t('두 번 불린다', len(llm.calls) == 2)
t('재요청에 칸별 사유가 들어간다', 'brief' in llm.calls[1][-1]['content'] and '반말' in llm.calls[1][-1]['content'])
t('재요청에 처음 답이 들어간다', llm.calls[1][-2]['role'] == 'assistant')
t('고쳐 왔으니 폴백 없음', m['guard']['fallback'] == [] and m['guard']['retried'] is True, m['guard'])
t('처음 사유는 서버 로그에 남는다', '1차 사유' in log and 'brief' in log, log)
t('교사 화면에는 남은 사유만', m['guard']['reasons'] == {}, m['guard'])

print('\n[두 번 다 틀림 → 틀린 칸만 기본 틀로]')
bad = copy.deepcopy(GOOD)
bad['options'][0]['v'] = '7이 나오면 성공'
bad['sentences'][0]['template'] = '쉼표 {sep} 나눈다.'
m = generate('리스트', '중복', fake(bad, bad))
t('options · sentences 만 바뀐다', sorted(m['guard']['fallback']) == ['options', 'sentences'], m['guard'])
t('맞았던 칸은 LLM 것 그대로', m['brief'] == GOOD['brief'] and m['inputs'][2]['v'] == GOOD['counter']['text'])

print('\n[자료만 맞으면 나머지 기본 틀이 유형마다 검사를 통과한다]')
for pid, d in DATA.items():
    try:
        m = generate('수업', '핵심', fake(d, d))
        t(pid, set(m['guard']['fallback']) == {'counter', 'options', 'sentences'}, m['guard'])
    except GenerateError as e:
        t(pid, False, e.reasons)

print('\n[갈아 끼울 틀이 없으면 포기한다]')
bad = copy.deepcopy(GOOD)
bad['data'][0]['items'] = ['항목1', '항목2', '항목3']
for name, answers in [('자료가 두 번 다 틀림', (bad, bad)),
                      ('JSON 이 두 번 다 아님', ('모르겠어요', '정말 모르겠어요')),
                      ('유형 태그가 없음', ({**GOOD, 'pipelineId': 'split-count'},) * 2)]:
    try:
        generate('수업', '핵심', fake(*answers))
        t(name, False, '통과해버림')
    except GenerateError as e:
        t(name, bool(e.reasons), e.reasons)

print('\n[나온 미션은 다시 넣어도 검사를 통과한다]')
m = generate('리스트', '중복', fake(DATA['split-filter-count'], DATA['split-filter-count']))
again = {'pipelineId': m['pipelineId'], 'title': m['title'], 'brief': m['brief'], 'situation': m['situation'],
         'itemName': '재료', 'filterTarget': m['pipelineParams']['filterTarget'], 'filterDesc': '알레르기 목록',
         'data': [{'name': i['name'], 'items': i['v'].split(',')} for i in m['inputs'][:2]],
         'counter': {'name': m['inputs'][2]['name'], 'text': m['inputs'][2]['v'], 'axis': m['inputs'][2]['axis']},
         'options': m['define']['options'],
         'sentences': [{'template': s['template'], 'slot': s['slot']} for s in m['method']['sentences']]}
try:
    MissionDraft.model_validate({'mission': again})
    t('filter-count 폴백 미션 재검사', True)
except Exception as e:
    t('filter-count 폴백 미션 재검사', False, e)

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
os.environ.pop('PICKLE_API_KEY', None)
code, body = post({'lesson': '리스트', 'keyPoint': '중복'})
t('키가 없으면 502 와 사람이 읽는 말', code == 502 and '다시 시도' in body['error'], (code, body))

print(f'\n{"FAIL " + str(fail) if fail else "ALL PASS"}')
sys.exit(1 if fail else 0)
