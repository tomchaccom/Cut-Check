/* Cut & Check — AI 튜터 모달
 *
 * 설계도를 낸 뒤 코드 단계에서만 보인다. 미션·설계·마지막 실행·직전 3턴을 서버에 넘기고,
 * 서버가 답/되묻기/거절을 정한다 (api/tutor.py). 막힌 이유(reasons)는 화면에 띄우지 않고 기록만 한다.
 * 질문과 답은 그대로 기록되어 교사 화면에 올라간다 — 학생 자유 입력이므로.
 * 서버가 없으면 모달은 열리고 "쓸 수 없어요"만 말한다. 수업 흐름은 막지 않는다.
 */
(function (CC) {
  'use strict';

  var UNAVAILABLE = '지금은 튜터를 쓸 수 없어요.';
  var opt = null;
  var history = [];   /* 같은 미션 동안의 {q, a}. 서버는 앞 3개만 받으므로 뒤 3개를 보낸다 */

  function $(s) { return document.querySelector(s); }
  function bubble(cls, text) {
    var d = document.createElement('div');
    d.className = 'tutor-msg ' + cls;
    d.textContent = text;
    $('#tutor-log').appendChild(d);
    $('#tutor-log').scrollTop = $('#tutor-log').scrollHeight;
  }

  function send(e) {
    e.preventDefault();
    var q = $('#tutor-q').value.trim();
    if (!q || !opt) return;
    $('#tutor-q').value = '';
    $('#tutor-send').disabled = true;
    bubble('me', q);
    var ctx = opt.context();
    var sent = history.slice(-3);
    CC.tutorApi({
      question: q, mission: ctx.mission, code: ctx.code, define: ctx.define, design: ctx.design,
      lastOutput: ctx.lastOutput, lastError: ctx.lastError, history: sent
    })
      .catch(function () { return { kind: 'unavailable', answer: UNAVAILABLE, refused: true }; })
      .then(function (r) {
        bubble('ai', r.answer);
        history.push({ q: q, a: r.answer });
        opt.rec(CC.events.T.S_TUTOR, {
          question: q, answer: r.answer, kind: r.kind, refused: !!r.refused, step: ctx.step, code: ctx.code,
          history_len: sent.length, reasons: r.reasons || [], retried: !!r.retried, judged: !!r.judged
        });
        $('#tutor-send').disabled = false;
        $('#tutor-q').focus();
      });
  }

  CC.tutor = {
    init: function (o) {
      opt = o;
      $('#tutor-open').addEventListener('click', function () { $('#tutor').showModal(); $('#tutor-q').focus(); });
      $('#tutor-close').addEventListener('click', function () { $('#tutor').close(); });
      $('#tutor-form').addEventListener('submit', send);
    },
    reset: function () { history = []; },
    visible: function (on) {
      $('#tutor-open').hidden = !on;
      if (!on && $('#tutor').open) $('#tutor').close();
    }
  };
})(window.CC = window.CC || {});
