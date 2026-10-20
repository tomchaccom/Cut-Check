/* Cut & Check — 교사 화면 조립
 *
 * 이 화면이 지키는 것:
 *   - 점수·정답률·순위를 한 개도 그리지 않는다.
 *   - 모든 줄은 "지금 무엇을 하라"로 읽혀야 한다. 상태 보고가 아니라 개입 목록이다.
 *   - 칭찬 문구를 대신 써주지 않는다. 타이밍만 알려주고 말은 교사가 한다.
 */
(function (CC) {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var el = function (tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };
  /* Supabase 연결 시 실제 학생 데이터 사용. 미연결 시 목업 폴백. */
  var C = CC.classroom;
  var me = null;
  if (CC.sb && CC.sb.active()) {
    /* 목업 학생 제거 — 실제 데이터만 사용 */
    C.students = [];
  } else {
    me = CC.store ? CC.store.fold('나') : null;
    if (me) C.students = [me].concat(C.students);
  }
  var J = function (w, pair) { return CC.particle(w, pair); };
  var fresh = {};   /* 화면을 연 뒤 새 순간이 생긴 학생 id — 폴더에 점. 서랍을 열면 지운다 */

  /* 미션 04 슬롯 id → 사람이 읽는 이름. 교사 화면에 내부 id 가 새어나가면 안 된다. */
  var SLOT_LABEL = {
    text: '들어오는 자료', sep: '자를 기준', targets: '찾을 목록',
    loop: '하나씩 꺼내기', check: '조건 확인', collect: '걸린 것만 모으기'
  };

  function mmss(sec) {
    var m = Math.floor(sec / 60);
    return m < 1 ? '방금' : m + '분째';
  }

  /* ── 요약 타일 ───────────────────────────────────── */
  function tiles() {
    var t = $('#tiles');
    t.innerHTML = '';  /* 중복 렌더 방지 */
    var quiet = C.quiet(), ready = C.ready(), risky = C.risky();
    /* 문장형 학생: 실행+판정한 학생도 "도달"로 카운트 */
    var done = C.students.filter(function (s) {
      return s.stage >= 3 || (s.sRuns && s.sRuns.length > 0);
    }).length;

    [
      { k: '지금 답해줄 수 있음', v: ready.length, u: '명', m: '증상 진술이 완성된 호출', cls: '' },
      { k: '조용히 막힘', v: quiet.length, u: '명', m: '손 안 들고 4분 이상 정지', cls: 'alarm' },
      { k: '성공을 결과로 정의', v: risky.length, u: '명', m: '하드코딩 위험군', cls: 'alarm' },
      { k: '3장 검증까지 도달', v: done, u: '/ ' + C.students.length + '명', m: '한 장만 맞힌 건 제외', cls: 'good' }
    ].forEach(function (d) {
      var box = el('div', 'tile ' + d.cls);
      box.appendChild(el('div', 'k', d.k));
      var v = el('div', 'v', String(d.v));
      v.appendChild(el('small', null, d.u));
      box.appendChild(v);
      box.appendChild(el('div', 'm', d.m));
      t.appendChild(box);
    });
  }

  /* ── 명단 줄 ─────────────────────────────────────── */
  function rowList(sel, pillSel, list, tone, sayFn) {
    var box = $(sel);
    box.innerHTML = '';
    if (pillSel) $(pillSel).textContent = list.length + '명';
    if (!list.length) {
      box.appendChild(el('div', 'emptyrow', '지금은 없어요.'));
      return;
    }
    list.forEach(function (s) {
      var r = el('button', 'trow ' + tone);
      r.type = 'button';
      r.appendChild(el('span', 'av', s.live ? '●' : s.name.charAt(0)));
      var who = el('span', 'who', s.name);
      if (s.live) who.className = 'who live';
      r.appendChild(who);
      var say = el('span', 'say');
      say.innerHTML = sayFn(s);
      r.appendChild(say);
      r.appendChild(el('span', 'meta', mmss(s.idleSec)));
      r.addEventListener('click', function () { openDetail(s); });
      box.appendChild(r);
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── 위험군 ──────────────────────────────────────── */
  function risk() {
    var box = $('#risk');
    box.innerHTML = '';  /* 중복 렌더 방지 */
    var groups = [
      { key: 'hardcode', lab: '이번 결과를 성공으로 정의함', tip: '입력이 바뀌면 무너집니다' },
      { key: 'luck', lab: '오류만 없으면 성공으로 정의함', tip: '무엇이 나와야 하는지 정하지 않았습니다' },
      { key: null, lab: '입력이 바뀌어도 되는 조건으로 정의함', tip: '' },
      { key: 'own', lab: '직접 쓴 문장', tip: '분류하지 않습니다. 읽어보고 판단해주세요 — 자동 분류하는 순간 학생이 쓴 말을 우리가 채점하는 게 됩니다.' }
    ];
    groups.forEach(function (g) {
      var members = C.students.filter(function (s) { return s.define.trap === g.key; });
      if (!members.length) return;
      var d = el('div', 'risk ' + (g.key || ''));
      d.appendChild(el('span', 'lab', g.lab + ' · ' + members.length + '명'));
      d.appendChild(el('p', 'quote', '“' + members[0].define.text + '”'));
      var who = el('p', 'who');
      members.forEach(function (m) { who.appendChild(el('span', null, m.name)); });
      d.appendChild(who);
      if (g.tip) d.appendChild(el('p', 'who', g.tip));
      box.appendChild(d);
    });
  }

  /* ── 흐름 ────────────────────────────────────────── */
  function funnel() {
    var box = $('#funnel');
    box.innerHTML = '';  /* 중복 렌더 방지 */
    var f = C.funnel();
    var total = C.students.length;
    var worstDrop = 0, worstAt = 1;
    f.forEach(function (row, i) {
      if (i > 0) {
        var drop = f[i - 1].n - row.n;
        if (drop > worstDrop) { worstDrop = drop; worstAt = i; }
      }
    });
    f.forEach(function (row, i) {
      var r = el('div', 'frow' + (i === worstAt ? ' drop' : ''));
      r.appendChild(el('span', 'nm', row.title));
      var bar = el('span', 'bar');
      var fill = el('i');
      fill.style.width = Math.round(row.n / total * 100) + '%';
      bar.appendChild(fill);
      r.appendChild(bar);
      r.appendChild(el('span', 'n', String(row.n)));
      box.appendChild(r);
    });
    $('#dropnote').innerHTML = '가장 많이 갈라진 지점은 <b>' + esc(f[worstAt].title) +
      '</b> 입니다. 여기서 ' + worstDrop + '명이 멈췄어요. ' +
      '개별 개입보다 전체에게 한 번 물어보는 게 빠른 구간입니다.';
  }

  /* ── 학생 한 명 (서랍) ───────────────────────────────
   * 이 학생이 한 것을 순서대로 줄로. 판정·점수는 없다. 노란 표시는 "말 걸기 좋은 순간"
   * — 무엇을 말할지는 쓰지 않는다. 데이터는 fold 결과 그대로, 시각만 원래 기록에서 읽는다. */
  var hm = function (t) {
    return t ? new Date(t).toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  };

  /* 이 학생의 원래 기록 — 로컬은 이 브라우저, 서버 모드는 teacher.html 이 C.events 에 넣는다. 목업은 없다 */
  function eventsOf(s) {
    if (s === me) return CC.store ? CC.store.all() : [];
    return (C.events || []).filter(function (e) { return e.sid === s.id; });
  }
  function lastT(evs, types) {
    for (var i = evs.length - 1; i >= 0; i--) if (types.indexOf(evs[i].type) !== -1) return evs[i].t;
    return null;
  }
  /* 미션 id → 미션. 내부 id 는 화면에 내지 않는다 */
  function missionOf(mid) {
    var all = (CC.SENTENCE_MISSIONS || []).concat(CC._roomMissions || []);
    try { all = all.concat(JSON.parse(localStorage.getItem('cutcheck.generated') || '[]')); } catch (e) { /* 저장소가 막혀도 이름만 빠진다 */ }
    return all.filter(function (m) { return m && m.id === mid; })[0] || null;
  }
  function mids(evs) {
    var out = [];
    evs.forEach(function (e) { if (e.mid && out.indexOf(e.mid) === -1) out.push(e.mid); });
    return out;
  }
  function missionName(mid, i) {
    var m = missionOf(mid);
    return m && m.title ? m.title : '미션 ' + (i + 1);
  }

  /* 폴더 아래 한 줄 — 지금 미션 · 단계 */
  function whereNow(s) {
    var evs = eventsOf(s), ms = mids(evs);
    var step = s.sWrap ? '정리까지 했어요'
      : s.sCodes.length ? '코딩'
      : (s.sDesignCount || s.sMethod) ? '설계'
      : s.sDefine ? '성공 조건'
      : C.STAGES[s.stage];
    var last = ms.length ? missionName(ms[ms.length - 1], ms.length - 1)
      : (s.mission && MISSION_NAME[s.mission]) || '';
    return last ? last + ' · ' + step : step;
  }

  /* 한 줄 = 시각 · 무엇 · 내용. 시각을 맨 앞에 둬서 위에서 아래로 훑으면 순서가 읽힌다 */
  function row(dl, label, t, fill) {
    var r = el('div', 'row');
    r.appendChild(el('span', 'tm', hm(t)));
    r.appendChild(el('dt', null, label));
    var dd = el('dd');
    fill(dd);
    r.appendChild(dd);
    if (dd.querySelector('.mark')) r.classList.add('moment');   /* 고친 순간 — 줄 왼쪽에 노란 선 */
    dl.appendChild(r);
  }
  /* 코드는 줄마다 한 칸 — 줄 번호는 CSS 가 센다. 긴 줄은 접어서 서랍이 옆으로 밀리지 않는다 */
  function codeBlock(src) {
    var pre = el('pre', 'code');
    String(src || '').replace(/\n+$/, '').split('\n').forEach(function (line) { pre.appendChild(el('span', 'ln', line)); });
    return pre;
  }
  function mark(dd, txt) { dd.appendChild(el('span', 'mark', txt)); }
  function was(dd, txt) { if (txt) dd.appendChild(el('span', 'was', txt)); }

  /* ── 수업에서 짚을 거리 — 누를 때만 서버에 간다. 학생 질문 원문(quote)은 글자로만 붙인다.
   * 반 전체는 같은 지점에 막힌 학생이 많은 순 — 먼저 짚을 것을 고르는 순서지 학생 순위가 아니다 */
  function recapOn(btn, out, req, many) {
    if (!(CC.sb && CC.sb.active())) { btn.hidden = true; return; }   /* 서버가 없으면 뽑을 수 없다 — 안내 대신 숨긴다 */
    btn.addEventListener('click', function () {
      var r = req();
      out.innerHTML = '';
      if (!r.body.students.length) { out.appendChild(el('p', 'emptyrow', '튜터와 대화하고 끝낸 미션이 아직 없어요.')); return; }
      btn.disabled = true;
      var go = CC.sb && CC.sb.recap ? CC.sb.recap(r.body, r.key) : Promise.reject(new Error('no server'));
      go.then(function (j) { recapList(out, (j && j.items) || [], r, many); },
        function () { out.appendChild(el('p', 'recap-fail', '지금은 뽑지 못했어요. 잠시 뒤 다시 눌러 주세요.')); })
        .then(function () { btn.disabled = false; });
    });
  }
  function recapList(out, items, r, many) {
    if (r.truncated) out.appendChild(el('p', 'was', '최근에 끝낸 40명만 봤어요.'));
    if (!items.length) { out.appendChild(el('p', 'emptyrow', '튜터 대화에서 짚을 거리가 나오지 않았어요.')); return; }
    var whoOf = function (it) { return (it.who || []).map(function (w) { return r.names[w]; }).filter(Boolean); };
    if (many) items = items.slice().sort(function (a, b) { return whoOf(b).length - whoOf(a).length; });
    items.forEach(function (it) {
      var d = el('details', 'recap-item');
      var sm = el('summary');
      sm.appendChild(el('span', 'pt', it.point || ''));
      if (many) sm.appendChild(el('span', 'n', whoOf(it).length + '명'));
      if (it.refused) sm.appendChild(el('span', 'tag', '튜터가 답하지 못함'));
      d.appendChild(sm);
      if (many) {
        var m = missionOf(it.mid);
        d.appendChild(el('p', 'who', whoOf(it).join(', ') + (m && m.title ? ' · ' + m.title : '')));
      }
      d.appendChild(el('p', 'quote', '“' + (it.quote || '') + '”'));
      out.appendChild(d);
    });
  }


  /* ── 나침반 — 서버 모드에서만. 미션을 마친(첫 s-code-judge) 학생·미션마다 카드 하나.
   * 값(단계)과 AI 멘트는 선생님만 본다. 학생에게는 선생님이 고른 방위와 쓴 문장만 간다.
   * 단계로 정렬·평균·순위를 만들지 않는다 — 명단에는 "한마디 기다림" 꼬리표 하나뿐 */
  var cRoom = null, cRows = null, cTried = {}, cDraw = {}, cSyncing = false, cListFail = false, cListFailAt = 0, cSeq = 0;
  var COMPASS_FAIL = '지금은 읽지 못했어요. 잠시 뒤 다시 눌러 주세요.';
  var serverOn = function () { return !!(CC.sb && CC.sb.active()); };
  var ckey = function (sid, mid) { return sid + ':' + mid; };

  /* 이 학생이 끝낸 미션의 DB id — 이벤트 본문에는 DB id 가 없어 _missionDbId 를 쓴다 */
  function finishedOf(s) {
    var out = [];
    eventsOf(s).forEach(function (e) {
      if (e.type === 's-code-judge' && e._missionDbId && out.indexOf(e._missionDbId) === -1) out.push(e._missionDbId);
    });
    return out;
  }
  function waiting(s) {
    return !!cRows && finishedOf(s).some(function (m) { var r = cRows[ckey(s.id, m)]; return !(r && r.sent_at); });
  }
  /* 미션 DB id → 이 학생 기록 안의 미션 id (서랍의 미션 알약·이름이 쓰는 id) */
  function clientMid(s, dbId) {
    var e = eventsOf(s).filter(function (x) { return x._missionDbId === dbId && x.mid; })[0];
    return e ? e.mid : null;
  }

  /* 학생 화면을 열 때 이미 끝났는데 행이 없는 것 — 알림 없이 하나씩 차례로 읽어 둔다 */
  CC._compassSync = function (roomId) {
    if (!serverOn() || !roomId || !CC.sb.compass) return;
    if (cRoom !== roomId) { cRoom = roomId; cRows = null; cTried = {}; cDraw = {}; cListFail = false; }
    if (cListFail && Date.now() - cListFailAt > 60000) cListFail = false;   /* 한 번 끊겼다고 수업 내내 멈추지 않게 — 1분 뒤 다시 */
    if (cListFail || cSyncing || !C.students.some(function (st) { return finishedOf(st).length; })) return;   /* 끝낸 미션이 없으면 서버에 물을 것도 없다 */
    cSyncing = true;
    var done = function () { cSyncing = false; };
    var loaded = cRows ? Promise.resolve() : CC.sb.compass('list', { classroomId: roomId }).then(function (j) {
      if (cRoom !== roomId) return;
      cRows = {};
      cListFail = false;
      ((j && j.rows) || []).forEach(function (r) { cRows[ckey(r.studentId, r.missionId)] = r; });
    });
    loaded.catch(function () { cListFail = true; cListFailAt = Date.now(); Object.keys(cDraw).forEach(function (k) { cDraw[k](); }); }).then(function () {
      if (!cRows || cRoom !== roomId) return;
      renderFolders();
      Object.keys(cDraw).forEach(function (k) { cDraw[k](); });   /* 열려 있는 카드가 "읽고 있어요" 에 머물지 않게 */
      var todo = [];
      C.students.forEach(function (st) {
        finishedOf(st).forEach(function (m) { if (!cRows[ckey(st.id, m)] && !cTried[ckey(st.id, m)]) todo.push([st, m]); });
      });
      var next = function () {
        var it = todo.shift();
        if (!it || cRoom !== roomId) return;
        return analyze(it[0], it[1], false).then(next);
      };
      return next();
    }).then(done, done);
  };

  /* 한 학생·미션을 읽는다 — 실패해도 던지지 않는다 (표시는 카드가 한다) */
  function analyze(st, dbId, force) {
    var k = ckey(st.id, dbId), roomId = cRoom;
    cTried[k] = 'run';
    if (cDraw[k]) cDraw[k]();
    return CC.sb.compass('analyze', { classroomId: roomId, studentId: st.id, missionId: dbId, force: !!force }).then(function (row) {
      if (cRoom !== roomId) return;
      delete cTried[k];
      cRows[k] = row;
    }, function () { cTried[k] = 'fail'; }).then(function () {
      if (cDraw[k]) cDraw[k]();
      renderFolders();
    });
  }

  function compassCard(st, dbId, title) {
    var k = ckey(st.id, dbId);
    var card = el('section', 'compass-card');
    card.setAttribute('aria-label', '나침반 · ' + title);
    var n = ++cSeq;
    var draw = function () {
      card.innerHTML = '';
      card.appendChild(el('h4', null, '나침반 · ' + title));
      var row = cRows && cRows[k];
      if (!row) {
        if (cTried[k] === 'fail' || (cListFail && !cRows)) {
          card.appendChild(el('p', 'recap-fail', COMPASS_FAIL));
          var again = el('button', 'pill compass-reread', '다시 읽기');
          again.type = 'button';
          again.addEventListener('click', function () {
            if (!cRows) { cListFail = false; card.innerHTML = ''; draw(); CC._compassSync(cRoom); } else analyze(st, dbId, false);   /* 목록부터 못 받았으면 목록부터 */
          });
          card.appendChild(again);
        } else card.appendChild(el('p', 'emptyrow', '읽고 있어요.'));
        return;
      }
      var top = el('div', 'compass-top');
      var fig = el('div', 'compass-fig');
      fig.innerHTML = CC.compass.svg(row.levels, row.needle_deg);   /* core 가 숫자만으로 만든 마크업 */
      top.appendChild(fig);
      var dl = el('div', 'compass-dirs');
      ['N', 'E', 'S', 'W'].forEach(function (d) {
        var line = el('div', 'compass-dir');
        line.appendChild(el('span', 'dn', CC.compass.DIRS[d]));
        line.appendChild(el('span', 'lv', ((row.levels || {})[d] || 0) + '단계'));
        var ids = (row.evidence || {})[d] || [];
        ids.forEach(function (id) {
          var f = (row.facts || []).filter(function (x) { return x.id === id; })[0];
          line.appendChild(el('span', 'ev', f ? (f.kind === 'tutor' ? '튜터에게: "' + f.text + '"' : f.text) : '튜터 질문'));
        });
        dl.appendChild(line);
      });
      top.appendChild(dl);
      card.appendChild(top);
      if (row.needle_deg == null) card.appendChild(el('p', 'was', CC.compass.NONE));
      if (row.ai_note) card.appendChild(el('p', 'compass-ai', row.ai_note));

      var form = el('div', 'compass-form');
      var sid = 'cp-dir-' + n, tid = 'cp-note-' + n;
      var l1 = el('label', null, '학생에게 보일 방향'); l1.htmlFor = sid;
      var sel = el('select'); sel.id = sid;
      [['', '고르지 않음']].concat(['N', 'E', 'S', 'W'].map(function (d) { return [d, CC.compass.DIRS[d]]; })).forEach(function (o) {
        var op = el('option', null, o[1]); op.value = o[0]; sel.appendChild(op);
      });
      sel.value = (row.sent_at ? row.teacher_dir : row.strongest) || '';
      var l2 = el('label', null, '한마디 — 학생에게 그대로 보여요.'); l2.htmlFor = tid;
      var ta = el('textarea'); ta.id = tid; ta.rows = 3; ta.maxLength = 300;
      ta.value = row.sent_at ? (row.teacher_note || '') : '';
      var msg = el('p', 'compass-msg'); msg.setAttribute('aria-live', 'polite');
      var acts = el('div', 'compass-acts');
      var send = el('button', 'pill compass-send', '보내기'); send.type = 'button';
      var re = el('button', 'pill compass-reread', '다시 읽기'); re.type = 'button';
      send.addEventListener('click', function () {
        if (!ta.value.trim()) { msg.textContent = '한마디를 적어 주세요.'; return; }
        send.disabled = true;
        CC.sb.compass('send', { classroomId: cRoom, studentId: st.id, missionId: dbId, dir: sel.value || null, note: ta.value })
          .then(function (r) { cRows[k] = r; draw(); renderFolders(); },
            function () { msg.textContent = '지금은 보내지 못했어요. 잠시 뒤 다시 눌러 주세요.'; send.disabled = false; });
      });
      if (cTried[k] === 'run') re.disabled = true;   /* 읽는 중에 또 누르면 AI 를 두 번 부른다 */
      re.addEventListener('click', function () { if (cTried[k] === 'run') return; re.disabled = true; analyze(st, dbId, true); });
      acts.appendChild(send); acts.appendChild(re);
      [l1, sel, l2, ta].forEach(function (x) { form.appendChild(x); });
      form.appendChild(acts);
      form.appendChild(msg);
      card.appendChild(form);
      if (row.sent_at) {
        var sent = el('div', 'compass-sent');
        sent.appendChild(el('span', 'tag', '보냈어요'));
        sent.appendChild(el('p', 'compass-sent-note', row.teacher_note || ''));
        card.appendChild(sent);
      }
    };
    cDraw[k] = draw;
    draw();
    return card;
  }

  function openDetail(s, mid) {
    var all = eventsOf(s);
    var ms = mids(all);
    var evs = mid ? all.filter(function (e) { return e.mid === mid; }) : all;
    var v = mid ? (CC.fold.fold(evs, { id: s.id, name: s.name }) || CC.fold.empty(s.id, s.name)) : s;

    var d = $('#detail');
    d.innerHTML = '';
    var close = el('button', 'close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '닫기');
    close.addEventListener('click', closeDetail);
    d.appendChild(close);

    /* 머리 — 이름과 지금 상태 한 줄. 계정 일은 오른쪽 끝에 작게: 서랍을 연 이유가 아니다 */
    var head = el('header', 'd-head');
    var who = el('div', 'd-who');
    who.appendChild(el('h3', 'big-title', s.name));
    who.appendChild(el('p', 'dsub', (s.noRecord ? '아직 기록이 없어요' : '지금 ' + whereNow(s) + ' · 마지막 조작 ' + mmss(s.idleSec)) +
      (s.onboard && s.onboard.stage && CC.onboard ? ' · 레벨 ' + CC.onboard.LABEL[s.onboard.stage] : '')));
    head.appendChild(who);
    if (CC.sb && CC.sb.active() && CC._removeStudent) {   /* 교실이 서버에만 있다 — 로컬 모드에는 뺄 교실이 없다 */
      var acts = el('div', 'd-acts');
      var inRoster = (CC.classroom.roster || []).filter(function (r) { return r.id === s.id; })[0];
      if (inRoster && inRoster.login_id && CC._resetPassword) {   /* 선생님이 만든 계정만 — 이메일로 가입한 예전 학생은 아이디가 없다 */
        var rp = el('button', 'pill roster-reset', '비밀번호 다시 만들기');
        rp.type = 'button';
        rp.addEventListener('click', function () { CC._resetPassword(inRoster); });
        acts.appendChild(rp);
      }
      var rm = el('button', 'pill roster-remove', '교실에서 빼기');
      rm.type = 'button';
      rm.addEventListener('click', function () { CC._removeStudent(s); });
      acts.appendChild(rm);
      head.appendChild(acts);
    }
    d.appendChild(head);
    delete fresh[s.id];

    /* 교사가 할 말을 대신 써주지 않는다. 물어볼 질문만 고른다. 서랍을 열면 제일 먼저 보인다 */
    var say = el('div', 'saybox');
    say.appendChild(el('span', 'k', '이 학생에게 먼저 물어볼 것'));
    say.appendChild(el('span', null, nextQuestion(s)));
    d.appendChild(say);

    /* 미션 고르기 — 기록이 미션 하나뿐이면 고를 게 없다 */
    if (ms.length > 1) {
      var pills = el('div', 'mf-row');
      pills.setAttribute('aria-label', '미션');
      [null].concat(ms).forEach(function (id, i) {
        var b = el('button', 'mf', id ? missionName(id, i - 1) : '모든 미션');
        b.type = 'button';
        b.setAttribute('aria-pressed', (id || null) === (mid || null) ? 'true' : 'false');
        if (id) b.appendChild(el('span', 'st', CC.fold.missionStatus(all.filter(function (e) { return e.mid === id; })) === 'done' ? '완료' : '아직'));
        b.addEventListener('click', function () { openDetail(s, id); });
        pills.appendChild(b);
      });
      d.appendChild(pills);
    }

    if (serverOn()) {   /* 로컬 모드에는 나침반이 없다 */
      finishedOf(s).forEach(function (dbId) {
        var cm = clientMid(s, dbId);
        if (mid && cm !== mid) return;
        d.appendChild(compassCard(s, dbId, missionName(cm, ms.indexOf(cm))));
      });
    }

    var cols = el('div', 'd-cols');
    var main = el('section', 'd-main');
    main.setAttribute('aria-label', '기록');
    main.appendChild(el('h4', null, '이 학생이 한 것 — 순서대로'));
    main.appendChild(el('p', 'lead', '노란 표시는 말 걸기 좋은 순간이에요.'));
    var dl = el('dl', 'd-rows');

    /* 문장형 미션 */
    if (v.sDefine) {
      var defs = evs.filter(function (e) { return e.type === 's-define' || e.type === 's-redefine'; });
      var first = defs.length ? (defs[0].choice || defs[0].to) : null;
      row(dl, '성공 조건', lastT(evs, ['s-define', 's-redefine']), function (dd) {
        dd.appendChild(document.createTextNode(v.sDefine.choice || ''));
        if (v.sDefineVer > 1) {
          mark(dd, '다시 정함');
          was(dd, '고친 횟수 ' + (v.sDefineVer - 1) + '번' + (first && first !== v.sDefine.choice ? ' · 처음: “' + first + '”' : ''));
        }
        if (v.sDefine.reason) was(dd, '이유 “' + v.sDefine.reason + '”');
      });
    }
    var paired = !!(v.sMethod && v.sCodes.length);   /* 설계 카드와 마지막 코드를 나란히 — 판단은 강사가 한다 */
    if (v.sMethod) {
      var sl = v.sMethod.slots || {};
      var cardTexts = v.sMethod.cards
        ? v.sMethod.cards.map(function (c) { return CC.cards.text(c); })
        : Object.keys(sl).map(function (k) { return sl[k]; }).filter(Boolean);  /* 예전 기록 */
      row(dl, '설계도', lastT(evs, ['s-method', 's-remethod', 's-design']), function (dd) {
        if (paired) {
          var pair = el('div', 'd-pair');
          var pc = el('div', 'd-pair-cards');
          pc.appendChild(el('span', 'sub', '고른 설계 카드'));
          pc.appendChild(document.createTextNode(cardTexts.join(' → ')));
          pair.appendChild(pc);
          var pk = el('div', 'd-pair-code');
          pk.appendChild(el('span', 'sub', '마지막으로 실행한 코드'));
          pk.appendChild(codeBlock(v.sCodes[v.sCodes.length - 1].code));
          pair.appendChild(pk);
          dd.appendChild(pair);
        } else dd.appendChild(document.createTextNode(cardTexts.join(' → ')));
        if (v.sMethodVer > 1) was(dd, '고친 횟수 ' + (v.sMethodVer - 1) + '번');
        if (v.sMethod.reason) was(dd, '이유 “' + v.sMethod.reason + '”');
      });
    }
    if (v.sCodes.length) {
      var lastCode = v.sCodes[v.sCodes.length - 1];
      row(dl, '코드 실행', lastCode.t, function (dd) {
        dd.appendChild(el('span', 'sub', paired ? '실행 ' + v.sCodes.length + '번' : '마지막으로 실행한 코드 · 실행 ' + v.sCodes.length + '번'));
        if (!paired) dd.appendChild(codeBlock(lastCode.code));
      });
      /* 자료마다 마지막 결과 — dataId 에는 자료 값이 들어 있다 (sentence.js lastResults 와 같은 규칙) */
      var byData = {}, order = [];
      v.sCodes.forEach(function (c) {
        if (!(c.dataId in byData)) order.push(c.dataId);
        byData[c.dataId] = { out: c.error || String(c.output || '').trim() || '출력 없음', err: !!c.error };
      });
      var m = missionOf(mid || (ms.length === 1 ? ms[0] : null));   /* 자료 값 → 자료 이름 */
      row(dl, '자료별 결과', lastCode.t, function (dd) {
        /* 학생 04 화면의 결과 표와 같은 세 칸 — 자료 · 내용 · 결과 */
        var tb = el('table', 'd-tbl');
        var hr = el('tr');
        ['자료', '내용', '결과'].forEach(function (h) { var th = el('th', null, h); th.scope = 'col'; hr.appendChild(th); });
        tb.appendChild(el('thead')).appendChild(hr);
        var body = tb.appendChild(el('tbody'));
        order.forEach(function (val, i) {
          var inp = m && (m.inputs || []).filter(function (x) { return x.v === val; })[0];
          var tr = body.appendChild(el('tr'));
          tr.appendChild(el('td', null, inp ? inp.name : '자료 ' + (i + 1)));
          tr.appendChild(el('td', 'mono', String(val == null ? '' : val)));
          tr.appendChild(el('td', 'mono out' + (byData[val].err ? ' err' : ''), byData[val].out));
        });
        dd.appendChild(tb);
      });
    }
    /* 코드 사실 — 실행·구조로 확실한 것만, 한 줄에 하나. 판정이나 점수가 아니다 (미션 하나가 정해졌을 때만) */
    var fm = v.sCodes.length && missionOf(mid || (ms.length === 1 ? ms[0] : null));
    if (fm && CC.facts) {
      var facts = CC.facts.of(v, fm);
      if (facts.length) {
        facts.forEach(function (f) {
          row(dl, '코드 사실', v.sProbe ? v.sProbe.t : (v.sCodes.length ? v.sCodes[v.sCodes.length - 1].t : null), function (dd) { dd.textContent = f.text; });
        });
      }
    }
    var judges = v.sJudges.concat(v.sCodeJudges).sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
    if (judges.length) {
      var seq = [];
      judges.forEach(function (j) { if (seq[seq.length - 1] !== j.verdict) seq.push(j.verdict); });
      var lastJ = judges[judges.length - 1];
      row(dl, '스스로 판단', lastJ.t, function (dd) {
        dd.appendChild(document.createTextNode(seq.join(' → ')));
        /* "지키지 못했다" 였다가 바뀐 경우 — 자기 결과를 스스로 깨뜨린 순간 */
        var miss = seq.indexOf('지키지 못했다');
        if (miss !== -1 && miss < seq.length - 1) mark(dd, '스스로 깨뜨림');
        /* 판단마다 한 줄 — 앞선 근거도 지우지 않는다 (예전 활동 타임라인이 보여 주던 것) */
        judges.forEach(function (j) {
          was(dd, (j.t ? hm(j.t) + ' · ' : '') + j.verdict + (j.basis ? ' “' + j.basis + '”' : ''));
        });
      });
    }
    if (v.sHelps) row(dl, '도움 요청', lastT(evs, ['s-help']), function (dd) { dd.textContent = v.sHelps + '번'; });
    if (v.sWrap) row(dl, '정리', lastT(evs, ['s-wrap']), function (dd) { dd.textContent = '“' + v.sWrap + '”'; });

    /* 블록 미션 (01·02·03·06) · 04 · 05 · 졸업 과제 — 예전 기록도 그대로 보인다 */
    if (!mid) {
      if (s.define.text !== '아직 안 정함') row(dl, '정한 성공', null, function (dd) {
        dd.textContent = s.define.text;
        if (s.redefined) mark(dd, '다시 정함');
      });
      if (s.why.text !== '아직 안 정함') row(dl, '자를 기준을 고른 이유', null, function (dd) { dd.textContent = s.why.text; });
      if (s.blocks.length) row(dl, '지금 만든 순서', null, function (dd) {
        dd.textContent = s.blocks.map(function (id) { return CC.block(id).label; }).join(' → ');
      });
      if (s.symptom) row(dl, '학생이 쓴 증상', null, function (dd) {
        dd.textContent = s.symptom.act
          ? '“' + CC.josa(s.symptom.exp, '이/가') + ' 나올 줄 알았는데 ' + CC.josa(s.symptom.act, '이/가') + ' 나왔어요”' +
            (s.symptom.blk ? ' · 의심 블록 ' + s.symptom.blk : '')
          : '“' + CC.josa(s.symptom.exp, '이/가') + ' 나올 줄 알았어요” — 실제로 뭐가 나왔는지는 못 골랐어요';
      });
      if (s.selfFound) row(dl, '스스로 판단', null, function (dd) { dd.textContent = '깨진 곳을 찾아냈어요'; mark(dd, '스스로 깨뜨림'); });
      if (s.revised) row(dl, '스스로 고친 기준', null, function (dd) {
        dd.textContent = s.revised + '번' + (s.lastRevision ? ' · 마지막 ' + s.lastRevision.from + ' → ' + s.lastRevision.to : '');
        mark(dd, '다시 정함');
      });
      if (s.cause) row(dl, '깨진 원인을 이렇게 봤어요', null, function (dd) { dd.textContent = s.cause + (s.handle ? ' → ' + s.handle : ''); });
      if (s.abstractOk !== null && s.abstractOk !== undefined) row(dl, '미션 04 · 추상화', null, function (dd) {
        dd.textContent = s.abstractOk
          ? '함수 하나로 두 업무를 다 해냈어요'
          : '값 하나를 안 빼서 두 번째 업무가 무너졌어요' +
            (s.abstractPicked ? ' (밖으로 뺀 것: ' + s.abstractPicked.map(function (k) { return SLOT_LABEL[k] || k; }).join(', ') + ')' : '');
      });
      if (s.reviewComments) row(dl, '미션 05 · 동료 검토', null, function (dd) {
        dd.textContent = '질문형 코멘트 ' + s.reviewComments + '개를 보냈어요' +
          (s.reviewGuess ? ' · 예측: ' + (s.reviewGuess.guess === 'hold' ? '버틸 것' : '깨질 것') : '');
      });
      if (s.made) row(dl, '이 학생이 만든 미션', null, function (dd) {
        dd.textContent = '“' + s.made.brief + '”';
        was(dd, '자료: ' + s.made.inputs.join(' / ') + ' · 함정 ' + s.made.traps + '개');
      });
      if (s.wrap) row(dl, '오늘 이 학생이 말할 문장', null, function (dd) { dd.textContent = s.wrap; });
    }
    /* 미션 하나를 끝냈고 튜터와 말을 나눴을 때만 — 미션이 하나뿐이면 고르지 않아도 그 미션이다 */
    var rmid = mid || (ms.length === 1 ? ms[0] : null);
    if (rmid && CC.sb && CC.sb.active() && CC.fold.missionStatus(evs) === 'done' && v.sTutor.length) row(dl, '수업에서 짚을 거리', null, function (dd) {
      var b = el('button', 'pill recap-go', '튜터 대화에서 뽑기');
      b.type = 'button';
      var out = el('div', 'recap-out');
      out.setAttribute('aria-live', 'polite');
      recapOn(b, out, function () { return CC.recap.forStudent(s, rmid, eventsOf, missionOf); }, false);
      dd.appendChild(b);
      dd.appendChild(out);
    });
    if (!dl.children.length) dl.appendChild(el('p', 'emptyrow', '아직 기록이 없어요.'));
    main.appendChild(dl);
    cols.appendChild(main);

    var side = el('section', 'd-side');
    side.setAttribute('aria-label', '튜터 질문');
    side.appendChild(el('h4', null, '튜터에게 물은 것' + (v.sTutor.length ? ' (' + v.sTutor.length + '번)' : '')));
    side.appendChild(el('p', 'lead', '질문과 답을 그대로 보여 드려요.'));
    var qs = el('div', 'd-qs');
    /* 한 번 묻고 한 번 답한 것이 한 묶음. 되물음·답 안 함은 시각 옆 꼬리표로 */
    v.sTutor.forEach(function (x) {
      var q = el('div', 'q');
      var meta = el('div', 'q-meta');
      meta.appendChild(el('span', 'tm', hm(x.t)));
      var tag = x.kind === 'ask_back' ? '튜터가 되물었어요' : x.refused ? '튜터가 답하지 않았어요' : '';
      if (tag) meta.appendChild(el('span', 'tag', tag));
      q.appendChild(meta);
      var qq = el('p', 'qq'); qq.appendChild(el('span', 'who', '학생')); qq.appendChild(document.createTextNode(x.question || ''));
      var qa = el('p', 'a'); qa.appendChild(el('span', 'who', '튜터')); qa.appendChild(document.createTextNode(x.answer || ''));
      q.appendChild(qq);
      q.appendChild(qa);
      if (x.reasons && x.reasons.length) q.appendChild(el('div', 'why', x.reasons.join(' / ')));
      qs.appendChild(q);
    });
    if (!v.sTutor.length) qs.appendChild(el('p', 'emptyrow', '아직 없어요.'));
    side.appendChild(qs);
    cols.appendChild(side);
    d.appendChild(cols);

    $('#scrim').hidden = false;
    d.hidden = false;
    renderFolders();
  }

  function nextQuestion(s) {
    if (s.define.trap === 'hardcode') return '“주문서가 다르게 오면 그때도 성공이라고 할 수 있을까?”';
    if (s.define.trap === 'luck') return '“오류가 안 났는데 결과가 틀렸으면, 그건 성공일까?”';
    if (s.symptom && !s.symptom.act) return '“실행 버튼 누르기 전에 뭐가 나올 것 같았어?”';
    if (s.cause && s.cause.indexOf('형식이 다른') === 0) return '입력 탓으로 판단한 학생입니다. 틀린 판단이 아니에요 — “그럼 그런 주문서가 또 오면 프로그램은 뭘 해야 할까?”로 이어가주세요.';
    if (s.why.weak) return '“그 기준이 다음 주문서에도 있을까? 어떻게 확신해?”';
    if (!s.asked && s.stage < 4) return '“지금 어디까지 확인해봤어?” — 답을 주지 말고 마지막으로 확인한 지점을 먼저 물어보세요.';
    if (s.redefined) return '성공 조건 자체를 다시 정했습니다. 문제를 다시 정의한 거라 이 수업에서 제일 깊은 수정이에요. 지금 한마디 해주세요 — 문구는 제안하지 않습니다.';
    if (s.revised) return '결과를 보고 스스로 기준을 고쳤습니다. 이게 정답을 맞힌 것보다 중요한 순간이에요. 지금 한마디 해주세요 — 문구는 제안하지 않습니다. 선생님 말이어야 효과가 있습니다.';
    if (s.selfFound) return '스스로 깨진 곳을 찾아냈습니다. 지금 한마디 해주세요. 문구는 제안하지 않습니다 — 선생님 말이어야 효과가 있습니다.';
    return '“왜 그 순서로 놓았는지 설명해줄래?”';
  }

  function closeDetail() {
    $('#detail').hidden = true;
    $('#scrim').hidden = true;
  }
  $('#scrim').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDetail();
  });

  $('#notes-toggle').addEventListener('click', function () {
    var on = document.body.classList.toggle('notes');
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  /* ── 실시간 연결 안내 ────────────────────────────── */
  var MISSION_NAME = {
    m1: '미션 01 분해', m2: '미션 02 반복과 조건', m3: '미션 03 다른 세계에서',
    m6: '미션 06 세어보기'
  };

  function headline() {
    var h = document.querySelector('#class-label');
    if (h && me && me.mission && MISSION_NAME[me.mission]) {
      h.textContent = '2학년 3반 · ' + MISSION_NAME[me.mission];
    }
  }

  function liveBanner() {
    var host = $('#livebar');
    if (!host) return;
    if (me) {
      host.className = 'livebar on';
      host.innerHTML = '';
      host.appendChild(el('span', 'dot'));
      host.appendChild(el('span', 'txt',
        '학생 화면에서 들어온 진짜 기록이 아래 목록 맨 앞에 섞여 있어요. 목업 25명 + 실제 1명.'));
      /* 실제 기록이 어느 칸에도 안 들어가는 경우가 있다 (미션 04·05 만 해본 경우 등).
       * 그때도 열어볼 수 있어야 시연이 끊기지 않는다. */
      var open = el('button', 'tbtn', '내 기록 열기');
      open.type = 'button';
      open.addEventListener('click', function () { openDetail(me); });
      host.appendChild(open);

      var b = el('button', 'tbtn', '내 기록 지우기');
      b.type = 'button';
      b.addEventListener('click', function () { CC.store.clear(); location.reload(); });
      host.appendChild(b);
    } else if (CC.store && !CC.store.available()) {
      host.className = 'livebar off';
      host.textContent = '이 브라우저는 file:// 에서 저장을 막고 있어서 학생 화면과 연결되지 않습니다. ' +
        '로컬 서버(python3 -m http.server)나 GitHub Pages 에서는 실제 기록이 섞여 보여요. 지금은 목업 26명입니다.';
    } else {
      host.className = 'livebar off';
      host.textContent = '아직 학생 화면에서 들어온 기록이 없습니다. 학생 화면을 한 번 진행하고 돌아오면 ' +
        '맨 앞에 실제 기록이 섞여 보여요. 지금은 목업 26명입니다.';
    }
  }

  /* ── 교사 알림 ─────────────────────────────────── */
  var lastSnap = null;
  /* Supabase 모드는 첫 기록을 받기 전까지 기준선을 만들지 않는다 (빈 목록이 기준선이 되면
   * 이미 있던 제출이 전부 새 알림이 된다). 교실을 고를 때마다 다시 시작한다. */
  var alertsLoaded = !(CC.sb && CC.sb.active());
  /* 알림 재료 — 서버 모드는 DB id 로 끝낸 미션을 센다. 미션 이름은 학생 기록 안의 id 로 찾는다 */
  function alertOpt() {
    var on = serverOn();
    return {
      server: on, eventsOf: eventsOf, missionOf: missionOf, finishedOf: on ? finishedOf : null,
      missionName: function (mid, s) {
        var m = missionOf(on && s ? clientMid(s, mid) : mid);
        return m && m.title ? m.title : '';
      }
    };
  }
  CC._resetAlerts = function () { cRoom = null; lastSnap = null; alertsLoaded = !(CC.sb && CC.sb.active()); };
  CC._alertsLoaded = function (students) { alertsLoaded = true; if (!lastSnap) lastSnap = CC.alerts.snap(students || [], alertOpt()); };
  /* 말 걸 순간 — 시각 · 학생 이름 · 사실 문장. 문장은 CC.alerts.say 그대로, 칭찬 문구는 쓰지 않는다 */
  function showAlert(a) {
    var text = CC.alerts.say(a);
    var host = $('#toasts');
    if (host) {
      var toast = el('div', 'toast', text);
      host.appendChild(toast);
      setTimeout(function () { toast.remove(); }, 5000);
    }
    fresh[a.id] = true;
    var list = $('#alert-list');
    if (list) {
      var li = el('li', 'mo');
      li.appendChild(el('span', 'tm', hm(Date.now())));
      var body = el('span');
      var who = el('button', 'who', a.name);
      who.type = 'button';
      who.addEventListener('click', function () {
        var s = C.students.filter(function (x) { return x.id === a.id; })[0];
        if (s) openDetail(s);
      });
      body.appendChild(who);
      body.appendChild(el('span', 'sep', ' · '));
      body.appendChild(document.createTextNode(text));
      li.appendChild(body);
      list.insertBefore(li, list.firstChild);
      while (list.children.length > 10) list.removeChild(list.lastChild);
      $('#moments-empty').hidden = true;
    }
  }

  /* ── 학생 폴더 — 가나다순만. 진도·속도로 줄 세우지 않는다 (CLAUDE.md) ── */
  function renderFolders() {
    var box = $('#student-folders');
    if (!box) return;
    box.innerHTML = '';
    var today = new Date(); today.setHours(0, 0, 0, 0);
    C.students.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); }).forEach(function (s) {
      var t = el('button', 'tile student-tile');
      t.type = 'button';
      var lastAt = Date.now() - (s.idleSec || 0) * 1000;
      var f = el('span', 'folder' + (s.noRecord || lastAt < today.getTime() ? ' gray' : ''));
      f.setAttribute('aria-hidden', 'true');
      f.appendChild(el('span', 'tab'));
      f.appendChild(el('span', 'body'));
      if (fresh[s.id]) f.appendChild(el('span', 'dot'));
      t.appendChild(f);
      t.appendChild(el('span', 'name', s.name));
      t.appendChild(el('span', 'meta', s.noRecord ? '아직 기록이 없어요' : whereNow(s)));
      if (waiting(s)) t.appendChild(el('span', 'tag wait', '한마디 기다림'));
      t.addEventListener('click', function () { openDetail(s); });
      box.appendChild(t);
    });
  }

  /* ── 대시보드 렌더 (외부에서 호출 가능) ──────────── */
  function renderDashboard() {
    renderFolders();
    tiles();
    rowList('#ready', '#p-ready', C.ready(), 'hot', function (s) {
      return s.symptom
        ? '<b>' + esc(s.symptom.exp) + '</b>' + J(s.symptom.exp, '이/가') + ' 나올 줄 알았는데 <b>' +
          esc(s.symptom.act) + '</b>' + J(s.symptom.act, '이/가') + ' 나왔대요'
        : '증상을 말하고 있어요';
    });
    rowList('#half', '#p-half', C.halfAsked(), 'warm', function (s) {
      return s.symptom
        ? '<b>' + esc(s.symptom.exp) + '</b>' + J(s.symptom.exp, '을/를') + ' 기대했다고만 썼어요'
        : '';
    });
    rowList('#quiet', '#p-quiet', C.quiet(), 'calm', function (s) {
      return C.STAGES[s.stage] + ' 단계에서 멈춘 채 호출이 없어요';
    });
    rowList('#praise', '#p-praise', C.praise(), 'warm', function (s) {
      if (s.redefined) return '결과를 보고 <b>성공 조건 자체를 다시 정함</b>';
      if (s.revised) return '결과를 보고 <b>기준을 스스로 고침</b>';
      if (s.sDefineVer > 1) return '<b>성공 조건을 수정함</b> (' + (s.sDefineVer - 1) + '회)';
      if (s.sMethodVer > 1) return '<b>방법을 수정함</b> (' + (s.sMethodVer - 1) + '회)';
      if (s.sJudges.length) return '<b>자료를 판정함</b> (' + s.sJudges.length + '건)';
      return '<b>깨진 곳을 스스로 찾아냄</b>';
    });
    risk();
    funnel();

    /* 문장형 활동이 있는 학생 별도 표시 */
    var sActive = C.students.filter(function (s) { return s.sDefine || s.sRuns.length; });
    if (!(CC.sb && CC.sb.active())) {
      /* 로컬 모드 — 이 브라우저의 기록을 열어볼 문이 있어야 한다.
       * 문장형만 한 학생은 어느 명단 칸에도 안 들어갈 수 있다. */
      liveBanner();
    } else if (sActive.length) {
      var banner = document.querySelector('#livebar');
      if (banner) {
        banner.className = 'livebar on';
        banner.innerHTML = '';
        banner.appendChild(el('span', 'dot'));
        banner.appendChild(el('span', 'txt', '실제 학생 ' + sActive.length + '명의 활동이 있어요.'));
      }
    }

    if (!alertsLoaded) return;
    var nowSnap = CC.alerts.snap(C.students, alertOpt());
    CC.alerts.diff(lastSnap, nowSnap).forEach(showAlert);
    lastSnap = nowSnap;
    renderFolders();
  }

  /* 로컬 모드: 학생 탭이 기록하면 브라우저가 storage 이벤트를 준다. 폴링이 필요 없다. */
  window.addEventListener('storage', function () {
    if (CC.sb && CC.sb.active()) return;
    var fresh = CC.store ? CC.store.fold('나') : null;
    C.students = C.students.filter(function (s) { return s !== me && s.id !== (fresh && fresh.id); });
    if (fresh) { me = fresh; C.students = [fresh].concat(C.students); }
    renderDashboard();
  });

  recapOn($('#recap-class'), $('#recap-class-out'), function () { return CC.recap.build(C.students, eventsOf, missionOf); }, true);

  /* 튜터 기록 CSV — 수업 개선용. 파일 만들기는 화면 일이라 여기에 둔다 */
  $('#tutor-csv').addEventListener('click', function () {
    var rows = CC.csv.tutorRows(C.students, function (mid) { var m = missionOf(mid); return m && m.title; });
    var d = new Date(), p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    var room = ($('#dash-title').textContent || '교실').replace(/[\\/:*?"<>|\s]+/g, '-');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([CC.csv.toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    a.download = 'tutor-' + room + '-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  /* 외부에서 호출할 수 있게 노출 */
  CC._renderDashboard = renderDashboard;
  CC._closeDetail = closeDetail;

  /* 초기 렌더 */
  renderDashboard();
})(window.CC = window.CC || {});
