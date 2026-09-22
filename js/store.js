/* Cut & Check — 학생 행동 기록
 *
 * 학생 화면이 남기는 것을 교사 화면이 읽는다. 시연에서 "내가 방금 한 게 저기 뜬다"가
 * 보여야 이 제품의 주장이 설득된다.
 *
 * 무엇을 저장하는가
 *   define   1단계에서 고른 성공 조건 + 함정 유형
 *   cut      2단계에서 고른 기준과 이유 + 이유가 약한지
 *   blocks   현재 블록 순서
 *   run      실행 결과 요약 (전부 버텼는지)
 *   judge    자기 판정 결과
 *   help     증상 진술 (기대값 / 실제값 / 의심 블록)
 *   break    졸업 과제 시도 (예측 / 실제로 깨졌는지)
 *
 * 무엇을 저장하지 않는가
 *   정답 여부, 점수, 소요 시간 순위.
 *   저장하지 않기로 한 것도 설계다 — 없는 숫자는 화면에 띄울 수 없다.
 *
 * localStorage 는 브라우저마다, 그리고 file:// 에서 막힐 수 있다.
 * 막히면 조용히 메모리로 떨어지고, 교사 화면이 그 사실을 사용자에게 알린다.
 */
(function (CC) {
  'use strict';

  var KEY = 'cutcheck.log.v1';
  var mem = [];
  var ok = null;   // localStorage 사용 가능 여부 (첫 접근 때 판정)

  function probe() {
    if (ok !== null) return ok;
    try {
      var k = KEY + '.probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      ok = true;
    } catch (e) {
      ok = false;
    }
    return ok;
  }

  function read() {
    if (!probe()) return mem;
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function write(list) {
    mem = list;
    if (!probe()) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(-200)));
    } catch (e) { /* 저장 실패는 학습을 막지 않는다 */ }
  }

  CC.store = {
    available: function () { return probe(); },

    push: function (ev) {
      ev.t = Date.now();
      var list = read();
      list.push(ev);
      write(list);
      return ev;
    },

    all: function () { return read(); },

    clear: function () {
      mem = [];
      if (probe()) {
        try { localStorage.removeItem(KEY); } catch (e) { /* noop */ }
      }
    },

    /* 이벤트 목록을 교사 화면이 쓰는 학생 객체 하나로 접는다.
     * 여기서 파생하는 값은 전부 "무엇을 했는가"이고,
     * "얼마나 잘했는가"는 한 개도 만들지 않는다. */
    fold: function (name) {
      var evs = read();
      if (!evs.length) return null;

      var s = {
        id: 'me',
        name: name || '나',
        live: true,
        stage: 0,
        define: { text: '아직 안 정함', trap: null },
        why: { text: '아직 안 정함', weak: false },
        blocks: [],
        symptom: null,
        asked: false,
        selfFound: false,
        breaks: 0,
        brokeOwn: false,
        revised: 0,
        lastRevision: null,
        cause: null,
        handle: null,
        idleSec: 0
      };

      evs.forEach(function (e) {
        if (e.type === 'define') {
          s.define = { text: e.text, trap: e.trap };
          s.stage = Math.max(s.stage, 1);
        } else if (e.type === 'cut') {
          s.why = { text: e.why, weak: !!e.weak };
          s.sep = e.sepName;
          s.stage = Math.max(s.stage, 2);
        } else if (e.type === 'blocks') {
          s.blocks = e.blocks;
        } else if (e.type === 'run') {
          s.stage = Math.max(s.stage, 3);
          s.allpass = e.allpass;
        } else if (e.type === 'judge') {
          s.stage = Math.max(s.stage, 4);
          if (e.found) s.selfFound = true;
        } else if (e.type === 'help') {
          s.asked = true;
          s.symptom = { exp: e.exp, act: e.act || '', blk: e.blk || '' };
        } else if (e.type === 'cause') {
          s.cause = e.cause;
        } else if (e.type === 'handle') {
          s.handle = e.choice;
        } else if (e.type === 'revise') {
          s.revised++;
          s.lastRevision = e;
        } else if (e.type === 'break') {
          s.breaks++;
          if (e.broke) s.brokeOwn = true;
        }
      });

      s.idleSec = Math.max(0, Math.round((Date.now() - evs[evs.length - 1].t) / 1000));
      return s;
    }
  };
})(window.CC = window.CC || {});
