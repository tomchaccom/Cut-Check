/* Cut & Check — 미션 자동 생성 API
 *
 * POST /api/generate-mission
 * Body: {
 *   lesson: string,      — 오늘 수업에서 뭘 배웠는지
 *   keyPoint: string,     — 강사가 생각하는 핵심
 *   difficulty?: string   — easy | medium | hard
 * }
 * → 문장형 미션 데이터 (SENTENCE_MISSIONS 형식)
 *
 * ANTHROPIC_API_KEY 환경변수 필수.
 */

async function generateWithClaude(lesson, keyPoint, difficulty) {
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.');

  var diff = difficulty || 'medium';
  var dupHint = diff === 'easy' ? '1~2개' : diff === 'hard' ? '3~4개' : '2~3개';

  var prompt = '당신은 중학교 컴퓨팅 사고력 수업을 설계하는 전문가입니다.\n\n' +
    '오늘 수업 내용:\n' + lesson + '\n\n' +
    '강사가 생각하는 핵심:\n' + keyPoint + '\n\n' +
    '위 수업 내용을 바탕으로, 학생이 "데이터를 나누고 세는" 문제를 하나 만들어주세요.\n\n' +
    '반드시 아래 JSON 형식으로만 응답하세요. 설명이나 마크다운 없이 JSON만:\n' +
    '```json\n' +
    '{\n' +
    '  "title": "미션 제목 (15자 이내)",\n' +
    '  "brief": "업무 요청 (모호하게. 방법을 적지 않음. 30자 이내)",\n' +
    '  "stage": "주제 영역 (2~4자)",\n' +
    '  "defineQ": "성공 조건 질문",\n' +
    '  "defineOptions": [\n' +
    '    {"v": "전체 개수를 세는 해석", "key": "total"},\n' +
    '    {"v": "서로 다른 것만 세는 해석", "key": "unique"}\n' +
    '  ],\n' +
    '  "methodContext": "무엇을 나누는지 (예: 목록을, 명단을, 기록을)",\n' +
    '  "itemName": "항목 이름 (예: 상품, 학생, 메뉴)",\n' +
    '  "inputs": [\n' +
    '    {"name": "자료 1 이름", "v": "쉼표로 구분된 3~5개 항목"},\n' +
    '    {"name": "자료 2 이름", "v": "쉼표로 구분된 4~6개 항목"},\n' +
    '    {"name": "자료 3 이름", "v": "쉼표로 구분된 5~7개 항목. 반드시 ' + dupHint + '의 중복 포함"}\n' +
    '  ]\n' +
    '}\n' +
    '```\n\n' +
    '핵심 규칙:\n' +
    '- brief는 "몇 개인지 알려주세요" 같이 모호하게. 전체인지 서로 다른인지 밝히지 않음\n' +
    '- 자료는 쉼표(,)로만 구분. 공백 없이\n' +
    '- 세 번째 자료에는 반드시 중복 포함 (전체 개수 ≠ 서로 다른 개수)\n' +
    '- 수업에서 배운 개념과 연결되는 실생활 맥락\n' +
    '- 한국어 항목만 사용';

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

  if (!res.ok) {
    var errBody = await res.text();
    throw new Error('Claude API 오류: ' + res.status + ' ' + errBody);
  }

  var data = await res.json();
  var text = data.content[0].text;

  var match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON 파싱 실패: ' + text.substring(0, 200));
  var parsed = JSON.parse(match[0]);

  /* 검증 */
  if (!parsed.inputs || parsed.inputs.length < 3) throw new Error('자료가 3개 미만');
  var last = parsed.inputs[parsed.inputs.length - 1].v.split(',');
  var uniq = []; last.forEach(function (x) { if (uniq.indexOf(x) === -1) uniq.push(x); });
  if (last.length === uniq.length) {
    /* 중복이 없으면 강제 추가 */
    parsed.inputs[parsed.inputs.length - 1].v += ',' + last[0];
  }

  /* 표준 형식 변환 */
  var id = 'ai-' + Date.now().toString(36);
  var inputs = parsed.inputs.map(function (inp, i) {
    return { id: 'd' + String(i + 1).padStart(2, '0'), name: inp.name, v: inp.v };
  });

  var verify = inputs.map(function (inp) {
    var items = inp.v.split(',');
    var unique = []; items.forEach(function (x) { if (unique.indexOf(x) === -1) unique.push(x); });
    return { input: inp.v, total: items.length, unique: unique.length };
  });

  return {
    id: id,
    no: 'AI',
    type: 'sentence',
    stage: parsed.stage || '수업',
    title: parsed.title,
    brief: parsed.brief,
    lesson: lesson,
    keyPoint: keyPoint,
    define: {
      q: parsed.defineQ || '나는 이 목록에서 무엇이 나오면 성공이라고 생각하나요?',
      options: parsed.defineOptions || [
        { v: '적힌 항목의 전체 개수', key: 'total' },
        { v: '서로 다른 항목의 개수', key: 'unique' }
      ]
    },
    method: {
      sentences: [
        {
          template: (parsed.methodContext || '목록을') + ' {sep} 기준으로 나눈다.',
          slot: 'sep',
          options: ['쉼표', '공백', '줄바꿈']
        },
        {
          template: '같은 ' + (parsed.itemName || '항목') + '은 {dedup}.',
          slot: 'dedup',
          options: ['각각 남긴다', '하나만 남긴다']
        },
        {
          template: '{output}을 출력한다.',
          slot: 'output',
          options: ['남은 항목의 개수', '항상 숫자 3']
        }
      ]
    },
    inputs: inputs,
    verify: verify
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
    if (!body.lesson) return res.status(400).json({ error: '수업 내용(lesson)을 입력해주세요.' });
    if (!body.keyPoint) return res.status(400).json({ error: '핵심 포인트(keyPoint)를 입력해주세요.' });

    var mission = await generateWithClaude(body.lesson, body.keyPoint, body.difficulty);
    return res.status(200).json(mission);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
