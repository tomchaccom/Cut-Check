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
const BASE = process.env.CC_BASE || 'http://localhost:8123';   // 다른 작업 폴더가 8123 을 쓰고 있으면 CC_BASE 로 바꾼다

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
  await ctx.route('**/supabase-js@*/**', r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let alerted = false;
  p.on('dialog', async d => { alerted = true; await d.dismiss(); });

  const EVIL = '<img src=x onerror="window.__pwned=1">';
  const LONG = '가'.repeat(600);

  // 학생이 쓴 내용이 교사 화면으로 흐르는 경로 전부에 넣어본다
  // 학생 화면 (sentence.html) — 판정 근거와 마무리 문장이 교사 화면에 올라간다
  await p.goto(BASE + '/sentence.html'); await p.waitForTimeout(300);
  await p.evaluate(() => window.CC.store.clear());
  await p.locator('#go-define').click();
  await p.locator('.define-card').first().click();
  await p.locator('#reason-define').fill(EVIL);
  await p.locator('#go-method').click();
  for (const label of ['나누기', '겹친 것은 하나만', '개수 세기']) await p.locator('.card-pick', { hasText: label }).click();
  await p.locator('.design-item select').first().selectOption('쉼표');
  await p.locator('#reason-method').fill(EVIL);
  await p.locator('#go-run').click();
  if (await p.locator('#tutor-open').isVisible()) await p.locator('#tutor-open').click();
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

  await p.goto(BASE + '/make.html'); await p.waitForTimeout(300);
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
  await t.goto(BASE + '/teacher.html'); await t.waitForTimeout(400);
  await t.evaluate(() => { CC.sb.active = () => true; });   // 로컬 모드는 recap 버튼을 숨긴다 — 서버가 있는 척하고 서랍을 연다
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

  // 수업에서 짚을 거리 — 학생 질문 원문이 quote 로 돌아와도 글자로만 (서버는 가짜, CC.sb.api 를 바꿔 끼운다)
  await t.route('**/api/tutor-recap', r => {
    const st = r.request().postDataJSON().students;
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ point: EVIL, who: [st[0].who], mid: st[0].mid, quote: EVIL, refused: false }] }) });
  });
  await t.evaluate(() => { CC.sb.api = (p, body) => fetch(p, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()); });
  await t.locator('.detail .recap-go').click();
  await t.locator('.detail .recap-item summary').click();
  const rq = (await t.locator('.detail .recap-item .quote').textContent()) || '';
  const recapBad = !!(await t.evaluate(() => window.__pwned)) || (await t.locator('.detail img').count()) > 0 || alerted || rq.indexOf('<img') < 0;
  console.log('짚을 거리 quote 가 글자로만 보임:', recapBad ? '✗' : '✓');

  // 학생 코드의 출력(s-probe)은 서랍의 '코드 사실'로 올라간다 — 글자로만 보여야 한다
  await t.evaluate((EVIL) => {
    CC.store.clear();
    localStorage.setItem('cutcheck.generated', JSON.stringify([{ id: 'mx', kind: 'code', concept: 'while', title: 'x', inputs: [{ name: '자료 1', v: '[1]' }, { name: '빈 상자', v: '[]', counter: true }] }]));
    var T = CC.events.T;
    CC.store.push({ type: T.S_CODE, mid: 'mx', code: 'print(1)', dataId: '[1]', output: '1', error: '' });
    CC.store.push({ type: T.S_PROBE, mid: 'mx', sig: CC.codemission.sig('print(1)'), outs: [{ dataId: '[1]', output: EVIL, error: '' }, { dataId: '[]', output: EVIL, error: '' }], uses: ['For'] });
  }, EVIL);
  await t.goto(BASE + '/teacher.html'); await t.waitForTimeout(400);
  await t.locator('#livebar .tbtn').first().click(); await t.waitForTimeout(300);
  const factTxt = (await t.locator('.detail').textContent()) || '';
  const factBad = !!(await t.evaluate(() => window.__pwned)) || (await t.locator('.detail img').count()) > 0 || alerted || factTxt.indexOf('코드 사실') < 0 || factTxt.indexOf('<img') < 0;
  console.log('코드 사실(probe 출력)이 글자로만 보임:', factBad ? '✗' : '✓');

  // 선생님이 쓴 학생 이름 — 계정 만들기 칸에서 명단·학생 폴더로 흐른다 (서버는 가짜로 끼운다)
  const tc = await b.newContext({ viewport: { width: 1000, height: 1000 } });
  await tc.route('**/supabase-js@*/**', r => r.abort());
  await tc.route('**/js/data/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: `(function(CC){var P=function(v){return Promise.resolve(v)};var roster=[];
CC.sb={active:function(){return true},getUser:function(){return P({id:'t1'})},getProfile:function(){return P({role:'teacher',name:'김선생'})},onAuthChange:function(){},signOut:function(){return P()},
myClassrooms:function(){return P([{id:'r1',name:'반',code:'AB12CD'}])},getMissions:function(){return P([])},getClassroomEvents:function(){return P([])},
getClassroomStudents:function(){return P(roster.slice())},
createStudent:function(rid,s){roster.push({id:'n'+roster.length,name:s.name,login_id:s.loginId});return P({loginId:s.loginId,password:'k7mpq2xa'})}}
})(window.CC=window.CC||{});` }));
  const n = await tc.newPage();
  n.on('pageerror', e => errs.push('N: ' + e.message));
  await n.goto(BASE + '/teacher.html'); await n.waitForTimeout(300);
  await n.locator('.main-tab[data-dtab="dtab-invite"]').click();
  await n.locator('#ns-name').fill(EVIL + LONG);
  await n.locator('#ns-go').click(); await n.waitForTimeout(300);
  await n.locator('.main-tab[data-dtab="dtab-students"]').click(); await n.waitForTimeout(200);
  const nPwned = await n.evaluate(() => !!window.__pwned);
  const nImgs = await n.locator('#student-list img, #student-folders img').count();
  const nShown = ((await n.locator('#student-list').textContent()) || '').includes('<img');
  const nw = await n.evaluate(() => ({ d: document.documentElement.scrollWidth, w: window.innerWidth }));
  const nameBad = nPwned || nImgs > 0 || !nShown || nw.d > nw.w + 1;
  console.log('학생 이름(선생님 입력)이 글자로만 보임:', nameBad ? '✗ ' + JSON.stringify({ nPwned, nImgs, nShown, nw }) : '✓');

  // 강사의 '이렇게 바꿔 줬으면'(#sg-wish) — LLM 에게만 가고 학생이 읽는 미션에는 실리지 않는다.
  // AI 가 그 말을 제목에 옮겨 써도 4단계에는 글자로만 보인다 (가짜 build, Pyodide 는 강사 브라우저에서 돈다)
  const gc = await b.newContext({ viewport: { width: 1000, height: 1000 } });
  await gc.route('**/supabase-js@*/**', r => r.abort());
  await gc.route('**/js/data/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: `(function(CC){var P=function(v){return Promise.resolve(v)};
CC.sb={active:function(){return true},getUser:function(){return P({id:'t1'})},getProfile:function(){return P({role:'teacher',name:'김선생'})},onAuthChange:function(){},signOut:function(){return P()},
myClassrooms:function(){return P([{id:'r1',name:'반',code:'AB12CD'}])},getMissions:function(){return P([])},getClassroomEvents:function(){return P([])},getClassroomStudents:function(){return P([])},
saveMission:function(r,m){window.__saved=JSON.stringify(m);return P({})},
api:function(p,b){return fetch(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json()})}}
})(window.CC=window.CC||{});` }));
  await gc.route('**/api/mission-steps', r => {
    const q = r.request().postDataJSON();
    const out = q.action === 'concept' ? { concept: 'for' } : q.action === 'examples' ? { examples: [{ title: EVIL, situation: EVIL, why: EVIL }] }
      : { draft: { kind: 'code', concept: 'for', title: q.wish, situation: EVIL, brief: EVIL,
        inputs: [{ id: 'd01', name: EVIL, v: '[1, 2]' }, { id: 'd02', name: '자료 2', v: '[5]' }, { id: 'd03', name: '자료 3', v: '[]', counter: true, axis: 'empty' }],
        cards: [{ label: EVIL }, { label: '더하기' }, { label: '빼기', decoy: true }],
        define: { q: '어떤 결과가 나오면 성공일까요?', options: [{ v: EVIL, trap: null }, { v: '오류 없이 끝나면 성공', trap: 'luck' }] },
        solution: 't = 0\nfor x in data:\n    t += x\nprint(t)' } };
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(out) });
  });
  const g = await gc.newPage();
  g.on('pageerror', e => errs.push('G: ' + e.message));
  await g.goto(BASE + '/teacher.html'); await g.waitForTimeout(300);
  await g.locator('#classroom-cards .room-tile').first().click();
  await g.locator('.main-tab[data-dtab="dtab-missions"]').click();
  await g.locator('#gen-lesson').fill('반복문');
  await g.locator('#sg-concept').click();
  await g.locator('#sg-next').click();
  await g.locator('.sg-ex').first().click();
  await g.locator('#sg-wish').fill('WISH-' + EVIL);
  await g.locator('#sg-build').click();
  await g.locator('.sg-answer').first().filter({ hasText: '3' }).waitFor({ timeout: 60000 });
  await g.locator('#sg-save').click();
  await g.waitForFunction(() => window.__saved, null, { timeout: 5000 });
  const gs = await g.evaluate(() => ({ pwned: !!window.__pwned, imgs: document.querySelectorAll('#gp-step img').length, saved: JSON.parse(window.__saved) }));
  const wishBad = gs.pwned || gs.imgs > 0 || 'wish' in gs.saved || 'solution' in gs.saved || gs.saved.title.indexOf('WISH-') !== 0;
  console.log('강사 바람(#sg-wish)은 학생 미션에 키로 실리지 않고, AI 글은 글자로만 보임:', wishBad ? '✗ ' + JSON.stringify({ pwned: gs.pwned, imgs: gs.imgs, keys: Object.keys(gs.saved) }) : '✓');

  // 선생님이 쓴 나침반 한마디 — 학생에게 그대로 가므로 글자로만 보여야 하고, 선생님 화면에도 글자로만 올라온다
  const kc = await b.newContext({ viewport: { width: 1000, height: 1000 } });
  await kc.route('**/supabase-js@*/**', r => r.abort());
  await kc.route('**/js/data/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: `(function(CC){var P=function(v){return Promise.resolve(v)};
var NOTE=${JSON.stringify(EVIL + LONG + ' 🙂👍')};
CC.sb={active:function(){return true},getUser:function(){return P({id:'t1'})},getProfile:function(){return P({role:'teacher',name:'김선생'})},onAuthChange:function(){},signOut:function(){return P()},
myClassrooms:function(){return P([{id:'r1',name:'반',code:'AB12CD'}])},getMissions:function(){return P([])},getClassroomStudents:function(){return P([{id:'s1',name:'태인'}])},
getClassroomEvents:function(){return P([{student_id:'s1',mission_id:'M1',created_at:new Date().toISOString(),profiles:{name:'태인'},event:{type:'s-code-judge',mid:'mx',verdict:'지켰다',basis:'b',v:1,t:Date.now()}}])},
compass:function(a){var CK=['N1','N2','N3','E1','E2','E3','S1','S2','S3','W1','W2','W3'],ck={};CK.forEach(function(k){ck[k]={ok:k==='N2',quote:k==='N2'?${JSON.stringify(EVIL)}:''}});var row={studentId:'s1',missionId:'M1',checks:ck,tutor_dirs:{N:1,E:0,S:0,W:0},teacher_dir:'N',teacher_note:NOTE,sent_at:'2026-10-20T00:00:00Z'};if(a==='list')return P({rows:[row]});if(a==='cumulative')return P({cumulative:{needle_deg:10,dir:'N',length:0.7,cancel:false,candidates:[],n:1},rows:[row]});return Promise.reject(new Error('x'))}}
})(window.CC=window.CC||{});` }));
  const k = await kc.newPage();
  k.on('pageerror', e => errs.push('K: ' + e.message));
  k.on('dialog', async d => { alerted = true; await d.dismiss(); });
  await k.goto(BASE + '/teacher.html'); await k.waitForTimeout(300);
  await k.locator('#classroom-cards .room-tile').first().click();
  await k.locator('.student-tile', { hasText: '태인' }).click();
  await k.locator('.compass-card').waitFor({ timeout: 5000 });
  await k.locator('.compass-sent-note').waitFor({ timeout: 5000 }); await k.locator('.compass-table td .q').waitFor({ timeout: 5000 });
  const ks = await k.evaluate(() => ({ pwned: !!window.__pwned, imgs: document.querySelectorAll('#detail img').length, sent: (document.querySelector('.compass-sent-note') || {}).textContent, ta: (document.querySelector('.compass-card textarea') || {}).value, w: document.documentElement.scrollWidth - innerWidth }));
  const noteBad = ks.pwned || ks.imgs > 0 || alerted || ks.sent !== EVIL + LONG + ' 🙂👍' || ks.ta !== ks.sent || ks.w > 1 || (await k.locator('.compass-card').textContent()).indexOf('“<img') < 0;
  console.log('나침반 한마디가 글자로만 보임:', noteBad ? '✗ ' + JSON.stringify({ pwned: ks.pwned, imgs: ks.imgs, w: ks.w }) : '✓');

  // 알림 목록 — 학생 이름과 미션 제목이 뭐든 #alert-list 에는 글자로만 올라온다 (토스트도)
  const ac = await b.newContext({ viewport: { width: 1000, height: 1000 } });
  await ac.addInitScript(E => { localStorage.setItem('cutcheck.generated', JSON.stringify([{ id: 'mx', title: E, type: 'sentence', kind: 'code' }])); window.__e = []; }, EVIL);
  await ac.route('**/supabase-js@*/**', r => r.abort());
  await ac.route('**/js/data/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: `(function(CC){var P=function(v){return Promise.resolve(v)};var N=${JSON.stringify(EVIL)};
CC.sb={active:function(){return true},getUser:function(){return P({id:'t1'})},getProfile:function(){return P({role:'teacher',name:'김선생'})},onAuthChange:function(){},signOut:function(){return P()},
myClassrooms:function(){return P([{id:'r1',name:'반',code:'AB12CD'}])},getMissions:function(){return P([])},getClassroomStudents:function(){return P([{id:'s1',name:N}])},
getClassroomEvents:function(){return P(window.__e.map(function(e){return {student_id:'s1',created_at:new Date().toISOString(),profiles:{name:N},event:e}}))},
compass:function(){return Promise.reject(new Error('x'))}}
})(window.CC=window.CC||{});` }));
  const a = await ac.newPage();
  a.on('pageerror', e => errs.push('A: ' + e.message));
  a.on('dialog', async d => { alerted = true; await d.dismiss(); });
  await a.goto(BASE + '/teacher.html'); await a.waitForTimeout(300);
  await a.locator('#classroom-cards .room-tile').first().click();
  await a.locator('.student-tile').first().waitFor({ timeout: 5000 });
  await a.evaluate(() => { window.__e.push({ type: 's-redefine', mid: 'mx', v: 1, t: Date.now() }, { type: 's-code-judge', mid: 'mx', verdict: '지켰다', basis: 'b', v: 1, t: Date.now() }); });
  await a.locator('#alert-list li').first().waitFor({ state: 'attached', timeout: 8000 });
  const as = await a.evaluate(() => ({ pwned: !!window.__pwned, imgs: document.querySelectorAll('#alerts img, .toast img').length, txt: document.querySelector('#alert-list').textContent, w: document.documentElement.scrollWidth - innerWidth }));
  const alertBad = as.pwned || as.imgs > 0 || alerted || as.txt.indexOf('<img') < 0 || as.w > 1;
  console.log('알림 목록이 이름·미션 제목을 글자로만 보임:', alertBad ? '✗ ' + JSON.stringify({ pwned: as.pwned, imgs: as.imgs, w: as.w }) : '✓');

  console.log(errs.length ? '✗ JS 에러: ' + errs.join(' | ') : '✓ JS 에러 없음');
  await b.close();
  const failed = recapBad || !tutorShown || pwned || imgs > 0 || alerted || errs.length || (w.d > w.w + 1) || nameBad || wishBad || factBad || noteBad || alertBad;
  console.log(failed ? '\n안전성 검사 실패' : '\n안전성 검사 전부 통과');
  process.exit(failed ? 1 : 0);
})();
