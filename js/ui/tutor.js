/* Cut & Check — AI 튜터 대화창
 *
 * 설계도를 낸 뒤 코드 단계에서만 보인다. 미션·설계·마지막 실행·직전 3턴을 서버에 넘기고,
 * 서버가 답/되묻기/거절을 정한다 (api/tutor.py). 막힌 이유(reasons)는 화면에 띄우지 않고 기록만 한다.
 * 질문과 답은 그대로 기록되어 교사 화면에 올라간다 — 학생 자유 입력이므로.
 * 서버가 없으면 창은 열리고 "쓸 수 없어요"만 말한다. 수업 흐름은 막지 않는다.
 *
 * 대화는 미션마다 하나다. 따로 저장하지 않는다 — 이미 남는 s-tutor 이벤트(question, answer, mid)를
 * 다시 읽어 그린다. 기록이 두 군데 생기면 학생이 본 대화와 교사가 본 대화가 갈라진다.
 * 되묻기·답하지 않음도 학생에게는 그냥 튜터의 말이다 — 꼬리표는 교사 화면에만 붙는다.
 */
(function (CC) {
  'use strict';

  var UNAVAILABLE = '지금은 튜터를 쓸 수 없어요.';
  var opt = null;
  var mid = '';        /* 지금 열린 미션 */
  var history = [];    /* 이 미션의 {q, a}. 서버는 앞 3개만 받으므로 뒤 3개를 보낸다 */
  var busy = false;
  var view = 'chat';   /* chat | list | read */
  var on = false;      /* 4단계인가 */
  var narrow = window.matchMedia('(max-width: 1099px)');
  var phoneOpen = false;   /* 휴대폰에서 전체 화면으로 열려 있나 */

  function $(s) { return document.querySelector(s); }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function turns(evs, m) {
    return evs.filter(function (e) { return e.type === CC.events.T.S_TUTOR && e.mid === m; })
      .sort(function (a, b) { return (a.t || 0) - (b.t || 0); })
      .map(function (e) { return { q: e.question || '', a: e.answer || '' }; });
  }

  function bubble(who, text) {
    var row = el('div', 'tutor-row ' + who);
    row.appendChild(el('span', 'tutor-who' + (who === 'me' ? ' sr-only' : ''), who === 'me' ? '나' : '튜터'));
    var msg = el('div', 'tutor-msg ' + who);
    if (who === 'me') msg.textContent = text;
    else String(text).split(/`([^`\n]+)`/).forEach(function (part, i) {   /* 홀수 칸이 백틱 안 — textContent 로만 넣는다 */
      if (i % 2) msg.appendChild(el('code', 'tutor-code', part));
      else if (part) msg.appendChild(document.createTextNode(part));
    });
    row.appendChild(msg);
    var log = $('#tutor-log');
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return row;
  }

  function draw(list) {
    $('#tutor-log').innerHTML = '';
    list.forEach(function (x) { bubble('me', x.q); bubble('ai', x.a); });
  }

  function show(v) {
    view = v;
    $('#tutor-form').hidden = v !== 'chat';
    $('#tutor-back').hidden = v === 'chat';
    $('#tutor-past').hidden = v !== 'chat';
    $('#tutor-note').hidden = v !== 'chat';
    if (v === 'chat') {
      $('#tutor-title').textContent = '파이썬 문법 물어보기';
      draw(history);
      if (busy) typing();
      if (expanded()) $('#tutor-q').focus();
    }
  }

  function typing() { bubble('ai', '답을 쓰는 중이에요').classList.add('typing'); }

  /* 지난 대화 — 이 학생이 튜터와 이야기한 미션 목록. 고르면 읽기만 하는 대화가 열린다 */
  function openList() {
    show('list');
    $('#tutor-title').textContent = '지난 대화';
    var log = $('#tutor-log');
    log.innerHTML = '';
    opt.past(function (evs) {
      if (view !== 'list') return;
      var seen = {}, mids = [];   /* 최근에 이야기한 미션이 위로 */
      evs.slice().reverse().forEach(function (e) {
        if (e.type === CC.events.T.S_TUTOR && e.mid && !seen[e.mid]) { seen[e.mid] = 1; mids.push(e.mid); }
      });
      if (!mids.length) { log.appendChild(el('p', 'tutor-empty', '아직 나눈 대화가 없어요.')); return; }
      mids.forEach(function (m) {
        var found = CC.sentenceMission(m);
        var title = found ? found.title : '지난 미션';
        var b = el('button', 'tutor-past-item', title);
        b.type = 'button';
        b.addEventListener('click', function () {
          show('read');
          $('#tutor-title').textContent = title;
          draw(turns(evs, m));
          $('#tutor-back').focus();
        });
        log.appendChild(b);
      });
      log.querySelector('button').focus();
    });
  }

  function send(e) {
    e.preventDefault();
    var q = $('#tutor-q').value.trim();
    if (!q || !opt || busy) return;
    $('#tutor-q').value = '';
    busy = true;
    $('#tutor-send').disabled = true;
    bubble('me', q);
    typing();
    $('#tutor-live').textContent = '답을 쓰는 중이에요';
    var ctx = opt.context();
    var at = mid;
    var sent = history.slice(-3);
    CC.tutorApi({
      question: q, mission: ctx.mission, code: ctx.code, define: ctx.define, design: ctx.design,
      lastOutput: ctx.lastOutput, lastError: ctx.lastError, history: sent
    })
      .catch(function () { return { kind: 'unavailable', answer: UNAVAILABLE, refused: true }; })
      .then(function (r) {
        /* 기다리는 사이 미션을 바꿨어도 질문한 미션에 남긴다 */
        opt.rec(CC.events.T.S_TUTOR, {
          question: q, answer: r.answer, kind: r.kind, refused: !!r.refused, step: ctx.step, code: ctx.code,
          history_len: sent.length, reasons: r.reasons || [], retried: !!r.retried, judged: !!r.judged, mid: at
        });
        busy = false;
        $('#tutor-send').disabled = false;
        if (at !== mid) return;
        history.push({ q: q, a: r.answer });
        $('#tutor-live').textContent = r.answer;
        if (view === 'chat') { draw(history); if ($('#tutor').contains(document.activeElement)) $('#tutor-q').focus(); }
      });
  }

  /* 펼침: 넓은 화면은 접힘을 이 브라우저가 기억하고, 휴대폰은 열 때마다 닫힌 채로 시작한다 */
  function expanded() { return on && (narrow.matches ? phoneOpen : !CC.prefs.get('tutor', false)); }
  function setOpen(v) {
    if (narrow.matches) phoneOpen = v; else CC.prefs.set('tutor', !v);
    sync();
  }
  function sync() {
    var box = $('#tutor'), open = expanded(), full = narrow.matches && open;
    box.hidden = !open;
    /* 사용법 안내는 지금 보이는 쪽(펼친 사이드바 · 손잡이/막대)을 가리킨다 */
    box.removeAttribute('data-tour'); $('#tutor-open').removeAttribute('data-tour');
    (open ? box : $('#tutor-open')).setAttribute('data-tour', 'tutor');
    $('#tutor-open').hidden = !on || open;
    $('#tutor-open').textContent = narrow.matches ? '튜터에게 묻기' : '튜터';
    $('#tutor-close').setAttribute('aria-expanded', open ? 'true' : 'false');
    /* 전체 화면일 때는 뒤 화면을 막는다 — 모달처럼 */
    for (var n = box; n.parentNode && n !== document.body; n = n.parentNode) {
      [].forEach.call(n.parentNode.children, function (k) {
        if (k === n || k.tagName === 'SCRIPT') return;
        if (full) k.setAttribute('inert', ''); else k.removeAttribute('inert');
      });
    }
    document.body.classList.toggle('tutor-full', full);
  }

  CC.tutor = {
    /* o: { rec, context(), mine(cb) 이 미션의 내 이벤트, past(cb) 내 이벤트 전부 } */
    init: function (o) {
      opt = o;
      $('#tutor-open').addEventListener('click', function () { setOpen(true); show('chat'); });
      $('#tutor-close').addEventListener('click', function () { setOpen(false); $('#tutor-open').focus(); });
      $('#tutor').addEventListener('keydown', function (e) { if (e.key === 'Escape' && phoneOpen) $('#tutor-close').click(); });
      if (narrow.addEventListener) narrow.addEventListener('change', function () { phoneOpen = false; sync(); });
      sync();
      $('#tutor-past').addEventListener('click', openList);
      $('#tutor-back').addEventListener('click', function () { if (view === 'read') openList(); else show('chat'); });
      $('#tutor-form').addEventListener('submit', send);
      /* Enter 는 보내기, Shift+Enter 는 줄바꿈. 한글 조합 중 Enter 는 글자를 끝내는 것이라 보내지 않는다 */
      $('#tutor-q').addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        $('#tutor-form').requestSubmit();
      });
    },
    /* 미션을 열 때 — 그 미션의 지난 대화를 다시 그린다 */
    reset: function (m) {
      mid = m || '';
      history = [];
      busy = false;
      $('#tutor-send').disabled = false;
      if (view === 'chat') draw(history);
      if (!opt || !opt.mine) return;
      opt.mine(function (evs) {
        if (mid !== m) return;
        history = turns(evs, m);
        if (view === 'chat') draw(history);
      });
    },
    visible: function (v) {
      var was = on;
      on = v; if (!v) phoneOpen = false; sync();
      /* 4단계에 막 들어왔을 때 입력창이 접힌 아래에 있지 않게 — 필요한 만큼만 내린다 */
      if (v && !was && expanded() && !narrow.matches) setTimeout(function () { $('#tutor-send').scrollIntoView({ block: 'nearest' }); }, 0);
    }
  };
})(window.CC = window.CC || {});
