/* Pyodide 를 메인 스레드 밖에서 돌린다.
 *
 * 메인 스레드에서 runPython 을 부르면 파이썬이 끝날 때까지 돌아오지 않는다.
 * while True: 하나에 탭 전체가 멈추고, 자바스크립트에는 실행 중인 코드를 밖에서 끊을 방법이 없다.
 * Worker 에 두면 화면은 살아 있고, 화면 쪽이 5초 뒤 worker 를 통째로 종료한다.
 */
importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');

var ready = loadPyodide().then(function (py) {
  /* input() 은 브라우저 prompt 창을 띄운다. 자료는 data 변수로 주므로 막는다. */
  py.runPython('import builtins\ndef _no_input(*a):\n    raise RuntimeError("__NO_INPUT__")\nbuiltins.input = _no_input');
  /* 여기서 도는 코드는 학생 코드와 AI 가 쓴 코드다. js·pyodide_js 는 worker 의 자바스크립트 전체
     (fetch·postMessage — 지어낸 'done' 을 보내는 길)로 가는 문이라 닫는다. 등록을 지워 다시 import 해도
     못 찾게 하고, sys.modules 자리는 None 으로 막는다. pyodide 패키지(run_js·pyfetch)도 결국 js 를 거친다.
     밖의 네트워크는 vercel.json 의 이 파일 CSP(connect-src jsdelivr 만)가 한 번 더 막는다 */
  ['js', 'pyodide_js'].forEach(function (m) { try { py.unregisterJsModule(m); } catch (e) { /* 이미 없다 */ } });
  py.runPython('import sys\nfor _m in ("js", "pyodide_js", "pyodide", "pyodide.code", "pyodide.ffi", "pyodide.http"):\n    sys.modules[_m] = None\ndel _m');
  return py;
});

ready.then(function () { postMessage({ type: 'ready' }); },
  function (e) { postMessage({ type: 'load-error', error: String(e) }); });

onmessage = function (e) {
  ready.then(function (py) {
    py.runPython('import io, sys; sys.stdout = io.StringIO()');
    var output = '', error = '';
    try {
      py.runPython(e.data.code);
    } catch (x) {
      error = String((x && x.message) || x);
    }
    output = py.runPython('sys.stdout.getvalue()');
    postMessage({ type: 'done', id: e.data.id, output: output, error: error });
  });
};
