/* 5개 화면 × 3폭 × 2테마 연기 테스트.
 * JS 에러와 가로 스크롤만 본다 — 이 둘은 리뷰 전에 절대 있으면 안 되는 것들이다.
 *
 *   python3 -m http.server 8123
 *   node test/smoke.js
 */
const { chromium } = require('playwright');
const PAGES = ['index.html','teacher.html','abstract.html','review.html','philosophy.html'];
(async () => {
  const b = await chromium.launch({ /* 로컬 환경에 맞게 지우거나 바꾸세요 */ });
  let bad = 0;
  for (const w of [400, 900, 1280]) {
    for (const f of PAGES) {
      for (const scheme of ['light','dark']) {
        const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
        const p = await ctx.newPage();
        const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        await p.goto('http://localhost:8123/' + f);
        await p.waitForTimeout(250);
        const o = await p.evaluate(() => ({ d: document.documentElement.scrollWidth, w: window.innerWidth }));
        const overflow = o.d > o.w + 1;
        if (errs.length || overflow) {
          bad++;
          console.log(`✗ ${f} @${w} ${scheme}` + (overflow ? ` 가로스크롤 ${o.d}/${o.w}` : '') + (errs.length ? ' JS: ' + errs.join('|') : ''));
        }
        await ctx.close();
      }
    }
  }
  console.log(bad ? `\n문제 ${bad}건` : '\n5개 화면 × 3폭 × 2테마 = 30조합 전부 통과');
  await b.close();
})();
