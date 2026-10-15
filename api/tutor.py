"""POST /api/tutor  { question, mission: {title, itemName, items}, code }  → { kind, answer, refused }

Vercel Python 핸들러. 일은 _tutor.py 가 하고, 여기는 HTTP 만 다룬다.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _generate import pickle_llm  # noqa: E402
from _tutor import ask  # noqa: E402

QMAX = 300


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(200, {})

    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        except (ValueError, TypeError, UnicodeDecodeError):  # JSONDecodeError 는 ValueError
            return self._send(400, {'error': '요청 형식이 잘못됐어요.'})
        if not isinstance(body, dict):
            return self._send(400, {'error': '요청 형식이 잘못됐어요.'})
        q = str(body.get('question') or '').strip()[:QMAX]
        if not q:
            return self._send(400, {'error': '질문을 입력해 주세요.'})
        mission = body.get('mission') if isinstance(body.get('mission'), dict) else {}
        mission = {'title': str(mission.get('title') or ''), 'itemName': str(mission.get('itemName') or ''),
                   'items': [str(x) for x in (mission.get('items') if isinstance(mission.get('items'), list) else [])][:50]}
        code = str(body.get('code') or '')[:4000]
        try:
            r = ask(q, mission, code, pickle_llm)
            print('[tutor]', json.dumps({'q': q, **r}, ensure_ascii=False), file=sys.stderr)
            self._send(200, r)
        except Exception as e:  # LLM 서버 오류·키 없음
            print('[tutor] 오류', repr(e), file=sys.stderr)
            self._send(502, {'error': '튜터 서버에 연결하지 못했어요.'})
