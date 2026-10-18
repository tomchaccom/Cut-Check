"""POST /api/create-student  Authorization: Bearer <선생님 access token>
  { action: 'create', classroomId, name, loginId, password? } → { loginId, password, id, name }
  { action: 'reset',  classroomId, loginId, password? }       → { loginId, password }

Vercel Python 핸들러. 일은 _accounts.py 가 하고, 여기는 HTTP 만 다룬다.
환경변수: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (값은 저장소에 두지 않는다)
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _accounts import bearer, handle  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')   # 비밀번호가 담긴다
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        except (ValueError, TypeError, UnicodeDecodeError):
            return self._send(400, {'error': '요청 형식이 잘못됐어요.'})
        code, out = handle(body, bearer(self.headers.get('Authorization')), os.environ)   # 예외는 handle 이 502 로 바꾼다
        self._send(code, out)
