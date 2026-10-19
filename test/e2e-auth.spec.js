/* test/e2e-auth.spec.js — 로그인은 버튼·Enter 로만 일어난다, hover 는 초록이 아니다
 * Supabase 는 가짜로 바꾼다 — signIn 호출 횟수를 센다.
 *   npx playwright test test/e2e-auth.spec.js */
const { test, expect } = require('@playwright/test');
const BASE = process.env.CC_BASE || 'http://localhost:8123';

async function fakeSb(ctx) {
  await ctx.route('**/supabase-js@2/**', r => r.fulfill({ contentType: 'text/javascript', body:
    `window.__calls=[];window.supabase={createClient:function(){return{auth:{
      getUser:function(){return Promise.resolve({data:{user:null}})},
      getSession:function(){return Promise.resolve({data:{session:null}})},
      onAuthStateChange:function(){return{data:{subscription:{unsubscribe(){}}}}},
      signInWithPassword:function(a){window.__calls.push(a);return Promise.resolve({data:{},error:{message:'Invalid login'}})}}}}};` }));
}
const calls = page => page.evaluate(() => window.__calls.length);

test('아이디·비밀번호만 채워서는 로그인하지 않는다', async ({ context, page }) => {
  await fakeSb(context);
  await page.goto(BASE + '/auth.html');
  await page.locator('#login-email').pressSequentially('student01', { delay: 40 });
  await page.locator('#login-pw').pressSequentially('abcdef12', { delay: 40 });
  await page.evaluate(() => {                       // 자동완성처럼 값 + 이벤트만
    for (const id of ['login-email', 'login-pw']) {
      const el = document.getElementById(id);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(1200);
  expect(await calls(page)).toBe(0);
  await page.evaluate(() => document.getElementById('form-login').requestSubmit());  // submitter 없는 submit
  await page.waitForTimeout(200);
  expect(await calls(page)).toBe(0);
  await page.locator('#form-login .auth-btn').click();
  await expect.poll(() => calls(page)).toBe(1);
});

test('Enter 로는 로그인한다', async ({ context, page }) => {
  await fakeSb(context);
  await page.goto(BASE + '/auth.html');
  await page.fill('#login-email', 'student01');
  await page.fill('#login-pw', 'abcdef12');
  await page.press('#login-pw', 'Enter');
  await expect.poll(() => calls(page)).toBe(1);
});

test('submitter 를 지원하지 않는 브라우저(undefined)에서도 로그인한다', async ({ context, page }) => {
  await fakeSb(context);
  await page.addInitScript(() => Object.defineProperty(SubmitEvent.prototype, 'submitter', { get() { return undefined; } }));
  await page.goto(BASE + '/auth.html');
  await page.fill('#login-email', 'student01');
  await page.fill('#login-pw', 'abcdef12');
  await page.press('#login-pw', 'Enter');
  await expect.poll(() => calls(page)).toBe(1);
});

test('로그인 버튼 hover 는 초록이 아니다', async ({ context, page }) => {
  await fakeSb(context);
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(BASE + '/auth.html');
    const btn = page.locator('#form-login .auth-btn');
    await btn.hover();
    await page.waitForTimeout(250);
    const bg = await btn.evaluate(e => getComputedStyle(e).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    expect(g > r + 20 && g > b + 20, scheme + ' ' + bg).toBe(false);
  }
});
