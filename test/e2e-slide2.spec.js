/* test/e2e-slide2.spec.js — 발표 슬라이드(/slide2) 구성: 설문조사(표지 → 강사 문항 목록 → 문제 셋 → 학생 문항 목록 → 어려워한 것) → 철학 → 서비스화(그래서 만든 것 → 이름 → 레벨 → 나침반 → 시연 → 마무리)
 * 설문은 slide2-data.js 의 signal · show 로만 켜고 끈다. 시연 장의 넘김 버튼은 학생 칸을 가리지 않는다.
 *   npx playwright test test/e2e-slide2.spec.js */
const { test, expect } = require('@playwright/test');
const BASE = process.env.CC_BASE || 'http://localhost:8123';

const blank = r => r.fulfill({ contentType: 'text/html', body: '<body></body>' });

test('장 순서 — 설문조사 → 철학 → 서비스화, 신호는 셋', async ({ page }) => {
  await page.route('**/auth.html', blank);
  await page.goto(BASE + '/slide2.html');
  const labels = await page.$$eval('#stage > .slide', s => s.map(x => x.getAttribute('aria-label')));
  expect(labels).toEqual(['표지', '강사 설문 — 무엇을 물었나', '강사 설문 — 가장 뾰족한 문제 셋',
    '학생 설문 — 무엇을 물었나', '학생 설문 — 가장 어려워한 것', '설계 철학', '그래서 만든 것', '이름', '레벨 테스트',
    '나침반', '시연', '마무리']);
  // ① 설명 못 함 5 · ② 문제 해석(두 근거 합친 한 칸) 4 · ③ 하드코딩 · 예외 누락 3 — 여러 개 고르기라 둘 중 큰 수
  expect(await page.$$eval('#signals .sn b', b => b.map(x => x.textContent))).toEqual(['5', '4', '3']);
  // 표지는 무엇인지 한 줄, 그래서 만든 것 장은 실제 화면 그림 둘
  await expect(page.locator('.cover .what')).toContainText('파이썬 수업 도구');
  expect(await page.$$eval('.kompas .pics img', l => l.length)).toBe(2);
  // 학생은 두 명 — 한 문항에서 신호 셋, 여러 개 고르기는 합이 아니라 가장 큰 수
  expect(await page.$$eval('#signals-s .sn', b => b.map(x => x.textContent))).toEqual(['2 / 2', '2 / 2', '1 / 2']);
  expect(await page.$$eval('#asides-s > span', l => l.length)).toBe(2);
  // 나침반 — 정적인 한 장: 방향 넷 · 규칙 넷 · 바늘 그림 하나, 단계 넘김 없음
  expect(await page.$$eval('#dirs li', l => l.length)).toBe(4);
  expect(await page.$$eval('#rules li', l => l.length)).toBe(4);
  expect(await page.$$eval('#dial svg', l => l.length)).toBe(1);
});

test('문항 목록은 데이터에서 — 문항을 더하면 목록에도, 신호 문항은 노랑', async ({ page }) => {
  await page.route('**/auth.html', blank);
  await page.goto(BASE + '/slide2.html#2');
  const [n, ns] = await page.evaluate(() => [window.SLIDE2_SURVEY.length, window.SLIDE2_STUDENT.length]);
  expect(await page.$$eval('#qs li', l => l.length)).toBe(n);
  expect(await page.$$eval('#qs li.sig .qn', l => l.map(x => x.textContent))).toEqual(['1', '2', '4']);
  expect(await page.$$eval('#qs-s li', l => l.length)).toBe(ns);
  expect(await page.$$eval('#qs-s li.sig .qn', l => l.map(x => x.textContent))).toEqual(['2']);
  for (const id of ['#qs', '#qs-s']) await expect(page.locator(id)).not.toContainText(/성함|이름|타임스탬프|학년/);
});

test('show: true 인 문항만 신호 장 뒤에 한 장씩 생긴다', async ({ page }) => {
  await page.route('**/auth.html', blank);
  await page.route('**/slide2-data.js', async r => {
    const body = (await (await r.fetch()).text()).replace(/(id: 'plan'[^\n]*?)show: false/, '$1show: true');
    r.fulfill({ contentType: 'text/javascript', body });
  });
  await page.goto(BASE + '/slide2.html');
  const labels = await page.$$eval('#stage > .slide', s => s.map(x => x.getAttribute('aria-label')));
  expect(labels.length).toBe(13);
  expect(labels[3]).toBe('설문 1');
});

test('나침반 장은 한 번에 넘어간다', async ({ page }) => {
  await page.route('**/auth.html', blank);
  await page.goto(BASE + '/slide2.html#10');
  await expect(page.locator('.slide.on')).toHaveAttribute('aria-label', '나침반');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#demo')).toBeVisible();
});

for (const vp of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
  test(`시연 장 — 넘김 버튼이 두 칸을 가리지 않는다 ${vp.width}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.route('**/auth.html', blank);
    await page.goto(BASE + '/slide2.html#11');
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
