"""수업에서 짚을 거리(api/_tutorrecap.py, api/tutor-recap.py) — LLM·Supabase 는 가짜로 끼운다.

  uv run --with-requirements requirements.txt python test/test_tutor_recap.py
"""
import importlib.util
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
import _tutorrecap  # noqa: E402

spec = importlib.util.spec_from_file_location('tutor_recap', os.path.join(ROOT, 'api', 'tutor-recap.py'))
fn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fn)

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


def fake(*answers):
    calls = []

    def call(messages, schema, timeout):
        calls.append(messages)
        a = answers[min(len(calls), len(answers)) - 1]
        return a if isinstance(a, str) else json.dumps(a, ensure_ascii=False)
    call.calls = calls
    return call


ENV = {'SUPABASE_URL': 'http://sb', 'SUPABASE_ANON_KEY': 'a', 'SUPABASE_SERVICE_ROLE_KEY': 's'}


def http_ok(method, url, headers, body=None):
    return (200, {'id': 'u1'}) if '/auth/v1/user' in url else (200, [{'role': 'teacher'}])


def stu(who, pairs=None, mid='m1'):
    return {'who': who, 'mid': mid, 'title': '급식', 'brief': '메뉴를 센다', 'define': '',
            'pairs': pairs or [{'q': '왜 34가 나와요?', 'a': '값을 보세요', 'refused': False}]}


def item(point, who, quote, mid='m1'):
    return {'point': point, 'who': who, 'mid': mid, 'quote': quote}


# 인증
llm = fake({'items': []})
st, _ = fn.handle({'students': [stu('s1')]}, '', ENV, http_ok, llm)
t('토큰 없음 → 401, LLM 0회', st == 401 and not llm.calls)

# 빈 목록
llm = fake({'items': []})
t('빈 students → 200 items [], LLM 0회',
  fn.handle({'students': []}, 'tk', ENV, http_ok, llm) == (200, {'items': []}) and not llm.calls)
t('students 가 목록이 아니면 400', fn.handle({'students': 'x'}, 'tk', ENV, http_ok, llm)[0] == 400)

# 입력 상한
llm = fake({'items': []})
fn.handle({'students': [stu(f's{i}') for i in range(41)]}, 'tk', ENV, http_ok, llm)
sent = llm.calls[0][-1]['content']
t('41명 → 40명만 보낸다', sent.count('"who"') == 40, sent.count('"who"'))
llm = fake({'items': []})
pairs = [{'q': f'질문{i}', 'a': 'a', 'refused': False} for i in range(25)]
fn.handle({'students': [stu('s1', pairs)]}, 'tk', ENV, http_ok, llm)
sent = llm.calls[0][-1]['content']
t('25쌍 → 최근 20쌍만', '질문24' in sent and '질문5"' in sent and '질문4"' not in sent)

# 검사
two = [stu('s1', [{'q': '왜 34가 나와요?', 'a': 'x', 'refused': True}]), stu('s2', [{'q': '다른 질문', 'a': 'x', 'refused': False}])]
llm = fake({'items': [
    item('split 결과는 문자열', ['s1', 's2'], '왜 34가 나와요?'),
    item('x', ['s9'], '왜 34가 나와요?'),
    item('잘했어요 get', ['s1'], '왜 34가 나와요?'),
    item('get 을 쓰세요', ['s1'], '왜 34가 나와요?'),
    item('정상', ['s1'], '안 한 질문'),
]})
st, out = fn.handle({'students': two}, 'tk', ENV, http_ok, llm)
t('첫 항목만 남는다', st == 200 and [i['point'] for i in out['items']] == ['split 결과는 문자열'], out)
t('who·mid 유지', out['items'][0]['who'] == ['s1', 's2'] and out['items'][0]['mid'] == 'm1')
t('quote 쌍이 refused 면 True', out['items'][0]['refused'] is True)
llm = fake({'items': [item('긴 ' + '말' * 60, ['s1'], '왜 34가 나와요?'),
                      item('너는 헷갈려', ['s1'], '왜 34가 나와요?'),
                      item('값 확인하기', ['s1'], '왜 34가 나와요?')]})
out = fn.handle({'students': two}, 'tk', ENV, http_ok, llm)[1]
t('60자 초과·반말·너 거절', [i['point'] for i in out['items']] == ['값 확인하기'], out)

# 상한: 학생당 3, 전체 8
q = [{'q': f'질문{i}', 'a': 'a', 'refused': False} for i in range(12)]
llm = fake({'items': [item(f'개념 {i}', ['s1'], f'질문{i}') for i in range(5)]})
out = fn.handle({'students': [stu('s1', q)]}, 'tk', ENV, http_ok, llm)[1]
t('학생당 최대 3', len(out['items']) == 3, out)
many = [stu(f's{i}', [{'q': 'q', 'a': 'a', 'refused': False}]) for i in range(10)]
llm = fake({'items': [item(f'개념 {i}', [f's{i}'], 'q') for i in range(10)]})
out = fn.handle({'students': many}, 'tk', ENV, http_ok, llm)[1]
t('전체 최대 8', len(out['items']) == 8, len(out['items']))
llm = fake({'items': [item('하나', ['s0'], 'q'), item('둘', ['s0', 's1', 's2'], 'q')]})
out = fn.handle({'students': many}, 'tk', ENV, http_ok, llm)[1]
t('묶인 학생 많은 순', out['items'][0]['point'] == '둘', out)

# 재요청
llm = fake('아무 말', '이것도 아님')
st, out = fn.handle({'students': [stu('s1')]}, 'tk', ENV, http_ok, llm)
t('JSON 아님 두 번 → 1회 재요청 후 502', st == 502 and len(llm.calls) == 2 and '지금은 뽑지 못했어요' in out['error'], (st, len(llm.calls)))
llm = fake('아무 말', {'items': [item('값 확인하기', ['s1'], '왜 34가 나와요?')]})
st, out = fn.handle({'students': [stu('s1')]}, 'tk', ENV, http_ok, llm)
t('재요청에서 살아나면 200', st == 200 and len(out['items']) == 1)

def boom(*a):
    raise RuntimeError('down')
t('LLM 오류 → 502', fn.handle({'students': [stu('s1')]}, 'tk', ENV, http_ok, boom)[0] == 502)

print('\nFAIL ' + str(fail) if fail else '\nOK')
sys.exit(1 if fail else 0)
