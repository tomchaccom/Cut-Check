/* test/e2e-flow.spec.js — 핵심 흐름 한 번에
 *
 * 교사 미션 생성 → 학생 해결 → 설계도 → 파이썬 코드 → 완료 → 교사 화면.
 * LLM 은 고정 응답으로 바꾼다 — 테스트가 API 키와 비용에 묶이지 않게.
 * Supabase 는 막아 로컬 모드로 돈다 — 테스트가 실제 교실 DB 에 쓰면 안 된다.
 *
 *   python3 -m http.server 8123
 *   npx playwright test test/e2e-flow.spec.js
 */
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8123';

async function local(ctx) {
  await ctx.route('**/supabase-js@2/**', r => r.abort());
}

/* 교사가 확정한 미션은 localStorage 'cutcheck.generated' 로 학생 화면에 간다 (teacher.html 확정 버튼).
 * 기본 미션 하나를 복제해 같은 경로로 넣는다. */
async function seedMission(page) {
  await page.goto(BASE + '/sentence.html');
  await page.evaluate(() => {
    const m = JSON.parse(JSON.stringify(window.CC.SENTENCE_MISSIONS[0]));
    m.id = 'ai-e2e'; m.no = 'AI'; m.title = '시험용 미션';
    localStorage.setItem('cutcheck.generated', JSON.stringify([m]));
    window.CC.store.clear();
  });
  await page.reload();
}

async function studentToCode(page) {
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#reason-define').fill('모두 세야 하니까');
  await page.locator('#go-method').click();
  for (const s of await page.locator('select.slot:visible').all()) await s.selectOption({ index: 1 });
  await page.locator('#reason-method').fill('보이는 대로');
  await page.locator('#go-run').click();
  await expect(page.locator('#step4')).toHaveClass(/active/);
}

async function waitPython(page) {
  await expect(page.locator('#pyodide-status')).toHaveText('Python 준비 완료', { timeout: 60000 });
}

test('교사 화면에서 초안을 만들 수 있다 (LLM 고정 응답)', async ({ context, page }) => {
  await local(context);
  await page.route('**/api/generate-mission', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(require('./fixtures/mission.json'))
  }));
  await page.goto(BASE + '/teacher.html');
  await page.locator('.main-tab[data-dtab="dtab-missions"]').click();
  const gen = page.locator('#gen-btn');
  if (!(await gen.isVisible())) {
    test.fixme(true, '로컬 모드에서 교사 미션 생성 탭에 들어갈 수 없다 — 교실 선택이 Supabase 를 요구');
  }
  await page.locator('#gen-lesson').fill('리스트와 반복문');
  await page.locator('#gen-key').fill('같은 값이 여러 번 나올 때');
  await gen.click();
  await expect(page.locator('#confirm-mission')).toBeVisible();
});

test('학생 해결 → 설계도 → 코드 → 완료 → 교사 화면', async ({ context, page }) => {
  test.setTimeout(120000);
  await local(context);
  await seedMission(page);
  await studentToCode(page);

  await expect(page.locator('#design-define')).toContainText('성공');
  await waitPython(page);
  await page.locator('#code-editor').fill('data = "a,b,a"\nprint(len(data.split(",")))\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toHaveText('3', { timeout: 10000 });

  await page.locator('#code-judge .judge-btn').first().click();
  await page.locator('#code-basis').fill('세 개가 나와서');
  await page.locator('#code-judge-save').click();
  await page.locator('#go-wrap').click();
  await page.locator('#wrap-text').fill('처음 생각보다 나눌 게 많았다.');
  await page.locator('#finish').click();

  const t = await context.newPage();
  await t.goto(BASE + '/teacher.html');
  await t.getByRole('button', { name: '내 기록 열기' }).click();
  await expect(t.locator('body')).toContainText('코드 실행');
  await expect(t.locator('body')).toContainText('처음 생각보다 나눌 게 많았다.');
});
