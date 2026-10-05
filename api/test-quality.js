/* Cut & Check — 미션 생성 품질 자동 테스트
 *
 * GET /api/test-quality?rounds=5
 * → 여러 주제로 미션을 생성하고 품질 기준 통과율을 반환
 */

var TESTS = [
  { lesson: '파이썬 리스트와 반복문. for문으로 하나씩 꺼내서 처리하는 법', keyPoint: '같은 값이 여러 번 있을 때 전체와 서로 다른 개수가 다르다' },
  { lesson: '조건문 if-else. 조건이 참이면 A, 거짓이면 B', keyPoint: '어떤 기준으로 걸러내는지를 학생이 직접 정하게' },
  { lesson: '딕셔너리. 키와 값 쌍으로 저장', keyPoint: '같은 키가 여러 번 나오면 마지막만 남는다' },
  { lesson: '함수 정의와 호출. def로 만들고 여러 번 호출', keyPoint: '같은 작업을 반복할 때 함수로 묶으면 편하다' },
  { lesson: '문자열 다루기. split, strip, replace', keyPoint: '데이터를 나누고 정리하는 과정에서 공백이 문제를 일으킨다' },
  { lesson: '파일 입출력. open, read, write', keyPoint: '파일에서 읽어온 데이터를 한 줄씩 처리하는 법' },
  { lesson: '클래스와 객체. class로 틀을 만들고 인스턴스를 생성', keyPoint: '같은 틀에서 나온 여러 객체가 각각 다른 값을 가진다' }
];

function check(mission) {
  var results = [];
  var m = mission;
  var pass = true;

  /* 1. 제목 길이 */
  var titleOk = m.title && m.title.length <= 20;
  results.push({ name: '제목 20자 이내', ok: titleOk, val: (m.title || '').length + '자' });
  if (!titleOk) pass = false;

  /* 2. brief 모호성 — 답을 암시하면 실패 */
  var briefHasAnswer = /서로\s*다른|전체\s*개수|중복/.test(m.brief || '');
  results.push({ name: 'brief 모호함', ok: !briefHasAnswer, val: m.brief });
  if (briefHasAnswer) pass = false;

  /* 3. 자료 3개 */
  var hasThree = m.inputs && m.inputs.length >= 3;
  results.push({ name: '자료 3개 이상', ok: hasThree, val: (m.inputs || []).length });
  if (!hasThree) pass = false;

  if (hasThree) {
    /* 4. 자료 1,2 중복 없음 */
    for (var i = 0; i < 2; i++) {
      var items = m.inputs[i].v.split(',');
      var uniq = [...new Set(items)];
      var noDup = items.length === uniq.length;
      results.push({ name: '자료' + (i+1) + ' 중복없음', ok: noDup, val: items.length + '/' + uniq.length });
      if (!noDup) pass = false;
    }

    /* 5. 자료 3 중복 있음 */
    var last = m.inputs[m.inputs.length - 1].v.split(',');
    var lastUniq = [...new Set(last)];
    var hasDup = last.length > lastUniq.length;
    results.push({ name: '자료3 중복있음', ok: hasDup, val: last.length + '/' + lastUniq.length });
    if (!hasDup) pass = false;

    /* 6. 플레이스홀더 없음 */
    var placeholder = m.inputs.some(function (inp) {
      return /[A-Za-z]\d|항목\d|노래\d|곡\d/.test(inp.v);
    });
    results.push({ name: '플레이스홀더 없음', ok: !placeholder, val: placeholder ? 'FAIL' : 'OK' });
    if (placeholder) pass = false;

    /* 7. 자료 이름 구체적 */
    var namePlaceholder = m.inputs.some(function (inp) {
      return /자료\s*\d|데이터\s*\d/.test(inp.name);
    });
    results.push({ name: '자료이름 구체적', ok: !namePlaceholder, val: namePlaceholder ? 'FAIL' : 'OK' });
    if (namePlaceholder) pass = false;
  }

  /* 8. CJK 문자 없음 */
  var allText = JSON.stringify(m);
  var cjk = /[\u4E00-\u9FFF\u3040-\u30FF]/.test(allText);
  results.push({ name: 'CJK 없음', ok: !cjk, val: cjk ? 'FAIL' : 'OK' });
  if (cjk) pass = false;

  /* 9. 조사 자연스러움 */
  var sent2 = (m.method && m.method.sentences && m.method.sentences[1]) ? m.method.sentences[1].template : '';
  var badJosa = /[가-힣]은\s*\{|[가-힣]는\s*\{/.test(sent2) === false;
  results.push({ name: '조사 포함', ok: !badJosa, val: sent2.substring(0, 20) });

  return { pass: pass, results: results };
}

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var rounds = Math.min(parseInt(req.query.rounds) || 5, 7);
  var tests = TESTS.slice(0, rounds);

  var apiBase = 'https://' + (req.headers.host || 'cut-check-lilac.vercel.app');
  var results = [];
  var totalPass = 0;

  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    try {
      var r = await fetch(apiBase + '/api/generate-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson: t.lesson, keyPoint: t.keyPoint, difficulty: 'medium' })
      });
      var mission = await r.json();

      if (mission.error) {
        results.push({ lesson: t.lesson, pass: false, error: mission.error, checks: [] });
        continue;
      }

      var quality = check(mission);
      if (quality.pass) totalPass++;
      results.push({
        lesson: t.lesson.substring(0, 30),
        title: mission.title,
        pass: quality.pass,
        checks: quality.results,
        inputs: (mission.inputs || []).map(function (inp) { return inp.name + ': ' + inp.v; })
      });
    } catch (err) {
      results.push({ lesson: t.lesson.substring(0, 30), pass: false, error: err.message, checks: [] });
    }
  }

  /* 주제 다양성 체크 */
  var titles = results.filter(function (r) { return r.title; }).map(function (r) { return r.title; });
  var uniqueTitles = [...new Set(titles)];
  var diversity = titles.length > 0 ? Math.round(uniqueTitles.length / titles.length * 100) : 0;

  return res.status(200).json({
    total: tests.length,
    passed: totalPass,
    passRate: Math.round(totalPass / tests.length * 100) + '%',
    diversity: diversity + '%',
    results: results
  });
};
