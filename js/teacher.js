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
  var C = CC.classroom;

  /* 학생 화면이 남긴 진짜 기록을 목업 교실 맨 앞에 끼운다.
   * 시연할 때 "내가 방금 한 게 저기 뜬다"가 보여야 한다. */
  var me = CC.store ? CC.store.fold('나') : null;
  if (me) C.students = [me].concat(C.students);
  var J = function (w, pair) { return CC.particle(w, pair); };

  function mmss(sec) {
    var m = Math.floor(sec / 60);
    return m < 1 ? '방금' : m + '분째';
  }

  /* ── 요약 타일 ───────────────────────────────────── */
  function tiles() {
    var t = $('#tiles');
    var quiet = C.quiet(), ready = C.ready(), risky = C.risky();
    var done = C.students.filter(function (s) { return s.stage >= 3; }).length;

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

  /* ── 학생 상세 ───────────────────────────────────── */
  function openDetail(s) {
    var d = $('#detail');
    d.innerHTML = '';
    var close = el('button', 'close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '닫기');
    close.addEventListener('click', closeDetail);
    d.appendChild(close);

    d.appendChild(el('h3', null, s.name));
    d.appendChild(el('p', 'dsub', C.STAGES[s.stage] + ' 단계 · 마지막 조작 ' + mmss(s.idleSec)));

    var g = el('div', 'dgrid');

    var b1 = el('div', 'dbox' + (s.define.trap ? ' flag' : ''));
    b1.appendChild(el('span', 'k', '이 학생이 정한 성공'));
    b1.appendChild(el('div', 'v', s.define.text));
    g.appendChild(b1);

    var b2 = el('div', 'dbox' + (s.why.weak ? ' flag' : ''));
    b2.appendChild(el('span', 'k', '자를 기준을 고른 이유'));
    b2.appendChild(el('div', 'v', s.why.text));
    g.appendChild(b2);

    var b3 = el('div', 'dbox');
    b3.appendChild(el('span', 'k', '지금 만든 순서'));
    if (s.blocks.length) {
      var bl = el('div', 'dblocks');
      s.blocks.forEach(function (id) { bl.appendChild(el('span', null, CC.block(id).label)); });
      b3.appendChild(bl);
    } else {
      b3.appendChild(el('div', 'v', '아직 블록을 놓지 않았어요'));
    }
    g.appendChild(b3);

    if (s.wrap) {
      var b7 = el('div', 'dbox');
      b7.appendChild(el('span', 'k', '오늘 이 학생이 말할 문장'));
      b7.appendChild(el('div', 'v', s.wrap));
      g.appendChild(b7);
    }

    if (s.cause) {
      var b6 = el('div', 'dbox');
      b6.appendChild(el('span', 'k', '깨진 원인을 이렇게 봤어요'));
      b6.appendChild(el('div', 'v', s.cause + (s.handle ? ' → ' + s.handle : '')));
      g.appendChild(b6);
    }

    if (s.revised) {
      var b5 = el('div', 'dbox');
      b5.appendChild(el('span', 'k', '스스로 고친 횟수'));
      b5.appendChild(el('div', 'v', s.revised + '번' +
        (s.lastRevision ? ' · 마지막 ' + s.lastRevision.from + ' → ' + s.lastRevision.to : '')));
      g.appendChild(b5);
    }

    if (s.symptom) {
      var b4 = el('div', 'dbox');
      b4.appendChild(el('span', 'k', '학생이 쓴 증상'));
      b4.appendChild(el('div', 'v', s.symptom.act
        ? '“' + CC.josa(s.symptom.exp, '이/가') + ' 나올 줄 알았는데 ' +
          CC.josa(s.symptom.act, '이/가') + ' 나왔어요”' +
          (s.symptom.blk ? ' · 의심 블록 ' + s.symptom.blk : '')
        : '“' + CC.josa(s.symptom.exp, '이/가') + ' 나올 줄 알았어요” — 실제로 뭐가 나왔는지는 못 골랐습니다'));
      g.appendChild(b4);
    }
    d.appendChild(g);

    /* 교사가 할 말을 대신 써주지 않는다. 물어볼 질문만 고른다. */
    var say = el('div', 'saybox');
    say.appendChild(el('span', 'k', '이 학생에게 먼저 물어볼 것'));
    say.appendChild(el('span', null, nextQuestion(s)));
    d.appendChild(say);

    $('#scrim').hidden = false;
    d.hidden = false;
  }

  function nextQuestion(s) {
    if (s.define.trap === 'hardcode') return '“주문서가 다르게 오면 그때도 성공이라고 할 수 있을까?”';
    if (s.define.trap === 'luck') return '“오류가 안 났는데 결과가 틀렸으면, 그건 성공일까?”';
    if (s.symptom && !s.symptom.act) return '“실행 버튼 누르기 전에 뭐가 나올 것 같았어?”';
    if (s.cause && s.cause.indexOf('형식이 다른') === 0) return '입력 탓으로 판단한 학생입니다. 틀린 판단이 아니에요 — “그럼 그런 주문서가 또 오면 프로그램은 뭘 해야 할까?”로 이어가주세요.';
    if (s.why.weak) return '“그 기준이 다음 주문서에도 있을까? 어떻게 확신해?”';
    if (!s.asked && s.stage < 4) return '“지금 어디까지 확인해봤어?” — 답을 주지 말고 마지막으로 확인한 지점을 먼저 물어보세요.';
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
  function liveBanner() {
    var host = $('#livebar');
    if (!host) return;
    if (me) {
      host.className = 'livebar on';
      host.innerHTML = '';
      host.appendChild(el('span', 'dot'));
      host.appendChild(el('span', 'txt',
        '학생 화면에서 들어온 진짜 기록이 아래 목록 맨 앞에 섞여 있어요. 목업 25명 + 실제 1명.'));
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

  /* ── 초기 렌더 ───────────────────────────────────── */
  liveBanner();
  tiles();
  rowList('#ready', '#p-ready', C.ready(), 'hot', function (s) {
    return '<b>' + esc(s.symptom.exp) + '</b>' + J(s.symptom.exp, '이/가') + ' 나올 줄 알았는데 <b>' +
      esc(s.symptom.act) + '</b>' + J(s.symptom.act, '이/가') + ' 나왔대요' +
      (s.symptom.blk ? ' · ' + esc(s.symptom.blk) : '');
  });
  rowList('#half', '#p-half', C.halfAsked(), 'warm', function (s) {
    return '<b>' + esc(s.symptom.exp) + '</b>' + J(s.symptom.exp, '을/를') +
      ' 기대했다고만 썼어요. 실제로 뭐가 나왔는지는 못 골랐습니다';
  });
  rowList('#quiet', '#p-quiet', C.quiet(), 'calm', function (s) {
    return C.STAGES[s.stage] + ' 단계에서 멈춘 채 호출이 없어요';
  });
  rowList('#praise', '#p-praise', C.praise(), 'warm', function (s) {
    if (s.revised) {
      return '결과를 보고 <b>자를 기준을 스스로 고침</b>' +
        (s.lastRevision ? ' (' + esc(s.lastRevision.from) + ' → ' + esc(s.lastRevision.to) + ')' : '');
    }
    return '<b>깨진 곳을 스스로 찾아냄</b>';
  });
  risk();
  funnel();
})(window.CC = window.CC || {});
