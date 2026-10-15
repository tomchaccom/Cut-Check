/* Cut & Check — 교사 알림 (순수 함수)
 *
 * 교사에게 "지금 볼 때"만 알린다. 무엇을 말할지는 교사가 정한다.
 * 순서("첫 번째로")·소요 시간·판정 결과는 띄우지 않는다 — 숫자와 순서가 보이면
 * 교사가 줄을 세우고, 학생은 다시 속도를 겨룬다 (CLAUDE.md "만들면 안 되는 것").
 *
 * 처음 화면을 열 때 이미 있던 제출은 알리지 않는다. 새로고침마다 알림이 쏟아지면
 * 교사는 알림을 끄고, 그 뒤로는 진짜 알림도 못 본다.
 */
(function (CC) {
  'use strict';

  function snap(students) {
    var o = {};
    (students || []).forEach(function (s) {
      if (!s) return;
      o[s.id] = { name: s.name, design: s.sDesignCount || 0, judged: (s.sCodeJudges || []).length };
    });
    return o;
  }

  function diff(prev, next) {
    if (!prev) return [];
    var out = [];
    Object.keys(next || {}).forEach(function (id) {
      var a = prev[id] || { design: 0, judged: 0 };
      var b = next[id];
      if (b.design > a.design) out.push({ id: id, name: b.name, kind: 'design' });
      if (b.judged > a.judged) out.push({ id: id, name: b.name, kind: 'code' });
    });
    return out;
  }

  function say(a) {
    var who = a.name + CC.particle(a.name, '이/가');
    return a.kind === 'design' ? who + ' 설계도를 냈어요.' : who + ' 코드 결과를 판정했어요.';
  }

  CC.alerts = { snap: snap, diff: diff, say: say };
})(window.CC = window.CC || {});
