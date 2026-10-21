// 계층 검증: 이벤트 계약 / 접기 / 전송 어댑터
// core 는 저장소도 네트워크도 모른다. 그 경계가 실제로 지켜지는지 여기서 본다.
global.window = {};
require('../js/core/events.js');
require('../js/core/fold.js');
require('../js/core/onboard.js');
require('../js/core/hangul.js'); require('../js/core/alerts.js');
require('../js/core/pyerr.js');
require('../js/core/csv.js');
require('../js/core/recap.js'); require('../js/core/codemission.js'); require('../js/core/facts.js'); require('../js/core/cards.js');
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

console.log('\n[레벨 테스트] 10문항 · 결과는 교사만');
const OB = CC.onboard;
t('문항은 10개', OB.QUESTIONS.length === 10);
t('객관식과 단답형이 섞여 있다', OB.QUESTIONS.some(q => q.options) && OB.QUESTIONS.some(q => !q.options));
t('객관식 마지막 보기는 모르겠어요', OB.QUESTIONS.filter(q => q.options).every(q => q.options[q.options.length - 1] === '모르겠어요'));
t('모든 질문은 ? 로 끝나고 80자 이하', OB.QUESTIONS.every(q => /\?$/.test(q.ask) && q.ask.length <= 80));
t('정답표는 밖에 없다', !('KEY' in OB) && OB.QUESTIONS.every(q => Object.keys(q).every(k => ['id', 'code', 'ask', 'options'].indexOf(k) >= 0)));
/* 정답은 문항을 보고 사람이 적은 것 — core 의 정답표를 베끼지 않는다. 단답형은 쓴 글자 그대로 */
const RIGHT = { d1: '34', d2: '나', d11: '3번', d4: '크다', d5: '3', d12: '4', d13: 'A는 3, B는 2',
  d8: '나누기 → 겹친 것은 하나만 → 개수 세기', d14: '>=', d15: '하람' };
const pickOf = (q, v) => q.options ? q.options.indexOf(v) : v;
const ans = (over) => OB.QUESTIONS.map(q => ({ q: q.id, pick: q.id in (over || {}) ? over[q.id] : pickOf(q, RIGHT[q.id]) }));
const DUNNO = q => { const x = OB.QUESTIONS.find(y => y.id === q); return x.options ? x.options.length - 1 : null; };
t('보기에 사람이 적은 정답이 다 있다', OB.QUESTIONS.filter(q => q.options).every(q => q.options.indexOf(RIGHT[q.id]) >= 0 && q.options.indexOf(RIGHT[q.id]) < q.options.length - 1));
t('다 맞으면 상(ready), hardcode 아님', JSON.stringify(OB.stage(ans())) === JSON.stringify({ stage: 'ready', hardcode: false }));
t('단답형은 공백·따옴표를 보지 않는다', OB.stage(ans({ d2: ' "나" ', d12: ' 4 ' })).stage === 'ready');
/* 룰베이스 채점 — 단답형은 화면에 찍히는 숫자 하나·낱말 하나만. 꼴이 갈리는 답(몇 번 · 기호 · 식)은 객관식 */
const SHORT = [].concat(OB.SETS.low, OB.SETS.mid, OB.SETS.high).filter(q => !q.options).map(q => q.id).sort().join();
t('단답형은 숫자 하나·낱말 하나로 답이 정해지는 문항만', SHORT === 'd2,d12,d5,h2,h3,h6,l2,l4,l6,l9'.split(',').sort().join());
t('문법 6개 중 4개 틀리면 하(base)', OB.stage(ans({ d1: 1, d2: '가', d11: DUNNO('d11'), d4: 0 })).stage === 'base');
t('문법 3개만 맞으면 의도를 다 맞혀도 중', OB.stage(ans({ d1: 1, d2: '가', d11: 2 })).stage === 'combine');
t('문법은 다 맞고 의도 2개만 → 중(combine)', OB.stage(ans({ d8: 1, d14: 2 })).stage === 'combine');
t('문법 5개 + 의도 3개 → 상', OB.stage(ans({ d5: '1', d15: 1 })).stage === 'ready');
t('d13 모르겠어요 → hardcode', OB.stage(ans({ d13: DUNNO('d13') })).hardcode === true);
t('d13 오답 → hardcode, 단계는 그대로', JSON.stringify(OB.stage(ans({ d13: 1 }))) === JSON.stringify({ stage: 'ready', hardcode: true }));
/* 2026-10-21 이전 문제지(V1) 기록 — 바뀐 문항은 새 id 라서 예전 답은 예전 정답표로 푼다 */
const V1MID = { d1: 0, d2: '나', d3: '3번', d4: 1, d5: '3', d6: 1, d7: 2, d8: 0, d9: '>=', d10: 'len(names)-1' };
const v1 = (o, over) => Object.keys(o).map(q => ({ q, pick: q in (over || {}) ? over[q] : o[q] }));
t('V1 중 기록 — 다 맞으면 그대로 상, 10문항', JSON.stringify(OB.stage(v1(V1MID), 'mid')) === JSON.stringify({ stage: 'ready', hardcode: false }) && OB.marks(v1(V1MID), 'mid').every(Boolean) && OB.marks(v1(V1MID), 'mid').length === 10);
t('V1 중 기록 — d7 오답이면 hardcode', OB.stage(v1(V1MID, { d7: 0 }), 'mid').hardcode === true);
const V1HIGH = { h1: 0, h2: '우산', h3: '7', h4: 1, h5: 2, h6: '4', h7: '<=', h8: 1, h9: 0, h10: '2개' };
t('V1 상 기록 — 다 맞으면 10개 모두 참', OB.marks(v1(V1HIGH), 'high').every(Boolean) && OB.stage(v1(V1HIGH), 'high').stage === 'ready');
t('V1 하 기록 — l8 은 예전 정답표', OB.marks([{ q: 'l8', pick: '4번' }], 'low')[7] === true);
t('답하지 않은 문항은 틀린 것으로', OB.stage([]).stage === 'base' && OB.stage([]).hardcode === true);
t('예전 8문항 기록은 예전 규칙으로', JSON.stringify(OB.stage(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'].map((q, i) => ({ q, pick: [0, 2, 1, 1, 1, 1, 0, 2][i] })))) === JSON.stringify({ stage: 'combine', hardcode: false }));
t('상·중·하 이름', OB.LABEL.ready === '상' && OB.LABEL.combine === '중' && OB.LABEL.base === '하');
t('지정이 없으면 볼 차례가 아니다', OB.pending(null, []) === false);
t('지정 뒤 기록이 없으면 볼 차례', OB.pending('2026-10-19T01:00:00Z', ['2026-10-18T01:00:00Z']) === true);
t('지정 뒤 기록이 있으면 끝', OB.pending('2026-10-19T01:00:00Z', ['2026-10-18T01:00:00Z', '2026-10-19T02:00:00Z']) === false);

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
t('진단 이벤트에 맞음·점수 칸이 없다', (() => { const e = CC.events.make(T.S_ONBOARD, { answers: ans(), skipped: false, set: 'mid' }); return Object.keys(e).sort().join() === 'answers,set,skipped,t,type,v'; })());

console.log('\n[레벨 테스트] 문제지 하·중·상');
const SETS = OB.SETS;
t('문제지 셋, 지금 것이 중', Object.keys(SETS).join() === 'low,mid,high' && SETS.mid === OB.QUESTIONS);
t('문제지 이름은 선생님 화면용', OB.SET_LABEL.low === '하' && OB.SET_LABEL.mid === '중' && OB.SET_LABEL.high === '상');
['low', 'high'].forEach(k => {
  const Q = SETS[k];
  t(k + ' — 10문항, 객관식+단답형', Q.length === 10 && Q.some(q => q.options) && Q.some(q => !q.options));
  t(k + ' — ? 로 끝나고 80자 이하, 마지막 보기는 모르겠어요', Q.every(q => /\?$/.test(q.ask) && q.ask.length <= 80) && Q.filter(q => q.options).every(q => q.options[q.options.length - 1] === '모르겠어요'));
  t(k + ' — 정답이 문항에 섞이지 않는다', Q.every(q => Object.keys(q).every(x => ['id', 'code', 'ask', 'options'].indexOf(x) >= 0)));
});
const allIds = [].concat(SETS.low, SETS.mid, SETS.high).map(q => q.id);
t('문항 id 는 셋 전체에서 겹치지 않는다', new Set(allIds).size === 30);
/* 사람이 문항을 보고 적은 정답 */
const RIGHT2 = { l1: '안녕', l2: '8', l3: '5 그리고 23', l4: '11', l5: '사과', l6: '3', l7: '중학생', l11: '4번', l9: '민지야', l10: '6',
  h1: "{'짜장': 3, '짬뽕': 1}", h2: '우산', h3: '7', h11: '"민서 하람"', h5: '에러가 나요', h6: '4', h12: '<=', h8: '95', h13: 'False', h14: '2개' };
const ansOf = (k, over) => SETS[k].map(q => ({ q: q.id, pick: q.id in (over || {}) ? over[q.id] : pickOf(q, RIGHT2[q.id]) }));
t('하·상 보기에 정답이 있다', SETS.low.concat(SETS.high).filter(q => q.options).every(q => q.options.indexOf(RIGHT2[q.id]) >= 0 && q.options.indexOf(RIGHT2[q.id]) < q.options.length - 1));
t('marks — 다 맞으면 10개 모두 참', OB.marks(ansOf('low'), 'low').every(Boolean) && OB.marks(ansOf('high'), 'high').every(Boolean) && OB.marks(ans(), 'mid').length === 10);
t('marks — 문제지 순서대로 ○/×', OB.marks(ansOf('low', { l2: '9' }), 'low').map(x => x ? 1 : 0).join('') === '1011111111');
t('하 문제지 — 다 맞아도 중이 끝', OB.stage(ansOf('low'), 'low').stage === 'combine');
t('하 문제지 — 8개는 중, 7개는 하', OB.stage(ansOf('low', { l1: 1, l2: '0' }), 'low').stage === 'combine' && OB.stage(ansOf('low', { l1: 1, l2: '0', l4: '10' }), 'low').stage === 'base');
t('상 문제지 — 7개 상, 6개 중, 2개 하', OB.stage(ansOf('high', { h1: 1, h2: '모자', h3: '6' }), 'high').stage === 'ready'
  && OB.stage(ansOf('high', { h1: 1, h2: '모자', h3: '6', h11: 0 }), 'high').stage === 'combine' && OB.stage([{ q: 'h1', pick: 0 }, { q: 'h2', pick: '우산' }], 'high').stage === 'base');
t('상 문제지 — h8 오답이면 hardcode', OB.stage(ansOf('high', { h8: 0 }), 'high').hardcode === true && OB.stage(ansOf('high'), 'high').hardcode === false);
t('set 이 없거나 모르는 이름이면 중', OB.stage(ans()).stage === 'ready' && OB.stage(ans(), 'toString').stage === 'ready' && OB.marks(ans(), '__proto__').length === 10);
t('예전 8문항 기록 marks 는 8개', OB.marks([{ q: 'q1', pick: 0 }]).length === 8);
const fs3 = CC.fold.fold([CC.events.make(T.S_ONBOARD, { answers: ansOf('low'), skipped: false, set: 'low' })], { now: Date.now() });
t('접기는 문제지를 보고 푼다', fs3.onboard.stage === 'combine' && fs3.onboard.set === 'low');
t('set 없던 예전 기록은 중으로 접는다', of.onboard.set === 'mid');
t('진단 이벤트에 점수·레벨을 담으면 거절', (() => { try { CC.events.make(T.S_ONBOARD, { answers: [], set: 'low', level: '하' }); return false; } catch (e) { return true; } })());

const ob = (o) => ({ onboard: o });
const sp = OB.spread([ob({ stage: 'base', hardcode: true, skipped: false }), ob({ stage: 'base', hardcode: false, skipped: false }),
  ob({ stage: 'combine', hardcode: true, skipped: false }), ob({ stage: 'ready', hardcode: false, skipped: false }),
  ob({ stage: null, hardcode: false, skipped: true }), ob(null), {}]);
t('spread 는 단계·hardcode·none 을 센다', JSON.stringify(sp) === JSON.stringify({ base: 2, combine: 1, ready: 1, hardcode: 2, none: 3 }));
t('spread 에 이름·학생 칸이 없다', Object.keys(sp).sort().join() === 'base,combine,hardcode,none,ready');

console.log('\n[튜터 CSV]');
const tut = (name, items) => ({ name, sTutor: items });
const csvRows = CC.csv.tutorRows([
  tut('민지', [{ question: '왜 "빈 줄", 나와요?\n두 줄', answer: '답', kind: 'syntax', refused: true, reasons: ['a', 'b'], step: 2, retried: true, mid: 'm1', t: 3000 }]),
  tut('준호', [{ question: '예전', answer: '', kind: 'guarded', refused: false, t: 1000 }])
], (m) => m === 'm1' ? '떡볶이' : null);
t('헤더 10칸', csvRows[0].join('|') === '시각|학생|미션|단계|분류|거절|질문|답|막힌 이유|다시 요청');
t('학생 2명 기록이 시각순', csvRows.length === 3 && csvRows[1][1] === '준호' && csvRows[2][1] === '민지');
t('예전 기록은 빈 칸으로 한 줄', csvRows[1][2] === '' && csvRows[1][3] === '' && csvRows[1][8] === '' && csvRows[1][9] === '' && csvRows[1].length === 10);
t('미션 이름·이유·다시 요청', csvRows[2][2] === '떡볶이' && csvRows[2][3] === '2' && csvRows[2][5] === '거절' && csvRows[2][8] === 'a b' && csvRows[2][9] === '예');
const csv = CC.csv.toCsv(csvRows);
t('BOM 으로 시작하고 줄 끝은 CRLF', csv.charAt(0) === '\uFEFF' && csv.split('\r\n').length === 4);
t('수식으로 시작하는 질문은 앞에 \' 를 붙인다', CC.csv.toCsv([['=HYPERLINK("x")', '@a', '왜요?']]).indexOf('"\'=HYPERLINK(""x"")",\'@a,왜요?') >= 0);
t('쉼표·따옴표·줄바꿈이 든 셀은 감싸고 따옴표는 두 번', csv.indexOf('"왜 ""빈 줄"", 나와요?\n두 줄"') >= 0);
t('평범한 셀은 감싸지 않는다', csv.indexOf(',준호,') >= 0);

console.log('\n[코드 미션]');
const CM = CC.codemission;
t('개념 8개, 순서 고정', CM.CONCEPTS.map(c => c.id).join() === 'split,index,if,for,while,dict,set,func');
t('uses: while 은 For 로 안 된다', CM.uses('while', ['For']) === false);
t('uses: While 이면 된다', CM.uses('while', ['While']) === true);
t('uses: 목록이 null 이면 판단 안 함', CM.uses('x', null) === true);
t('dataLine 새 꼴은 리터럴 그대로', CM.dataLine({ kind: 'code' }, '[1, 2]') === 'data = [1, 2]');
t('dataLine 옛 꼴은 따옴표 문자열', CM.dataLine({}, 'a,b') === 'data = "a,b"');
t('dataLine 따옴표·역슬래시는 JSON 이스케이프', CM.dataLine({}, 'a\\b"c') === 'data = ' + JSON.stringify('a\\b"c'));
t('DATA_RE 는 줄 처음의 data 줄을 찾는다', CM.DATA_RE.test('x=1\ndata = [1]\n'));
t('usesCode 는 새 dict 안에서 돌려 전역을 더럽히지 않는다', CM.usesCode('x=1').indexOf('exec(') === 0 && /, \{\}\)$/.test(CM.usesCode('x=1')) && CM.usesCode('x=1').indexOf('_src = \\"x=1\\"') > 0);
t('USES_PY 는 NUL 같은 ValueError 도 null 로 받는다', CM.USES_PY.indexOf('except (SyntaxError, ValueError):') >= 0);
t('sig: 같은 입력 같은 값, 다른 입력 다른 값', CM.sig('a') === CM.sig('a') && CM.sig('a') !== CM.sig('b') && /^[0-9a-f]+$/.test(CM.sig('print(1)')));
const pe = CC.events.make(CC.events.T.S_PROBE, { sig: 'ab', outs: [{ dataId: 'x', output: '3', error: '' }], uses: ['For'] });
t('s-probe 이벤트는 만들어진다', pe.type === 's-probe');
t('s-probe 에 NEVER 필드를 넣으면 예외', (() => { try { CC.events.make(CC.events.T.S_PROBE, { sig: 'a', score: 1 }); return false; } catch (e) { return true; } })());
const pf = CC.fold.fold([pe, CC.events.make(CC.events.T.S_PROBE, { sig: 'cd', outs: [], uses: null })]);
t('fold: 마지막 probe 만 남긴다', pf.sProbe && pf.sProbe.sig === 'cd' && pf.sProbe.uses === null);
const ok2 = [{ output: '3', error: '' }, { output: '0', error: '' }];
const dr = { concept: 'for', brief: '합계는?', inputs: [{ name: 'a' }, { name: 'b', counter: true }] };
const codes = (d, r, u) => CM.solcheck(d, r, u).map(x => x.code).join();
t('solcheck 통과: 반례가 빈 배열', codes(dr, ok2, ['For']) === '');
t('solcheck error', codes(dr, [{ output: '', error: '1번째 줄 에러' }, ok2[1]], ['For']) === 'error');
t('solcheck error 조사: 받침 있으면 으로, ㄹ·없으면 로', ['영수증', '교실', '버스'].map(n => CM.solcheck({ concept: 'for', inputs: [{ name: n }, {}] }, [{ output: '', error: 'x' }, ok2[1]], ['For'])[0].msg).join('|') === '영수증으로 돌리면 에러가 나요.|교실로 돌리면 에러가 나요.|버스로 돌리면 에러가 나요.');
t('solcheck timeout', codes(dr, [{ output: '', error: CC.pyerr.TIMEOUT }, ok2[1]], ['For']) === 'timeout');
t('solcheck concept', codes(dr, ok2, ['While']) === 'concept');
t('solcheck counter-same', codes(dr, [ok2[0], { output: ' 3\n', error: '' }], ['For']) === 'counter-same');
t('solcheck shape: 빈 출력·여러 줄·200자 초과', ['', '1\n2', 'x'.repeat(201)].every(o => codes({ concept: 'for', inputs: [{}, {}] }, [{ output: o, error: '' }, { output: 'z', error: '' }], ['For']) === 'shape'));
t('solcheck count-not-number', codes({ concept: 'for', brief: '몇 개?', inputs: [{}, {}] }, [{ output: 'abc', error: '' }, { output: '2', error: '' }], ['For']) === 'count-not-number');
t('hardcodeOption 조사 계산', CM.hardcodeOption('주문서 1', '7').v === '주문서 1의 답과 같은 7이 나오면 성공' && CM.hardcodeOption('주문서 1', '7').trap === 'hardcode');
t('hardcodeOption 빈 값', CM.hardcodeOption('영수증', '').v === '영수증처럼 빈 결과가 나오면 성공');
console.log('\n[코드 사실]');
const FM = { concept: 'for', inputs: [{ name: '영수증', v: '[1, 2]' }, { name: '주문서', v: '[5]' }, { name: '빈 상자', v: '[]', counter: true }] };
const O = (id, output, error) => ({ dataId: id, output, error: error || '' });
const kinds = (st, m) => CC.facts.of(st, m || FM).map(f => f.kind).join();
const stu = (codes, probe) => ({ sCodes: codes.map(d => ({ dataId: d, code: 'c' })), sProbe: probe ? Object.assign({ sig: CM.sig('c') }, probe) : null });
t('facts nocounter: 반례로 실행 안 함', CC.facts.of(stu(['[1, 2]']), FM)[0].text === '새로 온 자료로는 실행하지 않았어요');
t('facts nocounter: 반례로 실행했으면 없음', kinds(stu(['[]'])) === '');
t('facts probe 없으면 nocounter 만', kinds(stu([])) === 'nocounter');
t('facts hardcode 문장·조사', CC.facts.of(stu(['[]'], { outs: [O('[1, 2]', '3\n'), O('[]', ' 3 ')], uses: ['For'] }), FM)[0].text === '새로 온 자료에서도 영수증과 같은 결과 3이 나와요');
t('facts hardcode: 다르면 없음', kinds(stu(['[]'], { outs: [O('[1, 2]', '3'), O('[]', '0')], uses: ['For'] })) === '');
t('facts error 문장, 에러가 있으면 hardcode 없음', (() => { const f = CC.facts.of(stu(['[]'], { outs: [O('[1, 2]', ''), O('[5]', '', 'x'), O('[]', '')], uses: ['For'] }), FM); return f.map(x => x.kind).join() === 'error' && f[0].text === '자료 주문서에서는 에러가 나요'; })());
t('facts concept 문장', CC.facts.of(stu(['[]'], { outs: [O('[1, 2]', '3'), O('[]', '0')], uses: ['For'] }), { concept: 'while', inputs: FM.inputs })[0].text === '오늘 개념(반복문 while)이 코드에 없어요');
t('facts concept: uses null 이면 없음', kinds(stu(['[]'], { outs: [], uses: null })) === '');
t('facts 예전 미션(concept 없음)은 concept 없음', kinds(stu(['[]'], { outs: [], uses: ['x'] }), { inputs: FM.inputs }) === '');
t('facts probe 가 옛 코드(sig 다름)면 probe 사실은 없고 nocounter 만', (() => {
  const st = { sCodes: [{ dataId: '[1, 2]', code: 'print(3)' }], sProbe: { sig: CM.sig('old'), outs: [O('[1, 2]', '3'), O('[]', '3')], uses: [] } };
  return kinds(st) === 'nocounter';
})());
t('facts probe 가 마지막 코드와 같으면 사실을 띄운다', kinds({ sCodes: [{ dataId: '[]', code: 'old' }, { dataId: '[]', code: 'new' }], sProbe: { sig: CM.sig('new'), outs: [O('[1, 2]', '3'), O('[]', '3')], uses: ['For'] } }) === 'hardcode');
t('facts hardcode: 반례 값이 자료 1과 같으면 없음', kinds(stu(['[1, 2]'], { outs: [O('[1, 2]', '3')], uses: ['For'] }), { concept: 'for', inputs: [{ name: '영수증', v: '[1, 2]' }, { name: '같은 것', v: '[1, 2]', counter: true }] }) === '');
const fc = CC.cards.forMission({ kind: 'code', cards: [{ label: '더하기' }, { label: '나누기', decoy: true }] });
t('cards.forMission: m.cards 가나다순·decoy 유지', fc.length === 2 && fc[0].label === '나누기' && fc[0].decoy === true && fc[1].label === '더하기' && fc[1].decoy === false);
t('fixedList 새 꼴은 null', CC.cards.fixedList({ kind: 'code' }) === null);

// ── recap: 이벤트 → /api/tutor-recap 본문
{
  const R = CC.recap;
  const ev = (sid, type, o) => Object.assign({ sid, type, mid: 'm1', t: 1 }, o);
  const mk = (n, wrap, tutors, tBase) => {
    const sid = 'x' + n, out = [ev(sid, 's-define', { choice: '조건' + n, t: 1 })];
    for (let i = 0; i < tutors; i++) out.push(ev(sid, 's-tutor', { question: 'q' + i, answer: 'a' + i, refused: i === 1, t: (tBase || 10) + i }));
    if (wrap) out.push(ev(sid, 's-wrap', { text: 'w', t: (tBase || 10) + 50 + n }));
    return out;
  };
  const mis = () => ({ title: '제목', brief: '브리프' });
  const run = (studs, evs) => R.build(studs, s => evs.filter(e => e.sid === s.id), mis);
  const s1 = { id: 'x1', name: '김철수' };
  const r = run([s1], mk(1, true, 2));
  t('recap: 끝낸 미션 + 튜터 2번 → 항목 1, pairs 2, who s1', r.body.students.length === 1 && r.body.students[0].pairs.length === 2 && r.body.students[0].who === 's1' && r.body.students[0].define === '조건1' && r.body.students[0].title === '제목');
  t('recap: names 로만 이름이 돌아오고 body 에는 없다', r.names.s1 === '김철수' && JSON.stringify(r.body).indexOf('김철수') === -1);
  t('recap: refused 쌍은 refused true', r.body.students[0].pairs[1].refused === true && r.body.students[0].pairs[0].refused === false);
  t('recap: s-wrap 없으면 빠진다', run([s1], mk(1, false, 2)).body.students.length === 0);
  const many = [], evs = [];
  for (let i = 1; i <= 41; i++) { many.push({ id: 'x' + i, name: 'n' + i }); mk(i, true, 1).forEach(e => evs.push(e)); }
  const big = run(many, evs);
  t('recap: 41명 → 40명, truncated', big.body.students.length === 40 && big.truncated === true);
  t('recap: 가장 오래된 한 명이 잘린다', big.body.students.every(x => big.names[x.who] !== 'n1'));
  const tie = [], tevs = [];
  for (let i = 41; i >= 1; i--) { tie.push({ id: 'x' + i, name: 'n' + i }); mk(i, true, 1).forEach(e => { e.t = e.type === 's-wrap' ? 100 : e.t; tevs.push(e); }); }
  const t1 = run(tie, tevs), t2 = run(tie.slice().reverse(), tevs);
  t('recap: 마무리 시각이 같아도 입력 순서와 무관하게 같은 40명', JSON.stringify(Object.keys(t1.names).map(k => t1.names[k]).sort()) === JSON.stringify(Object.keys(t2.names).map(k => t2.names[k]).sort()));
  const e1 = mk(1, true, 2);
  t('recap: 같은 입력 같은 key, s-tutor 추가하면 다른 key', run([s1], e1).key === r.key && run([s1], e1.concat([ev('x1', 's-tutor', { question: 'q', answer: 'a', t: 999 })])).key !== r.key);
  const two = e1.concat([ev('x1', 's-tutor', { question: 'z', answer: 'z', mid: 'm2', t: 20 }), ev('x1', 's-wrap', { text: 'w', mid: 'm2', t: 30 })]);
  const rt = run([s1], two);
  t('recap: 한 학생의 두 미션은 같은 기호', rt.body.students.length === 2 && rt.body.students[0].who === rt.body.students[1].who);
  t('recap: forStudent 는 그 mid 만', R.forStudent(s1, 'm2', s => two, mis).body.students.length === 1);
  t('recap: forStudent key 는 반 전체 key 와 겹치지 않는다', R.forStudent(s1, 'm2', s => two, mis).key !== rt.key);
}

// ── core 는 브라우저 API 를 모른다
const fs = require('fs');
['events.js', 'fold.js', 'engine.js', 'blocks.js', 'missions.js', 'hangul.js', 'alerts.js', 'llmguard.js', 'asks.js', 'pipeline.js', 'pyerr.js', 'onboard.js', 'csv.js', 'codemission.js', 'facts.js', 'recap.js']
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

// ── 발신함은 200개 상한이 없다: 오프라인으로 쌓인 250개가 하나도 안 잘린다 (읽은 기록 KEY 만 200개로 자른다)
{
  const mem = {};
  global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  CC.config.online = () => true; CC.config.retryMs = 1e9; CC.config.batchSize = 50;
  CC.api = { send: () => new Promise(() => {}) };   // 서버가 답이 없다 = 오프라인
  require('../js/data/store.js');
  for (let i = 0; i < 250; i++) CC.store.push({ type: 's-wrap', mid: 'm', text: 'n' + i, v: 1, t: i + 1 });
  t('발신함 250개가 그대로 남는다', JSON.parse(mem['cutcheck.outbox.v1']).length === 250);
  t('읽은 기록은 200개로 자른다', JSON.parse(mem['cutcheck.log.v1']).length === 200);
}

console.log(fail ? '\n실패 ' + fail + '건' : '\n전부 통과');
process.exit(fail ? 1 : 0);
