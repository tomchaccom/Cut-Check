/* Cut & Check — 이 브라우저의 보기 편의 (사이드바·알림 접힘 등)
 *
 *   CC.prefs.get(key, dflt)   없거나 저장소가 막혀 있으면 dflt
 *   CC.prefs.set(key, v)      막혀 있으면 조용히 그만
 *
 * 기록이 아니라 편의다 — 서버에 보내지 않고, 잃어도 기본 모양으로 열릴 뿐이다.
 */
(function (CC) {
  'use strict';
  var P = 'cutcheck.prefs.';
  CC.prefs = {
    get: function (k, d) {
      try { var v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { /* 막혀도 그만 */ } }
  };
})(window.CC = window.CC || {});
