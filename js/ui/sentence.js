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
    return ev;
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── 미션 바 ───────────────────────────────────── */
  var bar = $('#mission-bar');
  CC.SENTENCE_MISSIONS.forEach(function (m) {
    var b = el('button', 'm-btn');
    b.type = 'button';
    b.dataset.id = m.id;
    b.setAttribute('aria-pressed', 'false');
    b.appendChild(el('span', 'm-no', '미션 ' + m.no + ' · ' + m.stage));
    b.appendChild(el('span', 'm-title', m.title));
    b.addEventListener('click', function () { loadMission(m.id); });
    bar.appendChild(b);
  });

  /* ── 미션 로드 ─────────────────────────────────── */
  function loadMission(id) {
    M = CC.sentenceMission(id);
    if (!M) return;

    /* 미션 바 활성화 */
    bar.querySelectorAll('.m-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.id === id ? 'true' : 'false');
    });

    /* 상태 초기화 */
    state = {
      defineChoice: '',
      defineReason: '',
      slots: { sep: '', dedup: '', output: '' },
      methodReason: '',
      methodVer: 0,
      defineVer: 0,
      runs: [],
      judges: [],
      allDataDone: false
    };

    /* 화면 1 */
    $('#brief').textContent = M.brief;
    $('#sample-data').textContent = M.inputs[0].v;
    $('#sample-label').textContent = M.inputs[0].name;

    /* 화면 2: 성공 조건 select 재구성 */
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

    /* 화면 3: 방법 슬롯 재구성 */
    M.method.sentences.forEach(function (sent) {
      var sel = $('#slot-' + sent.slot);
      sel.innerHTML = '<option value="">선택하기</option>';
      sent.options.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      });
      sel.value = '';
    });

    /* 문장 템플릿 텍스트 갱신 — 슬롯 앞뒤 텍스트만 바꾼다 */
    var sentEls = document.querySelectorAll('.method-sentences .sentence-frame');
    M.method.sentences.forEach(function (sent, i) {
      if (!sentEls[i]) return;
      var parts = sent.template.split('{' + sent.slot + '}');
      /* 기존 구조: sent-num + 텍스트 + slot-wrap + 텍스트 를 유지.
       * childNodes 를 직접 조작해 select 를 보존한다. */
      var nodes = sentEls[i].childNodes;
      var textIdx = 0;
      for (var n = 0; n < nodes.length; n++) {
        if (nodes[n].nodeType === 3) { // text node
          if (textIdx === 0) { nodes[n].textContent = '\n          ' + (parts[0] || ''); }
          else { nodes[n].textContent = (parts[1] || '') + '\n        '; }
          textIdx++;
        }
      }
    });

    $('#reason-method').value = '';
    $('#method-summary').hidden = true;
    $('#go-run').disabled = true;

    /* 화면 4·5 초기화 */
    $('#data-runner').innerHTML = '';
    $('#past-runs-list').innerHTML = '';
    $('#past-runs').hidden = true;
    $('#go-wrap').disabled = true;
    $('#wrap-history').innerHTML = '';
    ['wrap1', 'wrap2', 'wrap3', 'wrap4', 'wrap5'].forEach(function (id) { $('#' + id).value = ''; });
    $('#finish').disabled = true;
    $('#finish').textContent = '수업 기록 마무리';
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
    var s = state.slots;
    if (!s.sep || !s.dedup || !s.output) return '';
    return s.sep + '로 나누고, 같은 이름은 ' + s.dedup + ', ' + s.output + '을 출력한다.';
  }

  function checkMethodComplete() {
    return state.slots.sep && state.slots.dedup && state.slots.output;
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
    state.slots.sep = $('#slot-sep').value;
    state.slots.dedup = $('#slot-dedup').value;
    state.slots.output = $('#slot-output').value;
    $('#go-run').disabled = !checkMethodComplete();
    var summary = summarizeMethod();
    if (summary) {
      $('#method-summary').hidden = false;
      $('#summary-text').textContent = summary;
    } else {
      $('#method-summary').hidden = true;
    }
  }

  $('#slot-sep').addEventListener('change', onSlotChange);
  $('#slot-dedup').addEventListener('change', onSlotChange);
  $('#slot-output').addEventListener('change', onSlotChange);

  $('#reason-method').addEventListener('input', function () {
    state.methodReason = this.value.trim();
  });

  $('#go-run').addEventListener('click', function () {
    if (!checkMethodComplete()) return;
    if (state.methodVer > 0) {
      rec('s-remethod', {
        fromSlots: null,
        toSlots: { sep: state.slots.sep, dedup: state.slots.dedup, output: state.slots.output },
        reason: state.methodReason
      });
    } else {
      rec('s-method', {
        slots: { sep: state.slots.sep, dedup: state.slots.dedup, output: state.slots.output },
        reason: state.methodReason
      });
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

          var result = CC.engine.runSentence(state.slots, dataInp.v);
          var runRecord = {
            dataId: dataInp.id,
            predicted: predicted,
            result: { err: result.err, type: result.type, value: result.value, steps: result.steps, msg: result.msg },
            slots: { sep: state.slots.sep, dedup: state.slots.dedup, output: state.slots.output },
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
      okDiv.appendChild(el('div', 'result-value', String(r.value)));

      if (r.steps && r.steps.length) {
        var stepsDiv = el('div', 'result-steps');
        r.steps.forEach(function (s) {
          var line = el('span');
          if (s.step === '나누기') {
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
    judgeRow.appendChild(el('div', 'judge-q',
      '출력은 ' + (r.err ? '실행 중단' : r.value) + '입니다. 내가 정한 성공 조건을 지켰나요?'));

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

  /* ── 화면 5 ────────────────────────────────────── */
  function renderWrapStep() {
    var hist = $('#wrap-history');
    hist.innerHTML = '';
    hist.appendChild(el('div', null)).innerHTML = '<b>성공 조건:</b> ' + esc(state.defineChoice);
    hist.appendChild(el('div', null)).innerHTML = '<b>방법:</b> ' + esc(summarizeMethod());
    M.inputs.forEach(function (inp) {
      var latestRun = findLatestRun(inp.id, state.methodVer);
      if (!latestRun) return;
      var judge = findJudgeForRun(latestRun._idx);
      var d = el('div');
      d.style.marginTop = '6px';
      d.innerHTML = '<b>' + esc(inp.name) + ':</b> 출력 ' +
        (latestRun.result.err ? '중단' : latestRun.result.value) +
        (judge ? ' · 판정: ' + esc(judge.verdict) : '');
      hist.appendChild(d);
    });
  }

  var wrapFields = ['wrap1', 'wrap2', 'wrap3', 'wrap4', 'wrap5'];
  wrapFields.forEach(function (id) {
    $('#' + id).addEventListener('input', function () {
      var any = wrapFields.some(function (fid) { return $('#' + fid).value.trim().length > 0; });
      $('#finish').disabled = !any;
    });
  });

  $('#finish').addEventListener('click', function () {
    var texts = {};
    wrapFields.forEach(function (id) { texts[id] = $('#' + id).value.trim(); });
    var combined = '처음에는 ' + (texts.wrap1 || '___') + '라고 생각했다. ' +
      '자료 ' + (texts.wrap2 || '___') + '에서 ' + (texts.wrap3 || '___') + '를 보았다. ' +
      '그래서 ' + (texts.wrap4 || '___') + '. ' +
      '아직 확인하지 못한 것은 ' + (texts.wrap5 || '___') + '다.';
    rec('s-wrap', { text: combined });
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

  /* ── 첫 미션 로드 ──────────────────────────────── */
  loadMission(CC.SENTENCE_MISSIONS[0].id);

})(window.CC = window.CC || {});
