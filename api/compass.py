"""POST /api/compass  { action, classroomId, ... }  + Authorization: Bearer <Supabase 토큰>  — 강사만

  list       { classroomId }                                   → { rows: [행] }
  analyze    { classroomId, studentId, missionId, force? }     → 행   (checks 가 있으면 AI 를 부르지 않는다. force 면 다시 판정한다)
  cumulative { classroomId, studentId }                        → { cumulative, rows: [행 + score] }   (최근 5개 미션, 최신순)
  send       { classroomId, studentId, missionId, note, dir? } → 행 + { cumulative }
             (dir: N|E|S|W|없음, note: 1..300자. 다시 보내면 덮어쓴다. 누적이 상쇄인데 dir 이 없으면 한마디만 저장하고
              학생 누적 바늘(student_view)은 그대로 둔다. 상쇄가 아니거나 dir 로 풀리면 그 학생의 최신 행 student_view 를 새로 쓴다)
행 = { studentId, missionId, checks, tutor_dirs, teacher_dir, teacher_note, sent_at }
cumulative = { needle_deg, dir, length, cancel, candidates, n }   (_compass.cumulative)

일은 _compass.py 가 하고 여기는 HTTP · 권한 · 저장만 한다. checks·점수는 강사 화면 전용 — 학생은 compass_mine_v2 · compass_note RPC 로 바늘과 한마디만 읽는다.
analyze 호출 수(vercel.json maxDuration 30초): 강사 확인 2 + 교실 1 + 수강 1 + 미션 1 + 행 1 + 이벤트 1 + 쓰기 1 = 8번 × TIMEOUT 3초
 + LLM. LLM 기한은 _compass.read 가 t0(요청을 받은 때)부터 DEADLINE 24초로 깎는다 — 24 + 쓰기 3 < 30.
"""
import json
import os
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _compass  # noqa: E402
from _accounts import UUID_RE  # noqa: E402
from _auth import NO_LINK, Fail, bearer, ident, urllib_http  # noqa: E402

MAX_BODY = 1_000_000
BAD = (400, {'error': '요청 형식이 잘못됐어요.'})
FAIL = _compass.FAIL
NOTE_MAX = 300
q = urllib.parse.quote
COLS = 'student_id,mission_id,checks,tutor_dirs,teacher_dir,teacher_note,sent_at'


def handle(body, token, env, http=urllib_http, llm=None, t0=None):
    """→ (status, json). 응답에는 키도 Supabase 원문 에러도 넣지 않는다. llm 은 시험용."""
    t0 = time.monotonic() if t0 is None else t0
    uid, denied = ident(token, env, http)
    if denied:
        return denied
    if not isinstance(body, dict):
        return BAD
    try:
        return 200, _run(body, _Db(env, http), uid, llm, t0)
    except Fail as f:
        return f.status, {'error': f.msg, **f.extra}
    except Exception as e:  # 시간 초과 · 연결 끊김 · LLM 서버 오류 — 원문은 로그에만
        print('[compass] 오류', type(e).__name__, file=sys.stderr)
        return 502, {'error': FAIL if isinstance(e, _compass.GenerateError) else NO_LINK}


class _Db:
    def __init__(self, env, http):
        self.url = env['SUPABASE_URL'].rstrip('/')
        key = env['SUPABASE_SERVICE_ROLE_KEY']
        self.h, self.http = {'apikey': key, 'Authorization': 'Bearer ' + key}, http

    def rows(self, method, path, body=None, prefer=None):
        h = {**self.h, 'Prefer': prefer} if prefer else self.h
        st, out = self.http(method, self.url + '/rest/v1/' + path, h, body)
        if st not in (200, 201) or not isinstance(out, list):
            raise Fail(502, NO_LINK)
        return out


def _id(body, key):
    v = body.get(key)
    if not isinstance(v, str) or not UUID_RE.fullmatch(v):
        raise Fail(400, BAD[1]['error'])
    return v


def _row(r):
    return {'studentId': r.get('student_id'), 'missionId': r.get('mission_id'), **{k: r.get(k) for k in COLS.split(',')[2:]}}


def _run(body, db, uid, llm, t0):
    a, room = body.get('action'), _id(body, 'classroomId')
    if a not in ('list', 'analyze', 'send', 'cumulative'):
        raise Fail(400, BAD[1]['error'])
    if a == 'send':
        d, note = body.get('dir'), body.get('note')
        note = note.strip() if isinstance(note, str) else ''
        if d is not None and d not in tuple(_compass.DIRS):
            raise Fail(400, BAD[1]['error'])
        if not 1 <= len(note) <= NOTE_MAX:
            raise Fail(400, f'한마디는 1자 이상 {NOTE_MAX}자 이하로 적어 주세요.')
    if a not in ('list', 'cumulative'):
        stu, mis = _id(body, 'studentId'), _id(body, 'missionId')
    # 내 교실인가 — _accounts.py 와 같은 패턴. 쓰기·AI 는 이 뒤에서만
    if not db.rows('GET', 'classrooms?select=id&id=eq.' + q(room) + '&teacher_id=eq.' + q(uid)):
        raise Fail(403, '내 교실 학생만 볼 수 있어요.')
    if a == 'list':
        return {'rows': [_row(r) for r in db.rows('GET', f'compass?select={COLS}&classroom_id=eq.' + q(room))]}
    if a == 'cumulative':
        stu = _id(body, 'studentId')
    if not db.rows('GET', 'enrollments?select=id&classroom_id=eq.' + q(room) + '&student_id=eq.' + q(stu)):
        raise Fail(403, '내 교실 학생만 볼 수 있어요.')
    if a == 'cumulative':
        return _cumulative(db, room, stu)
    ms = db.rows('GET', 'missions?select=data&id=eq.' + q(mis) + '&classroom_id=eq.' + q(room))
    if not ms:
        raise Fail(403, '내 교실 학생만 볼 수 있어요.')
    key = 'student_id=eq.' + q(stu) + '&mission_id=eq.' + q(mis)
    old = db.rows('GET', f'compass?select={COLS}&' + key)
    if a == 'send':
        if not old:
            raise Fail(409, '먼저 읽은 뒤에 보낼 수 있어요.')
        d = body.get('dir')
        if d is not None:  # 상쇄 중이면 겹친 후보 안에서만 고른다 — 이 행의 옛 선택은 빼고 계산
            c0 = _compass.cumulative([{**r, 'teacher_dir': None} if r.get('mission_id') == mis else r for r in _student_rows(db, room, stu)])
            if c0['cancel'] and d not in c0['candidates']:
                raise Fail(400, '겹친 방향 가운데서 골라 주세요.')
        change = {'teacher_note': note, 'sent_at': _now(), 'updated_at': _now()}
        if 'dir' in body:
            change['teacher_dir'] = d  # dir 키가 없으면 저장된 선택을 건드리지 않는다. 명시적 null 은 지운다
        saved = db.rows('PATCH', 'compass?' + key, change, 'return=representation')
        if not saved:
            raise Fail(409, '나침반 기록을 찾지 못했어요. 다시 읽어 주세요.')
        allrows = _student_rows(db, room, stu)
        cum = _compass.cumulative(allrows)
        if not cum['cancel'] and cum['needle_deg'] is not None and allrows:
            # 상쇄가 아닐 때만 학생 바늘을 바꾼다. 상쇄인데 고르지 않았으면 직전에 보낸 상태가 남는다. (최신 행 = 가장 최근에 마친 미션, done_at 기준)
            view = {k: cum[k] for k in ('needle_deg', 'dir', 'length')}
            view['sent_at'] = saved[0].get('sent_at')
            db.rows('PATCH', 'compass?student_id=eq.' + q(stu) + '&mission_id=eq.' + q(allrows[0]['mission_id']),
                    {'student_view': view}, 'return=representation')
        return {**_row(saved[0]), 'cumulative': cum}
    if old and old[0].get('checks') and body.get('force') is not True:
        return _row(old[0])
    # ponytail: 두 탭이 동시에 analyze 하면 LLM 을 두 번 부르고 마지막 upsert 가 이긴다. 필요하면 먼저 claim 행을 insert 한다
    evrows = db.rows('GET', 'student_events?select=event,created_at&' + key
                                              + '&classroom_id=eq.' + q(room) + '&order=created_at')
    events = [r.get('event') for r in evrows]
    if not any(isinstance(e, dict) and e.get('type') == 's-code-judge' for e in events):
        raise Fail(409, '아직 미션을 마치지 않았어요.')
    r = _compass.read(events, ms[0].get('data'), **({'call_llm': llm} if llm else {}), t0=t0)
    # facts 는 1차 열(not null)이라 빈 목록. levels·evidence·needle 은 2차에서 쓰지 않는다. merge-duplicates 라 보낸 한마디·시각은 그대로 남는다
    done = next((r.get('created_at') for r in evrows if isinstance(r.get('event'), dict) and r['event'].get('type') == 's-code-judge'), None)
    new = {'student_id': stu, 'mission_id': mis, 'classroom_id': room, 'checks': r['checks'], 'tutor_dirs': r['tutor_dirs'],
           'facts': [], 'done_at': done, 'updated_at': _now()}  # done_at = 미션을 마친 때 — 누적 순서의 기준
    if old and not old[0].get('checks'):
        new['teacher_dir'] = None  # 1차 행의 teacher_dir 는 '학생에게 보일 방향' 이었다. 2차의 '상쇄 때 고른 방향' 으로 읽히지 않게 버린다
    saved = db.rows('POST', 'compass?on_conflict=student_id,mission_id', new, 'resolution=merge-duplicates,return=representation')
    return _row(saved[0])


def _student_rows(db, room, stu):
    """그 학생의 나침반 행, 최신순(분석된 순서). 1차 행(checks 없음)도 섞여 있다 — cumulative 가 건너뛴다."""
    return db.rows('GET', f'compass?select={COLS}&classroom_id=eq.' + q(room) + '&student_id=eq.' + q(stu) + '&order=done_at.desc.nullslast,created_at.desc')


def _cumulative(db, room, stu):
    rows = _student_rows(db, room, stu)
    used = _compass.window(rows)
    return {'cumulative': _compass.cumulative(rows),
            'rows': [{**_row(r), 'score': _compass.score(r.get('checks'))} for r in used]}


def _now():
    return datetime.now(timezone.utc).isoformat()


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(200, {})

    def do_POST(self):
        t0 = time.monotonic()
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if n > MAX_BODY:
                return self._send(413, {'error': '보낸 내용이 너무 커요.'})
            body = json.loads(self.rfile.read(n) or b'{}')
        except (ValueError, TypeError, UnicodeDecodeError):
            body = None  # 강사 확인이 먼저 — 로그인 안 했으면 401 이 먼저 나간다
        self._send(*handle(body, bearer(self.headers.get('Authorization')), os.environ, urllib_http, t0=t0))
