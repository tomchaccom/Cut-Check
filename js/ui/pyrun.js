/* Pyodide 실행기 — 학생 화면(sentence.js)과 강사 화면이 같이 쓴다.
 * Worker 에서 돌리고(pyworker.js 머리말), 5초 넘으면 worker 를 죽이고 다시 띄운다.
 * file:// 처럼 Worker 를 못 만드는 곳에서는 메인 스레드에서 돈다 — 그때는 시간 제한이 없다.
 *
 *   var py = CC.pyrun.create(function (text, ready) { ... });
 *   py.run(code, function (output, error) { ... });   // 도는 중에 부르면 대기열에서 차례로
 *   py.ready()                                        // 지금 준비됐는가
 *
 * 화면 요소는 모른다 — 상태 문구는 onStatus 로만 나간다. */
(function (root) {
  var CC = root.CC = root.CC || {};
  var LOAD_FAIL = 'Python을 불러오지 못했어요. 코드는 계속 쓸 수 있어요.';
  var LIMIT = 5000;

  CC.pyrun = {
    create: function (onStatus) {
      var w = null, main = null, ok = false, cur = null, queue = [], seq = 0;

      function status(text, ready) {
        ok = ready;
        if (onStatus) onStatus(text, ready);
        if (ready) pump();
      }

      function pump() {
        if (!ok || cur || !queue.length) return;
        var job = queue.shift();
        if (main) {
          main.runPython('import io, sys; sys.stdout = io.StringIO()');
          var err = '';
          try { main.runPython(job.code); } catch (x) { err = CC.pyerr.short(String((x && x.message) || x)); }
          job.cb(main.runPython('sys.stdout.getvalue()'), err);
          return pump();
        }
        job.id = ++seq;
        cur = job;
        job.timer = setTimeout(function () {
          cur = null;
          w.terminate();
          boot();                       /* 새 worker 가 준비되면 남은 대기열이 이어서 돈다 */
          job.cb('', CC.pyerr.TIMEOUT);
        }, LIMIT);
        w.postMessage({ id: job.id, code: job.code });
      }

      function boot() {
        status('Python 로딩 중...', false);
        try { w = new Worker('js/ui/pyworker.js'); } catch (e) { w = null; return bootMain(); }
        w.onmessage = function (e) {
          var d = e.data;
          if (d.type === 'ready') status('Python 준비 완료', true);
          else if (d.type === 'load-error') status(LOAD_FAIL, false);
          else if (d.type === 'done' && cur && cur.id === d.id) {
            clearTimeout(cur.timer);
            var job = cur; cur = null;
            job.cb(d.output, d.error ? CC.pyerr.short(d.error) : '');
            pump();
          }
        };
        w.onerror = function (e) {
          e.preventDefault();           /* 처리했다 — 페이지 에러로 올리지 않는다 */
          if (cur) { clearTimeout(cur.timer); queue.unshift(cur); cur = null; }
          w = null; bootMain();
        };
      }

      function bootMain() {
        if (typeof root.loadPyodide !== 'function') return status(LOAD_FAIL, false);
        root.loadPyodide().then(function (p) {
          p.runPython('import builtins\ndef _no_input(*a):\n    raise RuntimeError("__NO_INPUT__")\nbuiltins.input = _no_input');
          main = p; status('Python 준비 완료', true);
        }, function () { status(LOAD_FAIL, false); });
      }

      boot();
      return {
        run: function (code, cb) { queue.push({ code: code, cb: cb }); pump(); },
        ready: function () { return ok; }
      };
    }
  };
})(typeof window !== 'undefined' ? window : this);
