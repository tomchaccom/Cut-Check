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
  var rec = function (ev) { LOG.push(ev); if (CC.store) CC.store.push(ev); };

  function resetState() {
    S = {
      succ: '', succTrap: null,
      sep: '', sepName: '', why: '',
      blocks: [], bad: -1,
      ran: false, allpass: false,
      brk: { text: '', guess: '', tries: [] },
      revisions: []
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


  /* 단계가 열리면 스크롤만 하지 말고 초점도 옮긴다.
   * 키보드나 스크린리더 사용자는 스크롤만으론 '뭐가 열렸는지'를 알 수 없다. */
  function focusStep(sel) {
    var n = document.querySelector(sel);
    if (n && !n.classList.contains('locked')) {
      try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); }
    }
  }

  /* 앞뒤 공백을 눈에 보이게 그린다.
   * "우유" 와 " 우유" 가 화면에서 똑같이 보이면, 그 차이는 영원히 안 배운다. */
  function chip(v, cls) {
    var sp = el('span', 'item' + (cls ? ' ' + cls : ''));
    var t = String(v);
    var lead = t.match(/^\s+/), tail = t.match(/\s+$/);
    if (lead) sp.appendChild(el('i', 'ws', '␣'.repeat(lead[0].length)));
    sp.appendChild(document.createTextNode(t.trim() || '(빈 값)'));
    if (tail) sp.appendChild(el('i', 'ws', '␣'.repeat(tail[0].length)));
    return sp;
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
    renderSample();
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
        $('#sample-txt').querySelectorAll('.ch').forEach(function (x) {
          x.setAttribute('aria-pressed', x.dataset.ch === sepFree.value ? 'true' : 'false');
        });
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
    S.confirmedSep = '';
    S.confirmedSucc = '';
    renderRevisions();
    unmarkAll();

    // 4단계
    $('#brk-input').value = '';
    $('#brk-input').placeholder = M.cut.sample + ' 처럼 새로 써보세요';
    $('#brk-log').innerHTML = '';
    $('#brk-run').disabled = true;
    $('#brk-guess').querySelectorAll('[aria-pressed]').forEach(function (x) {
      x.setAttribute('aria-pressed', 'false');
    });

    // 5단계
    $('#wrap-input').value = '';
    $('#wrap-out').innerHTML = '';
    $('#wrap-go').disabled = true;
    W.kind = '';
    $('#wrap-picks').querySelectorAll('[aria-pressed]').forEach(function (x) {
      x.setAttribute('aria-pressed', 'false');
    });

    // 잠금
    $('#s5').classList.add('locked');
    $('#s4').classList.add('locked');
    $('#s4').classList.remove('done');
    $('#s1').classList.remove('done');
    $('#s2').classList.add('locked');
    $('#s2').classList.remove('done');
    $('#s3').classList.add('locked');
  }

  /* 이유가 약한지 — 교사 화면이 이 학생을 찾아낼 수 있게 표시한다.
   * 학생에게는 절대 보여주지 않는다. 보여주는 순간 정답 있는 문항이 된다. */
  function isWeakWhy(text) {
    return /그냥|모르|보여서/.test(text || '');
  }

  function checkS2() {
    $('#s2go').disabled = !(S.sep !== '' && S.why);
  }

  /* 기준을 직접 써야 하는 미션(support 3)에서, 샘플의 글자를 눌러도 고를 수 있게 한다.
   *
   * 왜 필요한가 — 실험 계획서의 구분자는 '→' 인데 한글 키보드로 이걸 치려면
   * 한자키를 눌러야 한다. 그건 판단이 아니라 타이핑 비용이고,
   * 우리 원칙상 타이핑 비용은 0으로 만들어야 하는 쪽이다.
   * 어디서 자를지 고르는 판단은 그대로 학생에게 남는다. */
  function renderSample() {
    var box = $('#sample-txt');
    box.innerHTML = '';
    if (!M.cut.free) {
      box.textContent = M.cut.sample;
      box.classList.remove('pickable');
      $('#samplehint').hidden = true;
      return;
    }
    box.classList.add('pickable');
    $('#samplehint').hidden = false;
    M.cut.sample.split('').forEach(function (ch) {
      var b = el('button', 'ch');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', ch === ' ' ? '띄어쓰기' : ch);
      b.textContent = ch === ' ' ? '␣' : ch;
      b.dataset.ch = ch;
      b.addEventListener('click', function () {
        box.querySelectorAll('.ch').forEach(function (x) {
          x.setAttribute('aria-pressed', x.dataset.ch === ch ? 'true' : 'false');
        });
        S.sep = ch;
        S.sepName = ch === ' ' ? '띄어쓰기' : '"' + ch + '"';
        $('#sep-free').value = ch;
        checkS2();
      });
      box.appendChild(b);
    });
  }

  /* ── 단계 확정 ─────────────────────────────────── */
  $('#s1go').addEventListener('click', function () {
    if (!S.succ) return;
    var prevSucc = S.confirmedSucc;
    $('#pin-succ').className = 'pin set';
    $('#pin-succ').innerHTML = '<span class="t">성공이란</span>' + esc(S.succ);
    $('#s1').classList.add('done');
    $('#s2').classList.remove('locked');
    mark('succ');
    this.disabled = true;
    this.textContent = '정했어요';

    if (prevSucc && prevSucc !== S.succ) {
      /* 성공 조건을 고친 것 — 기준을 고친 것보다 한 단계 더 깊은 수정이다.
       * 문제 자체를 다시 정의한 거니까. */
      S.revisions.push({ from: '성공 조건', to: '다시 정함' });
      rec({ type: 'redefine', from: prevSucc, to: S.succ, trap: S.succTrap });
      renderRevisions();
    } else {
      rec({ type: 'define', trap: S.succTrap, text: S.succ });
    }
    S.confirmedSucc = S.succ;

    $('#s2').scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusStep('#s2');
  });

  $('#s2go').addEventListener('click', function () {
    var prev = S.confirmedSep;
    $('#pin-sep').className = 'pin set';
    $('#pin-sep').innerHTML = '<span class="t">자를 기준</span>' + esc(S.sepName) + ' — ' + esc(S.why);
    $('#s2').classList.add('done');
    $('#s3').classList.remove('locked');
    mark('sep');
    this.disabled = true;
    this.textContent = '정했어요';

    if (prev && prev !== S.sepName) {
      /* 결과를 보고 기준을 고친 것 — 이 제품에서 가장 강한 학습 신호다.
       * 정답을 맞힌 것보다 이게 더 중요하다. */
      S.revisions.push({ from: prev, to: S.sepName, why: S.why });
      rec({ type: 'revise', from: prev, to: S.sepName, why: S.why });
      renderRevisions();
    } else {
      rec({ type: 'cut', sepName: S.sepName, why: S.why, weak: isWeakWhy(S.why) });
    }
    S.confirmedSep = S.sepName;

    /* 기준이 바뀌었으니 이전 결과는 무효다. 지우고 다시 돌리게 한다. */
    $('#resultbox').hidden = true;
    $('#resultbox').innerHTML = '';
    $('#xraybox').hidden = true;
    $('#xraybtn').disabled = true;
    renderStack();
    $('#s3').scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusStep('#s3');
  });

  /* ── 수정 루프 ─────────────────────────────────────
   * 학습 순환에 '수정하기'가 있는데 제품에 없으면 그 순환은 거짓말이다.
   * 깨진 걸 보고 기준을 고쳐서 다시 돌릴 수 있어야 한다. */
  /* 문제 정의도 고칠 수 있어야 한다.
   * 실무에서 요구사항을 다시 쓰는 순간이 제일 중요한데,
   * 그걸 못 하게 막아두면 '성공은 처음에 한 번 정하면 끝' 이라는 잘못된 규범이 남는다. */
  function reopenDefine() {
    $('#s1').classList.remove('done');
    $('#s1go').disabled = !S.succ;
    $('#s1go').textContent = '이걸로 다시 정할래요';
    $('#resultbox').hidden = true;
    $('#resultbox').innerHTML = '';
    $('#xraybox').hidden = true;
    $('#xraybtn').disabled = true;
    $('#s1').scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusStep('#s1');
  }

  function reopenCut() {
    $('#s2').classList.remove('done');
    $('#s2go').disabled = false;
    $('#s2go').textContent = '이 기준으로 다시 할래요';
    $('#sep-free').readOnly = false;
    $('#why-free').readOnly = false;
    $('#s2').scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusStep('#s2');
  }

  function renderRevisions() {
    var box = $('#revisions');
    if (!box) return;
    if (!S.revisions.length) {
      box.innerHTML = '<p class="pin blank"><span class="t">고친 기록</span>아직 없어요</p>';
      return;
    }
    box.innerHTML = '';
    S.revisions.forEach(function (r, i) {
      var d = el('div', 'pin set');
      d.appendChild(el('span', 't', (i + 1) + '번째 수정'));
      d.appendChild(document.createTextNode(r.from + ' → ' + r.to));
      box.appendChild(d);
    });
  }

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
      /* 자른 직후 — 걸러내기가 있는 미션에서는 이 줄이 없으면
       * 결과가 빈 목록일 때 학생이 볼 단서가 하나도 없다. */
      var cutStep = !x.r.err && x.r.trace
        ? x.r.trace.filter(function (t) { return t.id === 'cut' || t.id === 'trim'; }).pop()
        : null;
      var isNumber = !x.r.err && x.r.type === 'number';
      if (cutStep && (M.targets || isNumber)) {
        var mid = el('div', 'items mid');
        mid.appendChild(el('span', 'midlab', '자른 조각'));
        cutStep.value.forEach(function (v) { mid.appendChild(chip(v, 'plain')); });
        c.appendChild(mid);
        c.appendChild(el('div', 'arrow', isNumber ? '↓ 세면' : '↓ 걸러내면'));
      }

      var items = el('div', 'items');

      if (x.r.err) {
        items.appendChild(el('span', 'item one', '멈췄어요'));
      } else if (x.r.type === 'list') {
        if (!x.r.value.length) {
          items.appendChild(el('span', 'item none', '빈 목록'));
        } else {
          var lonely = x.r.value.length < 2 && !M.targets;
          x.r.value.forEach(function (v) { items.appendChild(chip(v, lonely ? 'one' : '')); });
        }
        var cnt = el('span', 'count', (M.targets ? '걸린 것 ' : '조각 ') + x.r.value.length + '개');
        if (x.r.value.length < 2 && !M.targets) cnt.className = 'count warn';
        items.appendChild(cnt);
      } else if (x.r.type === 'number') {
        items.appendChild(el('span', 'bignum', String(x.r.value)));
        items.appendChild(el('span', 'count', '명'));
      } else {
        items.appendChild(chip(String(x.r.value), 'one'));
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
      dt.appendChild(el('span', 'quiet', '어디서 멈췄는지만 알려줄게요. 어떻게 고칠지는 직접 정하는 거예요.'));
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
    var again = el('button', 'btn ghost', '기준을 다시 정할래요');
    yes.type = no.type = again.type = 'button';
    again.addEventListener('click', reopenCut);
    jr.appendChild(yes); jr.appendChild(no); jr.appendChild(again);
    j.appendChild(jr);
    var msg = el('p', 'msg');
    j.appendChild(msg);
    box.appendChild(j);

    yes.addEventListener('click', function () {
      if (allpass) {
        msg.textContent = M.inputs.length + '장을 모두 버텼어요. 이제 이 방법을 깨뜨릴 입력을 직접 만들어 볼 차례예요.';
        openGraduation(false);
      } else {
        /* 틀렸다고 말하지 않는다. 다시 볼 곳만 가리킨다. */
        msg.textContent = M.counterHint;
      }
    });
    no.addEventListener('click', function () {
      msg.textContent = '';
      no.disabled = true;
      askCause(j);
      openGraduation(true);
    });

    box.hidden = false;
    renderStack();
    mark('run');
    rec({ type: 'blocks', blocks: S.blocks.slice() });
    rec({ type: 'run', allpass: allpass, mission: M.id });
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

  /* '모르겠어요' 는 기대값이 아니라 기대를 못 했다는 뜻이다.
   * 그대로 문장 틀에 박으면 "모르겠어요가 나올 줄 알았는데" 가 된다. */
  function sayLine(exp, act) {
    if (exp === '모르겠어요') {
      return '뭐가 나올지는 아직 못 정했대요. 실제로는 <b>' + esc(act) + '</b>' +
        CC.particle(act, '이/가') + ' 나왔고요.';
    }
    return '<b>' + esc(exp) + '</b>' + CC.particle(exp, '이/가') + ' 나올 줄 알았는데 <b>' +
      esc(act) + '</b>' + CC.particle(act, '이/가') + ' 나왔대요.';
  }

  /* ── 도움 요청 ─────────────────────────────────── */
  var H = { exp: '', act: '', blk: '' };
  var ASK = CC.ASKS;

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
      '<p class="say">' + sayLine(H.exp, H.act) +
      (H.blk ? ' 의심 블록: <b>' + esc(H.blk) + '</b>' : '') + '</p>' +
      '<span class="tag t-need">' + (H.act ? '선생님이 바로 답해줄 수 있어요' : '실제로 뭐가 나왔는지 더 적어야 해요') + '</span>';
    var qbox = $('#queue');
    if (!qbox.dataset.used) { qbox.innerHTML = ''; qbox.dataset.used = '1'; }
    qbox.prepend(q);
    rec({ type: 'help', exp: H.exp, act: H.act, blk: H.blk });
  });

  /* ── 원인 구분 ──────────────────────────────────────
   * 깨졌다고 해서 늘 학생 논리가 틀린 게 아니다.
   * "사과 바나나 우유" 는 애초에 형식이 다른 주문서다.
   * 여기서 "네 기준이 틀렸다"는 인상만 주고 넘어가면 우리가 거짓말을 하는 거고,
   * 학생은 '어떤 입력이 와도 다 처리해야 한다'는 잘못된 규범을 배운다.
   *
   * 실무 개발자가 매일 하는 판단이 이거다 — 내 로직이 틀렸나, 입력이 이상한가.
   * 중1도 할 수 있는 판단이고, 여기서 하지 않으면 영영 안 한다. */
  var CAUSES = [
    { v: '내 기준이 이 주문서에는 안 맞았다', next: 'cut' },
    { v: '이 주문서가 형식이 다른 것 같다', next: 'handle' },
    /* 성공 조건 자체를 의심하는 선택지. 하드코딩 보기를 고른 학생이
     * 스스로 빠져나올 수 있는 유일한 문이다. 이게 없으면
     * 그 학생은 '내가 정한 성공은 맞는데 프로그램이 이상하다' 에 갇힌다. */
    { v: '내가 정한 성공이 이번 결과에만 맞는 것 같다', next: 'redefine' },
    { v: '둘 다인 것 같다', next: 'handle' }
  ];
  var HANDLES = [
    { v: '그냥 넘어간다 (결과가 이상해도 어쩔 수 없다)' },
    { v: '멈추고 “형식이 다른 주문서예요”라고 알려준다' },
    { v: '알아서 다른 기준으로 한 번 더 잘라본다' }
  ];

  function askCause(host) {
    var wrap = el('div', 'cause');
    wrap.appendChild(el('span', 'lab', '깨진 건 확인했어요. 그럼 무엇이 문제였을까요?'));
    var box = el('div', 'picks');
    wrap.appendChild(box);
    var follow = el('div');
    wrap.appendChild(follow);
    host.appendChild(wrap);

    CAUSES.forEach(function (c) {
      var b = el('button', 'pick');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', 'dot'));
      b.appendChild(el('span', null, c.v));
      b.addEventListener('click', function () {
        box.querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        rec({ type: 'cause', cause: c.v });
        follow.innerHTML = '';
        if (c.next === 'handle') {
          askHandle(follow);
        } else if (c.next === 'redefine') {
          follow.appendChild(el('p', 'msg',
            '성공을 정한 건 3분 전의 나예요. 그때 판단을 지금 바꿔도 됩니다.'));
          var rb = el('button', 'btn', '성공을 다시 정할래요');
          rb.type = 'button';
          rb.addEventListener('click', reopenDefine);
          var row = el('div', 'row');
          row.appendChild(rb);
          follow.appendChild(row);
        } else {
          follow.appendChild(el('p', 'msg',
            '그럼 기준을 다시 정해볼 수 있어요. 위의 “기준을 다시 정할래요”를 눌러보세요.'));
        }
      });
      box.appendChild(b);
    });
    wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function askHandle(host) {
    host.appendChild(el('span', 'lab', '그럼 형식이 다른 주문서가 왔을 때, 프로그램은 뭐라고 해야 할까요?'));
    var box = el('div', 'picks');
    host.appendChild(box);
    var out = el('p', 'msg');
    host.appendChild(out);

    HANDLES.forEach(function (h) {
      var b = el('button', 'pick');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', 'dot'));
      b.appendChild(el('span', null, h.v));
      b.addEventListener('click', function () {
        box.querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        rec({ type: 'handle', choice: h.v });
        /* 어느 것도 정답이라고 말하지 않는다. 셋 다 실무에서 실제로 쓰는 방식이다.
         * 대신 각 선택이 무엇을 포기하는지만 사실로 알려준다. */
        out.textContent = {
          0: '그러면 잘못된 결과가 조용히 흘러갑니다. 나중에 누가 그걸 발견하게 될까요?',
          1: '그러면 쓰는 사람이 뭘 고쳐야 할지 알게 됩니다. 대신 프로그램은 거기서 멈춥니다.',
          2: '그러면 대부분 자동으로 넘어갑니다. 대신 프로그램이 마음대로 판단한 걸 아무도 모릅니다.'
        }[HANDLES.indexOf(h)];
      });
      box.appendChild(b);
    });
  }

  /* ── 졸업 과제: 반례를 직접 만들기 ──────────────── */
  /* 자기 판정을 끝낸 학생만 연다.
   * 모두 버텼다고 판정했든 깨졌다고 인정했든 상관없다 —
   * 중요한 건 '내 기준으로 결과를 판정해본 적이 있는가'다. */
  function openGraduation(found) {
    rec({ type: 'judge', found: !!found });
    mark('judge');
    $('#s4').classList.remove('locked');
    $('#s5').classList.remove('locked');
    $('#s4').scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusStep('#s4');
  }

  function brkCheck() {
    $('#brk-run').disabled = !(S.brk.text.length > 0 && S.brk.guess);
  }
  $('#brk-input').addEventListener('input', function () {
    S.brk.text = this.value.trim();
    brkCheck();
  });
  $('#brk-guess').querySelectorAll('[aria-pressed]').forEach(function (b) {
    b.addEventListener('click', function () {
      $('#brk-guess').querySelectorAll('[aria-pressed]').forEach(function (x) {
        x.setAttribute('aria-pressed', 'false');
      });
      b.setAttribute('aria-pressed', 'true');
      S.brk.guess = b.dataset.v;
      brkCheck();
    });
  });

  $('#brk-run').addEventListener('click', function () {
    var cfg = {
      sep: S.sep,
      targets: M.targets ? M.targets.list : [],
      sample: M.cut.sample,
      textVar: M.vars.textVar, listVar: M.vars.listVar, targetVar: M.vars.targetVar
    };
    var input = { name: '내가 만든 주문서', v: S.brk.text };
    var r = CC.engine.run(S.blocks, cfg, input.v);
    var broke = r.err ? true : !M.goal(r, input);
    var guessed = S.brk.guess === (broke ? 'break' : 'hold');

    S.brk.tries.push({ text: S.brk.text, broke: broke, guessed: guessed });

    var card = el('div', 'rescard' + (broke ? ' counter' : ''));
    card.appendChild(el('div', 'nm', S.brk.tries.length + '번째 시도 · 내가 만든 입력'));
    card.appendChild(el('div', 'src', S.brk.text));
    card.appendChild(el('div', 'arrow', '↓ 내가 만든 순서를 지나면'));
    var items = el('div', 'items');
    if (r.err) {
      items.appendChild(el('span', 'item one', '멈췄어요'));
    } else if (r.type === 'list') {
      if (!r.value.length) items.appendChild(el('span', 'item none', '빈 목록'));
      else r.value.forEach(function (v) { items.appendChild(el('span', 'item' + (broke ? ' one' : ''), v)); });
      items.appendChild(el('span', 'count' + (broke ? ' warn' : ''), '조각 ' + r.value.length + '개'));
    } else {
      items.appendChild(el('span', 'item one', String(r.value)));
    }
    card.appendChild(items);

    /* 판정은 결과 사실만 말한다. 어떻게 더 잘 깨뜨릴지는 알려주지 않는다. */
    var verdict = el('p', 'failline');
    if (broke && guessed) {
      verdict.textContent = '예상대로 깨졌어요. 3장에서는 안 나왔던 결과가 나왔습니다.';
      verdict.style.color = 'var(--green)';
      mark('graduate');
    } else if (broke && !guessed) {
      verdict.textContent = '버틸 거라고 했는데 깨졌어요. 왜 버틸 거라고 생각했는지 다시 짚어보세요.';
      mark('graduate');
    } else if (!broke && guessed) {
      verdict.textContent = '예상대로 버텼어요. 아직 빈틈을 못 찾았다는 뜻이기도 해요.';
      verdict.style.color = 'var(--ink-2)';
    } else {
      verdict.textContent = '깨질 거라고 했는데 버텼어요. 방법이 튼튼한 걸까요, 이 입력이 약한 걸까요?';
      verdict.style.color = 'var(--ink-2)';
    }
    card.appendChild(verdict);
    $('#brk-log').prepend(card);

    rec({ type: 'break', text: S.brk.text, broke: broke, guessed: guessed });

    $('#brk-input').value = '';
    S.brk.text = '';
    S.brk.guess = '';
    $('#brk-guess').querySelectorAll('[aria-pressed]').forEach(function (x) {
      x.setAttribute('aria-pressed', 'false');
    });
    brkCheck();
  });

  /* ── 마무리 한 문장 ────────────────────────────────
   * 수업 지도안에 '절대 자르지 않는 것' 으로 적어둔 순서다.
   * 이게 없으면 '고쳐도 된다' 는 메시지가 교사의 말로만 남는다.
   * 정답 발표가 아니라, 깨졌다는 말을 소리 내어 해보는 자리다. */
  var W = { kind: '' };
  var WRAP = {
    broke: '오늘 내 방법이 깨진 곳은 “{}” 였어요.',
    changed: '오늘 나는 “{}” 를 바꿨어요.',
    learned: '오늘 새로 알게 된 건 “{}” 예요.'
  };

  $('#wrap-picks').querySelectorAll('[aria-pressed]').forEach(function (b) {
    b.addEventListener('click', function () {
      $('#wrap-picks').querySelectorAll('[aria-pressed]').forEach(function (x) {
        x.setAttribute('aria-pressed', 'false');
      });
      b.setAttribute('aria-pressed', 'true');
      W.kind = b.dataset.v;
      checkWrap();
    });
  });
  $('#wrap-input').addEventListener('input', checkWrap);
  function checkWrap() {
    $('#wrap-go').disabled = !(W.kind && $('#wrap-input').value.trim().length > 0);
  }

  $('#wrap-go').addEventListener('click', function () {
    var text = WRAP[W.kind].replace('{}', $('#wrap-input').value.trim());
    var card = el('div', 'wrapcard');
    card.appendChild(el('span', 'k', '오늘 내가 말할 문장'));
    card.appendChild(el('p', 'line', text));
    card.appendChild(el('p', 'after', '선생님 화면에도 올라갔어요. 수업 끝에 이 문장을 소리 내서 말해보세요.'));
    var box = $('#wrap-out');
    box.innerHTML = '';
    box.appendChild(card);
    rec({ type: 'wrap', kind: W.kind, text: text });
  });

  /* ── 초기화 ────────────────────────────────────── */
  $('#notes-toggle').addEventListener('click', function () {
    var on = document.body.classList.toggle('notes');
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  $('#reset').addEventListener('click', function () { loadMission(M.id); });

  /* 미션 바는 커리큘럼 순서로 그린다.
   * 같은 화면 안의 미션과 별도 화면 미션이 섞여 있어서, 배열 순서에 맡기면
   * 01·02·03·06·04·05 처럼 뒤엉킨다. 순서를 여기서 한 번만 정한다. */
  var bar = $('#missionbar');
  var ORDER = [
    { m: 'm1' }, { m: 'm2' }, { m: 'm3' },
    { href: 'abstract.html', n: '미션 04', t: '추상화' },
    { href: 'review.html', n: '미션 05', t: '동료 검토' },
    { m: 'm6' },
    { href: 'make.html', n: '졸업 시험', t: '미션 만들기 →' }
  ];

  ORDER.forEach(function (o) {
    if (o.m) {
      var mm = CC.mission(o.m);
      var b = el('button', 'mbtn');
      b.type = 'button';
      b.dataset.id = mm.id;
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', 'n', '미션 ' + mm.no));
      b.appendChild(el('span', 't', mm.stage));
      b.addEventListener('click', function () { loadMission(mm.id); });
      bar.appendChild(b);
    } else {
      var a = el('a', 'mbtn');
      a.href = o.href;
      a.style.textDecoration = 'none';
      a.appendChild(el('span', 'n', o.n));
      a.appendChild(el('span', 't', o.t));
      bar.appendChild(a);
    }
  });

  loadMission(CC.MISSIONS[0].id);
  CC.log = LOG;
})(window.CC = window.CC || {});
