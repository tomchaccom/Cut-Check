/* Cut & Check — 미션 데이터
 *
 * 미션 설계 규칙
 *   1. brief(업무 요청)는 일부러 모호하게 쓴다. 방법을 적으면 분해가 이미 끝나버린다.
 *   2. define.options 에는 반드시 함정을 섞는다.
 *        trap:'hardcode' — 이번 입력의 결과를 그대로 성공으로 삼는 문장
 *        trap:'luck'     — 오류만 안 나면 성공으로 삼는 문장
 *      어느 게 맞는지 절대 알려주지 않는다. 결과로 학생이 스스로 판정한다.
 *   3. inputs 의 마지막 한 장은 반드시 반례다. 학생의 기준이 깨지는 입력.
 *   4. support 는 지원 페이딩 단계.
 *        1 = 기준도 보기, 이유도 보기
 *        2 = 기준은 보기, 이유는 직접 쓰기
 *        3 = 기준도 직접 쓰기
 */
(function (CC) {
  'use strict';

  var MISSIONS = [
    /* ------------------------------------------------------------------ */
    {
      id: 'm1',
      no: '01',
      stage: '분해',
      support: 1,
      domain: 'code',
      title: '길어진 주문서를 정리하라',
      team: '데이터 정리팀',
      brief: '인턴님, 고객이 보낸 주문서 좀 정리해주세요. 상품별로 볼 수 있게요.',

      define: {
        q: '내 프로그램이 잘 돌아갔다는 걸 어떻게 알 수 있을까요?',
        options: [
          { v: '화면에 사과, 바나나, 우유 라고 뜨면 성공이다', trap: 'hardcode' },
          { v: '상품이 몇 개가 들어오든 하나씩 따로 셀 수 있으면 성공이다', trap: null },
          { v: '빨간 오류 글씨 없이 실행되면 성공이다', trap: 'luck' }
        ]
      },

      cut: {
        q: '상품과 상품 사이를 무엇으로 자를까요?',
        sampleLabel: '오늘 들어온 주문서',
        sample: '사과, 바나나, 우유',
        chips: [
          { v: ',', n: '쉼표', g: ',' },
          { v: ' ', n: '띄어쓰기', g: '␣' },
          { v: '/', n: '빗금', g: '/' },
          { v: '-', n: '붙임표', g: '-' }
        ],
        whyQ: '왜 그걸 골랐나요?',
        whyOptions: [
          '상품과 상품 사이에 항상 이게 있어서',
          '이번 주문서에 이게 보여서',
          '잘 모르겠고 그냥 골랐어요'
        ]
      },

      library: ['input', 'cut', 'trim', 'save', 'loop', 'check', 'show'],
      vars: { textVar: 'order_text', listVar: 'items' },

      inputs: [
        { name: '오늘 주문서', v: '사과, 바나나, 우유' },
        { name: '상품이 늘어난 주문서', v: '사과,바나나,우유,딸기' },
        { name: '띄어쓰기만 있는 주문서', v: '사과 바나나 우유', counter: true }
      ],

      /* 통과 조건은 "방법"이 아니라 "결과"로만 적는다.
       *
       * 주의: 졸업 과제에서는 학생이 직접 만든 입력이 들어온다.
       * 미션이 정해둔 구분자로 정답을 계산하면 학생이 만든 입력을 오판한다.
       * 그래서 구분자에 의존하지 않는 기준을 쓴다 —
       * "더 쪼갤 수 있어 보이는 조각이 남아 있으면 덜 잘린 것이다". */
      goal: function (res, input) {
        if (res.err || res.type !== 'list') return false;
        var SEPS = [',', ' ', '/', '-', '·', '→', '|'];
        var underSplit = res.value.some(function (piece) {
          var t = String(piece).trim();
          return SEPS.some(function (sp) { return t.indexOf(sp) !== -1; });
        });
        return !underSplit;
      },
      goalLabel: '조각 안에 더 쪼갤 게 남지 않았는가',
      counterHint: '세 번째 주문서를 한 번만 더 볼까요? 상품이 몇 개로 세어졌나요?'
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'm2',
      no: '02',
      stage: '반복과 조건',
      support: 2,
      domain: 'code',
      title: '알레르기 재료를 찾아내라',
      team: '고객 안전팀',
      brief: '인턴님, 주문서에 알레르기 주의 재료가 있는지 확인해서 알려주세요.',

      define: {
        q: '이 일이 제대로 끝났다는 걸 어떻게 알 수 있을까요?',
        options: [
          { v: '화면에 우유라고 뜨면 성공이다', trap: 'hardcode' },
          { v: '어떤 주문서가 와도 주의 재료만 골라낼 수 있으면 성공이다', trap: null },
          { v: '주의 재료가 하나라도 나오면 성공이다', trap: 'hardcode' },
          { v: '오류 없이 끝까지 실행되면 성공이다', trap: 'luck' }
        ]
      },

      cut: {
        q: '상품과 상품 사이를 무엇으로 자를까요?',
        sampleLabel: '방금 들어온 주문서',
        sample: '사과, 우유, 빵',
        chips: [
          { v: ',', n: '쉼표', g: ',' },
          { v: ' ', n: '띄어쓰기', g: '␣' },
          { v: '·', n: '가운뎃점', g: '·' }
        ],
        whyQ: '왜 그 기준으로 정했는지 한 문장으로 쓰세요.',
        whyFree: true
      },

      targets: {
        label: '알레르기 주의 재료',
        list: ['우유', '땅콩', '새우']
      },

      library: ['input', 'cut', 'trim', 'save', 'loop', 'check', 'collect', 'show'],
      vars: { textVar: 'order_text', listVar: 'items', targetVar: 'allergy' },

      inputs: [
        { name: '오늘 주문서', v: '사과, 우유, 빵' },
        { name: '주의 재료가 여러 개', v: '김밥, 새우, 땅콩, 물' },
        { name: '주의 재료가 하나도 없는 주문서', v: '사과, 바나나, 물', counter: true }
      ],

      /* 구분자에 의존하지 않는다 — 원문에 실제로 들어 있는 주의 재료가 기준이다.
       * 졸업 과제에서 학생이 다른 구분자로 입력을 만들어도 옳게 판정된다. */
      goal: function (res, input) {
        if (res.err || res.type !== 'list') return false;
        var targets = ['우유', '땅콩', '새우'];
        var expected = targets.filter(function (t) { return input.v.indexOf(t) !== -1; });
        var got = res.value.map(function (s) { return String(s).trim(); });
        return got.length === expected.length &&
          expected.every(function (s) { return got.indexOf(s) !== -1; });
      },
      goalLabel: '주문서마다 주의 재료만 정확히 걸러냈는가',
      counterHint: '세 번째 주문서에는 주의 재료가 하나도 없어요. 그때 내 프로그램은 뭐라고 했나요?'
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'm3',
      no: '03',
      stage: '다른 세계에서',
      support: 3,
      domain: 'science',
      transfer: true,
      title: '실험 순서에서 위험 단계를 찾아라',
      team: '과학실 안전 담당',
      brief: '실험 계획서 한 줄을 받았어요. 선생님이 먼저 봐야 할 위험한 단계만 뽑아주세요.',
      transferNote: '이번 일은 컴퓨터 일이 아니에요. 그런데 쓰는 블록은 저번과 똑같습니다.',

      define: {
        q: '이 검수가 제대로 끝났다는 걸 어떻게 알 수 있을까요?',
        options: [
          { v: '알코올램프라는 말이 나오면 성공이다', trap: 'hardcode' },
          { v: '어떤 실험 계획서가 와도 위험한 단계만 뽑아내면 성공이다', trap: null },
          { v: '뭐라도 한 줄 나오면 성공이다', trap: 'luck' }
        ]
      },

      cut: {
        q: '단계와 단계 사이를 무엇으로 자를지 직접 쓰세요.',
        sampleLabel: '오늘 받은 실험 계획서',
        sample: '물 붓기 → 알코올램프 켜기 → 온도 재기',
        free: true,
        freePlaceholder: '여기에 자를 기준을 그대로 써보세요',
        whyQ: '왜 그 기준으로 정했는지 한 문장으로 쓰세요.',
        whyFree: true
      },

      targets: {
        label: '선생님 확인이 필요한 단계',
        list: ['알코올램프 켜기', '산 다루기', '칼로 자르기']
      },

      library: ['input', 'cut', 'trim', 'save', 'loop', 'check', 'collect', 'show'],
      vars: { textVar: 'plan', listVar: 'steps', targetVar: 'danger' },

      inputs: [
        { name: '오늘 계획서', v: '물 붓기 → 알코올램프 켜기 → 온도 재기' },
        { name: '위험 단계가 여러 개', v: '칼로 자르기 → 물 붓기 → 산 다루기 → 기록하기' },
        { name: '위험 단계가 없는 계획서', v: '관찰하기 → 기록하기 → 정리하기', counter: true }
      ],

      goal: function (res, input) {
        if (res.err || res.type !== 'list') return false;
        var targets = ['알코올램프 켜기', '산 다루기', '칼로 자르기'];
        var expected = targets.filter(function (t) { return input.v.indexOf(t) !== -1; });
        var got = res.value.map(function (s) { return String(s).trim(); });
        return got.length === expected.length &&
          expected.every(function (s) { return got.indexOf(s) !== -1; });
      },
      goalLabel: '계획서마다 위험한 단계만 정확히 뽑아냈는가',
      counterHint: '세 번째 계획서에는 위험한 단계가 없어요. 그때 뭐라고 나왔나요?'
    },

    /* ------------------------------------------------------------------ */
    /* 블록을 늘리는 규칙(docs/semester.md)을 실제로 적용한 첫 미션.
     *   count  — 목록을 숫자로 바꾼다. 형태가 바뀌는 새 판단이라 추가한다.
     *   unique — "같은 게 두 번 있으면 하나인가 둘인가" 라는 새 판단을 데려온다.
     * 둘 다 없으면 이 미션은 성립하지 않는다. 그게 추가 자격이다. */
    {
      id: 'm6',
      no: '06',
      stage: '세어보기',
      support: 2,
      domain: 'code',
      title: '몇 명이 신청했는지 알려줘라',
      team: '학생회 총무',
      brief: '인턴님, 동아리 신청서 받은 거 몇 명인지 알려주세요.',

      define: {
        q: '이 일이 제대로 끝났다는 걸 어떻게 알 수 있을까요?',
        options: [
          { v: '화면에 3 이라고 뜨면 성공이다', trap: 'hardcode' },
          { v: '이름이 몇 번 적혀 있든 서로 다른 사람 수를 셀 수 있으면 성공이다', trap: null },
          { v: '숫자가 나오면 성공이다', trap: 'luck' }
        ]
      },

      cut: {
        q: '이름과 이름 사이를 무엇으로 자를까요?',
        sampleLabel: '오늘 받은 신청서',
        sample: '민수, 지우, 현우',
        chips: [
          { v: ',', n: '쉼표', g: ',' },
          { v: ' ', n: '띄어쓰기', g: '␣' },
          { v: '/', n: '빗금', g: '/' }
        ],
        whyQ: '왜 그 기준으로 정했는지 한 문장으로 쓰세요.',
        whyFree: true
      },

      library: ['input', 'cut', 'trim', 'unique', 'count', 'save', 'loop', 'show'],
      vars: { textVar: 'form', listVar: 'names' },

      inputs: [
        { name: '오늘 신청서', v: '민수, 지우, 현우' },
        { name: '신청이 늘어난 날', v: '민수, 지우, 현우, 하은, 소윤' },
        { name: '같은 이름이 두 번 적힌 신청서', v: '민수, 지우, 민수', counter: true }
      ],

      /* 세는 대상이 무엇인지가 이 미션의 전부다.
       * "서로 다른 사람 수" 가 기준이므로 중복은 하나로 센다.
       * 구분자에 의존하지 않게, 원문에서 직접 계산한다. */
      goal: function (res, input) {
        if (res.err || res.type !== 'number') return false;
        var names = String(input.v).split(/[,/\s]+/)
          .map(function (x) { return x.trim(); })
          .filter(function (x) { return x.length > 0; });
        var uniq = [];
        names.forEach(function (x) { if (uniq.indexOf(x) === -1) uniq.push(x); });
        return res.value === uniq.length;
      },
      goalLabel: '신청서마다 서로 다른 사람 수가 나왔는가',
      counterHint: '세 번째 신청서를 한 번만 더 볼까요? 이름을 하나씩 짚어보면 몇 명인가요?'
    }
  ];

  /* ── 문장형 미션 ──────────────────────────────────
   * 블록 팔레트를 선택형 빈칸 문장으로 교체한 미션.
   * 학생은 성공 조건과 처리 방법을 정하고,
   * 자료를 실행한 뒤 자기 기준을 지켰는지 판단한다.
   *
   * type: 'sentence' 인 미션은 engine.runSentence() 로 실행한다.
   */
  var SENTENCE_MISSIONS = [
    {
      id: 'sm1',
      no: '01',
      type: 'sentence',
      pipelineId: 'split-unique-count',
      stage: '분해',
      title: '창고에 주문서가 들어왔어요',
      brief: '주문서에 상품이 몇 개인지 알려 주세요.',

      define: {
        q: '주문서에서 무엇이 나오면 성공일까요?',
        options: [
          { v: '주문된 상품의 전체 개수', key: 'total' },
          { v: '서로 다른 상품 이름의 개수', key: 'unique' }
        ]
      },


      inputs: [
        { id: 'd01', name: '주문서 01', v: '사과,바나나,우유' },
        { id: 'd02', name: '주문서 02', v: '빵,치즈,주스' },
        { id: 'd03', name: '주문서 03', v: '사과,바나나,우유,사과,빵' }
      ],

      /* 개발·강사용 검증 표. 학생에게는 보여주지 않는다.
       * 세 자료에서 세 대표 방법의 기대 출력:
       *   쉼표+각각 남기기+개수  → 3, 3, 5
       *   쉼표+하나만 남기기+개수 → 3, 3, 4
       *   항상 숫자 3            → 3, 3, 3
       */
      verify: [
        { input: '사과,바나나,우유',         total: 3, unique: 3 },
        { input: '빵,치즈,주스',             total: 3, unique: 3 },
        { input: '사과,바나나,우유,사과,빵',  total: 5, unique: 4 }
      ]
    },

    /* ── sm2: 출석부 ────────────────────────────────── */
    {
      id: 'sm2',
      no: '02',
      type: 'sentence',
      pipelineId: 'split-unique-count',
      stage: '출석 확인',
      title: '오늘 수업에 몇 명이 왔나요',
      brief: '오늘 수업에 온 학생이 몇 명인지 알려 주세요.',

      define: {
        q: '출석부에서 무엇이 나오면 성공일까요?',
        options: [
          { v: '이름이 적힌 전체 횟수', key: 'total' },
          { v: '서로 다른 학생 수', key: 'unique' }
        ]
      },


      inputs: [
        { id: 'd01', name: '월요일 출석부', v: '민수,지우,현우' },
        { id: 'd02', name: '화요일 출석부', v: '서연,도윤,하은,민준' },
        { id: 'd03', name: '수요일 출석부', v: '민수,지우,민수,현우,지우' }
      ],

      verify: [
        { input: '민수,지우,현우',             total: 3, unique: 3 },
        { input: '서연,도윤,하은,민준',         total: 4, unique: 4 },
        { input: '민수,지우,민수,현우,지우',     total: 5, unique: 3 }
      ]
    },

    /* ── sm3: 급식 메뉴 ─────────────────────────────── */
    {
      id: 'sm3',
      no: '03',
      type: 'sentence',
      pipelineId: 'split-unique-count',
      stage: '메뉴 정리',
      title: '이번 주 급식 메뉴를 정리해주세요',
      brief: '이번 주 급식 메뉴가 몇 가지인지 정리해 주세요.',

      define: {
        q: '메뉴판에서 무엇이 나오면 성공일까요?',
        options: [
          { v: '적힌 메뉴의 전체 개수', key: 'total' },
          { v: '서로 다른 메뉴의 가짓수', key: 'unique' }
        ]
      },


      inputs: [
        { id: 'd01', name: '월요일 메뉴', v: '밥,국,김치' },
        { id: 'd02', name: '화요일 메뉴', v: '비빔밥,미역국,깍두기,요구르트' },
        { id: 'd03', name: '일주일 메뉴 합산', v: '밥,국,김치,비빔밥,국,밥,깍두기' }
      ],

      verify: [
        { input: '밥,국,김치',                         total: 3, unique: 3 },
        { input: '비빔밥,미역국,깍두기,요구르트',          total: 4, unique: 4 },
        { input: '밥,국,김치,비빔밥,국,밥,깍두기',         total: 7, unique: 5 }
      ]
    },

    /* ── sm-filter-1: 알레르기 검수 (파이프라인: split-filter-count) ── */
    {
      id: 'sm-filter-1',
      no: '04',
      type: 'sentence',
      pipelineId: 'split-filter-count',
      filterDesc: '주의 재료 목록',
      pipelineParams: { filterTarget: ['우유', '달걀', '땅콩'] },
      stage: '걸러내기',
      title: '급식에서 주의 재료를 찾아주세요',
      brief: '급식 재료에 주의 재료가 몇 개 있는지 알려 주세요.',

      define: {
        q: '재료 목록에서 무엇이 나오면 성공일까요?',
        options: [
          { v: '화면에 1이 뜨면 성공', trap: 'hardcode' },
          { v: '어떤 목록이든 주의 재료 수가 나오면 성공', key: 'filtered_count', trap: null },
          { v: '오류 없이 끝나면 성공', trap: 'luck' }
        ]
      },


      inputs: [
        { id: 'd01', name: '월요일 재료', v: '밥,우유,김치,떡' },
        { id: 'd02', name: '화요일 재료', v: '빵,달걀,과자,국,우유' },
        { id: 'd03', name: '수요일 재료', v: '사과,바나나,물,감자' }
      ],

      verify: [
        { input: '밥,우유,김치,떡', filtered_count: 1 },
        { input: '빵,달걀,과자,국,우유', filtered_count: 2 },
        { input: '사과,바나나,물,감자', filtered_count: 0 }
      ]
    }
  ];

  CC.MISSIONS = MISSIONS;
  CC.SENTENCE_MISSIONS = SENTENCE_MISSIONS;
  CC.sentenceMission = function (id) {
    return SENTENCE_MISSIONS.filter(function (m) { return m.id === id; })[0] || null;
  };
  CC.mission = function (id) {
    return MISSIONS.filter(function (m) { return m.id === id; })[0] || MISSIONS[0];
  };
})(window.CC = window.CC || {});
