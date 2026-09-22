/* Cut & Check — 미션 만들기 (한 학기의 졸업 시험)
 *
 * 학생이 미션을 만든다. 업무 요청을 모호하게 쓰고, 성공 조건 보기에 함정을 심고,
 * 자기 미션을 깨뜨릴 반례를 설계한다.
 *
 * 왜 이게 졸업 시험인가 —
 *   함정을 만들 줄 안다는 건 함정을 알아본다는 뜻이다.
 *   반례를 설계할 줄 알면 명세화 능력을 획득한 것이고, 그게 이 과목의 목표 전부다.
 *
 * 이 화면의 검사 규칙 —
 *   "잘 만들었다/못 만들었다" 를 말하지 않는다.
 *   학생이 만든 미션을 실제로 돌려보고 **무슨 일이 일어났는지 사실만** 보여준다.
 *   반례가 안 깨뜨리면 "아직 안 깨뜨려요" 라고만 하고, 어떻게 고칠지는 말하지 않는다.
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

  var S = {
    brief: '',
    sep: '',
    inputs: ['', '', ''],
    opts: [{ t: '', trap: false }, { t: '', trap: false }, { t: '', trap: false }]
  };

  /* 브리프에 방법이 적혔는지 — 막지 않고 알려만 준다.
   * 막으면 학생은 규칙을 우회하는 법만 배우고, 왜 안 되는지는 안 배운다. */
  var METHOD_WORDS = /(쉼표|띄어쓰기|빗금|자르|나누|split|쪼개|구분자|반복문|for|if)/;

  function checkBrief() {
    var v = $('#brief').value.trim();
    S.brief = v;
    var warn = $('#brief-warn');
    if (v && METHOD_WORDS.test(v)) {
      warn.textContent = '방법이 적혀 있는 것 같아요. 방법을 적으면 푸는 사람이 정할 게 없어져요. ' +
        '그래도 이대로 갈 수는 있어요.';
      warn.className = 'hintline warn';
    } else {
      warn.textContent = v ? '' : '';
      warn.className = 'hintline';
    }
    $('#s1go').disabled = v.length < 8;
  }

  $('#brief').addEventListener('input', checkBrief);
  $('#s1go').addEventListener('click', function () {
    $('#s1').classList.add('done');
    $('#s2').classList.remove('locked');
    this.disabled = true;
    this.textContent = '적었어요';
    $('#s2').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ── 2단계: 자료 3장과 자를 기준 ─────────────────── */
  function checkData() {
    S.sep = $('#sep').value;
    ['#in1', '#in2', '#in3'].forEach(function (sel, i) {
      S.inputs[i] = $(sel).value.trim();
    });
    $('#s2go').disabled = !(S.sep && S.inputs.every(function (v) { return v.length > 0; }));
  }
  ['#sep', '#in1', '#in2', '#in3'].forEach(function (sel) {
    $(sel).addEventListener('input', checkData);
  });

  $('#s2go').addEventListener('click', function () {
    $('#s2').classList.add('done');
    $('#s3').classList.remove('locked');
    this.disabled = true;
    this.textContent = '만들었어요';
    $('#s3').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ── 3단계: 성공 조건 보기 ───────────────────────── */
  function renderOpts() {
    var box = $('#opts');
    box.innerHTML = '';
    S.opts.forEach(function (o, i) {
      var row = el('div', 'optrow');
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = i === 0 ? '예: 자료가 몇 개든 하나씩 셀 수 있으면 성공이다' : '성공 조건 ' + (i + 1);
      inp.value = o.t;
      inp.addEventListener('input', function () { o.t = inp.value.trim(); checkOpts(); });
      row.appendChild(inp);

      var tg = el('button', 'trap');
      tg.type = 'button';
      tg.setAttribute('aria-pressed', o.trap ? 'true' : 'false');
      tg.textContent = '함정';
      tg.title = '이번 자료에만 맞는 문장이면 함정이에요';
      tg.addEventListener('click', function () {
        o.trap = !o.trap;
        tg.setAttribute('aria-pressed', o.trap ? 'true' : 'false');
        checkOpts();
      });
      row.appendChild(tg);
      box.appendChild(row);
    });
  }

  function checkOpts() {
    var filled = S.opts.filter(function (o) { return o.t.length > 0; });
    var traps = filled.filter(function (o) { return o.trap; });
    var safe = filled.filter(function (o) { return !o.trap; });
    var msg = $('#opts-msg');
    if (filled.length < 3) {
      msg.textContent = '세 개를 다 채워주세요.';
    } else if (!traps.length) {
      msg.textContent = '함정이 하나도 없어요. 이번 자료에만 맞는 문장을 하나 넣어야 고르는 사람이 고민하게 돼요.';
    } else if (!safe.length) {
      msg.textContent = '전부 함정이에요. 제대로 된 조건도 하나는 있어야 해요.';
    } else {
      msg.textContent = '';
    }
    $('#s3go').disabled = !(filled.length === 3 && traps.length >= 1 && safe.length >= 1);
  }

  $('#s3go').addEventListener('click', function () {
    $('#s3').classList.add('done');
    $('#s4').classList.remove('locked');
    this.disabled = true;
    this.textContent = '만들었어요';
    $('#s4').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ── 4단계: 내가 만든 미션을 돌려본다 ─────────────
   * 판정하지 않는다. 학생이 정한 기준으로 세 장을 실제로 돌려서
   * 무슨 일이 일어났는지 사실만 보여준다. */
  var SOLUTION = ['input', 'cut', 'trim', 'save'];

  $('#s4go').addEventListener('click', function () {
    var box = $('#check');
    box.innerHTML = '';
    var results = S.inputs.map(function (v) {
      return CC.engine.run(SOLUTION, { sep: S.sep, targets: [] }, v);
    });

    results.forEach(function (r, i) {
      var c = el('div', 'rescard' + (i === 2 ? ' counter' : ''));
      c.appendChild(el('div', 'nm', i === 2 ? '3번 · 내가 만든 반례' : (i + 1) + '번 자료'));
      c.appendChild(el('div', 'src', S.inputs[i]));
      c.appendChild(el('div', 'arrow', '↓ 내가 정한 기준 "' + (S.sep === ' ' ? '띄어쓰기' : S.sep) + '" 으로 자르면'));
      var items = el('div', 'items');
      if (r.err) {
        items.appendChild(el('span', 'item one', '멈췄어요'));
      } else {
        r.value.forEach(function (v) {
          items.appendChild(el('span', 'item' + (r.value.length < 2 ? ' one' : ''), v));
        });
        items.appendChild(el('span', 'count' + (r.value.length < 2 ? ' warn' : ''), '조각 ' + r.value.length + '개'));
      }
      c.appendChild(items);
      box.appendChild(c);
    });

    /* 사실 진술만. 어떻게 고칠지는 말하지 않는다. */
    var ok12 = results.slice(0, 2).every(function (r) { return !r.err && r.value.length >= 2; });
    var counterWorks = results[2].err || results[2].value.length < 2;

    var v = el('div', 'verdict ' + (ok12 && counterWorks ? 'ok' : 'bad'));
    v.appendChild(el('span', 'ic', ok12 && counterWorks ? '✓' : '!'));
    var vt = el('span');
    if (ok12 && counterWorks) {
      vt.appendChild(el('b', null, '앞의 두 장은 잘 나뉘고, 세 번째는 안 나뉘었어요.'));
      vt.appendChild(el('span', 'quiet',
        '반례가 작동합니다. 이 미션을 푸는 친구는 세 번째에서 자기 기준이 깨지는 걸 보게 돼요.'));
      $('#s5').classList.remove('locked');
    } else if (!ok12) {
      vt.appendChild(el('b', null, '앞의 두 장 중에 안 나뉜 게 있어요.'));
      vt.appendChild(el('span', 'quiet',
        '푸는 사람이 처음부터 막히면 반례까지 못 갑니다. 자료나 기준을 다시 보세요.'));
    } else {
      vt.appendChild(el('b', null, '세 번째 자료도 잘 나뉘었어요.'));
      vt.appendChild(el('span', 'quiet',
        '지금은 반례가 아니라 그냥 세 번째 자료예요. 어떻게 바꿀지는 알려주지 않을게요.'));
    }
    v.appendChild(vt);
    box.appendChild(v);

    var again = el('button', 'btn ghost', '자료를 다시 만들래요');
    again.type = 'button';
    again.addEventListener('click', function () {
      $('#s2').classList.remove('done');
      $('#s2go').disabled = false;
      $('#s2go').textContent = '이걸로 다시 할래요';
      $('#s5').classList.add('locked');
      $('#s2').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    var row = el('div', 'row');
    row.appendChild(again);
    box.appendChild(row);

    if (CC.store) CC.store.push({ type: 'make-check', ok: ok12 && counterWorks });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ── 5단계: 제출 ─────────────────────────────────── */
  $('#s5go').addEventListener('click', function () {
    var box = $('#out');
    box.innerHTML = '';
    var card = el('div', 'madecard');
    card.appendChild(el('span', 'k', '내가 만든 미션'));
    card.appendChild(el('p', 'brief', '“' + S.brief + '”'));

    var list = el('ul', 'madeopts');
    S.opts.forEach(function (o) {
      var li = el('li', o.trap ? 'trap' : '');
      li.appendChild(document.createTextNode(o.t));
      if (o.trap) li.appendChild(el('em', null, ' 함정'));
      list.appendChild(li);
    });
    card.appendChild(list);

    var ins = el('div', 'madeins');
    S.inputs.forEach(function (v, i) {
      var d = el('div', i === 2 ? 'counter' : '');
      d.textContent = (i + 1) + '. ' + v + (i === 2 ? '   ← 반례' : '');
      ins.appendChild(d);
    });
    card.appendChild(ins);

    card.appendChild(el('p', 'after',
      '다음 시간에 친구가 이 미션을 풉니다. 친구가 세 번째에서 걸리면, 그건 네가 만든 함정이에요.'));
    box.appendChild(card);

    if (CC.store) {
      CC.store.push({
        type: 'make-submit',
        brief: S.brief, sep: S.sep, inputs: S.inputs,
        traps: S.opts.filter(function (o) { return o.trap; }).length
      });
    }
    this.disabled = true;
    this.textContent = '냈어요';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#notes-toggle').addEventListener('click', function () {
    var on = document.body.classList.toggle('notes');
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  renderOpts();
  checkOpts();
})(window.CC = window.CC || {});
