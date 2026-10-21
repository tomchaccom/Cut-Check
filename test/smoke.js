/* 화면 × 3폭 × 2테마 연기 테스트.
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
const BASE = process.env.CC_BASE || 'http://localhost:8123';   // 다른 작업 폴더가 8123 을 쓰고 있으면 CC_BASE 로 바꾼다

/* 브라우저 실행 파일 찾기 — 환경마다 경로가 달라서 한 군데서 처리한다.
 * CC_CHROME 환경변수가 있으면 그걸 쓰고, 없으면 playwright 기본값을 쓴다. */
function launchOpts() {
  const p = process.env.CC_CHROME;
  return p ? { executablePath: p } : {};
}

/* index.html 은 landing.html 로 넘기는 리다이렉트뿐이라 landing 을 본다 */
const PAGES = ['landing.html','teacher.html','abstract.html','review.html','make.html','print.html','philosophy.html','sentence.html','admin.html','slide2.html'];
(async () => {
  const b = await chromium.launch(launchOpts());
  let bad = 0;
  for (const w of [400, 900, 1280]) {
    for (const f of PAGES) {
      for (const scheme of ['light','dark']) {
        const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
        /* 실제 교실 DB 에 붙지 않게 로컬 모드로 돌린다 (robust.js 와 같은 이유) */
        await ctx.route('**/supabase-js@*/**', r => r.abort());
        const p = await ctx.newPage();
        const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        await p.goto(BASE + '/' + f);
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
        /* philosophy.html 은 '무엇을 안 만들었는지'를 설명하는 문서라 예외다. slide2.html(발표)도
         * "점수 · 랭킹을 만들지 않는다"를 설명해야 해서 같은 예외. 검사 대상은 학생·교사가 실제로 쓰는 화면이다. */
        const BANNED = /포인트|점수|정답률|랭킹|연속 출석|정답입니다|참 잘했|잘했어|훌륭|대단해|좋아요/;
        const hit = f === 'philosophy.html' || f === 'slide2.html' ? null : o.text.match(BANNED);
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
  console.log(bad ? `\n문제 ${bad}건` : `\n${PAGES.length}개 화면 × 3폭 × 2테마 전부 통과 (JS 에러 · 가로 스크롤 · 금지 단어 없음)`);
  await b.close();
  /* 문제가 있으면 실패로 끝낸다 — 0 으로 끝나던 동안 리다이렉트 이후 깨진 걸 아무도 몰랐다 */
  process.exit(bad ? 1 : 0);
})();
