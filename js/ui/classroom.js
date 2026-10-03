/* Cut & Check — 교실 목업 데이터
 *
 * 실제 서비스에서는 학생 화면이 남기는 로그로 채워진다.
 * 여기서 중요한 건 "무엇을 기록하기로 했는가"다. 기록하지 않기로 한 것도 설계다.
 *
 * 기록하는 것
 *   defineChoice  1단계에서 고른 성공 조건 (하드코딩·요행 함정 여부 포함)
 *   whyChoice     2단계에서 고른 이유 ("그냥 골랐어요" 포함)
 *   symptom       도움 요청 시 쓴 증상 진술
 *   idleSec       마지막 조작 이후 흐른 시간
 *   selfFound     스스로 깨진 곳을 찾아낸 순간
 *
 * 기록하지 않는 것
 *   정답 여부, 정답률, 소요 시간 순위, 블록 개수 점수.
 *   교사가 그 숫자를 보면 그 숫자로 학생을 줄 세우게 되고,
 *   우리가 만든 나머지 장치가 전부 무의미해진다.
 */
(function (CC) {
  'use strict';

  /* 결정적 난수 — 새로고침해도 같은 교실이 나와야 리뷰가 가능하다 */
  function rng(seed) {
    var s = seed;
    return function () {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  }

  var NAMES = ['지우', '현우', '서연', '도윤', '하은', '민준', '수아', '예준', '지민', '유진',
    '시우', '채원', '건우', '나윤', '준서', '소율', '윤아', '태민', '가은', '지호',
    '다인', '승우', '하율', '은채', '규현', '보민'];

  /* 1단계 보기별 위험 유형 */
  var DEFINES = [
    { text: '화면에 사과, 바나나, 우유 라고 뜨면 성공이다', trap: 'hardcode' },
    { text: '상품이 몇 개가 들어오든 하나씩 따로 셀 수 있으면 성공이다', trap: null },
    { text: '빨간 오류 글씨 없이 실행되면 성공이다', trap: 'luck' }
  ];
  var WHYS = [
    { text: '상품과 상품 사이에 항상 이게 있어서', weak: false },
    { text: '이번 주문서에 이게 보여서', weak: true },
    { text: '잘 모르겠고 그냥 골랐어요', weak: true }
  ];

  var SYMPTOMS = [
    { exp: '여러 조각으로 나뉜 목록', act: '안 잘린 한 덩어리', blk: '2 · 기준으로 자르기' },
    { exp: '걸러진 것만 있는 목록', act: '전부 다 나온 목록', blk: '4 · 조건 확인' },
    { exp: '여러 조각으로 나뉜 목록', act: '빈 목록', blk: '' },
    { exp: '개수', act: '덜 잘린 목록', blk: '3 · 목록으로 담기' },
    { exp: '모르겠어요', act: '빨간 오류 글씨', blk: '' }
  ];

  /* 단계: 0 정의 · 1 기준 · 2 조립 · 3 검증 · 4 자기판정 */
  var STAGES = ['성공 정의', '기준 선언', '순서 조립', '3장 검증', '자기 판정'];

  function build() {
    var r = rng(20260922);
    return NAMES.map(function (name, i) {
      var stage = 4;
      var p = r();
      if (p < 0.12) stage = 0;
      else if (p < 0.30) stage = 1;
      else if (p < 0.55) stage = 2;
      else if (p < 0.82) stage = 3;

      var dq = r();
      var define = dq < 0.22 ? DEFINES[0] : dq < 0.85 ? DEFINES[1] : DEFINES[2];
      var wq = r();
      var why = wq < 0.55 ? WHYS[0] : wq < 0.8 ? WHYS[1] : WHYS[2];

      var asked = stage >= 2 && r() < 0.35;
      var symptom = asked ? SYMPTOMS[Math.floor(r() * SYMPTOMS.length)] : null;
      /* 증상 진술을 끝까지 못 채운 경우 — 이 비율이 우리 핵심 지표다 */
      if (symptom && r() < 0.3) symptom = { exp: symptom.exp, act: '', blk: '' };

      var idleSec = Math.floor(r() * 600);
      var selfFound = stage >= 3 && r() < 0.28;
      /* 결과를 보고 기준을 고친 학생 — 이 제품에서 가장 강한 학습 신호 */
      var revised = stage >= 3 && r() < 0.22;

      return {
        id: 'st' + i,
        name: name,
        stage: stage,
        define: define,
        why: why,
        symptom: symptom,
        asked: asked,
        idleSec: idleSec,
        selfFound: selfFound,
        revised: revised ? 1 : 0,
        redefined: 0,
        lastRevision: revised ? { from: '쉼표', to: '띄어쓰기' } : null,
        blocks: stage >= 2
          ? (r() < 0.5 ? ['input', 'cut', 'save'] : ['input', 'cut', 'loop', 'check'])
          : []
      };
    });
  }

  CC.classroom = {
    STAGES: STAGES,
    students: build(),

    /* 지금 답해줄 수 있는 학생 — 증상 진술이 완성된 호출 */
    ready: function () {
      return this.students.filter(function (s) {
        return s.symptom && s.symptom.act;
      });
    },
    /* 불렀는데 아직 말이 안 만들어진 학생 — 교사가 한 번 더 물어야 함 */
    halfAsked: function () {
      return this.students.filter(function (s) {
        return s.symptom && !s.symptom.act;
      });
    },
    /* 조용히 막힌 학생 — 손을 안 드는 쪽이 더 위험하다 */
    quiet: function () {
      return this.students.filter(function (s) {
        /* 문장형 활동이 있으면 막혀있지 않은 것 */
        var sentenceActive = s.sDefine || (s.sRuns && s.sRuns.length > 0);
        return !s.asked && s.stage < 4 && !sentenceActive && s.idleSec > 240;
      }).sort(function (a, b) { return b.idleSec - a.idleSec; });
    },
    /* 칭찬 타이밍 — 스스로 깨진 곳을 찾아냈거나, 보고 나서 기준을 고친 순간.
     * 고친 쪽이 더 강한 신호다. 정답을 맞힌 것보다 중요하다. */
    praise: function () {
      return this.students.filter(function (s) {
        return s.selfFound || s.revised || s.redefined ||
          (s.sDefineVer && s.sDefineVer > 1) ||
          (s.sMethodVer && s.sMethodVer > 1) ||
          (s.sJudges && s.sJudges.length > 0);
      }).sort(function (a, b) {
        var sa = ((a.redefined||0)*2 + (a.revised||0)) + ((a.sDefineVer||0) + (a.sMethodVer||0) + ((a.sJudges||[]).length));
        var sb = ((b.redefined||0)*2 + (b.revised||0)) + ((b.sDefineVer||0) + (b.sMethodVer||0) + ((b.sJudges||[]).length));
        return sb - sa;
      });
    },
    /* 위험군 — 성공을 이번 결과로 정의했거나, 오류만 없으면 된다고 정의한 학생 */
    risky: function () {
      return this.students.filter(function (s) { return s.define.trap; });
    },
    /* 기준을 찍은 학생 */
    guessed: function () {
      return this.students.filter(function (s) { return s.why.weak; });
    },
    funnel: function () {
      var out = STAGES.map(function (t) { return { title: t, n: 0 }; });
      this.students.forEach(function (s) {
        for (var i = 0; i <= s.stage; i++) out[i].n++;
      });
      return out;
    }
  };
})(window.CC = window.CC || {});
