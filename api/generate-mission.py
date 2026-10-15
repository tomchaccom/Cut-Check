"""POST /api/generate-mission  { lesson, keyPoint }  → 미션 JSON (+ guard)

Vercel Python 핸들러. 일은 _generate.py 가 하고, 여기는 HTTP 만 다룬다.
(파일 이름의 하이픈은 주소를 예전 Node 함수와 같게 두려는 것 — 그래서 import 는 못 한다)
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _generate import GenerateError, generate  # noqa: E402


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
        except json.JSONDecodeError:
            return self._send(400, {'error': '요청 형식이 잘못됐어요.'})
        lesson = str(body.get('lesson') or '').strip()
        key_point = str(body.get('keyPoint') or '').strip()
        if not lesson:
            return self._send(400, {'error': '수업 내용을 입력해주세요.'})
        if not key_point:
            return self._send(400, {'error': '핵심을 입력해주세요.'})
        try:
            self._send(200, generate(lesson, key_point))
        except GenerateError as e:
            # 사유는 로그에 남긴다 — 어떤 규칙이 얼마나 자주 걸리는지가 프롬프트 개선의 근거다 (docs/llm.md)
            print('[generate-mission] 실패', json.dumps(e.reasons, ensure_ascii=False), file=sys.stderr)
            self._send(422, {'error': str(e), 'reasons': e.reasons})
        except Exception as e:  # LLM 서버 오류·키 없음 등
            print('[generate-mission] 오류', repr(e), file=sys.stderr)
            self._send(502, {'error': '문제 생성 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'})
