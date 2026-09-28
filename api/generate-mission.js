/* Cut & Check — 미션 자동 생성 API
 *
 * POST /api/generate-mission
 * Body: { topic?: string, difficulty?: 'easy'|'medium'|'hard' }
 * → 문장형 미션 데이터 (SENTENCE_MISSIONS 형식)
 *
 * ANTHROPIC_API_KEY 환경변수가 있으면 Claude로 생성.
 * 없으면 템플릿 기반 랜덤 생성 (서버 없이도 동작).
 */

/* ── 템플릿 기반 생성 ──────────────────────────── */
var TEMPLATES = [
  {
    domain: '마트',
    titles: ['장바구니 정리', '할인 상품 세기', '재고 확인'],
    briefs: [
      '마트에서 장바구니 목록이 왔어요. 상품이 몇 가지인지 알려주세요.',
      '오늘 할인 상품 목록이 도착했어요. 몇 개인지 세어주세요.',
      '창고 재고 목록을 정리해주세요. 품목이 몇 가지인지 알려주세요.'
    ],
    items: ['사과', '바나나', '우유', '빵', '치즈', '주스', '요구르트', '라면', '계란', '두부',
            '감자', '양파', '당근', '딸기', '포도', '수박', '참치', '김치', '떡', '과자'],
    defineQ: '나는 목록에서 무엇이 나오면 성공이라고 생각하나요?'
  },
  {
    domain: '도서관',
    titles: ['대출 기록 정리', '반납 목록 세기', '인기 도서 확인'],
    briefs: [
      '도서관에서 오늘 대출 기록이 왔어요. 몇 권인지 알려주세요.',
      '반납할 책 목록이에요. 몇 권인지 세어주세요.',
      '이번 달 인기 도서 목록이에요. 몇 종류인지 정리해주세요.'
    ],
    items: ['해리포터', '어린왕자', '홍길동전', '삼국지', '데미안', '노인과바다', '1984',
            '코스모스', '사피엔스', '동물농장', '그리스신화', '나미야잡화점', '연금술사', '빅히스토리'],
    defineQ: '나는 목록에서 무엇이 나오면 성공이라고 생각하나요?'
  },
  {
    domain: '운동회',
    titles: ['참가자 명단 정리', '팀 인원 세기', '종목별 신청 확인'],
    briefs: [
      '운동회 참가 신청서가 왔어요. 몇 명이 신청했는지 알려주세요.',
      '팀별 명단이 도착했어요. 인원이 몇 명인지 세어주세요.',
      '종목별 신청자 목록이에요. 신청자가 몇 명인지 정리해주세요.'
    ],
    items: ['민수', '지우', '현우', '서연', '도윤', '하은', '민준', '수아', '예준', '지민',
            '유진', '시우', '채원', '건우', '나윤', '준서', '소율', '윤아', '태민', '가은'],
    defineQ: '나는 명단에서 무엇이 나오면 성공이라고 생각하나요?'
  },
  {
    domain: '급식',
    titles: ['메뉴 정리', '식재료 세기', '알레르기 식품 확인'],
    briefs: [
      '영양사 선생님이 급식 메뉴를 보내셨어요. 메뉴가 몇 가지인지 정리해주세요.',
      '오늘 사용할 식재료 목록이에요. 몇 가지인지 세어주세요.',
      '식단에서 알레르기 식품이 몇 개인지 확인해주세요.'
    ],
    items: ['밥', '국', '김치', '비빔밥', '미역국', '깍두기', '요구르트', '불고기',
            '제육볶음', '된장찌개', '계란말이', '샐러드', '떡볶이', '잡채', '콩나물'],
    defineQ: '나는 메뉴판에서 무엇이 나오면 성공이라고 생각하나요?'
  }
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  var copy = arr.slice();
  var out = [];
  for (var i = 0; i < n && copy.length; i++) {
    var idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function generateFromTemplate(opts) {
  var tpl = opts && opts.topic
    ? TEMPLATES.find(function (t) { return t.domain === opts.topic; }) || pick(TEMPLATES)
    : pick(TEMPLATES);

  var diff = (opts && opts.difficulty) || 'medium';
  var dataCount = diff === 'easy' ? 2 : 3;
  var dupCount = diff === 'easy' ? 1 : diff === 'hard' ? 3 : 2;

  /* 자료 생성 */
  var inputs = [];
  var verify = [];
  for (var i = 0; i < dataCount; i++) {
    var n = 3 + Math.floor(Math.random() * 3); // 3~5개
    var items = pickN(tpl.items, n);

    /* 마지막 자료에 중복 추가 */
    if (i === dataCount - 1) {
      for (var d = 0; d < dupCount; d++) {
        items.push(items[Math.floor(Math.random() * Math.min(items.length, n))]);
      }
    }

    var v = items.join(',');
    var unique = [];
    items.forEach(function (x) { if (unique.indexOf(x) === -1) unique.push(x); });

    inputs.push({ id: 'd' + String(i + 1).padStart(2, '0'), name: tpl.domain + ' 자료 ' + (i + 1), v: v });
    verify.push({ input: v, total: items.length, unique: unique.length });
  }

  var id = 'gen-' + Date.now().toString(36);
  return {
    id: id,
    no: 'G',
    type: 'sentence',
    stage: tpl.domain,
    title: pick(tpl.titles),
    brief: pick(tpl.briefs),
    define: {
      q: tpl.defineQ,
      options: [
        { v: '적힌 항목의 전체 개수', key: 'total' },
        { v: '서로 다른 항목의 개수', key: 'unique' }
      ]
    },
    method: {
      sentences: [
        { template: '목록을 {sep} 기준으로 나눈다.', slot: 'sep', options: ['쉼표', '공백', '줄바꿈'] },
        { template: '같은 항목은 {dedup}.', slot: 'dedup', options: ['각각 남긴다', '하나만 남긴다'] },
        { template: '{output}을 출력한다.', slot: 'output', options: ['남은 항목의 개수', '항상 숫자 3'] }
      ]
    },
    inputs: inputs,
    verify: verify
  };
}

/* ── Claude API 기반 생성 ──────────────────────── */
async function generateWithClaude(opts) {
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  var topic = (opts && opts.topic) || '자유 주제';
  var prompt = '중학교 1학년 컴퓨팅 사고력 수업용 문제를 하나 만들어주세요.\n\n' +
    '주제: ' + topic + '\n\n' +
    '다음 JSON 형식으로 반환해주세요. 설명 없이 JSON만:\n' +
    '{\n' +
    '  "title": "제목",\n' +
    '  "brief": "모호한 업무 요청 (방법을 적지 않음)",\n' +
    '  "stage": "주제 영역",\n' +
    '  "inputs": [\n' +
    '    {"name": "자료 1", "v": "쉼표로 구분된 항목들"},\n' +
    '    {"name": "자료 2", "v": "쉼표로 구분된 항목들"},\n' +
    '    {"name": "자료 3", "v": "쉼표로 구분된 항목들. 중복을 포함해서 전체 개수와 서로 다른 개수가 달라야 함"}\n' +
    '  ]\n' +
    '}\n\n' +
    '규칙:\n' +
    '- 자료는 쉼표로 구분된 한국어 단어\n' +
    '- 세 번째 자료에는 반드시 중복이 포함되어야 함\n' +
    '- brief는 "몇 개인지 알려주세요" 같은 모호한 요청 (전체인지 서로 다른인지 안 밝힘)\n' +
    '- 항목은 3~7개 사이';

  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) return null;
  var data = await res.json();
  var text = data.content[0].text;

  /* JSON 파싱 */
  var match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  var parsed = JSON.parse(match[0]);

  /* 표준 형식으로 변환 */
  var id = 'ai-' + Date.now().toString(36);
  var inputs = parsed.inputs.map(function (inp, i) {
    return { id: 'd' + String(i + 1).padStart(2, '0'), name: inp.name, v: inp.v };
  });

  return {
    id: id, no: 'AI', type: 'sentence',
    stage: parsed.stage || topic,
    title: parsed.title,
    brief: parsed.brief,
    define: {
      q: '나는 이 목록에서 무엇이 나오면 성공이라고 생각하나요?',
      options: [
        { v: '적힌 항목의 전체 개수', key: 'total' },
        { v: '서로 다른 항목의 개수', key: 'unique' }
      ]
    },
    method: {
      sentences: [
        { template: '목록을 {sep} 기준으로 나눈다.', slot: 'sep', options: ['쉼표', '공백', '줄바꿈'] },
        { template: '같은 항목은 {dedup}.', slot: 'dedup', options: ['각각 남긴다', '하나만 남긴다'] },
        { template: '{output}을 출력한다.', slot: 'output', options: ['남은 항목의 개수', '항상 숫자 3'] }
      ]
    },
    inputs: inputs,
    verify: inputs.map(function (inp) {
      var items = inp.v.split(',');
      var unique = []; items.forEach(function (x) { if (unique.indexOf(x) === -1) unique.push(x); });
      return { input: inp.v, total: items.length, unique: unique.length };
    })
  };
}

/* ── Vercel Serverless Handler ─────────────────── */
module.exports = async function (req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST만 가능합니다.' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    var opts = req.body || {};
    var mission = null;

    /* Claude API 키가 있으면 AI 생성 시도 */
    if (process.env.ANTHROPIC_API_KEY) {
      mission = await generateWithClaude(opts);
    }

    /* AI 실패 또는 키 없으면 템플릿 */
    if (!mission) {
      mission = generateFromTemplate(opts);
    }

    return res.status(200).json(mission);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
