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
GOOD = json.dumps({'items': {'N2': {'ok': True, 'quote': 'print(1)'}, 'W2': {'ok': True, 'quote': '맞게 나왔다'}, 'N3': {'ok': True, 'quote': '없는 문장'}},
                   'tutor': [{'id': 't1', 'dir': 'S'}]})


def fake(role='teacher', room=True, enrolled=True, mission=True, events=EVENTS, row=None, rows=None):
    """compass 가 부르는 Supabase 경로만 흉내 낸다. 부른 것을 남긴다."""
    calls, state = [], {'row': row, 'rows': list(rows or [])}

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
            return 200, [{'event': e, 'created_at': '2026-10-20T00:00:%02dZ' % i} for i, e in enumerate(events)]
        if method == 'GET' and '/rest/v1/compass' in url:
            if 'mission_id=eq.' in url:
                return 200, [state['row']] if state['row'] else []
            rs = list(state['rows'])
            if 'order=done_at.desc' in url:   # 서버가 요청한 정렬을 흉내 낸다 — done_at 이 없으면 뒤로
                rs.sort(key=lambda r: r.get('created_at', ''), reverse=True)
                rs.sort(key=lambda r: r.get('done_at') or '', reverse=True)
            elif 'order=created_at.desc' in url:
                rs.sort(key=lambda r: r.get('created_at', ''), reverse=True)
            return 200, rs
        if method in ('POST', 'PATCH') and '/rest/v1/compass' in url:
            if method == 'PATCH':
                mid = url.split('mission_id=eq.')[1].split('&')[0]
                tgt = next((r for r in state['rows'] if r['mission_id'] == mid), None) or (state['row'] if state['row'] and state['row'].get('mission_id') == mid else None)
                if tgt is None:
                    return 200, []
                tgt.update(body)
                return 200, [tgt]
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
for a, kw in (('list', {}), ('analyze', {}), ('send', {'dir': 'E', 'note': '잘했어'}), ('cumulative', {})):
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
t('행 모양: checks 12칸 · tutor_dirs · 학생 열 없음', st == 200 and out['studentId'] == STU and out['missionId'] == MIS and len(out['checks']) == 12
  and out['tutor_dirs'] == {'N': 0, 'E': 0, 'S': 0, 'W': 0} and out['sent_at'] is None and out['teacher_dir'] is None
  and 'levels' not in out and 'student_view' not in out, out)
t('AI 근거 대조가 저장에 반영', out['checks']['N2'] == {'ok': True, 'quote': 'print(1)'} and out['checks']['W2']['ok']
  and out['checks']['N3'] == {'ok': False, 'quote': ''}, out['checks'])
t('upsert 는 충돌 키를 지정 · 점수 열 없음', 'on_conflict=student_id,mission_id' in writes(calls)[0][1]
  and not {'levels', 'needle_deg', 'strongest', 'ai_note'} & set(writes(calls)[0][2]), writes(calls)[0])
t('LLM 기한은 30 − 경과 − 3 이내', 0 < box[0] <= 24, box)
st, out = api.handle(body('analyze'), 'tok', ENV, http, llm_of(box))
t('checks 가 있으면 llm 0번', st == 200 and len(box) == 1 and len(writes(calls)) == 1, (st, len(box)))
st, out = api.handle(body('analyze', force=True), 'tok', ENV, http, llm_of(box))
t('force 면 다시 1번', st == 200 and len(box) == 2 and len(writes(calls)) == 2, (st, len(box)))
V1 = {'student_id': STU, 'mission_id': MIS, 'levels': {'N': 3, 'E': 0, 'S': 0, 'W': 0}, 'evidence': {}, 'needle_deg': 0, 'sent_at': '2026-10-20T00:00:00Z', 'teacher_note': '옛 한마디', 'teacher_dir': 'N'}
http, calls, state = fake(row=dict(V1))
box = []
st, out = api.handle(body('analyze'), 'tok', ENV, http, llm_of(box))
t('1차 행(checks 없음)은 한 번 다시 읽는다 · 보낸 한마디는 그대로', st == 200 and len(box) == 1 and len(out['checks']) == 12
  and out['teacher_note'] == '옛 한마디' and out['sent_at'], (st, out))
t('1차 행의 옛 teacher_dir 는 첫 2차 판정에서 지워진다', out['teacher_dir'] is None, out)
st, out = api.handle(body('list') | {'classroomId': ROOM}, 'tok', ENV, fake(row=dict(V1), rows=[dict(V1)])[0], llm_of([]))
t('1차 행도 list 에서 안 죽는다', st == 200 and out['rows'][0]['checks'] is None, (st, out))

# 아직 판정 전
http, calls, _ = fake(events=[EVENTS[0], EVENTS[1]])
box = []
st, out = api.handle(body('analyze'), 'tok', ENV, http, llm_of(box))
t('judge 없으면 409', st == 409 and out['error'] == '아직 미션을 마치지 않았어요.' and not box and not writes(calls), (st, out))


def ck(**ok):
    return {k: {'ok': k in ok, 'quote': ''} for k in ('N1', 'N2', 'N3', 'E1', 'E2', 'E3', 'S1', 'S2', 'S3', 'W1', 'W2', 'W3')}


def mrow(mid, n=0, e=0, s=0, w=0, **kw):
    on = [d + str(i + 1) for d, v in zip('NESW', (n, e, s, w)) for i in range(v)]
    return {'student_id': STU, 'mission_id': mid, 'checks': ck(**{k: 1 for k in on}), 'tutor_dirs': {'N': 0, 'E': 0, 'S': 0, 'W': 0},
            'teacher_dir': None, 'teacher_note': None, 'sent_at': None, **kw}


M2, M3 = uid('f'), uid('1')

# 1차 행 둘이 옛 teacher_dir='N' 을 갖고 있어도, 다시 읽고 나면 누적 바늘은 체크(S)를 따른다
old2 = [dict(V1, mission_id=m) for m in (MIS, M2)]
redone = []
for r in old2:
    st, o = api.handle(body('analyze') | {'missionId': r['mission_id']}, 'tok', ENV, fake(row=dict(r))[0], llm_of([]))
    redone.append(mrow(r['mission_id'], s=3, teacher_dir=o['teacher_dir']))
cum = api._compass.cumulative(redone + [mrow(M3, s=3)])
t('옛 teacher_dir 둘이 있던 S 세 행 → 바늘 S', all(r['teacher_dir'] is None for r in redone) and cum['dir'] == 'S' and not cum['cancel'], (redone, cum))

# send — 상쇄가 아니면 학생 바늘(student_view)을 최신 행에 쓴다
mine = mrow(MIS, n=3)
newer = mrow(M2, n=3)
http, calls, state = fake(row=mine, rows=[newer, mine])
st, out = api.handle(body('send', dir=None, note='이유까지 적었네'), 'tok', ENV, http, llm_of([]))
t('send 200 · 한마디 · 시각 · 누적 동봉', st == 200 and out['teacher_note'] == '이유까지 적었네' and out['sent_at'] and out['cumulative']['dir'] == 'N', (st, out))
t('student_view 는 최신 행에, {needle_deg, dir, length, sent_at}', newer.get('student_view', {}).get('dir') == 'N'
  and set(newer['student_view']) == {'needle_deg', 'dir', 'length', 'sent_at'} and 'student_view' not in mine, (newer, mine))
t('send 는 PATCH 2번(한마디 · 학생 바늘)', [c[0] for c in writes(calls)] == ['PATCH', 'PATCH'], writes(calls))
t('학생 열에 checks·점수가 없다', not {'checks', 'levels', 'score', 'quote'} & set(newer['student_view']))

# 상쇄 — R4: dir 없이 보내면 한마디만, student_view 그대로
a_row, b_row = mrow(MIS, n=3, s=3), mrow(M2, n=3, s=3)
prev = {'needle_deg': 90, 'dir': 'E', 'length': 0.5, 'sent_at': '2026-10-19T00:00:00Z'}
a_row['student_view'] = dict(prev)
http, calls, state = fake(row=a_row, rows=[a_row, b_row])
st, out = api.handle(body('send', note='둘 다 보였어요'), 'tok', ENV, http, llm_of([]))
t('상쇄 + dir 없음 → 한마디만 저장(200) · 후보 반환', st == 200 and out['teacher_note'] == '둘 다 보였어요' and out['cumulative']['cancel']
  and out['cumulative']['candidates'] == ['N', 'S'], (st, out))
t('상쇄 + dir 없음 → student_view 안 바뀜 · 쓰기는 PATCH 1번', a_row['student_view'] == prev and len(writes(calls)) == 1, (b_row, writes(calls)))
st, out = api.handle(body('send', dir='S', note='구현이 더 보였어요'), 'tok', ENV, http, llm_of([]))
t('상쇄 + dir=S → 그 미션 행에 teacher_dir · 누적이 S 정중앙 · 학생에게 간다',
  st == 200 and a_row['teacher_dir'] == 'S' and not out['cumulative']['cancel'] and out['cumulative']['needle_deg'] == 180
  and a_row['student_view']['dir'] == 'S' and a_row['student_view']['needle_deg'] == 180, (st, out, b_row))
st, out2 = api.handle(body('send', dir='S', note='구현이 더 보였어요'), 'tok', ENV, http, llm_of([]))
t('같은 선택을 다시 보내도 같은 누적', out2['cumulative'] == out['cumulative'])
st, o3 = api.handle(body('send', note='말만 고침'), 'tok', ENV, http, llm_of([]))
t('dir 키 없이 다시 보내면 저장된 선택이 남는다', a_row['teacher_dir'] == 'S' and not o3['cumulative']['cancel'] and o3['cumulative']['dir'] == 'S', (a_row, o3))
st, o3 = api.handle(body('send', dir=None, note='선택 취소'), 'tok', ENV, http, llm_of([]))
t('dir 를 null 로 명시하면 지운다', a_row['teacher_dir'] is None and o3['cumulative']['cancel'], (a_row, o3))
st, o3 = api.handle(body('send', dir='E', note='후보 밖'), 'tok', ENV, http, llm_of([]))
t('상쇄 중 후보 밖 방향은 400 · 쓰기 없음', st == 400 and a_row['teacher_dir'] is None, (st, o3, a_row))

# 마친 순서가 분석 순서와 다르다 — 누적과 student_view 는 마친 순서를 따른다
early = mrow(MIS, n=1, done_at='2026-10-20T01:00:00Z', created_at='2026-10-20T09:00:00Z')   # 먼저 마쳤지만 나중에 분석
late = mrow(M2, s=3, done_at='2026-10-20T05:00:00Z', created_at='2026-10-20T08:00:00Z')     # 나중에 마쳤지만 먼저 분석
http, calls, state = fake(row=early, rows=[early, late])
st, out = api.handle(body('send', note='순서'), 'tok', ENV, http, llm_of([]))
t('student_view 는 가장 늦게 마친 미션 행에 · 누적은 그 미션이 가장 세다', 'student_view' in late and 'student_view' not in early and out['cumulative']['dir'] == 'S', (late, early, out))
t('학생 행은 done_at 으로 정렬해 읽는다', any('order=done_at.desc.nullslast' in c[1] for c in calls if c[0] == 'GET' and 'compass?' in c[1]))
http, calls, state = fake(events=EVENTS)
api.handle(body('analyze'), 'tok', ENV, http, llm_of([]))
t('analyze 가 done_at 에 첫 s-code-judge 의 시각을 저장', writes(calls)[0][2]['done_at'] == '2026-10-20T00:00:02Z', writes(calls)[0][2])
http, calls, state = fake(events=[JUDGE] + EVENTS[:2] + [JUDGE])
api.handle(body('analyze'), 'tok', ENV, http, llm_of([]))
t('judge 가 여럿이면 첫 번째', writes(calls)[0][2]['done_at'] == '2026-10-20T00:00:00Z', writes(calls)[0][2])

# 옛 선택은 새 상쇄를 풀지 못한다 — 선생님이 다시 알림을 받고 후보를 본다
old_pick = mrow(MIS, n=3, s=3, teacher_dir='S')
newc = mrow(M2, e=3, w=3)
http, calls, state = fake(row=old_pick, rows=[newc, old_pick])
st, out = api.handle(body('send', note='x'), 'tok', ENV, http, llm_of([]))
t('새 상쇄는 옛 선택이 풀지 않는다(E/W 후보)', st == 200 and out['cumulative']['cancel'] and out['cumulative']['candidates'] == ['E', 'W'] and 'student_view' not in newc, (st, out))

# 1차 행뿐인 학생에게 send — 바늘이 없으니 student_view 를 안 쓴다
v1 = {'student_id': STU, 'mission_id': MIS, 'levels': {'N': 1}}
http, calls, state = fake(row=v1, rows=[v1])
st, out = api.handle(body('send', note='ok'), 'tok', ENV, http, llm_of([]))
t('1차 행뿐이면 한마디만 · student_view 없음', st == 200 and 'student_view' not in v1 and out['cumulative']['n'] == 0, (st, out))

http, calls, _ = fake()
st, out = api.handle(body('send', dir='E', note='x'), 'tok', ENV, http, llm_of([]))
t('읽기 전에는 send 409', st == 409 and not writes(calls), (st, out))
st, out = api.handle(body('send', dir='X', note='x'), 'tok', ENV, fake(row=mrow(MIS))[0], llm_of([]))
t('잘못된 dir 은 형식 오류 문장', st == 400 and out['error'] == api.BAD[1]['error'], out)
_h = fake(row=mrow(MIS))[0]
st, out = api.handle(body('send', dir='E', note='x'), 'tok', ENV, lambda m, u, h, b=None: (200, []) if m == 'PATCH' else _h(m, u, h, b), llm_of([]))
t('PATCH 가 빈 배열이면 409', st == 409 and '다시 읽어' in out['error'], (st, out))

# send 검증
for bad in ('', '   ', 'x' * 301, 5, None, ['a']):
    http, calls, _ = fake(row=mrow(MIS))
    st, out = api.handle(body('send', dir='E', note=bad), 'tok', ENV, http, llm_of([]))
    t('note %r → 400' % (str(bad)[:8],), st == 400 and not writes(calls), (st, out))
t('300자는 통과', api.handle(body('send', dir='E', note='x' * 300), 'tok', ENV, fake(row=mrow(MIS), rows=[mrow(MIS)])[0], llm_of([]))[0] == 200)
for d in ('X', 'n', 1, 'NE'):
    st, _ = api.handle(body('send', dir=d, note='x'), 'tok', ENV, fake(row=mrow(MIS))[0], llm_of([]))
    t('dir %r → 400' % (d,), st == 400)
t('알 수 없는 action 400', api.handle({'action': 'zap', 'classroomId': ROOM}, 'tok', ENV, fake()[0], llm_of([]))[0] == 400)
t('uuid 아닌 id 400', api.handle(body('analyze', studentId='x'), 'tok', ENV, fake()[0], llm_of([]))[0] == 400)
t('body 가 dict 아님 400', api.handle([], 'tok', ENV, fake()[0], llm_of([]))[0] == 400)

# cumulative — 강사용, 최근 5개
rows7 = [mrow(uid(c), n=3) for c in 'abcdefg']
rows7[0] = mrow(uid('a'), e=3)
http, calls, _ = fake(rows=[{'student_id': STU, 'mission_id': uid('9'), 'levels': {}}] + rows7)
st, out = api.handle({'action': 'cumulative', 'classroomId': ROOM, 'studentId': STU}, 'tok', ENV, http, llm_of([]))
t('cumulative 200 · 1차 행은 건너뜀 · 5개만', st == 200 and len(out['rows']) == 5 and out['cumulative']['n'] == 5 and out['rows'][0]['missionId'] == uid('a'), (st, out))
t('cumulative 행에 checks 와 score(근거 인용 포함)', out['rows'][0]['score'] == {'N': 0, 'E': 3, 'S': 0, 'W': 0} and 'quote' in out['rows'][0]['checks']['E1'])
t('cumulative 는 쓰기 0 · LLM 0', not writes(calls))
t('cumulative 는 마친 순서로 읽는다', any('order=done_at.desc.nullslast,created_at.desc' in c[1] for c in calls))
for kw, why in (({'room': False}, '남의 교실'), ({'enrolled': False}, '수강 안 한 학생')):
    http, calls, _ = fake(**{('room' if 'room' in kw else 'enrolled'): False})
    st, out = api.handle({'action': 'cumulative', 'classroomId': ROOM, 'studentId': STU}, 'tok', ENV, http, llm_of([]))
    t('cumulative ' + why + ' 403', st == 403 and not writes(calls), (st, out))
http, _, _ = fake(role='student')
t('cumulative 학생 토큰 403', api.handle({'action': 'cumulative', 'classroomId': ROOM, 'studentId': STU}, 'tok', ENV, http, llm_of([]))[0] == 403)
t('cumulative studentId 없으면 400', api.handle({'action': 'cumulative', 'classroomId': ROOM}, 'tok', ENV, fake()[0], llm_of([]))[0] == 400)

# cumulative 의 12칸 표는 누적이 쓴 행과 같다
t('rows 는 _compass.window 와 같은 행', [r['missionId'] for r in api.handle({'action': 'cumulative', 'classroomId': ROOM, 'studentId': STU}, 'tok', ENV, fake(rows=rows7)[0], llm_of([]))[1]['rows']]
  == [r['mission_id'] for r in api._compass.window(rows7)])

# 학생 RPC 는 선생님 열을 주지 않는다 — 마이그레이션 문장으로 지킨다
import re
MIG = open(os.path.join(ROOT, 'supabase/migrations/20261022000000_compass_v2.sql'), encoding='utf-8').read()
for fn, cols in (('compass_mine_v2', ['needle_deg', 'dir', 'length', 'sent_at']), ('compass_note', ['teacher_note', 'sent_at'])):
    m = re.search(r'function public\.' + fn + r'\([^)]*\)\s*returns table \(([^)]*)\) as \$\$(.*?)\$\$', MIG, re.S)
    got = [c.split()[0] for c in m.group(1).split(',')]
    t(fn + ' 반환 열은 허용된 것뿐', got == cols, got)
    t(fn + ' 본문은 checks·tutor_dirs·evidence·levels 를 읽지 않는다', not re.search(r'checks|tutor_dirs|evidence|levels|facts', m.group(2)), m.group(2))
    t(fn + ' anon 실행 권한을 거둔다', 'revoke execute on function public.' + fn in MIG)

# list
http, calls, state = fake(row=mrow(MIS, n=3), rows=[mrow(MIS, n=3)])
st, out = api.handle({'action': 'list', 'classroomId': ROOM}, 'tok', ENV, http, llm_of([]))
t('list 200 rows', st == 200 and len(out['rows']) == 1 and out['rows'][0]['studentId'] == STU and len(out['rows'][0]['checks']) == 12, (st, out))
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

# 튜터 질문 분류 개수가 저장된다
TUT = [{'type': 's-tutor', 'question': '쉼표가 뭐예요?'}]
http, calls, _ = fake(events=EVENTS + TUT)
st, out = api.handle(body('analyze'), 'tok', ENV, http, llm_of([], GOOD))
t('tutor_dirs 저장', st == 200 and out['tutor_dirs'] == {'N': 0, 'E': 0, 'S': 1, 'W': 0}, (st, out))

print('\nFAIL ' + str(fail) if fail else '\nOK')
sys.exit(1 if fail else 0)
