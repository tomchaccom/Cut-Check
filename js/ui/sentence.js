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

  var rec = function (type, payload) {
    var ev = CC.events.make(type, payload);
    if (CC.store) CC.store.push(ev);
    /* Supabase에도 저장 */
    if (CC.sb && CC.sb.active() && currentClassroomId) {
      CC.sb.pushEvent(currentClassroomId, currentMissionDbId, ev);
    }
    return ev;
  };

  if (CC.tutor) CC.tutor.init({
    rec: rec,
    context: function () {
      var items = [];
      (M ? M.inputs : []).forEach(function (inp) { items = items.concat(String(inp.v).split(/[,\n]/)); });
      return {
        mission: { title: M ? M.title : '', itemName: M ? (M.itemName || '') : '', items: items.map(function (x) { return x.trim(); }).filter(Boolean) },
        code: ($('#code-editor') || {}).value || ''
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
      allDataDone: false,
      codeText: '',
      skeleton: '',
      codeOutput: ''
    };

    /* 화면 1 */
    $('#brief').textContent = M.brief;
    if ($('#situation')) {
      if (M.situation) { $('#situation').textContent = M.situation; $('#situation').hidden = false; }
      else { $('#situation').hidden = true; }
    }
    var samples = $('#samples');
    samples.innerHTML = '';
    M.inputs.slice(0, 2).forEach(function (inp) {   /* 반례는 코드 단계에서 — 처음엔 앞 두 자료만 */
      samples.appendChild(el('span', 'sample-label', inp.name));
      samples.appendChild(el('code', 'sample-data', inp.v));
    });
    if ($('#req-from')) $('#req-from').textContent = (M.stage || '') + ' · 업무 요청';

    /* 화면 2: 성공 조건 — 카드형 버튼으로 표시 */
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
  }

  /* ── 화면 전환 ─────────────────────────────────── */
  function showStep(n) {
    if (CC.tutor) CC.tutor.visible(n === 4);
    document.querySelectorAll('.step').forEach(function (s) { s.classList.remove('active'); });
    var target = $('#step' + n);
    if (target) {
      target.classList.add('active');
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
    document.querySelectorAll('.steps-nav span').forEach(function (s) {
      var sn = parseInt(s.dataset.step, 10);
      s.classList.remove('current', 'done');
      if (sn === n) s.classList.add('current');
      else if (sn < n) s.classList.add('done');
    });
  }

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

  function findLatestRun(dataId, methodVer) {
    for (var i = state.runs.length - 1; i >= 0; i--) {
      var r = state.runs[i];
      if (r.dataId === dataId && r.methodVer === methodVer) {
        r._idx = i;
        return r;
      }
    }
    return null;
  }

  function findJudgeForRun(runIdx) {
    for (var i = state.judges.length - 1; i >= 0; i--) {
      if (state.judges[i].runIdx === runIdx) return state.judges[i];
    }
    return null;
  }

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
  var py = (function () {
    var w = null, pending = null, seq = 0, main = null;
    var LOAD_FAIL = 'Python을 불러오지 못했어요. 코드는 계속 쓸 수 있어요.';

    function status(text, ready) {
      pyodideReady = ready;
      if ($('#pyodide-status')) $('#pyodide-status').textContent = text;
      if ($('#run-code')) $('#run-code').disabled = !ready;
    }

    function boot() {
      status('Python 로딩 중...', false);
      try { w = new Worker('js/ui/pyworker.js'); } catch (e) { w = null; return bootMain(); }
      w.onmessage = function (e) {
        var d = e.data;
        if (d.type === 'ready') status('Python 준비 완료', true);
        else if (d.type === 'load-error') status(LOAD_FAIL, false);
        else if (d.type === 'done' && pending && pending.id === d.id) {
          clearTimeout(pending.timer);
          var cb = pending.cb; pending = null;
          pyodideReady = true;
          if ($('#run-code')) $('#run-code').disabled = false;
          cb(d.output, d.error ? CC.pyerr.short(d.error) : '');
        }
      };
      w.onerror = function (e) {
        e.preventDefault();           /* 처리했다 — 페이지 에러로 올리지 않는다 */
        if (pending) { clearTimeout(pending.timer); pending = null; }
        w = null; bootMain();
      };
    }

    function bootMain() {
      if (typeof loadPyodide !== 'function') return status(LOAD_FAIL, false);
      loadPyodide().then(function (p) {
        p.runPython('import builtins\ndef _no_input(*a):\n    raise RuntimeError("__NO_INPUT__")\nbuiltins.input = _no_input');
        main = p; status('Python 준비 완료', true);
      }, function () { status(LOAD_FAIL, false); });
    }

    function run(code, cb) {
      if (main) {
        main.runPython('import io, sys; sys.stdout = io.StringIO()');
        var err = '';
        try { main.runPython(code); } catch (x) { err = CC.pyerr.short(String((x && x.message) || x)); }
        return cb(main.runPython('sys.stdout.getvalue()'), err);
      }
      if (!w) return;
      var id = ++seq;
      var timer = setTimeout(function () {
        pending = null;
        w.terminate();
        boot();                       /* 새 worker 가 준비될 때까지 실행 버튼은 꺼져 있다 */
        cb('', CC.pyerr.TIMEOUT);
      }, 5000);
      pending = { id: id, cb: cb, timer: timer };
      pyodideReady = false;           /* 실행 중에는 화면을 오가도 버튼이 다시 켜지지 않는다 */
      if ($('#run-code')) $('#run-code').disabled = true;
      w.postMessage({ id: id, code: code });
    }

    boot();
    return { run: run };
  })();

  function renderCodeStep() {
    /* 설계도 표시 */
    if ($('#design-define')) $('#design-define').textContent = '성공: ' + state.defineChoice;
    if ($('#design-steps')) {
      $('#design-steps').innerHTML = picked().map(function (c, i) {
        return '<div>' + (i + 1) + '. ' + esc(CC.cards.text(c)) + '</div>';
      }).join('');
    }

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
      if ($('#code-data-preview')) $('#code-data-preview').textContent = 'data = "' + M.inputs[0].v + '"';
      fresh.addEventListener('change', function () {
        if ($('#code-data-preview')) $('#code-data-preview').textContent = 'data = "' + this.value + '"';
        var editor = $('#code-editor');
        if (editor) {
          var line = 'data = ' + JSON.stringify(String(this.value));
          var wasSkeleton = editor.value === state.skeleton;
          editor.value = editor.value.replace(/^data = ".*"/m, function () { return line; });
          /* 뼈대 그대로였으면 뼈대도 같이 옮겨, 다음 렌더에서 학생 코드로 오인되지 않게 한다 */
          if (wasSkeleton) state.skeleton = editor.value;
        }
      });
    }

    /* 코드 에디터 — 비었거나 직전 뼈대 그대로일 때만 새 뼈대. 학생이 쓴 코드는 덮어쓰지 않는다 */
    var editor = $('#code-editor');
    if (editor && (!editor.value || editor.value === state.skeleton)) {
      /* JSON 문자열은 보통 문자열에서 그대로 파이썬 문자열이다 — 자료에 " · \\ · 줄바꿈이 있어도 깨지지 않는다 */
      state.skeleton = 'data = ' + JSON.stringify(M ? String(M.inputs[0].v) : '') + '\n# data 에 자료가 들어 있어요.\n' + CC.cards.skeleton(picked());
      editor.value = state.skeleton;
    }

    /* 실행 버튼 */
    if ($('#run-code')) $('#run-code').disabled = !pyodideReady;

    /* 판정/마무리 숨기기 */
    if ($('#code-output')) $('#code-output').hidden = true;
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

  /* 실행 버튼 */
  if ($('#run-code')) {
    $('#run-code').addEventListener('click', function () {
      if (!pyodideReady) return;
      var code = $('#code-editor').value;
      var dataVal = $('#code-data-select') ? $('#code-data-select').value : '';

      /* data 변수를 코드 앞에 주입 */
      /* 학생의 data 줄은 같은 자리에서 바꿔 줄 번호를 지킨다. 없으면 앞에 한 줄을 붙이고 에러 줄 번호에서 1을 뺀다 */
      var dataLine = 'data = "' + dataVal.replace(/"/g, '\\"') + '"';
      var hasData = /^data = ".*"/m.test(code);
      var fullCode = hasData ? code.replace(/^data = ".*"/m, function () { return dataLine; }) : dataLine + '\n' + code;

      py.run(fullCode, function (output, error) {
        if (error && !hasData) error = error.replace(/^(\d+)번째 줄/, function (_, n) { return (n - 1) + '번째 줄'; });
        /* 결과 표시 */
        var resultEl = $('#code-result');
        var outputBox = $('#code-output');
        if (resultEl && outputBox) {
          outputBox.hidden = false;
          if (error) {
            resultEl.textContent = error;
            resultEl.style.color = 'var(--coral)';
          } else {
            resultEl.textContent = output || '출력된 것이 없어요.';
            resultEl.style.color = 'var(--ink)';
          }
        }

        /* 이벤트 기록 */
        rec('s-code', { code: code, dataId: dataVal, output: output, error: error });

        /* 판정 표시 */
        if (!error) {
          var judgeDiv = $('#code-judge');
          if (judgeDiv) {
            judgeDiv.hidden = false;
            if ($('#code-judge-q')) {
              $('#code-judge-q').textContent = '내 성공 조건을 지켰나요?';
            }
            /* 판정 버튼 */
            var btnsDiv = $('#code-judge-btns');
            if (btnsDiv && !btnsDiv.children.length) {
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
                rec('s-code-judge', { verdict: selectedVerdict, basis: ($('#code-basis') || {}).value || '' });
                this.disabled = true; this.textContent = '저장됨';
                btnsDiv.querySelectorAll('.judge-btn').forEach(function (x) { x.disabled = true; });
                if ($('#go-wrap')) { $('#go-wrap').style.display = ''; $('#go-wrap').disabled = false; }
              });
            }
          }
        }
      });
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

    /* 성공 조건 + 방법 요약 */
    var summary = el('div', 'review-summary');
    summary.innerHTML = '<b>성공 조건:</b> ' + esc(state.defineChoice) +
      '<br><b>방법:</b> ' + esc(summarizeMethod());
    review.appendChild(summary);

    /* 자료별 판정 카드 */
    M.inputs.forEach(function (inp) {
      var latestRun = findLatestRun(inp.id, state.methodVer);
      if (!latestRun) return;
      var judge = findJudgeForRun(latestRun._idx);
      if (!judge) return;

      var vClass = judge.verdict === '지켰다' ? 'kept' : judge.verdict === '지키지 못했다' ? 'missed' : 'unsure';
      var vBadge = judge.verdict === '지켰다' ? 'v-kept' : judge.verdict === '지키지 못했다' ? 'v-missed' : 'v-unsure';

      var card = el('div', 'review-card ' + vClass);

      var header = el('div', 'rc-header');
      header.appendChild(el('span', 'rc-name', inp.name));
      var badge = el('span', 'rc-verdict ' + vBadge, judge.verdict);
      header.appendChild(badge);
      card.appendChild(header);

      var detail = el('div', 'rc-detail');
      detail.textContent = inp.v + ' → ' + (latestRun.result.err ? '실행 중단' : latestRun.result.value);
      card.appendChild(detail);

      if (judge.basis) {
        var basis = el('div', 'rc-basis');
        basis.textContent = '"' + judge.basis + '"';
        card.appendChild(basis);
      }

      review.appendChild(card);
    });
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
  var currentClassroomId = null;
  var currentMissionDbId = null;

  function switchTab(panelId) {
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
    document.querySelectorAll('.main-tab').forEach(function (t) { t.classList.remove('active'); });
    var panel = $('#' + panelId);
    if (panel) panel.classList.add('active');
    var tab = document.querySelector('.main-tab[data-panel="' + panelId + '"]');
    if (tab) tab.classList.add('active');
  }

  document.querySelectorAll('.main-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      switchTab(t.dataset.panel);
      if (t.dataset.panel === 'panel-history') renderHistory();
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
      var card = el('div', 'mission-card');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.appendChild(el('div', 'mc-stage', (mData.no || '') + ' · ' + (mData.stage || '')));
      card.appendChild(el('div', 'mc-title', mData.title || ''));
      card.appendChild(el('div', 'mc-brief', mData.brief || ''));

      /* 상태 판단 */
      var statusEl = el('span', 'mc-status st-none', '미시작');
      card.appendChild(statusEl);

      card.addEventListener('click', function () {
        if (!CC.SENTENCE_MISSIONS.some(function (x) { return x.id === mData.id; })) {
          CC.SENTENCE_MISSIONS.push(mData);
        }
        currentMissionDbId = m.id || null;  /* DB id. 기본 미션은 id 없음 */
        if ($('#play-empty')) $('#play-empty').hidden = true;
        loadMission(mData.id);
        switchTab('panel-play');
      });

      grid.appendChild(card);
    });
  }

  /* ── 내 기록 렌더링 (형식 A: 판단 중심) ──────────── */
  function renderHistory() {
    var list = $('#history-list');
    list.innerHTML = '';
    /* 미션이 로드되지 않은 상태(DB에 미션 없음)면 빈 상태 표시 */
    if (!M) { $('#history-empty').hidden = false; return; }
    var events = CC.store ? CC.store.all() : [];
    if (!events.length) { $('#history-empty').hidden = false; return; }
    $('#history-empty').hidden = true;

    var defines = events.filter(function (e) { return e.type === 's-define' || e.type === 's-redefine'; });
    var methods = events.filter(function (e) { return e.type === 's-method' || e.type === 's-remethod'; });
    var runs = events.filter(function (e) { return e.type === 's-run'; });
    var judges = events.filter(function (e) { return e.type === 's-judge'; });
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

    /* 자료별 판정 — dataId별 마지막 run+judge만 표시 */
    var latestByData = {};
    runs.forEach(function (run, i) {
      latestByData[run.dataId] = { run: run, runIdx: i, judge: judges[i] };
    });

    var resultsSection = el('div', 'rc-results');
    Object.keys(latestByData).forEach(function (dataId) {
      var entry = latestByData[dataId];
      var run = entry.run;
      var judge = entry.judge;

      /* 미션 데이터에서 이름과 원본 입력 찾기 */
      var dataName = dataId;
      var dataInput = '';
      if (M && M.inputs) {
        var found = M.inputs.filter(function (inp) { return inp.id === dataId; })[0];
        if (found) { dataName = found.name; dataInput = found.v; }
      }

      var row = el('div', 'rc-result-row');
      var value = run.result && !run.result.err ? run.result.value : '오류';

      if (judge) {
        var vClass = judge.verdict === '지켰다' ? 'kept' : judge.verdict === '지키지 못했다' ? 'missed' : 'unsure';
        var vIcon = judge.verdict === '지켰다' ? '✓' : judge.verdict === '지키지 못했다' ? '✗' : '?';
        row.className = 'rc-result-row ' + vClass;
        row.innerHTML = '<div class="rc-row-top">' +
          '<span class="rc-data-name">' + esc(dataName) + '</span>' +
          '<span class="rc-verdict-icon">' + vIcon + ' ' + esc(judge.verdict) + '</span>' +
          '</div>' +
          (dataInput ? '<div class="rc-data-input">' + esc(dataInput) + '</div>' : '') +
          '<div class="rc-row-result">결과: <b>' + esc(String(value)) + '</b></div>' +
          (judge.basis ? '<div class="rc-basis">"' + esc(judge.basis) + '"</div>' : '');
      } else {
        row.innerHTML = '<span class="rc-data-name">' + esc(dataName) + '</span>' +
          (dataInput ? '<div class="rc-data-input">' + esc(dataInput) + '</div>' : '') +
          '<div class="rc-row-result">결과: <b>' + esc(String(value)) + '</b></div>';
      }
      resultsSection.appendChild(row);
    });
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

  /* ── 인증 연동 ──────────────────────────────────── */
  function initAuth() {
    if (!CC.sb || !CC.sb.active()) {
      /* Supabase 미설정 → 로컬 전용 모드: 탭 숨기고 바로 플레이, 미션바 표시 */
      if ($('#login-link')) $('#login-link').hidden = true;
      if ($('#main-tabs')) $('#main-tabs').hidden = true;
      bar.hidden = false;
      CC.SENTENCE_MISSIONS.forEach(function (m) {
        if (bar.querySelector('[data-id="' + m.id + '"]')) return;
        var b = el('button', 'm-btn');
        b.type = 'button';
        b.dataset.id = m.id;
        b.setAttribute('aria-pressed', m.id === CC.SENTENCE_MISSIONS[0].id ? 'true' : 'false');
        b.appendChild(el('span', 'm-no', '미션 ' + m.no + ' · ' + m.stage));
        b.appendChild(el('span', 'm-title', m.title));
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
        if (!rooms.length) {
          console.warn('[CC] 교실 없음');
          switchTab('panel-missions');
          return;
        }
        currentClassroomId = rooms[0].id;

        /* 상단에 교실 이름 표시 */
        if ($('#classroom-name')) {
          $('#classroom-name').textContent = rooms[0].name;
          $('#classroom-name').hidden = false;
        }

        CC.sb.getMissions(currentClassroomId).then(function (missions) {
          console.log('[CC] getMissions:', missions.length, '개');
          renderMissionGrid(missions);
          switchTab('panel-missions');
        });
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
