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
  var NOT_ADMIN = '관리자만 볼 수 있어요.';
  var KIND = { step: '단계별', quick: '빠른' };

  function admin(body) { return CC.sb.api('/api/admin', body); }
  function note(t) { $('#ad-note').textContent = t; }
  function stop(e) { $('#ad-main').hidden = true; note(e && e.status === 403 ? NOT_ADMIN : (e && e.message) || '잠시 뒤에 다시 해 주세요.'); }

  /* 빈칸은 0 이 아니라 null 로 — 서버가 400 으로 돌려보낸다(빈칸이 한도 0 이 되면 안 된다) */
  function num(input) { return input.value.trim() === '' ? null : Number(input.value); }

  function row(t) {
    var tr = el('tr');
    [t.name, t.email, t.used, t.left].forEach(function (v) { tr.appendChild(el('td', null, String(v == null ? '' : v))); });
    var q = el('input', 'ad-in'); q.type = 'number'; q.min = '0'; q.max = '1000'; q.step = '1'; q.value = t.quota;
    q.setAttribute('aria-label', t.name + ' 한도');
    var off = el('input'); off.type = 'checkbox'; off.checked = !!t.disabled;
    off.setAttribute('aria-label', t.name + ' 생성 끄기');
    var msg = el('td', 'ad-msg'); msg.setAttribute('role', 'status');
    function save(body) {
      msg.textContent = '저장 중이에요.';
      admin(body).then(function (n) { if (tr.parentNode) tr.parentNode.replaceChild(row(n), tr); })   /* 저장 사이 표를 다시 그렸으면 떨어진 행 */
        .catch(function (e) { q.value = t.quota; off.checked = !!t.disabled; msg.textContent = e.message; });
    }
    q.addEventListener('change', function () { save({ action: 'set_quota', id: t.id, quota: num(q) }); });
    off.addEventListener('change', function () { save({ action: 'set_disabled', id: t.id, disabled: off.checked }); });
    var a = el('td'), b = el('td');
    a.appendChild(q); b.appendChild(off);
    tr.appendChild(a); tr.appendChild(b); tr.appendChild(msg);
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
      var body = $('#ad-log tbody');
      body.textContent = '';
      (r.log || []).forEach(function (x) {
        var tr = el('tr');
        [when(x.at), x.teacher, x.lesson, label(x.concept), KIND[x.kind] || x.kind, x.retries].forEach(function (v) {
          tr.appendChild(el('td', null, String(v == null ? '' : v)));
        });
        body.appendChild(tr);
      });
    });
  }

  $('#ad-default').addEventListener('change', function () {
    var m = $('#ad-default-msg');
    m.textContent = '저장 중이에요.';
    admin({ action: 'set_default', quota: num($('#ad-default')) }).then(function (r) {
      m.textContent = '바꿨어요.';
      $('#ad-default').value = r.default_quota;
      return teachers();   /* 행이 아직 없는 강사의 한도도 기본값을 따른다 */
    }).catch(function (e) { m.textContent = e.message; });
  });

  if (!CC.sb || !CC.sb.active()) { note('관리자 화면은 서버가 있어야 열려요.'); return; }
  CC.sb.getProfile().then(function (p) {
    if (!p) { window.location.href = 'auth.html'; return; }
    return Promise.all([teachers(), log()]).then(function () { note(''); $('#ad-main').hidden = false; });
  }).catch(stop);
})(window.CC = window.CC || {});
