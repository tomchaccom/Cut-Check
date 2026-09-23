/* Cut & Check — 학생 행동 기록 (오프라인 우선)
 *
 * 학생 화면이 남기는 것을 교사 화면이 읽는다. 시연에서 "내가 방금 한 게 저기 뜬다"가
 * 보여야 이 제품의 주장이 설득된다.
 *
 * 구조
 *   push(ev)   → 항상 로컬에 먼저 쌓는다. 여기는 절대 실패하지 않는다
 *              → 서버가 설정돼 있으면 발신함(outbox)에 넣고 뒤에서 보낸다
 *   fold()     → js/core/fold.js 에 넘긴다. 접는 규칙은 여기 없다
 *
 * 왜 로컬이 먼저인가 —
 *   학교 와이파이는 끊긴다. 끊긴 순간 학생이 누른 게 사라지면
 *   교사는 "기록이 안 남았네요" 를 학생에게 설명해야 하고, 그 수업은 거기서 끝난다.
 *   그래서 네트워크는 기록의 조건이 아니라 기록의 사본이다.
 *
 * 무엇을 저장하지 않는가
 *   정답 여부, 점수, 소요 시간 순위.
 *   저장하지 않기로 한 것도 설계다 — 없는 숫자는 화면에 띄울 수 없다.
 *   (막는 건 js/core/events.js 의 NEVER 목록이 한다)
 *
 * localStorage 는 브라우저마다, 그리고 file:// 에서 막힐 수 있다.
 * 막히면 조용히 메모리로 떨어지고, 교사 화면이 그 사실을 사용자에게 알린다.
 */
(function (CC) {
  'use strict';

  var KEY = 'cutcheck.log.v1';
  var OUT = 'cutcheck.outbox.v1';
  var mem = {};
  var ok = null;   // localStorage 사용 가능 여부 (첫 접근 때 판정)
  var flushing = false;

  function probe() {
    if (ok !== null) return ok;
    try {
      var k = KEY + '.probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      ok = true;
    } catch (e) {
      ok = false;
    }
    return ok;
  }

  function read(key) {
    if (!probe()) return mem[key] || [];
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  }

  function write(key, list) {
    mem[key] = list;
    if (!probe()) return;
    try {
      localStorage.setItem(key, JSON.stringify(list.slice(-200)));
    } catch (e) { /* 저장 실패는 학습을 막지 않는다 */ }
  }

  /* 발신함 비우기. 실패하면 그대로 두고 다음에 다시 — 지우지 않는다 */
  function flush() {
    if (flushing || !CC.config || !CC.config.online()) return;
    var box = read(OUT);
    if (!box.length) return;
    flushing = true;
    var batch = box.slice(0, CC.config.batchSize);
    CC.api.send(batch)
      .then(function () {
        write(OUT, read(OUT).slice(batch.length));
        flushing = false;
        if (read(OUT).length) flush();
      })
      .catch(function () {
        flushing = false;
        setTimeout(flush, CC.config.retryMs);
      });
  }

  CC.store = {
    available: function () { return probe(); },

    /* 이벤트를 남긴다. type 검사는 CC.events 가 한다 —
     * 화면이 오타를 내면 여기서 바로 터지는 게, 수업 중에 조용히 사라지는 것보다 낫다. */
    push: function (ev) {
      if (CC.events && ev && ev.type && ev.v == null) {
        var payload = {};
        for (var k in ev) { if (k !== 'type') payload[k] = ev[k]; }
        ev = CC.events.make(ev.type, payload);
      } else if (!ev.t) {
        ev.t = Date.now();
      }
      write(KEY, read(KEY).concat([ev]));
      if (CC.config && CC.config.online()) {
        write(OUT, read(OUT).concat([ev]));
        flush();
      }
      return ev;
    },

    all: function () { return read(KEY); },

    pending: function () { return read(OUT).length; },

    clear: function () {
      mem = {};
      if (probe()) {
        try {
          localStorage.removeItem(KEY);
          localStorage.removeItem(OUT);
        } catch (e) { /* noop */ }
      }
    },

    /* 접는 건 core 의 일이다. 여기는 이벤트를 건네기만 한다. */
    fold: function (name) {
      return CC.fold.fold(read(KEY), { id: 'me', name: name || '나' });
    }
  };

  if (CC.config && CC.config.online()) flush();
})(window.CC = window.CC || {});
