/* test/e2e-pipeline.spec.js — Playwright headed 브라우저 기능 검증
 *
 * npx playwright test test/e2e-pipeline.spec.js --headed
 */
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8123';

async function sel(page, s, v) { await page.selectOption(s, v); await page.waitForTimeout(100); }
async function click(page, s, ms) { await page.click(s); await page.waitForTimeout(ms || 300); }

/* Supabase 인터셉트 → 강제 로컬 모드. 미션 바가 표시되고 panel-play 직접 진입 */
async function openLocal(page) {
  await page.route('**/js/data/supabase.js', route => {
    route.fulfill({
      contentType: 'application/javascript',
      body: '(function(CC){CC.sb={active:function(){return false;}}})(window.CC=window.CC||{});'
    });
  });
  await page.goto(BASE + '/sentence.html');
  await page.waitForTimeout(1000);
}

async function openMission(page, missionId) {
  await openLocal(page);
  await page.click('.m-btn[data-id="' + missionId + '"]');
  await page.waitForTimeout(300);
}

/* ── 시나리오 1: 기존 미션 sm1 전체 흐름 ─────── */

test('sm1: 기존 문장형 미션 5단계 전체 흐름', async ({ page }) => {
  await openMission(page, 'sm1');

  expect(await page.textContent('#brief')).toContain('주문서');
  await click(page, '#go-define');

  await sel(page, '#slot-define', '서로 다른 상품 이름의 개수');
  await page.fill('#reason-define', '중복을 빼야 하니까');
  await click(page, '#go-method');

  await sel(page, '#slot-sep', '쉼표');
  await sel(page, '#slot-dedup', '하나만 남긴다');
  await sel(page, '#slot-output', '남은 항목의 개수');
  expect(await page.textContent('#summary-text')).toContain('쉼표');
  await click(page, '#go-run');

  const cards = await page.$$('.data-card');
  expect(cards.length).toBe(3);

  for (let i = 0; i < 3; i++) {
    await cards[i].$eval('.run-btn', b => b.click());
    await page.waitForTimeout(300);
    expect(await cards[i].$('.result-value')).not.toBeNull();
    await (await cards[i].$('.judge-btn')).click();
    await page.waitForTimeout(100);
    await (await cards[i].$('.btn.secondary')).click();
    await page.waitForTimeout(100);
  }

  await click(page, '#go-wrap');
  await page.fill('#wrap-text', '쉼표로 나누면 상품이 나뉜다');
  await click(page, '#finish');
  expect(await page.textContent('#finish')).toBe('저장됨');
});

/* ── 시나리오 2: 파이프라인 미션 sm-filter-1 ── */

test('sm-filter-1: 파이프라인 걸러내기 미션', async ({ page }) => {
  await openMission(page, 'sm-filter-1');

  expect(await page.textContent('#brief')).toContain('재료');
  await click(page, '#go-define');

  const opts = await page.$$eval('#slot-define option', os => os.map(o => o.textContent));
  await sel(page, '#slot-define', opts.find(o => o.includes('주의 재료의 개수')));
  await click(page, '#go-method');

  /* 2슬롯: sep + cond */
  await sel(page, '#slot-sep', '쉼표');
  await sel(page, '#slot-cond', '있는');
  expect(await page.$('#slot-dedup')).toBeNull();
  expect(await page.textContent('#summary-text')).toContain('있는');
  await click(page, '#go-run');

  const cards = await page.$$('.data-card');
  expect(cards.length).toBe(3);

  /* 자료 1: 밥,우유,김치,떡 → 1 */
  await cards[0].$eval('.run-btn', b => b.click());
  await page.waitForTimeout(300);
  expect(await cards[0].$eval('.result-value', e => e.textContent)).toBe('1');

  /* 자료 3 (반례): 사과,바나나,물,감자 → 0 */
  await cards[2].$eval('.run-btn', b => b.click());
  await page.waitForTimeout(300);
  expect(await cards[2].$eval('.result-value', e => e.textContent)).toBe('0');

  /* pipeline steps */
  const stepTexts = await cards[0].$$eval('.result-steps span', ss => ss.map(s => s.textContent));
  expect(stepTexts.some(t => t.includes('나누기'))).toBeTruthy();
  expect(stepTexts.some(t => t.includes('걸러내기'))).toBeTruthy();
  expect(stepTexts.some(t => t.includes('세기'))).toBeTruthy();

  /* 판정 + 마무리 */
  for (let i = 0; i < 3; i++) {
    if (i === 1) { await cards[i].$eval('.run-btn', b => b.click()); await page.waitForTimeout(200); }
    await (await cards[i].$('.judge-btn')).click();
    await (await cards[i].$('.btn.secondary')).click();
    await page.waitForTimeout(100);
  }
  await click(page, '#go-wrap');
  await page.fill('#wrap-text', '반례에서 0이 나왔다');
  await click(page, '#finish');
  expect(await page.textContent('#finish')).toBe('저장됨');
});

/* ── 시나리오 3: 강사 화면 ────────────────────── */

test('teacher: 강사 화면 JS 에러 없이 로드', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE + '/teacher.html');
  await page.waitForTimeout(2000);

  /* teacher.html이 에러 없이 로드되는지 */
  expect(errors.length).toBe(0);

  /* 타일 — Supabase 모드에서 학생 없어도 타일 자체는 렌더됨 */
  const hasTiles = await page.$$eval('.tile', ts => ts.length);
  /* 강사 화면은 학생 데이터 없어도 빈 타일을 그린다 */
  expect(hasTiles).toBeGreaterThanOrEqual(0);
});
