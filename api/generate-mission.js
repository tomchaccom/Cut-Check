/* Cut & Check — Agent 기반 미션 생성 API
 *
 * POST /api/generate-mission
 * Body: { lesson, keyPoint, difficulty? }
 *
 * Agent 패턴:
 *   1. 코드가 수업 키워드 → 파이프라인을 결정한다
 *   2. LLM은 도메인(상황, 항목 이름, 자료 2개)만 생성한다
 *   3. 코드가 반례(자료 3), 성공 조건(함정 포함), 방법 문장을 조립한다
 *
 * LLM이 구조를 모르므로 구조가 틀릴 수 없다.
 * 후처리 10단계 → 3단계로 줄었다.
 */

function hasJongseong(str) {
  if (!str) return false;
  var last = str.charCodeAt(str.length - 1);
  if (last < 0xAC00 || last > 0xD7A3) return false;
  return (last - 0xAC00) % 28 !== 0;
}
function josa(word, pair) {
  var j = hasJongseong(word);
  if (pair === '은는') return j ? '은' : '는';
  if (pair === '을를') return j ? '을' : '를';
  if (pair === '이가') return j ? '이' : '가';
  if (pair === '의') return '의';
  return '';
}

/* ══════════════════════════════════════════════════
 * 1. 수업 키워드 → 파이프라인 매핑
 * ══════════════════════════════════════════════════ */

var KEYWORD_RULES = [
  /* 구체적 키워드가 먼저 매칭되도록 위에 배치 */
  { keywords: ['예외', 'try', 'except', '에러', 'error'], pipeline: 'split-filter-num-sum' },
  { keywords: ['딕셔너리', 'dict', '사전', '분류', '빈도'], pipeline: 'split-group' },
  { keywords: ['정렬', 'sort', 'sorted', '순서', '나열'], pipeline: 'split-sort-join' },
  { keywords: ['함수', 'def ', '변환'], pipeline: 'split-transform-join' },
  { keywords: ['문자열 메서드', 'strip', 'replace', 'upper', 'lower'], pipeline: 'split-transform-join' },
  { keywords: ['컴프리헨션', 'comprehension', '한 줄로'], pipeline: 'split-filter-count' },
  { keywords: ['반복', 'for', 'while', 'loop', '하나씩'], pipeline: 'split-filter-count' },
  { keywords: ['조건', 'if', '필터', '걸러', '선별', '골라'], pipeline: 'split-filter-count' },
  { keywords: ['집합', 'set', '중복 제거'], pipeline: 'split-unique-count' },
  { keywords: ['숫자', 'int', 'sum', '합계', '형변환', '계산', '더하', 'range'], pipeline: 'split-num-sum' },
  { keywords: ['파일', 'file', '입출력', 'open', 'read'], pipeline: 'split-transform-join' },
  { keywords: ['리스트', 'list', 'split', '문자열', '나누', '변수', '자료형'], pipeline: 'split-unique-count' }
];

function selectPipeline(lesson, keyPoint) {
  var text = ((lesson || '') + ' ' + (keyPoint || '')).toLowerCase();
  for (var i = 0; i < KEYWORD_RULES.length; i++) {
    var rule = KEYWORD_RULES[i];
    for (var k = 0; k < rule.keywords.length; k++) {
      if (text.indexOf(rule.keywords[k]) !== -1) return rule.pipeline;
    }
  }
  return 'split-unique-count';
}

/* ══════════════════════════════════════════════════
 * 2. 파이프라인별 LLM 프롬프트 (도메인만 요청)
 * ══════════════════════════════════════════════════ */

var PIPELINE_PROMPTS = {
  'split-unique-count': {
    desc: '"목록에서 항목 세기" 상황',
    extra: '',
    example: '{ "title": "동아리 신청 정리", "brief": "학생회에서 동아리 신청서를 모았어요. 같은 학생이 두 번 쓴 것도 있는데, 신청한 학생이 실제로 몇 명인지 알아봐야 해요.", "situation": "동아리 모집 기간이라 신청서가 쏟아지고 있어요.", "domain": "동아리", "itemName": "학생", "methodContext": "신청서를", "data": [{ "name": "월요일 신청", "items": ["민수","지우","현우"] }, { "name": "화요일 신청", "items": ["서연","도윤","하은","민준"] }] }'
  },
  'split-filter-count': {
    desc: '"목록에서 조건에 맞는 것만 골라내기" 상황',
    extra: '"filterTarget": 걸러낼 대상 목록(2~3개). data의 items에 filterTarget 항목이 최소 1개 포함되어야 합니다.\n"filterDesc": 걸러낼 대상의 이름 (명사형, 2~4글자. 예: "알레르기 목록", "위험 재료", "연체 도서"). 반드시 포함하세요.',
    example: '{ "title": "급식에서 알레르기 재료 찾기", "brief": "영양사 선생님이 이번 주 급식 재료 목록을 보내셨어요. 알레르기가 있는 학생이 있어서, 주의해야 할 재료가 몇 개 들어 있는지 확인해달래요.", "situation": "우리 반이 급식 당번이에요. 알레르기 재료를 미리 체크해야 해요.", "domain": "급식", "itemName": "재료", "methodContext": "재료 목록을", "filterDesc": "알레르기 목록", "filterTarget": ["우유","달걀","땅콩"], "data": [{ "name": "월요일 재료", "items": ["밥","우유","김치","떡"] }, { "name": "화요일 재료", "items": ["빵","달걀","과자","국","우유"] }] }'
  },
  'split-sort-join': {
    desc: '"목록을 정렬하기" 상황',
    extra: '',
    example: '{ "title": "체육대회 대기 명단 정리", "brief": "체육대회 접수 명단이 왔는데 순서가 뒤섞여 있어요. 이름순으로 정리해서 안내판에 붙여야 해요.", "situation": "체육대회 접수를 받았는데 순서가 엉망이에요.", "domain": "체육대회", "itemName": "이름", "methodContext": "명단을", "data": [{ "name": "오전 접수", "items": ["지우","민수","하은"] }, { "name": "오후 접수", "items": ["서연","도윤","현우","가은"] }] }'
  },
  'split-num-sum': {
    desc: '"숫자 목록에서 합계 구하기" 상황',
    extra: '중요: data의 items는 반드시 정수(숫자)여야 합니다.',
    example: '{ "title": "이번 주 용돈 지출 계산", "brief": "엄마가 이번 주에 얼마 썼는지 알려달래요. 매일 쓴 금액이 적혀 있는데 합쳐서 알려줘야 해요.", "situation": "용돈을 받으면 매일 얼마 썼는지 기록하고 있어요.", "domain": "용돈", "itemName": "금액", "methodContext": "지출 목록을", "data": [{ "name": "월요일 지출", "items": [1000,2000,500] }, { "name": "화요일 지출", "items": [3000,1500,800,200] }] }'
  },
  'split-group': {
    desc: '"목록에서 같은 것끼리 묶어 세기" 상황',
    extra: '중요: data의 items에 같은 항목이 2번 이상 등장해야 의미가 있습니다.',
    example: '{ "title": "혈액형 조사 정리", "brief": "혈액형 조사 결과가 왔어요. 정리해주세요.", "domain": "건강", "itemName": "혈액형", "methodContext": "조사 결과를", "data": [{ "name": "1반 조사", "items": ["A","B","O","A","AB"] }, { "name": "2반 조사", "items": ["O","A","B","O","A","B"] }] }'
  },
  'split-transform-join': {
    desc: '"목록의 각 항목을 변환하기" 상황',
    extra: '중요: data의 items 중 일부에 앞뒤 공백이 있어야 합니다 (예: " 사과 "). 공백 제거 변환이 의미 있으려면 공백이 있어야 합니다.',
    example: '{ "title": "출석부 이름 깔끔하게 정리", "brief": "담임 선생님이 출석부를 주셨는데, 이름 앞뒤에 공백이 들어가 있어서 컴퓨터가 같은 이름을 다른 이름으로 인식해요. 깔끔하게 정리해달래요.", "situation": "출석부를 엑셀에 옮겨야 하는데 공백 때문에 오류가 나요.", "domain": "학급", "itemName": "이름", "methodContext": "출석부를", "data": [{ "name": "1교시 출석", "items": [" 민수","지우 "," 현우 "] }, { "name": "2교시 출석", "items": ["서연 "," 도윤","하은"," 가은"] }] }'
  },
  'split-filter-num-sum': {
    desc: '"숫자와 글자가 섞인 목록에서 숫자만 골라 합계 구하기" 상황',
    extra: '"filterTarget": 숫자가 아닌 항목 목록(2~3개). data의 items에 숫자와 글자가 섞여 있어야 합니다.\n"filterDesc": 걸러낼 대상 설명 (예: "숫자가 아닌 항목", "잘못 입력된 값")',
    example: '{ "title": "용돈 기입장에서 진짜 금액만 더하기", "brief": "용돈 기입장에 금액 사이에 메모가 섞여 있어요. 글자는 빼고 숫자만 골라서 이번 주에 얼마 썼는지 합쳐야 해요.", "situation": "기입장을 대충 쓰다 보니 숫자랑 글자가 섞여버렸어요.", "domain": "용돈", "itemName": "항목", "methodContext": "기입장을", "filterDesc": "숫자가 아닌 항목", "filterTarget": ["메모","간식","교통"], "data": [{ "name": "월요일 기록", "items": ["1000","메모","2000","500"] }, { "name": "화요일 기록", "items": ["3000","간식","1500","교통","800"] }] }'
  }
};

function buildPrompt(pipelineId, lesson, keyPoint) {
  var spec = PIPELINE_PROMPTS[pipelineId] || PIPELINE_PROMPTS['split-unique-count'];

  var system = [
    '당신은 중학교 수업 문제의 상황(도메인)을 만드는 전문가입니다.',
    '문제의 구조(성공 조건, 방법 문장, 실행 로직)는 코드가 만듭니다.',
    '당신은 상황만 만듭니다.',
    '',
    '규칙:',
    '1. 자료 항목은 실제 한국어 단어. "항목A", "노래1" 금지.',
    '2. 자료 이름은 구체적. "자료 1", "데이터 1" 금지.',
    '3. title은 중학생이 바로 알아듣는 구체적 상황. 12자 이내.',
    '   - "급식 알레르기 찾기" (O) — 짧고 명확',
    '   - "데이터 분류 처리" (X) — 컴퓨터 용어',
    '4. brief는 1문장, 행동 지시형, 40자 이내. 반말(해봐/세어봐/찾아봐) 사용.',
    '   - "급식 재료에서 알레르기 재료가 몇 개인지 세어봐." (O)',
    '   - "영양사 선생님이 이번 주 급식 재료 목록을 보내셨어요." (X) — 길고 설명적',
    '5. situation은 왜 이걸 하는지 1문장. 30자 이내. 반말.',
    '   - "급식 당번이라 알레르기 재료를 미리 체크해야 해." (O)',
    '6. 한국어만. 한자·일본어·영어 금지.',
    '7. data는 정확히 2개. 각각 항목 3~5개.',
    '8. methodContext는 "~를" 또는 "~을"로 끝남.',
    '',
    'JSON만 응답하세요.'
  ].join('\n');

  var user = [
    '오늘 수업: ' + lesson,
    '핵심: ' + keyPoint,
    '',
    '이 수업과 연결되는 ' + spec.desc + '을 만들어주세요.',
    spec.extra ? '\n' + spec.extra : '',
    '',
    '예시 (이 예시와 다른 주제로):',
    spec.example
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

/* ══════════════════════════════════════════════════
 * 3. 반례 생성 (코드가 보장)
 * ══════════════════════════════════════════════════ */

function buildCounterexample(pipelineId, data, params) {
  var items1 = data[0].items;
  var items2 = data[1].items;

  switch (pipelineId) {
    case 'split-unique-count':
      /* 중복 추가 → total ≠ unique */
      return items1.concat([items1[0], items2[0]]);

    case 'split-filter-count':
      /* filterTarget에 없는 항목만 → 결과 0 */
      var ft = params.filterTarget || [];
      var all = items1.concat(items2);
      var safe = all.filter(function (x) { return ft.indexOf(x) === -1; });
      if (safe.length < 3) safe = safe.concat(['사과', '바나나', '포도']);
      return safe.slice(0, 4);

    case 'split-sort-join':
      /* 이미 정렬된 순서 → 정렬 전후 동일 */
      return items1.slice().sort(function (a, b) { return a.localeCompare(b, 'ko'); });

    case 'split-num-sum':
      /* 항목 추가 → 합계 달라짐 */
      return items1.concat([items2[0]]);

    case 'split-group':
      /* 전부 고유 → 빈도 전부 1 */
      var uniq = [];
      items1.concat(items2).forEach(function (x) { if (uniq.indexOf(x) === -1) uniq.push(x); });
      return uniq.slice(0, 4);

    case 'split-transform-join':
      /* 공백 없는 항목 → trim 전후 동일 (identity 반례) */
      return items1.map(function (x) { return x.trim(); });

    case 'split-filter-num-sum':
      /* 숫자가 아닌 항목만 → 합계 0 */
      var ftNS = params.filterTarget || [];
      return ftNS.concat(ftNS[0] ? [ftNS[0]] : ['메모', '기타']);

    default:
      return items1.concat([items1[0]]);
  }
}

/* ══════════════════════════════════════════════════
 * 4. 미션 조립 (코드가 구조를 보장)
 * ══════════════════════════════════════════════════ */

function assembleMission(pipelineId, d, lesson, keyPoint) {
  var id = 'ai-' + Date.now().toString(36);
  var ctx = d.methodContext || '목록을';
  var item = d.itemName || '항목';
  var je = josa(item, '은는');

  /* 자료 3개 조립 */
  var counter = buildCounterexample(pipelineId, d.data, { filterTarget: d.filterTarget });
  var inputs = [
    { id: 'd01', name: d.data[0].name, v: d.data[0].items.join(',') },
    { id: 'd02', name: d.data[1].name, v: d.data[1].items.join(',') },
    { id: 'd03', name: d.counterName || (d.domain + ' 합산'), v: counter.join(',') }
  ];

  /* 결과 계산 (자료 1 기준 — hardcode 함정용) */
  var d1items = d.data[0].items;
  var d1result;
  if (pipelineId === 'split-num-sum') {
    d1result = d1items.reduce(function (a, b) { return a + Number(b); }, 0);
  } else if (pipelineId === 'split-filter-count') {
    var ft = d.filterTarget || [];
    d1result = d1items.filter(function (x) { return ft.indexOf(x) !== -1; }).length;
  } else if (pipelineId === 'split-sort-join') {
    d1result = d1items.slice().sort(function (a, b) { return a.localeCompare(b, 'ko'); }).join(',');
  } else if (pipelineId === 'split-group') {
    var g = {}; d1items.forEach(function (x) { g[x] = (g[x] || 0) + 1; });
    d1result = Object.keys(g).map(function (k) { return k + ':' + g[k]; }).join(', ');
  } else if (pipelineId === 'split-transform-join') {
    d1result = d1items.map(function (x) { return x.trim(); }).join(',');
  } else if (pipelineId === 'split-filter-num-sum') {
    var ftNS = d.filterTarget || [];
    var nums = d1items.filter(function (x) { return ftNS.indexOf(x) === -1; });
    d1result = nums.reduce(function (a, b) { return a + Number(b); }, 0);
  } else {
    var u = []; d1items.forEach(function (x) { if (u.indexOf(x) === -1) u.push(x); });
    d1result = u.length;
  }

  /* ── define (성공 조건 + 함정) — 짧고 직관적으로 ── */
  var dq = '언제 성공이야?';
  var hc = d1result;
  var define;
  switch (pipelineId) {
    case 'split-unique-count':
      define = { q: dq, options: [
        { v: '' + hc + josa(String(hc), '이가') + ' 나오면 성공', trap: 'hardcode' },
        { v: '전체 ' + item + ' 개수가 나오면 성공', key: 'total', trap: null },
        { v: '겹치는 건 빼고 센 수가 나오면 성공', key: 'unique', trap: null },
        { v: '에러 안 나면 성공', trap: 'luck' }
      ] }; break;
    case 'split-filter-count':
      define = { q: dq, options: [
        { v: '' + hc + josa(String(hc), '이가') + ' 나오면 성공', trap: 'hardcode' },
        { v: '조건에 맞는 ' + item + ' 개수가 나오면 성공', key: 'filtered_count', trap: null },
        { v: '에러 안 나면 성공', trap: 'luck' }
      ] }; break;
    case 'split-sort-join':
      define = { q: dq, options: [
        { v: '' + String(hc).substring(0, 12) + '가 나오면 성공', trap: 'hardcode' },
        { v: '순서대로 정렬되면 성공', key: 'sorted', trap: null },
        { v: '뭐라도 나오면 성공', trap: 'luck' }
      ] }; break;
    case 'split-num-sum':
      define = { q: dq, options: [
        { v: '' + hc + josa(String(hc), '이가') + ' 나오면 성공', trap: 'hardcode' },
        { v: '전부 더한 합계가 나오면 성공', key: 'sum', trap: null },
        { v: '숫자가 나오면 성공', trap: 'luck' }
      ] }; break;
    case 'split-group':
      define = { q: dq, options: [
        { v: '' + String(hc).substring(0, 15) + '이 나오면 성공', trap: 'hardcode' },
        { v: '같은 것끼리 묶인 개수가 나오면 성공', key: 'group', trap: null },
        { v: '뭐라도 나오면 성공', trap: 'luck' }
      ] }; break;
    case 'split-transform-join':
      define = { q: dq, options: [
        { v: '' + String(hc).substring(0, 12) + '가 나오면 성공', trap: 'hardcode' },
        { v: '각 항목이 깔끔하게 정리되면 성공', key: 'transformed', trap: null },
        { v: '뭐라도 나오면 성공', trap: 'luck' }
      ] }; break;
    case 'split-filter-num-sum':
      define = { q: dq, options: [
        { v: '' + hc + josa(String(hc), '이가') + ' 나오면 성공', trap: 'hardcode' },
        { v: '숫자만 골라서 더한 합계가 나오면 성공', key: 'filtered_sum', trap: null },
        { v: '숫자가 나오면 성공', trap: 'luck' }
      ] }; break;
  }

  /* ── method (방법 문장) ── */
  var sentences;
  switch (pipelineId) {
    case 'split-unique-count':
      sentences = [
        { template: ctx + ' {sep} 기준으로 나눈다.', slot: 'sep', options: ['쉼표', '공백', '줄바꿈'] },
        { template: '같은 ' + item + je + ' {dedup}.', slot: 'dedup', options: ['각각 남긴다', '하나만 남긴다'] },
        { template: '{output}을 출력한다.', slot: 'output', options: ['남은 항목의 개수', '항상 숫자 3'] }
      ];
      break;
    case 'split-filter-count':
      sentences = [
        { template: ctx + ' {sep} 기준으로 나눈다.', slot: 'sep', options: ['쉼표', '공백', '줄바꿈'] },
        { template: (d.filterDesc || '조건') + '에 {cond} 것만 남긴다.', slot: 'cond', options: ['있는', '없는'] }
      ];
      break;
    case 'split-sort-join':
      sentences = [
        { template: ctx + ' {sep} 기준으로 나눈다.', slot: 'sep', options: ['쉼표', '공백', '줄바꿈'] },
        { template: '{dir} 정렬한다.', slot: 'dir', options: ['가나다순으로', '거꾸로'] },
        { template: '{joinSep}로 다시 합친다.', slot: 'joinSep', options: ['쉼표', '공백'] }
      ];
      break;
    case 'split-num-sum':
      sentences = [
        { template: ctx + ' {sep} 기준으로 나눈다.', slot: 'sep', options: ['쉼표', '공백', '줄바꿈'] }
      ];
      break;
    case 'split-group':
      sentences = [
        { template: ctx + ' {sep} 기준으로 나눈다.', slot: 'sep', options: ['쉼표', '공백', '줄바꿈'] }
      ];
      break;
    case 'split-transform-join':
      sentences = [
        { template: ctx + ' {sep} 기준으로 나눈다.', slot: 'sep', options: ['쉼표', '공백', '줄바꿈'] },
        { template: '각 ' + item + josa(item, '을를') + ' {op}.', slot: 'op', options: ['앞뒤 공백을 없앤다', '첫 글자만 남긴다'] },
        { template: '{joinSep}로 다시 합친다.', slot: 'joinSep', options: ['쉼표', '공백'] }
      ];
      break;
    case 'split-filter-num-sum':
      sentences = [
        { template: ctx + ' {sep} 기준으로 나눈다.', slot: 'sep', options: ['쉼표', '공백', '줄바꿈'] },
        { template: (d.filterDesc || '숫자가 아닌 항목') + '을 {cond}.', slot: 'cond', options: ['빼고 숫자만 남긴다', '그대로 둔다'] }
      ];
      break;
  }

  var mission = {
    id: id, no: 'AI', type: 'sentence',
    pipelineId: pipelineId,
    stage: d.domain || '수업',
    title: d.title, brief: d.brief,
    situation: d.situation || '',
    lesson: lesson, keyPoint: keyPoint,
    define: define,
    method: { sentences: sentences },
    inputs: inputs
  };

  if ((pipelineId === 'split-filter-count' || pipelineId === 'split-filter-num-sum') && d.filterTarget) {
    mission.pipelineParams = { filterTarget: d.filterTarget };
  }

  return mission;
}

/* ══════════════════════════════════════════════════
 * 5. LLM 호출 + 후처리 (3단계로 축소)
 * ══════════════════════════════════════════════════ */

function strip(s) {
  return String(s)
    .replace(/[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\uFF00-\uFFEF]/g, '')
    .replace(/\s{2,}/g, ' ').trim();
}

async function generate(lesson, keyPoint) {
  var apiKey = (process.env.PICKLE_API_KEY || '').replace(/[\s\u2028\u2029\u200B-\u200F\uFEFF]/g, '');
  if (!apiKey) throw new Error('PICKLE_API_KEY가 설정되지 않았습니다.');

  var pipelineId = selectPipeline(lesson, keyPoint);
  var messages = buildPrompt(pipelineId, lesson, keyPoint);

  var res = await fetch('https://llm.pcl.kr/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model: 'pickle-general', max_tokens: 512, messages: messages })
  });
  if (!res.ok) throw new Error('LLM API 오류: ' + res.status);

  var raw = (await res.json()).choices[0].message.content;
  raw = raw.replace(/[\u2028\u2029\u0000-\u001F]/g, ' ');
  var match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON 파싱 실패');
  var d = JSON.parse(match[0]);

  /* ── 후처리 1: 텍스트 정리 ── */
  d.title = strip(d.title || '').substring(0, 20);
  d.brief = strip(d.brief || '').substring(0, 50);
  d.situation = strip(d.situation || '');
  d.itemName = strip(d.itemName || '항목').replace(/[은는]$/, '');
  d.methodContext = strip(d.methodContext || '목록을');
  if (!/[을를]$/.test(d.methodContext)) d.methodContext += '를';
  if (d.filterDesc) d.filterDesc = strip(d.filterDesc);
  /* filterDesc 없으면 filterTarget에서 자동 생성 */
  if (!d.filterDesc && d.filterTarget && d.filterTarget.length) {
    d.filterDesc = d.filterTarget.slice(0, 2).join('·') + ' 목록';
  }
  d.domain = strip(d.domain || d.title || '수업');
  if (d.brief && !/[요다세]\.?$/.test(d.brief)) d.brief += '.';
  d.brief = (d.brief || '').replace(/서로\s*다른|전체\s*|합계/g, '').replace(/\s{2,}/g, ' ').trim();

  /* ── 후처리 2: 자료 검증 ── */
  if (!d.data || d.data.length < 2) throw new Error('자료 2개 미만');
  d.data.forEach(function (dat, i) {
    if (!dat.items) dat.items = [];
    if (!dat.name || /자료\s*\d|데이터\s*\d/.test(dat.name)) dat.name = d.domain + ' ' + (i + 1);
    dat.items = dat.items.map(function (x) { return String(x).trim(); }).filter(Boolean);
    /* 항목 3개 미만이면 다른 자료에서 빌려서 보충 */
    if (dat.items.length < 3) {
      var pool = [];
      d.data.forEach(function (other) {
        if (other === dat) return;
        (other.items || []).forEach(function (x) { if (pool.indexOf(x) === -1) pool.push(x); });
      });
      while (dat.items.length < 3 && pool.length) {
        var pick = pool.shift();
        if (dat.items.indexOf(pick) === -1) dat.items.push(pick);
      }
    }
  });

  /* 플레이스홀더 감지 */
  var allItems = d.data[0].items.concat(d.data[1].items);
  if (allItems.some(function (x) { return /^[A-Za-z]\d*$|^항목\d|^노래\d/.test(x); }))
    throw new Error('플레이스홀더 감지');

  /* ── 후처리 3: filter 일관성 ── */
  if (d.filterTarget && d.filterTarget.length) {
    var found = d.filterTarget.filter(function (t) { return allItems.indexOf(t) !== -1; });
    if (found.length === 0) throw new Error('filterTarget이 자료에 없음');
  }

  return assembleMission(pipelineId, d, lesson, keyPoint);
}

/* ══════════════════════════════════════════════════
 * Vercel Handler
 * ══════════════════════════════════════════════════ */

module.exports = async function (req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능합니다.' });
  res.setHeader('Access-Control-Allow-Origin', '*');

  var body = req.body || {};
  if (!body.lesson) return res.status(400).json({ error: '수업 내용을 입력해주세요.' });
  if (!body.keyPoint) return res.status(400).json({ error: '핵심 포인트를 입력해주세요.' });

  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var mission = await generate(body.lesson, body.keyPoint);
      return res.status(200).json(mission);
    } catch (err) {
      if (attempt === 0 && /플레이스홀더|JSON|자료|filterTarget/.test(err.message)) continue;
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(500).json({ error: '2회 시도 실패' });
};
