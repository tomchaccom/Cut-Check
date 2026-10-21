/* Cut & Check — 선생님이 확인한 알림 (학생 기록이 아니라 교사의 할 일 목록)
 *
 *   CC.alertChecks.load(room)       -> Promise<{ since, keys: { key: true } }>
 *   CC.alertChecks.check(room, key) -> Promise   key 는 CC.alerts.keyOf 그대로
 *
 * 서버가 있으면 DB(alert_checks — 새로고침 · 다른 기기에서도 같다), 없으면 이 브라우저(localStorage).
 * since — 이 기능을 처음 켠 시각. 서버는 마이그레이션을 적용한 시각, 로컬은 이 브라우저가 처음 연 시각.
 * 그 전 일은 확인한 것으로 친다. 저장소가 막혀 있으면 since 는 지금 — 연 뒤에 생긴 일만 뜬다.
 */
(function (CC) {
  'use strict';
  var P = 'cutcheck.alertChecks.';
  function set(list) { var o = {}; (list || []).forEach(function (k) { o[k] = true; }); return o; }
  function read(room) { try { return JSON.parse(localStorage.getItem(P + room)); } catch (e) { return null; } }
  function write(room, v) { try { localStorage.setItem(P + room, JSON.stringify(v)); } catch (e) { /* 막혀도 그만 — 다음에 열면 다시 뜬다 */ } }
  function server() { return !!(CC.sb && CC.sb.active() && CC.sb.alertChecks); }

  /* 옛 '마지막으로 본 시각'(CC.prefs alertsSeen.<교실>) — 더 쓰지 않는다 */
  try {
    for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i); if (k && k.indexOf('cutcheck.prefs.alertsSeen.') === 0) localStorage.removeItem(k); }
  } catch (e) { /* 막혀 있으면 지울 것도 없다 */ }

  CC.alertChecks = {
    load: function (room) {
      if (server()) return Promise.resolve(room).then(CC.sb.alertChecks).then(function (r) { return { since: r.since, keys: set(r.keys) }; });   /* 동기로 던져도 거절로 */
      var v = read(room);
      if (!v || typeof v.since !== 'number' || !Array.isArray(v.keys)) write(room, v = { since: Date.now(), keys: [] });
      return Promise.resolve({ since: v.since, keys: set(v.keys) });
    },
    check: function (room, key) {
      if (server()) return Promise.resolve().then(function () { return CC.sb.checkAlert(room, key); });
      var v = read(room);
      if (!v || !Array.isArray(v.keys)) v = { since: Date.now(), keys: [] };
      if (v.keys.indexOf(key) < 0) v.keys.push(key);
      write(room, v);
      return Promise.resolve();
    }
  };
})(window.CC = window.CC || {});
