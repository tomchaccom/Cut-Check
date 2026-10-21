// /slide2 — 슬라이드에 옮겨 적은 수가 코드와 같은지, 설문 데이터가 화면이 그릴 수 있는 꼴인지
// 코드 값을 바꾸면 이 테스트가 깨진다 → slide2.html 의 SLIDE2_CODE 도 같이 고친다.
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let fail = 0;
function t(name, cond) { console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name); if (!cond) fail++; }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const num = (src, re) => { const m = re.exec(src); return m ? Number(m[1]) : NaN; };
const pyList = (src, re) => { const m = re.exec(src); return m ? JSON.parse(m[1].replace(/'/g, '"').replace(/,\s*\]$/, ']')) : null; };

const html = R('slide2.html');
const K = JSON.parse(/window\.SLIDE2_CODE = (\{[\s\S]*?\});/.exec(html)[1]);
const compassPy = R('api/_compass.py');

t('WEIGHTS = _compass.py', eq(K.WEIGHTS, pyList(compassPy, /^WEIGHTS = (\[[^\]]*\])/m)));
t('CANCEL = _compass.py', K.CANCEL === num(compassPy, /^CANCEL = ([\d.]+)/m));
const lens = /^MIN_LEN, MAX_LEN, FULL = ([\d.]+), ([\d.]+), ([\d.]+)/m.exec(compassPy) || [];
t('바늘 길이 MIN_LEN · MAX_LEN · FULL = _compass.py', K.MIN_LEN === +lens[1] && K.MAX_LEN === +lens[2] && K.FULL === +lens[3]);
const svgClamp = /Math\.max\(([\d.]+), Math\.min\(([\d.]+), Number\(len\)\)\)/.exec(R('js/core/compass.js')) || [];
t('바늘 길이 = compass.js svg() 의 범위', K.MIN_LEN === +svgClamp[1] && K.MAX_LEN === +svgClamp[2]);

const alerts = R('js/core/alerts.js');
t('TUTOR_MANY = alerts.js', K.TUTOR_MANY === num(alerts, /var TUTOR_MANY = (\d+)/));
t('RETEST_DAYS = alerts.js', K.RETEST_DAYS === num(alerts, /var RETEST_DAYS = (\d+)/));
const axes = f => { const m = /^AXES = \(([^)]*)\)/m.exec(R(f)); return m ? m[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean) : null; };
t('반례 다섯 축 = _generate.py AXES', eq(K.AXES, axes('api/_generate.py')));
t('단계별 생성 축 = _steps.py AXES', eq(K.STEP_AXES, axes('api/_steps.py')));
t('새 강사 기본 한도 = 마이그레이션 default', K.QUOTA_DEFAULT === num(R('supabase/migrations/20261020000000_gen_quota.sql'), /default_quota int not null default (\d+)/));
t('실행 검사 재요청 횟수 = genflow.js RETRIES', K.BUILD_RETRIES === num(R('js/ui/genflow.js'), /var RETRIES = (\d+)/));
const pyTuple = (src, name) => { const m = new RegExp('^' + name + ' = \\(([^)]*)\\)', 'm').exec(src); return m ? m[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean) : null; };
t('AI 칸 = _compass.py AI_ITEMS', eq(K.AI_ITEMS, pyTuple(compassPy, 'AI_ITEMS')));
// 12칸 이름 — 강사 화면(teacher.js CHECKS) 그대로, 순서는 _compass.py ITEMS
const rows = src => { const m = /var CHECKS = \[([\s\S]*?)\n  \];/.exec(src); return m ? JSON.parse('[' + m[1].replace(/'/g, '"') + ']') : null; };
const slideChecks = rows(html);
t('12칸 이름 = teacher.js CHECKS', !!slideChecks && eq(slideChecks, rows(R('js/ui/teacher.js'))));
t('12칸 순서 = _compass.py ITEMS', !!slideChecks && eq(slideChecks.map(c => c[1]), pyTuple(compassPy, 'ITEMS')));

// 설문 데이터 — 화면이 그리는 꼴. 응답자는 '응답자 X' 로만
global.window = {};
require('../slide2-data.js');
const S = global.window.SLIDE2_SURVEY;
t('설문은 배열이고 비지 않는다', Array.isArray(S) && S.length > 0);
const ids = new Set();
S.forEach(it => {
  const ok = it.id && !ids.has(it.id) && typeof it.q === 'string' && it.q && Number.isInteger(it.n) && it.n > 0 &&
    ['choice', 'multi', 'scale', 'quote'].includes(it.kind) && Array.isArray(it.links) && it.links.every(l => l.philosophy && l.feature);
  ids.add(it.id);
  let shape = true;
  if (it.kind === 'choice') shape = it.options.reduce((a, o) => a + o.count, 0) === it.n;
  if (it.kind === 'multi') shape = it.options.every(o => o.count >= 0 && o.count <= it.n);
  if (it.kind === 'scale') shape = it.points.length <= it.n && it.points.every(p => p.v >= 1 && p.v <= 5);
  if (it.kind === 'quote') shape = it.quotes.length > 0;
  const who = [].concat(it.quotes || [], it.points || []).every(q => /^응답자 [A-Z]$/.test(q.who));
  t('설문 ' + it.id + ' — 꼴 · 합계 · 응답자 이름표', ok && shape && who);
  t('설문 ' + it.id + ' — show 는 true/false', typeof it.show === 'boolean');
  if (it.signal != null) {
    const labels = (it.options || []).map(o => o.label);
    const picked = (it.options || []).filter(o => (it.pick || []).includes(o.label));
    const top = Math.max(...(it.options || []).map(o => o.count));
    t('신호 ' + it.id + ' — head · made · pick 이 보기에 있다', !!(it.head && it.made && it.pick && it.pick.length && it.pick.every(l => labels.includes(l))));
    if (/1위/.test(it.head)) t('신호 ' + it.id + ' — "1위" 는 정말 혼자 가장 많이 고른 보기', picked.length === 1 && picked[0].count === top && it.options.filter(o => o.count === top).length === 1);
  }
});
const sig = S.filter(it => it.signal != null).map(it => it.signal).sort();
t('신호 순번은 1부터 빈 칸 없이', sig.length > 0 && sig.every((v, i) => v === i + 1));

// 레벨 테스트 장은 정답표를 읽지 않는다
t('slide2.html 은 onboard 정답(KEY · marks · stage)을 부르지 않는다', !/onboard\.(KEY|marks|stage)\b/.test(html));
// 비밀번호를 슬라이드에 넣지 않는다
t('slide2.html 에 비밀번호 입력값이 없다', !/password|비밀번호\s*[:=]/i.test(html));

console.log(fail ? `\n${fail}개 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
