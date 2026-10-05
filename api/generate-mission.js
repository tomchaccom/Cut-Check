/* Cut & Check — 미션 자동 생성 API (Phase 1: 프롬프트 구조 개선)
 *
 * POST /api/generate-mission
 * Body: { lesson, keyPoint, difficulty? }
 *
 * 핵심 변경:
 *   - system/user 메시지 분리
 *   - 수업 개념이 미션 맥락에 직접 연결되도록 강제
 *   - few-shot 예시를 수업 주제와 겹치지 않게 동적 선택
 *   - 자료 1,2는 중복 없이, 자료 3만 중복
 */

/* 한글 받침 판별 */
function hasJongseong(str) {
  if (!str) return false;
  var last = str.charCodeAt(str.length - 1);
  if (last < 0xAC00 || last > 0xD7A3) return false;
  return (last - 0xAC00) % 28 !== 0;
}

/* ── few-shot 예시 풀 (4개 — 수업 주제와 겹치지 않는 2개를 선택) ── */
var EXAMPLES = [
  {
    context: '급식',
    json: {
      title: '이번 주 급식 정리',
      brief: '급식 메뉴가 왔어요. 메뉴가 몇 가지인지 알려주세요.',
      stage: '급식',
      defineQ: '나는 메뉴판에서 무엇이 나오면 성공이라고 생각하나요?',
      defineOptions: [
        { v: '적힌 메뉴의 전체 개수', key: 'total' },
        { v: '서로 다른 메뉴의 가짓수', key: 'unique' }
      ],
      methodContext: '메뉴판을',
      itemName: '메뉴',
      inputs: [
        { name: '월요일 급식', v: '밥,국,김치' },
        { name: '화요일 급식', v: '비빔밥,미역국,깍두기,요구르트' },
        { name: '일주일 합산', v: '밥,국,김치,비빔밥,국,밥,깍두기' }
      ]
    }
  },
  {
    context: '운동회',
    json: {
      title: '운동회 종목 신청',
      brief: '종목 신청서가 왔어요. 몇 종목인지 정리해주세요.',
      stage: '운동회',
      defineQ: '나는 신청서에서 무엇이 나오면 성공이라고 생각하나요?',
      defineOptions: [
        { v: '신청된 종목의 전체 횟수', key: 'total' },
        { v: '서로 다른 종목의 수', key: 'unique' }
      ],
      methodContext: '신청서를',
      itemName: '종목',
      inputs: [
        { name: '1반 신청', v: '달리기,줄넘기,축구' },
        { name: '2반 신청', v: '농구,피구,줄다리기,달리기' },
        { name: '전교 합산', v: '달리기,축구,농구,달리기,피구,축구' }
      ]
    }
  },
  {
    context: '여행',
    json: {
      title: '수학여행 준비물',
      brief: '준비물 목록이 왔어요. 몇 가지인지 알려주세요.',
      stage: '여행',
      defineQ: '나는 준비물 목록에서 무엇이 나오면 성공이라고 생각하나요?',
      defineOptions: [
        { v: '적힌 준비물의 전체 개수', key: 'total' },
        { v: '서로 다른 준비물의 가짓수', key: 'unique' }
      ],
      methodContext: '준비물 목록을',
      itemName: '준비물',
      inputs: [
        { name: '1조 준비물', v: '우산,간식,물통' },
        { name: '2조 준비물', v: '썬크림,모자,카메라,간식' },
        { name: '전체 합산', v: '우산,간식,물통,썬크림,간식,우산,모자' }
      ]
    }
  },
  {
    context: '음악',
    json: {
      title: '합창대회 곡 정리',
      brief: '곡 목록이 왔어요. 몇 곡인지 정리해주세요.',
      stage: '음악',
      defineQ: '나는 곡 목록에서 무엇이 나오면 성공이라고 생각하나요?',
      defineOptions: [
        { v: '적힌 곡의 전체 개수', key: 'total' },
        { v: '서로 다른 곡의 수', key: 'unique' }
      ],
      methodContext: '곡 목록을',
      itemName: '곡',
      inputs: [
        { name: '1반 선곡', v: '봄날,좋은날,소우주' },
        { name: '2반 선곡', v: '밤편지,봄날,에너지,좋은날' },
        { name: '전체 합산', v: '봄날,좋은날,소우주,밤편지,봄날,좋은날' }
      ]
    }
  }
];

/* 수업 주제와 겹치지 않는 예시 2개 선택 */
function pickExamples(lesson) {
  var lower = (lesson || '').toLowerCase();
  var filtered = EXAMPLES.filter(function (ex) {
    return lower.indexOf(ex.context) === -1;
  });
  if (filtered.length < 2) filtered = EXAMPLES;
  /* 랜덤 2개 */
  var shuffled = filtered.sort(function () { return Math.random() - 0.5; });
  return shuffled.slice(0, 2);
}

/* ── 프롬프트 생성 ──────────────────────────────── */
function buildMessages(lesson, keyPoint, difficulty) {
  var diff = difficulty || 'medium';
  var dupCount = diff === 'easy' ? '1~2개' : diff === 'hard' ? '3~4개' : '2~3개';
  var examples = pickExamples(lesson);

  var system = [
    '당신은 중학교 컴퓨팅 사고력 수업 문제를 설계하는 전문가입니다.',
    '',
    '## 당신의 역할',
    '강사가 오늘 수업에서 가르친 파이썬 개념을 알려줍니다.',
    '당신은 그 개념을 학생이 직접 체험할 수 있는 "데이터를 나누고 세는" 실생활 문제를 만듭니다.',
    '',
    '## 핵심 규칙',
    '1. 문제의 상황(제목, 요청, 자료)은 반드시 수업에서 배운 개념과 연결되어야 합니다.',
    '   - "리스트와 반복문" → 여러 항목이 담긴 목록을 다루는 상황',
    '   - "조건문 if-else" → 조건에 따라 걸러내는 상황',
    '   - "딕셔너리" → 이름표(키)가 붙은 데이터를 다루는 상황',
    '   - "함수" → 같은 작업을 여러 번 반복하는 상황',
    '   수업 개념이 문제 상황에 자연스럽게 녹아들어야 합니다.',
    '',
    '2. brief(업무 요청)는 모호하게 씁니다.',
    '   - "몇 개인지 알려주세요" (O) — 전체인지 서로 다른인지 안 밝힘',
    '   - "서로 다른 메뉴가 몇 개인지" (X) — 답을 알려줌',
    '',
    '3. 자료 3개의 구조:',
    '   - 자료 1: 항목 3~4개, 중복 없음',
    '   - 자료 2: 항목 4~5개, 중복 없음',
    '   - 자료 3: 항목 5~7개, 반드시 ' + dupCount + '의 중복 포함',
    '   자료 1과 2에는 절대 중복이 없어야 합니다.',
    '',
    '4. 자료의 항목은 실제 한국어 단어를 사용합니다.',
    '   - "사과,바나나,우유" (O)',
    '   - "항목A,항목B,항목C" (X)',
    '   - "노래1,노래2" (X)',
    '',
    '5. 자료의 이름은 구체적이어야 합니다.',
    '   - "월요일 급식", "1반 신청" (O)',
    '   - "자료 1", "데이터 1" (X)',
    '',
    '6. 한국어만 사용합니다. 한자, 일본어, 영어를 쓰지 않습니다.',
    '',
    '## 응답 형식',
    'JSON만 응답하세요. 설명, 마크다운, 주석을 넣지 마세요.'
  ].join('\n');

  var user = [
    '오늘 수업 내용: ' + lesson,
    '핵심 포인트: ' + keyPoint,
    '',
    '위 수업 내용과 연결되는 실생활 문제를 하나 만들어주세요.',
    '',
    '참고 예시 (이 예시와 다른 주제로 만드세요):',
    '',
    '예시 1:',
    JSON.stringify(examples[0].json, null, 2),
    '',
    '예시 2:',
    JSON.stringify(examples[1].json, null, 2),
    '',
    '위 형식과 동일한 JSON을 만들어주세요.',
    'title은 15자 이내, brief는 30자 이내.',
    'methodContext는 "~를" 또는 "~을"로 끝나야 합니다.'
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

/* ── LLM 호출 ──────────────────────────────────── */
async function generateWithLLM(lesson, keyPoint, difficulty) {
  var apiKey = (process.env.PICKLE_API_KEY || '').replace(/[\s\u2028\u2029\u200B-\u200F\uFEFF]/g, '');
  if (!apiKey) throw new Error('PICKLE_API_KEY가 설정되지 않았습니다.');

  var messages = buildMessages(lesson, keyPoint, difficulty);

  var res = await fetch('https://llm.pcl.kr/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: 'pickle-general',
      max_tokens: 1024,
      messages: messages
    })
  });

  if (!res.ok) {
    var errBody = await res.text();
    throw new Error('LLM API 오류: ' + res.status + ' ' + errBody);
  }

  var data = await res.json();
  var text = data.choices[0].message.content;
  text = text.replace(/[\u2028\u2029\u0000-\u001F]/g, ' ');

  var match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON 파싱 실패');
  var p = JSON.parse(match[0]);

  /* ── Phase 2: 후처리 검증 ────────────────────── */
  if (!p.inputs || p.inputs.length < 3) throw new Error('자료가 3개 미만');

  /* CJK 문자 제거 */
  function strip(s) {
    return String(s)
      .replace(/[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\uFF00-\uFFEF]/g, '')
      .replace(/\s{2,}/g, ' ').trim();
  }
  p.title = strip(p.title || '');
  p.brief = strip(p.brief || '');
  if (p.defineQ) p.defineQ = strip(p.defineQ);
  if (p.methodContext) p.methodContext = strip(p.methodContext);
  if (p.itemName) p.itemName = strip(p.itemName);
  if (p.defineOptions) p.defineOptions.forEach(function (o) { o.v = strip(o.v); });
  p.inputs.forEach(function (inp) { inp.name = strip(inp.name); inp.v = strip(inp.v); });

  /* 자료 이름 플레이스홀더 교정 */
  var stage = p.stage || '수업';
  p.inputs.forEach(function (inp, i) {
    if (!inp.name || /자료\s*\d|데이터\s*\d/i.test(inp.name)) {
      inp.name = stage + ' 자료 ' + (i + 1);
    }
  });

  /* 길이 제한 */
  if (p.title && p.title.length > 20) p.title = p.title.substring(0, 20);
  if (p.brief && p.brief.length > 50) p.brief = p.brief.substring(0, 50);

  /* 쉼표 외 구분자 통일 */
  p.inputs.forEach(function (inp) {
    inp.v = inp.v.replace(/[、\s\/|·→]+/g, ',').replace(/,+/g, ',').replace(/^,|,$/g, '');
  });

  /* "항목A" 패턴 감지 → 거부 */
  var hasPlaceholder = p.inputs.some(function (inp) {
    return /[A-Za-z]\d*,/.test(inp.v) || /항목\d|노래\d|곡\d|이름\d/.test(inp.v);
  });
  if (hasPlaceholder) throw new Error('자료에 플레이스홀더가 포함됨 — 재시도 필요');

  /* 자료 1, 2에서 중복 제거 */
  for (var di = 0; di < Math.min(2, p.inputs.length); di++) {
    var items = p.inputs[di].v.split(',');
    var seen = [];
    items.forEach(function (x) { if (seen.indexOf(x) === -1) seen.push(x); });
    p.inputs[di].v = seen.join(',');
  }

  /* 자료 3에 중복 없으면 강제 추가 */
  var last = p.inputs[p.inputs.length - 1].v.split(',');
  var uniq = []; last.forEach(function (x) { if (uniq.indexOf(x) === -1) uniq.push(x); });
  if (last.length === uniq.length) {
    p.inputs[p.inputs.length - 1].v += ',' + last[0];
  }

  /* brief에서 답 암시 제거 */
  p.brief = (p.brief || '')
    .replace(/서로\s*다른/g, '')
    .replace(/전체\s*/g, '')
    .replace(/중복/g, '')
    .replace(/인원\s*수/g, '몇 명인지')
    .replace(/몇\s*명/g, '몇 개')   /* "몇 명"도 답 암시 — "몇 개"가 더 모호 */
    .replace(/\s{2,}/g, ' ').trim();

  /* brief 끝이 자연스러운지 */
  if (!/[요다세]\.?$/.test(p.brief)) p.brief += '.';

  /* 자료 항목 최소 3개 보장 — 부족하면 다른 자료에서 빌려옴 */
  var allItems = [];
  p.inputs.forEach(function (inp) {
    inp.v.split(',').filter(Boolean).forEach(function (x) {
      if (allItems.indexOf(x) === -1) allItems.push(x);
    });
  });
  p.inputs.forEach(function (inp) {
    var items = inp.v.split(',').filter(Boolean);
    while (items.length < 3 && allItems.length > 0) {
      var pick = allItems[Math.floor(Math.random() * allItems.length)];
      if (items.indexOf(pick) === -1) items.push(pick);
      else allItems = allItems.filter(function (x) { return x !== pick; });
      if (allItems.length === 0) break;
    }
    inp.v = items.join(',');
  });

  /* 조사 교정 */
  if (p.itemName) p.itemName = p.itemName.replace(/[은는]$/, '');

  /* 기본값 */
  if (!p.methodContext) p.methodContext = '목록을';
  if (!p.itemName) p.itemName = '항목';
  if (!p.defineOptions || p.defineOptions.length < 2) {
    p.defineOptions = [
      { v: '적힌 항목의 전체 개수', key: 'total' },
      { v: '서로 다른 항목의 개수', key: 'unique' }
    ];
  }

  /* ── 표준 형식 변환 ────────────────────────── */
  var id = 'ai-' + Date.now().toString(36);
  var inputs = p.inputs.map(function (inp, i) {
    return { id: 'd' + String(i + 1).padStart(2, '0'), name: inp.name, v: inp.v };
  });
  var verify = inputs.map(function (inp) {
    var items = inp.v.split(',');
    var u = []; items.forEach(function (x) { if (u.indexOf(x) === -1) u.push(x); });
    return { input: inp.v, total: items.length, unique: u.length };
  });

  return {
    id: id, no: 'AI', type: 'sentence', stage: stage,
    title: p.title, brief: p.brief, lesson: lesson, keyPoint: keyPoint,
    define: { q: p.defineQ || '무엇이 나오면 성공이라고 생각하나요?', options: p.defineOptions },
    method: {
      sentences: [
        { template: p.methodContext + ' {sep} 기준으로 나눈다.', slot: 'sep', options: ['쉼표', '공백', '줄바꿈'] },
        { template: '같은 ' + p.itemName + (hasJongseong(p.itemName) ? '은' : '는') + ' {dedup}.', slot: 'dedup', options: ['각각 남긴다', '하나만 남긴다'] },
        { template: '{output}을 출력한다.', slot: 'output', options: ['남은 항목의 개수', '항상 숫자 3'] }
      ]
    },
    inputs: inputs, verify: verify
  };
}

/* ── Vercel Handler ────────────────────────────── */
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

  /* 최대 2회 시도 */
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var mission = await generateWithLLM(body.lesson, body.keyPoint, body.difficulty);
      return res.status(200).json(mission);
    } catch (err) {
      if (attempt === 0 && err.message.indexOf('플레이스홀더') !== -1) continue;
      if (attempt === 0 && err.message.indexOf('JSON') !== -1) continue;
      return res.status(500).json({ error: err.message });
    }
  }
  return res.status(500).json({ error: '2회 시도 실패' });
};
