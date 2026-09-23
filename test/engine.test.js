// 엔진 검증: 미션별 정답 순서가 실제로 통과하는지, 반례가 실제로 깨지는지
global.window = {};
require('../js/core/blocks.js'); require('../js/core/missions.js'); require('../js/core/engine.js');
const CC = global.window.CC;
let fail = 0;
function t(name, cond){ console.log((cond?'  ok  ':'  FAIL') + ' ' + name); if(!cond) fail++; }

function cfgOf(m, sep){ return {sep, targets: m.targets?m.targets.list:[], sample:m.cut.sample,
  textVar:m.vars.textVar, listVar:m.vars.listVar, targetVar:m.vars.targetVar}; }

// ── 미션 01
const m1 = CC.mission('m1');
const s1 = ['input','cut','trim','save'];
console.log('\n[m1] 쉼표 기준 + 정답 순서');
m1.inputs.forEach(inp=>{
  const r = CC.engine.run(s1, cfgOf(m1,','), inp.v);
  const ok = m1.goal(r, inp);
  t(`${inp.name} → ${r.err?'멈춤':JSON.stringify(r.value)} / goal=${ok}`, inp.counter ? !ok : ok);
});
console.log('[m1] 블록을 빠뜨렸을 때 위치를 정확히 짚는가');
t('cut만 있고 input 없음 → 1번 블록 지목', (()=>{const r=CC.engine.run(['cut'],cfgOf(m1,','),'a,b'); return r.err===1 && r.at===0;})());
t('loop 앞에 목록이 없음 → loop 위치 지목', (()=>{const r=CC.engine.run(['input','loop'],cfgOf(m1,','),'a,b'); return r.err===1 && r.at===1;})());
t('cut 두 번 → 두 번째 cut 지목', (()=>{const r=CC.engine.run(['input','cut','cut'],cfgOf(m1,','),'a,b'); return r.err===1 && r.at===2;})());
t('빈 블록 → 데이터 없음', (()=>{const r=CC.engine.run([],cfgOf(m1,','),'a,b'); return r.err===1 && r.at===-1;})());

// ── 미션 02
const m2 = CC.mission('m2');
const s2 = ['input','cut','trim','loop','check','collect','show'];
console.log('\n[m2] 쉼표 기준 + 정답 순서');
m2.inputs.forEach(inp=>{
  const r = CC.engine.run(s2, cfgOf(m2,','), inp.v);
  t(`${inp.name} → ${JSON.stringify(r.value)}`, m2.goal(r, inp));
});
t('세 번째(주의 재료 없음)는 빈 목록이어야', (()=>{const r=CC.engine.run(s2,cfgOf(m2,','),'사과, 바나나, 물'); return r.value.length===0;})());
t('trim 없으면 공백 때문에 하나도 못 걸러냄 (핵심 학습 순간)', (()=>{
  const r=CC.engine.run(['input','cut','loop','check','collect'],cfgOf(m2,','),'사과, 우유, 빵');
  return r.value.length===0; })());
t('trim 없는 순서는 goal 도 실패해야', (()=>{
  const inp=m2.inputs[0];
  const r=CC.engine.run(['input','cut','loop','check','collect'],cfgOf(m2,','),inp.v);
  return m2.goal(r,inp)===false; })());
t('collect 앞에 check 없으면 멈춤', (()=>{const r=CC.engine.run(['input','cut','loop','collect'],cfgOf(m2,','),'a,b'); return r.err===1 && r.at===3;})());

// ── 미션 03 (전이)
const m3 = CC.mission('m3');
const s3 = ['input','cut','trim','loop','check','collect','show'];
console.log('\n[m3] → 기준 + 정답 순서');
m3.inputs.forEach(inp=>{
  const r = CC.engine.run(s3, cfgOf(m3,'→'), inp.v);
  t(`${inp.name} → ${JSON.stringify(r.value)}`, m3.goal(r, inp));
});
t('띄어쓰기로 자르면 위험 단계를 못 찾음(반례)', (()=>{
  const r=CC.engine.run(s3,cfgOf(m3,' '),'물 붓기 → 알코올램프 켜기 → 온도 재기');
  return r.value.length===0; })());

// ── Python 변환
console.log('\n[python] 들여쓰기');
const cfg2 = cfgOf(m2,','); cfg2.targetList = m2.targets.list;
const py = CC.engine.toPython(s2, cfg2).map(l=>l.code);
py.forEach(l=>console.log('    | '+l));
t('준비 줄이 먼저 나옴', py[0].startsWith('allergy =') && py[1]==='found = []');
t('for 다음 줄은 들여쓰기됨', py[6].startsWith('    '));
t('if 다음 줄은 두 번 들여쓰기됨', py[7].startsWith('        '));


/* ── 졸업 과제: 학생이 직접 만든 입력도 옳게 판정되는가 ────────
 * 미션이 정해둔 구분자로 정답을 계산하면 학생이 만든 입력을 오판한다.
 * 이 검사가 실제로 버그를 잡았다. */
console.log('\n[졸업 과제 판정]');
const g1 = cfgOf(m1, ',');
t('m1 · 쉼표 없는 입력을 넣으면 깨진 것으로 판정',
  m1.goal(CC.engine.run(['input','cut','trim','save'], g1, '사과 바나나 우유'), {v:'사과 바나나 우유'}) === false);
t('m1 · 상품 하나짜리 입력은 깨진 게 아님',
  m1.goal(CC.engine.run(['input','cut','trim','save'], g1, '사과'), {v:'사과'}) === true);
t('m1 · 쉼표로 잘 잘리는 입력은 통과',
  m1.goal(CC.engine.run(['input','cut','trim','save'], g1, '사과,배,감'), {v:'사과,배,감'}) === true);

const g2 = cfgOf(m2, ',');
const s2ok = ['input','cut','trim','loop','check','collect'];
t('m2 · 가운뎃점으로 만든 입력은 깨진 것으로 판정 (우유가 원문에 있는데 못 찾음)',
  m2.goal(CC.engine.run(s2ok, g2, '사과·우유·빵'), {v:'사과·우유·빵'}) === false);
t('m2 · 주의 재료가 없는 입력은 빈 목록이 정답',
  m2.goal(CC.engine.run(s2ok, g2, '사과, 배, 감'), {v:'사과, 배, 감'}) === true);

/* ── 미션 06: 블록을 늘리는 규칙이 실제로 작동하는가 ──────────
 * count 와 unique 를 추가한 근거는 '새로운 판단을 데려온다' 였다.
 * 그 판단이 없으면 이 미션이 실제로 깨져야 한다. 안 깨지면 블록을 넣을 이유가 없었던 것이다. */
console.log('\n[미션 06 · 세어보기]');
const m6 = CC.mission('m6');
const g6 = { sep: ',', targets: [] };
const naive = ['input','cut','trim','count'];
const withUnique = ['input','cut','trim','unique','count'];

m6.inputs.forEach(inp => {
  const r = CC.engine.run(naive, g6, inp.v);
  const ok = m6.goal(r, inp);
  t(`같은 건 하나로 없이 · ${inp.name} → ${r.value} / goal=${ok}`, inp.counter ? !ok : ok);
});
m6.inputs.forEach(inp => {
  const r = CC.engine.run(withUnique, g6, inp.v);
  t(`같은 건 하나로 포함 · ${inp.name} → ${r.value}`, m6.goal(r, inp));
});
t('숫자가 된 뒤에는 자르기가 막힌다',
  (() => { const r = CC.engine.run(['input','cut','count','cut'], g6, 'a,b'); return r.err === 1 && r.at === 3; })());
t('숫자가 된 뒤에는 반복도 막힌다',
  (() => { const r = CC.engine.run(['input','cut','count','loop'], g6, 'a,b'); return r.err === 1 && r.at === 3; })());

console.log('\n' + (fail ? `실패 ${fail}건` : '전체 통과'));
process.exit(fail?1:0);
