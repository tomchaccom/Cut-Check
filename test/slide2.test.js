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
// AI 문제 생성 장은 2026-10-23 뺐다 — 단계별 축 · 생성 한도 · 재요청 횟수 대조도 같이 뺐다
const pyTuple = (src, name) => { const m = new RegExp('^' + name + ' = \\(([^)]*)\\)', 'm').exec(src); return m ? m[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean) : null; };
t('AI 칸 = _compass.py AI_ITEMS', eq(K.AI_ITEMS, pyTuple(compassPy, 'AI_ITEMS')));
// 12칸 목록은 2026-10-22 나침반을 한 장으로 합치며 슬라이드에서 뺐다 — 이름 대조도 같이 뺐다

// 설문 데이터 — 화면이 그리는 꼴. 강사는 '응답자 X', 학생은 '학생 X' 로만
global.window = {};
require('../slide2-data.js');
for (const [name, S, who] of [['강사', global.window.SLIDE2_SURVEY, '응답자'], ['학생', global.window.SLIDE2_STUDENT, '학생']]) {
  t(name + ' 설문은 배열이고 비지 않는다', Array.isArray(S) && S.length > 0);
  const ids = new Set();
  const nos = [];
  S.forEach(it => {
    const ok = it.id && !ids.has(it.id) && typeof it.q === 'string' && it.q && Number.isInteger(it.n) && it.n > 0 &&
      ['choice', 'multi', 'scale', 'quote'].includes(it.kind) && Array.isArray(it.links) && it.links.every(l => l.philosophy && l.feature);
    ids.add(it.id);
    let shape = true;
    if (it.kind === 'choice') shape = it.options.reduce((a, o) => a + o.count, 0) === it.n;
    if (it.kind === 'multi') shape = it.options.every(o => o.count >= 0 && o.count <= it.n);
    if (it.kind === 'scale') shape = it.points.length <= it.n && it.points.every(p => p.v >= 1 && p.v <= 5);
    if (it.kind === 'quote') shape = Array.isArray(it.quotes) && it.quotes.length <= it.n;   // 아무도 안 적은 서술 문항도 목록에는 나온다
    const named = [].concat(it.quotes || [], it.points || []).every(q => new RegExp('^' + who + ' [A-Z]$').test(q.who));
    t(name + ' 설문 ' + it.id + ' — 꼴 · 합계 · 응답자 이름표', ok && shape && named);
    t(name + ' 설문 ' + it.id + ' — show 는 true/false', typeof it.show === 'boolean');
    if (it.aside) t(name + ' 설문 ' + it.id + ' — aside 는 short 이름이 있다', !!it.short);
    (it.signals || []).forEach(g => {
      nos.push(g.no);
      const labels = (it.options || []).map(o => o.label);
      const picked = (it.options || []).filter(o => (g.pick || []).includes(o.label));
      const top = Math.max(...(it.options || []).map(o => o.count));
      if (/반례/.test(g.made)) t(name + ' 신호 ' + it.id + '#' + g.no + ' — 반례 축은 _generate.py AXES 만큼', g.made.split(' — ')[1].split(' · ').length === K.AXES.length);
      t(name + ' 신호 ' + it.id + '#' + g.no + ' — head · made · pick 이 보기에 있다', !!(g.head && g.made && g.pick && g.pick.length && g.pick.every(l => labels.includes(l))));
      if (/1위/.test(g.head + (g.unit || ''))) t(name + ' 신호 ' + it.id + ' — "1위" 는 정말 혼자 가장 많이 고른 보기', picked.length === 1 && picked[0].count === top && it.options.filter(o => o.count === top).length === 1);
    });
  });
  nos.sort();
  t(name + ' 신호 순번은 1부터 빈 칸 없이', nos.length > 0 && nos.every((v, i) => v === i + 1));
}
// 합친 신호 ② — 글로 쓴 "다 짠 뒤에야 … 매주 이상 4/5" 가 misread 집계와 같다
{ const S = global.window.SLIDE2_SURVEY, mis = S.find(x => x.id === 'misread');
  const weekly = mis.options.filter(o => o.label !== '가끔 (한 달에 몇 번)').reduce((a, o) => a + o.count, 0);
  const g = S.flatMap(x => x.signals || []).find(x => /다 짠 뒤에야/.test(x.unit || ''));
  t('신호 ② 의 "다 짠 뒤에야 매주 이상" 수 = misread 집계', !!g && g.unit.includes('매주 이상 ' + weekly + '/' + mis.n)); }
// 학생 원본의 타임스탬프 · 이름 이니셜은 옮기지 않는다
t('slide2-data.js 에 타임스탬프 · 이름 이니셜 열이 없다', !/타임스탬프|이름 이니셜/.test(R('slide2-data.js').replace(/^ \*.*$/gm, '')));

// 레벨 테스트 장은 정답표를 읽지 않는다
t('slide2.html 은 onboard 정답(KEY · marks · stage)을 부르지 않는다', !/onboard\.(KEY|marks|stage)\b/.test(html));
// 비밀번호를 슬라이드에 넣지 않는다
t('slide2.html 에 비밀번호 입력값이 없다', !/password|비밀번호\s*[:=]/i.test(html));

console.log(fail ? `\n${fail}개 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
