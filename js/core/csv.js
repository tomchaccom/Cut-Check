/* Cut & Check — 튜터 기록 CSV (순수 함수)
 * 수업 개선용으로 교사가 내려받는다. 학생이 쓴 글이 그대로 들어가므로 이스케이프가 전부다.
 * 점수·정답률·순위 열은 만들지 않는다. */
(function (CC) {
  'use strict';

  var HEAD = ['시각', '학생', '미션', '단계', '분류', '거절', '질문', '답', '막힌 이유', '다시 요청'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function when(t) {
    if (!t) return '';
    var d = new Date(t);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  /* students: fold 결과 배열. missionName(mid) 은 선택 — 없으면 mid 를 그대로 쓴다. */
  function tutorRows(students, missionName) {
    var rows = [];
    (students || []).forEach(function (s) {
      (s.sTutor || []).forEach(function (x) {
        rows.push({ t: x.t || 0, r: [when(x.t), s.name, x.mid ? (missionName && missionName(x.mid)) || x.mid : '',
          x.step == null ? '' : String(x.step), x.kind || '', x.refused ? '거절' : '',
          x.question || '', x.answer || '', (x.reasons || []).join(' '), x.retried ? '예' : ''] });
      });
    });
    rows.sort(function (a, b) { return a.t - b.t; });   /* 안정 정렬 — 같은 시각이면 학생 순서 */
    return [HEAD].concat(rows.map(function (o) { return o.r; }));
  }

  function cell(v) {
    v = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;   /* Excel 은 =+-@ 로 시작하는 셀을 수식으로 실행한다 */
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function toCsv(rows) {
    return '﻿' + rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
  }

  CC.csv = { tutorRows: tutorRows, toCsv: toCsv };
})(window.CC = window.CC || {});
