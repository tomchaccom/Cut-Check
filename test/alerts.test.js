// 교사 알림 core — 학생·미션당 종류별 한 번, 첫 화면 기준선, 사실 문장만
global.window = {};
require('../js/core/hangul.js'); require('../js/core/fold.js'); require('../js/core/alerts.js');
const CC = global.window.CC;
let fail = 0;
function t(name, cond) { console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name); if (!cond) fail++; }

const ev = (type, mid, x) => Object.assign({ type, mid, sid: 'a', t: 1 }, x || {});
const S = (name, extra) => Object.assign({ id: 'a', name, sDesignCount: 0, sCodeJudges: [], onboard: null }, extra || {});
const OPT = evs => ({ eventsOf: () => evs, missionName: m => ({ m1: '분식집 주문', m2: '급식 투표' })[m] });
const run = (name, before, after, extra, opt) => {
  const o = opt || OPT(after);
  return CC.alerts.diff(CC.alerts.snap([S(name, extra)], OPT(before)), CC.alerts.snap([S(name, extra)], o));
};
const kinds = d => d.map(a => a.kind).join(',');

t('기준선 — prev null 이면 []', CC.alerts.diff(null, CC.alerts.snap([S('민지')], OPT([ev('s-redefine', 'm1')]))).length === 0);
t('TAGS · TUTOR_MANY', CC.alerts.TUTOR_MANY === 5 && CC.alerts.TAGS.praise === '칭찬 타이밍' && CC.alerts.TAGS.look === '살펴볼 것' && CC.alerts.TAGS.info === '레벨 테스트');

// finish
const j = ev('s-code-judge', 'm1');
let d = run('한결', [], [j]);
t('finish 로컬 — 한 번, praise, 나침반 문장 없음', kinds(d) === 'finish' && d[0].tag === 'praise' && CC.alerts.say(d[0]) === '한결이 분식집 주문을 마쳤어요.');
t('finish 같은 판정 두 번 → 새 알림 없음', run('한결', [j], [j, ev('s-code-judge', 'm1')]).length === 0);
t('finish 다른 미션은 따로', kinds(run('한결', [j], [j, ev('s-code-judge', 'm2')])) === 'finish');
const sv = CC.alerts.snap([S('태인')], { server: true, finishedOf: () => ['db1'], eventsOf: () => [], missionName: () => '급식 투표' });
d = CC.alerts.diff(CC.alerts.snap([S('태인')], { server: true, finishedOf: () => [], eventsOf: () => [] }), sv);
t('finish 서버 — mid 는 DB id, 나침반 문장', d.length === 1 && d[0].mid === 'db1' && CC.alerts.say(d[0]) === '태인이 급식 투표를 마쳤어요. 나침반을 보고 한마디 적어 주세요.');

// redefine / fixed
d = run('민지', [], [ev('s-redefine', 'm1')]);
t('redefine', kinds(d) === 'redefine' && d[0].tag === 'praise' && CC.alerts.say(d[0]) === '민지가 성공 조건을 스스로 바꿨어요.');
t('redefine 한 번', run('민지', [ev('s-redefine', 'm1')], [ev('s-redefine', 'm1'), ev('s-redefine', 'm1')]).length === 0);
const bad = ev('s-code', 'm1', { code: 'x', error: 'E' });
d = run('민지', [bad], [bad, ev('s-code', 'm1', { code: 'y', error: null })]);
t('fixed — 에러 뒤 다른 코드로 에러 없음', kinds(d) === 'fixed' && CC.alerts.say(d[0]) === '민지가 에러가 난 뒤 스스로 고쳐 다시 돌렸어요.');
t('fixed 아님 — 같은 코드를 다시 돌려 통과', run('민지', [bad], [bad, ev('s-code', 'm1', { code: 'x', error: null })]).length === 0);
t('fixed 아님 — 에러 없던 코드만', run('민지', [], [ev('s-code', 'm1', { code: 'y', error: null })]).length === 0);
t('fixed 한 번', run('민지', [bad, ev('s-code', 'm1', { code: 'y' })], [bad, ev('s-code', 'm1', { code: 'y' }), bad, ev('s-code', 'm1', { code: 'z' })]).length === 0);

// hardcode — CC.facts 를 가짜로
CC.facts = { of: () => [{ kind: 'hardcode', text: '' }] };
const hc = Object.assign(OPT([ev('s-code', 'm1', { code: 'a' })]), { missionOf: m => ({ id: m }) });
d = CC.alerts.diff(CC.alerts.snap([S('나')], Object.assign({}, hc, { eventsOf: () => [] })), CC.alerts.snap([S('나')], hc));
t('hardcode — look, 한 번', kinds(d) === 'hardcode' && d[0].tag === 'look' &&
  CC.alerts.say(d[0]) === '나 — 새로 온 자료에서도 첫 자료와 결과가 같아요. 하드코딩일 수 있어요.' &&
  CC.alerts.diff(CC.alerts.snap([S('나')], hc), CC.alerts.snap([S('나')], hc)).length === 0);
CC.facts = { of: () => [{ kind: 'error' }] };
t('hardcode 아님 — 다른 사실은 알리지 않는다', CC.alerts.diff(CC.alerts.snap([S('나')], Object.assign({}, hc, { eventsOf: () => [] })), CC.alerts.snap([S('나')], hc)).length === 0);
delete CC.facts;

// tutor-many
const tu = n => Array.from({ length: n }, () => ev('s-tutor', 'm1'));
t('tutor-many 4→0, 4→5→1, 5→6→0', run('민지', tu(3), tu(4)).length === 0 && kinds(run('민지', tu(4), tu(5))) === 'tutor-many' && run('민지', tu(5), tu(6)).length === 0);
d = run('한결', tu(4), tu(5));
t('tutor-many 문장 — look, 5번', d[0].tag === 'look' && CC.alerts.say(d[0]) === '한결이 분식집 주문에서 튜터에게 5번 물었어요.');
t('tutor-many 미션별로 센다', run('민지', tu(4), tu(4).concat([ev('s-tutor', 'm2')])).length === 0);

// level
CC.onboard = { LABEL: { combine: '중' } };
const lv = { onboard: { stage: 'combine', skipped: false } };
d = CC.alerts.diff(CC.alerts.snap([S('태인')], OPT([])), CC.alerts.snap([S('태인', lv)], OPT([])));
t('level — info, 레벨 문장', kinds(d) === 'level' && d[0].tag === 'info' && CC.alerts.say(d[0]) === '태인이 레벨 테스트를 마쳤어요. 레벨 중.');
t('level 건너뜀은 알리지 않는다', CC.alerts.diff(CC.alerts.snap([S('태인')], OPT([])), CC.alerts.snap([S('태인', { onboard: { stage: null, skipped: true } })], OPT([]))).length === 0);
delete CC.onboard;
d = CC.alerts.diff(CC.alerts.snap([S('태인')], OPT([])), CC.alerts.snap([S('태인', lv)], OPT([])));
t('level — CC.onboard 없으면 레벨 문장 생략', CC.alerts.say(d[0]) === '태인이 레벨 테스트를 마쳤어요.');

// design / code (옛 알림 — 기록을 못 읽을 때)
const a = CC.alerts.snap([S('나')]), b = CC.alerts.snap([S('나', { sCodeJudges: [{}] })]), c = CC.alerts.snap([S('나', { sDesignCount: 1 })]);
t('code · design 유지', kinds(CC.alerts.diff(a, b)) === 'code' && CC.alerts.say(CC.alerts.diff(a, b)[0]) === '내가 코드 결과를 판정했어요.' &&
  kinds(CC.alerts.diff(a, c)) === 'design' && CC.alerts.say(CC.alerts.diff(a, c)[0]) === '내가 설계도를 냈어요.');

// 조사 · 칭찬 낱말
const all = [['finish', '한결'], ['finish', '태인'], ['redefine', '한결'], ['fixed', '태인'], ['tutor-many', '한결'], ['level', '태인'], ['design', '한결'], ['code', '태인']]
  .map(([kind, name]) => CC.alerts.say({ kind, name, mission: '급식 투표' }));
t('조사 — 한결이 · 태인이', all.every(s => /^(한결이|태인이) /.test(s)));
t('칭찬 낱말 없음', all.every(s => !/잘했|훌륭|대단|최고/.test(s)));

process.exit(fail ? 1 : 0);
