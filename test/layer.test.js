// 계층 검증: 이벤트 계약 / 접기 / 전송 어댑터
// core 는 저장소도 네트워크도 모른다. 그 경계가 실제로 지켜지는지 여기서 본다.
global.window = {};
require('../js/core/events.js');
require('../js/core/fold.js');
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

// ── core 는 브라우저 API 를 모른다
const fs = require('fs');
['events.js', 'fold.js', 'engine.js', 'blocks.js', 'missions.js', 'hangul.js', 'llmguard.js', 'asks.js']
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
