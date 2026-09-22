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

      /* 통과 조건은 "방법"이 아니라 "결과"로만 적는다. */
      goal: function (res, input) {
        if (res.err || res.type !== 'list') return false;
        return res.value.length >= 2;
      },
      goalLabel: '주문서마다 상품이 2개 이상으로 나뉘었는가',
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

      goal: function (res, input) {
        if (res.err || res.type !== 'list') return false;
        var targets = ['우유', '땅콩', '새우'];
        var expected = input.v.split(',').map(function (s) { return s.trim(); })
          .filter(function (s) { return targets.indexOf(s) !== -1; });
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
        var expected = input.v.split('→').map(function (s) { return s.trim(); })
          .filter(function (s) { return targets.indexOf(s) !== -1; });
        var got = res.value.map(function (s) { return String(s).trim(); });
        return got.length === expected.length &&
          expected.every(function (s) { return got.indexOf(s) !== -1; });
      },
      goalLabel: '계획서마다 위험한 단계만 정확히 뽑아냈는가',
      counterHint: '세 번째 계획서에는 위험한 단계가 없어요. 그때 뭐라고 나왔나요?'
    }
  ];

  CC.MISSIONS = MISSIONS;
  CC.mission = function (id) {
    return MISSIONS.filter(function (m) { return m.id === id; })[0] || MISSIONS[0];
  };
})(window.CC = window.CC || {});
