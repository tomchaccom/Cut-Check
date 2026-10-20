// 나침반 core — 알림은 학생·미션당 한 번, svg 는 순수 문자열
global.window = {};
require('../js/core/hangul.js'); require('../js/core/alerts.js'); require('../js/core/compass.js');
const CC = global.window.CC;
let fail = 0;
function t(name, cond) { console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name); if (!cond) fail++; }

const S = (id, name, ms) => ({ id, name, sDesignCount: 0, sCodeJudges: [], ms });
const fin = s => s.ms;
const first = CC.alerts.snap([S('a', '민지', ['m1'])], { finishedOf: fin });
t('첫 snap 에 있던 것은 알리지 않는다', CC.alerts.diff(null, first).length === 0 && CC.alerts.diff(first, CC.alerts.snap([S('a', '민지', ['m1'])], { finishedOf: fin })).length === 0);
const s1 = CC.alerts.snap([S('a', '민지', ['m1', 'm2'])], { finishedOf: fin });
const d1 = CC.alerts.diff(first, s1);
t('다른 미션은 finish 한 번 더', d1.length === 1 && d1[0].kind === 'finish' && d1[0].dbId === 'm2' && d1[0].id === 'a');
const again = CC.alerts.snap([Object.assign(S('a', '민지', ['m1', 'm2']), { sCodeJudges: [{}, {}] })], { finishedOf: fin });
t('finish once — 같은 미션을 다시 판정해도 알리지 않고 code 알림도 없다', CC.alerts.diff(s1, again).length === 0);
t('로컬(finishedOf 없음)은 예전 그대로 code', (() => {
  const a = CC.alerts.snap([S('a', '나', [])]), b = CC.alerts.snap([Object.assign(S('a', '나', []), { sCodeJudges: [{}] })]);
  const d = CC.alerts.diff(a, b); return d.length === 1 && d[0].kind === 'code' && CC.alerts.say(d[0]) === '내가 코드 결과를 판정했어요.';
})());
t('say finish — 조사', CC.alerts.say({ kind: 'finish', name: '민지', compass: true }) === '민지가 미션을 마쳤어요. 나침반을 보고 한마디 적어 주세요.' &&
  CC.alerts.say({ kind: 'finish', name: '한결', compass: true }).indexOf('한결이 ') === 0);

const none = CC.compass.svg(null, null);
t('svg(null,null) 은 바늘이 없다', none.indexOf('<svg') === 0 && none.indexOf('rotate(') < 0 && none.indexOf('compass-poly') < 0);
const full = CC.compass.svg(18.4, 0.9);
t('svg 바늘 · 방향 이름 · 다각형 없음', full.indexOf('rotate(18.4') > 0 && full.indexOf('compass-poly') < 0 && full.indexOf('aria-label="북쪽 · 이해"') > 0);
const tipY = x => +/<g class="compass-needle"[^>]*><polygon points="60,([-\d.]+) /.exec(x)[1];
t('svg 바늘 길이 — 길이 비율이 클수록 끝이 멀다, 범위 밖은 0.25~0.9', tipY(CC.compass.svg(0, 0.25)) > tipY(CC.compass.svg(0, 0.6)) && tipY(CC.compass.svg(0, 0.6)) > tipY(CC.compass.svg(0, 0.9)) &&
  tipY(CC.compass.svg(0, 0.01)) === tipY(CC.compass.svg(0, 0.25)) && tipY(CC.compass.svg(0, 5)) === tipY(CC.compass.svg(0, 0.9)));
t('svg 부채꼴 경계 — 45 는 동쪽, 315 는 북쪽', CC.compass.svg(45).indexOf('동쪽 · 설계') > 0 && CC.compass.svg(315).indexOf('북쪽 · 이해') > 0 && CC.compass.svg(270).indexOf('서쪽 · 검증') > 0);
t('DIRS · 모양 · 이름', CC.compass.DIRS.S === '남쪽 · 구현' && ['N','E','S','W'].map(d => CC.compass.SHAPE[d]).join('') === '▲◧○◇' && CC.compass.NAME.W === '검증');
t('line · even — 방향 낱말, 길이 0.3 이하면 고르게', CC.compass.line('E') === '동쪽으로 가고 있어요' && CC.compass.line(null) === '' && CC.compass.even(0.3) && !CC.compass.even(0.31) && !CC.compass.even(null));
if (fail) { console.log(fail + ' 실패'); process.exit(1); }
