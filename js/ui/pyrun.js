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
  var CRASH = 'Python 실행기가 멈췄어요.';

  /* 실행 번호는 맞히기 어렵게 — worker 안의 코드가 지어낸 'done' 이 다른 실행의 결과로 끼어들지 않게 */
  function jobId() {
    var c = root.crypto;
    if (c && c.getRandomValues) { var a = new Uint32Array(2); c.getRandomValues(a); return a[0].toString(36) + a[1].toString(36); }
    return String(Math.random()).slice(2);
  }

  CC.pyrun = {
    create: function (onStatus) {
      var w = null, main = null, ok = false, cur = null, queue = [], wasReady = false;

      function status(text, ready) {
        ok = ready;
        if (onStatus) onStatus(text, ready);
        if (ready) pump();
      }

      function pump() {
        if (!ok || cur || !queue.length || (!main && !w)) return;
        var job = queue.shift();
        if (main) {
          main.runPython('import io, sys; sys.stdout = io.StringIO()');
          var err = '';
          try { main.runPython(job.code); } catch (x) { err = CC.pyerr.short(String((x && x.message) || x)); }
          job.cb(main.runPython('sys.stdout.getvalue()'), err);
          return pump();
        }
        job.id = jobId();
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
        var me = w, meReady = false;
        w.onmessage = function (e) {
          if (me !== w) return;          /* 죽인 worker 의 늦은 말은 버린다 */
          var d = e.data || {};
          if (d.type === 'ready') { wasReady = meReady = true; status('Python 준비 완료', true); }
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
          if (me !== w) return;
          if (meReady) {
            /* 한 번 준비됐던 worker 가 실행 중에 죽었다 — 그 실행을 메인 스레드로 옮겨 다시 돌리지 않는다
               (시간 제한도 격리도 없는 곳이다). 그 실행만 실패로 끝내고 worker 를 새로 띄운다 */
            var job = cur; cur = null;
            if (job) clearTimeout(job.timer);
            w.terminate();
            boot();
            if (job) job.cb('', CRASH);
            return;
          }
          w = null;
          if (wasReady) return status(LOAD_FAIL, false);   /* 다시 띄운 worker 가 못 떴다 — 메인 스레드로는 가지 않는다 */
          if (cur) { clearTimeout(cur.timer); queue.unshift(cur); cur = null; }
          status('Python 로딩 중...', false);   /* bootMain 이 끝날 때까지 ready 가 켜져 있으면 run 이 null worker 를 부른다 */
          bootMain();
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
