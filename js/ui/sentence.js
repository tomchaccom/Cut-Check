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

    /* 상태 초기화 — 슬롯을 미션의 sentences에서 동적으로 구성 */
    var initSlots = {};
    M.method.sentences.forEach(function (s) { initSlots[s.slot] = ''; });
    state = {
      defineChoice: '',
      defineReason: '',
      slots: initSlots,
      methodReason: '',
      methodVer: 0,
      defineVer: 0,
      runs: [],
      judges: [],
      allDataDone: false
    };

    /* 화면 1 */
    $('#brief').textContent = M.brief;
    if ($('#situation')) {
      if (M.situation) { $('#situation').textContent = M.situation; $('#situation').hidden = false; }
      else { $('#situation').hidden = true; }
    }
    $('#sample-data').textContent = M.inputs[0].v;
    $('#sample-label').textContent = M.inputs[0].name;
    if ($('#req-from')) $('#req-from').textContent = (M.stage || '') + ' · 업무 요청';

    /* 화면 2: 성공 조건 — 미션의 질문을 문장 틀에 반영 */
    if ($('#define-prefix') && M.define.q) {
      /* defineQ에서 "나는 ~에서 무엇이 나오면" 패턴 추출 */
      var dq = M.define.q;
      var qMatch = dq.match(/^(.*에서)\s/);
      if (qMatch) {
        $('#define-prefix').textContent = '나는 ' + qMatch[1];
      } else {
        $('#define-prefix').textContent = '나는 이 목록에서';
      }
    }

    /* 성공 조건 select 재구성 */
    var defineSelect = $('#slot-define');
    defineSelect.innerHTML = '<option value="">선택하기</option>';
    M.define.options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.v;
      opt.textContent = o.v;
      defineSelect.appendChild(opt);
    });
    defineSelect.value = '';
    $('#reason-define').value = '';
    $('#go-method').disabled = true;

    /* 화면 3: 방법 문장 전체를 미션 템플릿으로 재구성 */
    var methodBox = document.querySelector('.method-sentences');
    if (methodBox) {
      methodBox.innerHTML = '';
      M.method.sentences.forEach(function (sent, i) {
        var parts = sent.template.split('{' + sent.slot + '}');
        var p = el('p', 'sentence-frame');
        p.appendChild(el('span', 'sent-num', String(i + 1)));
        p.appendChild(document.createTextNode(parts[0] || ''));

        var wrap = el('span', 'slot-wrap');
        var sel = document.createElement('select');
        sel.className = 'slot';
        sel.id = 'slot-' + sent.slot;
        sel.setAttribute('aria-label', sent.slot);
        var defOpt = document.createElement('option');
        defOpt.value = ''; defOpt.textContent = '선택하기';
        sel.appendChild(defOpt);
        sent.options.forEach(function (opt) {
          var o = document.createElement('option');
          o.value = opt; o.textContent = opt;
          sel.appendChild(o);
        });
        sel.addEventListener('change', onSlotChange);
        wrap.appendChild(sel);
        p.appendChild(wrap);

        p.appendChild(document.createTextNode(parts[1] || ''));
        methodBox.appendChild(p);
      });
    }

    $('#reason-method').value = '';
    $('#method-summary').hidden = true;
    $('#go-run').disabled = true;

    /* 화면 4·5 초기화 */
    $('#data-runner').innerHTML = '';
    $('#past-runs-list').innerHTML = '';
    $('#past-runs').hidden = true;
    $('#go-wrap').disabled = true;
    if ($('#wrap-review')) $('#wrap-review').innerHTML = '';
    if ($('#wrap-text')) $('#wrap-text').value = '';
    $('#finish').disabled = true;
    $('#finish').textContent = '기록 저장';
    $('#wrap-done').hidden = true;

    showStep(1);
  }

  /* ── 화면 전환 ─────────────────────────────────── */
  function showStep(n) {
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

  function summarizeMethod() {
    if (!M || !M.method) return '';
    var parts = [];
    M.method.sentences.forEach(function (s) {
      var val = state.slots[s.slot];
      if (!val) return;
      parts.push(s.template.replace('{' + s.slot + '}', val));
    });
    return parts.length ? parts.join(' ') : '';
  }

  function checkMethodComplete() {
    if (!M || !M.method) return false;
    return M.method.sentences.every(function (s) { return !!state.slots[s.slot]; });
  }

  function allDataJudged() {
    var ver = state.methodVer;
    for (var i = 0; i < M.inputs.length; i++) {
      var run = findLatestRun(M.inputs[i].id, ver);
      if (!run) return false;
      if (!findJudgeForRun(run._idx)) return false;
    }
    return true;
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
  function onSlotChange() {
    /* 미션의 sentences에서 슬롯을 동적으로 읽는다 */
    if (M && M.method) {
      M.method.sentences.forEach(function (s) {
        var sel = document.getElementById('slot-' + s.slot);
        if (sel) state.slots[s.slot] = sel.value;
      });
    }
    $('#go-run').disabled = !checkMethodComplete();
    var summary = summarizeMethod();
    if (summary) {
      $('#method-summary').hidden = false;
      $('#summary-text').textContent = summary;
    } else {
      $('#method-summary').hidden = true;
    }
  }
  /* 슬롯 이벤트는 loadMission에서 동적 생성 시 등록됨 (line 114) */

  $('#reason-method').addEventListener('input', function () {
    state.methodReason = this.value.trim();
  });

  $('#go-run').addEventListener('click', function () {
    if (!checkMethodComplete()) return;
    var slotsSnapshot = JSON.parse(JSON.stringify(state.slots));
    if (state.methodVer > 0) {
      rec('s-remethod', {
        fromSlots: null,
        toSlots: slotsSnapshot,
        reason: state.methodReason
      });
    } else {
      var methodPayload = { slots: slotsSnapshot, reason: state.methodReason };
      if (M.pipelineId) methodPayload.pipelineId = M.pipelineId;
      rec('s-method', methodPayload);
    }
    state.methodVer++;
    renderRunStep();
    showStep(4);
  });

  $('#back-define').addEventListener('click', function () { showStep(2); });

  /* ── 화면 4 ────────────────────────────────────── */
  function renderRunStep() {
    $('#cfg-define').textContent = state.defineChoice;
    $('#cfg-method').textContent = summarizeMethod();

    var runner = $('#data-runner');
    runner.innerHTML = '';

    M.inputs.forEach(function (inp, idx) {
      var card = el('div', 'data-card');
      card.dataset.dataId = inp.id;
      card.appendChild(el('div', 'data-name', inp.name));
      card.appendChild(el('div', 'data-input', inp.v));

      /* 이전 방법 결과 배너 */
      var oldRun = null;
      for (var i = state.runs.length - 1; i >= 0; i--) {
        if (state.runs[i].dataId === inp.id && state.runs[i].methodVer < state.methodVer) {
          oldRun = state.runs[i]; break;
        }
      }
      if (oldRun) {
        card.appendChild(el('div', 'old-method-banner',
          '이전 방법의 결과: ' + (oldRun.result.err ? '실행 중단' : oldRun.result.value)));
      }

      /* 예상 입력 */
      var predRow = el('div', 'predict-row');
      var predLabel = el('label', null, '실행하기 전에 — 결과가 어떻게 나올 것 같나요?');
      var predInput = el('input');
      predInput.type = 'text';
      predInput.placeholder = '예상한 결과 또는 "아직 모르겠어요"';
      predLabel.appendChild(predInput);
      predRow.appendChild(predLabel);
      card.appendChild(predRow);

      /* 실행 버튼 */
      var runBtn = el('button', 'run-btn', '실행');
      card.appendChild(runBtn);

      /* 결과 영역 */
      var resultArea = el('div');
      card.appendChild(resultArea);

      /* 이미 실행한 기록 복원 */
      var existRun = findLatestRun(inp.id, state.methodVer);
      if (existRun) {
        renderResult(resultArea, existRun, inp, existRun._idx);
        runBtn.textContent = '다시 실행';
      }

      runBtn.addEventListener('click', (function (dataInp, rArea, rBtn, pInput) {
        return function () {
          var predicted = pInput.value.trim() || '아직 모르겠어요';
          rec('s-predict', { dataId: dataInp.id, predicted: predicted });

          var result;
          if (M.pipelineId && CC.pipeline) {
            result = CC.pipeline.run(M.pipelineId, state.slots, M.pipelineParams || {}, dataInp.v);
          } else {
            result = CC.engine.runSentence(state.slots, dataInp.v);
          }
          var runRecord = {
            dataId: dataInp.id,
            predicted: predicted,
            result: { err: result.err, type: result.type, value: result.value, steps: result.steps, msg: result.msg },
            slots: JSON.parse(JSON.stringify(state.slots)),
            defineChoice: state.defineChoice,
            methodVer: state.methodVer,
            defineVer: state.defineVer,
            t: Date.now()
          };
          state.runs.push(runRecord);
          var runIdx = state.runs.length - 1;

          rec('s-run', { dataId: dataInp.id, slots: runRecord.slots, result: runRecord.result });
          renderResult(rArea, runRecord, dataInp, runIdx);
          rBtn.textContent = '다시 실행';
          updateGoWrap();
        };
      })(inp, resultArea, runBtn, predInput));

      runner.appendChild(card);
    });

    updateGoWrap();
  }

  function renderResult(container, runRecord, inp, runIdx) {
    container.innerHTML = '';
    var r = runRecord.result;

    if (r.err) {
      var errDiv = el('div', 'run-result error');
      errDiv.textContent = r.msg || '실행 중 오류가 발생했어요.';
      container.appendChild(errDiv);
    } else {
      var okDiv = el('div', 'run-result ok');

      /* 결과 값 표시 — 타입별 분기 */
      if (r.type === 'pairs' && r.value && typeof r.value === 'object' && !Array.isArray(r.value)) {
        var pairsDiv = el('div', 'result-pairs');
        Object.keys(r.value).forEach(function (k) {
          var row = el('div', 'pair-row');
          row.appendChild(el('span', 'pair-key', k));
          row.appendChild(el('span', 'pair-sep', ' — '));
          row.appendChild(el('span', 'pair-val', String(r.value[k])));
          pairsDiv.appendChild(row);
        });
        okDiv.appendChild(pairsDiv);
      } else if (Array.isArray(r.value)) {
        okDiv.appendChild(el('div', 'result-value', r.value.join(', ')));
      } else {
        okDiv.appendChild(el('div', 'result-value', String(r.value)));
      }

      if (r.steps && r.steps.length) {
        var stepsDiv = el('div', 'result-steps');
        r.steps.forEach(function (s) {
          var line = el('span');
          if (s.label || s.op) {
            /* 파이프라인 형식 */
            var sv = Array.isArray(s.value) ? s.value.join(', ')
              : (s.value && typeof s.value === 'object') ? JSON.stringify(s.value)
              : String(s.value);
            line.textContent = (s.label || s.op) + ' → ' + sv;
          } else if (s.step === '나누기') {
            line.textContent = s.sep + '로 나눔 → ' + (Array.isArray(s.result) ? s.result.join(', ') : s.result);
          } else if (s.step === '중복 처리') {
            line.textContent = s.dedup + ' → ' + (Array.isArray(s.result) ? s.result.join(', ') : s.result);
          } else if (s.step === '출력') {
            line.textContent = s.output + ' → ' + s.result;
          }
          stepsDiv.appendChild(line);
        });
        okDiv.appendChild(stepsDiv);
      }
      container.appendChild(okDiv);
    }

    /* 예상 표시 */
    if (runRecord.predicted) {
      var predDiv = el('div');
      predDiv.style.cssText = 'font-size:13px;color:var(--ink-3);margin-top:8px';
      predDiv.textContent = '예상: ' + runRecord.predicted;
      container.appendChild(predDiv);
    }

    /* 판정 */
    var judgeRow = el('div', 'judge-row');
    var displayValue = r.err ? '실행 중단'
      : (r.type === 'pairs' && typeof r.value === 'object') ? '(묶음 결과)'
      : Array.isArray(r.value) ? r.value.join(', ')
      : r.value;
    judgeRow.appendChild(el('div', 'judge-q',
      '출력은 ' + displayValue + '입니다. 내가 정한 성공 조건을 지켰나요?'));

    var btns = el('div', 'judge-btns');
    var verdicts = ['지켰다', '지키지 못했다', '아직 판단하기 어렵다'];
    var selectedVerdict = '';
    verdicts.forEach(function (v) {
      var b = el('button', 'judge-btn', v);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.dataset.verdict = v;
      btns.appendChild(b);
    });
    judgeRow.appendChild(btns);

    judgeRow.appendChild(el('label', 'basis-label', '입력이나 출력에서 무엇을 보고 그렇게 생각했나요?'));
    var basisInput = el('input', 'basis-input');
    basisInput.type = 'text';
    basisInput.placeholder = '근거를 적어보세요';
    judgeRow.appendChild(basisInput);

    var saveJudge = el('button', 'btn secondary', '판정 저장');
    saveJudge.type = 'button';
    saveJudge.disabled = true;
    saveJudge.style.marginTop = '10px';
    judgeRow.appendChild(saveJudge);

    btns.querySelectorAll('.judge-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        btns.querySelectorAll('.judge-btn').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        selectedVerdict = b.dataset.verdict;
        saveJudge.disabled = false;
      });
    });

    saveJudge.addEventListener('click', function () {
      state.judges.push({ runIdx: runIdx, verdict: selectedVerdict, basis: basisInput.value.trim(), t: Date.now() });
      rec('s-judge', { runId: runIdx, verdict: selectedVerdict, basis: basisInput.value.trim() });
      saveJudge.disabled = true;
      saveJudge.textContent = '저장됨';
      btns.querySelectorAll('.judge-btn').forEach(function (x) { x.disabled = true; });
      basisInput.readOnly = true;
      updateGoWrap();
    });

    /* 기존 판정 복원 */
    var existJudge = findJudgeForRun(runIdx);
    if (existJudge) {
      btns.querySelectorAll('.judge-btn').forEach(function (b) {
        if (b.dataset.verdict === existJudge.verdict) b.setAttribute('aria-pressed', 'true');
        b.disabled = true;
      });
      basisInput.value = existJudge.basis || '';
      basisInput.readOnly = true;
      saveJudge.disabled = true;
      saveJudge.textContent = '저장됨';
    }

    container.appendChild(judgeRow);
  }

  function updateGoWrap() {
    $('#go-wrap').disabled = !allDataJudged();
  }

  /* 방법/성공 조건 수정 */
  $('#back-method').addEventListener('click', function () { showStep(3); });
  $('#back-define2').addEventListener('click', function () { showStep(2); });

  /* 도움 요청 */
  $('#help-btn').addEventListener('click', function () { $('#help-dialog').showModal(); });
  $('#help-send').addEventListener('click', function () {
    rec('s-help', { expected: $('#help-expected').value.trim() || '아직 모르겠어요', stuck: $('#help-stuck').value });
    $('#help-expected').value = '';
    $('#help-stuck').value = '';
  });

  /* 마무리로 */
  $('#go-wrap').addEventListener('click', function () { renderWrapStep(); showStep(5); });

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
      var methText = '';
      if (M && M.method && M.method.sentences) {
        methText = M.method.sentences.map(function (sent) {
          var val = sl[sent.slot] || '';
          return sent.template.replace('{' + sent.slot + '}', val);
        }).join(' ');
      } else {
        methText = (sl.sep || '') + '로 나누고, ' + (sl.dedup || '') + ', ' + (sl.output || '');
      }
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
