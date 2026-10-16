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

/* 카드 화면: 진짜 카드를 순서대로 놓고 세부를 고른다. 시험용 미션은 split-unique-count (sm1 복제) */
async function pickCards(page) {
  for (const label of ['나누기', '겹친 것은 하나만', '개수 세기']) {
    await page.locator('.card-pick', { hasText: label }).click();
  }
  await page.locator('.design-item select').first().selectOption('쉼표');
}

async function studentToCode(page) {
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#reason-define').fill('모두 세야 하니까');
  await page.locator('#go-method').click();
  await pickCards(page);
  await page.locator('#reason-method').fill('보이는 대로');
  await page.locator('#go-run').click();
  await expect(page.locator('#step4')).toHaveClass(/active/);
}

async function waitPython(page) {
  await expect(page.locator('#pyodide-status')).toHaveText('Python 준비 완료', { timeout: 60000 });
}

test('교사 화면에서 초안을 만들 수 있다 (LLM 고정 응답)', async ({ context, page }) => {
  await local(context);
  const fixture = require('./fixtures/mission.json');
  const draft = { ...fixture, guard: { ...(fixture.guard || {}), fallback: [], reasons: {},
    review: { status: 'teacher', reasons: ['세 자료가 같은 이야기인가 — 셋째만 문구예요'], rounds: 3 } } };
  delete draft.method;
  await page.route('**/api/generate-mission', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(draft)
  }));
  await page.goto(BASE + '/teacher.html');
  await page.locator('.main-tab[data-dtab="dtab-missions"]').click();
  const gen = page.locator('#gen-btn');
  await page.locator('#gen-lesson').fill('리스트와 반복문');
  await page.locator('#gen-key').fill('같은 값이 여러 번 나올 때');
  await gen.click();
  await expect(page.locator('#confirm-mission')).toBeVisible();
  await expect(page.locator('#gen-result')).toContainText('검수 필요');
  await expect(page.locator('#gen-result')).toContainText('셋째만 문구예요');
  await expect(page.locator('#gen-result')).toContainText('헷갈리는 카드');
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

test('학생이 설계도를 내면 교사 화면에 알림이 뜬다', async ({ context, page }) => {
  await local(context);
  await seedMission(page);
  const t = await context.newPage();
  await t.goto(BASE + '/teacher.html');
  await expect(t.locator('.toast')).toHaveCount(0);     // 처음 연 때는 조용하다
  await studentToCode(page);
  await expect(t.locator('.toast')).toContainText('설계도를 냈어요.', { timeout: 5000 });
  await expect(t.locator('#alert-list li')).toHaveCount(1);
  await t.reload();
  await expect(t.locator('.toast')).toHaveCount(0);     // 새로고침해도 쏟아지지 않는다
});

test('튜터는 설계도를 낸 뒤 코드 단계에서만 보인다', async ({ context, page }) => {
  await local(context);
  await seedMission(page);
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await expect(page.locator('#tutor-open')).toBeHidden();
  await page.locator('#go-define').click();
  await expect(page.locator('#tutor-open')).toBeHidden();
  await page.locator('.define-card').first().click();
  await page.locator('#go-method').click();
  await expect(page.locator('#tutor-open')).toBeHidden();
  await pickCards(page);
  await page.locator('#go-run').click();
  await expect(page.locator('#tutor-open')).toBeVisible();
  await page.locator('#back-method').click();
  await expect(page.locator('#tutor-open')).toBeHidden();
});

test('튜터: 서버가 없으면 쓸 수 없다고만 말하고, 있으면 답한다', async ({ context, page }) => {
  await local(context);
  await seedMission(page);
  await studentToCode(page);
  await page.locator('#tutor-open').click();
  await page.locator('#tutor-q').fill('split 이 뭐예요?');
  await page.locator('#tutor-send').click();
  await expect(page.locator('.tutor-msg.ai').last()).toHaveText('지금은 튜터를 쓸 수 없어요.');

  await page.route('**/api/tutor', r => r.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ kind: 'syntax', answer: '`"a b".split()` 처럼 쓰면 나눈 목록이 나와요.', refused: false }) }));
  await page.locator('#tutor-q').fill('split 이 뭐예요?');
  await page.locator('#tutor-send').click();
  await expect(page.locator('.tutor-msg.ai').last()).toContainText('나눈 목록');
  const evs = await page.evaluate(() => JSON.parse(localStorage.getItem('cutcheck.log.v1') || '[]'));
  expect(evs.filter(e => e.type === 's-tutor').length).toBe(2);
});

test('무한루프는 5초 뒤 멈추고 화면은 살아 있다', async ({ context, page }) => {
  test.setTimeout(180000);
  await local(context);
  await seedMission(page);
  await studentToCode(page);
  await waitPython(page);
  await page.locator('#code-editor').fill('data = "a"\nwhile True:\n    pass\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#run-code')).toBeDisabled();
  await page.locator('#back-method').click();                          // 그동안에도 화면은 반응한다
  await expect(page.locator('#step3')).toHaveClass(/active/);
  await page.locator('#go-run').click();
  await expect(page.locator('#code-result')).toHaveText('5초 안에 끝나지 않아서 멈췄어요.', { timeout: 10000 });
  await expect(page.locator('#run-code')).toBeDisabled();              // 새 worker 준비 전
  await waitPython(page);
  await page.locator('#code-editor').fill('data = "a"\nprint(1)\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toHaveText('1', { timeout: 10000 });
  const evs = await page.evaluate(() => JSON.parse(localStorage.getItem('cutcheck.log.v1') || '[]'));
  expect(evs.some(e => e.type === 's-code' && e.error === '5초 안에 끝나지 않아서 멈췄어요.')).toBe(true);
});

test('input() 과 에러는 위치와 사실만', async ({ context, page }) => {
  test.setTimeout(120000);
  await local(context);
  await seedMission(page);
  await studentToCode(page);
  await waitPython(page);
  await page.locator('#code-editor').fill('data = "a"\nx = input()\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toContainText('input()을 쓸 수 없어요', { timeout: 10000 });
  await waitPython(page);
  await page.locator('#code-editor').fill('data = "a"\nparts = 1\nprint(pars)\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toHaveText(/^3번째 줄: NameError/, { timeout: 10000 });
  await waitPython(page);
  /* data 줄이 없어도 에디터 기준 줄 번호가 나온다 */
  await page.locator('#code-editor').fill('parts = 1\nprint(pars)\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toHaveText(/^2번째 줄: NameError/, { timeout: 10000 });
});

test('설계 카드가 코드 뼈대가 되고, 쓴 코드는 설계를 고쳐도 남는다', async ({ page }) => {
  await local(page.context());
  await seedMission(page);
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await expect(page.locator('#samples .sample-data')).toHaveCount(2);           // 첫 화면에 자료 2개
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#go-method').click();
  await expect(page.locator('.card-pick')).toHaveCount(4);                      // 진짜 3 + 헷갈리는 1
  await pickCards(page);
  await page.locator('.design-item').nth(2).locator('.card-up').click();        // 개수 세기를 위로
  await expect(page.locator('.design-item').nth(1)).toContainText('개수 세기');
  await page.locator('.design-item').nth(1).locator('.card-down').click();      // 되돌리기
  await page.locator('#go-run').click();
  const code = await page.locator('#code-editor').inputValue();
  expect(code).toContain('# 1. 나누기 (기준: 쉼표)');
  expect(code).toContain('# 3. 개수 세기');
  expect(code).not.toMatch(/split|set\(|len\(/);                                // 함수 이름은 안 준다

  await page.locator('#code-editor').fill('data = "a,b"\nprint(1)\n');
  await page.locator('#back-method').click();
  await page.locator('.design-item').nth(2).locator('.card-remove').click();
  await page.locator('#go-run').click();
  expect(await page.locator('#code-editor').inputValue()).toContain('print(1)'); // 덮어쓰지 않는다

  /* 설계↔코드를 오가도 Tab 리스너는 하나 — 한 번 눌러 공백 4칸 */
  await page.locator('#back-method').click();
  await page.locator('#go-run').click();
  await page.locator('#code-editor').fill('');
  await page.locator('#code-editor').focus();
  await page.keyboard.press('Tab');
  expect(await page.locator('#code-editor').inputValue()).toBe('    ');
});

test('다른 미션으로 바꾸면 앞 미션 코드가 남지 않는다', async ({ page }) => {
  await local(page.context());
  await seedMission(page);
  await studentToCode(page);
  await page.locator('#code-editor').fill('print("앞 미션")');
  await page.locator('.m-btn[data-id="sm2"]').click();
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#go-method').click();
  await pickCards(page);
  await page.locator('#go-run').click();
  expect(await page.locator('#code-editor').inputValue()).not.toContain('앞 미션');
});

/* 내 기록 — 지금 미션의 것만, 코드 단계 결과로 (2026-10-17 학생 계정 검증에서 엉뚱한 값이 보였다) */
async function openHistory(page) {
  await page.evaluate(() => { document.querySelector('#main-tabs').hidden = false; });  // 로컬 모드는 탭을 숨긴다
  await page.locator('.main-tab[data-panel="panel-history"]').click();
}

test('내 기록에는 지금 미션 것만, 코드 실행 결과와 내 판단이 남는다', async ({ page }) => {
  test.setTimeout(120000);
  await local(page.context());
  await seedMission(page);
  await studentToCode(page);
  await waitPython(page);
  await page.locator('#code-editor').fill('data = "a,b,a"\nprint(len(data.split(",")))\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toHaveText('3', { timeout: 10000 });
  await page.locator('#code-judge .judge-btn').first().click();
  await page.locator('#code-basis').fill('세 개가 나와서');
  await page.locator('#code-judge-save').click();
  await page.locator('#go-wrap').click();
  await page.locator('#wrap-text').fill('앞 미션 정리');
  await page.locator('#finish').click();

  await openHistory(page);
  const rec = page.locator('#history-list');
  await expect(rec).toContainText('시험용 미션');
  await expect(rec).toContainText('3');              // 코드 실행 결과
  await expect(rec).toContainText('세 개가 나와서'); // 내 판단의 근거
  await expect(rec).toContainText('앞 미션 정리');

  await page.locator('.main-tab[data-panel="panel-play"]').click();
  await page.locator('.m-btn[data-id="sm2"]').click();
  await page.locator('#go-define').click();
  await page.locator('.define-card').nth(1).click();
  await page.locator('#reason-define').fill('둘째 미션 이유');
  await page.locator('#go-method').click();
  await openHistory(page);
  await expect(rec).not.toContainText('앞 미션 정리');   // 다른 미션 기록이 섞이지 않는다
  await expect(rec).not.toContainText('세 개가 나와서');
});
