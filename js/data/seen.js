/* Cut & Check — 이 브라우저에서 이미 본 것 (사용법 안내 등)
 *
 * 저장소가 막혀 있으면(사생활 보호 모드·file://) 던지지 않고 '안 봤다'로 둔다.
 * 그러면 안내가 한 번 더 뜰 뿐, 화면은 멈추지 않는다.
 */
(function (CC) {
  'use strict';
  var P = 'cutcheck.seen.';
  CC.seen = {
    has: function (k) { try { return localStorage.getItem(P + k) === '1'; } catch (e) { return false; } },
    mark: function (k) { try { localStorage.setItem(P + k, '1'); } catch (e) { /* 막혀도 그만 */ } }
  };
})(window.CC = window.CC || {});
