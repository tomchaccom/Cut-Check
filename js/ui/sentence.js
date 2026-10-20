/* Cut & Check — 문장형 미션 화면
 *
 * 이 파일이 지키는 것:
 *   - 시스템이 성공 여부를 채점하거나 학생의 기준에 맞춰 방법을 자동 보정하지 않는다.
 *   - 실행 오류나 필수 입력 누락은 구체적으로 안내한다.
 *   - 실행 전 예상과 당시 기준·방법은 실행 이후 수정으로 바뀌지 않는다.
 *   - 방법을 바꾼 뒤 이전 출력에 새 판정을 붙이거나 재실행 없이 마무리하지 못한다.
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

  var M = null;   // 현재 미션
  var state = {};
  var lastRun = { output: '', error: '' };   /* 튜터에게 넘기는 마지막 코드 실행 결과 */

  var rec = function (type, payload, dbId) {
    /* 어느 미션의 기록인지 담는다 — 로컬 저장소는 브라우저 하나에 모든 미션·계정이 섞인다 */
    payload = payload || {};
    if (M && payload.mid == null) payload.mid = M.id;
    var ev = CC.events.make(type, payload);
    if (CC.store) CC.store.push(ev);
    /* Supabase에도 저장 */
    if (CC.sb && CC.sb.active() && currentClassroomId) {
      CC.sb.pushEvent(currentClassroomId, dbId === undefined ? currentMissionDbId : dbId, ev);
    }
    return ev;
  };

  if (CC.tutor) CC.tutor.init({
    rec: rec,
    mine: function (cb) { myEvents(cb); },
    past: function (cb) {   /* 지난 대화 — 이 교실(로컬이면 이 브라우저)의 내 기록 전부 */
      if (CC.sb && CC.sb.active() && currentClassroomId) CC.sb.getMyEvents(currentClassroomId).then(cb, function () { cb([]); });
      else cb(CC.store ? CC.store.all() : []);
    },
    context: function () {
      var items = [];
      if (!(M && M.kind === 'code')) (M ? M.inputs : []).forEach(function (inp) { items = items.concat(String(inp.v).split(/[,\n]/)); });
      return {
        mission: {
          title: M ? M.title : '', itemName: M ? (M.itemName || '') : '',
          items: items.map(function (x) { return x.trim(); }).filter(Boolean),
          situation: M ? (M.situation || '') : '', brief: M ? M.brief : '',
          inputs: (M ? M.inputs : []).map(function (inp) { return { name: inp.name, v: inp.v }; })
        },
        code: ($('#code-editor') || {}).value || '',
        define: state.defineChoice || '',
        design: picked().map(function (c) { return c.label + (c.detail ? ' ' + c.detail : ''); }),
        lastOutput: lastRun.output, lastError: lastRun.error,
        step: 4
      };
    }
  });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── 미션 바 (로컬 모드에서만 표시) ──────────────── */
  var bar = $('#mission-bar');

  /* ── 미션 로드 ─────────────────────────────────── */
  function loadMission(id) {
    M = CC.sentenceMission(id);
    if (!M) return;
    lastRun = { output: '', error: '' };
    if (CC.tutor) CC.tutor.reset(M.id);

    /* 상태 초기화 */
    state = {
      defineChoice: '',
      defineReason: '',
      design: [],
      methodReason: '',
      methodVer: 0,
      defineVer: 0,
      runs: [],
      judges: [],
      codes: [],        /* 이번에 낸 s-code 기록 — 정리 화면의 결과 */
      judge: null,      /* 마지막 s-code-judge */
      firstDefine: '',
      allDataDone: false,
      codeText: '',
      skeleton: '',
      codeOutput: ''
    };

    /* 미션 머리 — 위치 표시와 큰 이름 */
    $('#mission-head').hidden = false;
    $('#mission-title').textContent = M.title;
    $('#crumb-play-mission').textContent = M.title;
    $('#crumb-play-room').textContent = currentClassroomName || '내 미션';

    /* 화면 1 */
    $('#brief').textContent = M.brief;
    if ($('#situation')) {
      if (M.situation) { $('#situation').textContent = M.situation; $('#situation').hidden = false; }
      else { $('#situation').hidden = true; }
    }
    var samples = $('#samples');
    samples.innerHTML = '';
    M.inputs.slice(0, 2).forEach(function (inp) {   /* 반례는 코드 단계에서 — 처음엔 앞 두 자료만 */
      samples.appendChild(el('dt', 'sample-label', inp.name));
      samples.appendChild(el('dd', 'sample-data', inp.v));
    });
    var fixed = CC.cards.fixedList(M);   /* 골라내기 기준 목록도 자료다 — 02·03 에서도 왼쪽 단에 남는다 */
    if (fixed) {
      samples.appendChild(el('dt', 'sample-label sample-fixed-label', fixed.name));
      samples.appendChild(el('dd', 'sample-fixed', fixed.items.join(',')));
    }
    if ($('#req-from')) $('#req-from').textContent = (M.stage || '') + ' · 업무 요청';

    /* 화면 2: 성공 조건 — 받은 요청을 다시 보여 주고, 카드형 버튼으로 고른다 */
    if ($('#define-brief')) $('#define-brief').textContent = M.brief;
    if ($('#define-q')) $('#define-q').textContent = (M.define.q || '어떤 결과가 나오면 성공일까요?') + ' 하나를 골라 주세요.';
    var defineCards = $('#define-cards');
    var defineSelect = $('#slot-define');
    if (defineCards) {
      defineCards.innerHTML = '';
      M.define.options.forEach(function (o) {
        var card = el('button', 'define-card');
        card.type = 'button';
        card.textContent = o.v;
        card.dataset.value = o.v;
        card.addEventListener('click', function () {
          defineCards.querySelectorAll('.define-card').forEach(function (c) { c.classList.remove('selected'); });
          card.classList.add('selected');
          state.defineChoice = o.v;
          defineSelect.value = o.v;
          $('#go-method').disabled = false;
        });
        defineCards.appendChild(card);
      });
    }
    /* select도 동기화 (이벤트 기록용) */
    defineSelect.innerHTML = '<option value="">선택하기</option>';
    M.define.options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.v; opt.textContent = o.v;
      defineSelect.appendChild(opt);
    });
    defineSelect.value = '';
    $('#reason-define').value = '';
    $('#go-method').disabled = true;

    /* 화면 3: 설계 카드 */
    renderDesign();

    $('#reason-method').value = '';
    $('#go-run').disabled = true;

    /* 화면 4·5 초기화 — 앞 미션 코드가 남지 않게 에디터를 비운다 */
    if ($('#code-editor')) $('#code-editor').value = '';
    if ($('#past-runs-list')) $('#past-runs-list').innerHTML = '';
    if ($('#past-runs')) $('#past-runs').hidden = true;
    if ($('#go-wrap')) $('#go-wrap').disabled = true;
    if ($('#wrap-review')) $('#wrap-review').innerHTML = '';
    if ($('#wrap-text')) $('#wrap-text').value = '';
    $('#finish').disabled = true;
    $('#finish').textContent = '기록 저장';
    $('#wrap-done').hidden = true;

    showStep(1);
    showCompass();
  }

  /* 미션 카드 — 선생님이 이 미션에 남긴 한마디만. 바늘·방향·체크는 없다 */
  function showCompass() {
    var box = $('#compass-mine');
    box.hidden = true;
    box.innerHTML = '';
    if (!CC.sb || !CC.sb.active() || !currentMissionDbId) return;
    var db = currentMissionDbId;
    CC.sb.compassNote(db).then(function (c) {
      if (!c || !c.teacher_note || db !== currentMissionDbId) return;
      box.innerHTML = '';   /* A → B → A 로 빨리 바꾸면 A 응답이 둘 온다 — 두 번 그리지 않게 */
      box.appendChild(el('h2', 'step-title', '선생님 한마디'));
      var says = el('div', 'compass-says wide');
      says.appendChild(el('p', 'compass-note', c.teacher_note));
      box.appendChild(says);
      box.hidden = false;
    }, function () {});
  }

  /* 내 기록 탭 — 누적 나침반 하나. 바늘 · "○쪽으로 가고 있어요" (짧으면 "고르게 가고 있어요").
   * 0행이면 아직 보낸 적 없는 것 — 기다리는 말만. 점수·체크·단계는 서버가 주지 않는다 */
  var cumSeq = 0;
  function showCumulative() {
    var box = $('#compass-cum');
    if (!box) return;
    box.hidden = true;
    box.innerHTML = '';
    if (!CC.sb || !CC.sb.active()) return;
    var n = ++cumSeq;
    CC.sb.compassMine().then(function (c) {
      if (n !== cumSeq) return;
      box.innerHTML = '';
      box.appendChild(el('h2', 'step-title', '내 나침반'));
      var says = el('div', 'compass-says');
      var dir = c && c.needle_deg != null ? CC.compass.dirOf(c.needle_deg) : null;
      if (dir) {
        var wrap = el('div', 'compass-fig');
        wrap.innerHTML = CC.compass.svg(c.needle_deg, c.length);
        box.appendChild(wrap);
        says.appendChild(el('strong', 'compass-dir', CC.compass.line(c.dir || dir)));
        if (CC.compass.even(c.length)) says.appendChild(el('p', 'compass-even', '고르게 가고 있어요'));
      } else {
        says.classList.add('wide');
        says.appendChild(el('p', 'compass-note', '선생님이 곧 방향을 알려 주실 거예요.'));
      }
      box.appendChild(says);
      box.hidden = false;
    }, function () {});
  }

  /* ── 사용법 안내 — 단계마다 처음 그 화면을 열 때 한 번. 무엇을 하는 곳인지만 말한다 ── */
  var TOUR = {
    1: [
      { key: 'steps', title: '단계', text: '지금 어느 단계인지 보여요. 지나온 단계는 눌러서 다시 볼 수 있어요.' },
      { key: 'brief', title: '받은 요청', text: '무엇을 만들어 달라는 요청인지 여기서 읽어요.' },
      { key: 'replay', title: '사용법 보기', text: '이 안내는 여기서 언제든 다시 볼 수 있어요.' }
    ],
    2: [{ key: 'define', title: '성공 조건 고르기', text: '언제 성공한 것인지 내가 골라요. 나중에 다시 바꿀 수 있어요.' }],
    3: [
      { key: 'cards', title: '설계 카드', text: '할 일 카드예요. 누르면 내 설계도에 담겨요.' },
      { key: 'design', title: '내 설계도', text: '담은 카드가 여기 쌓여요. 순서를 바꾸거나 뺄 수 있어요.' }
    ],
    4: [
      { key: 'data', title: '자료 바꾸기', text: '코드에 넣을 자료를 바꿔요. 다른 자료로도 실행해 볼 수 있어요.' },
      { key: 'run', title: '코드 실행', text: '‘실행’은 고른 자료 하나로 돌려요. ‘자료 3개로 실행’은 세 결과를 표로 보여 줘요.' },
      { key: 'tutor', title: '파이썬 문법 물어보기', text: '문법이 궁금할 때 물어봐요. 코드는 직접 써요.' }
    ]
  };
  $('#tour-replay').addEventListener('click', function () {
    CC.tour.start([].concat(TOUR[1].slice(0, 2), TOUR[2], TOUR[3], TOUR[4], TOUR[1].slice(2)));
  });

  /* ── 화면 전환 ─────────────────────────────────── */
  function showStep(n) {
    if (TOUR[n]) CC.tour.auto('sentence-' + n, TOUR[n]);
    if (CC.tutor) CC.tutor.visible(n === 4);
    document.querySelectorAll('.step').forEach(function (s) { s.classList.remove('active'); });
    var target = $('#step' + n);
    if (target) {
      target.classList.add('active');
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
    /* 02·03 에서는 받은 요청(화면 1)을 왼쪽 단으로 남긴다 */
    if (n === 2 || n === 3) $('#step1').dataset.side = n;
    else $('#step1').removeAttribute('data-side');
    document.querySelectorAll('#steps-nav button').forEach(function (s) {
      var sn = parseInt(s.dataset.step, 10);
      s.classList.remove('current', 'done');
      if (sn === n) s.classList.add('current');
      else if (sn < n) s.classList.add('done');
      s.disabled = sn >= n;
    });
  }

  /* 지난 단계 탭 — 뒤로가기 버튼과 같은 길이라 고친 기록은 제출 핸들러가 남긴다 */
  document.querySelectorAll('#steps-nav button').forEach(function (b) {
    b.addEventListener('click', function () { if (!b.disabled) showStep(parseInt(b.dataset.step, 10)); });
  });

  /* ── 화면 3: 설계 카드 ────────────────────────── */
  function picked() {   /* 기록·뼈대에 쓰는 모양 { op, label, detail:'기준: 쉼표' } */
    return state.design.map(function (c) {
      return { op: c.op, label: c.label, detail: c.detail ? c.detail.name + ': ' + c.choice : '' };
    });
  }

  function summarizeMethod() {
    return picked().map(function (c) { return CC.cards.text(c); }).join(' → ');
  }

  function checkMethodComplete() {
    return state.design.length > 0 && state.design.every(function (c) { return !c.detail || !!c.choice; });
  }

  function renderDesign() {
    var pool = $('#card-pool'), list = $('#design-list');
    pool.innerHTML = ''; list.innerHTML = '';
    CC.cards.forMission(M).forEach(function (c) {
      var b = el('button', 'card-pick', c.label);
      b.type = 'button';
      b.disabled = state.design.some(function (d) { return d.op === c.op; });
      b.addEventListener('click', function () {
        state.design.push({ op: c.op, label: c.label, detail: c.detail, choice: '' });
        renderDesign();
      });
      pool.appendChild(b);
    });
    state.design.forEach(function (c, i) {
      var li = el('li', 'design-item');
      li.appendChild(el('span', 'num', (i + 1) + '.'));
      li.appendChild(el('span', 'label', c.label));
      if (c.detail) {
        var sel = document.createElement('select');
        sel.setAttribute('aria-label', c.label + ' ' + c.detail.name);
        sel.appendChild(new Option('고르기', ''));
        c.detail.options.forEach(function (o) { sel.appendChild(new Option(o, o)); });
        sel.value = c.choice;
        sel.addEventListener('change', function () { c.choice = sel.value; $('#go-run').disabled = !checkMethodComplete(); });
        li.appendChild(sel);
        if (c.op === 'filter' && CC.cards.fixedList(M)) li.appendChild(el('span', 'card-list', CC.cards.fixedList(M).items.join(',')));
      }
      var moves = el('span', 'moves');
      [['card-up', '▲', '위로', -1], ['card-down', '▼', '아래로', 1]].forEach(function (b) {
        var btn = el('button', b[0], b[1]);
        btn.type = 'button';
        btn.setAttribute('aria-label', c.label + ' ' + b[2]);
        btn.disabled = (b[3] < 0 && i === 0) || (b[3] > 0 && i === state.design.length - 1);
        btn.addEventListener('click', function () {
          var j = i + b[3];
          state.design[i] = state.design[j]; state.design[j] = c;
          renderDesign();
        });
        moves.appendChild(btn);
      });
      var rm = el('button', 'card-remove', '✕');
      rm.type = 'button';
      rm.setAttribute('aria-label', c.label + ' 빼기');
      rm.addEventListener('click', function () { state.design.splice(i, 1); renderDesign(); });
      moves.appendChild(rm);
      li.appendChild(moves);
      list.appendChild(li);
    });
    $('#go-run').disabled = !checkMethodComplete();
  }

  /* 자료마다 마지막 실행 결과 — s-code 의 dataId 에는 자료 값이 들어 있다. 정리 화면과 내 기록이 같이 쓴다 */
  function lastResults(codes) {
    var last = {};
    codes.forEach(function (c) { last[c.dataId] = c.error || String(c.output || '').trim() || '출력 없음'; });
    return last;
  }

  $('#design-reset').addEventListener('click', function () { state.design = []; renderDesign(); });

  /* ── 화면 1 ────────────────────────────────────── */
  $('#go-define').addEventListener('click', function () { showStep(2); });

  /* ── 화면 2 ────────────────────────────────────── */
  $('#slot-define').addEventListener('change', function () {
    state.defineChoice = this.value;
    $('#go-method').disabled = !this.value;
  });

  $('#reason-define').addEventListener('input', function () {
    state.defineReason = this.value.trim();
  });

  $('#go-method').addEventListener('click', function () {
    if (!state.defineChoice) return;
    if (!state.firstDefine) state.firstDefine = state.defineChoice;
    $('#side-define').textContent = state.defineChoice;
    if (state.defineVer > 0) {
      rec('s-redefine', { from: state.defineChoice, to: state.defineChoice, reason: state.defineReason });
    } else {
      rec('s-define', { choice: state.defineChoice, reason: state.defineReason });
    }
    state.defineVer++;
    showStep(3);
  });

  $('#back-request').addEventListener('click', function () { showStep(1); });

  /* ── 화면 3 ────────────────────────────────────── */
  $('#reason-method').addEventListener('input', function () {
    state.methodReason = this.value.trim();
  });

  $('#go-run').addEventListener('click', function () {
    if (!checkMethodComplete()) return;
    var cardsSnapshot = picked();
    if (state.methodVer > 0) {
      rec('s-remethod', { toCards: cardsSnapshot, reason: state.methodReason });
    } else {
      rec('s-method', { cards: cardsSnapshot, reason: state.methodReason, pipelineId: M.pipelineId || '' });
    }
    state.methodVer++;
    rec('s-design', { define: state.defineChoice, cards: cardsSnapshot, pipelineId: M.pipelineId || '' });

    renderCodeStep();
    showStep(4);
  });

  $('#back-define').addEventListener('click', function () { showStep(2); });

  /* ── 화면 4: 코드 작성 ────────────────────────── */

  /* Pyodide — Worker 에서 돌린다 (js/ui/pyworker.js 머리말).
   * file:// 처럼 Worker 를 못 만드는 곳에서는 예전처럼 메인 스레드에서 돈다 — 그때는 시간 제한이 없다. */
  var pyodideReady = false;
  function runBtns(off) {   /* 실행 · 자료 3개로 실행 — 하나가 도는 동안 둘 다 꺼진다 */
    ['#run-code', '#run-all'].forEach(function (id) { if ($(id)) $(id).disabled = off; });
  }
  var py = CC.pyrun.create(function (text, ready) {
    pyodideReady = ready;
    if ($('#pyodide-status')) $('#pyodide-status').textContent = text;
    runBtns(!ready);
  });

  function renderCodeStep() {
    /* 설계도 표시 */
    if ($('#design-define')) $('#design-define').textContent = '성공: ' + state.defineChoice;
    $('#design-side').innerHTML = picked().map(function (c, i) {
      return '<li class="design-item"><span class="num">' + (i + 1) + '.</span><span>' + esc(CC.cards.text(c)) + '</span></li>';
    }).join('');
    $('#step4-req').textContent = M ? M.brief : '';
    $('#step4-situation').textContent = (M && M.situation) || '';
    $('#step4-situation').hidden = !(M && M.situation);
    var fx = M && CC.cards.fixedList(M);   /* 코드에도 이 목록이 필요하다 */
    $('#step4-fixed').textContent = fx ? fx.name + ': ' + fx.items.join(',') : '';
    $('#step4-fixed').hidden = !fx;

    /* 자료 드롭다운 — clone으로 이전 리스너 제거 */
    var dataSel = $('#code-data-select');
    if (dataSel && M) {
      var fresh = dataSel.cloneNode(false);
      dataSel.parentNode.replaceChild(fresh, dataSel);
      M.inputs.forEach(function (inp) {
        var o = document.createElement('option');
        o.value = inp.v; o.textContent = inp.name;
        fresh.appendChild(o);
      });
      if ($('#code-data-preview')) $('#code-data-preview').textContent = CC.codemission.dataLine(M, M.inputs[0].v);
      fresh.addEventListener('change', function () {
        if ($('#code-data-preview')) $('#code-data-preview').textContent = CC.codemission.dataLine(M, this.value);
        var editor = $('#code-editor');
        if (editor) {
          var line = CC.codemission.dataLine(M, this.value);
          var wasSkeleton = editor.value === state.skeleton;
          editor.value = editor.value.replace(CC.codemission.DATA_RE, function () { return line; });
          /* 뼈대 그대로였으면 뼈대도 같이 옮겨, 다음 렌더에서 학생 코드로 오인되지 않게 한다 */
          if (wasSkeleton) state.skeleton = editor.value;
        }
      });
    }

    /* 코드 에디터 — 비었거나 직전 뼈대 그대로일 때만 새 뼈대. 학생이 쓴 코드는 덮어쓰지 않는다 */
    var editor = $('#code-editor');
    if (editor && (!editor.value || editor.value === state.skeleton)) {
      /* JSON 문자열은 보통 문자열에서 그대로 파이썬 문자열이다 — 자료에 " · \\ · 줄바꿈이 있어도 깨지지 않는다 */
      state.skeleton = (M ? CC.codemission.dataLine(M, M.inputs[0].v) : 'data = ""') + '\n# data 에 자료가 들어 있어요.\n' + CC.cards.skeleton(picked());
      editor.value = state.skeleton;
    }

    /* 실행 버튼 */
    runBtns(!pyodideReady);

    /* 판정/마무리 숨기기 */
    if ($('#code-output')) $('#code-output').hidden = true;
    if ($('#code-table-wrap')) $('#code-table-wrap').hidden = true;
    if ($('#code-judge')) $('#code-judge').hidden = true;
    if ($('#go-wrap')) $('#go-wrap').style.display = 'none';
  }

  /* 자료 변경 시 data 변수 업데이트 — renderCodeStep 내부에서만 등록 */

  /* Tab 키로 들여쓰기 — 한 번만 단다. renderCodeStep 안에서 달면 설계를 고칠 때마다 쌓인다 */
  if ($('#code-editor')) {
    $('#code-editor').addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var start = this.selectionStart, end = this.selectionEnd;
        this.value = this.value.substring(0, start) + '    ' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 4;
      }
    });
  }

  /* 코드 한 번 실행 → 기록. 학생의 data 줄은 같은 자리에서 바꿔 줄 번호를 지킨다.
   * 없으면 앞에 한 줄을 붙이고 에러 줄 번호에서 1을 뺀다 */
  function runWith(code, dataVal, cb) {
    var dataLine = CC.codemission.dataLine(M, dataVal);
    var hasData = CC.codemission.DATA_RE.test(code);
    var fullCode = hasData ? code.replace(CC.codemission.DATA_RE, function () { return dataLine; }) : dataLine + '\n' + code;
    pyodideReady = false;             /* 실행 중에는 화면을 오가도 버튼이 다시 켜지지 않는다 */
    runBtns(true);
    py.run(fullCode, function (output, error) {
      pyodideReady = py.ready();      /* 시간 초과면 새 worker 가 준비될 때까지 꺼져 있다 */
      runBtns(!pyodideReady);
      if (error && !hasData) error = error.replace(/^(\d+)번째 줄/, function (_, n) { return (n - 1) + '번째 줄'; });
      lastRun = { output: String(output || ''), error: String(error || '') };
      state.codes.push(rec('s-code', { code: code, dataId: dataVal, output: output, error: error }));
      cb(output, error);
    });
  }

  /* 판정 뒤 모든 자료로 조용히 돌려 기록만 남긴다. 화면·state.codes 에는 아무것도 더하지 않는다.
   * 같은 py 대기열을 쓰므로 학생이 그 사이에 실행해도 차례로 돈다 */
  var lastProbeSig = null;
  function quietProbe() {
    var cm = CC.codemission, m = M, dbId = currentMissionDbId;   /* 도는 사이 미션이 바뀌어도 이 기록은 처음 미션 것이다 */
    var lastC = state.codes[state.codes.length - 1];
    if (!m || !lastC || lastC.error || !py.ready()) return;
    var code = lastC.code, sg = cm.sig(code);
    if (m.id + sg === lastProbeSig) return;
    lastProbeSig = m.id + sg;
    var hasData = cm.DATA_RE.test(code), outs = [], i = 0, dead = false;
    function done(u) { rec('s-probe', { sig: sg, outs: outs, uses: u, mid: m.id }, dbId); }
    (function next() {
      if (i >= m.inputs.length || dead) {
        if (dead) return done(null);   /* 시간 초과면 worker 가 한 번 다시 뜬 것으로 끝 — 남은 자료로 또 죽이지 않는다 */
        py.run(cm.usesCode(code), function (o, e) {
          var u = null;
          try { u = e ? null : JSON.parse(String(o).trim()); } catch (x) { u = null; }
          done(u);
        });
        return;
      }
      var v = m.inputs[i++].v, dl = cm.dataLine(m, v);
      py.run(hasData ? code.replace(cm.DATA_RE, function () { return dl; }) : dl + '\n' + code, function (output, error) {
        outs.push({ dataId: v, output: String(output || '').slice(0, 200), error: String(error || '') });
        if (error === CC.pyerr.TIMEOUT) dead = true;
        next();
      });
    })();
  }

  function showResult(text, isError) {
    var resultEl = $('#code-result'), outputBox = $('#code-output');
    if (!resultEl || !outputBox) return;
    if ($('#code-table-wrap')) $('#code-table-wrap').hidden = true;
    outputBox.hidden = false;
    resultEl.textContent = text;
    resultEl.style.color = isError ? 'var(--coral)' : 'var(--ink)';
  }

  /* 판정은 학생이 한다 — 시스템은 결과만 보여 준다 */
  function showJudge() {
    var judgeDiv = $('#code-judge');
    if (!judgeDiv) return;
    judgeDiv.hidden = false;
    if ($('#code-judge-q')) $('#code-judge-q').textContent = '내 성공 조건을 지켰나요?';
    var btnsDiv = $('#code-judge-btns');
    if (!btnsDiv || btnsDiv.children.length) return;
    var selectedVerdict = '';
    ['지켰다', '지키지 못했다', '아직 모르겠다'].forEach(function (v) {
      var b = el('button', 'judge-btn', v);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        btnsDiv.querySelectorAll('.judge-btn').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        selectedVerdict = v;
        if ($('#code-judge-save')) $('#code-judge-save').disabled = false;
      });
      btnsDiv.appendChild(b);
    });
    $('#code-judge-save').addEventListener('click', function () {
      state.judge = rec('s-code-judge', { verdict: selectedVerdict, basis: ($('#code-basis') || {}).value || '' });
      quietProbe();
      this.disabled = true; this.textContent = '저장됨';
      btnsDiv.querySelectorAll('.judge-btn').forEach(function (x) { x.disabled = true; });
      if ($('#go-wrap')) { $('#go-wrap').style.display = ''; $('#go-wrap').disabled = false; }
    });
  }

  /* 실행 — 고른 자료 하나로 */
  if ($('#run-code')) {
    $('#run-code').addEventListener('click', function () {
      if (!pyodideReady) return;
      var dataVal = $('#code-data-select') ? $('#code-data-select').value : '';
      runWith($('#code-editor').value, dataVal, function (output, error) {
        showResult(error || output || '출력된 것이 없어요.', !!error);
        if (!error) showJudge();
      });
    });
  }

  /* 자료 3개로 실행 — 같은 코드를 자료만 바꿔 차례로 돌린다. 반례에서 결과가 달라지는 게 한눈에 보인다 */
  if ($('#run-all')) {
    $('#run-all').addEventListener('click', function () {
      if (!pyodideReady || !M) return;
      var code = $('#code-editor').value, rows = [], anyOk = false, i = 0;
      showResult('실행 중...', false);
      (function next() {
        if (i >= M.inputs.length) {
          var tb = $('#code-table tbody');
          tb.innerHTML = '';
          rows.forEach(function (r) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td>' + esc(r.name) + (r.counter ? '<span class="tag-new">새로 온 자료</span>' : '') + '</td>' +
              '<td class="data">' + esc(r.v) + '</td><td class="out' + (r.err ? ' err' : '') + '">' + esc(r.text) + '</td>';
            tb.appendChild(tr);
          });
          $('#code-table-wrap').hidden = false;
          $('#code-output').hidden = true;
          if (anyOk) showJudge();
          return;
        }
        var inp = M.inputs[i++];
        runWith(code, inp.v, function (output, error) {
          if (!error) anyOk = true;
          rows.push({ name: inp.name, v: inp.v, counter: !!inp.counter, err: !!error, text: error || String(output || '').trim() || '출력된 것이 없어요.' });
          next();
        });
      })();
    });
  }

  /* 마무리 버튼 */
  if ($('#go-wrap')) {
    $('#go-wrap').addEventListener('click', function () { renderWrapStep(); showStep(5); });
  }

  /* 방법/성공 조건 수정 */
  if ($('#back-method')) $('#back-method').addEventListener('click', function () { showStep(3); });
  if ($('#back-define2')) $('#back-define2').addEventListener('click', function () { showStep(2); });

  /* 도움 요청 */
  if ($('#help-btn')) $('#help-btn').addEventListener('click', function () { if ($('#help-dialog')) $('#help-dialog').showModal(); });
  if ($('#help-send')) $('#help-send').addEventListener('click', function () {
    rec('s-help', { expected: ($('#help-expected') || {}).value || '', stuck: ($('#help-stuck') || {}).value || '' });
  });

  /* 마무리로 — 이벤트는 renderCodeStep에서 등록됨 */

  /* ── 화면 5: 판정 돌아보기 + 자유 정리 ──────────── */
  function renderWrapStep() {
    var review = $('#wrap-review');
    review.innerHTML = '';
    function row(label, value, was, mono) {
      var r = el('div', 'row');
      r.appendChild(el('dt', null, label));
      var dd = el('dd', mono ? 'mono' : null);
      if (typeof value === 'string') dd.textContent = value; else dd.appendChild(value);
      if (was) dd.appendChild(el('span', 'was', was));
      r.appendChild(dd);
      review.appendChild(r);
    }

    row('내가 정한 성공', state.defineChoice,
      state.firstDefine && state.firstDefine !== state.defineChoice ? '처음 정한 것: "' + state.firstDefine + '"' : '');
    row('내 설계도', summarizeMethod(), state.methodVer > 1 ? (state.methodVer - 1) + '번 고쳤어요' : '');

    var last = lastResults(state.codes), res = document.createDocumentFragment();
    M.inputs.forEach(function (inp) {
      if (!(inp.v in last)) return;
      var line = el('div', null, inp.name + ' → ' + last[inp.v]);
      if (inp.counter) line.appendChild(el('span', 'tag-new', '새로 온 자료'));
      res.appendChild(line);
    });
    if (res.childNodes.length) row('실행 결과', res, '', true);

    if (state.judge) row('내 판단', state.judge.verdict, state.judge.basis ? '"' + state.judge.basis + '"' : '');
  }

  /* 자유 정리 입력 */
  $('#wrap-text').addEventListener('input', function () {
    $('#finish').disabled = !this.value.trim();
  });

  $('#finish').addEventListener('click', function () {
    var text = $('#wrap-text').value.trim();
    rec('s-wrap', { text: text });
    $('#finish').disabled = true;
    $('#finish').textContent = '저장됨';
    $('#wrap-done').hidden = false;
  });

  /* 지난 실행 보기 */
  if (!$('#toggle-past')) { /* HTML에서 제거됨 — 스킵 */ } else
  $('#toggle-past').addEventListener('click', function () {
    var list = $('#past-runs-list');
    list.hidden = !list.hidden;
    if (!list.hidden) {
      list.innerHTML = '';
      state.runs.forEach(function (r, i) {
        var d = el('div');
        d.style.cssText = 'padding:8px 0;border-bottom:1px solid var(--line);font-size:13px';
        d.textContent = '#' + (i + 1) + ' ' + r.dataId + ' · 방법v' + r.methodVer +
          ' · 출력: ' + (r.result.err ? '중단' : r.result.value) + ' · 예상: ' + (r.predicted || '-');
        list.appendChild(d);
      });
      if (!state.runs.length) list.appendChild(el('div', null, '아직 실행 기록이 없어요.'));
    }
  });

  /* ── 탭 전환 ────────────────────────────────────── */
  /* 기록이 가는 교실 = 미션 파일을 연 교실. 둘러보는 교실(viewedRoom)과 따로 둔다 —
   * 다른 교실 폴더를 열어 보기만 해도 기록이 그 교실로 가면 안 된다 */
  var currentClassroomId = null;
  var currentMissionDbId = null;
  var viewedRoom = null;  /* { id, name } — 지금 열어 본 교실 폴더 */

  function switchTab(panelId) {
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
    document.querySelectorAll('.main-tab').forEach(function (t) { t.classList.remove('active'); });
    var panel = $('#' + panelId);
    if (panel) panel.classList.add('active');
    var tab = document.querySelector('.main-tab[data-panel="' + panelId + '"]');
    if (tab) tab.classList.add('active');
    /* 미션을 마치고 목록으로 돌아오면 상태가 바로 바뀌어야 한다 — 목록을 열 때마다 다시 센다 */
    if (panelId === 'panel-missions' && $('#mission-grid')) showMyStatus($('#mission-grid'));
  }

  document.querySelectorAll('.main-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      switchTab(t.dataset.panel);
      if (t.dataset.panel === 'panel-history') { renderHistory(); showCumulative(); }
    });
  });

  if ($('#back-to-missions')) {
    $('#back-to-missions').addEventListener('click', function () { switchTab('panel-missions'); });
  }

  /* ── 미션 카드 렌더링 ──────────────────────────── */
  function renderMissionGrid(missions) {
    var grid = $('#mission-grid');
    grid.innerHTML = '';
    if (!missions.length) {
      $('#missions-empty').hidden = false;
      return;
    }
    $('#missions-empty').hidden = true;

    missions.forEach(function (m) {
      var mData = m.data || m;
      var card = el('button', 'tile mission-file');
      card.type = 'button';
      card.innerHTML = '<span class="file" aria-hidden="true"><span class="fold"></span><span class="ext">TXT</span></span>';
      card.appendChild(el('span', 'name', mData.title || ''));

      /* 상태 — 아래에서 내 기록을 받아 채운다. 안 연 미션은 비워 둔다 */
      var statusEl = el('span', 'mc-status state', '');
      statusEl.dataset.dbId = m.id || '';
      statusEl.dataset.mid = mData.id || '';
      card.appendChild(statusEl);

      card.addEventListener('click', function () {
        if (!CC.SENTENCE_MISSIONS.some(function (x) { return x.id === mData.id; })) {
          CC.SENTENCE_MISSIONS.push(mData);
        }
        currentMissionDbId = m.id || null;  /* DB id. 기본 미션은 id 없음 */
        if (viewedRoom) { currentClassroomId = viewedRoom.id; currentClassroomName = viewedRoom.name; }
        if ($('#play-empty')) $('#play-empty').hidden = true;
        loadMission(mData.id);
        switchTab('panel-play');
      });

      grid.appendChild(card);
    });
  }

  var STATUS = { none: ['', ''], doing: ['doing', '진행 중'], done: ['done', '완료'] };

  /* 푼 미션 표시 — 이 학생의 기록만 본다. 반 전체 현황은 학생 화면에 띄우지 않는다 (CLAUDE.md) */
  function showMyStatus(grid) {
    if (!CC.sb || !CC.sb.active() || !viewedRoom) return;
    CC.sb.getMyEvents(viewedRoom.id).then(function (evs) {
      grid.querySelectorAll('.mc-status').forEach(function (st) {
        var db = st.dataset.dbId, mid = st.dataset.mid;
        var mine = evs.filter(function (e) { return db ? e._missionDbId === db : e.mid === mid; });
        var s = STATUS[CC.fold.missionStatus(mine)];
        st.className = 'mc-status state ' + s[0];
        st.textContent = s[1];
        var f = st.parentNode.querySelector('.file');
        if (f) f.className = 'file ' + s[0];
      });
    });
  }

  /* ── 내 기록 렌더링 (형식 A: 판단 중심) ──────────── */
  /* 내 기록의 재료 — 이 학생의, 이 미션의 이벤트만.
   * Supabase 모드는 서버가 학생·미션별로 갖고 있다. 기본 미션(DB id 없음)과 로컬 모드는 mid 로 거른다. */
  function myEvents(cb) {
    var mine = function (e) { return e.mid === M.id; };
    if (CC.sb && CC.sb.active() && currentClassroomId) {
      CC.sb.getMyEvents(currentClassroomId, currentMissionDbId).then(function (evs) {
        cb(currentMissionDbId ? evs : evs.filter(mine));
      }, function () { cb([]); });
    } else {
      cb((CC.store ? CC.store.all() : []).filter(mine));
    }
  }

  function renderHistory() {
    var list = $('#history-list');
    list.innerHTML = '';
    /* 미션이 로드되지 않은 상태(DB에 미션 없음)면 빈 상태 표시 */
    if (!M) { $('#history-empty').hidden = false; return; }
    myEvents(function (events) { drawHistory(list, events); });
  }

  function drawHistory(list, events) {
    if (!events.length) { $('#history-empty').hidden = false; return; }
    $('#history-empty').hidden = true;

    var defines = events.filter(function (e) { return e.type === 's-define' || e.type === 's-redefine'; });
    var methods = events.filter(function (e) { return e.type === 's-method' || e.type === 's-remethod'; });
    var codes = events.filter(function (e) { return e.type === 's-code'; });
    var codeJudges = events.filter(function (e) { return e.type === 's-code-judge'; });
    var wraps = events.filter(function (e) { return e.type === 's-wrap'; });

    if (!defines.length) { $('#history-empty').hidden = false; return; }

    var card = el('div', 'record-card');

    /* 미션 제목 + 원문 요청 */
    var title = el('div', 'rc-title');
    title.textContent = M ? M.title : '미션';
    card.appendChild(title);

    if (M && M.brief) {
      var briefEl = el('div', 'rc-brief');
      briefEl.textContent = M.brief;
      card.appendChild(briefEl);
    }

    /* 성공 조건 */
    var lastDef = defines[defines.length - 1];
    var defSection = el('div', 'rc-section');
    defSection.innerHTML = '<span class="rc-label">내가 정한 성공</span>' +
      '<span class="rc-value">' + esc(lastDef.choice || lastDef.to || '') + '</span>';
    if (defines.length > 1) {
      defSection.innerHTML += '<span class="rc-change">처음에는 "' +
        esc(defines[0].choice || defines[0].to || '') + '"라고 정했다가 바꿨다</span>';
    }
    card.appendChild(defSection);

    /* 방법 — 문장으로 풀어서 */
    if (methods.length) {
      var lastM = methods[methods.length - 1];
      var sl = lastM.slots || lastM.toSlots || {};
      var methSection = el('div', 'rc-section');
      var methText = lastM.cards || lastM.toCards
        ? (lastM.cards || lastM.toCards).map(function (c) { return CC.cards.text(c); }).join(' → ')
        : Object.keys(sl).map(function (k) { return sl[k]; }).filter(Boolean).join(' → ');  /* 예전 기록 */
      methSection.innerHTML = '<span class="rc-label">내가 정한 방법</span>' +
        '<span class="rc-value">' + esc(methText) + '</span>';
      if (methods.length > 1) {
        methSection.innerHTML += '<span class="rc-change">' + (methods.length - 1) + '번 수정했다</span>';
      }
      card.appendChild(methSection);
    }

    /* 코드 실행 — 자료마다 마지막 실행 결과. s-code 의 dataId 에는 자료 값이 들어 있다 */
    var lastByData = lastResults(codes);
    var resultsSection = el('div', 'rc-results');
    (M.inputs || []).forEach(function (inp) {
      if (!(inp.v in lastByData)) return;
      var row = el('div', 'rc-result-row');
      row.innerHTML = '<span class="rc-data-name">' + esc(inp.name) + '</span>' +
        '<div class="rc-data-input">' + esc(inp.v) + '</div>' +
        '<div class="rc-row-result">결과: <b>' + esc(lastByData[inp.v]) + '</b></div>';
      resultsSection.appendChild(row);
    });
    /* 내 판단 — 학생이 스스로 내린 것. 시스템 판정이 아니다 */
    var lastJudge = codeJudges[codeJudges.length - 1];
    if (lastJudge) {
      var jr = el('div', 'rc-result-row');
      jr.innerHTML = '<div class="rc-row-top"><span class="rc-data-name">내 성공 조건을 지켰나요?</span>' +
        '<span class="rc-verdict-icon">' + esc(lastJudge.verdict) + '</span></div>' +
        (lastJudge.basis ? '<div class="rc-basis">"' + esc(lastJudge.basis) + '"</div>' : '');
      resultsSection.appendChild(jr);
    }
    card.appendChild(resultsSection);

    /* 마무리 */
    if (wraps.length) {
      var wrapSection = el('div', 'rc-wrap');
      wrapSection.innerHTML = '<span class="rc-wrap-icon">💬</span>' +
        '<span>' + esc(wraps[wraps.length - 1].text) + '</span>';
      card.appendChild(wrapSection);
    }

    list.appendChild(card);
  }

  /* 내 교실 = 폴더. 교실을 열면 그 교실 미션이 파일로 나온다 */
  var currentClassroomName = '';  /* 미션 화면 위치 표시용 */
  function renderRooms(rooms) {
    var grid = $('#room-grid');
    grid.innerHTML = '';
    rooms.forEach(function (r) {
      var b = el('button', 'tile room-tile');
      b.type = 'button';
      b.innerHTML = '<span class="folder" aria-hidden="true"><span class="tab"></span><span class="body"></span></span>';
      b.appendChild(el('span', 'name', r.name));
      b.addEventListener('click', function () { openRoom(r); });
      grid.appendChild(b);
    });
    /* 교실은 선생님이 넣어 준다 — 스스로 들어가는 문은 없다 (2026-10-18) */
    if (!rooms.length) grid.appendChild(el('p', 'home-lead room-empty', '아직 들어간 교실이 없어요. 선생님께 교실에 넣어 달라고 말해 주세요.'));
    showRooms();
    openDue(rooms.filter(function (r) { return r.onboard_due; }));
  }

  /* 선생님이 레벨 테스트 대상으로 정한 교실이 있으면 로그인하자마자 그 교실을 연다 — openRoom 이 테스트를 띄운다 */
  function openDue(list) {
    if (!list.length) return;
    var r = list[0];
    CC.sb.getMyEvents(r.id).then(function (evs) {
      if (viewedRoom) return;   /* 그사이 학생이 직접 교실을 열었다 */
      if (CC.onboard.pending(r.onboard_due, onboardAts(evs))) openRoom(r); else openDue(list.slice(1));
    }, function () {});
  }

  function onboardAts(evs) {
    return evs.filter(function (e) { return e.type === CC.events.T.S_ONBOARD; }).map(function (e) { return e._at; });
  }

  function showRooms() { $('#rooms-view').hidden = false; $('#room-view').hidden = true; $('#onboard-view').hidden = true; }

  function openRoom(r) {
    viewedRoom = { id: r.id, name: r.name };
    $('#mission-grid').innerHTML = '';
    $('#room-lead').textContent = '';
    $('#crumb-room').textContent = r.name;
    $('#room-title').textContent = r.name;
    $('#rooms-view').hidden = true;
    var asked = viewedRoom;
    function showMissions() {
      if (viewedRoom !== asked) return;  /* 그사이 다른 교실을 열었다 — 늦게 온 답은 버린다 */
      $('#room-view').hidden = false;
      CC.sb.getMissions(r.id).then(function (missions) {
        if (viewedRoom !== asked) return;
        $('#room-lead').textContent = missions.length ? '파일을 열면 이어서 할 수 있어요.' : '';
        renderMissionGrid(missions);
        showMyStatus($('#mission-grid'));
      });
    }
    /* 교실마다 처음 한 번 진단 + 선생님이 대상으로 정하면 다시. 교실은 서버에만 있으니 로컬 모드는 검사하지 않는다 */
    if (!CC.sb.active()) return showMissions();
    CC.sb.getMyEvents(r.id).then(function (evs) {
      if (viewedRoom !== asked) return;
      var ats = onboardAts(evs);
      var forced = CC.onboard.pending(r.onboard_due, ats);   /* 선생님이 정했으면 건너뛸 수 없다 */
      if (ats.length && !forced) showMissions(); else CC.onboardView.open(r.id, showMissions, forced);
    }, showMissions);  /* 확인이 안 되면 막지 않는다 — 진단 때문에 수업이 멈추면 안 된다 */
  }
  if ($('#crumb-home')) $('#crumb-home').addEventListener('click', function (e) { e.preventDefault(); showRooms(); });
  $('#crumb-play-home').addEventListener('click', function (e) { e.preventDefault(); showRooms(); switchTab('panel-missions'); });

  /* ── 인증 연동 ──────────────────────────────────── */
  function initAuth() {
    if (!CC.sb || !CC.sb.active()) {
      /* Supabase 미설정 → 로컬 전용 모드: 탭 숨기고 바로 플레이, 미션바 표시 */
      if ($('#login-link')) $('#login-link').hidden = true;
      if ($('#main-tabs')) $('#main-tabs').hidden = true;
      $('#crumb-play-home').hidden = $('#crumb-play-home').nextElementSibling.hidden = true;  /* 교실 폴더가 없다 */
      bar.hidden = false;
      CC.SENTENCE_MISSIONS.forEach(function (m) {
        if (bar.querySelector('[data-id="' + m.id + '"]')) return;
        var b = el('button', 'tile m-btn');
        b.type = 'button';
        b.dataset.id = m.id;
        b.innerHTML = '<span class="file" aria-hidden="true"><span class="fold"></span><span class="ext">TXT</span></span>';
        b.setAttribute('aria-pressed', m.id === CC.SENTENCE_MISSIONS[0].id ? 'true' : 'false');
        b.appendChild(el('span', 'name m-title', m.title));
        b.addEventListener('click', function () { loadMission(m.id); });
        bar.appendChild(b);
      });
      switchTab('panel-play');
      return;
    }

    CC.sb.getProfile().then(function (profile) {
      console.log('[CC] getProfile:', profile);
      if (!profile) {
        console.warn('[CC] 프로필 없음 — 로그인 필요');
        return;
      }

      /* 로그인 UI */
      if ($('#login-link')) $('#login-link').hidden = true;
      if ($('#logout-btn')) $('#logout-btn').hidden = false;
      if ($('#user-info')) { $('#user-info').textContent = profile.name; $('#user-info').hidden = false; }
      if (profile.role === 'teacher' && $('#teacher-link')) $('#teacher-link').hidden = false;
      if ($('#main-tabs')) $('#main-tabs').hidden = false;
      if ($('#back-to-missions')) $('#back-to-missions').hidden = false;

      /* 교실 미션 로드 */
      CC.sb.myClassrooms().then(function (rooms) {
        console.log('[CC] myClassrooms:', rooms);
        renderRooms(rooms);
        switchTab('panel-missions');
      });
    });

  }

  /* 로그아웃 — initAuth 밖에서 항상 등록 */
  if ($('#logout-btn')) {
    $('#logout-btn').addEventListener('click', function () {
      if (CC.sb && CC.sb.active()) {
        CC.sb.signOut().then(function () { window.location.href = 'auth.html'; });
      } else {
        window.location.href = 'auth.html';
      }
    });
  }

  /* ── 생성된 미션 로드 (로컬) ───────────────────── */
  function loadGeneratedMissions() {
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem('cutcheck.generated') || '[]'); } catch (e) {}
    saved.forEach(function (m) {
      if (CC.SENTENCE_MISSIONS.some(function (x) { return x.id === m.id; })) return;
      CC.SENTENCE_MISSIONS.push(m);
    });
  }

  /* ── 초기화 ────────────────────────────────────── */
  if (!CC.sb || !CC.sb.active()) {
    /* 로컬 모드에서만 코드 내장 미션을 바로 로드 */
    loadGeneratedMissions();
    loadMission(CC.SENTENCE_MISSIONS[0].id);
  } else {
    /* Supabase 모드: 미션 선택 전이므로 빈 상태 표시 */
    if ($('#play-empty')) $('#play-empty').hidden = false;
    document.querySelectorAll('.step').forEach(function (s) { s.classList.remove('active'); });
  }
  initAuth();

})(window.CC = window.CC || {});
