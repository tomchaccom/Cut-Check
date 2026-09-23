/* README 용 화면 갈무리.
 * 테스트가 아니라 문서 만드는 도구지만, 화면을 실제로 조작해서 찍기 때문에
 * 여기 있는 게 깨지면 화면도 깨진 것이다. test/ 에 두는 이유가 그것이다.
 *
 *   python3 -m http.server 8123
 *   CC_CHROME=... node test/shots.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = __dirname + '/../docs/images';
function launchOpts() {
  const p = process.env.CC_CHROME;
  return p ? { executablePath: p } : {};
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(launchOpts());
  const ctx = await b.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const shot = async (sel, name) => {
    await p.locator(sel).screenshot({ path: OUT + '/' + name });
    console.log('  ' + name);
  };

  await p.goto('http://localhost:8123/index.html');
  await p.waitForTimeout(400);
  await p.evaluate(() => window.CC.store.clear());

  // 1. 업무 요청 + 성공 조건 고르기 — 방법은 어디에도 안 적혀 있다
  await shot('#s1', '01-define.png');

  await p.locator('#succ-picks .pick').nth(1).click();
  await p.locator('#s1go').click();
  await p.waitForTimeout(200);

  // 2. 자를 기준과 그 이유
  await shot('#s2', '02-why.png');

  await p.locator('#sep-chips .chip').first().click();
  await p.locator('#why-picks .pick').first().click();
  await p.locator('#s2go').click();
  await p.waitForTimeout(200);

  // 3. 블록 조립
  const lib = p.locator('#lib .lb');
  for (const i of [0, 1, 3]) await lib.nth(i).click();
  await shot('#s3', '03-blocks.png');

  // 4. 세 장을 돌린 결과 — 세 번째가 깨진다. 판정은 학생이 한다
  await p.locator('#run').click();
  await p.waitForTimeout(500);
  await shot('#resultbox', '04-evidence.png');

  // 5. 도움 요청 — 증상을 말해야 열린다
  await p.locator('#helpbtn').click();
  await p.waitForTimeout(300);
  await p.locator('#o-exp .opt').first().click();
  await p.locator('#o-act .opt').first().click();
  await p.waitForTimeout(400);
  await p.locator('#helpdlg .dlg').screenshot({ path: OUT + '/05-symptom.png' });
  console.log('  05-symptom.png');
  await p.keyboard.press('Escape');

  // 6. 선생님 화면
  const t = await ctx.newPage();
  await t.goto('http://localhost:8123/teacher.html');
  await t.waitForTimeout(600);
  await t.screenshot({ path: OUT + '/06-teacher.png' });
  console.log('  06-teacher.png');

  // 7. 졸업 시험
  const m = await ctx.newPage();
  await m.goto('http://localhost:8123/make.html');
  await m.waitForTimeout(400);
  await m.screenshot({ path: OUT + '/07-make.png' });
  console.log('  07-make.png');

  // 8. 철학 한 장
  const ph = await ctx.newPage();
  await ph.goto('http://localhost:8123/philosophy.html');
  await ph.waitForTimeout(400);
  await ph.screenshot({ path: OUT + '/08-philosophy.png' });
  console.log('  08-philosophy.png');

  console.log(errs.length ? '\nJS 에러: ' + errs.join('\n') : '\nJS 에러 없음');
  await b.close();
})();
