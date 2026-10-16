/* LLM 출력 검사기 검증.
 * 통과해야 하는 문장보다 **거부해야 하는 문장**을 더 많이 넣는다 —
 * 이 검사기의 일은 통과시키는 게 아니라 막는 것이다.
 */
global.window = {};
require('../js/core/llmguard.js');
const { check, guard } = global.window.CC.llmguard;
let fail = 0;
function t(name, cond) { console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name); if (!cond) fail++; }

console.log('\n[통과해야 하는 것]');
[
  ['ask', '지금 순서를 처음부터 읽으면, 자르는 일은 몇 번째에 일어나?'],
  ['ask', '아까 성공이 뭐라고 정했었지?'],
  ['ask', '세 번째 주문서에서는 상품이 몇 개로 세어졌어?'],
  ['fact', '2번 블록이 자를 데이터를 아직 못 받았어요.'],
  ['fact', '세 번째 주문서에서 결과가 한 조각이었어요.']
].forEach(([m, s]) => {
  const r = check(s, m);
  t(`[${m}] ${s.slice(0, 28)}…`, r.ok || console.log('       → ' + r.reasons.join(' / ')) === undefined && r.ok);
});

console.log('\n[막아야 하는 것]');
[
  ['ask', '잘했어요! 거의 다 왔네요?', '칭찬'],
  ['ask', '자르기 블록을 1번 앞에 넣으세요?', '해법 지시'],
  ['fact', 'items = order_text.split(",") 로 바꾸세요.', '코드 + 해법'],
  ['ask', '정답은 쉼표가 아니라 띄어쓰기야?', '정답 공개'],
  ['ask', '네 순서를 보니 자르기 블록이 없어서 안 나뉜 거야. 그러니까 자르기를 넣고 다시 돌려보면 될 것 같은데 어때?', '길이 + 해법'],
  ['fact', '2번 블록이 뭘 기다리고 있을까요?', 'fact 인데 질문'],
  ['ask', '2번 블록이 멈췄어요.', 'ask 인데 질문이 아님'],
  ['ask', '', '빈 출력'],
  ['whisper', '안녕?', '허용되지 않은 모드']
].forEach(([m, s, why]) => {
  const r = check(s, m);
  t(`${why} → 거부`, !r.ok);
});

console.log('\n[폴백]');
const g1 = guard('잘했어요! 정답이야.', 'ask');
t('위반 시 폴백 문장으로 대체', !g1.ok && g1.text === '지금 네가 만든 순서를 처음부터 한 번 읽어볼래?');
const g2 = guard('아까 성공이 뭐라고 정했었지?', 'ask');
t('통과 시 원문 유지', g2.ok && g2.text === '아까 성공이 뭐라고 정했었지?');
const g3 = guard('2번 블록이 값을 못 받았어요.', 'fact');
t('fact 통과', g3.ok);

console.log('\n' + (fail ? `실패 ${fail}건` : '전체 통과'));


/* ── 우리가 실제로 쓰는 문장이 규칙을 지키는가 ──────────────
 * 이 검사가 이 파일에서 제일 중요하다. 우리 손으로 쓴 문장이 규칙을 못 지키면
 * 모델에게 지키라고 할 자격이 없다. */
require('../js/core/asks.js');
require('../js/core/blocks.js');
require('../js/core/missions.js');
require('../js/core/engine.js');
const CC = global.window.CC;

console.log('\n[실제 사용 문장 검사]');
let fail2 = 0;
Object.keys(CC.ASKS).forEach(k => {
  const r = check(CC.ASKS[k], 'ask');
  console.log((r.ok ? '  ok  ' : '  FAIL') + ' ask: ' + CC.ASKS[k]);
  if (!r.ok) { console.log('       → ' + r.reasons.join(' / ')); fail2++; }
});

/* 엔진이 실제로 뱉는 에러 메시지 전부 */
const cfg = { sep: ',', targets: ['우유'] };
[
  [['cut'], 'a,b'],
  [['input', 'cut', 'cut'], 'a,b'],
  [['input', 'loop'], 'a,b'],
  [['input', 'cut', 'collect'], 'a,b'],
  [['input', 'trim'], 'a,b'],
  [['save'], 'a,b'],
  [[], 'a,b']
].forEach(([blocks, text]) => {
  const r = CC.engine.run(blocks, cfg, text);
  if (r.err) {
    const g = check(r.msg, 'fact');
    console.log((g.ok ? '  ok  ' : '  FAIL') + ' fact: ' + r.msg);
    if (!g.ok) { console.log('       → ' + g.reasons.join(' / ')); fail2++; }
  }
});

/* 학생 화면 고정 문장: 튜터 거절 · 튜터 불가 · 파이썬 불러오기 실패 · 시간 초과 · input() */
require('../js/core/pyerr.js');
const fs = require('fs'), rd = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const fixed = [];
(rd('api/_tutor.py').match(/REFUSE = \{[\s\S]*?\n\}/)[0].match(/: '([^']+)'/g) || []).forEach(x => fixed.push(x.slice(3, -1)));
fixed.push(rd('js/ui/tutor.js').match(/UNAVAILABLE = '([^']+)'/)[1]);
fixed.push(rd('js/ui/sentence.js').match(/LOAD_FAIL = '([^']+)'/)[1]);
fixed.push(CC.pyerr.TIMEOUT, CC.pyerr.NO_INPUT);
if (fixed.length !== 7) { console.log('  FAIL 고정 문장 수집: ' + fixed.length); fail2++; }
fixed.forEach(m => {
  /* 블록·주문서 같은 대상 단어 요구는 엔진 에러용 규칙이라 뺀다. 칭찬·해법·진단·코드·길이는 그대로 건다 */
  const why = check(m, 'fact').reasons.filter(x => x.indexOf('무엇에 대한 사실') < 0);
  console.log((why.length ? '  FAIL' : '  ok  ') + ' fixed: ' + m);
  if (why.length) { console.log('       → ' + why.join(' / ')); fail2++; }
});

console.log('\n' + (fail2 ? `실제 문장 실패 ${fail2}건` : '실제 문장 전부 통과'));
process.exit(fail || fail2 ? 1 : 0);
