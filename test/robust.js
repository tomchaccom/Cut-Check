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
  /* 학생·교사 화면은 Supabase 주소를 품고 있다. 라이브러리를 막아 로컬 모드로 돌린다 —
   * 테스트가 실제 교실 DB 에 쓰면 안 된다. (js/data/supabase.js 가 없으면 로컬로 도는 설계) */
  await ctx.route('**/supabase-js@2/**', r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let alerted = false;
  p.on('dialog', async d => { alerted = true; await d.dismiss(); });

  const EVIL = '<img src=x onerror="window.__pwned=1">';
  const LONG = '가'.repeat(600);

  // 학생이 쓴 내용이 교사 화면으로 흐르는 경로 전부에 넣어본다
  // 학생 화면 (sentence.html) — 판정 근거와 마무리 문장이 교사 화면에 올라간다
  await p.goto('http://localhost:8123/sentence.html'); await p.waitForTimeout(300);
  await p.evaluate(() => window.CC.store.clear());
  await p.locator('#go-define').click();
  await p.locator('.define-card').first().click();
  await p.locator('#reason-define').fill(EVIL);
  await p.locator('#go-method').click();
  for (const label of ['나누기', '겹친 것은 하나만', '개수 세기']) await p.locator('.card-pick', { hasText: label }).click();
  await p.locator('.design-item select').first().selectOption('쉼표');
  await p.locator('#reason-method').fill(EVIL);
  await p.locator('#go-run').click();
  await p.locator('#tutor-open').click();
  await p.locator('#tutor-q').fill(EVIL);
  await p.locator('#tutor-send').click(); await p.waitForTimeout(300);
  await p.locator('#tutor-close').click();
  // 서버 없이는 reasons 가 비므로, 막힌 이유에 스크립트가 든 기록을 직접 넣는다
  await p.evaluate((E) => window.CC.store.push(window.CC.events.make(window.CC.events.T.S_TUTOR, { question: 'q', answer: 'a', kind: 'ask_back', refused: true, step: 4, reasons: [E] })), EVIL);
  await p.waitForFunction(() => document.querySelector('#pyodide-status').textContent === 'Python 준비 완료', null, { timeout: 60000 });
  await p.locator('#run-code').click();
  await p.locator('#code-output').waitFor({ state: 'visible', timeout: 10000 });
  await p.locator('.judge-btn').first().click();
  await p.locator('#code-basis').fill(EVIL);
  await p.locator('#code-judge-save').click();
  await p.locator('#go-wrap').click();
  await p.locator('#wrap-text').fill(EVIL + LONG);
  await p.locator('#finish').click(); await p.waitForTimeout(200);

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
  const tutorShown = txt.includes('튜터에게 물은 것');
  console.log('스크립트 실행됨:', pwned ? '✗ 취약' : '✓ 없음');
  console.log('주입된 img 태그:', imgs === 0 ? '✓ 없음' : '✗ ' + imgs + '개');
  console.log('원문이 글자로 보임:', txt.includes('<img') ? '✓ 그대로 표시' : '(확인 필요)');
  const w = await t.evaluate(() => ({ d: document.documentElement.scrollWidth, w: window.innerWidth }));
  console.log('긴 입력 후 가로 스크롤:', w.d > w.w + 1 ? '✗ ' + w.d + '/' + w.w : '✓ 없음');
  console.log('튜터 질문이 교사 화면에 보임:', tutorShown ? '✓' : '✗ 없음');
  console.log('alert 발생:', alerted ? '✗' : '✓ 없음');
  console.log(errs.length ? '✗ JS 에러: ' + errs.join(' | ') : '✓ JS 에러 없음');
  await b.close();
  const failed = !tutorShown || pwned || imgs > 0 || alerted || errs.length || (w.d > w.w + 1);
  console.log(failed ? '\n안전성 검사 실패' : '\n안전성 검사 전부 통과');
  process.exit(failed ? 1 : 0);
})();
