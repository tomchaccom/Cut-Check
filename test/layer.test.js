// 계층 검증: 이벤트 계약 / 접기 / 전송 어댑터
// core 는 저장소도 네트워크도 모른다. 그 경계가 실제로 지켜지는지 여기서 본다.
global.window = {};
require('../js/core/events.js');
require('../js/core/fold.js');
require('../js/core/onboard.js');
require('../js/core/hangul.js'); require('../js/core/alerts.js');
require('../js/core/pyerr.js');
const CC = global.window.CC;
const T = CC.events.T;

let fail = 0;
function t(name, cond) { console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name); if (!cond) fail++; }

// ── 이벤트 계약
t('모르는 type 은 만들 수 없다', (() => {
  try { CC.events.make('점수올리기', {}); return false; } catch (e) { return true; }
})());

t('저장하지 않기로 한 필드는 막힌다', (() => {
  try { CC.events.make(T.RUN, { score: 100 }); return false; } catch (e) { return true; }
})());

CC.events.NEVER.forEach(k => {
  t('NEVER 필드 거부: ' + k, (() => {
    const p = {}; p[k] = 1;
    try { CC.events.make(T.RUN, p); return false; } catch (e) { return true; }
  })());
});

const ev = CC.events.make(T.DEFINE, { text: '몇 개가 들어와도 셀 수 있으면 성공', trap: null });
t('만든 이벤트에 시각과 버전이 붙는다', ev.t > 0 && ev.v === 1 && ev.type === 'define');

// ── 접기
const now = 1700000000000;
const log = [
  { type: T.DEFINE, t: now - 300000, text: '화면에 사과, 바나나, 우유 라고 뜨면 성공', trap: 'hardcode' },
  { type: T.CUT, t: now - 280000, sepName: '쉼표', why: '이번 주문서에 이게 보여서', weak: true },
  { type: T.BLOCKS, t: now - 260000, blocks: ['input', 'cut', 'save'] },
  { type: T.RUN, t: now - 240000, allpass: false, mission: 'm1' },
  { type: T.REVISE, t: now - 200000, from: '쉼표', to: '띄어쓰기' },
  { type: T.REDEFINE, t: now - 180000, from: '화면에 …', to: '몇 개가 들어와도 셀 수 있으면 성공', trap: null },
  { type: T.JUDGE, t: now - 120000, found: true },
  { type: '알수없는타입', t: now - 60000 }
];

const s = CC.fold.fold(log, { now: now });
t('단계는 뒤로 가지 않는다', s.stage === 4);
t('고친 기준이 남는다', s.revised === 1 && s.lastRevision.to === '띄어쓰기');
t('성공 조건을 다시 정한 게 남는다', s.redefined === 1 && s.define.trap === null);
t('스스로 찾은 게 남는다', s.selfFound === true);
t('모르는 type 은 무시되고 죽지 않는다', s.stage === 4);
t('빈 로그는 null', CC.fold.fold([]) === null);
t('idleSec 이 마지막 이벤트 기준', s.idleSec === 60);

// 접기는 순수 함수여야 한다 — 같은 입력이면 같은 출력
t('같은 입력이면 같은 출력', JSON.stringify(CC.fold.fold(log, { now: now })) === JSON.stringify(s));

// 여러 학생 접기 (서버 board 응답 모양)
const many = CC.fold.foldMany([
  { sid: 'a1', type: T.DEFINE, t: now, text: 'x', trap: null },
  { sid: 'a2', type: T.DEFINE, t: now, text: 'y', trap: 'luck' },
  { sid: 'a2', type: T.CUT, t: now, sepName: '띄어쓰기', why: '항상 있어서', weak: false }
], { now: now });
t('좌석별로 갈라서 접는다', many.length === 2);
t('좌석 id 만 쓰고 이름은 서버가 모른다', many.every(x => x.id === x.name));
t('함정 선택이 보존된다', many.filter(x => x.define.trap === 'luck').length === 1);

// ── 문장형 이벤트와 접기
console.log('\n[문장형] 이벤트와 접기');
const sev1 = CC.events.make(T.S_DEFINE, { choice: '전체 개수', reason: '모든 상품을 세야 하니까' });
t('문장형 성공 조건 이벤트 생성', sev1.type === 's-define' && sev1.choice === '전체 개수');

const sev2 = CC.events.make(T.S_METHOD, { slots: { sep: '쉼표', dedup: '각각 남긴다', output: '남은 항목의 개수' }, reason: '쉼표가 보여서' });
t('문장형 방법 이벤트 생성', sev2.type === 's-method' && sev2.slots.sep === '쉼표');

const sev3 = CC.events.make(T.S_RUN, { dataId: 'd01', slots: sev2.slots, result: { err: 0, value: 3 } });
t('문장형 실행 이벤트 생성', sev3.type === 's-run');

const sev4 = CC.events.make(T.S_JUDGE, { runId: 0, verdict: '지켰다', basis: '3개가 맞으니까' });
t('문장형 판정 이벤트 생성', sev4.type === 's-judge');

const sev5 = CC.events.make(T.S_WRAP, { text: '처음에는 전체 개수라고 생각했다.' });
t('문장형 마무리 이벤트 생성', sev5.type === 's-wrap');

const slog = [sev1, sev2, sev3, sev4, sev5];
const sf = CC.fold.fold(slog, { now: now });
t('문장형 접기 — 성공 조건', sf.sDefine && sf.sDefine.choice === '전체 개수');
t('문장형 접기 — 방법', sf.sMethod && sf.sMethod.slots.sep === '쉼표');
t('문장형 접기 — 실행 기록', sf.sRuns.length === 1);
t('문장형 접기 — 판정', sf.sJudges.length === 1 && sf.sJudges[0].verdict === '지켰다');
t('문장형 접기 — 마무리', sf.sWrap === '처음에는 전체 개수라고 생각했다.');
t('문장형 접기 — 버전', sf.sDefineVer === 1 && sf.sMethodVer === 1);
/* 내 미션 목록의 상태 — 마무리를 저장하면 완료, 무엇이든 했으면 진행 중. 점수·순위는 없다 */
t('미션 상태 — 미시작', CC.fold.missionStatus([]) === 'none');
t('미션 상태 — 진행 중', CC.fold.missionStatus([{ type: 's-define' }, { type: 's-code' }]) === 'doing');
t('미션 상태 — 완료', CC.fold.missionStatus([{ type: 's-define' }, { type: 's-wrap', text: '정리' }]) === 'done');

/* 카드 설계 — 새 기록은 cards, 예전 기록(slots 만)도 그대로 접힌다 */
const card = [{ op: 'split', label: '나누기', detail: '기준: 쉼표' }, { op: 'count', label: '개수 세기', detail: '' }];
const cs = CC.fold.fold([
  CC.events.make(T.S_METHOD, { cards: card, reason: '쉼표니까', pipelineId: 'split-count' }),
  CC.events.make(T.S_DESIGN, { define: '몇 개', cards: card, pipelineId: 'split-count' })
], { now: now });
t('카드 접기 — 방법', cs.sMethod && cs.sMethod.cards.length === 2 && cs.sMethod.cards[0].detail === '기준: 쉼표');
t('카드 접기 — 설계', cs.sDesign && cs.sDesign.cards[1].label === '개수 세기');
t('예전 기록은 cards 없이 slots 그대로', sf.sMethod.cards === undefined && sf.sMethod.slots.sep === '쉼표');

// 재정의 시 버전 올라감
const slog2 = slog.concat([
  CC.events.make(T.S_REDEFINE, { from: '전체 개수', to: '서로 다른 이름', reason: '중복이 있으니까' })
]);
const sf2 = CC.fold.fold(slog2, { now: now });
t('문장형 재정의 후 버전 증가', sf2.sDefineVer === 2 && sf2.sDefine.choice === '서로 다른 이름');

// ── 튜터 질문
const tv = CC.events.make(T.S_TUTOR, { question: 'split 이 뭐예요?', answer: '문자열을 나눠요.', kind: 'syntax', refused: false });
t('튜터 이벤트 생성', tv.type === 's-tutor');
const tf = CC.fold.fold([tv], { now: Date.now() });
t('튜터 질문을 접는다', tf.sTutor.length === 1 && tf.sTutor[0].question === 'split 이 뭐예요?' && tf.sTutor[0].kind === 'syntax' && tf.sTutor[0].refused === false);

const tn = CC.fold.fold([CC.events.make(T.S_TUTOR, { question: 'q', answer: 'a', kind: 'ask_back', refused: true, step: 4, code: 'x', history_len: 2, reasons: ['leak: 정답 공개'], retried: true, judged: true })], { now: Date.now() });
t('튜터 새 칸을 접는다', tn.sTutor[0].reasons[0] === 'leak: 정답 공개' && tn.sTutor[0].step === 4);
t('예전 튜터 기록은 reasons [] · step null', tf.sTutor[0].reasons.length === 0 && tf.sTutor[0].step === null);

// ── 교사 알림: 새로 생긴 설계도 제출과 코드 판정만
console.log('\n[알림] 비교');
const st = (id, name, d, j) => ({ id, name, sDesignCount: d, sCodeJudges: new Array(j).fill({}) });
const a0 = CC.alerts.snap([st('a1', '민지', 0, 0), st('a2', '준호', 1, 0)]);
t('첫 렌더는 알리지 않는다', CC.alerts.diff(null, a0).length === 0);
const a1 = CC.alerts.snap([st('a1', '민지', 1, 0), st('a2', '준호', 1, 0)]);
const d1 = CC.alerts.diff(a0, a1);
t('새 설계도 제출 하나', d1.length === 1 && d1[0].id === 'a1' && d1[0].kind === 'design');
const a2 = CC.alerts.snap([st('a1', '민지', 1, 1), st('a2', '준호', 1, 0)]);
t('새 코드 판정 하나', CC.alerts.diff(a1, a2).length === 1 && CC.alerts.diff(a1, a2)[0].kind === 'code');
t('변화가 없으면 없다', CC.alerts.diff(a2, a2).length === 0);
const a3 = CC.alerts.snap([st('a1', '민지', 1, 2), st('a2', '준호', 1, 0), st('a3', '서연', 1, 0)]);
const d3 = CC.alerts.diff(a2, a3);
t('같은 학생 반복 판정도 새 판정이다', d3.some(x => x.id === 'a1' && x.kind === 'code'));
t('새로 들어온 학생의 제출도 알린다', d3.some(x => x.id === 'a3' && x.kind === 'design'));
t('문구는 조사를 계산한다', CC.alerts.say({ name: '민지', kind: 'design' }) === '민지가 설계도를 냈어요.'
  && CC.alerts.say({ name: '준호', kind: 'code' }) === '준호가 코드 결과를 판정했어요.'
  && CC.alerts.say({ name: '서연', kind: 'design' }) === '서연이 설계도를 냈어요.');
t('이름이 나이면 내가', CC.alerts.say({ name: '나', kind: 'design' }) === '내가 설계도를 냈어요.'
  && CC.alerts.say({ name: '나', kind: 'code' }) === '내가 코드 결과를 판정했어요.');
t('문구에 순서·시간·판정 결과가 없다', !/첫|번째|분|초|지켰|못했/.test(
  CC.alerts.say({ name: 'x', kind: 'design' }) + CC.alerts.say({ name: 'x', kind: 'code' })));

const df = CC.fold.fold([
  CC.events.make(T.S_DESIGN, { define: 'a', slots: {}, pipelineId: '' }),
  CC.events.make(T.S_DESIGN, { define: 'b', slots: {}, pipelineId: '' })
], { now: Date.now() });
t('설계도 제출 횟수를 접는다', df.sDesignCount === 2);

console.log('\n[파이썬 에러] 위치와 사실만');
const tb = 'Traceback (most recent call last):\n  File "/lib/python311.zip/_pyodide/_base.py", line 571, in eval_code\n' +
  '  File "<exec>", line 3, in <module>\nNameError: name \'pars\' is not defined';
t('줄 번호와 마지막 줄', CC.pyerr.short(tb) === "3번째 줄: NameError: name 'pars' is not defined");
t('input() 은 쓸 수 없다고 알려준다', /input\(\)을 쓸 수 없어요/.test(CC.pyerr.short('RuntimeError: __NO_INPUT__')));
t('줄 번호가 없으면 마지막 줄만', CC.pyerr.short('SyntaxError: invalid syntax') === 'SyntaxError: invalid syntax');
t('원인을 해석하지 않는다', !/때문|하세요|넣으|고치/.test(CC.pyerr.short(tb)));

console.log('\n[진단] 8문항 · 결과는 교사만');
const OB = CC.onboard;
t('문항은 8개', OB.QUESTIONS.length === 8);
t('모든 문항 마지막 보기는 모르겠어요', OB.QUESTIONS.every(q => q.options[q.options.length - 1] === '모르겠어요'));
t('모든 질문은 ? 로 끝나고 80자 이하', OB.QUESTIONS.every(q => /\?$/.test(q.ask) && q.ask.length <= 80));
t('정답표는 밖에 없다', !('KEY' in OB) && OB.QUESTIONS.every(q => Object.keys(q).sort().join() === 'ask,code,id,options'));
/* 정답은 문항을 보고 사람이 적은 것 — core 의 정답표를 베끼지 않는다 */
const RIGHT = { q1: '34', q2: "['a', 'b', 'c']", q3: '나', q4: '3번', q5: '크다', q6: '010-1234', q7: '2', q8: 'A는 10, B는 2' };
const ans = (over) => OB.QUESTIONS.map(q => ({ q: q.id, pick: q.id in (over || {}) ? over[q.id] : q.options.indexOf(RIGHT[q.id]) }));
const DUNNO = q => OB.QUESTIONS.find(x => x.id === q).options.length - 1;
t('보기에 사람이 적은 정답이 다 있다', OB.QUESTIONS.every(q => q.options.indexOf(RIGHT[q.id]) >= 0 && q.options.indexOf(RIGHT[q.id]) < q.options.length - 1));
t('다 맞으면 ready, hardcode 아님', JSON.stringify(OB.stage(ans())) === JSON.stringify({ stage: 'ready', hardcode: false }));
t('1~3 중 하나라도 모르겠어요 → base', OB.stage(ans({ q2: DUNNO('q2') })).stage === 'base');
t('1~3 오답이면 7 이 틀려도 base', OB.stage(ans({ q1: 1, q7: 0 })).stage === 'base');
t('1~6 맞고 7 오답 → combine', OB.stage(ans({ q7: 0 })).stage === 'combine');
t('4~6 에서 막혀도 combine', OB.stage(ans({ q5: DUNNO('q5') })).stage === 'combine');
t('8 모르겠어요 → hardcode', OB.stage(ans({ q8: DUNNO('q8') })).hardcode === true);
t('8 오답 → hardcode, 단계는 그대로', JSON.stringify(OB.stage(ans({ q8: 1 }))) === JSON.stringify({ stage: 'ready', hardcode: true }));
t('답하지 않은 문항은 틀린 것으로', OB.stage([]).stage === 'base' && OB.stage([]).hardcode === true);

const of = CC.fold.fold([
  CC.events.make(T.S_ONBOARD, { answers: ans({ q1: 3 }), skipped: false }),
  CC.events.make(T.S_ONBOARD, { answers: ans(), skipped: false })
], { now: Date.now() });
t('진단을 두 번 내면 마지막 것', of.onboard.stage === 'ready' && of.onboard.hardcode === false && of.onboard.skipped === false && of.onboard.t > 0);
const os = CC.fold.fold([
  CC.events.make(T.S_ONBOARD, { answers: ans(), skipped: false }),
  CC.events.make(T.S_ONBOARD, { answers: [], skipped: true })
], { now: Date.now() });
t('건너뛰면 stage 는 null', os.onboard.stage === null && os.onboard.skipped === true);
t('진단 전에는 onboard 가 null', CC.fold.empty().onboard === null);
t('진단 이벤트에 맞음·점수 칸이 없다', (() => { const e = CC.events.make(T.S_ONBOARD, { answers: ans(), skipped: false }); return Object.keys(e).sort().join() === 'answers,skipped,t,type,v'; })());

const ob = (o) => ({ onboard: o });
const sp = OB.spread([ob({ stage: 'base', hardcode: true, skipped: false }), ob({ stage: 'base', hardcode: false, skipped: false }),
  ob({ stage: 'combine', hardcode: true, skipped: false }), ob({ stage: 'ready', hardcode: false, skipped: false }),
  ob({ stage: null, hardcode: false, skipped: true }), ob(null), {}]);
t('spread 는 단계·hardcode·none 을 센다', JSON.stringify(sp) === JSON.stringify({ base: 2, combine: 1, ready: 1, hardcode: 2, none: 3 }));
t('spread 에 이름·학생 칸이 없다', Object.keys(sp).sort().join() === 'base,combine,hardcode,none,ready');

// ── core 는 브라우저 API 를 모른다
const fs = require('fs');
['events.js', 'fold.js', 'engine.js', 'blocks.js', 'missions.js', 'hangul.js', 'alerts.js', 'llmguard.js', 'asks.js', 'pipeline.js', 'pyerr.js', 'onboard.js']
  .forEach(f => {
    const src = fs.readFileSync(__dirname + '/../js/core/' + f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    t('core/' + f + ' 는 localStorage 를 모른다', !/localStorage/.test(src));
    t('core/' + f + ' 는 fetch 를 모른다', !/\bfetch\(/.test(src));
    t('core/' + f + ' 는 document 를 모른다', !/\bdocument\./.test(src));
  });

// ── 전송 어댑터: 서버 없이도 화면이 돈다
global.window.CC_CONFIG = {};
require('../js/data/config.js');
t('기본은 로컬 모드', CC.config.online() === false);

console.log(fail ? '\n실패 ' + fail + '건' : '\n전부 통과');
process.exit(fail ? 1 : 0);
