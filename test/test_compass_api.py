"""나침반 API(api/compass.py) — Supabase 와 LLM 은 가짜.

  uv run --with-requirements requirements.txt python test/test_compass_api.py
"""
import importlib.util
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
spec = importlib.util.spec_from_file_location('compass_api', os.path.join(ROOT, 'api', 'compass.py'))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


def uid(c):
    return c * 8 + '-1111-2222-3333-' + c * 12


ME, ROOM, OTHER, STU, MIS = uid('a'), uid('b'), uid('c'), uid('d'), uid('e')
ENV = {'SUPABASE_URL': 'https://x.supabase.co/', 'SUPABASE_ANON_KEY': 'ANON', 'SUPABASE_SERVICE_ROLE_KEY': 'SERVICE-FAKE'}
MISSION = {'title': '쉼표', 'brief': 'b', 'keyPoint': 'k', 'inputs': [{'v': 'x'}]}
JUDGE = {'type': 's-code-judge', 'basis': '맞게 나왔다'}
EVENTS = [{'type': 's-define', 'choice': 'a'}, {'type': 's-code', 'code': 'print(1)', 'dataId': 'x'}, JUDGE]
GOOD = json.dumps({'levels': {'N': 1, 'E': 0, 'S': 0, 'W': 1}, 'evidence': {'N': ['f1'], 'W': ['f3']}, 'ai_note': '판정 근거를 적음'})


def fake(role='teacher', room=True, enrolled=True, mission=True, events=EVENTS, row=None):
    """compass 가 부르는 Supabase 경로만 흉내 낸다. 부른 것을 남긴다."""
    calls, state = [], {'row': row}

    def http(method, url, headers, body=None):
        calls.append((method, url, body))
        if url.endswith('/auth/v1/user'):
            return 200, {'id': ME, 'email': 'a@x.com'}
        if '/rest/v1/profiles?select=role' in url:
            return 200, [{'role': role}]
        if '/rest/v1/classrooms' in url:
            return 200, [{'id': ROOM}] if room else []
        if '/rest/v1/enrollments' in url:
            return 200, [{'id': 1}] if enrolled else []
        if '/rest/v1/missions' in url:
            return 200, [{'data': MISSION}] if mission else []
        if '/rest/v1/student_events' in url:
            return 200, [{'event': e} for e in events]
        if method == 'GET' and '/rest/v1/compass' in url:
            return 200, [state['row']] if state['row'] else []
        if method in ('POST', 'PATCH') and '/rest/v1/compass' in url:
            state['row'] = {**(state['row'] or {}), **body}
            return 200, [state['row']]
        return 404, None
    return http, calls, state


def llm_of(box, raw=GOOD):
    def llm(messages, schema, timeout):
        box.append(timeout)
        return raw
    return llm


def writes(calls):
    return [c for c in calls if c[0] in ('POST', 'PATCH') and '/rest/v1/compass' in c[1]]


def body(action, **kw):
    return {'action': action, 'classroomId': ROOM, 'studentId': STU, 'missionId': MIS, **kw}


# 강사가 아니면 401 · 403
http, calls, _ = fake()
t('토큰 없음 401', api.handle(body('list'), '', ENV, http, llm_of([]))[0] == 401)
http, calls, _ = fake(role='student')
t('학생 토큰 403', api.handle(body('analyze'), 'tok', ENV, http, llm_of([]))[0] == 403 and not writes(calls))

# 남의 교실 403 — 쓰기 0번, LLM 0번
for a, kw in (('list', {}), ('analyze', {}), ('send', {'dir': 'E', 'note': '잘했어'})):
    http, calls, _ = fake(room=False)
    box = []
    st, out = api.handle(body(a, **kw), 'tok', ENV, http, llm_of(box))
    t('남의 교실 403 ' + a, st == 403 and out['error'] == '내 교실 학생만 볼 수 있어요.' and not writes(calls) and not box, (st, out))
    t('남의 교실 URL 에 teacher_id 조건 ' + a, any('classrooms' in c[1] and 'teacher_id=eq.' + ME in c[1] for c in calls))

for a, kw in (('analyze', {}), ('send', {'dir': 'E', 'note': 'x'})):
    http, calls, _ = fake(enrolled=False)
    box = []
    st, out = api.handle(body(a, **kw), 'tok', ENV, http, llm_of(box))
    t('수강 안 한 학생 403 ' + a, st == 403 and not writes(calls) and not box, (st, out))
    http, calls, _ = fake(mission=False)
    st, out = api.handle(body(a, **kw), 'tok', ENV, http, llm_of(box))
    t('다른 교실 미션 403 ' + a, st == 403 and not writes(calls) and not box, (st, out))

# analyze: 한 번만 부른다
http, calls, state = fake()
box = []
st, out = api.handle(body('analyze'), 'tok', ENV, http, llm_of(box))
t('첫 analyze 200 · llm 1 · 쓰기 1', st == 200 and len(box) == 1 and len(writes(calls)) == 1, (st, out, len(box)))
t('행 모양', st == 200 and out['studentId'] == STU and out['missionId'] == MIS and out['levels']['N'] == 1
  and out['facts'] and out['ai_note'] and out['sent_at'] is None and out['teacher_dir'] is None, out)
t('upsert 는 충돌 키를 지정', 'on_conflict=student_id,mission_id' in writes(calls)[0][1], writes(calls)[0][1])
t('LLM 기한은 30 − 경과 − 3 이내', 0 < box[0] <= 24, box)
st, out = api.handle(body('analyze'), 'tok', ENV, http, llm_of(box))
t('행이 있으면 llm 0번', st == 200 and len(box) == 1 and len(writes(calls)) == 1, (st, len(box)))
st, out = api.handle(body('analyze', force=True), 'tok', ENV, http, llm_of(box))
t('force 면 다시 1번', st == 200 and len(box) == 2 and len(writes(calls)) == 2, (st, len(box)))

# 아직 판정 전
http, calls, _ = fake(events=[EVENTS[0], EVENTS[1]])
box = []
st, out = api.handle(body('analyze'), 'tok', ENV, http, llm_of(box))
t('judge 없으면 409', st == 409 and out['error'] == '아직 미션을 마치지 않았어요.' and not box and not writes(calls), (st, out))

# send: 방위를 고르면 바늘을 덮는다
SAVED = {'student_id': STU, 'mission_id': MIS, 'needle_deg': 18.4, 'strongest': 'N', 'levels': {'N': 3, 'E': 1, 'S': 0, 'W': 0}, 'evidence': {}, 'facts': []}
http, calls, state = fake(row=dict(SAVED))
st, out = api.handle(body('send', dir='E', note='이유까지 적었네'), 'tok', ENV, http, llm_of([]))
w = writes(calls)
t('send dir=E 면 90', st == 200 and out['needle_deg'] == 90 and out['teacher_dir'] == 'E' and out['teacher_note'] == '이유까지 적었네'
  and out['sent_at'], (st, out))
t('send 는 PATCH 한 번 · 키 두 개로 한 행만', len(w) == 1 and w[0][0] == 'PATCH' and 'student_id=eq.' + STU in w[0][1] and 'mission_id=eq.' + MIS in w[0][1], w)
http, calls, state = fake(row=dict(SAVED))
st, out = api.handle(body('send', dir=None, note='ok'), 'tok', ENV, http, llm_of([]))
t('send dir=None 이면 바늘 없이 한마디만', st == 200 and out['needle_deg'] is None and out['teacher_dir'] is None, out)
st, out = api.handle(body('send', dir='S', note='다시'), 'tok', ENV, http, llm_of([]))
t('다시 보내면 덮어쓴다', st == 200 and out['teacher_dir'] == 'S' and out['teacher_note'] == '다시' and len(writes(calls)) == 2, out)
http, calls, _ = fake()
st, out = api.handle(body('send', dir='E', note='x'), 'tok', ENV, http, llm_of([]))
t('읽기 전에는 send 409', st == 409 and not writes(calls), (st, out))

# 방위를 바꿔 보내도 원래 바늘을 잃지 않는다
http, calls, state = fake(row=dict(SAVED))
send = lambda **kw: api.handle(body('send', note='x', **kw), 'tok', ENV, http, llm_of([]))[1]
t('E → N 이면 18.4 로 돌아온다', send(dir='E')['needle_deg'] == 90 and abs(send(dir='N')['needle_deg'] - 18.4) < 0.1)
t('E → None 이면 바늘을 거둔다 · 다시 N 이면 18.4', send(dir='E')['needle_deg'] == 90 and send(dir=None)['needle_deg'] is None and abs(send(dir='N')['needle_deg'] - 18.4) < 0.1)
st, out = api.handle(body('send', dir='X', note='x'), 'tok', ENV, fake(row=dict(SAVED))[0], llm_of([]))
t('잘못된 dir 은 형식 오류 문장', st == 400 and out['error'] == api.BAD[1]['error'], out)
_h = fake(row=dict(SAVED))[0]
st, out = api.handle(body('send', dir='E', note='x'), 'tok', ENV, lambda m, u, h, b=None: (200, []) if m == 'PATCH' else _h(m, u, h, b), llm_of([]))
t('PATCH 가 빈 배열이면 409', st == 409 and '다시 읽어' in out['error'], (st, out))

# send 검증
for bad in ('', '   ', 'x' * 301, 5, None, ['a']):
    http, calls, _ = fake(row=dict(SAVED))
    st, out = api.handle(body('send', dir='E', note=bad), 'tok', ENV, http, llm_of([]))
    t('note %r → 400' % (str(bad)[:8],), st == 400 and not writes(calls), (st, out))
t('300자는 통과', api.handle(body('send', dir='E', note='x' * 300), 'tok', ENV, fake(row=dict(SAVED))[0], llm_of([]))[0] == 200)
for d in ('X', 'n', 1, 'NE'):
    st, _ = api.handle(body('send', dir=d, note='x'), 'tok', ENV, fake(row=dict(SAVED))[0], llm_of([]))
    t('dir %r → 400' % (d,), st == 400)
t('알 수 없는 action 400', api.handle({'action': 'zap', 'classroomId': ROOM}, 'tok', ENV, fake()[0], llm_of([]))[0] == 400)
t('uuid 아닌 id 400', api.handle(body('analyze', studentId='x'), 'tok', ENV, fake()[0], llm_of([]))[0] == 400)
t('body 가 dict 아님 400', api.handle([], 'tok', ENV, fake()[0], llm_of([]))[0] == 400)

# list
http, calls, state = fake(row={**SAVED, 'classroom_id': ROOM, 'ai_note': 'n', 'teacher_dir': None, 'teacher_note': None, 'sent_at': None})
st, out = api.handle({'action': 'list', 'classroomId': ROOM}, 'tok', ENV, http, llm_of([]))
t('list 200 rows', st == 200 and len(out['rows']) == 1 and out['rows'][0]['studentId'] == STU and out['rows'][0]['needle_deg'] == 18.4, (st, out))
t('list 는 쓰기 0', not writes(calls))

# LLM 실패 502 · 쓰기 없음
http, calls, _ = fake()
st, out = api.handle(body('analyze'), 'tok', ENV, http, llm_of([], raw='not json'))
t('LLM 형식 실패 502 · 쓰기 0', st == 502 and not writes(calls) and out['error'] == api.FAIL, (st, out))


def boom(messages, schema, timeout):
    raise RuntimeError('SECRET-LLM-ERROR')
http, calls, _ = fake()
st, out = api.handle(body('analyze'), 'tok', ENV, http, boom)
t('LLM 예외 502 · 원문 안 샘', st == 502 and not writes(calls) and 'SECRET' not in json.dumps(out), (st, out))

# 튜터 질문 원문은 facts 에 kind 'tutor' 로 저장된다 — 선생님이 근거를 읽는다
TUT = [{'type': 's-tutor', 'question': '쉼표가 뭐예요? <img src=x onerror=1>'}]
http, calls, _ = fake(events=EVENTS + TUT)
tg = json.dumps({'levels': {'N': 1, 'E': 0, 'S': 0, 'W': 1}, 'evidence': {'N': ['t1']}, 'ai_note': ''})
st, out = api.handle(body('analyze'), 'tok', ENV, http, llm_of([], tg))
t('저장된 facts 에 튜터 질문 원문', st == 200 and {'id': 't1', 'dir': None, 'kind': 'tutor', 'text': TUT[0]['question']} in out['facts']
  and out['evidence']['N'] == ['t1'], (st, out))
t('저장 본문에도 있다', any(f.get('kind') == 'tutor' for f in writes(calls)[0][2]['facts']))

print('\nFAIL ' + str(fail) if fail else '\nOK')
sys.exit(1 if fail else 0)
