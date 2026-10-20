"""POST /api/tutor-recap  { students: [{who, mid, title, brief, define, pairs}] }  + Authorization: Bearer <Supabase 토큰>
→ { items: [{point, who, mid, quote, refused}] }

Vercel Python 핸들러. 일은 _tutorrecap.py 가 하고, 여기는 HTTP·강사 확인만 다룬다.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _tutorrecap  # noqa: E402
from _auth import bearer, refuse, urllib_http  # noqa: E402

BAD = (400, {'error': '요청 형식이 잘못됐어요.'})


def handle(body, token, env, http=urllib_http, llm=None):
    """→ (status, json). llm 은 시험용 — 없으면 가벼운 모델."""
    return refuse(token, env, http) or serve(body, llm)


def serve(body, llm):
    if not isinstance(body, dict) or not isinstance(body.get('students'), list):
        return BAD
    try:
        return 200, _tutorrecap.recap(body['students'], **({'call_llm': llm} if llm else {}))
    except Exception as e:  # 형식 오류 두 번 · LLM 서버 오류 · 키 없음 · 시간 초과
        print('[tutor-recap] 오류', repr(e), file=sys.stderr)
        return 502, {'error': _tutorrecap.FAIL}


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
        # 강사 확인이 먼저 — 로그인 안 한 요청의 본문은 읽지도 파싱하지도 않는다
        denied = refuse(bearer(self.headers.get('Authorization')), os.environ, urllib_http)
        if denied:
            return self._send(*denied)
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        except (ValueError, TypeError, UnicodeDecodeError):
            return self._send(*BAD)
        self._send(*serve(body, None))
