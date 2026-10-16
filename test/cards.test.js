/* test/cards.test.js — 설계 카드 카탈로그
 *   node test/cards.test.js
 */
global.window = global;
require('../js/core/pipeline.js');
require('../js/core/cards.js');
const CC = global.CC;
let fail = 0;
const t = (name, ok, extra) => { console.log((ok ? '  ok  ' : '  FAIL') + ' ' + name); if (!ok) { fail++; if (extra !== undefined) console.log('       → ' + JSON.stringify(extra)); } };

CC.pipeline.WHITELIST.forEach(w => {
  const cards = CC.cards.forMission({ pipelineId: w.id, filterDesc: '알레르기 목록' });
  const real = cards.filter(c => !c.decoy), decoy = cards.filter(c => c.decoy);
  t(w.id + ': 연산마다 카드 하나', real.length === w.ops.length, cards.map(c => c.op));
  t(w.id + ': 헷갈리는 카드 1장, 그 유형에 없는 연산', decoy.length === 1 && w.ops.indexOf(decoy[0].op) < 0, decoy);
  const labels = cards.map(c => c.label);
  t(w.id + ': 카드 이름이 겹치지 않는다', new Set(labels).size === labels.length, labels);
  t(w.id + ': 가나다순 (고르는 순서를 드러내지 않는다)', labels.join() === labels.slice().sort((a, b) => a.localeCompare(b, 'ko')).join(), labels);
});

const f = CC.cards.forMission({ pipelineId: 'split-filter-count', filterDesc: '알레르기 목록' }).filter(c => c.op === 'filter')[0];
t('골라내기 세부 이름에 걸러낼 대상 이름', f.detail.name === '알레르기 목록에', f.detail);
const old = CC.cards.forMission({ pipelineId: 'split-filter-count' }).filter(c => c.op === 'filter')[0];
t('filterDesc 가 없는 예전 미션은 "목록에"', old.detail.name === '목록에', old.detail);
const num = CC.cards.forMission({ pipelineId: 'split-filter-num-sum' }).filter(c => c.op === 'filter')[0];
t('숫자 유형의 골라내기는 "글자 빼기", 세부 없음', num.label === '글자 빼기' && num.detail === null, num);
t('모르는 유형은 빈 목록', CC.cards.forMission({ pipelineId: 'nope' }).length === 0 && CC.cards.forMission(null).length === 0);

t('카드 문장', CC.cards.text({ label: '나누기', detail: '기준: 쉼표' }) === '나누기 (기준: 쉼표)' &&
  CC.cards.text({ label: '개수 세기', detail: '' }) === '개수 세기');
t('코드 뼈대 — 번호 주석과 빈 줄',
  CC.cards.skeleton([{ op: 'split', label: '나누기', detail: '기준: 쉼표' }, { op: 'count', label: '개수 세기', detail: '' }]) ===
  '# 1. 나누기 (기준: 쉼표)\n\n# 2. 개수 세기\n\n');
const every = CC.cards.ALL_LABELS.join(' ');
t('함수 이름을 보여주지 않는다', !/split|set|len|sum|sort|join|strip|int\(/.test(every), every);
t('대놓고 틀린 보기 없음', !/항상|숫자 3/.test(every), every);

console.log('\n' + (fail ? 'FAIL ' + fail : '전부 통과'));
process.exit(fail ? 1 : 0);
