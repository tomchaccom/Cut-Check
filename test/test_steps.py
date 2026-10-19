"""단계별 미션 생성(api/_steps.py, api/mission-steps.py) — LLM·Supabase 는 가짜로 끼운다.

  uv run --with-requirements requirements.txt python test/test_steps.py
"""
import copy
import importlib.util
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
import _steps  # noqa: E402
from _generate import GenerateError  # noqa: E402

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


def fake(*answers):
    """부를 때마다 answers 를 차례로 돌려주는 가짜 LLM. 받은 messages 를 남긴다."""
    calls = []

    def call(messages, schema, timeout):
        calls.append({'messages': copy.deepcopy(messages), 'schema': schema, 'timeout': timeout})
        a = answers[len(calls) - 1]
        return a if isinstance(a, str) else json.dumps(a, ensure_ascii=False)
    call.calls = calls
    return call


def text(f):
    return '\n'.join(m['content'] for c in f.calls for m in c['messages'])


def quiet(fn, *a, **k):
    err, sys.stderr = sys.stderr, io.StringIO()
    try:
        return fn(*a, **k)
    finally:
        sys.stderr = err


def raises(fn, *a, **k):
    try:
        quiet(fn, *a, **k)
    except GenerateError as e:
        return e
    return None


print('\n[개념 — 낱말 규칙이 먼저, LLM 은 0번]')
for lesson, want in [('while 반복문', 'while'), ('목표에 닿을 때까지 모으기', 'while'), ('def 로 함수 만들기', 'func'),
                     ('딕셔너리 기초', 'dict'), ('집합으로 중복 제거', 'set'), ('if 조건문', 'if'),
                     ('for 와 range', 'for'), ('리스트에서 몇 번째', 'index'), ('문자열 split', 'split')]:
    f = fake()
    out = _steps.concept(lesson, '', f)
    t(f'{lesson!r} → {want}', out['concept'] == want and out['by'] == 'keyword' and not f.calls and out['label'], out)
t('format·reset 같은 낱말 속 for·set 은 안 걸린다', _steps.by_keyword('format reset', '') is None)

f = fake({'concept': 'dict'})
out = _steps.concept('투표 결과 정리', '메뉴별 표 수', f)
t('규칙이 못 정하면 LLM 1번', out == {'concept': 'dict', 'label': _steps.CONCEPTS['dict'], 'by': 'llm'} and len(f.calls) == 1, out)
t('LLM 이 모르는 개념이면 GenerateError', raises(_steps.concept, '투표', '표', fake({'concept': 'regex'})) is not None)

print('\n[예시 목록]')
EX = [{'title': '매점 영수증', 'situation': '오늘 산 간식 가격이 목록으로 있어요.', 'why': '하나씩 꺼내서 더해 가기'},
      {'title': '줄넘기 일주일', 'situation': '하루하루 넘은 횟수를 적었어요.', 'why': '하나씩 보며 100 넘은 날 세기'},
      {'title': '아주아주아주 긴 제목이 붙은 예시', 'situation': '제목이 길어요.', 'why': '길다'},
      {'title': '반말 예시', 'situation': '너는 간식을 샀어.', 'why': '반말'},
      {'title': '화살표 예시', 'situation': '이유에 화살표가 있어요.', 'why': '→ 더하기'},
      {'title': '본 예시', 'situation': '이미 본 예시예요.', 'why': '겹침'}]
f = fake({'examples': EX}, {'examples': [{'title': '용돈 기입장', 'situation': '한 달 쓴 돈을 적었어요.', 'why': '하나씩 더하기'}]})
out = quiet(_steps.examples, 'for', None, ['본 예시'], f)
titles = [e['title'] for e in out['examples']]
t('길이 초과·반말·화살표 항목은 걸러진다', '아주아주아주 긴 제목이 붙은 예시' not in titles and '반말 예시' not in titles and '화살표 예시' not in titles, titles)
t('이미 본 제목은 뺀다', '본 예시' not in titles, titles)
t('걸러서 3개 미만이면 재요청 1번, 둘을 합친다', len(f.calls) == 2 and titles == ['매점 영수증', '줄넘기 일주일', '용돈 기입장'], titles)
t('재요청에 이미 본 제목·통과한 제목이 들어간다', '본 예시' in text(f) and '매점 영수증' in f.calls[1]['messages'][-1]['content'])
f = fake({'examples': EX[:2] + [{'title': '버스 도착', 'situation': '버스가 온 순서를 적었어요.', 'why': '마지막 꺼내기'}]})
quiet(_steps.examples, 'for', {'difficulty': 'easy', 'stages': {'base': 3}}, [], f)
t('3개 이상이면 재요청 없음 + 반 분포가 프롬프트에', len(f.calls) == 1 and '한 가지 개념만' in text(f))
t('그 개념의 참고 예시가 프롬프트에', '줄넘기 일주일(100번' in text(f) and '용돈 모으기' not in text(f))
t('모르는 개념이면 GenerateError', raises(_steps.examples, 'regex', None, [], fake()) is not None)

print('\n[만들기]')
GOOD = {
    'title': '매점 영수증 합계',
    'situation': '민지가 매점에서 간식을 샀어요. 용돈이 얼마나 남을지 알고 싶어요.',
    'brief': '영수증에 적힌 금액이 모두 얼마인지 알려 주세요.',
    'inputs': [{'name': '민지 영수증', 'v': '[1500, 800, 2000]'}, {'name': '준호 영수증', 'v': '[1200, 700]'},
               {'name': '서연 영수증', 'v': '[500, 300, 900, 1100]'}],
    'axis': 'count',
    'cards': [{'label': '하나씩 꺼내기', 'decoy': False}, {'label': '금액 더하기', 'decoy': False},
              {'label': '합계 보여 주기', 'decoy': False}, {'label': '가장 비싼 것 찾기', 'decoy': True}],
    'success': '영수증 금액을 모두 더한 값이 나오면 성공',
    'solution': 'total = 0\nfor x in data:\n    total += x\nprint(total)',
}
EXAMPLE = {'title': '매점 영수증', 'situation': '오늘 산 간식 가격이 목록으로 있어요.', 'why': '하나씩 꺼내서 더해 가기'}


def bad(**kw):
    return {**GOOD, **kw}


f = fake(GOOD)
d = quiet(_steps.build, 'for', EXAMPLE, '', None, [], f)['draft']
t('정상 초안은 한 번에 통과', len(f.calls) == 1 and d['kind'] == 'code' and d['concept'] == 'for', d)
t('자료 id·반례 표시는 코드가 붙인다', [i['id'] for i in d['inputs']] == ['d01', 'd02', 'd03']
  and d['inputs'][2].get('counter') is True and d['inputs'][2]['axis'] == 'count' and 'counter' not in d['inputs'][0])
t('성공 보기 = 진짜 + 요행 함정', d['define'] == {'q': '어떤 결과가 나오면 성공일까요?', 'options': [
    {'v': GOOD['success'], 'trap': None}, {'v': '에러 없이 끝나기만 하면 성공', 'trap': 'luck'}]}, d['define'])
t('validate_draft 가 정상 초안에 아무것도 안 낸다', _steps.validate_draft(d) == [], _steps.validate_draft(d))

f = fake(bad(inputs=[{'name': '민지 영수증', 'v': '1500원, 800원'}] + GOOD['inputs'][1:]), GOOD)
d = quiet(_steps.build, 'for', EXAMPLE, '', None, [], f)['draft']
t('v 가 리터럴이 아니면 이유를 붙여 재요청', len(f.calls) == 2 and 'd01' in f.calls[1]['messages'][-1]['content'] and d['title'] == GOOD['title'],
  f.calls[-1]['messages'][-1]['content'] if len(f.calls) > 1 else f.calls)
f = fake(bad(solution='import os\nprint(os.environ)'), GOOD)
quiet(_steps.build, 'for', EXAMPLE, '', None, [], f)
t('solution 에 import 면 재요청', len(f.calls) == 2 and 'import' in f.calls[1]['messages'][-1]['content'])
e = raises(_steps.build, 'for', EXAMPLE, '', None, [], fake(bad(solution='import os'), bad(solution='open("x")')))
t('두 번 다 걸리면 GenerateError(reasons)', e is not None and e.reasons, e and e.reasons)
t('JSON 이 아니어도 재요청', len((lambda f: (quiet(_steps.build, 'for', EXAMPLE, '', None, [], f), f)[1])(fake('엉터리', GOOD)).calls) == 2)

V = _steps.validate_draft
base = quiet(_steps.build, 'for', EXAMPLE, '', None, [], fake(GOOD))['draft']


def with_(**kw):
    x = copy.deepcopy(base)
    x.update(kw)
    return x


t('모르는 개념은 걸린다', V(with_(concept='regex')))
t('v 에 줄바꿈이 있으면 걸린다', V(with_(inputs=[{**base['inputs'][0], 'v': '[1,\n2]'}] + base['inputs'][1:])))
t('v 가 120자를 넘으면 걸린다', V(with_(inputs=[{**base['inputs'][0], 'v': repr(list(range(60)))}] + base['inputs'][1:])))
t('반례 축이 count·empty 밖이면 걸린다', V(with_(inputs=base['inputs'][:2] + [{**base['inputs'][2], 'axis': 'sep'}])))
t('decoy 가 둘이면 걸린다', V(with_(cards=[{'label': 'a', 'decoy': True}, {'label': 'b', 'decoy': True}, {'label': 'c', 'decoy': False}, {'label': 'd', 'decoy': False}])))
t('카드 이름이 14자를 넘으면 걸린다', V(with_(cards=[{'label': '아주 긴 카드 이름이 여기 있어요', 'decoy': False}] + base['cards'][1:])))
t('요청이 반말이면 걸린다', V(with_(brief='금액을 모두 더해 줘')))
t('요청에 방법이 있으면 걸린다', V(with_(brief='for 문으로 금액을 더해 주세요.')))
t('상황에 리스트가 있으면 걸린다', V(with_(situation='민지가 리스트를 만들었어요.')))
t('solution 이 data 를 다시 정하면 걸린다', V(with_(solution='data = [1]\nprint(sum(data))')))
t('solution 에 print 가 두 번이면 걸린다', V(with_(solution='print(1)\nprint(data)')))
t('solution 에 __ 이 있으면 걸린다', V(with_(solution='print(data.__class__)')))
t('solution 에 input( 이 있으면 걸린다', V(with_(solution='x = input()\nprint(data)')))

f = fake(GOOD)
quiet(_steps.build, 'for', EXAMPLE, '가' * 300 + '끝', None, ['자료 1과 반례의 답이 같아요'], f)
u = f.calls[0]['messages'][-1]['content']
t('problems 가 "지난 초안에서 걸린 점" 으로 들어간다', '지난 초안에서 걸린 점' in u and '자료 1과 반례의 답이 같아요' in u, u[-300:])
t('wish 는 200자에서 자르고 지시 아님을 붙인다', '가' * 200 in u and '가' * 201 not in u and '끝' not in u and '지시 아님' in u)
t('고른 예시가 프롬프트에', '매점 영수증' in u)
f = fake(GOOD)
quiet(_steps.build, 'for', EXAMPLE, '', None, ['x' * 300] * 10, f)
u = f.calls[0]['messages'][-1]['content']
t('problems 는 6개 × 200자까지', u.count('x' * 200) == 6 and 'x' * 201 not in u)

print('\n[따로 풀기]')
f = fake({'code': 'print(sum(data))'})
out = quiet(_steps.solve, base['situation'], base['brief'], base['inputs'], f)
t('code 를 돌려준다', out == {'code': 'print(sum(data))'}, out)
t('프롬프트에 모범 답안이 없다', 'total += x' not in text(f) and '[1500, 800, 2000]' in text(f))

print('\n[핸들러 — 강사만]')
ENV = {'SUPABASE_URL': 'https://x.supabase.co', 'SUPABASE_ANON_KEY': 'ANON', 'SUPABASE_SERVICE_ROLE_KEY': 'SERVICE'}


def sb(method, url, headers, body=None):
    if url.endswith('/auth/v1/user'):
        tok = headers['Authorization'][7:]
        return (200, {'id': {'TCH': 't1', 'STU': 's1'}[tok]}) if tok in ('TCH', 'STU') else (401, {})
    if '/rest/v1/profiles?select=role&id=eq.' in url:
        return 200, [{'role': 'teacher' if url.endswith('t1') else 'student'}]
    return 500, None


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), os.path.join(ROOT, 'api', name + '.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ms, gm = load('mission-steps'), load('generate-mission')
t('토큰이 없으면 401', ms.handle({'action': 'concept', 'lesson': 'for'}, '', ENV, sb)[0] == 401)
t('학생 토큰이면 403', ms.handle({'action': 'concept', 'lesson': 'for'}, 'STU', ENV, sb)[0] == 403)
t('모르는 action 은 400', ms.handle({'action': 'run'}, 'TCH', ENV, sb)[0] == 400)
t('강사면 concept 이 돈다', ms.handle({'action': 'concept', 'lesson': 'for 반복', 'keyPoint': ''}, 'TCH', ENV, sb) ==
  (200, {'concept': 'for', 'label': _steps.CONCEPTS['for'], 'by': 'keyword'}))
st, out = quiet(ms.handle, {'action': 'build', 'concept': 'for', 'example': EXAMPLE}, 'TCH', ENV, sb,
                llm=fake(bad(solution='import os'), bad(solution='import os')))
t('GenerateError 는 422 + reasons', st == 422 and out.get('reasons'), (st, out))
st, out = quiet(ms.handle, {'action': 'solve', 'situation': 's', 'brief': 'b', 'inputs': []}, 'TCH', ENV, sb,
                llm=lambda *a: (_ for _ in ()).throw(RuntimeError('down')))
t('LLM 이 죽으면 502', st == 502, (st, out))


def post(mod, body, auth=None):
    h = mod.handler.__new__(mod.handler)
    raw = json.dumps(body).encode()
    h.rfile, h.wfile = io.BytesIO(raw), io.BytesIO()
    h.headers = {'Content-Length': str(len(raw)), **({'Authorization': auth} if auth else {})}
    h.request_version, h.requestline, h.command = 'HTTP/1.1', 'POST /', 'POST'
    h.client_address, h.server = ('t', 0), None
    h.log_request = lambda *a: None
    h.do_POST()
    head, _, payload = h.wfile.getvalue().partition(b'\r\n\r\n')
    return int(head.split()[1]), json.loads(payload), head


code, _, head = post(ms, {'action': 'concept', 'lesson': 'for'})
t('mission-steps 핸들러: 토큰 없으면 401', code == 401)
t('Authorization 헤더를 허용한다', b'Content-Type, Authorization' in head)
t('generate-mission 도 토큰 없으면 401', post(gm, {'lesson': '리스트', 'keyPoint': '중복'})[0] == 401)

if __name__ == '__main__':
    print(f'\n{"FAIL " + str(fail) if fail else "ALL PASS"}')
    sys.exit(1 if fail else 0)
