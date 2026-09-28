/* Cut & Check — 미션 자동 생성 API
 *
 * POST /api/generate-mission
 * Body: { lesson, keyPoint, difficulty? }
 * → SENTENCE_MISSIONS 형식 미션 데이터
 *
 * few-shot 예시로 품질 확보. 응답 검증 강화.
 */

var EXAMPLES = [
  {
    title: '창고 주문서 정리',
    brief: '주문서가 들어왔어요. 상품이 몇 개인지 알려주세요.',
    stage: '정리',
    defineQ: '나는 주문서에서 무엇이 나오면 성공이라고 생각하나요?',
    defineOptions: [
      { v: '주문된 상품의 전체 개수', key: 'total' },
      { v: '서로 다른 상품 이름의 개수', key: 'unique' }
    ],
    methodContext: '주문서를',
    itemName: '상품',
    inputs: [
      { name: '월요일 주문서', v: '사과,바나나,우유' },
      { name: '화요일 주문서', v: '빵,치즈,주스,요구르트' },
      { name: '수요일 주문서', v: '사과,바나나,우유,사과,빵' }
    ]
  },
  {
    title: '오늘 수업 출석 확인',
    brief: '출석부를 보내셨어요. 오늘 몇 명이 왔는지 알려주세요.',
    stage: '출석',
    defineQ: '나는 출석부에서 무엇이 나오면 성공이라고 생각하나요?',
    defineOptions: [
      { v: '이름이 적힌 전체 횟수', key: 'total' },
      { v: '서로 다른 학생 수', key: 'unique' }
    ],
    methodContext: '출석부를',
    itemName: '이름',
    inputs: [
      { name: '1교시 출석', v: '민수,지우,현우' },
      { name: '2교시 출석', v: '서연,도윤,하은,민준' },
      { name: '전체 출석 합산', v: '민수,지우,민수,현우,지우,서연' }
    ]
  }
];

async function generateWithLLM(lesson, keyPoint, difficulty) {
  var apiKey = (process.env.PICKLE_API_KEY || '').replace(/[\s\u2028\u2029\u200B-\u200F\uFEFF]/g, '');
  if (!apiKey) throw new Error('PICKLE_API_KEY가 설정되지 않았습니다.');

  var diff = difficulty || 'medium';
  var dupHint = diff === 'easy' ? '1~2개' : diff === 'hard' ? '3~4개' : '2~3개';

  var prompt = '당신은 중학교 컴퓨팅 사고력 수업을 설계하는 전문가입니다.\n\n' +
    '오늘 수업 내용: ' + lesson + '\n' +
    '핵심 포인트: ' + keyPoint + '\n\n' +
    '아래 두 예시와 같은 형식으로 새 문제를 하나 만들어주세요.\n\n' +
    '예시 1:\n' + JSON.stringify(EXAMPLES[0], null, 2) + '\n\n' +
    '예시 2:\n' + JSON.stringify(EXAMPLES[1], null, 2) + '\n\n' +
    '새 문제를 JSON으로만 응답하세요. 설명 없이 JSON만.\n\n' +
    '규칙:\n' +
    '- title: 15자 이내, 구체적\n' +
    '- brief: 30자 이내, 모호하게 (전체인지 서로 다른인지 밝히지 않음)\n' +
    '- inputs의 name: 구체적 (예: "월요일 주문서", "3월 대출 기록"). "자료 1"처럼 쓰지 않음\n' +
    '- inputs의 v: 쉼표(,)로만 구분, 공백 없이, 한국어만\n' +
    '- 세 번째 자료에 반드시 ' + dupHint + '의 중복 포함\n' +
    '- methodContext: "~를" 또는 "~을" 로 끝남 (예: "주문서를", "명단을")\n' +
    '- 수업 내용과 연결되는 실생활 맥락\n' +
    '- 한자, 일본어, 영어를 쓰지 않는다. 순한국어만 사용';

  var res = await fetch('https://llm.pcl.kr/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: 'pickle-general',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
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

  /* ── 검증 및 교정 ──────────────────────────── */
  if (!p.inputs || p.inputs.length < 3) throw new Error('자료가 3개 미만');

  /* 한자·일본어·특수 유니코드 제거 — LLM이 가끔 섞어서 생성함 */
  function stripCJK(s) {
    return String(s)
      .replace(/[\u4E00-\u9FFF\u3400-\u4DBF]/g, '')  /* 한자 */
      .replace(/[\u3040-\u309F\u30A0-\u30FF]/g, '')   /* 일본어 */
      .replace(/[\uFF00-\uFFEF]/g, '')                 /* 전각 문자 */
      .replace(/\s{2,}/g, ' ').trim();
  }
  p.title = stripCJK(p.title || '');
  p.brief = stripCJK(p.brief || '');
  if (p.defineQ) p.defineQ = stripCJK(p.defineQ);
  if (p.methodContext) p.methodContext = stripCJK(p.methodContext);
  if (p.itemName) p.itemName = stripCJK(p.itemName);
  if (p.defineOptions) p.defineOptions.forEach(function (o) { o.v = stripCJK(o.v); });
  p.inputs.forEach(function (inp) {
    inp.name = stripCJK(inp.name);
    inp.v = stripCJK(inp.v);
  });

  /* 자료 이름이 플레이스홀더면 교정 */
  var stage = p.stage || '수업';
  p.inputs.forEach(function (inp, i) {
    if (!inp.name || /자료\s*\d/.test(inp.name)) {
      inp.name = stage + ' 자료 ' + (i + 1);
    }
  });

  /* title, brief 길이 */
  if (p.title && p.title.length > 20) p.title = p.title.substring(0, 20);
  if (p.brief && p.brief.length > 50) p.brief = p.brief.substring(0, 50);

  /* 쉼표 외 구분자 통일 */
  p.inputs.forEach(function (inp) {
    inp.v = inp.v.replace(/[、\s\/|·→]+/g, ',').replace(/,+/g, ',').replace(/^,|,$/g, '');
  });

  /* 마지막 자료에 중복 없으면 강제 추가 */
  var last = p.inputs[p.inputs.length - 1].v.split(',');
  var uniq = []; last.forEach(function (x) { if (uniq.indexOf(x) === -1) uniq.push(x); });
  if (last.length === uniq.length) {
    p.inputs[p.inputs.length - 1].v += ',' + last[0];
  }

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
        { template: '같은 ' + p.itemName + '은 {dedup}.', slot: 'dedup', options: ['각각 남긴다', '하나만 남긴다'] },
        { template: '{output}을 출력한다.', slot: 'output', options: ['남은 항목의 개수', '항상 숫자 3'] }
      ]
    },
    inputs: inputs, verify: verify
  };
}

module.exports = async function (req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능합니다.' });
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    var body = req.body || {};
    if (!body.lesson) return res.status(400).json({ error: '수업 내용을 입력해주세요.' });
    if (!body.keyPoint) return res.status(400).json({ error: '핵심 포인트를 입력해주세요.' });

    var mission = await generateWithLLM(body.lesson, body.keyPoint, body.difficulty);
    return res.status(200).json(mission);
  } catch (err) {
    /* 타임아웃 등 재시도 */
    if (err.message && err.message.indexOf('timeout') !== -1) {
      try {
        var retry = await generateWithLLM(body.lesson, body.keyPoint, body.difficulty);
        return res.status(200).json(retry);
      } catch (e2) {
        return res.status(500).json({ error: e2.message });
      }
    }
    return res.status(500).json({ error: err.message });
  }
};
