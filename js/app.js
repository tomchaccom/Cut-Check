/* Cut & Check — 화면 조립
 *
 * 이 파일이 지키는 것:
 *   - 학생이 정한 문장(성공 조건·자를 기준)은 절대 지우지 않고 결과 옆에 다시 띄운다.
 *   - 통과 판정은 "결과 조건"으로만 한다. 블록 순서를 정답과 대조하지 않는다.
 *   - 힌트·코드 보기는 실행 뒤에만 열린다.
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

  var M = null;            // 현재 미션
  var S = {};              // 현재 미션의 학생 상태
  var LOG = [];            // 교사 화면으로 갈 신호 (성공조건 선택, 도움 요청 등)

  function resetState() {
    S = {
      succ: '', succTrap: null,
      sep: '', sepName: '', why: '',
      blocks: [], bad: -1,
      ran: false, allpass: false
    };
  }

  /* ── 단일 선택 그룹 ────────────────────────────── */
  function pickGroup(container, items, onPick) {
    container.innerHTML = '';
    items.forEach(function (it) {
      var b = el('button', 'pick' + (it.own ? ' own' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', 'dot'));
      b.appendChild(el('span', null, it.label));
      b.addEventListener('click', function () {
        container.querySelectorAll('[aria-pressed]').forEach(function (x) {
          x.setAttribute('aria-pressed', 'false');
        });
        b.setAttribute('aria-pressed', 'true');
        onPick(it);
      });
      container.appendChild(b);
    });
  }

  function mark(k) {
    var li = document.querySelector('.crit li[data-c="' + k + '"]');
    if (li) li.classList.add('on');
  }
  function unmarkAll() {
    document.querySelectorAll('.crit li').forEach(function (li) { li.classList.remove('on'); });
  }

  /* ── 미션 로드 ─────────────────────────────────── */
  function loadMission(id) {
    M = CC.mission(id);
    resetState();

    // 미션 선택 바
    $('#missionbar').querySelectorAll('.mbtn').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.id === M.id ? 'true' : 'false');
    });

    // 히어로
    $('#hero-badge').textContent = '미션 ' + M.no + ' · ' + M.stage;
    $('#hero-title').textContent = M.title;
    $('#transfer').hidden = !M.transfer;
    if (M.transfer) $('#transfer-t').textContent = M.transferNote;

    // 1단계
    $('#brief-av').textContent = '▤';
    $('#brief-from').textContent = M.team + ' · 업무 요청';
    $('#brief-q').textContent = M.brief;
    $('#define-q').textContent = M.define.q;

    var opts = M.define.options.map(function (o) {
      return { label: o.v, value: o.v, trap: o.trap };
    });
    opts.push({ label: '내 말로 직접 쓸래요', value: '__own', own: true });
    pickGroup($('#succ-picks'), opts, function (it) {
      if (it.value === '__own') {
        $('#succ-own').hidden = false;
        $('#succ-own').focus();
        S.succ = $('#succ-own').value.trim();
        S.succTrap = 'own';
      } else {
        $('#succ-own').hidden = true;
        S.succ = it.value;
        S.succTrap = it.trap;
      }
      $('#s1go').disabled = !S.succ;
    });
    $('#succ-own').hidden = true;
    $('#succ-own').value = '';
    $('#s1go').disabled = true;
    $('#s1go').textContent = '이걸로 정할래요';

    // 2단계
    $('#sample-lab').textContent = M.cut.sampleLabel;
    $('#sample-txt').textContent = M.cut.sample;
    $('#cut-q').textContent = M.cut.q;
    $('#why-q').textContent = M.cut.whyQ;

    if (M.targets) {
      $('#targetbox').hidden = false;
      $('#target-lab').textContent = M.targets.label;
      var ti = $('#target-items');
      ti.innerHTML = '';
      M.targets.list.forEach(function (t) { ti.appendChild(el('span', null, t)); });
    } else {
      $('#targetbox').hidden = true;
    }

    var chips = $('#sep-chips'), sepFree = $('#sep-free');
    chips.innerHTML = '';
    if (M.cut.free) {
      chips.hidden = true;
      sepFree.hidden = false;
      sepFree.value = '';
      sepFree.placeholder = M.cut.freePlaceholder || '';
      sepFree.oninput = function () {
        S.sep = sepFree.value;
        S.sepName = sepFree.value === ' ' ? '띄어쓰기' : '"' + sepFree.value + '"';
        checkS2();
      };
    } else {
      chips.hidden = false;
      sepFree.hidden = true;
      M.cut.chips.forEach(function (c) {
        var b = el('button', 'chip');
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.appendChild(el('span', null, c.n));
        b.appendChild(el('small', null, c.g));
        b.addEventListener('click', function () {
          chips.querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          b.setAttribute('aria-pressed', 'true');
          S.sep = c.v; S.sepName = c.n;
          checkS2();
        });
        chips.appendChild(b);
      });
    }

    var whyFree = $('#why-free');
    if (M.cut.whyFree) {
      $('#why-picks').innerHTML = '';
      whyFree.hidden = false;
      whyFree.value = '';
      whyFree.oninput = function () { S.why = whyFree.value.trim(); checkS2(); };
    } else {
      whyFree.hidden = true;
      pickGroup($('#why-picks'), M.cut.whyOptions.map(function (w) {
        return { label: w, value: w };
      }), function (it) { S.why = it.value; checkS2(); });
    }
    $('#s2go').disabled = true;
    $('#s2go').textContent = '이 기준으로 할래요';

    // 3단계
    renderLib();
    renderStack();
    $('#resultbox').hidden = true;
    $('#resultbox').innerHTML = '';
    $('#xraybox').hidden = true;
    $('#xraybox').innerHTML = '';
    $('#xraybtn').disabled = true;
    $('#run').textContent = M.inputs.length + '장으로 돌려보기';

    // 우측
    $('#pin-succ').className = 'pin blank';
    $('#pin-succ').innerHTML = '<span class="t">성공이란</span>아직 안 정했어요';
    $('#pin-sep').className = 'pin blank';
    $('#pin-sep').innerHTML = '<span class="t">자를 기준</span>아직 안 정했어요';
    $('#crit-goal').textContent = M.goalLabel;
    unmarkAll();

    // 잠금
    $('#s1').classList.remove('done');
    $('#s2').classList.add('locked');
    $('#s2').classList.remove('done');
    $('#s3').classList.add('locked');
  }

  function checkS2() {
    $('#s2go').disabled = !(S.sep !== '' && S.why);
  }

  /* ── 단계 확정 ─────────────────────────────────── */
  $('#s1go').addEventListener('click', function () {
    if (!S.succ) return;
    $('#pin-succ').className = 'pin set';
    $('#pin-succ').innerHTML = '<span class="t">성공이란</span>' + esc(S.succ);
    $('#s1').classList.add('done');
    $('#s2').classList.remove('locked');
    mark('succ');
    this.disabled = true;
    this.textContent = '정했어요';
    LOG.push({ type: 'define', trap: S.succTrap, text: S.succ });
    $('#s2').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('#s2go').addEventListener('click', function () {
    $('#pin-sep').className = 'pin set';
    $('#pin-sep').innerHTML = '<span class="t">자를 기준</span>' + esc(S.sepName) + ' — ' + esc(S.why);
    $('#s2').classList.add('done');
    $('#s3').classList.remove('locked');
    mark('sep');
    this.disabled = true;
    this.textContent = '정했어요';
    $('#s3').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('#succ-own').addEventListener('input', function () {
    S.succ = this.value.trim();
    $('#s1go').disabled = S.succ.length < 4;
  });

  /* ── 블록 ──────────────────────────────────────── */
  function renderLib() {
    var g = $('#lib');
    g.innerHTML = '';
    M.library.forEach(function (id) {
      var b = CC.block(id);
      var btn = el('button', 'lb k-' + b.kind);
      btn.type = 'button';
      btn.appendChild(el('span', null, b.icon));
      btn.appendChild(el('span', null, b.label));
      btn.addEventListener('click', function () {
        S.blocks.push(id);
        S.bad = -1;
        renderStack();
      });
      g.appendChild(btn);
    });
  }

  function renderStack() {
    var st = $('#stack');
    st.innerHTML = '';
    if (!S.blocks.length) {
      st.innerHTML = '<div class="empty">아래 상자에서 블록을 눌러 순서를 만들어 보세요.<br>틀린 순서로 돌려봐도 괜찮아요.</div>';
      return;
    }
    S.blocks.forEach(function (id, i) {
      var b = CC.block(id);
      var arg = id === 'cut' ? 'split("' + S.sep + '")' : b.arg;
      var row = el('div', 'blk k-' + b.kind + (i === S.bad ? ' bad' : ''));
      row.appendChild(el('span', 'ic', b.icon));
      row.appendChild(el('span', 'nm', b.label));
      row.appendChild(el('span', 'arg', arg));
      var ctl = el('span', 'ctl');
      [['up', '↑', '위로'], ['down', '↓', '아래로'], ['del', '×', '빼기']].forEach(function (a) {
        var btn = el('button', null, a[1]);
        btn.type = 'button';
        btn.setAttribute('aria-label', a[2]);
        btn.addEventListener('click', function () {
          var t;
          if (a[0] === 'del') S.blocks.splice(i, 1);
          if (a[0] === 'up' && i > 0) { t = S.blocks[i - 1]; S.blocks[i - 1] = S.blocks[i]; S.blocks[i] = t; }
          if (a[0] === 'down' && i < S.blocks.length - 1) { t = S.blocks[i + 1]; S.blocks[i + 1] = S.blocks[i]; S.blocks[i] = t; }
          S.bad = -1;
          renderStack();
        });
        ctl.appendChild(btn);
      });
      row.appendChild(ctl);
      st.appendChild(row);
    });
  }

  /* ── 실행 ──────────────────────────────────────── */
  $('#run').addEventListener('click', function () {
    var cfg = {
      sep: S.sep,
      targets: M.targets ? M.targets.list : [],
      sample: M.cut.sample,
      textVar: M.vars.textVar,
      listVar: M.vars.listVar,
      targetVar: M.vars.targetVar
    };

    var rows = M.inputs.map(function (inp) {
      return { inp: inp, r: CC.engine.run(S.blocks, cfg, inp.v) };
    });

    var firstErr = null, passed = 0;
    rows.forEach(function (x) {
      if (x.r.err && !firstErr) firstErr = x.r;
      if (!x.r.err && M.goal(x.r, x.inp)) passed++;
    });
    var allpass = passed === rows.length;
    S.allpass = allpass;
    S.ran = true;

    var box = $('#resultbox');
    box.innerHTML = '';

    rows.forEach(function (x) {
      var c = el('div', 'rescard' + (x.inp.counter ? ' counter' : ''));
      c.appendChild(el('div', 'nm', x.inp.name));
      c.appendChild(el('div', 'src', x.inp.v));
      c.appendChild(el('div', 'arrow', '↓ 내가 만든 순서를 지나면'));
      var items = el('div', 'items');

      if (x.r.err) {
        items.appendChild(el('span', 'item one', '멈췄어요'));
      } else if (x.r.type === 'list') {
        if (!x.r.value.length) {
          items.appendChild(el('span', 'item none', '빈 목록'));
        } else {
          var lonely = x.r.value.length < 2 && !M.targets;
          x.r.value.forEach(function (v) {
            items.appendChild(el('span', 'item' + (lonely ? ' one' : ''), v));
          });
        }
        var cnt = el('span', 'count', '조각 ' + x.r.value.length + '개');
        if (x.r.value.length < 2 && !M.targets) cnt.className = 'count warn';
        items.appendChild(cnt);
      } else {
        items.appendChild(el('span', 'item one', String(x.r.value)));
        items.appendChild(el('span', 'count warn', '조각 1개'));
      }
      c.appendChild(items);
      box.appendChild(c);
    });

    if (firstErr) {
      S.bad = firstErr.at;
      var d = el('div', 'diag');
      d.appendChild(el('span', 'ic', '!'));
      var dt = el('span');
      dt.appendChild(el('b', null, firstErr.msg));
      dt.appendChild(el('span', 'quiet', '어디서 멈췄는지만 알려줄게요. 어떻게 고칠지는 네가 정하는 거예요.'));
      d.appendChild(dt);
      box.appendChild(d);
    } else {
      S.bad = -1;
    }

    // 자기 판정
    var j = el('div', 'judge');
    j.appendChild(el('span', 'lab', '아까 내가 정한 성공'));
    j.appendChild(el('p', 'mine', S.succ));
    j.appendChild(el('span', 'lab', M.inputs.length + '장 모두 이 조건을 지켰나요?'));
    var jr = el('div', 'row');
    var yes = el('button', 'btn ghost', '모두 지켰어요');
    var no = el('button', 'btn ghost', '깨진 게 있어요');
    yes.type = no.type = 'button';
    jr.appendChild(yes); jr.appendChild(no);
    j.appendChild(jr);
    var msg = el('p', 'msg');
    j.appendChild(msg);
    box.appendChild(j);

    yes.addEventListener('click', function () {
      if (allpass) {
        msg.textContent = M.inputs.length + '장을 모두 버텼어요. 다음엔 이 방법을 깨뜨릴 입력을 직접 만들어 보게 돼요.';
        mark('judge');
      } else {
        msg.textContent = M.counterHint;
      }
    });
    no.addEventListener('click', function () {
      msg.textContent = '좋아요. 몇 번째가, 왜 깨졌는지 선생님께 한 문장으로 말해보세요.';
      mark('judge');
    });

    box.hidden = false;
    renderStack();
    mark('run');
    if (allpass) mark('allpass');
    $('#xraybtn').disabled = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ── X-ray ─────────────────────────────────────── */
  $('#xraybtn').addEventListener('click', function () {
    var box = $('#xraybox');
    if (!box.hidden) { box.hidden = true; return; }
    var lines = CC.engine.toPython(S.blocks, {
      sep: S.sep, sample: M.cut.sample,
      textVar: M.vars.textVar, listVar: M.vars.listVar, targetVar: M.vars.targetVar,
      targetList: M.targets ? M.targets.list : null
    });
    box.innerHTML = '';
    var w = el('div', 'xray');
    w.appendChild(el('span', 'lab', '내가 만든 순서를 Python이 읽으면 이렇게 돼요'));
    var pre = el('pre');
    lines.forEach(function (l) {
      var line = el('div', 'xline' + (l.kind === 'setup' ? '' : ' k-' + l.kind));
      line.appendChild(el('span', 'no', l.i < 0 ? '·' : String(l.i + 1)));
      line.appendChild(el('span', null, l.code));
      pre.appendChild(line);
    });
    if (!lines.length) pre.appendChild(el('div', 'xline', '아직 블록이 없어요'));
    w.appendChild(pre);
    var n = el('div', 'note');
    n.style.display = 'flex';
    n.appendChild(el('b', null, '경계'));
    n.appendChild(el('span', null, '학생이 만든 그대로를 번역합니다. 순서가 틀리면 틀린 코드가 그대로 나와요. 고쳐서 보여주면 그건 거울이 아니라 정답표입니다.'));
    w.appendChild(n);
    box.appendChild(w);
    box.hidden = false;
  });

  /* ── 도움 요청 ─────────────────────────────────── */
  var H = { exp: '', act: '', blk: '' };
  var ASK = {
    '여러 조각으로 나뉜 목록': '여러 조각이 나오려면 자르는 일이 먼저 일어나야 해요. 지금 순서에서 자르는 블록은 몇 번째에 있나요?',
    '걸러진 것만 있는 목록': '걸러내려면 먼저 하나씩 꺼내서 봐야 해요. 지금 순서에 꺼내는 블록이 있나요?',
    '개수': '개수를 세려면 먼저 무엇이 있어야 할까요?',
    '모르겠어요': '괜찮아요. 그럼 거꾸로 — 아까 성공이 뭐라고 정했었죠?'
  };

  function optGroup(sel, cb) {
    var g = $(sel);
    g.querySelectorAll('[aria-pressed]').forEach(function (b) {
      b.addEventListener('click', function () {
        g.querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        cb(b.dataset.v);
      });
    });
  }
  optGroup('#o-exp', function (v) {
    H.exp = v;
    $('#askback-t').textContent = ASK[v] || '';
    $('#askback').hidden = false;
    $('#h-send').disabled = !(H.exp && H.act);
  });
  optGroup('#o-act', function (v) { H.act = v; $('#h-send').disabled = !(H.exp && H.act); });

  $('#helpbtn').addEventListener('click', function () {
    var g = $('#o-blk');
    g.innerHTML = '';
    H.blk = '';
    if (!S.blocks.length) {
      g.appendChild(el('span', null, '아직 블록을 놓지 않았어요')).style.cssText =
        'font-size:13.5px;color:var(--ink-3)';
    } else {
      S.blocks.forEach(function (id, i) {
        var b = CC.block(id);
        var o = el('button', 'opt', (i + 1) + ' · ' + b.label);
        o.type = 'button';
        o.setAttribute('aria-pressed', 'false');
        o.addEventListener('click', function () {
          g.querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          o.setAttribute('aria-pressed', 'true');
          H.blk = (i + 1) + ' · ' + b.label;
        });
        g.appendChild(o);
      });
    }
    $('#helpdlg').showModal();
  });

  $('#h-send').addEventListener('click', function () {
    var q = el('div', 'qi fresh');
    q.innerHTML = '<div class="who"><span>민서 (나)</span><em>방금</em></div>' +
      '<p class="say"><b>' + esc(H.exp) + '</b>이 나올 줄 알았는데 <b>' + esc(H.act) + '</b>이 나왔대요.' +
      (H.blk ? ' 의심 블록: <b>' + esc(H.blk) + '</b>' : '') + '</p>' +
      '<span class="tag t-need">바로 답해줄 수 있음</span>';
    $('#queue').prepend(q);
    LOG.push({ type: 'help', exp: H.exp, act: H.act, blk: H.blk });
  });

  /* ── 초기화 ────────────────────────────────────── */
  $('#notes-toggle').addEventListener('click', function () {
    var on = document.body.classList.toggle('notes');
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  $('#reset').addEventListener('click', function () { loadMission(M.id); });

  var bar = $('#missionbar');
  CC.MISSIONS.forEach(function (m) {
    var b = el('button', 'mbtn');
    b.type = 'button';
    b.dataset.id = m.id;
    b.setAttribute('aria-pressed', 'false');
    b.appendChild(el('span', 'n', '미션 ' + m.no));
    b.appendChild(el('span', 't', m.stage));
    b.addEventListener('click', function () { loadMission(m.id); });
    bar.appendChild(b);
  });

  loadMission(CC.MISSIONS[0].id);
  CC.log = LOG;
})(window.CC = window.CC || {});
