/* Cut & Check — 교실 입장 진단 화면 (#onboard-view)
 *
 * 한 화면에 한 문항. 고르면 다음으로 간다. 맞았는지·결과는 보여 주지 않는다 —
 * 해석은 교사 화면이 core/onboard.js 로 한다.
 * 건너뛰기를 막지 않는다. 건너뛴 학생은 분포에서 빠진다.
 */
(function (CC) {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var Q = CC.onboard.QUESTIONS;

  /* classroomId 교실에 진단 기록을 남기고 done() 을 부른다 */
  function open(classroomId, done) {
    var picks = {};
    var i = 0;

    function finish(skipped) {
      var answers = skipped ? [] : Q.map(function (q) { return { q: q.id, pick: picks[q.id] }; });
      CC.sb.pushEvent(classroomId, null, CC.events.make(CC.events.T.S_ONBOARD, { answers: answers, skipped: skipped }));
      $('#onboard-view').hidden = true;
      done();
    }

    function render() {
      var end = i >= Q.length;
      $('#ob-count').textContent = end ? '' : (i + 1) + ' / ' + Q.length;
      $('#ob-code').hidden = $('#ob-ask').hidden = end;
      $('#ob-done').hidden = !end;
      $('#ob-skip').hidden = i > 0;
      $('#ob-prev').hidden = i === 0;
      var box = $('#ob-options');
      box.innerHTML = '';
      if (end) return;
      var q = Q[i];
      $('#ob-code').textContent = q.code;
      $('#ob-ask').textContent = q.ask;
      q.options.forEach(function (text, k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn ' + (picks[q.id] === k ? 'primary' : 'secondary');  /* 이전으로 돌아왔을 때 내가 고른 것 */
        b.textContent = text;
        b.addEventListener('click', function () { picks[q.id] = k; i++; render(); });
        box.appendChild(b);
      });
    }

    $('#ob-prev').onclick = function () { i--; render(); };
    $('#ob-skip').onclick = function () { finish(true); };
    $('#ob-done').onclick = function () { finish(false); };
    $('#onboard-view').hidden = false;
    render();
  }

  CC.onboardView = { open: open };
})(window.CC = window.CC || {});
