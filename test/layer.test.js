// 계층 검증: 이벤트 계약 / 접기 / 전송 어댑터
// core 는 저장소도 네트워크도 모른다. 그 경계가 실제로 지켜지는지 여기서 본다.
global.window = {};
require('../js/core/events.js');
require('../js/core/fold.js');
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

// ── core 는 브라우저 API 를 모른다
const fs = require('fs');
['events.js', 'fold.js', 'engine.js', 'blocks.js', 'missions.js', 'hangul.js', 'alerts.js', 'llmguard.js', 'asks.js', 'pipeline.js', 'pyerr.js']
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
