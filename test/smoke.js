/* 5개 화면 × 3폭 × 2테마 연기 테스트.
 * JS 에러 / 가로 스크롤 / 금지 단어를 본다.
 *
 * 금지 단어 검사가 이 파일에서 제일 중요하다.
 * 점수·포인트·정답률은 한 번씩 '좋은 아이디어'로 다시 제안되고,
 * 문서에만 적어둔 금지는 반드시 무너진다. 화면에 뜨면 테스트가 깨지게 해둔다.
 * (설계 의도 주석 .note 와 '버린 것' 목록 .foot 은 검사에서 뺀다 —
 *  거기서는 그 단어들을 '안 만든다'고 말하기 위해 쓴다)
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
        const o = await p.evaluate(() => {
          const clone = document.body.cloneNode(true);
          clone.querySelectorAll('.note, .foot, .bannedwrap, [data-lint-ok]').forEach(n => n.remove());
          return {
            d: document.documentElement.scrollWidth,
            w: window.innerWidth,
            text: clone.innerText || ''
          };
        });
        const overflow = o.d > o.w + 1;
        /* philosophy.html 은 '무엇을 안 만들었는지'를 설명하는 문서라 예외다.
         * 검사 대상은 학생·교사가 실제로 쓰는 화면이다. */
        const BANNED = /포인트|점수|정답률|랭킹|연속 출석|정답입니다|참 잘했/;
        const hit = f === 'philosophy.html' ? null : o.text.match(BANNED);
        if (errs.length || overflow || hit) {
          bad++;
          console.log(`✗ ${f} @${w} ${scheme}`
            + (overflow ? ` 가로스크롤 ${o.d}/${o.w}` : '')
            + (hit ? ` 금지 단어 "${hit[0]}"` : '')
            + (errs.length ? ' JS: ' + errs.join('|') : ''));
        }
        await ctx.close();
      }
    }
  }
  console.log(bad ? `\n문제 ${bad}건` : '\n5개 화면 × 3폭 × 2테마 = 30조합 전부 통과 (JS 에러 · 가로 스크롤 · 금지 단어 없음)');
  await b.close();
})();
