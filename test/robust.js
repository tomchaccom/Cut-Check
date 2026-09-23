/* 학생이 쓴 내용이 선생님 화면까지 흐르는 경로의 안전성 검사.
 *
 * 왜 필요한가 — 이 제품에서 학생의 자유 입력(직접 쓴 성공 조건, 마무리 문장,
 * 만든 미션의 업무 요청)은 반드시 교사 화면에 그대로 올라간다.
 * 학교에서 쓰는 물건이고, 한 학생이 옆 반 교사 화면을 건드릴 수 있으면 안 된다.
 *
 *   python3 -m http.server 8123
 *   node test/robust.js
 */
const { chromium } = require('playwright');

/* 브라우저 실행 파일 찾기 — 환경마다 경로가 달라서 한 군데서 처리한다.
 * CC_CHROME 환경변수가 있으면 그걸 쓰고, 없으면 playwright 기본값을 쓴다. */
function launchOpts() {
  const p = process.env.CC_CHROME;
  return p ? { executablePath: p } : {};
}

(async () => {
  const b = await chromium.launch(launchOpts());
  const ctx = await b.newContext({ viewport: { width: 1000, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let alerted = false;
  p.on('dialog', async d => { alerted = true; await d.dismiss(); });

  const EVIL = '<img src=x onerror="window.__pwned=1">';
  const LONG = '가'.repeat(600);

  // 학생이 쓴 내용이 교사 화면으로 흐르는 경로 전부에 넣어본다
  await p.goto('http://localhost:8123/index.html'); await p.waitForTimeout(300);
  await p.evaluate(() => window.CC.store.clear());
  await p.locator('#succ-picks .pick').nth(3).click();           // 직접 쓰기
  await p.locator('#succ-own').fill(EVIL);
  await p.locator('#s1go').click();
  await p.locator('#sep-chips .chip').first().click();
  await p.locator('#why-picks .pick').first().click();
  await p.locator('#s2go').click();
  const lib = p.locator('#lib .lb');
  for (const i of [0,1,3]) await lib.nth(i).click();
  await p.locator('#run').click(); await p.waitForTimeout(300);
  await p.locator('#resultbox .btn.ghost').nth(1).click(); await p.waitForTimeout(200);
  await p.locator('#brk-input').fill(LONG);
  await p.locator('#brk-guess .chip').first().click();
  await p.locator('#brk-run').click(); await p.waitForTimeout(200);
  await p.locator('#wrap-picks .pick').nth(0).click();
  await p.locator('#wrap-input').fill(EVIL);
  await p.locator('#wrap-go').click(); await p.waitForTimeout(200);

  await p.goto('http://localhost:8123/make.html'); await p.waitForTimeout(300);
  await p.locator('#brief').fill(EVIL + ' 정리해주세요');
  await p.locator('#s1go').click();
  await p.locator('#sep').fill(',');
  await p.locator('#in1').fill('가, 나'); await p.locator('#in2').fill('가,나,다'); await p.locator('#in3').fill('가 나');
  await p.locator('#s2go').click();
  const o = p.locator('#opts input');
  await o.nth(0).fill(EVIL); await o.nth(1).fill('정상 조건'); await o.nth(2).fill('또 다른 조건');
  await p.locator('#opts .trap').nth(0).click();
  await p.locator('#s3go').click();
  await p.locator('#s4go').click(); await p.waitForTimeout(200);
  await p.locator('#s5go').click(); await p.waitForTimeout(200);

  const t = await ctx.newPage();
  t.on('pageerror', e => errs.push('T: ' + e.message));
  await t.goto('http://localhost:8123/teacher.html'); await t.waitForTimeout(400);
  await t.locator('#livebar .tbtn').first().click(); await t.waitForTimeout(300);
  const pwned = await t.evaluate(() => !!window.__pwned);
  const imgs = await t.locator('.detail img').count();
  const txt = await t.locator('.detail').textContent();
  console.log('스크립트 실행됨:', pwned ? '✗ 취약' : '✓ 없음');
  console.log('주입된 img 태그:', imgs === 0 ? '✓ 없음' : '✗ ' + imgs + '개');
  console.log('원문이 글자로 보임:', txt.includes('<img') ? '✓ 그대로 표시' : '(확인 필요)');
  const w = await t.evaluate(() => ({ d: document.documentElement.scrollWidth, w: window.innerWidth }));
  console.log('긴 입력 후 가로 스크롤:', w.d > w.w + 1 ? '✗ ' + w.d + '/' + w.w : '✓ 없음');
  console.log('alert 발생:', alerted ? '✗' : '✓ 없음');
  console.log(errs.length ? '✗ JS 에러: ' + errs.join(' | ') : '✓ JS 에러 없음');
  await b.close();
  const failed = pwned || imgs > 0 || alerted || errs.length || (w.d > w.w + 1);
  console.log(failed ? '\n안전성 검사 실패' : '\n안전성 검사 전부 통과');
  process.exit(failed ? 1 : 0);
})();
