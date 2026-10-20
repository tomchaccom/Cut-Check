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

  var TAGS = { praise: '칭찬 타이밍', look: '살펴볼 것', info: '레벨 테스트' };
  var TAG_OF = { finish: 'praise', redefine: 'praise', fixed: 'praise', hardcode: 'look', 'tutor-many': 'look', level: 'info', design: 'look', code: 'look' };
  var TUTOR_MANY = 5;   /* 한 미션에서 튜터에게 이만큼 물으면 알린다 */

  /* snap 의 opt (모두 선택)
   *   finishedOf(s) -> [미션 DB id]   서버 모드 — 키·mid 가 DB id
   *   eventsOf(s)   -> 이 학생의 원래 기록 (mid 가 붙은 것)
   *   missionName(mid, s) / missionOf(mid)   문장·코드 사실에 쓴다
   *   server        true 면 finish 문장에 나침반 안내가 붙는다
   * 키는 '종류:미션' — 같은 학생·미션·종류는 몇 번을 다시 계산해도 한 번만 알린다 */
  function snap(students, opt) {
    opt = opt || {};
    var o = {};
    (students || []).forEach(function (s) {
      if (!s) return;
      var evs = opt.eventsOf ? opt.eventsOf(s) || [] : null;
      var keys = {}, hasFinish = !!(opt.finishedOf || evs);
      var name = function (mid) { return (opt.missionName && opt.missionName(mid, s)) || ''; };
      var add = function (kind, mid, extra) {
        var k = kind + ':' + mid;
        if (!(k in keys)) keys[k] = Object.assign({ kind: kind, mid: mid, mission: name(mid), compass: !!opt.server }, extra);
      };
      var by = {};   /* 미션별 기록 */
      (evs || []).forEach(function (e) { if (e.mid) (by[e.mid] = by[e.mid] || []).push(e); });

      if (opt.finishedOf) (opt.finishedOf(s) || []).forEach(function (m) { add('finish', m); });
      Object.keys(by).forEach(function (mid) {
        var list = by[mid], bad = null, tutor = 0;
        list.forEach(function (e) {
          if (e.type === 's-code-judge' && !opt.finishedOf) add('finish', mid);
          if (e.type === 's-redefine') add('redefine', mid);
          if (e.type === 's-tutor' && ++tutor >= TUTOR_MANY) add('tutor-many', mid);
          if (e.type !== 's-code') return;
          if (e.error) bad = e.code;
          else if (bad !== null && e.code !== bad) add('fixed', mid);
        });
        var m = opt.missionOf && CC.facts && CC.fold && opt.missionOf(mid);
        var v = m && list.some(function (e) { return e.type === 's-code'; }) && CC.fold.fold(list, { id: s.id, name: s.name });
        if (v && CC.facts.of(v, m).some(function (f) { return f.kind === 'hardcode'; })) add('hardcode', mid);
      });
      if (s.onboard && !s.onboard.skipped) {
        var L = CC.onboard && CC.onboard.LABEL;
        add('level', '', { level: (L && s.onboard.stage && L[s.onboard.stage]) || '' });
      }
      o[s.id] = { name: s.name, design: s.sDesignCount || 0, judged: hasFinish ? null : (s.sCodeJudges || []).length, keys: keys };
    });
    return o;
  }

  function diff(prev, next) {
    if (!prev) return [];
    var out = [];
    Object.keys(next || {}).forEach(function (id) {
      var a = prev[id] || { design: 0, judged: 0, keys: {} };
      var b = next[id];
      if (b.design > a.design) out.push({ id: id, name: b.name, kind: 'design', tag: TAG_OF.design });
      Object.keys(b.keys).forEach(function (k) {
        if (k in a.keys) return;
        var x = b.keys[k];
        out.push({ id: id, name: b.name, mid: x.mid, kind: x.kind, tag: TAG_OF[x.kind], mission: x.mission, compass: x.compass, level: x.level });
      });
      if (b.judged != null && b.judged > (a.judged || 0)) out.push({ id: id, name: b.name, kind: 'code', tag: TAG_OF.code });
    });
    return out;
  }

  function say(a) {
    /* 로컬 모드 학생 이름은 '나' — 나+가 는 '내가' */
    var who = a.name === '나' ? '내가' : a.name + CC.particle(a.name, '이/가');
    var m = a.mission || '미션';
    switch (a.kind) {
      case 'finish': return who + ' ' + m + CC.particle(m, '을/를') + ' 마쳤어요.' + (a.compass ? ' 나침반을 보고 한마디 적어 주세요.' : '');
      case 'redefine': return who + ' 성공 조건을 스스로 바꿨어요.';
      case 'fixed': return who + ' 에러가 난 뒤 스스로 고쳐 다시 돌렸어요.';
      case 'hardcode': return a.name + ' — 새로 온 자료에서도 첫 자료와 결과가 같아요. 하드코딩일 수 있어요.';
      case 'tutor-many': return who + ' ' + m + '에서 튜터에게 ' + TUTOR_MANY + '번 물었어요.';
      case 'level': return who + ' 레벨 테스트를 마쳤어요.' + (a.level ? ' 레벨 ' + a.level + '.' : '');
      case 'design': return who + ' 설계도를 냈어요.';
    }
    return who + ' 코드 결과를 판정했어요.';
  }

  CC.alerts = { snap: snap, diff: diff, say: say, TAGS: TAGS, TUTOR_MANY: TUTOR_MANY };
})(window.CC = window.CC || {});
