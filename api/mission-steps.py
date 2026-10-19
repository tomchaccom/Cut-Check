"""POST /api/mission-steps  { action, ... }  + Authorization: Bearer <Supabase 토큰>

  concept   { lesson, keyPoint }                              → { concept, label, by }
  examples  { concept, seen, difficulty, stages }             → { examples: [{title, situation, why}] }
  build     { concept, example, wish, problems, difficulty, stages } → { draft }
  solve     { situation, brief, inputs }                      → { code }

Vercel Python 핸들러. 일은 _steps.py 가 하고, 여기는 HTTP·강사 확인만 다룬다.
서버는 LLM 만 부르고 AI 가 쓴 코드를 실행하지 않는다 — 실행은 강사 브라우저의 Pyodide 가 한다.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _steps  # noqa: E402
from _auth import bearer, refuse, urllib_http  # noqa: E402
from _generate import GenerateError, level_of  # noqa: E402

BAD = (400, {'error': '요청 형식이 잘못됐어요.'})


def _s(v, n):
    return str(v).strip()[:n] if isinstance(v, (str, int, float)) else ''


def _run(body, llm):
    kw = {'call_llm': llm} if llm else {}
    a = body.get('action')
    if a == 'concept':
        lesson, key = _s(body.get('lesson'), 300), _s(body.get('keyPoint'), 300)
        if not lesson:
            return 400, {'error': '수업 내용을 입력해주세요.'}
        return 200, _steps.concept(lesson, key, **kw)
    if a == 'examples':
        seen = body.get('seen') if isinstance(body.get('seen'), list) else []
        return 200, _steps.examples(body.get('concept'), level_of(body), seen, **kw)
    if a == 'build':
        if not isinstance(body.get('example'), dict):
            return BAD
        problems = body.get('problems') if isinstance(body.get('problems'), list) else []
        return 200, _steps.build(body.get('concept'), body['example'], _s(body.get('wish'), 200),
                                 level_of(body), problems, **kw)
    if a == 'solve':
        inputs = body.get('inputs') if isinstance(body.get('inputs'), list) else []
        return 200, _steps.solve(_s(body.get('situation'), 200), _s(body.get('brief'), 200), inputs, **kw)
    return BAD


def handle(body, token, env, http=urllib_http, llm=None):
    """→ (status, json). llm 은 시험용 — 없으면 단계마다 정한 모델."""
    denied = refuse(token, env, http)
    if denied:
        return denied
    if not isinstance(body, dict):
        return BAD
    try:
        return _run(body, llm)
    except GenerateError as e:
        # 사유는 로그에 남긴다 — 어떤 규칙이 얼마나 자주 걸리는지가 프롬프트 개선의 근거다
        print('[mission-steps] 실패', body.get('action'), json.dumps(e.reasons, ensure_ascii=False), file=sys.stderr)
        return 422, {'error': str(e), 'reasons': e.reasons}
    except Exception as e:  # LLM 서버 오류·키 없음·시간 초과
        print('[mission-steps] 오류', body.get('action'), repr(e), file=sys.stderr)
        return 502, {'error': '문제 생성 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'}


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
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        except (ValueError, TypeError, UnicodeDecodeError):
            return self._send(*BAD)
        self._send(*handle(body, bearer(self.headers.get('Authorization')), os.environ))
