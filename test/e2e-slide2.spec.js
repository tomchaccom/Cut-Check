/* test/e2e-slide2.spec.js — 발표 슬라이드(/slide2) 구성: 철학 → 이름 → 신호 셋 → 핵심 플로우 → 시연
 * 설문은 slide2-data.js 의 signal · show 로만 켜고 끈다. 시연 장의 넘김 버튼은 학생 칸을 가리지 않는다.
 *   npx playwright test test/e2e-slide2.spec.js */
const { test, expect } = require('@playwright/test');
const BASE = process.env.CC_BASE || 'http://localhost:8123';

const blank = r => r.fulfill({ contentType: 'text/html', body: '<body></body>' });

test('장 순서 — 철학으로 시작해 시연까지, 신호는 셋', async ({ page }) => {
  await page.route('**/auth.html', blank);
  await page.goto(BASE + '/slide2.html');
  const labels = await page.$$eval('#stage > .slide', s => s.map(x => x.getAttribute('aria-label')));
  expect(labels).toEqual(['표지', '설계 철학', '이름', '설문 — 필요하다는 신호', '핵심 플로우', '레벨 테스트', 'AI 문제 생성',
    '나침반 방향별 의미', '바늘이 정해지는 순서', '시연', '마무리']);
  expect(await page.$$eval('#signals .sn b', b => b.map(x => x.textContent))).toEqual(['5', '4', '4']);
  expect(await page.$$eval('#checks li', l => l.length)).toBe(12);
  expect(await page.$$eval('#checks .ai', l => l.length)).toBe(4);
});

test('show: true 인 문항만 신호 장 뒤에 한 장씩 생긴다', async ({ page }) => {
  await page.route('**/auth.html', blank);
  await page.route('**/slide2-data.js', async r => {
    const body = (await (await r.fetch()).text()).replace(/(id: 'plan'[^\n]*?)show: false/, '$1show: true');
    r.fulfill({ contentType: 'text/javascript', body });
  });
  await page.goto(BASE + '/slide2.html');
  const labels = await page.$$eval('#stage > .slide', s => s.map(x => x.getAttribute('aria-label')));
  expect(labels.length).toBe(12);
  expect(labels[4]).toBe('설문 1');
});

test('바늘 장은 다섯 단계로 넘어간다', async ({ page }) => {
  await page.route('**/auth.html', blank);
  await page.goto(BASE + '/slide2.html#9');
  for (let k = 1; k <= 5; k++) {
    await expect(page.locator('.vstep.on h3')).toContainText(k + '.');
    await page.keyboard.press('ArrowRight');
  }
  await expect(page.locator('#demo')).toBeVisible();
});

for (const vp of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
  test(`시연 장 — 넘김 버튼이 두 칸을 가리지 않는다 ${vp.width}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.route('**/auth.html', blank);
    await page.goto(BASE + '/slide2.html#10');
    const nav = await page.locator('.nav').boundingBox();
    for (const id of ['#pane-s', '#pane-t']) {
      const p = await page.locator(id).boundingBox();
      const overlap = nav.x < p.x + p.width && nav.x + nav.width > p.x && nav.y < p.y + p.height && nav.y + nav.height > p.y;
      expect(overlap).toBe(false);
    }
    await page.keyboard.press('b');
    await expect(page.locator('#demo')).toHaveClass(/backup/);
  });
}
