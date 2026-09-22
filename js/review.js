/* Cut & Check — 미션 05 · 동료 검토
 *
 * 이 화면이 가르치는 것은 두 가지다.
 *   1. 남의 논리를 읽고 어디서 깨지는지 찾기 (내 논리를 보는 것보다 훨씬 쉽다)
 *   2. **답을 주지 않고 코멘트하는 법**
 *
 * 2번이 핵심이다. 우리가 학생에게 답을 안 주기로 했으면,
 * 학생끼리도 답을 주지 않아야 한다. 안 그러면 이 수업의 규칙은
 * "어른만 안 알려주고 친구는 알려주는" 이상한 규칙이 된다.
 *
 * 그래서 코멘트는 질문형만 쓸 수 있다. 직접 쓰는 칸도 물음표로 끝나야 제출된다.
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
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var INPUTS = [
    { name: '오늘 주문서', v: '사과, 바나나, 우유' },
    { name: '상품이 늘어난 주문서', v: '사과,바나나,우유,딸기' },
    { name: '띄어쓰기만 있는 주문서', v: '사과 바나나 우유', counter: true }
  ];

  /* 세 제출물은 서로 다른 종류로 잘못돼 있다.
   * 같은 종류로 세 개를 만들면 학생은 두 번째부터 읽지 않는다. */
  var PEERS = [
    {
      id: 'p1', name: '준서',
      succ: '상품이 몇 개가 들어오든 하나씩 따로 셀 수 있으면 성공이다',
      sepName: '쉼표', sep: ',', why: '상품과 상품 사이에 항상 이게 있어서',
      blocks: ['input', 'save'],
      kind: '빠진 블록'
    },
    {
      id: 'p2', name: '하은',
      succ: '화면에 사과, 바나나, 우유 라고 뜨면 성공이다',
      sepName: '쉼표', sep: ',', why: '이번 주문서에 이게 보여서',
      blocks: ['input', 'cut', 'trim', 'save'],
      kind: '성공 조건이 이번 결과에 묶임'
    },
    {
      id: 'p3', name: '태민',
      succ: '상품이 몇 개가 들어오든 하나씩 따로 셀 수 있으면 성공이다',
      sepName: '쉼표', sep: ',', why: '잘 모르겠고 그냥 골랐어요',
      blocks: ['cut', 'input', 'save'],
      kind: '순서 뒤바뀜'
    }
  ];

  var S = { peer: null, guess: '', where: '', ran: false, comment: null, sent: [] };

  /* ── 제출물 고르기 ───────────────────────────────── */
  function renderPeers() {
    var box = $('#peers');
    box.innerHTML = '';
    PEERS.forEach(function (p) {
      var b = el('button', 'peercard');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', 'av', p.name.charAt(0)));
      var mid = el('span', 'mid');
      mid.appendChild(el('b', null, p.name + ' 인턴의 제출물'));
      mid.appendChild(el('small', null, '블록 ' + p.blocks.length + '개 · 기준 ' + p.sepName));
      b.appendChild(mid);
      b.addEventListener('click', function () {
        box.querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        S.peer = p;
        renderSubmission();
        $('#s1go').disabled = false;
      });
      box.appendChild(b);
    });
  }

  function renderSubmission() {
    var p = S.peer;
    var box = $('#submission');
    box.hidden = false;
    box.innerHTML = '';

    var head = el('div', 'subhead');
    head.appendChild(el('h3', null, p.name + ' 인턴이 낸 것'));
    box.appendChild(head);

    var g = el('div', 'subgrid');
    var a = el('div', 'subbox');
    a.appendChild(el('span', 'k', '이 친구가 정한 성공'));
    a.appendChild(el('div', 'v', p.succ));
    g.appendChild(a);
    var c = el('div', 'subbox');
    c.appendChild(el('span', 'k', '자를 기준과 이유'));
    c.appendChild(el('div', 'v', p.sepName + ' — ' + p.why));
    g.appendChild(c);
    box.appendChild(g);

    var stack = el('div', 'stack');
    p.blocks.forEach(function (id, i) {
      var b = CC.block(id);
      var row = el('div', 'blk k-' + b.kind);
      row.appendChild(el('span', 'ic', b.icon));
      row.appendChild(el('span', 'nm', b.label));
      row.appendChild(el('span', 'arg', String(i + 1) + '번'));
      stack.appendChild(row);
    });
    box.appendChild(stack);
  }

  $('#s1go').addEventListener('click', function () {
    $('#s1').classList.add('done');
    $('#s2').classList.remove('locked');
    this.disabled = true;
    this.textContent = '골랐어요';
    renderWhere();
    $('#s2').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ── 예측 ───────────────────────────────────────── */
  $('#guess').querySelectorAll('[aria-pressed]').forEach(function (b) {
    b.addEventListener('click', function () {
      $('#guess').querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
      S.guess = b.dataset.v;
      checkS2();
    });
  });

  function renderWhere() {
    var box = $('#where');
    box.innerHTML = '';
    var opts = S.peer.blocks.map(function (id, i) {
      return (i + 1) + ' · ' + CC.block(id).label;
    });
    opts.push('블록이 아니라 성공 조건이 문제다');
    opts.push('아직 모르겠다');
    opts.forEach(function (v) {
      var b = el('button', 'opt', v);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        box.querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        S.where = v;
        checkS2();
      });
      box.appendChild(b);
    });
  }

  function checkS2() { $('#s2go').disabled = !(S.guess && S.where); }

  $('#s2go').addEventListener('click', function () {
    $('#s2').classList.add('done');
    $('#s3').classList.remove('locked');
    this.disabled = true;
    this.textContent = '적었어요';
    if (CC.store) CC.store.push({ type: 'review-guess', peer: S.peer.id, guess: S.guess, where: S.where });
    $('#s3').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ── 돌려보기 ───────────────────────────────────── */
  $('#runbtn').addEventListener('click', function () {
    var cfg = { sep: S.peer.sep, targets: [] };
    var box = $('#results');
    box.innerHTML = '';
    var broke = false;

    INPUTS.forEach(function (inp) {
      var r = CC.engine.run(S.peer.blocks, cfg, inp.v);
      var ok = !r.err && r.type === 'list' && r.value.length >= 2;
      if (!ok) broke = true;

      var c = el('div', 'rescard' + (inp.counter ? ' counter' : ''));
      c.appendChild(el('div', 'nm', inp.name));
      c.appendChild(el('div', 'src', inp.v));
      c.appendChild(el('div', 'arrow', '↓ ' + S.peer.name + ' 인턴의 순서를 지나면'));
      var items = el('div', 'items');
      if (r.err) {
        items.appendChild(el('span', 'item one', '멈췄어요'));
      } else if (r.type === 'list') {
        r.value.forEach(function (v) { items.appendChild(el('span', 'item' + (ok ? '' : ' one'), v)); });
        items.appendChild(el('span', 'count' + (ok ? '' : ' warn'), '조각 ' + r.value.length + '개'));
      } else {
        items.appendChild(el('span', 'item one', String(r.value)));
        items.appendChild(el('span', 'count warn', '조각 1개'));
      }
      c.appendChild(items);
      if (r.err) {
        var d = el('p', 'failline', r.msg);
        c.appendChild(d);
      }
      box.appendChild(c);
    });

    var mine = el('div', 'judge');
    mine.appendChild(el('span', 'lab', '내가 적어둔 예측'));
    mine.appendChild(el('p', 'mine',
      (S.guess === 'hold' ? '세 장을 다 버틸 것이다' : '어디선가 깨질 것이다') + ' · ' + S.where));
    mine.appendChild(el('span', 'lab', '맞았나요? 틀렸어도 괜찮아요 — 여기서 뭘 알게 됐는지가 중요해요.'));
    box.appendChild(mine);

    $('#s3').classList.add('done');
    $('#s4').classList.remove('locked');
    S.ran = true;
    this.disabled = true;
    this.textContent = '돌려봤어요';
    renderTemplates();
    if (CC.store) CC.store.push({ type: 'review-run', peer: S.peer.id, broke: broke });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ── 코멘트 ─────────────────────────────────────── */
  /* 질문형만 허용한다. 답을 주면 상대는 생각할 기회를 잃는다.
   * 금지 예시도 화면에 같이 두되 고를 수 없게 한다 —
   * 왜 안 되는지 보여주지 않으면 학생은 규칙을 이해하지 못하고 회피만 배운다. */
  /* 조사를 문장에 박아두면 '왜 쉼표으로' 같은 게 나온다.
   * 값에 따라 계산해야 한다 (CLAUDE.md 화면 문구 규칙). */
  var TEMPLATES = [
    { build: function (c) { return c.block + '에서 뭐가 나올 줄 알았어?'; } },
    { build: function (c) { return CC.josa(c.input, '을/를') + ' 넣으면 어떻게 될 것 같아?'; } },
    { build: function (c) { return '왜 ' + CC.josa(c.sep, '으로/로') + ' 자르기로 했어?'; } },
    { build: function () { return '성공이 뭐라고 정했었는지 다시 말해줄래?'; } }
  ];
  var BANNED = [
    '여기가 틀렸어. 자르기 블록을 넣어.',
    '순서를 바꿔야 돼. 데이터 받기가 먼저야.',
    '그냥 내 거 보고 똑같이 해.'
  ];

  function ctx() {
    return {
      block: S.where && /^\d/.test(S.where) ? S.where.split(' · ')[1] : '그 블록',
      input: '“사과 바나나 우유”',
      sep: S.peer.sepName
    };
  }

  function renderTemplates() {
    var box = $('#templates');
    box.innerHTML = '';
    var c = ctx();
    TEMPLATES.forEach(function (tp) {
      var b = el('button', 'tmpl', tp.build(c));
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        box.querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        S.comment = tp.build(c);
        $('#own-comment').value = '';
        checkComment();
      });
      box.appendChild(b);
    });

    var banned = $('#banned');
    banned.innerHTML = '';
    BANNED.forEach(function (t) {
      var d = el('div', 'tmpl bad');
      d.appendChild(el('span', 'x', '✕'));
      d.appendChild(el('span', null, t));
      banned.appendChild(d);
    });
  }

  $('#own-comment').addEventListener('input', function () {
    var v = this.value.trim();
    S.comment = v;
    $('#templates').querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
    checkComment();
  });

  function checkComment() {
    var v = (S.comment || '').trim();
    var isQuestion = /[?？]$/.test(v);
    var own = $('#own-comment').value.trim();
    var msg = $('#comment-msg');

    if (own && !isQuestion) {
      msg.textContent = '물음표로 끝나야 보낼 수 있어요. 답을 주면 친구가 생각할 기회를 잃거든요.';
      msg.className = 'hintline warn';
      $('#sendbtn').disabled = true;
      return;
    }
    /* 칭찬하지 않는다. 물음표로 끝났다는 사실만 말한다.
     * (감사에서 잡힘 — '좋아요' 는 우리가 llmguard 로 LLM 에게 금지한 단어다) */
    msg.textContent = own ? '물음표로 끝났어요. 보낼 수 있어요.' : '';
    msg.className = 'hintline';
    $('#sendbtn').disabled = !(v && isQuestion);
  }

  $('#sendbtn').addEventListener('click', function () {
    var box = $('#sent');
    var card = el('div', 'sentcard');
    card.appendChild(el('span', 'k', S.peer.name + ' 인턴에게 보낸 코멘트'));
    card.appendChild(el('p', 'msgline', S.comment));
    card.appendChild(el('p', 'after',
      '이 코멘트를 받으면 ' + S.peer.name + ' 인턴은 답을 듣는 게 아니라 ' +
      '자기 화면을 다시 보게 됩니다. 그게 우리가 노린 겁니다.'));
    box.prepend(card);
    S.sent.push(S.comment);
    if (CC.store) CC.store.push({ type: 'review-comment', peer: S.peer.id, text: S.comment });
    $('#own-comment').value = '';
    S.comment = null;
    $('#templates').querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
    checkComment();
  });

  $('#notes-toggle').addEventListener('click', function () {
    var on = document.body.classList.toggle('notes');
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  renderPeers();
})(window.CC = window.CC || {});
