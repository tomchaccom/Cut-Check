/* test/e2e-twoframes.spec.js — 발표 슬라이드(/slide2)의 두 칸: 같은 출처 iframe 둘이 강사·학생으로 따로 로그인한다
 * Supabase 는 가짜 — createClient 가 받은 storageKey 로 세션을 localStorage 에 둔다(진짜 supabase-js 와 같은 자리).
 * window.name 이 'kompas-' 로 시작하면 키가 갈리고, 페이지를 옮겨도(auth → teacher / sentence) 이름·세션이 남는지 본다.
 *   npx playwright test test/e2e-twoframes.spec.js */
const { test, expect } = require('@playwright/test');
const BASE = process.env.CC_BASE || 'http://localhost:8123';

const FAKE = `window.supabase={createClient:function(u,k,o){
  var KEY=(o&&o.auth&&o.auth.storageKey)||'sb-default-auth-token';window.__sbOpts=o;window.__sbKey=KEY;
  function me(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){return null}}
  function rows(t){var u=me();if(!u)return[];var tc=u.id==='t1';
    if(t==='classrooms')return tc?[{id:'r1',name:'시연반',code:'ABC123',teacher_id:'t1'}]:[];
    if(t==='enrollments')return tc?[]:[{classroom_id:'r1',classrooms:{id:'r1',name:'시연반'}}];
    return[]}
  function q(t){var b={};['select','eq','order','range','in','limit','insert','update','delete','neq','gte'].forEach(function(m){b[m]=function(){return b}});
    b.single=function(){var u=me();return Promise.resolve({data:t==='profiles'&&u?{id:u.id,role:u.id==='t1'?'teacher':'student',name:u.id==='t1'?'김':'학생 A'}:null})};
    b.then=function(a,c){return Promise.resolve({data:rows(t)}).then(a,c)};return b}
  return{from:q,rpc:function(){return Promise.resolve({data:[]})},auth:{
    getUser:function(){return Promise.resolve({data:{user:me()}})},
    getSession:function(){var u=me();return Promise.resolve({data:{session:u?{access_token:'x',user:u}:null}})},
    onAuthStateChange:function(){return{data:{subscription:{unsubscribe(){}}}}},
    signOut:function(){localStorage.removeItem(KEY);return Promise.resolve({})},
    signInWithPassword:function(a){var id=a.email.indexOf('teacher')===0?'t1':'s1';
      localStorage.setItem(KEY,JSON.stringify({id:id,email:a.email}));return Promise.resolve({data:{},error:null})}}}}};`;

test('두 칸은 서로 다른 세션 — 로그인하고 페이지를 옮겨도 이름과 세션이 갈린다', async ({ context, page }) => {
  await context.route('**/supabase-js@*/**', r => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
  await context.route('**/pyodide/**', r => r.abort());
  await context.route('**/__two.html', r => r.fulfill({ contentType: 'text/html', body:
    '<!doctype html><iframe name="kompas-teacher" src="auth.html" width="600" height="700"></iframe>' +
    '<iframe name="kompas-student" src="auth.html" width="600" height="700"></iframe>' }));
  await page.goto(BASE + '/__two.html');

  const frame = n => page.frame({ name: n });
  await expect.poll(() => frame('kompas-student') && frame('kompas-student').url()).toContain('auth.html');
  for (const [n, id] of [['kompas-teacher', 'teacher01@example.com'], ['kompas-student', 'student01']]) {
    const f = frame(n);
    await f.waitForSelector('#login-email');
    await f.fill('#login-email', id);
    await f.fill('#login-pw', 'abcdef12');
    await f.click('#form-login .auth-btn');
  }
  await expect.poll(() => frame('kompas-teacher').url(), { timeout: 10000 }).toContain('teacher.html');
  await expect.poll(() => frame('kompas-student').url(), { timeout: 10000 }).toContain('sentence.html');

  /* url 은 문서가 바뀌자마자 바뀐다 — 스크립트가 CC 를 만들기 전에 부르면 "CC is not defined" (반쯤 실패하던 경합) */
  const who = n => frame(n).waitForFunction(() => window.CC && CC.sb).then(() => frame(n).evaluate(() => CC.sb.getUser().then(u => ({ name: window.name, key: window.__sbKey, id: u && u.id }))));
  expect(await who('kompas-teacher')).toEqual({ name: 'kompas-teacher', key: 'sb-kompas-teacher', id: 't1' });
  expect(await who('kompas-student')).toEqual({ name: 'kompas-student', key: 'sb-kompas-student', id: 's1' });
});

test('이름 없는 일반 접속은 옵션을 넘기지 않는다 — 기존 로그인 키 그대로', async ({ context, page }) => {
  await context.route('**/supabase-js@*/**', r => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
  await page.goto(BASE + '/auth.html');
  expect(await page.evaluate(() => [window.__sbOpts === undefined, window.__sbKey])).toEqual([true, 'sb-default-auth-token']);
});
