/* Cut & Check — 레벨 테스트 화면 (#onboard-view)
 *
 * 한 화면에 한 문항. 객관식은 고르면, 단답형은 쓰고 '다음'을 누르면 다음으로 간다.
 * 맞았는지·결과는 보여 주지 않는다 — 해석은 교사 화면이 core/onboard.js 로 한다.
 * 첫 입장 때는 건너뛸 수 있다(건너뛴 학생은 분포에서 빠진다).
 * 선생님이 대상자로 정한 학생(forced)은 건너뛸 수 없다.
 * 문제지(set: low/mid/high)는 선생님이 고른다. 어느 문제지인지는 화면에 쓰지 않는다 — 기록에만 남긴다.
 */
(function (CC) {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  /* classroomId 교실에 진단 기록을 남기고 done() 을 부른다 */
  function open(classroomId, done, forced, set) {
    if (!Object.prototype.hasOwnProperty.call(CC.onboard.SETS, set)) set = 'mid';
    var Q = CC.onboard.SETS[set];
    var picks = {};
    var i = 0;

    function finish(skipped) {
      var answers = skipped ? [] : Q.map(function (q) { return { q: q.id, pick: picks[q.id] }; });
      CC.sb.pushEvent(classroomId, null, CC.events.make(CC.events.T.S_ONBOARD, { answers: answers, skipped: skipped, set: set }));
      $('#onboard-view').hidden = true;
      done();
    }

    function render() {
      var end = i >= Q.length;
      $('#ob-count').textContent = end ? '' : (i + 1) + ' / ' + Q.length;
      $('#ob-code').hidden = $('#ob-ask').hidden = end;
      $('#ob-done').hidden = !end;
      $('#ob-skip').hidden = forced || i > 0;
      $('#ob-prev').hidden = i === 0;
      var box = $('#ob-options');
      box.innerHTML = '';
      if (end) return;
      var q = Q[i];
      $('#ob-code').textContent = q.code;
      $('#ob-ask').textContent = q.ask;
      if (!q.options) return short(box, q);
      q.options.forEach(function (text, k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn ' + (picks[q.id] === k ? 'primary' : 'secondary');  /* 이전으로 돌아왔을 때 내가 고른 것 */
        b.textContent = text;
        b.addEventListener('click', function () { picks[q.id] = k; i++; render(); });
        box.appendChild(b);
      });
    }

    /* 단답형 — 쓴 글자 그대로 남긴다. '모르겠어요' 는 객관식과 같은 자리에 */
    function short(box, q) {
      var f = document.createElement('input');
      f.type = 'text';
      f.id = 'ob-input';
      f.className = 'basis-input';
      f.placeholder = '내 답을 짧게 적어 주세요';
      f.maxLength = 40;
      f.autocomplete = 'off';
      f.setAttribute('aria-label', '내 답');
      f.value = typeof picks[q.id] === 'string' ? picks[q.id] : '';
      var next = document.createElement('button');
      next.type = 'button';
      next.className = 'btn primary';
      next.textContent = '다음';
      next.disabled = !f.value.trim();
      f.addEventListener('input', function () { next.disabled = !f.value.trim(); });
      function go() { if (!f.value.trim()) return; picks[q.id] = f.value.trim(); i++; render(); }
      next.addEventListener('click', go);
      f.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) go(); });
      var dunno = document.createElement('button');
      dunno.type = 'button';
      dunno.className = 'btn ' + (picks[q.id] === null ? 'primary' : 'secondary');
      dunno.textContent = '모르겠어요';
      dunno.addEventListener('click', function () { picks[q.id] = null; i++; render(); });
      box.appendChild(f);
      box.appendChild(next);
      box.appendChild(dunno);
      f.focus();
    }

    $('#ob-prev').onclick = function () { i--; render(); };
    $('#ob-skip').onclick = function () { finish(true); };
    $('#ob-done').onclick = function () { finish(false); };
    $('#onboard-view').hidden = false;
    render();
  }

  CC.onboardView = { open: open };
})(window.CC = window.CC || {});
