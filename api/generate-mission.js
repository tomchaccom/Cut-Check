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
    example: '{ "title": "동아리 신청 정리", "brief": "신청서가 왔어요. 몇 명인지 알려주세요.", "domain": "동아리", "itemName": "학생", "methodContext": "신청서를", "data": [{ "name": "월요일 신청", "items": ["민수","지우","현우"] }, { "name": "화요일 신청", "items": ["서연","도윤","하은","민준"] }] }'
  },
  'split-filter-count': {
    desc: '"목록에서 조건에 맞는 것만 골라내기" 상황',
    extra: '"filterTarget": 걸러낼 대상 목록(2~3개). data의 items에 filterTarget 항목이 최소 1개 포함되어야 합니다.\n"filterDesc": 걸러낼 대상의 이름 (명사형, 2~4글자. 예: "알레르기 목록", "위험 재료", "연체 도서"). 반드시 포함하세요.',
    example: '{ "title": "급식에서 알레르기 재료 찾기", "brief": "급식 재료가 왔어요. 주의할 게 몇 개인지 알려주세요.", "domain": "급식", "itemName": "재료", "methodContext": "재료 목록을", "filterDesc": "알레르기 목록", "filterTarget": ["우유","달걀","땅콩"], "data": [{ "name": "월요일 재료", "items": ["밥","우유","김치","떡"] }, { "name": "화요일 재료", "items": ["빵","달걀","과자","국","우유"] }] }'
  },
  'split-sort-join': {
    desc: '"목록을 정렬하기" 상황',
    extra: '',
    example: '{ "title": "대기 명단 정리", "brief": "이름이 뒤섞여 있어요. 정리해주세요.", "domain": "접수", "itemName": "이름", "methodContext": "명단을", "data": [{ "name": "오전 접수", "items": ["지우","민수","하은"] }, { "name": "오후 접수", "items": ["서연","도윤","현우","가은"] }] }'
  },
  'split-num-sum': {
    desc: '"숫자 목록에서 합계 구하기" 상황',
    extra: '중요: data의 items는 반드시 정수(숫자)여야 합니다.',
    example: '{ "title": "용돈 기입장 계산", "brief": "이번 주 지출이 얼마인지 알려주세요.", "domain": "용돈", "itemName": "금액", "methodContext": "지출 목록을", "data": [{ "name": "월요일 지출", "items": [1000,2000,500] }, { "name": "화요일 지출", "items": [3000,1500,800,200] }] }'
  },
  'split-group': {
    desc: '"목록에서 같은 것끼리 묶어 세기" 상황',
    extra: '중요: data의 items에 같은 항목이 2번 이상 등장해야 의미가 있습니다.',
    example: '{ "title": "혈액형 조사 정리", "brief": "혈액형 조사 결과가 왔어요. 정리해주세요.", "domain": "건강", "itemName": "혈액형", "methodContext": "조사 결과를", "data": [{ "name": "1반 조사", "items": ["A","B","O","A","AB"] }, { "name": "2반 조사", "items": ["O","A","B","O","A","B"] }] }'
  },
  'split-transform-join': {
    desc: '"목록의 각 항목을 변환하기" 상황',
    extra: '중요: data의 items 중 일부에 앞뒤 공백이 있어야 합니다 (예: " 사과 "). 공백 제거 변환이 의미 있으려면 공백이 있어야 합니다.',
    example: '{ "title": "출석부 이름 정리하기", "brief": "출석부가 왔는데 이름이 지저분해요. 정리해주세요.", "domain": "학급", "itemName": "이름", "methodContext": "출석부를", "data": [{ "name": "1교시 출석", "items": [" 민수","지우 "," 현우 "] }, { "name": "2교시 출석", "items": ["서연 "," 도윤","하은"," 가은"] }] }'
  },
  'split-filter-num-sum': {
    desc: '"숫자와 글자가 섞인 목록에서 숫자만 골라 합계 구하기" 상황',
    extra: '"filterTarget": 숫자가 아닌 항목 목록(2~3개). data의 items에 숫자와 글자가 섞여 있어야 합니다.\n"filterDesc": 걸러낼 대상 설명 (예: "숫자가 아닌 항목", "잘못 입력된 값")',
    example: '{ "title": "용돈 기입장에서 숫자만 합치기", "brief": "기입장에 글자가 섞여 있어요. 숫자만 골라서 합쳐주세요.", "domain": "용돈", "itemName": "항목", "methodContext": "기입장을", "filterDesc": "숫자가 아닌 항목", "filterTarget": ["메모","간식","교통"], "data": [{ "name": "월요일 기록", "items": ["1000","메모","2000","500"] }, { "name": "화요일 기록", "items": ["3000","간식","1500","교통","800"] }] }'
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
    '3. brief는 모호하게. 답을 암시하지 않음. "서로 다른", "전체", "합계" 등 금지.',
    '4. title은 중학생이 바로 알아듣는 구체적 상황. 15자 이내.',
    '   - "급식에서 알레르기 재료 찾기" (O) — 무슨 일인지 바로 앎',
    '   - "우편물 분류" (X) — 추상적, 중학생이 안 해본 일',
    '   - "데이터 처리" (X) — 컴퓨터 용어',
    '5. 한국어만. 한자·일본어·영어 금지.',
    '6. data는 정확히 2개. 각각 항목 3~5개.',
    '7. methodContext는 "~를" 또는 "~을"로 끝남.',
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

  /* ── define (성공 조건 + 함정) ── */
  var define;
  switch (pipelineId) {
    case 'split-unique-count':
      define = {
        q: '나는 ' + ctx.replace(/[을를]$/, '') + '에서 무엇이 나오면 성공이라고 생각하나요?',
        options: [
          { v: '화면에 ' + d1result + josa(String(d1result), '이가') + ' 뜨면 성공이다', trap: 'hardcode' },
          { v: '어떤 ' + item + ' 목록이 와도 전체 개수를 셀 수 있으면 성공이다', key: 'total', trap: null },
          { v: '같은 ' + item + je + ' 빼고 서로 다른 수를 셀 수 있으면 성공이다', key: 'unique', trap: null },
          { v: '오류 없이 끝까지 실행되면 성공이다', trap: 'luck' }
        ]
      };
      break;
    case 'split-filter-count':
      define = {
        q: '나는 ' + ctx.replace(/[을를]$/, '') + '에서 무엇이 나오면 성공이라고 생각하나요?',
        options: [
          { v: '화면에 ' + d1result + josa(String(d1result), '이가') + ' 뜨면 성공이다', trap: 'hardcode' },
          { v: '어떤 목록이 와도 조건에 맞는 ' + item + josa(item, '의') + ' 개수를 셀 수 있으면 성공이다', key: 'filtered_count', trap: null },
          { v: '오류 없이 끝까지 실행되면 성공이다', trap: 'luck' }
        ]
      };
      break;
    case 'split-sort-join':
      define = {
        q: '나는 ' + ctx.replace(/[을를]$/, '') + '에서 무엇이 나오면 성공이라고 생각하나요?',
        options: [
          { v: '화면에 ' + String(d1result).substring(0, 15) + '라고 뜨면 성공이다', trap: 'hardcode' },
          { v: '어떤 목록이 와도 순서대로 나열된 결과가 나오면 성공이다', key: 'sorted', trap: null },
          { v: '뭐라도 한 줄 나오면 성공이다', trap: 'luck' }
        ]
      };
      break;
    case 'split-num-sum':
      define = {
        q: '나는 ' + ctx.replace(/[을를]$/, '') + '에서 무엇이 나오면 성공이라고 생각하나요?',
        options: [
          { v: '화면에 ' + d1result + josa(String(d1result), '이가') + ' 뜨면 성공이다', trap: 'hardcode' },
          { v: '어떤 숫자 목록이 와도 전부 더한 합계가 나오면 성공이다', key: 'sum', trap: null },
          { v: '숫자가 나오면 성공이다', trap: 'luck' }
        ]
      };
      break;
    case 'split-group':
      define = {
        q: '나는 ' + ctx.replace(/[을를]$/, '') + '에서 무엇이 나오면 성공이라고 생각하나요?',
        options: [
          { v: '화면에 ' + String(d1result).substring(0, 20) + '이 뜨면 성공이다', trap: 'hardcode' },
          { v: '어떤 목록이 와도 같은 것끼리 묶인 개수가 나오면 성공이다', key: 'group', trap: null },
          { v: '뭐라도 나오면 성공이다', trap: 'luck' }
        ]
      };
      break;
    case 'split-transform-join':
      define = {
        q: '나는 ' + ctx.replace(/[을를]$/, '') + '에서 무엇이 나오면 성공이라고 생각하나요?',
        options: [
          { v: '화면에 ' + String(d1result).substring(0, 15) + '라고 뜨면 성공이다', trap: 'hardcode' },
          { v: '어떤 목록이 와도 각 항목이 깔끔하게 정리된 결과가 나오면 성공이다', key: 'transformed', trap: null },
          { v: '뭐라도 한 줄 나오면 성공이다', trap: 'luck' }
        ]
      };
      break;
    case 'split-filter-num-sum':
      define = {
        q: '나는 ' + ctx.replace(/[을를]$/, '') + '에서 무엇이 나오면 성공이라고 생각하나요?',
        options: [
          { v: '화면에 ' + d1result + josa(String(d1result), '이가') + ' 뜨면 성공이다', trap: 'hardcode' },
          { v: '어떤 목록이 와도 숫자만 골라서 더한 합계가 나오면 성공이다', key: 'filtered_sum', trap: null },
          { v: '숫자가 나오면 성공이다', trap: 'luck' }
        ]
      };
      break;
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
