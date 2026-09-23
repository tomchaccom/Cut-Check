/* Cut & Check — 전송 계층
 *
 * 화면은 서버가 있는지 없는지 모른다. 이 파일만 안다.
 *
 * 어댑터 둘
 *   local  브라우저 안에서 끝낸다. 지금 기본값이고, 서버가 죽어도 이걸로 수업이 된다
 *   http   config.apiBase 로 보낸다. 서버가 붙으면 자동으로 이쪽이 선택된다
 *
 * 화면이 쓰는 것은 아래 셋뿐이다. 어댑터를 바꿔도 이 모양은 안 바뀐다.
 *   send(events)  이벤트를 보낸다 → Promise<{ok}>
 *   board()       교실 전체 상태를 받는다 → Promise<[학생]>
 *   watch(cb)     바뀔 때마다 부른다 → 해제 함수
 *
 * 왜 Promise 로 감싸는가 —
 *   local 은 동기로 끝나지만 http 는 아니다.
 *   지금 동기로 쓰면 서버 붙이는 날 화면 코드를 전부 다시 써야 한다.
 *   느린 쪽에 모양을 맞춰두는 게 나중에 싸다.
 *
 * 무엇을 보내지 않는가 —
 *   이름, 학번, 정답 여부. 서버는 좌석과 행동만 안다.
 *   이름은 교사의 브라우저에만 있고 (좌석표), 네트워크를 타지 않는다.
 */
(function (CC) {
  'use strict';

  /* ── local ──────────────────────────────────────────
   * 저장은 store 가 한다. api 는 store 를 부르기만 한다. */
  var local = {
    name: 'local',
    send: function (evs) {
      return Promise.resolve({ ok: true, n: evs.length });
    },
    board: function () {
      var me = CC.store && CC.store.fold();
      return Promise.resolve(me ? [me] : []);
    },
    watch: function (cb) {
      /* 같은 브라우저의 다른 탭에서 바뀌면 알려준다 —
       * 교사가 한 화면에서 학생 화면을 띄워 시연할 때 이게 필요하다 */
      var h = function (e) { if (!e.key || e.key.indexOf('cutcheck.') === 0) cb(); };
      window.addEventListener('storage', h);
      return function () { window.removeEventListener('storage', h); };
    }
  };

  /* ── http ───────────────────────────────────────────
   * 서버 계약은 docs/server.md. 여기 있는 세 엔드포인트가 전부다. */
  function http(base, code) {
    function url(p) { return base.replace(/\/$/, '') + p; }

    return {
      name: 'http',

      send: function (evs) {
        return fetch(url('/events'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: code, seat: CC.config.seatId, v: CC.config.schema, events: evs })
        }).then(function (r) {
          if (!r.ok) throw new Error('send ' + r.status);
          return r.json();
        });
      },

      board: function () {
        return fetch(url('/board?room=' + encodeURIComponent(code)))
          .then(function (r) {
            if (!r.ok) throw new Error('board ' + r.status);
            return r.json();
          })
          .then(function (d) {
            /* 서버가 접어서 주면 그대로, 원본 이벤트를 주면 여기서 접는다.
             * 접는 규칙은 어느 쪽이든 js/core/fold.js 하나다. */
            if (d.students) return d.students;
            return CC.fold.foldMany(d.events || []);
          });
      },

      watch: function (cb) {
        /* SSE. 안 되는 망이면 조용히 폴링으로 내려간다 —
         * 교실 와이파이에서 SSE 가 막히는 건 드물지 않다. */
        var src = null, timer = null, dead = false;
        try {
          src = new EventSource(url('/stream?room=' + encodeURIComponent(code)));
          src.onmessage = function () { cb(); };
          src.onerror = function () {
            if (dead) return;
            try { src.close(); } catch (e) { /* noop */ }
            src = null;
            timer = setInterval(cb, 4000);
          };
        } catch (e) {
          timer = setInterval(cb, 4000);
        }
        return function () {
          dead = true;
          if (src) { try { src.close(); } catch (e) { /* noop */ } }
          if (timer) clearInterval(timer);
        };
      }
    };
  }

  var adapter = CC.config && CC.config.online()
    ? http(CC.config.apiBase, CC.config.classroomCode)
    : local;

  CC.api = {
    mode: adapter.name,
    send: function (evs) { return adapter.send(evs); },
    board: function () { return adapter.board(); },
    watch: function (cb) { return adapter.watch(cb); },

    /* 테스트와 시연용. 실제 화면은 부르지 않는다 */
    _use: function (a) { adapter = a; CC.api.mode = a.name; },
    _local: local,
    _http: http
  };
})(window.CC = window.CC || {});
