"""POST /api/tutor  { question, mission, code, define, design, lastOutput, lastError, history }
  → { kind, answer, refused, reasons, retried, judged }

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


def _s(v, n=100):
    return str(v or '')[:n]


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
        m = body.get('mission') if isinstance(body.get('mission'), dict) else {}
        items = m.get('items') if isinstance(m.get('items'), list) else []
        inputs = m.get('inputs') if isinstance(m.get('inputs'), list) else []
        design = body.get('design') if isinstance(body.get('design'), list) else []
        hist = body.get('history') if isinstance(body.get('history'), list) else []
        ctx = {
            'mission': {'title': _s(m.get('title')), 'itemName': _s(m.get('itemName')),
                        'items': [_s(x) for x in items][:50], 'situation': _s(m.get('situation'), 200),
                        'brief': _s(m.get('brief'), 200),
                        'inputs': [{'name': _s(i.get('name'), 40), 'v': _s(i.get('v'), 200)}
                                   for i in inputs[:5] if isinstance(i, dict)]},
            'code': _s(body.get('code'), 4000), 'define': _s(body.get('define'), 200),
            'design': [_s(x, 40) for x in design][:12],
            'last_output': _s(body.get('lastOutput'), 500), 'last_error': _s(body.get('lastError'), 500),
            'history': [{'q': _s(h.get('q'), 300), 'a': _s(h.get('a'), 300)} for h in hist[:3] if isinstance(h, dict)],
        }
        try:
            r = ask(q, ctx, pickle_llm)
            print('[tutor]', json.dumps({'q': q, **r}, ensure_ascii=False), file=sys.stderr)
            self._send(200, r)
        except Exception as e:  # LLM 서버 오류·키 없음
            print('[tutor] 오류', repr(e), file=sys.stderr)
            self._send(502, {'error': '튜터 서버에 연결하지 못했어요.'})
