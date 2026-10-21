/* Cut & Check — 사용법 안내 (한 번에 한 곳만 밝히는 둘러보기)
 *
 *   CC.tour.start(steps)        지금 바로 보여 준다 ('사용법 보기' 버튼)
 *   CC.tour.auto(key, steps)    이 브라우저에서 key 를 처음 볼 때만 보여 준다
 *   opts.onEnd                  닫힌 뒤 부른다 (열어 둔 탭 되돌리기 등)
 *
 *   steps = [{ key: 'run', title: '실행', text: '…', before: fn? }]
 *
 * 요소는 id 가 아니라 data-tour="key" 로 찾는다 — 화면 배치를 바꿔도 속성만 옮기면 된다.
 * 없거나 숨은 요소의 단계는 건너뛴다. before 는 그 단계 직전에 부른다(탭 열기 등).
 *
 * 안내는 무엇을 하는 곳인지만 말한다. 어떻게 풀지는 말하지 않는다 (CLAUDE.md).
 * 끝나면 DOM 에서 통째로 빠진다 — 안 돌 때는 아무것도 가리지 않는다.
 *
 * 테스트: 자동화 브라우저(navigator.webdriver — Playwright 포함)에서는 auto 가 뜨지 않는다.
 * 그래야 smoke·e2e 가 안내에 가려 멈추지 않는다. 자동 시작 자체를 시험할 때만
 * page.addInitScript(() => { window.__tour = 1; }) 로 켠다 (test/e2e-flow.spec.js).
 */
(function (CC) {
  'use strict';

  var cur = null;

  function find(s) { return document.querySelector('[data-tour="' + s.key + '"]'); }
  function shown(el) { return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; }

  function start(steps, opts) {
    opts = opts || {};
    if (cur) cur();
    /* 시작할 때 한 번 센다 — before 를 실제로 불러 열어 보고 센다. before 가 있다고 일단 넣어 두면
     * 열어도 없는 단계가 나중에 빠지면서 '1 / 5' 다음에 '2 / 2' 가 된다 (교실 목록 화면: 탭이 안 열린다) */
    var list = steps.filter(function (s) { if (s.before) s.before(); return shown(find(s)); })
      .map(function (s) { return { key: s.key, title: s.title, text: s.text, before: s.before }; });
    if (!list.length) return false;
    var back = document.activeElement;
    var i = -1, target = null;

    var root = document.createElement('div');
    root.className = 'tour';
    root.innerHTML = '<div class="tour-hole" aria-hidden="true"></div>' +
      '<div class="tour-box" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">' +
      '<p class="tour-count" id="tour-count"></p>' +
      '<h2 class="tour-title" id="tour-title"></h2>' +
      '<p class="tour-text" id="tour-text"></p>' +
      '<div class="tour-btns">' +
      '<button type="button" class="tour-btn quiet" data-a="skip">건너뛰기</button>' +
      '<button type="button" class="tour-btn" data-a="prev">이전</button>' +
      '<button type="button" class="tour-btn primary" data-a="next">다음</button>' +
      '</div></div>';
    document.body.appendChild(root);
    var hole = root.firstChild, box = root.lastChild;
    var q = function (s) { return root.querySelector(s); };

    function go(dir) {
      for (var j = i + dir; j >= 0 && j < list.length; j += dir) {
        if (list[j].before) list[j].before();
        var el = find(list[j]);
        if (shown(el)) { i = j; target = el; return render(); }
      }
      if (dir > 0) end();
    }

    function render() {
      var k = i, l = list;
      q('#tour-count').textContent = (k + 1) + ' / ' + l.length;
      q('#tour-title').textContent = list[i].title;
      q('#tour-text').textContent = list[i].text;
      q('[data-a="prev"]').hidden = k === 0;
      q('[data-a="next"]').textContent = k === l.length - 1 ? '닫기' : '다음';
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      place();
      q('[data-a="next"]').focus();
    }

    function place() {
      if (!target) return;
      var r = target.getBoundingClientRect(), pad = 6, gap = 12, m = 16;
      var vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var top = Math.max(r.top - pad, 0), left = Math.max(r.left - pad, 0);
      var bottom = Math.min(r.bottom + pad, vh), right = Math.min(r.right + pad, vw);
      hole.style.top = top + 'px';
      hole.style.left = left + 'px';
      hole.style.width = Math.max(right - left, 0) + 'px';
      hole.style.height = Math.max(bottom - top, 0) + 'px';
      var bw = box.offsetWidth, bh = box.offsetHeight;
      var y = bottom + gap + bh <= vh - m ? bottom + gap
        : top - gap - bh >= m ? top - gap - bh
        : vh - bh - m;   /* 위아래 다 모자라면 화면 아래에 겹쳐 둔다 */
      box.style.top = Math.max(y, m) + 'px';
      box.style.left = Math.max(Math.min(left, vw - bw - m), m) + 'px';
    }

    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); end(); return; }
      if (e.key !== 'Tab') return;
      var b = [].filter.call(box.querySelectorAll('button'), function (x) { return !x.hidden; });
      var a = b.indexOf(document.activeElement);
      var n = e.shiftKey ? (a <= 0 ? b.length - 1 : a - 1) : (a === b.length - 1 || a < 0 ? 0 : a + 1);
      e.preventDefault();
      b[n].focus();
    }

    function end() {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('keydown', key, true);
      if (root.parentNode) root.parentNode.removeChild(root);
      cur = null;
      if (back && back.focus && document.contains(back)) back.focus();
      if (opts.onEnd) opts.onEnd();
    }

    root.addEventListener('click', function (e) {
      var a = e.target.closest('[data-a]');
      if (!a) return;
      if (a.dataset.a === 'skip') end();
      else go(a.dataset.a === 'next' ? 1 : -1);
    });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('keydown', key, true);
    cur = end;
    go(1);
    return true;
  }

  function auto(k, steps, opts) {
    if (navigator.webdriver && !window.__tour) return;   /* 테스트 — 위 주석 */
    if (CC.seen.has(k)) return;
    setTimeout(function () { if (!cur && start(steps, opts)) CC.seen.mark(k); }, 0);
  }

  CC.tour = { start: start, auto: auto };
})(window.CC = window.CC || {});
