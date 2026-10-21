// 교사 알림 core — 학생·미션당 종류별 한 번, 첫 화면 기준선, 사실 문장만
global.window = {};
require('../js/core/hangul.js'); require('../js/core/fold.js'); require('../js/core/alerts.js'); require('../js/core/compass.js');
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
t('finish 서버 — dbId, 나침반 문장', d.length === 1 && d[0].dbId === 'db1' && CC.alerts.say(d[0]) === '태인이 급식 투표를 마쳤어요. 나침반을 보고 한마디 적어 주세요.');

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
{ // 사실이 사라졌다 다시 생겨도(facts.of 가 probe 사실을 숨기는 경우) 다시 알리지 않는다
  let on = true; CC.facts = { of: () => on ? [{ kind: 'hardcode' }] : [] };
  const a = CC.alerts.snap([S('나')], Object.assign({}, hc, { eventsOf: () => [] }));
  const b = CC.alerts.snap([S('나')], hc); const n1 = CC.alerts.diff(a, b);
  on = false; const c = CC.alerts.snap([S('나')], hc); const n2 = CC.alerts.diff(b, c);
  on = true; const e = CC.alerts.snap([S('나')], hc); const n3 = CC.alerts.diff(c, e);
  t('hardcode — 나타났다 사라졌다 다시 나타나도 알림은 한 번', n1.length === 1 && n2.length === 0 && n3.length === 0);
}
CC.facts = { of: () => [{ kind: 'error' }] };
t('hardcode 아님 — 다른 사실은 알리지 않는다', CC.alerts.diff(CC.alerts.snap([S('나')], Object.assign({}, hc, { eventsOf: () => [] })), CC.alerts.snap([S('나')], hc)).length === 0);
delete CC.facts;

// tutor-many
const tu = n => Array.from({ length: n }, () => ev('s-tutor', 'm1'));
t('tutor-many 4→0, 4→5→1, 5→6→0', run('민지', tu(3), tu(4)).length === 0 && kinds(run('민지', tu(4), tu(5))) === 'tutor-many' && run('민지', tu(5), tu(6)).length === 0);
d = run('한결', tu(4), tu(5));
t('tutor-many 문장 — look, 5번', d[0].tag === 'look' && CC.alerts.say(d[0]) === '한결이 분식집 주문에서 튜터에게 5번 물었어요.');
t('tutor-many 미션별로 센다', run('민지', tu(4), tu(4).concat([ev('s-tutor', 'm2')])).length === 0);

// tutor-stuck — 연달아 거절 3번. 사이에 답을 받으면 다시 센다
const no = () => ev('s-tutor', 'm1', { refused: true }), yes = () => ev('s-tutor', 'm1', { refused: false });
d = run('한결', [no(), no()], [no(), no(), no()]);
t('tutor-stuck 2→3 — look, 문장', kinds(d) === 'tutor-stuck' && d[0].tag === 'look' && CC.alerts.say(d[0]) === '한결이 분식집 주문에서 튜터에게 3번 연달아 답을 못 받았어요.');
t('tutor-stuck 사이에 답을 받으면 안 센다', run('한결', [], [no(), no(), yes(), no()]).length === 0);

// level
CC.onboard = { LABEL: { combine: '중' } };
const lv = { onboard: { stage: 'combine', skipped: false } };
d = CC.alerts.diff(CC.alerts.snap([S('태인')], OPT([])), CC.alerts.snap([S('태인', lv)], OPT([])));
t('level — info, 레벨 문장', kinds(d) === 'level' && d[0].tag === 'info' && CC.alerts.say(d[0]) === '태인이 레벨 테스트를 마쳤어요. 레벨 중.');
t('level — 재테스트를 마치면 한 번 더', CC.alerts.diff(CC.alerts.snap([S('태인', { onboard: { stage: 'combine', skipped: false, t: 1 } })], OPT([])), CC.alerts.snap([S('태인', { onboard: { stage: 'combine', skipped: false, t: 2 } })], OPT([]))).length === 1);
t('level 건너뜀은 알리지 않는다', CC.alerts.diff(CC.alerts.snap([S('태인')], OPT([])), CC.alerts.snap([S('태인', { onboard: { stage: null, skipped: true } })], OPT([]))).length === 0);
delete CC.onboard;
d = CC.alerts.diff(CC.alerts.snap([S('태인')], OPT([])), CC.alerts.snap([S('태인', lv)], OPT([])));
t('level — CC.onboard 없으면 레벨 문장 생략', CC.alerts.say(d[0]) === '태인이 레벨 테스트를 마쳤어요.');

// retest — 60일, 학생·마지막 테스트당 키 하나, 지정하면 없다
const DAY = 864e5, NOW = 100 * DAY;
const ob = t0 => ({ onboard: { stage: 'combine', skipped: false, t: t0 } });
t('RETEST_DAYS 60', CC.alerts.RETEST_DAYS === 60);
t('retest — 59일은 아직', CC.alerts.retest([S('태인', ob(NOW - 59 * DAY))], NOW).length === 0);
let r = CC.alerts.retest([S('태인', ob(NOW - 60 * DAY))], NOW);
t('retest — 60일이면 info, 정해진 문장', r.length === 1 && r[0].tag === 'info' && r[0].kind === 'retest' && CC.alerts.say(r[0]) === '태인의 레벨 테스트가 두 달 지났어요. 다시 지정할까요?');
t('retest — 키는 학생·마지막 테스트', r[0].key === 'a:' + (NOW - 60 * DAY));
t('retest — 다시 지정했으면(waiting) 없다', CC.alerts.retest([S('태인', ob(0))], NOW, () => true).length === 0);
t('retest — 건너뛴 기록·기록 없음은 없다', CC.alerts.retest([S('태인', { onboard: { stage: null, skipped: true, t: 0 } }), S('가은')], NOW).length === 0);
t('retest — 마지막이 건너뛰기여도 앞 테스트가 60일 지났으면 뜬다', CC.alerts.retest([S('태인', { onboard: { stage: null, skipped: true, t: NOW, tDone: NOW - 60 * DAY } })], NOW).length === 1);
t('retest — 순서·소요 시간·점수 칸이 없다', Object.keys(r[0]).sort().join() === 'dbId,id,key,kind,mid,name,tag');

// design / code (옛 알림 — 기록을 못 읽을 때)
const a = CC.alerts.snap([S('나')]), b = CC.alerts.snap([S('나', { sCodeJudges: [{}] })]), c = CC.alerts.snap([S('나', { sDesignCount: 1 })]);
t('code · design 유지', kinds(CC.alerts.diff(a, b)) === 'code' && CC.alerts.say(CC.alerts.diff(a, b)[0]) === '내가 코드 결과를 판정했어요.' &&
  kinds(CC.alerts.diff(a, c)) === 'design' && CC.alerts.say(CC.alerts.diff(a, c)[0]) === '내가 설계도를 냈어요.');

// 조사 · 칭찬 낱말
const all = [['finish', '한결'], ['finish', '태인'], ['redefine', '한결'], ['fixed', '태인'], ['tutor-many', '한결'], ['level', '태인'], ['design', '한결'], ['code', '태인']]
  .map(([kind, name]) => CC.alerts.say({ kind, name, mission: '급식 투표' }));
t('조사 — 한결이 · 태인이', all.every(s => /^(한결이|태인이) /.test(s)));
t('칭찬 낱말 없음', all.every(s => !/잘했|훌륭|대단|최고/.test(s)));

// 서버 모드 — 모든 종류가 mid(클라이언트) 와 dbId 를 같은 뜻으로 싣고, 문장에 미션 이름이 들어간다
const sev = (n, mid, type) => Array.from({ length: n }, () => Object.assign(ev(type, mid), { _missionDbId: 'db-' + mid }));
const svOpt = evs => ({ server: true, eventsOf: s => evs.filter(e => e.sid === s.id), finishedOf: s => evs.filter(e => e.sid === s.id && e.type === 's-code-judge').map(e => e._missionDbId),
  missionName: mid => ({ m1: '분식집 주문' })[mid] });
const P = [{ id: 'a', name: '한결', sDesignCount: 0, sCodeJudges: [] }, { id: 'b', name: '태인', sDesignCount: 0, sCodeJudges: [] }];
const mk = evs => CC.alerts.snap(P, svOpt(evs));
const bEv = (n, type) => sev(n, 'm1', type).map(e => Object.assign(e, { sid: 'b' }));
d = CC.alerts.diff(mk(sev(4, 'm1', 's-tutor')), mk(sev(5, 'm1', 's-tutor').concat(bEv(5, 's-tutor'))));
t('서버 tutor-many — 문장에 미션 이름, mid · dbId, 학생 둘 따로', d.length === 2 && d.every(a => a.mid === 'm1' && a.dbId === 'db-m1') &&
  CC.alerts.say(d.filter(a => a.id === 'a')[0]) === '한결이 분식집 주문에서 튜터에게 5번 물었어요.' && d.filter(a => a.id === 'b').length === 1);
d = CC.alerts.diff(mk([]), mk(sev(1, 'm1', 's-code-judge')));
t('서버 finish — mid 는 기록 id, dbId 는 서버 id', d.length === 1 && d[0].mid === 'm1' && d[0].dbId === 'db-m1' && /분식집 주문을/.test(CC.alerts.say(d[0])));
d = run('한결', [], [ev('s-redefine', 'm1')]);
t('로컬 알림 dbId 는 null', d[0].mid === 'm1' && d[0].dbId === null);

// 순서 없이 들어온 기록 · mid 없는 기록
const late = ev('s-code', 'm1', { code: 'y', error: null, t: 9 }), early = ev('s-code', 'm1', { code: 'x', error: 'E', t: 2 });
t('fixed — 기록 순서가 뒤섞여도 시각순으로 본다', kinds(run('민지', [], [late, early])) === 'fixed');
t('mid 없는 기록은 건너뛴다(죽지 않는다)', run('민지', [], [{ type: 's-redefine', sid: 'a' }, { type: 's-tutor' }, ev('s-code-judge', '')]).length === 0);

// cancel — 학생·가장 최근 미션당 한 번, 첫 화면 기준선, 사실 문장
const CO = (dbId, cands) => ({ eventsOf: () => [], missionName: () => '', cancelOf: () => dbId ? { dbId, cands } : null });
const c0 = CC.alerts.snap([S('태인')], CO(null));
const c1 = CC.alerts.snap([S('태인')], CO('db2', ['N', 'S']));
d = CC.alerts.diff(c0, c1);
t('cancel — 북·남 후보, praise, 정확한 문장', d.length === 1 && d[0].kind === 'cancel' && d[0].tag === 'praise' && d[0].dbId === 'db2' &&
  CC.alerts.say(d[0]) === '태인이 최근 미션에서 이해와 구현이 같이 두드러져요. 어느 쪽이 더 보였는지 골라 주세요.');
t('cancel — 동·서 후보는 설계와 검증, 조사 계산', CC.alerts.say({ kind: 'cancel', name: '한결', cands: ['E', 'W'] }) === '한결이 최근 미션에서 설계와 검증이 같이 두드러져요. 어느 쪽이 더 보였는지 골라 주세요.');
t('cancel — 넷이면 네 방향 문장', CC.alerts.say({ kind: 'cancel', name: '민지', cands: ['N', 'E', 'S', 'W'] }) === '민지가 최근 미션에서 네 방향이 고르게 보여요. 어느 쪽이 더 보였는지 골라 주세요.');
t('cancel — 같은 미션은 다시 계산해도 한 번', CC.alerts.diff(c1, CC.alerts.snap([S('태인')], CO('db2', ['N', 'S']))).length === 0);
const gone = CC.alerts.snap([S('태인')], CO(null));
const back = CC.alerts.diff(c1, gone);   // 고른 뒤 사라짐 — diff 가 알린 키를 gone 에 되살린다
t('cancel — 고른 뒤 사라졌다 돌아와도 한 번', back.length === 0 && CC.alerts.diff(gone, CC.alerts.snap([S('태인')], CO('db2', ['N', 'S']))).length === 0);
t('cancel — 더 최근 미션에서 또 겹치면 다시 한 번', kinds(CC.alerts.diff(c1, CC.alerts.snap([S('태인')], CO('db3', ['E', 'W'])))) === 'cancel');
t('cancel — 처음 snap 에 이미 겹쳐 있으면 알리지 않는다', CC.alerts.diff(null, c1).length === 0);
t('cancel — 문장에 칭찬 낱말 · 순번 · 숫자 없음', !/좋|잘|훌륭|대단|[0-9]/.test(CC.alerts.say({ kind: 'cancel', name: '태인', cands: ['N', 'S'] })));

// 놓친 일 — 화면을 닫은 동안 마친 미션은 다음 첫 snap 에서 since(지난번 seenUpTo) 뒤에 생긴 것만
{
  const at = (type, mid, t, x) => Object.assign(ev(type, mid, x), { t });
  const before = [at('s-code-judge', 'm1', 10)];
  const seen = CC.alerts.seenUpTo(CC.alerts.snap([S('한결')], OPT(before)));
  const after = before.concat([at('s-code-judge', 'm2', 20), at('s-redefine', 'm2', 25)]);
  const m = CC.alerts.missed(CC.alerts.snap([S('한결')], OPT(after)), seen);
  t('missed — 닫은 동안 마친 미션은 알린다(운영: 다음 접속 때 "마쳤어요" 가 없던 버그)', seen === 10 && kinds(m) === 'finish,redefine' &&
    CC.alerts.say(m[0]) === '한결이 급식 투표를 마쳤어요.' && m[0].at === 20);
  t('missed — 이미 본 일은 다시 알리지 않는다', CC.alerts.missed(CC.alerts.snap([S('한결')], OPT(after)), 25).length === 0);
  t('missed — 이 브라우저에서 처음이면(since 없음) 기준선 그대로', CC.alerts.missed(CC.alerts.snap([S('한결')], OPT(after)), null).length === 0);
  t('missed — 같은 미션을 다시 판정해도 첫 판정 시각 — 한 번만', CC.alerts.missed(CC.alerts.snap([S('한결')], OPT(before.concat([at('s-code-judge', 'm1', 30)]))), 10).length === 0);
  const sOpt = { server: true, eventsOf: () => [Object.assign(at('s-code-judge', 'm1', 1), { _missionDbId: 'db1', _at: 50 })], finishedOf: () => ['db1'], missionName: () => '분식집 주문' };
  const sm = CC.alerts.missed(CC.alerts.snap([S('태인')], sOpt), 40);
  t('missed 서버 — 학생 기기 시각이 아니라 서버 시각(_at)으로 가린다', sm.length === 1 && sm[0].dbId === 'db1' && sm[0].at === 50);
  t('missed — 시각 없는 cancel 은 놓친 일로 치지 않는다', CC.alerts.missed(CC.alerts.snap([S('태인')], CO('db2', ['N', 'S'])), 0).length === 0);
  t('seenUpTo — 아무 일도 없으면 null', CC.alerts.seenUpTo(CC.alerts.snap([S('태인')], OPT([]))) === null);
}

if (fail) console.log(fail + ' 실패');
process.exit(fail ? 1 : 0);
