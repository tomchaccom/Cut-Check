/* 관리자 화면 — 강사별 생성 한도와 최근 생성 기록. 서버(/api/admin)가 관리자인지 정한다.
 * 서버가 준 글(이름·이메일·수업 내용)은 모두 textContent 로만 넣는다. */
(function (CC) {
  function $(s) { return document.querySelector(s); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  /* 칸 하나 — data-l 은 휴대폰 카드에서 칸 이름으로 보인다 */
  function td(label, v) { var c = el('td', null, String(v == null ? '' : v)); c.setAttribute('data-l', label); return c; }
  var NOT_ADMIN = '관리자만 볼 수 있어요.';
  var KIND = { step: '단계별', quick: '빠른' };
  var SAVED = '저장했어요.';

  function admin(body) { return CC.sb.api('/api/admin', body); }
  function note(t) { $('#ad-note').textContent = t; }
  function stop(e) { $('#ad-main').hidden = true; note(e && e.status === 403 ? NOT_ADMIN : (e && e.message) || '잠시 뒤에 다시 해 주세요.'); }
  /* 저장했다는 말은 3초만 — 오래 남으면 다음 변경의 결과와 헷갈린다 */
  function flash(m) { m.textContent = SAVED; setTimeout(function () { if (m.textContent === SAVED) m.textContent = ''; }, 3000); }

  /* 빈칸은 0 이 아니라 null 로 — 서버가 400 으로 돌려보낸다(빈칸이 한도 0 이 되면 안 된다) */
  function num(input) { return input.value.trim() === '' ? null : Number(input.value); }

  /* 남은 칸 — '다 씀'(한도를 다 썼다)과 '꺼짐'(관리자가 껐다)을 글자로 가른다 */
  function leftText(t) { return t.disabled ? '꺼짐' : t.left === 0 ? '0 · 다 씀' : String(t.left == null ? '' : t.left); }

  function row(t, saved) {
    var tr = el('tr');
    var who = t.name + ' (' + t.email + ')';   /* 같은 이름의 강사도 이메일로 가른다 */
    tr.appendChild(td('이름', t.name)); tr.appendChild(td('이메일', t.email));
    tr.appendChild(td('쓴', t.used)); tr.appendChild(td('남은', leftText(t)));
    var q = el('input', 'ad-in'); q.type = 'number'; q.min = '0'; q.max = '1000'; q.step = '1'; q.value = t.quota;
    q.setAttribute('aria-label', who + ' 한도');
    var off = el('input'); off.type = 'checkbox'; off.checked = !!t.disabled;
    off.setAttribute('aria-label', who + ' 생성 끄기');
    var msg = el('td', 'ad-msg'); msg.setAttribute('role', 'status');
    if (saved) flash(msg);
    function lock(on) { q.disabled = off.disabled = on; }
    function save(body) {
      lock(true);   /* 저장 중에는 이 줄을 잠근다 — 늦게 온 옛 답이 새 값을 덮지 못하게 */
      msg.className = 'ad-msg'; msg.textContent = '저장 중이에요.';
      admin(body).then(function (n) { if (tr.parentNode) tr.parentNode.replaceChild(row(n, true), tr); })   /* 저장 사이 표를 다시 그렸으면 떨어진 행 */
        .catch(function (e) { lock(false); q.value = t.quota; off.checked = !!t.disabled; msg.className = 'ad-msg err'; msg.textContent = e.message; });
    }
    q.addEventListener('change', function () { save({ action: 'set_quota', id: t.id, quota: num(q) }); });
    off.addEventListener('change', function () { save({ action: 'set_disabled', id: t.id, disabled: off.checked }); });
    var a = td('한도'), lab = el('label', 'ad-off');
    a.appendChild(q); lab.appendChild(off);
    var b = td('생성 끄기'); b.appendChild(lab);
    tr.appendChild(a); tr.appendChild(b);
    msg.setAttribute('data-l', '상태'); tr.appendChild(msg);
    return tr;
  }

  function teachers() {
    return admin({ action: 'list' }).then(function (r) {
      var body = $('#ad-teachers tbody');
      body.textContent = '';
      (r.teachers || []).forEach(function (t) { body.appendChild(row(t)); });
      $('#ad-default').value = r.default_quota;
    });
  }

  /* 개념 id → 이름. 모르는 id(빠른 생성의 옛 값 등)는 그대로 */
  function label(id) {
    var c = CC.codemission && CC.codemission.concept(id);
    return c ? c.label : id;
  }

  function when(at) {
    var d = new Date(at);
    return isNaN(d) ? String(at || '') : d.toLocaleString('ko-KR');
  }

  function log() {
    return admin({ action: 'log' }).then(function (r) {
      var body = $('#ad-log tbody'), rows = r.log || [];
      body.textContent = '';
      $('#ad-log').hidden = !rows.length;
      $('#ad-log-empty').hidden = !!rows.length;
      var cols = ['시각', '강사', '수업 내용', '개념', '종류', '재요청'];
      rows.forEach(function (x) {
        var tr = el('tr');
        [when(x.at), x.teacher, x.lesson, label(x.concept), KIND[x.kind] || x.kind, x.retries].forEach(function (v, i) { tr.appendChild(td(cols[i], v)); });
        body.appendChild(tr);
      });
    });
  }

  $('#ad-default').addEventListener('change', function () {
    var m = $('#ad-default-msg'), inp = $('#ad-default');
    inp.disabled = true;
    m.className = 'ad-msg'; m.textContent = '저장 중이에요.';
    admin({ action: 'set_default', quota: num(inp) }).then(function (r) {
      inp.value = r.default_quota;
      flash(m);
      return teachers();   /* 행이 아직 없는 강사의 한도도 기본값을 따른다 */
    }).catch(function (e) { m.className = 'ad-msg err'; m.textContent = e.message; })
      .then(function () { inp.disabled = false; });
  });

  /* 사이드바 — 선생님 화면과 같은 접기·서랍. 접힘은 이 브라우저만 기억한다 */
  (function () {
    var phone = window.matchMedia('(max-width: 760px)');
    var side = $('#side'), sT = $('#side-toggle'), sOpen = $('#side-open'), scrim = $('#side-scrim');
    var folded = CC.prefs.get('side', false), drawer = false;
    function paint() {
      var p = phone.matches;
      side.classList.toggle('folded', folded && !p);
      document.body.classList.toggle('side-open', p && drawer);
      scrim.hidden = !(p && drawer);
      sOpen.setAttribute('aria-expanded', p && drawer ? 'true' : 'false');
      sT.setAttribute('aria-expanded', p ? (drawer ? 'true' : 'false') : (folded ? 'false' : 'true'));
      sT.setAttribute('aria-label', p ? '메뉴 닫기' : folded ? '메뉴 펼치기' : '메뉴 접기');
      sT.firstChild.textContent = p ? '×' : folded ? '›' : '‹';
    }
    sT.addEventListener('click', function () {
      if (phone.matches) drawer = false; else { folded = !folded; CC.prefs.set('side', folded); }
      paint(); if (phone.matches) sOpen.focus();
    });
    sOpen.addEventListener('click', function () { drawer = true; paint(); sT.focus(); });
    scrim.addEventListener('click', function () { drawer = false; paint(); sOpen.focus(); });
    if (phone.addEventListener) phone.addEventListener('change', function () { drawer = false; paint(); });
    paint();
  })();

  function needLogin() {
    var n = $('#ad-note');
    n.textContent = '로그인이 필요해요. ';
    var a = el('a', null, '로그인'); a.href = 'auth.html';
    n.appendChild(a);
  }

  if (!CC.sb || !CC.sb.active()) { note('관리자 화면은 서버가 있어야 열려요.'); return; }
  CC.sb.getProfile().then(function (p) {
    if (!p) { needLogin(); return; }   /* 조용히 옮기지 않는다 — 왜 여기 왔는지 읽고 누르게 */
    $('#ad-logout').hidden = false;
    $('#ad-logout').addEventListener('click', function () { CC.sb.signOut().then(function () { window.location.href = 'auth.html'; }); });
    return Promise.all([teachers(), log()]).then(function () { note(''); $('#ad-main').hidden = false; });
  }).catch(stop);
})(window.CC = window.CC || {});
