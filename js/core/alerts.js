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
  var TAG_OF = { finish: 'praise', redefine: 'praise', fixed: 'praise', hardcode: 'look', 'tutor-many': 'look', level: 'info', cancel: 'praise', design: 'look', code: 'look' };
  var TUTOR_MANY = 5;   /* 한 미션에서 튜터에게 이만큼 물으면 알린다 */

  /* snap 의 opt (모두 선택)
   *   finishedOf(s) -> [미션 DB id]   서버 모드 — 키·mid 가 DB id
   *   eventsOf(s)   -> 이 학생의 원래 기록 (mid 가 붙은 것)
   *   missionName(mid, s) / missionOf(mid)   문장·코드 사실에 쓴다 (mid 는 학생 기록 안의 미션 id)
   *   cancelOf(s)   -> {dbId, cands:['N','S']} | null   누적 바늘이 서로 지워져 선생님이 골라야 할 때. dbId = 가장 최근 미션
   *   server        true 면 finish 문장에 나침반 안내가 붙는다
   * 알림마다 mid = 학생 기록 안의 미션 id(e.mid, 모르면 ''), dbId = 서버 미션 id(없으면 null) — 종류와 상관없이 같은 뜻.
   * 키는 '종류:미션' — 같은 학생·미션·종류는 몇 번을 다시 계산해도 한 번만 알린다 */
  function snap(students, opt) {
    opt = opt || {};
    var o = {}, mcache = {};
    var missionOf = opt.missionOf && function (mid) { return mid in mcache ? mcache[mid] : (mcache[mid] = opt.missionOf(mid)); };   /* 저장소를 snap 한 번에 미션당 한 번만 */
    (students || []).forEach(function (s) {
      if (!s) return;
      var evs = opt.eventsOf ? (opt.eventsOf(s) || []).slice() : null;
      if (evs) evs.sort(function (x, y) { return (x.t || 0) - (y.t || 0); });   /* 안정 정렬 — 순서를 보장 못 하는 기록도 '에러 뒤'를 가린다 */
      var keys = {}, hasFinish = !!(opt.finishedOf || evs);
      var name = function (mid) { return (opt.missionName && opt.missionName(mid, s)) || ''; };
      var dbOf = {}, midOf = {}, by = {};   /* 클라이언트 미션 id ↔ 서버 id, 미션별 기록 */
      (evs || []).forEach(function (e) {
        if (!e.mid) return;
        (by[e.mid] = by[e.mid] || []).push(e);
        if (e._missionDbId) { dbOf[e.mid] = e._missionDbId; midOf[e._missionDbId] = e.mid; }
      });
      var add = function (kind, mid, extra, key) {
        var k = kind + ':' + (key || mid);
        if (!(k in keys)) keys[k] = Object.assign({ kind: kind, mid: mid, dbId: dbOf[mid] || null, mission: name(mid), compass: !!opt.server }, extra);
      };

      if (opt.finishedOf) (opt.finishedOf(s) || []).forEach(function (db) {
        add('finish', midOf[db] || '', { dbId: db }, db);
      });
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
        var m = missionOf && CC.facts && CC.fold && missionOf(mid);
        var v = m && list.some(function (e) { return e.type === 's-code'; }) && CC.fold.fold(list, { id: s.id, name: s.name });
        if (v && CC.facts.of(v, m).some(function (f) { return f.kind === 'hardcode'; })) add('hardcode', mid);
      });
      var cc = opt.cancelOf && opt.cancelOf(s);
      if (cc && cc.dbId) add('cancel', midOf[cc.dbId] || '', { dbId: cc.dbId, cands: cc.cands || [] }, cc.dbId);   /* 학생·가장 최근 미션당 한 번 */
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
      Object.keys(a.keys).forEach(function (k) { if (!(k in b.keys)) b.keys[k] = a.keys[k]; });   /* 알린 키는 사라져도 남긴다 — hardcode 는 사실이 숨었다 돌아올 수 있다 */
      if (b.design > a.design) out.push({ id: id, name: b.name, kind: 'design', tag: TAG_OF.design });
      Object.keys(b.keys).forEach(function (k) {
        if (k in a.keys) return;
        var x = b.keys[k];
        out.push({ id: id, name: b.name, mid: x.mid, dbId: x.dbId, kind: x.kind, tag: TAG_OF[x.kind], mission: x.mission, compass: x.compass, level: x.level, cands: x.cands });
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
      case 'cancel': {
        var N = (CC.compass && CC.compass.NAME) || {}, c = (a.cands || []).map(function (d) { return N[d]; }).filter(Boolean);
        if (c.length !== 2) return who + ' 최근 미션에서 네 방향이 고르게 보여요. 어느 쪽이 더 보였는지 골라 주세요.';   /* 넷이 같으면 둘로 좁힐 근거가 없다 */
        return who + ' 최근 미션에서 ' + c[0] + CC.particle(c[0], '과/와') + ' ' + CC.josa(c[1], '이/가') + ' 같이 두드러져요. 어느 쪽이 더 보였는지 골라 주세요.';
      }
      case 'design': return who + ' 설계도를 냈어요.';
    }
    return who + ' 코드 결과를 판정했어요.';
  }

  CC.alerts = { snap: snap, diff: diff, say: say, TAGS: TAGS, TUTOR_MANY: TUTOR_MANY };
})(window.CC = window.CC || {});
