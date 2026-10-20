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

const BASE = process.env.CC_BASE || 'http://localhost:8123';   // 다른 작업 폴더가 8123 을 쓰고 있으면 CC_BASE 로 바꾼다

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
  await expect(page.locator('#gen-result')).toContainText('없어도 되는 카드');
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

test('강사 홈 — 학생은 가나다순 폴더, 말 걸 순간은 사실만', async ({ context, page }) => {
  test.setTimeout(120000);
  await local(context);
  await seedMission(page);
  const t = await context.newPage();
  await t.goto(BASE + '/teacher.html');            // 먼저 열어 둔다 — 알림은 연 뒤에 생긴 제출만 뜬다
  await studentToCode(page);                       // 설계도를 낸다
  const names = await t.locator('.student-tile .name').allInnerTexts();
  expect(names.length).toBeGreaterThan(0);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ko')));   // 가나다순만
  await expect(t.locator('#moments')).toContainText('설계도를 냈어요', { timeout: 5000 });
  await expect(t.locator('#moments')).not.toContainText(/잘했|훌륭|칭찬/);
  await expect(t.locator('details.more')).toBeAttached();                       // 분석 패널은 접혀서 남는다
});

test('학생 서랍 — 스스로 판단은 판단마다 근거가 남는다', async ({ context, page }) => {
  await local(context);
  await page.goto(BASE + '/sentence.html');
  await page.evaluate(() => {
    const now = Date.now();
    localStorage.setItem('cutcheck.log.v1', JSON.stringify([
      { v: 1, type: 's-code-judge', verdict: '지키지 못했다', basis: '첫 근거 6이 나와서', t: now - 60000, mid: 'sm1' },
      { v: 1, type: 's-code-judge', verdict: '지켰다', basis: '둘째 근거 겹친 걸 뺐다', t: now, mid: 'sm1' }
    ]));
  });
  await page.goto(BASE + '/teacher.html');
  await page.getByRole('button', { name: '내 기록 열기' }).click();
  const d = page.locator('#detail');
  await expect(d).toContainText('첫 근거 6이 나와서');
  await expect(d).toContainText('둘째 근거 겹친 걸 뺐다');
  await expect(d).toContainText('스스로 깨뜨림');
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

/* 튜터 대화창 — 보통 채팅처럼. 미션마다 대화가 하나, 기록은 s-tutor 이벤트에서 다시 그린다 */
async function mockTutor(page, calls) {
  await page.route('**/api/tutor', r => {
    const body = r.request().postDataJSON();
    calls.push(body);
    return r.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ kind: 'ask_back', answer: '답: ' + body.question + '?', refused: false }) });
  });
}

/* 두 번째 미션 — 시험용 미션을 하나 더 복제해 같은 경로로 넣는다 */
async function seedTwoMissions(page) {
  await page.goto(BASE + '/sentence.html');
  await page.evaluate(() => {
    const a = JSON.parse(JSON.stringify(window.CC.SENTENCE_MISSIONS[0]));
    a.id = 'ai-e2e'; a.title = '시험용 미션';
    const b = JSON.parse(JSON.stringify(a)); b.id = 'ai-e2e-b'; b.title = '둘째 미션';
    localStorage.setItem('cutcheck.generated', JSON.stringify([a, b]));
    window.CC.store.clear();
  });
  await page.reload();
}

async function toCode(page, id) {
  await page.locator('.m-btn[data-id="' + id + '"]').click();
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#go-method').click();
  await pickCards(page);
  await page.locator('#go-run').click();
  await expect(page.locator('#tutor-open')).toBeVisible();
}

test('튜터 대화창: 내 말은 오른쪽, 튜터 말은 이름표와 왼쪽 — Enter 로 보내고 Shift+Enter 는 줄바꿈', async ({ context, page }) => {
  await local(context);
  const calls = [];
  await mockTutor(page, calls);
  await seedMission(page);
  await studentToCode(page);
  await page.locator('#tutor-open').click();
  await expect(page.locator('#tutor-q')).toBeFocused();
  await page.locator('#tutor-q').type('첫 줄');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('둘째 줄');
  expect(calls.length).toBe(0);
  await expect(page.locator('#tutor-q')).toHaveValue('첫 줄\n둘째 줄');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tutor-msg.ai')).toHaveText(['답: 첫 줄\n둘째 줄?']);
  await expect(page.locator('#tutor-q')).toHaveValue('');
  await expect(page.locator('#tutor-live')).toHaveText('답: 첫 줄\n둘째 줄?');

  // 순서: 나 → 튜터. 튜터 쪽에만 보이는 이름표. 되묻기라도 꼬리표 없이 그냥 튜터의 말
  const rows = page.locator('#tutor-log .tutor-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveClass(/me/);
  await expect(rows.nth(1)).toHaveClass(/ai/);
  await expect(rows.nth(1).locator('.tutor-who')).toHaveText('튜터');
  await expect(page.locator('#tutor')).not.toContainText('되물었어요');
  const box = await page.locator('#tutor-log').boundingBox();
  const me = await page.locator('.tutor-msg.me').boundingBox();
  const ai = await page.locator('.tutor-msg.ai').boundingBox();
  expect(me.x + me.width).toBeGreaterThan(box.x + box.width - 40);   // 오른쪽에 붙는다
  expect(ai.x).toBeLessThan(box.x + 40);                               // 왼쪽에 붙는다
  expect(me.y).toBeLessThan(ai.y);
});

test('튜터 대화창: 기다리는 동안 답을 쓰는 중이라고 보인다', async ({ context, page }) => {
  await local(context);
  let release;
  const gate = new Promise(r => { release = r; });
  await page.route('**/api/tutor', async r => { await gate;
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ kind: 'syntax', answer: '나눠요.', refused: false }) }); });
  await seedMission(page);
  await studentToCode(page);
  await page.locator('#tutor-open').click();
  await page.locator('#tutor-q').fill('split?');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tutor-row.typing')).toHaveText(/답을 쓰는 중이에요/);
  await expect(page.locator('#tutor-send')).toBeDisabled();
  release();
  await expect(page.locator('.tutor-row.typing')).toHaveCount(0);
  await expect(page.locator('.tutor-msg.ai')).toHaveText(['나눠요.']);
});

test('튜터 대화창: 미션마다 대화가 따로고, 새로고침해도 다시 열린다', async ({ context, page }) => {
  await local(context);
  const calls = [];
  await mockTutor(page, calls);
  await seedTwoMissions(page);
  await toCode(page, 'ai-e2e');
  await page.locator('#tutor-open').click();
  for (const q of ['A1', 'A2', 'A3', 'A4']) {
    await page.locator('#tutor-q').fill(q);
    await page.keyboard.press('Enter');
    await expect(page.locator('.tutor-msg.ai').last()).toHaveText('답: ' + q + '?');
  }
  await page.locator('#tutor-close').click();

  // B 미션 — A 의 말은 보이지 않고, 서버에 가는 이전 대화도 B 것만
  await toCode(page, 'ai-e2e-b');
  await page.locator('#tutor-open').click();
  await expect(page.locator('#tutor-log .tutor-row')).toHaveCount(0);
  await page.locator('#tutor-q').fill('B1');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tutor-msg.ai')).toHaveText(['답: B1?']);
  expect(calls[calls.length - 1].history).toEqual([]);
  await page.locator('#tutor-close').click();

  // 새로고침 뒤 A 를 다시 열면 A 의 대화가 그대로, 서버에는 A 의 마지막 3턴
  await page.reload();
  await toCode(page, 'ai-e2e');
  await page.locator('#tutor-open').click();
  await expect(page.locator('.tutor-msg.me')).toHaveText(['A1', 'A2', 'A3', 'A4']);
  await expect(page.locator('#tutor-log')).not.toContainText('B1');
  await page.locator('#tutor-q').fill('A5');
  await page.keyboard.press('Enter');
  await expect(page.locator('.tutor-msg.ai').last()).toHaveText('답: A5?');
  expect(calls[calls.length - 1].history.map(h => h.q)).toEqual(['A2', 'A3', 'A4']);

  // 지난 대화 — 이야기한 미션 목록, 고르면 읽기만 하는 대화
  await page.locator('#tutor-past').click();
  await expect(page.locator('#tutor-form')).toBeHidden();
  await expect(page.locator('.tutor-past-item')).toHaveText(['시험용 미션', '둘째 미션']);
  await page.locator('.tutor-past-item', { hasText: '둘째 미션' }).click();
  await expect(page.locator('#tutor-title')).toHaveText('둘째 미션');
  await expect(page.locator('.tutor-msg.me')).toHaveText(['B1']);
  await expect(page.locator('#tutor-form')).toBeHidden();
  await page.locator('#tutor-back').click();
  await expect(page.locator('.tutor-past-item')).toHaveCount(2);
  await page.locator('#tutor-back').click();
  await expect(page.locator('#tutor-form')).toBeVisible();
  await expect(page.locator('.tutor-msg.me')).toHaveText(['A1', 'A2', 'A3', 'A4', 'A5']);
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
  await expect(page.locator('#wrap-review')).toContainText('3');              // 정리 화면도 코드 실행 결과로
  await expect(page.locator('#wrap-review')).toContainText('세 개가 나와서');
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

test('자료 3개로 실행 — 같은 코드를 자료마다 돌려 결과를 나란히 보인다', async ({ page }) => {
  test.setTimeout(120000);
  await local(page.context());
  await seedMission(page);
  await studentToCode(page);
  await waitPython(page);
  // sm1 복제: 주문서 01·02 는 3개, 03(반례)은 사과가 겹쳐 서로 다른 건 4개
  await page.locator('#code-editor').fill('data = "x"\nitems = data.split(",")\nprint(len(set(items)))\n');
  await page.locator('#run-all').click();
  const rows = page.locator('#code-table tbody tr');
  await expect(rows).toHaveCount(3, { timeout: 20000 });
  await expect(rows.nth(2).locator('.out')).toHaveText('4');
  await expect(rows.nth(0).locator('.out')).toHaveText('3');
  await expect(rows.nth(1).locator('.out')).toHaveText('3');
  await expect(rows.nth(2)).toContainText('새로 온 자료');
  await expect(page.locator('#code-judge')).toBeVisible();          // 판단은 학생이
  await expect(page.locator('#code-judge')).not.toContainText('정답'); // 시스템은 맞다·틀리다를 말하지 않는다

  await page.locator('#code-editor').fill('print(item)\n');            // 에러도 자료마다 위치와 사실만
  await page.locator('#run-all').click();
  await expect(rows.nth(2).locator('.out')).toContainText('1번째 줄', { timeout: 20000 });
});

test('성공 조건 화면은 받은 요청을 다시 보여 주고 묻는다', async ({ page }) => {
  await local(page.context());
  await seedMission(page);
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await page.locator('#go-define').click();
  await expect(page.locator('#define-brief')).toHaveText('주문서에 상품이 몇 개인지 알려 주세요.');
  await expect(page.locator('#define-q')).toContainText('하나를 골라 주세요.');
});

/* 가짜 Supabase — 로그인한 학생, 교실 둘. js/data/supabase.js 를 이 객체로 바꿔 끼운다 */
const FAKE_SB = `(function(CC){var P=function(v){return Promise.resolve(v)};
var base={no:'AI',type:'sentence',pipelineId:'split-count',stage:'세기',brief:'재료가 모두 몇 개인지 알려 주세요.',define:{q:'어떤 결과가 나오면 성공일까요?',options:[{v:'재료가 모두 몇 개인지 나오면 성공',key:'count'}]},inputs:[{id:'d01',name:'월',v:'a,b'},{id:'d02',name:'화',v:'c,d'},{id:'d03',name:'수',v:'e',counter:true}]};
function m(id,t){var x=JSON.parse(JSON.stringify(base));x.id=id;x.title=t;return x}
CC.sb={active:function(){return true},getProfile:function(){return P({role:'student',name:'태인'})},
myClassrooms:function(){return P(window.__rooms||[{id:'r1',name:'1학년 3반'},{id:'r2',name:'방과후 코딩반'}])},
getMissions:function(rid){return P(rid==='r1'?[{id:'db1',data:m('ai-a','푼 미션')},{id:'db2',data:m('ai-b','하던 미션')},{id:'db3',data:m('ai-c','안 한 미션')}]:[])},
getMyEvents:function(){return P(window.__evs||[{type:'s-onboard',answers:[],skipped:true,_missionDbId:null},{type:'s-define',_missionDbId:'db1'},{type:'s-wrap',text:'끝',_missionDbId:'db1'},{type:'s-define',_missionDbId:'db2'}])},
pushEvent:function(rid,mid,ev){(window.__pushed=window.__pushed||[]).push([rid,mid]);(window.__evs=window.__evs||[]).push(ev);return P(null)},signOut:function(){return P()},getUser:function(){return P({id:'u1'})},onAuthChange:function(){}}
})(window.CC=window.CC||{});`;

async function asStudent(page, rooms) {
  await page.route('**/supabase-js@2/**', r => r.abort());
  await page.route('**/js/data/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE_SB }));
  if (rooms) await page.addInitScript(r => { window.__rooms = r; }, rooms);
  await page.goto(BASE + '/sentence.html');
}

test('학생 홈 — 교실은 폴더, 열면 미션 파일과 내 상태', async ({ page }) => {
  await asStudent(page);
  await expect(page.locator('.room-tile')).toHaveCount(2);
  await expect(page.locator('.room-tile').first()).toContainText('1학년 3반');
  await page.locator('.room-tile').first().click();
  await expect(page.locator('#room-view .crumb')).toContainText('1학년 3반');
  const files = page.locator('.mission-file');
  await expect(files).toHaveCount(3);
  await expect(files.nth(0)).toContainText('완료');
  await expect(files.nth(1)).toContainText('진행 중');
  await page.locator('#room-view .crumb a', { hasText: '내 교실' }).click();
  await expect(page.locator('.room-tile')).toHaveCount(2);
});

test('다른 교실을 둘러보고 돌아와도 기록은 미션을 연 교실로 간다', async ({ page }) => {
  await asStudent(page);
  await page.locator('.room-tile').first().click();                 // r1
  await page.locator('.mission-file').first().click();              // r1 의 db1
  await page.locator('#crumb-play-home').click();                    // 미션 머리의 '내 교실'
  await page.locator('.room-tile').nth(1).click();                  // r2 둘러보기
  await expect(page.locator('#room-title')).toHaveText('방과후 코딩반');
  await page.locator('.main-tab[data-panel="panel-play"]').click();
  await expect(page.locator('#crumb-play-room')).toHaveText('1학년 3반');
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#go-method').click();
  const pushed = await page.evaluate(() => window.__pushed);
  expect(pushed).toEqual([['r1', 'db1']]);
});

test('폰 폭 04 — 튜터 버튼이 결과 표를 덮지 않는다 (어느 스크롤 위치에서도)', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 860 });
  await local(page.context());
  await seedMission(page);
  await studentToCode(page);
  await expect(page.locator('#tutor-open')).toBeVisible();
  // 문서 좌표로 비교한다 — 떠 있는 버튼이면 스크롤에 따라 표 위로 올라오므로 이 비교가 깨진다
  const [btnTop, stepBottom] = await page.evaluate(() => {
    const y = window.scrollY;
    return [document.querySelector('#tutor-open').getBoundingClientRect().top + y,
      document.querySelector('#step4').getBoundingClientRect().bottom + y];
  });
  for (const yy of [0, 400, 100000]) {
    await page.evaluate(v => window.scrollTo(0, v), yy);
    const now = await page.evaluate(() => document.querySelector('#tutor-open').getBoundingClientRect().top + window.scrollY);
    expect(Math.round(now)).toBe(Math.round(btnTop));
  }
  // 버튼은 오른쪽 열 머리에 흐름대로 놓인다 — 결과 표보다 위, 떠 있지 않다
  expect(btnTop).toBeLessThan(stepBottom);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#tutor-open')).position)).toBe('static');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(420);
});

test('교실이 없는 학생 — 선생님께 말하라는 안내만, 스스로 들어가는 문은 없다', async ({ page }) => {
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await asStudent(page, []);
  await expect(page.locator('.room-empty')).toContainText('선생님께');
  await expect(page.locator('.room-join')).toHaveCount(0);
  await expect(page.locator('.room-tile')).toHaveCount(0);
  expect(errs).toEqual([]);
});

test('미션 머리 — 위치 표시, 큰 미션 이름, 단계 탭', async ({ page }) => {
  await local(page.context());
  await seedMission(page);
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await expect(page.locator('#mission-title')).toHaveText('시험용 미션');
  await expect(page.locator('#steps-nav .current')).toContainText('01');
  await page.locator('#go-define').click();
  await expect(page.locator('#steps-nav .current')).toContainText('02');
});

test('설계도 줄은 위에서 아래로, 이름 옆에 ▲▼✕', async ({ page }) => {
  await local(page.context());
  await seedMission(page);
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#go-method').click();
  await pickCards(page);
  const rows = page.locator('.design-item');
  const y = await Promise.all([0, 1, 2].map(i => rows.nth(i).boundingBox().then(b => b.y)));
  expect(y[0] < y[1] && y[1] < y[2]).toBe(true);
  const w = await rows.first().boundingBox();
  expect(w.width).toBeLessThan(560);                 // 줄은 글자 폭만큼
});

/* 2026-10-20 "설계도 디자인이 좀 깨져" — 390 폭에서 긴 카드 이름이면 번호 · 이름 · ▲▼✕ 가
 * 저마다 다른 줄로 흩어졌고, 버튼은 26px 이었다. 한 줄은 같이 다니고, 넘치지 않고, 겹치지 않는다 */
test('설계도 — 390 폭 긴 카드 이름에서도 번호와 버튼이 이름과 같은 줄', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await local(page.context());
  const long = ['쉼표 뒤에 붙은 앞뒤 공백을 하나도 남기지 않고 모두 없애기', '같은 이름이 두 번 이상 나오면 한 번만 남기고 나머지는 지우기', '개수 세기'];
  await page.goto(BASE + '/sentence.html');
  await page.evaluate(long => {
    const m = JSON.parse(JSON.stringify(window.CC.SENTENCE_MISSIONS[0]));
    m.id = 'ai-e2e'; m.cards = long.map(label => ({ label }));
    localStorage.setItem('cutcheck.generated', JSON.stringify([m]));
    window.CC.store.clear();
  }, long);
  await page.reload();
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#go-method').click();
  for (const l of long) await page.locator('.card-pick', { hasText: l }).click();
  const r = await page.evaluate(() => {
    const L = document.querySelector('#design-list');
    const rows = [...L.querySelectorAll('.design-item')].map(li => {
      const box = e => e.getBoundingClientRect();
      const num = box(li.querySelector('.num')), label = box(li.querySelector('.label')), btns = [...li.querySelectorAll('.moves button')].map(box);
      return { top: box(li).top, bottom: box(li).bottom,
        sameLine: btns.every(b => b.top < label.bottom && b.bottom > label.top) && num.top < label.bottom && num.bottom > label.top,
        smallest: Math.min.apply(null, btns.map(b => Math.min(b.width, b.height))) };
    });
    return { page: document.documentElement.scrollWidth - innerWidth, list: L.scrollWidth - L.clientWidth, rows };
  });
  expect(r.page).toBeLessThanOrEqual(0);
  expect(r.list).toBeLessThanOrEqual(0);
  r.rows.forEach((row, i) => {
    expect(row.sameLine).toBe(true);
    expect(row.smallest).toBeGreaterThanOrEqual(44);
    if (i) expect(row.top).toBeGreaterThanOrEqual(r.rows[i - 1].bottom);   // 줄끼리 겹치지 않는다
  });
});

/* 강사 — 교실은 폴더, 명단의 학생은 기록이 없어도 폴더, 교실에서 빼기 (2026-10-17 사람 요청) */
const FAKE_TEACHER = `(function(CC){var P=function(v){return Promise.resolve(v)};
var roster=[{id:'s1',name:'태인',login_id:'m9676u-1'},{id:'s2',name:'가은'},{id:'s3',name:'한결',login_id:'m9676u-2'}];
roster.forEach(function(r){if(window.__due===r.id)r.onboard_due='2026-10-19T00:00:00Z'});
window.__removed=[];window.__created=[];window.__reset=[];
CC.sb={active:function(){return true},
api:function(p,b){return fetch(p,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer fake'},body:JSON.stringify(b)}).then(function(r){return r.json().then(function(j){if(!r.ok){var e=new Error(j.error||'x');e.reasons=j.reasons;e.status=r.status;e.body=j;throw e}return j})})},
getUser:function(){return P({id:'t1'})},getProfile:function(){return P({role:window.__role||'teacher',name:'김선생'})},
createStudent:function(rid,s){if(s.loginId==='taken')return Promise.reject(new Error('이미 있는 아이디예요.'));window.__created.push([rid,s]);roster.push({id:'n'+roster.length,name:s.name,login_id:s.loginId});return P({loginId:s.loginId,password:s.password||'k7mpq2xa'})},
resetStudentPassword:function(rid,lid){window.__reset.push([rid,lid]);return P({loginId:lid,password:'zz88aa44'})},
onAuthChange:function(){},signOut:function(){return P()},createClassroom:function(){return P({})},
myClassrooms:function(){return P([{id:'r1',name:'태인한결',code:'M9676U'},{id:'r2',name:'방과후',code:'AB12CD'}])},
getMissions:function(){return P(window.__missions||[])},saveMission:function(r,m){(window.__saved=window.__saved||[]).push([r,JSON.parse(JSON.stringify(m))]);return P({})},updateMission:function(id){(window.__updated=window.__updated||[]).push(id);return P({})},deleteMission:function(){return P({})},
getClassroomStudents:function(){return P(roster.filter(function(r){return window.__removed.indexOf(r.id)<0}))},
getClassroomEvents:function(){if(window.__evs)return P(window.__evs);if(window.__evHang)return new Promise(function(){});var X=window.__facts?[{type:'s-method',mid:'mx',cards:[{label:'더하기'},{label:'나누기'}],v:1,t:Date.now()},{type:'s-code',mid:'mx',code:'print(3)',dataId:'[1, 2]',output:'3',error:'',v:1,t:Date.now()},{type:'s-code',mid:'mx',code:'print(3)',dataId:'[]',output:'3',error:'',v:1,t:Date.now()},{type:'s-probe',mid:'mx',sig:CC.codemission.sig('print(3)'),outs:[{dataId:'[1, 2]',output:'3',error:''},{dataId:'[]',output:'3',error:''}],uses:['For'],v:1,t:Date.now()}].map(function(e){return {student_id:'s1',created_at:new Date().toISOString(),profiles:{name:'태인'},event:e}}):[];return P(X.concat([{student_id:'s1',created_at:new Date().toISOString(),profiles:{name:'태인'},event:{type:'s-define',choice:'몇 개',v:1,t:Date.now()}},
{student_id:'s1',created_at:new Date().toISOString(),profiles:{name:'태인'},event:{type:'s-onboard',answers:[],skipped:false,v:1,t:Date.now()}}]))},
assignOnboard:function(rid,sid,on){(window.__assigned=window.__assigned||[]).push([rid,sid,on]);roster.forEach(function(r){if(r.id===sid)r.onboard_due=on?new Date(Date.now()+60000).toISOString():null});return P(null)},
removeStudent:function(rid,sid){window.__removed.push(sid);return P({})},
compass:function(a,b){return CC.sb.api('/api/compass',Object.assign({action:a},b))}}
})(window.CC=window.CC||{});`;

test('강사 — 교실 폴더, 기록 없는 학생도 폴더, 교실에서 빼기', async ({ page }) => {
  await page.route('**/supabase-js@2/**', r => r.abort());
  await page.route('**/js/data/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE_TEACHER }));
  await page.goto(BASE + '/teacher.html');
  await expect(page.locator('#classroom-cards .room-tile')).toHaveCount(2);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  const tiles = page.locator('.student-tile');
  await expect(tiles).toHaveCount(3);
  await expect(tiles.filter({ hasText: '가은' })).toContainText('아직 기록이 없어요');
  await expect(tiles.filter({ hasText: '가은' }).locator('.folder')).toHaveClass(/gray/);

  page.once('dialog', d => d.accept());
  await tiles.filter({ hasText: '한결' }).click();
  await page.locator('#detail .roster-remove').click();
  await expect(tiles).toHaveCount(2);
  expect(await page.evaluate(() => window.__removed)).toEqual(['s3']);

  page.once('dialog', d => d.dismiss());                    // 취소하면 아무것도 안 바뀐다
  await page.locator('.main-tab[data-dtab="dtab-invite"]').click();
  await page.locator('.roster-row', { hasText: '가은' }).locator('.roster-remove').click();
  expect(await page.evaluate(() => window.__removed)).toEqual(['s3']);
});

/* 2026-10-19 선생님 피드백 — "학생 정보 화면이 읽기 불편하다 · 비는 화면이 많다".
 * 넓은 화면에서 서랍은 넓게(1200px 넘게) 쓰되 옆으로 넘치지 않고, 먼저 물어볼 것이 기록보다 위에 있다 */
test('강사 — 1440 폭에서 학생 서랍은 넓고 옆으로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.student-tile', { hasText: '태인' }).click();
  const d = page.locator('#detail');
  await expect(d).toBeVisible();
  const box = await d.boundingBox();
  expect(box.width).toBeGreaterThan(1200);
  expect(box.width).toBeLessThanOrEqual(1320);
  const o = await d.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth, page: document.documentElement.scrollWidth - innerWidth }));
  expect(o.sw).toBeLessThanOrEqual(o.cw);
  expect(o.page).toBeLessThanOrEqual(0);
  const ask = await d.locator('.saybox').boundingBox();
  const rows = await d.locator('.d-rows').boundingBox();
  expect(ask.y).toBeLessThan(rows.y);
  const side = await d.locator('.d-side').boundingBox();
  expect(side.x).toBeGreaterThan(rows.x + rows.width - 1);   // 튜터 대화는 기록 옆 단
});

async function asTeacher(page, role) {
  await page.route('**/supabase-js@2/**', r => r.abort());
  await page.route('**/js/data/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE_TEACHER }));
  if (role) await page.addInitScript(r => { window.__role = r; }, role);
  await page.goto(BASE + '/teacher.html');
}

test('강사 — 학생 계정을 만들면 아이디·비밀번호를 한 번 보여 주고 명단에 더한다', async ({ page }) => {
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.main-tab[data-dtab="dtab-invite"]').click();
  await expect(page.locator('#ns-login')).toHaveValue('m9676u-3');        // 교실 코드 + 다음 번호
  await page.locator('#ns-name').fill('나래');
  await page.locator('#ns-login').fill('taken');
  await page.locator('#ns-go').click();
  await expect(page.locator('#ns-msg')).toHaveText('이미 있는 아이디예요.');
  await page.locator('#ns-login').fill('m9676u-3');
  await page.locator('#ns-go').click();
  await expect(page.locator('#ns-result .cred')).toContainText('m9676u-3');
  await expect(page.locator('#ns-result .cred')).toContainText('k7mpq2xa');
  await expect(page.locator('.roster-row', { hasText: '나래' })).toBeVisible();
  await expect(page.locator('#ns-login')).toHaveValue('m9676u-4');
  expect(await page.evaluate(() => window.__created)).toEqual([['r1', { name: '나래', loginId: 'm9676u-3', password: '' }]]);

  page.once('dialog', d => d.accept());
  const row = page.locator('.roster-row', { hasText: '태인' });
  await row.locator('.roster-reset').click();
  await expect(page.locator('#ns-result .cred')).toContainText('zz88aa44');
  await expect(page.locator('.roster-row', { hasText: '가은' }).locator('.roster-reset')).toHaveCount(0);   // 아이디 없는 예전 계정
});

/* 레벨 테스트 대상 지정 — 명단 줄에 상/중/하 또는 대기 (2026-10-19 사람 요청) */
test('강사 — 명단에 레벨이 보이고, 대상자로 지정·풀기', async ({ page }) => {
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.main-tab[data-dtab="dtab-invite"]').click();
  const 태인 = page.locator('.roster-row', { hasText: '태인' });
  const 가은 = page.locator('.roster-row', { hasText: '가은' });
  await expect(태인.locator('.roster-level')).toHaveText('레벨 하');          // 다 비운 답 → 하
  await expect(가은.locator('.roster-level')).toHaveText('레벨 테스트 안 함');
  await 가은.locator('.roster-test').click();
  await expect(가은.locator('.roster-level')).toHaveText('레벨 테스트 대기');
  await expect(가은.locator('.roster-test')).toHaveText('레벨 테스트 지정 풀기');
  await 가은.locator('.roster-test').click();
  await expect(가은.locator('.roster-level')).toHaveText('레벨 테스트 안 함');
  expect(await page.evaluate(() => window.__assigned)).toEqual([['r1', 's2', true], ['r1', 's2', false]]);
  await page.locator('.main-tab[data-dtab="dtab-students"]').click();
  await page.locator('.student-tile', { hasText: '태인' }).click();
  await expect(page.locator('#detail .dsub')).toContainText('레벨 하');
});

test('강사 — 명단을 다시 그려도 입력한 아이디와 새 비밀번호는 남는다', async ({ page }) => {
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.main-tab[data-dtab="dtab-invite"]').click();
  await page.locator('#ns-login').fill('m9676u-qa94113');
  page.once('dialog', d => d.accept());
  await page.locator('.roster-row', { hasText: '가은' }).locator('.roster-remove').click();   // 명단 다시 그리기
  await expect(page.locator('.roster-row')).toHaveCount(2);
  await expect(page.locator('#ns-login')).toHaveValue('m9676u-qa94113');

  page.once('dialog', d => d.accept());
  await page.locator('.roster-row', { hasText: '태인' }).locator('.roster-reset').click();
  await expect(page.locator('#ns-result .cred')).toContainText('zz88aa44');
  page.once('dialog', d => d.accept());
  await page.locator('.roster-row', { hasText: '한결' }).locator('.roster-remove').click();   // 다시 그리기
  await expect(page.locator('.roster-row')).toHaveCount(1);
  await expect(page.locator('#ns-result .cred')).toContainText('zz88aa44');
  await expect(page.locator('#ns-result .cred-note')).toContainText('태인');
});

test('학생 프로필로 선생님 화면을 열면 학생 화면으로 간다', async ({ page }) => {
  await asTeacher(page, 'student');
  await expect(page).toHaveURL(/sentence\.html/);
});

test('로그인 화면 — 역할 고르기도 교실 코드 입력도 없다, 아이디로도 들어온다', async ({ page }) => {
  await page.route('**/supabase-js@2/**', r => r.abort());
  await page.goto(BASE + '/auth.html');
  await expect(page.locator('#signup-role')).toHaveCount(0);
  await expect(page.locator('#join-section')).toHaveCount(0);
  await expect(page.locator('#join-code')).toHaveCount(0);
  await expect(page.locator('#tab-signup')).toHaveText('강사 가입');
  await expect(page.locator('label[for="login-email"]')).toHaveText('이메일 또는 아이디');
  expect(await page.evaluate(() => [CC.sb.loginEmail('Kim-1'), CC.sb.loginEmail('t@school.kr')]))
    .toEqual(['kim-1@students.invalid', 't@school.kr']);
});

test('04 는 설계|코드 두 단이고, 지난 단계 탭으로 돌아갈 수 있다', async ({ context, page }) => {
  await local(context);
  await seedMission(page);
  await studentToCode(page);
  const brief = await page.evaluate(() => window.CC.SENTENCE_MISSIONS[0].brief);
  await expect(page.locator('#step4-brief')).toContainText(brief);
  await expect(page.locator('#design-side li')).toHaveText([/나누기/, /겹친 것은 하나만/, /개수 세기/]);
  await page.locator('#steps-nav button[data-step="2"]').click();
  await expect(page.locator('#step2')).toHaveClass(/active/);
  await expect(page.locator('#steps-nav button[data-step="5"]')).toBeDisabled();
});

test('폰 폭에서는 04 설계가 코드 위에 쌓인다', async ({ context, page }) => {
  await local(context);
  await page.setViewportSize({ width: 420, height: 900 });
  await seedMission(page);
  await studentToCode(page);
  const side = await page.locator('#design-side').boundingBox();
  const code = await page.locator('#code-editor').boundingBox();
  expect(side.y).toBeLessThan(code.y);
});

test('교실 첫 입장 — 레벨 테스트 10문항, 맞고 틀림은 보이지 않고 끝나면 미션이 열린다', async ({ page }) => {
  await page.addInitScript(() => { window.__evs = []; });            // 이 교실에 진단 기록이 없다
  await asStudent(page);
  await page.locator('.room-tile').first().click();
  const ob = page.locator('#onboard-view');
  await expect(ob).toBeVisible();
  await expect(page.locator('#room-view')).toBeHidden();             // 미션 목록은 진단이 끝난 뒤에
  await expect(page.locator('#ob-skip')).toBeVisible();
  for (let i = 0; i < 10; i++) {
    await expect(page.locator('#ob-count')).toHaveText((i + 1) + ' / 10');
    await expect(page.locator('#ob-options button').last()).toHaveText('모르겠어요');
    if (i === 1) {                                                   // 이전으로 돌아가도 된다
      await page.locator('#ob-prev').click();
      await expect(page.locator('#ob-count')).toHaveText('1 / 10');
      await expect(page.locator('#ob-options .btn.primary')).toHaveCount(1);   // 내가 고른 것이 남아 있다
      await page.locator('#ob-options button').first().click();
    }
    if (await page.locator('#ob-input').count()) {                   // 단답형 — 비우면 다음으로 못 간다
      await expect(page.locator('#ob-options button', { hasText: '다음' })).toBeDisabled();
      await page.locator('#ob-input').fill('나');
      await page.locator('#ob-input').press('Enter');
    } else await page.locator('#ob-options button').first().click();
  }
  await expect(page.locator('#ob-done')).toHaveText('고마워요. 이제 미션을 볼 수 있어요.');
  await expect(ob).not.toContainText(/맞았|틀렸|정답|오답|레벨|상위|하위/);
  await page.locator('#ob-done').click();
  await expect(ob).toBeHidden();
  await expect(page.locator('.mission-file')).toHaveCount(3);
  const evs = await page.evaluate(() => window.__evs);
  expect(evs.length).toBe(1);
  expect(evs[0].type).toBe('s-onboard');
  expect(evs[0].skipped).toBe(false);
  expect(evs[0].answers.map(a => a.q)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10']);
  expect(evs[0].answers[1].pick).toBe('나');                        // 단답형은 쓴 글자 그대로
  expect(await page.evaluate(() => window.__pushed)).toEqual([['r1', null]]);
  // 다시 열면 진단은 없다. 큰 교실 이름이 '내 교실' 링크를 덮어 마우스 클릭이 h1 에 떨어진다 (기존 배치 문제) — 이벤트로 누른다
  await page.locator('#crumb-home').dispatchEvent('click');
  await page.locator('.room-tile').first().click();
  await expect(page.locator('.mission-file')).toHaveCount(3);
  await expect(ob).toBeHidden();
});

test('선생님이 대상자로 정하면 로그인하자마자 테스트가 뜨고 건너뛸 수 없다', async ({ page }) => {
  // 예전에 건너뛴 기록(_at)은 지정 시각보다 앞선다
  await page.addInitScript(() => { window.__evs = [{ type: 's-onboard', answers: [], skipped: true, _at: '2026-10-01T00:00:00Z' }]; });
  await asStudent(page, [{ id: 'r1', name: '1학년 3반' }, { id: 'r2', name: '방과후 코딩반', onboard_due: '2026-10-19T00:00:00Z' }]);
  await expect(page.locator('#onboard-view')).toBeVisible();          // 교실을 누르지 않아도
  await expect(page.locator('#room-title')).toHaveText('방과후 코딩반');
  await expect(page.locator('#ob-skip')).toBeHidden();
});

test('지정 뒤 이미 테스트를 봤으면 다시 뜨지 않는다', async ({ page }) => {
  await page.addInitScript(() => { window.__evs = [{ type: 's-onboard', answers: [], skipped: false, _at: '2026-10-19T01:00:00Z' }]; });
  await asStudent(page, [{ id: 'r1', name: '1학년 3반', onboard_due: '2026-10-19T00:00:00Z' }]);
  await expect(page.locator('.room-tile')).toHaveCount(1);
  await page.waitForTimeout(300);
  await expect(page.locator('#onboard-view')).toBeHidden();
  await expect(page.locator('#rooms-view')).toBeVisible();
});

test('진단은 건너뛸 수 있다', async ({ page }) => {
  await page.addInitScript(() => { window.__evs = []; });
  await asStudent(page);
  await page.locator('.room-tile').first().click();
  await page.locator('#ob-skip').click();
  await expect(page.locator('#onboard-view')).toBeHidden();
  await expect(page.locator('.mission-file')).toHaveCount(3);
  const evs = await page.evaluate(() => window.__evs);
  expect(evs.map(e => [e.type, e.skipped, e.answers.length])).toEqual([['s-onboard', true, 0]]);
});

test('로컬 모드 — 진단은 뜨지 않고 미션이 바로 열린다', async ({ page }) => {
  await local(page.context());
  await seedMission(page);
  await expect(page.locator('#onboard-view')).toBeHidden();
  await expect(page.locator('.m-btn[data-id="ai-e2e"]')).toBeVisible();
});

/* 골라내기 기준 목록은 숨은 설정이 아니라 자료다 — "민지 시간 vs 준호 시간" 이 학생 눈에 보여야 한다 (2026-10-18) */
test('골라내기 고정 목록이 01 문제·03 카드·04 요청에 보인다', async ({ page }) => {
  await local(page.context());
  await page.goto(BASE + '/sentence.html');
  await page.evaluate(() => {
    const m = JSON.parse(JSON.stringify(window.CC.sentenceMission('sm-filter-1')));
    m.id = 'ai-e2e'; m.no = 'AI'; m.title = '시험용 미션';
    localStorage.setItem('cutcheck.generated', JSON.stringify([m]));
    window.CC.store.clear();
  });
  await page.reload();
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await expect(page.locator('#samples')).toContainText('주의 재료 목록');
  await expect(page.locator('#samples .sample-fixed')).toHaveText('우유,달걀,땅콩');
  await expect(page.locator('#samples .sample-data')).toHaveCount(2);           // 반례는 여전히 숨는다
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#go-method').click();
  await page.locator('.card-pick', { hasText: '골라내기' }).click();
  await expect(page.locator('.design-item .card-list')).toHaveText('우유,달걀,땅콩');
  await page.locator('.card-pick', { hasText: '나누기' }).click();
  await page.locator('.card-pick', { hasText: '개수 세기' }).click();
  for (const s of await page.locator('.design-item select').all()) await s.selectOption({ index: 1 });
  await page.locator('#go-run').click();
  await expect(page.locator('#step4-fixed')).toHaveText('주의 재료 목록: 우유,달걀,땅콩');
});

test('고정 목록이 없는 미션에는 목록 칸이 없다', async ({ page }) => {
  await local(page.context());
  await seedMission(page);
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await expect(page.locator('#samples .sample-fixed')).toHaveCount(0);
});

test('교사 초안에 고정 목록이 보이고 고칠 수 있다', async ({ context, page }) => {
  await local(context);
  const fixture = require('./fixtures/mission.json');
  const draft = { ...fixture, pipelineId: 'split-filter-join', filterDesc: '민지 시간',
    pipelineParams: { filterTarget: ['3시', '4시', '5시'] }, guard: { fallback: [], reasons: {} },
    inputs: [{ id: 'd01', name: '준호 쪽지', v: '4시,5시,6시' }, { id: 'd02', name: '서연 쪽지', v: '2시,3시' },
             { id: 'd03', name: '하린 쪽지', v: '6시 7시', counter: true, axis: 'sep' }] };
  delete draft.method;
  await page.route('**/api/generate-mission', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(draft) }));
  await page.goto(BASE + '/teacher.html');
  await page.locator('.main-tab[data-dtab="dtab-missions"]').click();
  await page.locator('#gen-lesson').fill('집합');
  await page.locator('#gen-key').fill('모두 되는 시간');
  await page.locator('#gen-btn').click();
  await expect(page.locator('#draft-fixed')).toHaveValue('3시,4시,5시');
  await expect(page.locator('#draft-fixed-name')).toHaveValue('민지 시간');
  await expect(page.locator('#gen-result')).toContainText('처음 고정 목록과 첫 자료로 계산했어요');
  /* 목록이 한 자료 안에 통째로 있으면 그 자료의 답이 목록 그대로 — 저장을 막는다 */
  await page.locator('#draft-fixed').fill('4시,5시');
  await page.locator('#confirm-mission').click();
  await expect(page.locator('#draft-fixed-warn')).toContainText('준호 쪽지 안에 통째로');
  await page.locator('#draft-fixed').fill('8시,9시');
  await page.locator('#confirm-mission').click();
  await expect(page.locator('#draft-fixed-warn')).toContainText('하나도 겹치지 않아요');
  expect(await page.evaluate(() => localStorage.getItem('cutcheck.generated'))).toBeNull();
  await page.locator('#draft-fixed').fill('3시, 4시');
  await page.locator('#confirm-mission').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cutcheck.generated')).pop());
  expect(saved.pipelineParams.filterTarget).toEqual(['3시', '4시']);
});

/* 새 꼴(kind:'code') 미션은 자료가 파이썬 리터럴이다. 손으로 만들어 같은 경로(cutcheck.generated)로 넣는다 */
async function seedCodeMission(page, m) {
  await page.goto(BASE + '/sentence.html');
  await page.evaluate((mm) => {
    localStorage.setItem('cutcheck.generated', JSON.stringify([mm]));
    window.CC.store.clear();
  }, m);
  await page.reload();
}

test('새 꼴 미션 — 리터럴 자료로 돌고 반례로 바꾸면 반례로 돈다', async ({ context, page }) => {
  test.setTimeout(120000);
  await local(context);
  await seedCodeMission(page, {
    id: 'ai-code', no: 'AI', type: 'sentence', kind: 'code', concept: 'for', stage: '분해',
    title: '영수증을 합쳐요', brief: '영수증 금액이 모두 얼마인지 알려 주세요.',
    define: { q: '어떤 결과가 나오면 성공일까요?', options: [
      { v: '영수증 금액을 모두 합친 값', key: 'a' },
      { v: '영수증 1의 답과 같은 2300이 나오면 성공', key: 'b', trap: 'hardcode' },
      { v: '오류 없이 끝나면 성공', key: 'c', trap: 'luck' }] },
    inputs: [{ id: 'd01', name: '영수증 1', v: '[1500, 800]' }, { id: 'd02', name: '영수증 2', v: '[300]' },
      { id: 'd03', name: '새 영수증', v: '[]', counter: true, axis: 'empty' }],
    cards: [{ label: '하나씩 꺼내기' }, { label: '모두 더하기' }, { label: '가장 큰 값 찾기', decoy: true }]
  });
  await page.locator('.m-btn[data-id="ai-code"]').click();
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#reason-define').fill('모두 합해야 하니까');
  await page.locator('#go-method').click();
  await expect(page.locator('.card-pick')).toHaveCount(3);
  await page.locator('.card-pick', { hasText: '모두 더하기' }).click();
  await page.locator('#reason-method').fill('보이는 대로');
  await page.locator('#go-run').click();
  await expect(page.locator('#step4')).toHaveClass(/active/);
  expect((await page.locator('#code-editor').inputValue()).split('\n')[0]).toBe('data = [1500, 800]');
  await waitPython(page);
  await page.locator('#code-editor').fill('data = [1500, 800]\nprint(sum(data))\n');
  await page.locator('#code-data-select').selectOption({ label: '새 영수증' });
  expect((await page.locator('#code-editor').inputValue()).split('\n')[0]).toBe('data = []');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toHaveText('0', { timeout: 10000 });
});

test('예전 미션 — 쉼표 자료는 그대로 따옴표로 돈다', async ({ context, page }) => {
  await local(context);
  await seedMission(page);
  await studentToCode(page);
  expect((await page.locator('#code-editor').inputValue()).split('\n')[0]).toBe('data = "사과,바나나,우유"');
});

test('실행기 — 앞 실행이 도는 동안 부른 실행도 차례로 끝난다', async ({ context, page }) => {
  test.setTimeout(60000);
  await local(context);
  await page.goto(BASE + '/sentence.html');
  const r = await page.evaluate(() => new Promise(resolve => {
    let up; const ready = new Promise(r => { up = r; });
    const py = window.CC.pyrun.create((t, ok) => { if (ok) up(); });
    const got = [];
    const done = (k) => (o, e) => { got.push([k, o, e]); if (got.length === 4) resolve({ got, TIMEOUT: window.CC.pyerr.TIMEOUT }); };
    ready.then(() => {
      py.run('print(1)', done('a'));
      py.run('print(2)', done('b'));
      py.run('while True: pass', done('c'));
      py.run('print(3)', done('d'));
    });
  }));
  expect(r.got).toEqual([['a', '1\n', ''], ['b', '2\n', ''], ['c', '', r.TIMEOUT], ['d', '3\n', '']]);
});

/* 서버가 로그인한 강사만 받는다 — 강사 모드의 빠른 생성은 CC.sb.api(토큰을 붙이는 data 층 함수)로 간다 */
test('강사 모드 — 빠른 생성은 CC.sb.api 로 부른다', async ({ page }) => {
  await asTeacher(page);
  const fixture = require('./fixtures/mission.json');
  await page.route('**/api/generate-mission', r => r.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ ...fixture, guard: { fallback: [], reasons: {} } }) }));
  await page.evaluate(() => { const f = CC.sb.api; window.__api = []; CC.sb.api = (p, b) => { window.__api.push(p); return f(p, b); }; });
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.main-tab[data-dtab="dtab-missions"]').click();
  await page.locator('#gen-lesson').fill('리스트와 반복문');
  await page.locator('#gen-key').fill('같은 값이 여러 번 나올 때');
  await page.locator('#gen-btn').click();
  await expect(page.locator('#confirm-mission')).toBeVisible();
  expect(await page.evaluate(() => window.__api)).toEqual(['/api/generate-mission']);
});

/* 단계별 생성 1·2단계 — 개념을 확인하고 예시를 고른다 (서버는 가짜 응답) */
test('강사 단계별 생성 — 개념을 확인하고 예시를 고른다', async ({ page }) => {
  const reqs = [], auth = [];
  let n = 0;
  await page.route('**/api/mission-steps', async r => {
    const b = r.request().postDataJSON();
    reqs.push(b);
    auth.push(r.request().headers()['authorization']);
    if (b.action === 'quota') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ left: 3, disabled: false }) });
    if (b.action === 'concept') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ concept: 'for', label: '반복문 for', by: 'keyword' }) });
    const k = n++ ? 'b' : 'a';
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ examples: [1, 2, 3, 4].map(i => ({ title: `${k}제목${i}`, situation: `${k}상황${i}이에요.`, why: `${k}이유${i}` })) }) });
  });
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.main-tab[data-dtab="dtab-missions"]').click();
  await page.locator('#gen-lesson').fill('리스트와 반복문');
  await page.locator('#gen-key').fill('하나씩 꺼내 보기');
  await page.locator('#sg-concept').click();
  await expect(page.locator('#sg-concept-pick')).toHaveValue('for');
  await expect(page.locator('#sg-concept-pick option')).toHaveCount(8);
  await expect(page.locator('.sg-ex')).toHaveCount(4);
  await expect(page.locator('.sg-ex').first().locator('span')).toHaveText(['a제목1', 'a상황1이에요.', '→ a이유1']);
  await expect(page.locator('#sg-build')).toBeDisabled();
  await page.locator('#sg-more').click();
  await expect(page.locator('.sg-ex').first()).toContainText('b제목1');
  const more = reqs.filter(b => b.action === 'examples').pop();
  expect(more.seen).toEqual(['a제목1', 'a제목2', 'a제목3', 'a제목4']);
  expect(more.concept).toBe('for');
  expect(auth.every(Boolean)).toBe(true);
  await page.locator('.sg-ex').nth(1).click();
  await expect(page.locator('.sg-ex').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sg-build')).toBeEnabled();
  await page.locator('#sg-concept-pick').selectOption('while');
  await expect(page.locator('#sg-build')).toBeDisabled();            // 개념을 바꾸면 예시를 새로 받고 고름은 비운다
  expect(reqs.filter(b => b.action === 'examples').pop().concept).toBe('while');
});

test('강사 단계별 생성 — 개념을 빨리 바꾸면 늦게 온 옛 응답은 버린다', async ({ page }) => {
  await page.route('**/api/mission-steps', async r => {
    const b = r.request().postDataJSON();
    if (b.action === 'concept') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ concept: 'for', label: '반복문 for', by: 'keyword' }) });
    if (b.concept === 'while') await new Promise(f => setTimeout(f, 600));   // 먼저 보낸 요청이 늦게 도착한다
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ examples: [{ title: b.concept + '-예시', situation: '상황이에요.', why: '이유' }] }) });
  });
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.main-tab[data-dtab="dtab-missions"]').click();
  await page.locator('#gen-lesson').fill('반복문');
  await page.locator('#sg-concept').click();
  await expect(page.locator('.sg-ex')).toContainText('for-예시');
  await page.locator('.sg-ex').click();
  await expect(page.locator('#sg-build')).toBeEnabled();
  await page.locator('#sg-concept-pick').selectOption('while');   // 느린 응답
  await expect(page.locator('#sg-build')).toBeDisabled();          // 요청 중에 옛 고름이 남지 않는다
  await page.locator('#sg-concept-pick').selectOption('if');
  await expect(page.locator('.sg-ex')).toContainText('if-예시');
  await page.waitForTimeout(900);
  await expect(page.locator('.sg-ex')).toHaveCount(1);
  await expect(page.locator('.sg-ex')).toContainText('if-예시');
  await expect(page.locator('#sg-build')).toBeDisabled();
});

/* 단계별 생성 3·4단계 — 가짜 build 가 주는 초안을 강사 브라우저의 Pyodide 로 돌려 정답을 얻는다 */
const SG_DRAFT = (solution) => ({ draft: {
  kind: 'code', concept: 'for', title: '영수증 합치기', situation: '민서가 영수증을 모았어요. 모두 얼마인지 알아야 해요.',
  brief: '영수증 금액이 모두 얼마인지 알려 주세요.',
  inputs: [{ id: 'd01', name: '영수증 1', v: '[1500, 800]' }, { id: 'd02', name: '영수증 2', v: '[300]' },
    { id: 'd03', name: '새 영수증', v: '[]', counter: true, axis: 'empty' }],
  cards: [{ label: '하나씩 꺼내기', decoy: false }, { label: '모두 더하기', decoy: false }, { label: '가장 큰 값 찾기', decoy: true }],
  define: { q: '어떤 결과가 나오면 성공일까요?', options: [{ v: '모든 금액을 더한 값이 나오면 성공', trap: null }, { v: '오류 없이 끝나면 성공', trap: 'luck' }] },
  solution } });

const SPENT = '생성 횟수를 다 썼어요. 관리자에게 문의해 주세요.';

/* for 미션의 모범 답안은 for 를 써야 검사를 통과한다 — print(sum(data)) 는 '개념이 안 쓰였다'로 걸린다 */
const SG_FOR = 't = 0\nfor x in data:\n    t += x\nprint(t)';

async function sgBuild(page, solutions, solveCode, before, quota = { left: 3, disabled: false }) {
  const builds = [], solves = [];
  await page.route('**/api/mission-steps', async r => {
    const b = r.request().postDataJSON();
    if (b.action === 'quota') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ left: quota.left, disabled: quota.disabled }) });
    if (b.action === 'build' && quota.out) { builds.push(b); return r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: SPENT, left: 0 }) }); }
    if (b.action === 'concept') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ concept: 'for', label: '반복문 for', by: 'keyword' }) });
    if (b.action === 'examples') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ examples: [{ title: '영수증', situation: '영수증을 모아요.', why: '하나씩 더해요' }] }) });
    if (b.action === 'solve') {
      solves.push(b);
      return solveCode ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: solveCode }) })
        : r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"x"}' });
    }
    builds.push(b);
    if (quota.failRetry && b.ticket) return r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: '문제를 만들지 못했어요. 다시 만들어 주세요.', reasons: {} }) });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...SG_DRAFT(solutions[Math.min(builds.length, solutions.length) - 1]),
      ticket: 'tk-' + builds.length, left: 2 }) });
  });
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.main-tab[data-dtab="dtab-missions"]').click();
  await page.locator('#gen-lesson').fill('리스트와 반복문');
  await page.locator('#gen-key').fill('하나씩 꺼내 보기');
  if (before) await before();
  await page.locator('#sg-concept').click();
  await page.locator('.sg-ex').first().click();
  await page.locator('#sg-wish').fill('운동회 이야기였으면');
  await page.locator('#sg-build').click();
  builds.solves = solves;
  return builds;
}

test('만든 초안을 실행해 자료별 정답과 외우기 함정이 채워진다', async ({ page }) => {
  test.setTimeout(120000);
  const builds = await sgBuild(page, [SG_FOR]);
  await expect(page.locator('.sg-answer')).toHaveText(['2300', '300', '0'], { timeout: 60000 });
  await expect(page.locator('#sg-draft')).toContainText('영수증 1의 답과 같은 2300이 나오면 성공');
  await expect(page.locator('#sg-problems')).toBeHidden();
  expect(builds).toHaveLength(1);
  expect(builds[0].wish).toBe('운동회 이야기였으면');
  await expect(page.locator('#sg-title')).toHaveValue('영수증 합치기');
  await expect(page.locator('.sg-card')).toHaveCount(3);
  await expect(page.locator('.sg-opt')).toHaveCount(2);
});

test('검사에 걸리면 이유를 붙여 다시 만든다', async ({ page }) => {
  test.setTimeout(120000);
  const builds = await sgBuild(page, ['print(2300)', 'while not data:\n    pass\n' + SG_FOR, SG_FOR]);
  await expect(page.locator('.sg-answer')).toHaveText(['2300', '300', '0'], { timeout: 90000 });
  expect(builds).toHaveLength(3);
  expect(builds[0].problems).toEqual([]);
  expect(builds[1].problems).toContain('반례의 결과가 첫 자료의 결과와 같아요.');
  expect(builds[2].problems.join(' ')).toContain('시간 안에 끝나지 않아요');
  await expect(page.locator('#sg-problems')).toBeHidden();
});

test('자료를 고치면 다시 계산하고, 확정하면 solution 없이 저장한다', async ({ page }) => {
  test.setTimeout(120000);
  await sgBuild(page, [SG_FOR]);
  await expect(page.locator('.sg-answer')).toHaveText(['2300', '300', '0'], { timeout: 60000 });
  const v0 = page.locator('.sg-data-val[data-idx="0"]');
  await v0.fill('[1, 2]'); await v0.blur();
  await expect(page.locator('.sg-answer').first()).toHaveText('3', { timeout: 20000 });
  await expect(page.locator('#sg-draft')).toContainText('영수증 1의 답과 같은 3이 나오면 성공');
  const v2 = page.locator('.sg-data-val[data-idx="2"]');
  await v2.fill('[3]'); await v2.blur();
  await expect(page.locator('#sg-problems')).toContainText('반례의 결과가 첫 자료의 결과와 같아요.', { timeout: 20000 });
  await v2.fill('foo('); await v2.blur();          // 리터럴이 아니면 에러 이유로
  await expect(page.locator('#sg-problems')).toContainText('에러가 나요', { timeout: 20000 });
  await v2.fill('[]'); await v2.blur();
  await expect(page.locator('#sg-problems')).toBeHidden({ timeout: 20000 });
  const n0 = page.locator('.sg-data-name[data-idx="0"]');
  await n0.fill('민서 영수증'); await n0.blur();
  await expect(page.locator('#sg-draft')).toContainText('민서 영수증의 답과 같은 3이 나오면 성공');
  await page.locator('#sg-title').fill('운동회 영수증');
  await page.locator('#sg-save').click();
  await expect.poll(() => page.evaluate(() => (window.__saved || []).length)).toBe(1);
  const [[rid, m]] = await page.evaluate(() => window.__saved);
  expect(rid).toBe('r1');
  expect('solution' in m).toBe(false);
  expect('wish' in m).toBe(false);
  expect(JSON.stringify(m)).not.toContain('운동회 이야기였으면');
  expect(m).toMatchObject({ kind: 'code', concept: 'for', no: 'AI', type: 'sentence', title: '운동회 영수증', stage: '운동회 영수증',
    lesson: '리스트와 반복문', keyPoint: '하나씩 꺼내 보기', expected: ['3', '300', '0'] });
  expect(m.id).toMatch(/^ai-[0-9a-z]+$/);
  expect(m.inputs.map(x => x.v)).toEqual(['[1, 2]', '[300]', '[]']);
  expect(m.define.options.map(o => o.trap || null).sort()).toEqual([null, 'hardcode', 'luck'].sort());
  expect(m.define.options.find(o => o.trap === 'hardcode').v).toBe('민서 영수증의 답과 같은 3이 나오면 성공');
  expect(m.inputs[0].name).toBe('민서 영수증');
  expect(m.cards.filter(c => c.decoy)).toHaveLength(1);
  await expect(page.locator('#sg-draft')).toBeEmpty();
});

test('다시 만들기를 두 번 해도 걸리면 초안을 보이고 이유를 노란 상자로', async ({ page }) => {
  test.setTimeout(120000);
  const builds = await sgBuild(page, ['print(sum(data))']);
  await expect(page.locator('.sg-answer')).toHaveText(['2300', '300', '0'], { timeout: 60000 });
  expect(builds).toHaveLength(3);
  await expect(page.locator('#sg-problems')).toContainText('풀이 코드에 고른 개념이 쓰이지 않았어요.');
  await expect(page.locator('#sg-draft')).toContainText('영수증 1의 답과 같은 2300이 나오면 성공');
});

test('강사 화면에서 Python 을 못 불러오면 멈추지 않고 그렇다고 말한다', async ({ page }) => {
  await page.route('**/pyodide/**', r => r.abort());
  await sgBuild(page, [SG_FOR]);
  await expect(page.locator('#sg-status')).toContainText('Python을 불러오지 못했어요', { timeout: 20000 });
});

test('따로 푼 답이 다르면 사실 한 줄로 보인다', async ({ page }) => {
  test.setTimeout(120000);
  const builds = await sgBuild(page, [SG_FOR], SG_FOR.replace('print(t)', 'print(t + 1)'));
  await expect(page.locator('#sg-solve')).toHaveText('따로 푼 답과 달라요: 영수증 1 — 2300 / 2301 · 영수증 2 — 300 / 301 · 새 영수증 — 0 / 1', { timeout: 60000 });
  expect(builds.solves).toHaveLength(1);
  expect(JSON.stringify(builds.solves[0])).not.toContain('solution');
  expect(builds.solves[0].inputs[0]).toEqual({ name: '영수증 1', v: '[1500, 800]' });
});

test('따로 푼 답이 같으면 같다고만, 못 풀면 아무것도 안 띄운다', async ({ page }) => {
  test.setTimeout(120000);
  await sgBuild(page, [SG_FOR], SG_FOR);
  await expect(page.locator('#sg-solve')).toHaveText('따로 푼 답과 같아요', { timeout: 60000 });
});

/* sum() 한 번으로 풀리면 for 없이 풀리는 문제다 — 강사에게만 사실 한 줄 */
test('따로 푼 풀이에 고른 개념이 없으면 그렇다고 덧붙인다', async ({ page }) => {
  test.setTimeout(120000);
  await sgBuild(page, [SG_FOR], 'print(sum(data))');
  await expect(page.locator('#sg-solve')).toHaveText('따로 푼 답과 같아요 · 따로 푼 풀이에는 고른 개념(반복문 for)이 쓰이지 않았어요', { timeout: 60000 });
});

test('따로 풀기가 실패하면 줄은 비어 있다', async ({ page }) => {
  test.setTimeout(120000);
  const builds = await sgBuild(page, [SG_FOR]);
  await expect(page.locator('.sg-answer')).toHaveText(['2300', '300', '0'], { timeout: 60000 });
  await expect.poll(() => builds.solves.length).toBe(1);
  await page.waitForTimeout(500);
  await expect(page.locator('#sg-solve')).toBeEmpty();
});

test('판정을 저장하면 모든 자료로 조용히 돌린 기록이 남고 학생 화면은 그대로다', async ({ page }) => {
  test.setTimeout(120000);
  await local(page.context());
  await seedMission(page);
  await studentToCode(page);
  await waitPython(page);
  const probes = () => page.evaluate(() => JSON.parse(localStorage.getItem('cutcheck.log.v1') || '[]').filter(e => e.type === 's-probe'));
  await page.locator('#code-editor').fill('data = "x"\nprint(len(set(data.split(","))))\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toBeVisible({ timeout: 10000 });
  await page.locator('#code-judge .judge-btn').first().click();
  await page.locator('#code-judge-save').click();
  await expect.poll(async () => (await probes()).length, { timeout: 20000 }).toBe(1);
  const p = (await probes())[0];
  expect(p.outs.length).toBe(3);
  expect(p.outs[2].output.trim()).toBe('4');
  expect(Array.isArray(p.uses)).toBe(true);
  // usesCode 가 공유 worker 에 json·ast 를 남기지 않는다 — 다음 학생 실행에서 import 없이 되면 안 된다
  await page.locator('#code-editor').fill('print(("json" in globals(), "ast" in globals(), "_t" in globals()))\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toHaveText('(False, False, False)', { timeout: 10000 });
  await page.locator('#go-wrap').click();
  await expect(page.locator('#wrap-review')).toContainText('False');   // 보이는 실행만 — probe 의 4 는 정리 화면에 없다
  await expect(page.locator('#wrap-review')).not.toContainText('4');
});

test('마지막 실행이 에러면 조용한 실행 기록은 없다', async ({ page }) => {
  test.setTimeout(120000);
  await local(page.context());
  await seedMission(page);
  await studentToCode(page);
  await waitPython(page);
  await page.locator('#code-editor').fill('print(item)\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toContainText('1번째 줄', { timeout: 10000 });
  await page.waitForTimeout(1500);
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem('cutcheck.log.v1') || '[]').filter(e => e.type === 's-probe').length);
  expect(n).toBe(0);
});

test('조용한 실행이 도는 사이 다른 미션을 열어도 기록은 처음 미션 것이다', async ({ page }) => {
  test.setTimeout(120000);
  await local(page.context());
  await seedMission(page);
  await studentToCode(page);
  await waitPython(page);
  await page.locator('#code-editor').fill('import time\ntime.sleep(0.6)\ndata = "x"\nprint(len(data.split(",")))\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toBeVisible({ timeout: 10000 });
  await page.locator('#code-judge .judge-btn').first().click();
  await page.locator('#code-judge-save').click();
  await page.locator('.m-btn[data-id="sm2"]').click();   // 자료 3개를 도는 2초 남짓 사이에 다른 미션으로
  const probes = () => page.evaluate(() => JSON.parse(localStorage.getItem('cutcheck.log.v1') || '[]').filter(e => e.type === 's-probe'));
  await expect.poll(async () => (await probes()).length, { timeout: 30000 }).toBe(1);
  const p = (await probes())[0];
  expect(p.mid).toBe('ai-e2e');
  const want = await page.evaluate(() => window.CC.SENTENCE_MISSIONS[0].inputs.map(i => i.v));
  expect(p.outs.map(o => o.dataId)).toEqual(want);
});

test('서랍에 코드 사실과 설계·코드 나란히', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.addInitScript(() => {
    window.__facts = 1;
    localStorage.setItem('cutcheck.generated', JSON.stringify([{ id: 'mx', kind: 'code', concept: 'while', title: '합계', inputs: [{ name: '영수증', v: '[1, 2]' }, { name: '빈 상자', v: '[]', counter: true }] }]));
  });
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.student-tile', { hasText: '태인' }).click();
  const d = page.locator('#detail');
  await expect(d.getByText('코드 사실', { exact: true })).toHaveCount(2);
  await expect(d).toContainText('새로 온 자료에서도 영수증과 같은 결과 3이 나와요');
  await expect(d).toContainText('오늘 개념(반복문 while)이 코드에 없어요');
  const a = await d.locator('.d-pair-cards').boundingBox();
  const b = await d.locator('.d-pair-code').boundingBox();
  expect(a && b && Math.abs(a.y - b.y) < 4 && b.x > a.x).toBeTruthy();       // 나란히
  await page.setViewportSize({ width: 400, height: 900 });
  const a2 = await d.locator('.d-pair-cards').boundingBox();
  const b2 = await d.locator('.d-pair-code').boundingBox();
  expect(b2.y).toBeGreaterThan(a2.y);                                           // 좁으면 위아래
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
});

/* ── 최종 리뷰 수정 (2026-10-20) ── */

/* pyrun 의 run 을 감싸 genflow 가 돌린 코드를 센다 — create 는 처음 만들 때 불린다 */
function spyRuns(page) {
  return page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const c = window.CC.pyrun.create;
      window.__runs = [];
      window.CC.pyrun.create = (s) => {
        const p = c(s), r = p.run;
        p.run = (code, cb) => { const k = { code }; window.__runs.push(k); r(code, (o, e) => { k.error = e; cb(o, e); }); };
        return p;
      };
    });
  });
}

test('따로 풀기는 자료마다 차례로 돌고 첫 에러(시간 초과)에서 멈춘다', async ({ page }) => {
  test.setTimeout(120000);
  await spyRuns(page);
  const builds = await sgBuild(page, [SG_FOR], 'while True:\n    pass\nprint(1)');
  await expect(page.locator('.sg-answer')).toHaveText(['2300', '300', '0'], { timeout: 60000 });
  const solveRuns = () => page.evaluate(() => window.__runs.filter(k => k.code.indexOf('while True') >= 0));
  await expect.poll(async () => (await solveRuns()).filter(k => k.error).length, { timeout: 20000 }).toBe(1);
  await page.waitForTimeout(1500);
  const rs = await solveRuns();
  expect(rs).toHaveLength(1);                                   // 나머지 두 자료는 넣지 않았다
  expect(rs[0].error).toBe(await page.evaluate(() => CC.pyerr.TIMEOUT));
  await expect(page.locator('#sg-solve')).toBeEmpty();
  expect(builds.solves).toHaveLength(1);
});

test('자료를 고치는 순간 옛 따로 풀기 결과는 지워진다', async ({ page }) => {
  test.setTimeout(120000);
  await sgBuild(page, [SG_FOR], SG_FOR);
  await expect(page.locator('#sg-solve')).toHaveText('따로 푼 답과 같아요', { timeout: 60000 });
  const v0 = page.locator('.sg-data-val[data-idx="0"]');
  await v0.fill('[1, 2]');
  await v0.blur();                                              // change → rerun 이 동기로 돈다
  expect(await page.locator('#sg-solve').textContent()).toBe('');
  await expect(page.locator('#sg-solve')).toHaveText('따로 푼 답과 같아요', { timeout: 60000 });   // 새 자료로 다시 푼다
});

test('수업 내용 없이 개념 확인을 누르면 보이는 자리에 말한다', async ({ page }) => {
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.main-tab[data-dtab="dtab-missions"]').click();
  await page.locator('#sg-concept').click();
  await expect(page.locator('#gen-result')).toHaveText('수업 내용을 입력해주세요.');
  await expect(page.locator('#gen-result')).toBeVisible();
  await expect(page.locator('#sg')).toBeHidden();
});

test('기록을 읽기 전에 지정 풀기를 눌러도 다시 지정되지 않는다', async ({ page }) => {
  await page.addInitScript(() => { window.__evHang = 1; window.__due = 's2'; });
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.main-tab[data-dtab="dtab-invite"]').click();
  const 가은 = page.locator('.roster-row', { hasText: '가은' });
  await expect(가은.locator('.roster-test')).toHaveText('레벨 테스트 지정 풀기');
  await 가은.locator('.roster-test').click();
  await expect.poll(() => page.evaluate(() => window.__assigned)).toEqual([['r1', 's2', false]]);
});

test('수정을 눌렀다가 단계별로 확정하면, 다음 빠른 생성은 그 미션을 덮어쓰지 않는다', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => { window.__missions = [{ id: 'm-old', data: { title: '옛 미션', brief: '옛 요청', lesson: '옛 수업', keyPoint: '옛 핵심' } }]; });
  const fixture = require('./fixtures/mission.json');
  await page.route('**/api/generate-mission', r => r.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ ...fixture, guard: { fallback: [], reasons: {} } }) }));
  await sgBuild(page, [SG_FOR], null, async () => {
    await page.locator('#mission-list button', { hasText: '수정' }).click();
    await expect(page.locator('#gen-btn')).toHaveText('초안 다시 생성');
    await page.locator('#gen-lesson').fill('리스트와 반복문');
  });
  await expect(page.locator('#gen-btn')).toHaveText('빠른 생성');
  await expect(page.locator('.sg-answer')).toHaveText(['2300', '300', '0'], { timeout: 60000 });
  await page.locator('#sg-save').click();
  await expect.poll(() => page.evaluate(() => (window.__saved || []).length)).toBe(1);
  await page.locator('#gen-key').fill('하나씩 꺼내 보기');
  await page.locator('#gen-btn').click();
  await page.locator('#confirm-mission').click();
  await expect.poll(() => page.evaluate(() => (window.__saved || []).length)).toBe(2);
  expect(await page.evaluate(() => window.__updated || [])).toEqual([]);
});

/* worker 안의 코드가 js 모듈로 바깥(fetch·postMessage)에 닿지 못한다 */
test('실행기 — worker 안에서 js·pyodide 모듈은 막혀 있고 보통 코드는 돈다', async ({ context, page }) => {
  test.setTimeout(90000);
  await local(context);
  await page.goto(BASE + '/sentence.html');
  const r = await page.evaluate(() => new Promise(resolve => {
    const py = window.CC.pyrun.create((t, ok) => {
      if (!ok) return;
      const got = [];
      const codes = ['import js', 'import sys\ndel sys.modules["js"]\nimport js', 'import pyodide_js', 'from pyodide.code import run_js', 'print(sorted({3, 1, 2}))'];
      codes.forEach(c => py.run(c, (o, e) => { got.push([o, e]); if (got.length === codes.length) resolve(got); }));
    });
  }));
  r.slice(0, 4).forEach(([o, e]) => expect(e).toMatch(/ModuleNotFoundError/));
  expect(r[4]).toEqual(['[1, 2, 3]\n', '']);
});

/* worker 가 준비된 뒤 죽으면 그 실행만 실패 — 메인 스레드(시간 제한·격리 없음)로 옮겨 다시 돌리지 않는다.
 * 실행 번호가 다른 'done' 은 무시한다 */
const FAKE_WORKER = `postMessage({ type: 'ready' });
onmessage = function (e) {
  var d = e.data;
  if (d.code === 'crash') { setTimeout(function () { throw new Error('boom'); }); return; }
  postMessage({ type: 'done', id: 1, output: 'FAKE1', error: '' });
  postMessage({ type: 'done', id: String(d.id) + 'x', output: 'FAKE2', error: '' });
  postMessage({ type: 'done', id: d.id, output: 'ok:' + d.code + ':' + typeof d.id + ':' + String(d.id).length, error: '' });
};`;

test('실행기 — 준비된 worker 가 죽으면 그 실행만 실패하고 메인 스레드로 가지 않는다', async ({ context, page }) => {
  await local(context);
  await page.route('**/pyodide/**', r => r.abort());
  await page.route('**/js/ui/pyworker.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE_WORKER }));
  await page.goto(BASE + '/sentence.html');
  const r = await page.evaluate(() => new Promise(resolve => {
    window.loadPyodide = () => { window.__mainBoot = 1; return new Promise(() => {}); };
    let started = false;
    const got = [];
    const py = window.CC.pyrun.create((t, ok) => {
      if (!ok || started) return;
      started = true;
      py.run('a', (o, e) => got.push([o, e]));
      py.run('crash', (o, e) => got.push([o, e]));
      py.run('b', (o, e) => { got.push([o, e]); resolve({ got, main: !!window.__mainBoot }); });
    });
  }));
  expect(r.main).toBe(false);
  expect(r.got[1]).toEqual(['', 'Python 실행기가 멈췄어요.']);
  expect(r.got[0][0]).toMatch(/^ok:a:string:/);                // 지어낸 id 1·id+'x' 의 done 은 버렸다
  expect(Number(r.got[0][0].split(':')[3])).toBeGreaterThan(6); // 맞히기 어려운 실행 번호
  expect(r.got[2][0]).toMatch(/^ok:b:/);                         // 새 worker 로 이어서 돈다
});

/* 수업에서 짚을 거리 — 진짜 CC.sb.recap(캐시) 위에 가짜 서버. /api/tutor-recap 은 route 로 고정 응답 */
const RECAP_SB = require('fs').readFileSync(__dirname + '/../js/data/supabase.js', 'utf8') +
  '\n;window.__R=CC.sb.recap;\n' + FAKE_TEACHER + '\n;CC.sb.recap=window.__R;';
const rv = (sid, name, type, mid, o) => ({ student_id: sid, created_at: new Date().toISOString(), profiles: { name },
  event: Object.assign({ type, mid, v: 1, t: Date.now() }, o) });
const RECAP_EVS = [
  rv('s1', '태인', 's-define', 'ma', { choice: '몇 개' }),
  rv('s1', '태인', 's-tutor', 'ma', { question: 'split 이 뭐예요?', answer: '나눠요', refused: false }),
  rv('s1', '태인', 's-wrap', 'ma', { text: '끝' }),
  rv('s1', '태인', 's-tutor', 'mb', { question: '이건요?', answer: '음', refused: false }),
  rv('s3', '한결', 's-tutor', 'ma', { question: '답 알려줘요', answer: '', refused: true }),
  rv('s3', '한결', 's-wrap', 'ma', { text: '끝' })
];
async function asRecapTeacher(page, evs, reply) {
  await page.route('**/supabase-js@2/**', r => r.abort());
  await page.route('**/js/data/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: RECAP_SB }));
  const calls = [];
  await page.route('**/api/tutor-recap', r => { calls.push(r.request().postDataJSON()); return r.fulfill(reply); });
  if (evs) await page.addInitScript(e => { window.__evs = e; }, evs);
  await page.goto(BASE + '/teacher.html');
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  return calls;
}
const ok = items => ({ contentType: 'application/json', body: JSON.stringify({ items }) });

test('강사 서랍 — 끝낸 미션에만 수업에서 짚을 거리, 누르면 point · 펼치면 질문', async ({ page }) => {
  const calls = await asRecapTeacher(page, RECAP_EVS, ok([
    { point: 'split 이 돌려주는 것', who: ['s1'], mid: 'ma', quote: 'split 이 뭐예요?', refused: false },
    { point: '답을 달라고 함', who: ['s1'], mid: 'ma', quote: 'split 이 뭐예요?', refused: true }]));
  await page.locator('.student-tile', { hasText: '태인' }).click();
  const d = page.locator('#detail');
  await expect(d).not.toContainText('수업에서 짚을 거리');           // 모든 미션 보기에는 없다
  await d.locator('.mf').nth(2).click();                              // mb — 끝내지 않음
  await expect(d).not.toContainText('수업에서 짚을 거리');
  await d.locator('.mf').nth(1).click();                              // ma — 끝냄
  const row = d.locator('.row', { hasText: '수업에서 짚을 거리' });
  await row.getByRole('button', { name: '튜터 대화에서 뽑기' }).click();
  const items = row.locator('.recap-item');
  await expect(items).toHaveCount(2);
  await expect(items.first().locator('summary')).toHaveText('split 이 돌려주는 것');
  await expect(items.first().locator('.quote')).toBeHidden();
  await items.first().locator('summary').click();
  await expect(items.first().locator('.quote')).toHaveText('“split 이 뭐예요?”');
  await expect(items.nth(1).locator('.tag')).toHaveText('튜터가 답하지 못함');
  expect(calls.length).toBe(1);
  expect(calls[0].students.map(x => x.mid)).toEqual(['ma']);
  expect(JSON.stringify(calls[0])).not.toContain('태인');              // 이름은 서버로 가지 않는다
});

test('강사 반 전체 — 많은 순, N명 · 펼치면 이름, 두 번 눌러도 요청 한 번', async ({ page }) => {
  let calls;
  calls = await asRecapTeacher(page, RECAP_EVS, { contentType: 'application/json', body: '{}' });
  await page.unroute('**/api/tutor-recap');
  await page.route('**/api/tutor-recap', r => {
    const who = r.request().postDataJSON().students.map(x => x.who);
    calls.push(1);
    return r.fulfill(ok([
      { point: '하나만', who: [who[0]], mid: 'ma', quote: 'split 이 뭐예요?', refused: false },
      { point: '둘 다', who: who, mid: 'ma', quote: '답 알려줘요', refused: true }]));
  });
  await page.locator('#recap-class').click();
  const items = page.locator('#recap-class-out .recap-item');
  await expect(items).toHaveCount(2);
  await expect(items.first().locator('.pt')).toHaveText('둘 다');
  await expect(items.first().locator('.n')).toHaveText('2명');
  await items.first().locator('summary').click();
  const who = await items.first().locator('.who').textContent();
  expect(who).toContain('태인'); expect(who).toContain('한결'); expect(who).not.toMatch(/s\d/);
  await page.locator('#recap-class').click();
  await expect(items).toHaveCount(2);
  expect(calls.length).toBe(1);
});

test('강사 반 전체 — 튜터 대화가 없으면 요청 없이 한 줄', async ({ page }) => {
  const calls = await asRecapTeacher(page, null, ok([]));
  await page.locator('#recap-class').click();
  await expect(page.locator('#recap-class-out')).toHaveText('튜터와 대화하고 끝낸 미션이 아직 없어요.');
  expect(calls.length).toBe(0);
});

test('강사 반 전체 — 서버가 실패하면 다시 누르라는 한 줄', async ({ page }) => {
  await asRecapTeacher(page, RECAP_EVS, { status: 502, contentType: 'application/json', body: '{"error":"x"}' });
  await page.locator('#recap-class').click();
  await expect(page.locator('#recap-class-out')).toHaveText('지금은 뽑지 못했어요. 잠시 뒤 다시 눌러 주세요.');
  await expect(page.locator('#recap-class')).toBeEnabled();
});

test('강사 서랍 — 끝낸 미션이 하나뿐이면 고르지 않아도 수업에서 짚을 거리', async ({ page }) => {
  await asRecapTeacher(page, RECAP_EVS.slice(0, 3), ok([]));
  await page.locator('.student-tile', { hasText: '태인' }).click();
  await expect(page.locator('#detail .row', { hasText: '수업에서 짚을 거리' })).toBeVisible();
});

test('강사 반 전체 — 빈 결과는 캐시하지 않아 다시 누르면 서버를 다시 부른다', async ({ page }) => {
  const calls = await asRecapTeacher(page, RECAP_EVS, ok([]));
  await page.locator('#recap-class').click();
  await expect(page.locator('#recap-class-out')).toContainText('짚을 거리가 나오지 않았어요');
  await page.locator('#recap-class').click();
  await expect(page.locator('#recap-class-out')).toContainText('짚을 거리가 나오지 않았어요');
  expect(calls.length).toBe(2);
});

/* 생성 한도 (2026-10-20) — 남은 수는 서버가 알려 준 대로만 보인다. 0 이면 두 생성 버튼을 끈다 */
test('남은 생성 — 처음 수를 보이고, 만들기가 성공하면 줄고, 재요청에는 직전 ticket 을 싣는다', async ({ page }) => {
  test.setTimeout(120000);
  const builds = await sgBuild(page, ['print(2300)', SG_FOR]);
  await expect(page.locator('.sg-answer')).toHaveText(['2300', '300', '0'], { timeout: 90000 });
  expect(builds).toHaveLength(2);
  expect('ticket' in builds[0]).toBe(false);                 // 새 "만들기" 는 ticket 없이
  expect(builds[1].ticket).toBe('tk-1');                     // 검사에 걸린 재요청은 첫 응답의 ticket
  expect(builds[0].lesson).toBe('리스트와 반복문');           // 관리자 기록에 수업 내용이 남게
  await expect(page.locator('.gen-left').first()).toHaveText('남은 생성 2개');
  await page.locator('#sg-build').click();                   // 다시 누른 "만들기" 는 새 미션 — ticket 없이
  await expect.poll(() => builds.length).toBe(3);
  expect('ticket' in builds[2]).toBe(false);
});

/* 2026-10-20 운영: 첫 초안은 차감되고 저장됐는데 자동 재요청이 422 로 끝나자 초안까지 버려 "남은 생성 2개 + 만들지 못했어요"만 남았다.
 * 재요청이 실패하면 이미 만든 초안을 걸린 이유와 함께 보여 준다 — 낸 횟수로 받은 것을 잃지 않는다 */
test('자동 재요청이 실패해도 이미 만든 초안은 걸린 이유와 함께 남는다', async ({ page }) => {
  test.setTimeout(120000);
  const builds = await sgBuild(page, ['print(2300)'], null, null, { left: 3, disabled: false, failRetry: true });
  await expect.poll(() => builds.length, { timeout: 90000 }).toBe(2);
  await expect(page.locator('.sg-answer')).toHaveText(['2300', '2300', '2300'], { timeout: 60000 });
  await expect(page.locator('#sg-problems')).toBeVisible();
  await expect(page.locator('#sg-title')).toHaveValue('영수증 합치기');
  await expect(page.locator('#sg-status')).toContainText('처음 만든 문제를 보여 드려요');
});

test('남은 생성 — 열면 서버가 준 수, 403 left 0 이면 두 버튼이 꺼지고 문장', async ({ page }) => {
  const builds = await sgBuild(page, [SG_FOR], null, async () => {
    await expect(page.locator('.gen-left')).toHaveText(['남은 생성 3개', '남은 생성 3개']);
  }, { left: 3, disabled: false, out: true });
  await expect.poll(() => builds.length).toBe(1);
  await expect(page.locator('#gen-btn')).toBeDisabled();
  await expect(page.locator('#sg-build')).toBeDisabled();
  await expect(page.locator('.gen-left').first()).toHaveText(SPENT);
  await page.locator('.sg-ex').first().click();              // 예시를 다시 골라도 꺼진 채로
  await expect(page.locator('#sg-build')).toBeDisabled();
});

test('남은 생성 — 빠른 생성도 left 로 갱신하고, 0 이 되면 꺼진다', async ({ page }) => {
  const fixture = require('./fixtures/mission.json');
  await page.route('**/api/mission-steps', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ left: 1, disabled: false }) }));
  await page.route('**/api/generate-mission', r => r.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ ...fixture, guard: { fallback: [], reasons: {} }, left: 0 }) }));
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.main-tab[data-dtab="dtab-missions"]').click();
  await expect(page.locator('.gen-left').first()).toHaveText('남은 생성 1개');
  await expect(page.locator('#t-admin')).toBeVisible();       // 로그인한 강사에게만 관리자 화면 링크
  await page.locator('#gen-lesson').fill('리스트와 반복문');
  await page.locator('#gen-key').fill('같은 값이 여러 번 나올 때');
  await page.locator('#gen-btn').click();
  await expect(page.locator('#confirm-mission')).toBeVisible();
  await expect(page.locator('.gen-left').first()).toHaveText(SPENT);
  await expect(page.locator('#gen-btn')).toBeDisabled();
  await page.locator('#confirm-mission').click();
  await expect.poll(() => page.evaluate(() => (window.__saved || []).length)).toBe(1);
  expect('left' in (await page.evaluate(() => window.__saved[0][1]))).toBe(false);   // 남은 수는 미션에 섞이지 않는다
});

test('남은 생성 — 빠른 생성이 403 left 0 이면 두 버튼이 꺼진다', async ({ page }) => {
  await page.route('**/api/mission-steps', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ left: 2, disabled: false }) }));
  await page.route('**/api/generate-mission', r => r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: SPENT, left: 0 }) }));
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  await page.locator('.main-tab[data-dtab="dtab-missions"]').click();
  await page.locator('#gen-lesson').fill('리스트와 반복문');
  await page.locator('#gen-key').fill('같은 값이 여러 번 나올 때');
  await page.locator('#gen-btn').click();
  await expect(page.locator('#gen-result')).toHaveText(SPENT);
  await expect(page.locator('#gen-btn')).toBeDisabled();
  await expect(page.locator('#sg-build')).toBeDisabled();
  await expect(page.locator('.gen-left').first()).toHaveText(SPENT);
});

test('남은 생성 — 로컬 모드에서는 묻지도 보이지도 않는다', async ({ context, page }) => {
  await local(context);
  const asked = [];
  await page.route('**/api/mission-steps', r => { asked.push(1); return r.abort(); });
  await page.goto(BASE + '/teacher.html');
  await page.locator('.main-tab[data-dtab="dtab-missions"]').click();
  await page.waitForTimeout(300);
  expect(asked).toHaveLength(0);
  for (const t of await page.locator('.gen-left').allTextContents()) expect(t).toBe('');
  await expect(page.locator('#t-admin')).toBeHidden();
  await expect(page.locator('#gen-btn')).toBeEnabled();
});

/* 관리자 화면 (2026-10-20) — 서버(/api/admin)가 관리자만 받는다. 표는 서버가 준 순서(이름순) 그대로, 사용량으로 줄 세우지 않는다 */
const T1 = '11111111-1111-1111-1111-111111111111', T2 = '22222222-2222-2222-2222-222222222222';
const ADMIN_LIST = { default_quota: 3, teachers: [
  { id: T1, name: '가람', email: 'garam@example.test', used: 1, quota: 3, left: 2, disabled: false },
  { id: T2, name: '나래', email: 'narae@example.test', used: 3, quota: 3, left: 0, disabled: false }] };
const EVIL = '<img src=x onerror="window.__pwned=1">';

async function asAdmin(page, handle) {
  const reqs = [];
  await page.route('**/api/admin', async r => {
    const b = r.request().postDataJSON();
    reqs.push(b);
    const [status, body] = handle(b);
    return r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/supabase-js@2/**', r => r.abort());
  await page.route('**/js/data/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE_TEACHER }));
  await page.goto(BASE + '/admin.html');
  return reqs;
}

test('관리자 — 관리자가 아니면 한 줄만, 표는 없다', async ({ page }) => {
  await asAdmin(page, () => [403, { error: '관리자만 볼 수 있어요.' }]);
  await expect(page.locator('#ad-note')).toHaveText('관리자만 볼 수 있어요.');
  await expect(page.locator('#ad-main')).toBeHidden();                   // 표 둘 다 이 안에 있다
  await expect(page.locator('table:visible')).toHaveCount(0);
});

test('관리자 — 강사 표, 한도를 바꾸면 그 줄만 갱신, 범위 밖이면 서버 문장이 그 줄 옆에', async ({ page }) => {
  const reqs = await asAdmin(page, b => {
    if (b.action === 'list') return [200, ADMIN_LIST];
    if (b.action === 'log') return [200, { log: [{ at: '2026-10-20T01:02:03Z', teacher: '가람', lesson: EVIL, concept: 'for', kind: 'step', retries: 1 },
      { at: '2026-10-20T00:00:00Z', teacher: '나래', lesson: '리스트', concept: 'list', kind: 'quick', retries: 0 }] }];
    if (b.action === 'set_quota' && b.quota > 1000) return [400, { error: '한도는 0 이상 1000 이하 정수로 정해 주세요.' }];
    if (b.action === 'set_quota') return [200, { ...ADMIN_LIST.teachers[1], quota: b.quota, left: b.quota - 3 }];
    return [400, { error: '요청 형식이 잘못됐어요.' }];
  });
  const rows = page.locator('#ad-teachers tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('가람');
  await expect(rows.nth(0)).toContainText('garam@example.test');
  const q = rows.nth(1).locator('input[type="number"]');
  await q.fill('5'); await q.blur();
  await expect(rows.nth(1).locator('td').nth(3)).toHaveText('2');
  expect(reqs.find(b => b.action === 'set_quota')).toEqual({ action: 'set_quota', id: T2, quota: 5 });
  await expect(rows.nth(1).locator('input[type="number"]')).toHaveValue('5');
  const q2 = rows.nth(0).locator('input[type="number"]');
  await q2.fill('1001'); await q2.blur();
  await expect(rows.nth(0).locator('.ad-msg')).toHaveText('한도는 0 이상 1000 이하 정수로 정해 주세요.');
  await expect(page.locator('#ad-default')).toHaveValue('3');
  const log = page.locator('#ad-log tbody tr');
  await expect(log).toHaveCount(2);
  await expect(log.nth(0)).toContainText(EVIL);                 // 강사가 쓴 수업 내용은 글자로만
  await expect(log.nth(0)).toContainText('단계별');
  await expect(log.nth(0).locator('td').nth(3)).toHaveText('반복문 for');   // 아는 개념은 이름으로
  await expect(log.nth(1).locator('td').nth(3)).toHaveText('list');         // 모르는 id 는 그대로
  await expect(log.nth(1)).toContainText('빠른');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(page.locator('#ad-log img')).toHaveCount(0);
});

test('관리자 — 생성 끄기와 기본 한도, 폰 폭에서도 화면은 옆으로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 900 });
  const reqs = await asAdmin(page, b => {
    if (b.action === 'list') return [200, ADMIN_LIST];
    if (b.action === 'log') return [200, { log: [] }];
    if (b.action === 'set_disabled') return [200, { ...ADMIN_LIST.teachers[0], disabled: b.disabled, left: 0 }];
    if (b.action === 'set_default') return [200, { default_quota: b.quota }];
    return [400, { error: '요청 형식이 잘못됐어요.' }];
  });
  const row = page.locator('#ad-teachers tbody tr').first();
  await row.locator('input[type="checkbox"]').check();
  await expect(page.locator('#ad-teachers tbody tr').first().locator('td').nth(3)).toHaveText('0');
  expect(reqs.find(b => b.action === 'set_disabled')).toEqual({ action: 'set_disabled', id: T1, disabled: true });
  await page.locator('#ad-default').fill('7'); await page.locator('#ad-default').blur();
  await expect.poll(() => reqs.filter(b => b.action === 'set_default').length).toBe(1);
  expect(reqs.find(b => b.action === 'set_default')).toEqual({ action: 'set_default', quota: 7 });
  const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(o).toBeLessThanOrEqual(0);
});

/* ── 사용법 안내 (js/ui/tour.js) ──
 * 자동화 브라우저에서는 자동 시작이 꺼져 있다 — 다른 테스트가 안내에 가려 멈추지 않게.
 * 여기서만 window.__tour = 1 로 켠다. */
async function tourOn(context) {
  await local(context);
  await context.addInitScript(() => { window.__tour = 1; });
}
const tour = page => page.locator('.tour-box[role="dialog"]');

test('사용법 안내 — 처음 한 번만 뜨고, 다시 열지 않는다', async ({ context, page }) => {
  await tourOn(context);
  await page.goto(BASE + '/sentence.html');
  await expect(tour(page)).toBeVisible();
  await expect(tour(page)).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#tour-count')).toHaveText('1 / 3');   // 01 단계에 보이는 것만: 단계·받은 요청·사용법 보기
  await expect(page.locator('#tour-title')).toHaveText('단계');
  await expect(page.locator('.tour-btn[data-a="next"]')).toBeFocused();
  await page.locator('.tour-btn[data-a="next"]').click();
  await expect(page.locator('#tour-title')).toHaveText('받은 요청');
  await page.locator('.tour-btn[data-a="prev"]').click();
  await expect(page.locator('#tour-title')).toHaveText('단계');
  await page.locator('.tour-btn[data-a="skip"]').click();
  await expect(page.locator('.tour')).toHaveCount(0);              // 닫히면 아무것도 가리지 않는다
  await page.reload();
  await page.waitForTimeout(300);
  await expect(page.locator('.tour')).toHaveCount(0);
});

test('사용법 안내 — 다시 보기 버튼, Tab 은 안에서 돌고 Esc 로 닫으면 버튼으로 돌아온다', async ({ context, page }) => {
  await local(context);   // 자동 시작 없음
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(BASE + '/sentence.html');
  await page.waitForTimeout(300);
  await expect(page.locator('.tour')).toHaveCount(0);
  await page.locator('#tour-replay').click();
  await expect(tour(page)).toBeVisible();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('.tour-box'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.tour')).toHaveCount(0);
  await expect(page.locator('#tour-replay')).toBeFocused();
});

test('사용법 안내 — 없거나 숨은 곳은 건너뛴다', async ({ context, page }) => {
  await local(context);
  await page.goto(BASE + '/sentence.html');
  await page.evaluate(() => document.querySelector('[data-tour="brief"]').removeAttribute('data-tour'));
  await page.locator('#tour-replay').click();
  await expect(page.locator('#tour-count')).toHaveText('1 / 2');   // 02~04 단계 것은 숨어 있고, 받은 요청은 없다
  await page.locator('.tour-btn[data-a="next"]').click();
  await expect(page.locator('#tour-title')).toHaveText('사용법 보기');
  await expect(page.locator('.tour-btn[data-a="next"]')).toHaveText('닫기');
  await page.locator('.tour-btn[data-a="next"]').click();
  await expect(page.locator('.tour')).toHaveCount(0);
});

test('사용법 안내 — 선생님 화면: 생성 두 방식을 밝히고, 닫으면 원래 탭으로', async ({ context, page }) => {
  await tourOn(context);
  await page.goto(BASE + '/teacher.html');
  await expect(page.locator('#tour-count')).toHaveText('1 / 8');   // 로컬 모드 — 교실 고르기는 없다
  await expect(page.locator('#tour-title')).toHaveText('학생 카드');
  const next = page.locator('.tour-btn[data-a="next"]');
  for (let i = 0; i < 4; i++) await next.click();
  await expect(page.locator('#tour-title')).toHaveText('빠른 생성');
  await expect(page.locator('#gen-btn')).toBeVisible();          // 미션 탭을 열어 실제 버튼을 밝힌다
  await next.click();
  await expect(page.locator('#tour-title')).toHaveText('개념 확인');
  await expect(page.locator('#tour-count')).toHaveText('6 / 8');   // 탭을 바꿔 앞 단계가 숨어도 전체 수는 그대로
  await expect(page.locator('#tour-text')).toContainText('개념을 확인하고, 이야기를 고른 뒤, 문제로');
  await page.keyboard.press('Escape');
  await expect(page.locator('#dtab-students')).toBeVisible();
  await page.reload();
  await page.waitForTimeout(300);
  await expect(page.locator('.tour')).toHaveCount(0);
});


/* 나침반 — 선생님 서랍 카드 (2026-10-20). 서버(api/compass)는 page.route 로 가짜 */
const judgeEv = (mission_id, mid) => ({ student_id: 's1', mission_id, created_at: new Date().toISOString(), profiles: { name: '태인' }, event: { type: 's-code-judge', mid, verdict: '지켰다', basis: 'b', v: 1, t: Date.now() } });
const cRow = (missionId, o) => Object.assign({ studentId: 's1', missionId, levels: { N: 3, E: 2, S: 0, W: 1 }, evidence: { N: ['f1'], W: ['t1'] }, facts: [{ id: 'f1', dir: 'N', kind: 'trap-fixed', text: '함정 보기를 고쳤다' }, { id: 't1', dir: null, kind: 'tutor', text: '쉼표가 뭐예요?' }],
  ai_note: '성공 조건을 스스로 고쳤다', needle_deg: 18.4, strongest: 'N', teacher_dir: null, teacher_note: null, sent_at: null }, o || {});
async function compassTeacher(page, evs, handler) {
  const calls = [];
  await page.addInitScript(e => { window.__evs = e; }, evs);
  await page.route('**/api/compass', async r => {
    const b = r.request().postDataJSON(); calls.push(b);
    const out = await handler(b);
    return r.fulfill({ status: out.status || 200, contentType: 'application/json', body: JSON.stringify(out.json) });
  });
  await asTeacher(page);
  await page.locator('#classroom-cards .room-tile', { hasText: '태인한결' }).click();
  return calls;
}

test('강사 — 학생 서랍의 나침반 카드: 단계·근거·기본 방위·보내기', async ({ page }) => {
  const sent = [];
  const calls = await compassTeacher(page, [judgeEv('M1', 'mx')], b => {
    if (b.action === 'list') return { json: { rows: [cRow('M1')] } };
    if (b.action === 'send') { sent.push(b); return { json: cRow('M1', { teacher_dir: b.dir, teacher_note: b.note, sent_at: '2026-10-20T00:00:00Z' }) }; }
    return { status: 500, json: { error: 'x' } };
  });
  await page.locator('.student-tile', { hasText: '태인' }).click();
  const card = page.locator('#detail .compass-card');
  await expect(card).toHaveCount(1);
  await expect(card.locator('svg .compass-poly')).toHaveCount(1);
  await expect(card.locator('svg .compass-needle')).toHaveAttribute('transform', /rotate\(18\.4/);
  await expect(card.locator('.compass-dir')).toHaveCount(4);
  await expect(card.locator('.compass-dir').first()).toContainText('북쪽 · 이해');
  await expect(card.locator('.compass-dir').first()).toContainText('3단계');
  await expect(card).toContainText('함정 보기를 고쳤다');
  await expect(card).toContainText('튜터에게: "쉼표가 뭐예요?"');
  await expect(card).toContainText('성공 조건을 스스로 고쳤다');
  await expect(card.getByLabel('학생에게 보일 방향')).toHaveValue('N');
  await expect(card.locator('select option')).toHaveText(['고르지 않음', '북쪽 · 이해', '동쪽 · 설계', '남쪽 · 구현', '서쪽 · 검증']);
  await expect(card.getByLabel('한마디 — 학생에게 그대로 보여요.')).toBeVisible();
  for (const sel of ['.compass-send', '.compass-reread']) expect((await card.locator(sel).boundingBox()).height).toBeGreaterThanOrEqual(44);
  await card.locator('.compass-send').click();
  await expect(card.locator('.compass-msg')).toHaveText('한마디를 적어 주세요.');
  expect(calls.filter(c => c.action === 'send')).toHaveLength(0);
  await card.getByLabel('학생에게 보일 방향').selectOption('E');
  await card.getByLabel('한마디 — 학생에게 그대로 보여요.').fill('설계를 고친 게 좋았어요.');
  await card.locator('.compass-send').click();
  await expect(card.locator('.compass-sent')).toContainText('보냈어요');
  await expect(card.locator('.compass-sent-note')).toHaveText('설계를 고친 게 좋았어요.');
  expect(sent).toEqual([{ action: 'send', classroomId: 'r1', studentId: 's1', missionId: 'M1', dir: 'E', note: '설계를 고친 게 좋았어요.' }]);
  await card.getByLabel('한마디 — 학생에게 그대로 보여요.').fill('고쳐 다시 보내요.');   // 고쳐 다시 보낼 수 있다
  await card.locator('.compass-send').click();
  await expect(card.locator('.compass-sent-note')).toHaveText('고쳐 다시 보내요.');
  await card.locator('.compass-reread').click();
  await expect.poll(() => calls.filter(c => c.action === 'analyze' && c.force === true).length).toBe(1);
});

test('강사 — 바늘이 없으면 안내와 "고르지 않음", 보낸 뒤 명단 꼬리표가 사라진다', async ({ page }) => {
  const calls = await compassTeacher(page, [judgeEv('M1', 'mx')], b => {
    if (b.action === 'list') return { json: { rows: [cRow('M1', { needle_deg: null, strongest: null })] } };
    return { json: cRow('M1', { needle_deg: null, teacher_dir: null, teacher_note: '고마워요.', sent_at: 'x' }) };
  });
  const tile = page.locator('.student-tile', { hasText: '태인' });
  await expect(tile.locator('.tag.wait')).toHaveText('한마디 기다림');
  await tile.click();
  const card = page.locator('#detail .compass-card');
  await expect(card).toContainText('아직 방향이 뚜렷하지 않아요');
  await expect(card.locator('svg .compass-needle')).toHaveCount(0);
  await expect(card.getByLabel('학생에게 보일 방향')).toHaveValue('');
  await card.getByLabel('한마디 — 학생에게 그대로 보여요.').fill('고마워요.');
  await card.locator('.compass-send').click();
  expect(calls.find(c => c.action === 'send').dir).toBeNull();
  await expect(tile.locator('.tag.wait')).toHaveCount(0);
});

test('강사 — 열 때 끝난 미션은 알림 없이 하나씩 차례로 읽고, 실패하면 카드에 다시 읽기', async ({ page }) => {
  let running = 0, maxRun = 0;
  const calls = await compassTeacher(page, [judgeEv('M1', 'mx'), judgeEv('M2', 'my'), judgeEv('M3', 'mz')], async b => {
    if (b.action === 'list') return { json: { rows: [cRow('M1', { sent_at: 'x', teacher_note: 'ok' })] } };
    running++; maxRun = Math.max(maxRun, running);
    await new Promise(r => setTimeout(r, 150));
    running--;
    return b.missionId === 'M3' ? { status: 502, json: { error: '지금은 읽지 못했어요. 잠시 뒤 다시 눌러 주세요.' } } : { json: cRow(b.missionId) };
  });
  const tile = page.locator('.student-tile', { hasText: '태인' });
  await expect(tile.locator('.tag.wait')).toHaveText('한마디 기다림');
  await expect.poll(() => calls.filter(c => c.action === 'analyze').length).toBe(2);
  expect(calls.filter(c => c.action === 'analyze').map(c => c.missionId)).toEqual(['M2', 'M3']);
  expect(maxRun).toBe(1);
  await expect(page.locator('#toasts .toast')).toHaveCount(0);
  await expect(page.locator('#alert-list li')).toHaveCount(0);
  await tile.click();
  const cards = page.locator('#detail .compass-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2)).toContainText('지금은 읽지 못했어요. 잠시 뒤 다시 눌러 주세요.');
  await expect(cards.nth(2).locator('.compass-reread')).toBeVisible();
  await expect(tile.locator('.tag.wait')).toBeVisible();   // 실패해도 표시는 남는다
});

test('강사 — 로컬 모드는 /api/compass 를 부르지 않고 나침반 카드도 없다', async ({ page }) => {
  let n = 0;
  await page.route('**/supabase-js@2/**', r => r.abort());
  await page.route('**/api/compass', r => { n++; r.abort(); });
  await page.goto(BASE + '/teacher.html');
  await page.waitForTimeout(500);
  expect(n).toBe(0);
  expect(await page.locator('.compass-card').count()).toBe(0);
});

test('강사 — list 가 실패하면 폴링마다 다시 부르지 않고 다시 읽기에서만 다시 부른다', async ({ page }) => {
  let ok = false;
  const calls = await compassTeacher(page, [judgeEv('M1', 'mx')], b => ok ? { json: { rows: [cRow('M1')] } } : { status: 502, json: { error: 'x' } });
  await expect.poll(() => calls.length).toBe(1);
  await page.evaluate(() => CC._compassSync('r1')); await page.evaluate(() => CC._compassSync('r1'));
  await page.waitForTimeout(300);
  expect(calls.length).toBe(1);
  await page.locator('.student-tile', { hasText: '태인' }).click();
  await expect(page.locator('#detail .compass-card')).toContainText('지금은 읽지 못했어요');
  ok = true;
  await page.locator('#detail .compass-reread').click();
  await expect(page.locator('#detail .compass-send')).toBeVisible();
  expect(calls.length).toBe(2);
});
