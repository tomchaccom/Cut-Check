/* Cut & Check — 미션 04 · 추상화
 *
 * 추상화를 "변수와 함수를 배우는 시간"으로 가르치지 않는다.
 * 추상화는 **두 일에서 같은 구조를 알아보는 것**이고, 변수와 함수는 그걸 적는 도구일 뿐이다.
 *
 * 이 화면의 핵심 장치:
 *   학생이 "달라진다"고 고른 것만 변수가 된다.
 *   덜 고르면 그 값은 첫 번째 업무의 값으로 굳어버리고, 두 번째 업무에서 깨진다.
 *   무엇을 빠뜨렸는지는 알려주지 않는다 — 결과가 증거다.
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


  /* 단계가 열리면 스크롤만 하지 말고 초점도 옮긴다.
   * 키보드나 스크린리더 사용자는 스크롤만으론 '뭐가 열렸는지'를 알 수 없다. */
  function focusStep(sel) {
    var n = document.querySelector(sel);
    if (n && !n.classList.contains('locked')) {
      try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); }
    }
  }

  /* 같은 구조를 가진 두 업무. 미션 02 와 03 에서 학생이 이미 한 일이다. */
  var JOBS = [
    {
      key: 'a',
      name: '알레르기 검수',
      team: '고객 안전팀',
      text: '사과, 우유, 빵',
      sep: ',',
      sepName: '쉼표',
      targets: ['우유', '땅콩', '새우'],
      targetLabel: '알레르기 주의 재료'
    },
    {
      key: 'b',
      name: '실험 안전 검수',
      team: '과학실 안전 담당',
      text: '물 붓기 → 알코올램프 켜기 → 온도 재기',
      sep: '→',
      sepName: '화살표',
      targets: ['알코올램프 켜기', '산 다루기', '칼로 자르기'],
      targetLabel: '선생님 확인이 필요한 단계'
    }
  ];

  /* 달라질 후보. varies 는 채점에 쓰지 않고, 결과가 어떻게 나오는지 계산할 때만 쓴다. */
  var SLOTS = [
    { id: 'text', label: '들어오는 자료', varies: true, fixed: true,
      a: '사과, 우유, 빵', b: '물 붓기 → 알코올램프 켜기 → 온도 재기', hint: '당연히 달라져요' },
    { id: 'sep', label: '자를 기준', varies: true, a: '쉼표 ,', b: '화살표 →' },
    { id: 'targets', label: '찾을 목록', varies: true,
      a: '우유 · 땅콩 · 새우', b: '알코올램프 켜기 · 산 다루기 · 칼로 자르기' },
    { id: 'loop', label: '하나씩 꺼내는 동작', varies: false, a: '하나씩 꺼내기', b: '하나씩 꺼내기' },
    { id: 'check', label: '목록에 있는지 보는 동작', varies: false, a: '조건 확인', b: '조건 확인' },
    { id: 'collect', label: '걸린 것만 모으는 동작', varies: false, a: '걸린 것만 모으기', b: '걸린 것만 모으기' }
  ];

  var S = {
    same: '',                       // 1단계: 두 일이 같은 일인가
    picked: { text: true },         // 2단계: 달라진다고 고른 슬롯
    names: {},                      // 3단계: 학생이 붙인 변수 이름
    fnName: '',
    ran: false
  };

  /* ── 1단계 ───────────────────────────────────────── */
  function renderJobs() {
    var box = $('#jobs');
    box.innerHTML = '';
    JOBS.forEach(function (j) {
      var c = el('div', 'jobcard');
      c.appendChild(el('span', 'team', j.team));
      c.appendChild(el('h3', null, j.name));
      var d = el('dl', 'jobfacts');
      [['받는 자료', j.text], ['자를 기준', j.sepName + ' ' + j.sep], [j.targetLabel, j.targets.join(' · ')]]
        .forEach(function (row) {
          d.appendChild(el('dt', null, row[0]));
          d.appendChild(el('dd', null, row[1]));
        });
      c.appendChild(d);
      box.appendChild(c);
    });
  }

  /* 정답 표시를 두지 않는다. 1단계는 어떤 답이든 통과시키므로 ok 필드가 필요 없고,
   * 남겨두면 언젠가 채점으로 자란다. */
  var SAME_OPTS = ['완전히 다른 일이다', '값만 다르고, 하는 일은 똑같다', '잘 모르겠다'];

  function renderSame() {
    var box = $('#same-picks');
    box.innerHTML = '';
    SAME_OPTS.forEach(function (v) {
      var b = el('button', 'pick');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', 'dot'));
      b.appendChild(el('span', null, v));
      b.addEventListener('click', function () {
        box.querySelectorAll('[aria-pressed]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        S.same = v;
        $('#s1go').disabled = false;
      });
      box.appendChild(b);
    });
  }

  $('#s1go').addEventListener('click', function () {
    /* 어떤 답을 골랐든 통과시킨다. 여기서 막으면 정답 있는 문항이 되고,
     * 학생은 이 화면 전체를 '맞히는 문제'로 다시 분류한다. */
    $('#s1').classList.add('done');
    $('#s2').classList.remove('locked');
    this.disabled = true;
    this.textContent = '정했어요';
    if (CC.store) CC.store.push({ type: 'abstract-same', text: S.same });
    $('#s2').scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusStep('#s2');
  });

  /* ── 2단계: 무엇이 달라지나 ───────────────────────── */
  function renderSlots() {
    var box = $('#slots');
    box.innerHTML = '';
    SLOTS.forEach(function (s) {
      var row = el('button', 'slot' + (s.fixed ? ' fixed' : ''));
      row.type = 'button';
      row.setAttribute('aria-pressed', s.fixed ? 'true' : 'false');
      if (s.fixed) row.disabled = true;

      var box2 = el('span', 'mark');
      row.appendChild(box2);

      var mid = el('span', 'mid');
      var lab = el('span', 'lab', s.label);
      if (s.hint) lab.appendChild(el('em', null, ' · ' + s.hint));
      mid.appendChild(lab);
      var cmp = el('span', 'cmp');
      cmp.appendChild(el('span', 'ja', s.a));
      cmp.appendChild(el('span', 'vs', '／'));
      cmp.appendChild(el('span', 'jb', s.b));
      mid.appendChild(cmp);
      row.appendChild(mid);

      row.addEventListener('click', function () {
        var on = row.getAttribute('aria-pressed') === 'true';
        row.setAttribute('aria-pressed', on ? 'false' : 'true');
        if (on) delete S.picked[s.id]; else S.picked[s.id] = true;
        $('#s2go').disabled = Object.keys(S.picked).length < 2;
      });
      box.appendChild(row);
    });
  }

  $('#s2go').addEventListener('click', function () {
    $('#s2').classList.add('done');
    $('#s3').classList.remove('locked');
    this.disabled = true;
    this.textContent = '정했어요';
    renderNames();
    if (CC.store) CC.store.push({ type: 'abstract-slots', picked: Object.keys(S.picked) });
    $('#s3').scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusStep('#s3');
  });

  /* ── 3단계: 이름 붙이기 ──────────────────────────── */
  function renderNames() {
    var box = $('#names');
    box.innerHTML = '';
    SLOTS.filter(function (s) { return S.picked[s.id]; }).forEach(function (s) {
      var row = el('div', 'namerow');
      row.appendChild(el('span', 'lab', s.label));
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = '이 값의 이름';
      inp.value = S.names[s.id] || '';
      inp.addEventListener('input', function () {
        S.names[s.id] = inp.value.trim();
        checkNames();
      });
      row.appendChild(inp);
      box.appendChild(row);
    });
    checkNames();
  }

  function checkNames() {
    var need = SLOTS.filter(function (s) { return S.picked[s.id]; });
    var done = need.every(function (s) { return (S.names[s.id] || '').length > 0; });
    $('#s3go').disabled = !(done && S.fnName.length > 0);
  }

  $('#fn-name').addEventListener('input', function () {
    S.fnName = this.value.trim();
    checkNames();
  });

  $('#s3go').addEventListener('click', function () {
    $('#s3').classList.add('done');
    $('#s4').classList.remove('locked');
    this.disabled = true;
    this.textContent = '정했어요';
    if (CC.store) CC.store.push({ type: 'abstract-name', fn: S.fnName, names: S.names });
    $('#s4').scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusStep('#s4');
  });

  /* ── 4단계: 같은 함수로 두 번 ─────────────────────── */
  /* 학생이 빼내지 않은 값은 첫 번째 업무의 값으로 굳는다.
   * 그래서 두 번째 업무에서 결과가 무너진다. 그게 증거다. */
  function runJob(job) {
    var sep = S.picked.sep ? job.sep : JOBS[0].sep;
    var targets = S.picked.targets ? job.targets : JOBS[0].targets;
    var items = String(job.text).split(sep).map(function (x) { return x.trim(); });
    return {
      items: items,
      found: items.filter(function (x) { return targets.indexOf(x) !== -1; }),
      expected: job.text.split(job.sep).map(function (x) { return x.trim(); })
        .filter(function (x) { return job.targets.indexOf(x) !== -1; })
    };
  }

  function pyName(s, fallback) {
    var t = (s || '').trim().replace(/\s+/g, '_');
    return t || fallback;
  }

  function buildPython() {
    var fn = pyName(S.fnName, 'do_job');
    var textVar = pyName(S.names.text, 'text');
    var args = [textVar];
    if (S.picked.sep) args.push(pyName(S.names.sep, 'sep'));
    if (S.picked.targets) args.push(pyName(S.names.targets, 'check_list'));

    var sepExpr = S.picked.sep ? args[args.indexOf(pyName(S.names.sep, 'sep'))] : '"' + JOBS[0].sep + '"';
    var listExpr = S.picked.targets
      ? pyName(S.names.targets, 'check_list')
      : '["' + JOBS[0].targets.join('", "') + '"]';

    var lines = [
      'def ' + fn + '(' + args.join(', ') + '):',
      '    items = [x.strip() for x in ' + textVar + '.split(' + sepExpr + ')]',
      '    found = []',
      '    for one in items:',
      '        if one in ' + listExpr + ':',
      '            found.append(one)',
      '    return found',
      ''
    ];
    JOBS.forEach(function (j) {
      var call = ['"' + j.text + '"'];
      if (S.picked.sep) call.push('"' + j.sep + '"');
      if (S.picked.targets) call.push('["' + j.targets.join('", "') + '"]');
      lines.push('print(' + fn + '(' + call.join(', ') + '))   # ' + j.name);
    });
    return lines;
  }

  $('#s4go').addEventListener('click', function () {
    var box = $('#results');
    box.innerHTML = '';
    var allOk = true;

    JOBS.forEach(function (j) {
      var r = runJob(j);
      var same = r.found.length === r.expected.length &&
        r.expected.every(function (x) { return r.found.indexOf(x) !== -1; });
      if (!same) allOk = false;

      var c = el('div', 'rescard' + (same ? '' : ' counter'));
      c.appendChild(el('div', 'nm', j.name));
      c.appendChild(el('div', 'src', j.text));
      c.appendChild(el('div', 'arrow', '↓ 내가 만든 함수를 지나면'));
      var items = el('div', 'items');
      if (!r.found.length) items.appendChild(el('span', 'item none', '빈 목록'));
      else r.found.forEach(function (v) { items.appendChild(el('span', 'item' + (same ? '' : ' one'), v)); });
      items.appendChild(el('span', 'count' + (same ? '' : ' warn'), r.found.length + '개 찾음'));
      c.appendChild(items);
      box.appendChild(c);
    });

    var verdict = el('div', allOk ? 'verdict ok' : 'verdict bad');
    verdict.appendChild(el('span', 'ic', allOk ? '✓' : '!'));
    var vt = el('span');
    if (allOk) {
      vt.appendChild(el('b', null, '함수 하나가 두 업무를 다 해냈어요.'));
      vt.appendChild(el('span', 'quiet',
        '두 일에서 같은 구조를 알아보고, 달라지는 값만 밖으로 뺀 겁니다. 이게 추상화예요.'));
    } else {
      vt.appendChild(el('b', null, '한 업무에서 결과가 무너졌어요.'));
      /* 왜 무너졌는지를 말해주지 않는다 — 아래 코드에 따옴표로 박혀 있는 걸 학생이 찾는다. */
      vt.appendChild(el('span', 'quiet',
        '두 번째 업무의 결과가 달라졌어요. 아래 코드에서 따옴표로 박혀 있는 값을 찾아보세요.'));
    }
    verdict.appendChild(vt);
    box.appendChild(verdict);

    var code = el('div', 'xray');
    code.appendChild(el('span', 'lab', '내가 만든 함수'));
    var pre = el('pre');
    buildPython().forEach(function (line) {
      var d = el('div', 'xline');
      d.appendChild(el('span', null, line || ' '));
      pre.appendChild(d);
    });
    code.appendChild(pre);
    box.appendChild(code);

    var again = el('button', 'btn ghost', '다시 골라볼래요');
    again.type = 'button';
    again.addEventListener('click', function () { location.reload(); });
    var row = el('div', 'row');
    row.appendChild(again);
    box.appendChild(row);

    S.ran = true;
    if (CC.store) CC.store.push({ type: 'abstract-run', allOk: allOk, fn: S.fnName });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ── 설계 의도 ───────────────────────────────────── */
  $('#notes-toggle').addEventListener('click', function () {
    var on = document.body.classList.toggle('notes');
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  renderJobs();
  renderSame();
  renderSlots();
})(window.CC = window.CC || {});
