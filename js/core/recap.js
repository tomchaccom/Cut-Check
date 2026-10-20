/* Cut & Check — 수업에서 짚을 거리: 이벤트 → /api/tutor-recap 본문
 *
 * 순수 함수. 학생 이름은 본문에 싣지 않고 s1, s2 기호로만 보낸다 (names 는 화면에만 남는다).
 * 끝낸(s-wrap) 미션 중 튜터와 말을 나눈 것만 올린다 — 판정은 서버·교사 몫이다.
 */
(function (CC) {
  'use strict';

  var MAX = 40;

  function lastOf(evs, type) {
    var t = 0;
    evs.forEach(function (e) { if (e.type === type && (e.t || 0) > t) t = e.t || 0; });
    return t;
  }

  function build(students, eventsOf, missionOf, onlyMid) {
    var rows = [];
    students.forEach(function (s) {
      var all = eventsOf(s) || [], mids = [];
      all.forEach(function (e) { if (e.mid && mids.indexOf(e.mid) === -1) mids.push(e.mid); });
      mids.forEach(function (mid) {
        if (onlyMid && mid !== onlyMid) return;
        var evs = all.filter(function (e) { return e.mid === mid; });
        var tutors = evs.filter(function (e) { return e.type === 's-tutor'; });
        if (CC.fold.missionStatus(evs) !== 'done' || !tutors.length) return;
        var f = CC.fold.fold(evs, { id: s.id, name: s.name });
        var m = missionOf(mid) || {};
        rows.push({
          s: s, wrapT: lastOf(evs, 's-wrap'), tutorT: lastOf(evs, 's-tutor'),
          item: {
            mid: mid, title: m.title || '', brief: m.brief || '',
            define: (f && f.sDefine && f.sDefine.choice) || '',
            pairs: tutors.map(function (e) { return { q: e.question || '', a: e.answer || '', refused: !!e.refused }; })
          }
        });
      });
    });

    /* 40명 초과면 마지막 마무리가 최근인 40명 */
    var latest = {}, ids = [];
    rows.forEach(function (r) {
      if (!(r.s.id in latest)) { latest[r.s.id] = 0; ids.push(r.s.id); }
      latest[r.s.id] = Math.max(latest[r.s.id], r.wrapT);
    });
    var truncated = ids.length > MAX;
    if (truncated) {
      ids.sort(function (a, b) { return latest[b] - latest[a]; });
      ids = ids.slice(0, MAX);
      rows = rows.filter(function (r) { return ids.indexOf(r.s.id) !== -1; });
    }

    var sym = {}, names = {}, n = 0, lastT = 0;
    rows.forEach(function (r) { if (!(r.s.id in sym)) { sym[r.s.id] = 's' + (++n); names[sym[r.s.id]] = r.s.name; } });
    var out = rows.map(function (r) {
      if (r.tutorT > lastT) lastT = r.tutorT;
      r.item.who = sym[r.s.id];
      return r.item;
    });
    return {
      body: { students: out }, names: names, truncated: truncated,
      key: 'recap:' + Object.keys(latest).filter(function (id) { return ids.indexOf(id) !== -1; }).sort().join(',') + ':' + lastT
    };
  }

  CC.recap = {
    build: function (students, eventsOf, missionOf) { return build(students, eventsOf, missionOf); },
    /* 미션 하나의 key 에 mid 를 붙인다 — 그 미션 대화가 마지막이면 반 전체 key 와 같아져 캐시가 섞인다 */
    forStudent: function (s, mid, eventsOf, missionOf) { var r = build([s], eventsOf, missionOf, mid); r.key += ':' + mid; return r; }
  };
})(window.CC = window.CC || {});
