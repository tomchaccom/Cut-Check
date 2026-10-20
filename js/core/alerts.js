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

  /* finishedOf(student) -> [미션 DB id] 를 주면(서버 모드) 학생·미션 키 'id:mid' 도 담는다.
   * 같은 미션을 다시 판정해도 키는 그대로라 알림은 학생·미션당 한 번이다 */
  function snap(students, finishedOf) {
    var o = {};
    (students || []).forEach(function (s) {
      if (!s) return;
      o[s.id] = { name: s.name, design: s.sDesignCount || 0, judged: (s.sCodeJudges || []).length };
      if (finishedOf) {
        o[s.id].keys = {};
        (finishedOf(s) || []).forEach(function (m) { o[s.id].keys[s.id + ':' + m] = m; });
      }
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
      if (b.keys) {   /* 서버 모드 — 코드 판정 알림 대신 미션을 마친 알림 */
        Object.keys(b.keys).forEach(function (k) {
          if (!(a.keys && k in a.keys)) out.push({ id: id, name: b.name, kind: 'finish', mid: b.keys[k] });
        });
      } else if (b.judged > a.judged) out.push({ id: id, name: b.name, kind: 'code' });
    });
    return out;
  }

  function say(a) {
    /* 로컬 모드 학생 이름은 '나' — 나+가 는 '내가' */
    var who = a.name === '나' ? '내가' : a.name + CC.particle(a.name, '이/가');
    if (a.kind === 'finish') return who + ' 미션을 마쳤어요. 나침반을 확인하고 한마디 적어 주세요.';
    return a.kind === 'design' ? who + ' 설계도를 냈어요.' : who + ' 코드 결과를 판정했어요.';
  }

  CC.alerts = { snap: snap, diff: diff, say: say };
})(window.CC = window.CC || {});
