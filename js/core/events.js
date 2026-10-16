/* Cut & Check — 이벤트 계약
 *
 * 이 파일이 학생 화면과 서버 사이의 유일한 계약이다.
 * 화면은 여기 적힌 type 만 만들고, 서버는 여기 적힌 type 만 받는다.
 *
 * 왜 상수로 묶어두는가 —
 *   문자열을 화면마다 직접 쓰면 오타가 조용히 통과한다.
 *   'review-comment' 를 'review_comment' 로 쓴 화면은 아무 에러도 안 내고
 *   교사 화면에서만 사라진다. 그런 버그는 수업 중에 발견된다.
 *
 * 이벤트는 append-only 다. 고치지 않고 덧붙인다.
 * 학생이 기준을 고쳤다는 사실 자체가 이 제품에서 제일 값진 기록이라,
 * 마지막 상태만 남기면 우리가 보고 싶은 걸 우리가 지워버리는 꼴이 된다.
 *
 * 버전을 올려야 할 때 —
 *   기존 type 의 의미가 바뀌거나 필드가 사라질 때만 SCHEMA 를 올린다.
 *   type 을 새로 더하는 건 버전을 올리지 않는다 (구버전 서버는 모르는 건 무시한다).
 */
(function (CC) {
  'use strict';

  var T = {
    /* 학생 화면 · 미션 본류 */
    DEFINE: 'define',            /* 성공 조건을 골랐다 { text, trap } */
    REDEFINE: 'redefine',        /* 성공 조건을 다시 정했다 { from, to, trap } */
    CUT: 'cut',                  /* 자를 기준과 이유 { sepName, why, weak } */
    REVISE: 'revise',            /* 자를 기준을 고쳤다 { from, to } */
    BLOCKS: 'blocks',            /* 현재 블록 순서 { blocks } */
    RUN: 'run',                  /* 3장 실행 { allpass, mission } */
    JUDGE: 'judge',              /* 자기 판정 { found } */
    CAUSE: 'cause',              /* 깨진 원인을 어디로 봤는가 { cause } */
    HANDLE: 'handle',            /* 그래서 어떻게 할 것인가 { choice } */
    HELP: 'help',                /* 증상 진술 { exp, act, blk } */
    BREAK: 'break',              /* 졸업 과제 · 자기 걸 깨뜨려보기 { broke } */
    WRAP: 'wrap',                /* 마무리 문장 { text } */

    /* 미션 04 추상화 */
    ABSTRACT_SLOTS: 'abstract-slots',
    ABSTRACT_RUN: 'abstract-run',
    ABSTRACT_NAME: 'abstract-name',
    ABSTRACT_SAME: 'abstract-same',

    /* 미션 05 동료 검토 */
    REVIEW_GUESS: 'review-guess',
    REVIEW_COMMENT: 'review-comment',
    REVIEW_RUN: 'review-run',

    /* 졸업 시험 · 내 미션 만들기 */
    MAKE_CHECK: 'make-check',
    MAKE_SUBMIT: 'make-submit',

    /* 문장형 미션 */
    S_DEFINE: 's-define',          /* 성공 조건 선택 { choice, reason } */
    S_REDEFINE: 's-redefine',      /* 성공 조건 재선택 { from, to, reason } */
    S_METHOD: 's-method',          /* 방법 확정 { cards, reason, pipelineId } — 예전 기록은 slots */
    S_REMETHOD: 's-remethod',      /* 방법 수정 { toCards, reason } — 예전 기록은 toSlots */
    S_PREDICT: 's-predict',        /* 실행 전 예상 { dataId, predicted } */
    S_RUN: 's-run',                /* 자료 실행 { dataId, slots, result } */
    S_JUDGE: 's-judge',            /* 학생 판정 { runId, verdict, basis } */
    S_HELP: 's-help',              /* 도움 요청 { expected, stuck, runId } */
    S_WRAP: 's-wrap',              /* 마무리 문장 { text } */
    S_DESIGN: 's-design',          /* 설계 제출 { define, cards, pipelineId } — 예전 기록은 slots */
    S_CODE: 's-code',              /* 코드 실행 { code, dataId, output, error } */
    S_CODE_JUDGE: 's-code-judge',  /* 코드 결과 판정 { verdict, basis } */
    S_TUTOR: 's-tutor'             /* 튜터 질문 { question, answer, kind, refused } */
  };

  /* 여기 없는 값은 저장하지 않기로 한 것이다.
   * 목록으로 적어두는 이유는, 다시 제안될 것이기 때문이다. */
  var NEVER = ['correct', 'score', 'rank', 'duration', 'accuracy', 'level', 'streak'];

  CC.events = {
    T: T,
    SCHEMA: 1,
    NEVER: NEVER,

    /* 화면이 이걸 통해서만 이벤트를 만든다. 모르는 type 은 여기서 걸린다. */
    make: function (type, payload) {
      var known = false;
      for (var k in T) { if (T[k] === type) { known = true; break; } }
      if (!known) throw new Error('모르는 이벤트 type: ' + type);

      var ev = { type: type, v: 1, t: Date.now() };
      if (payload) {
        for (var p in payload) {
          if (!Object.prototype.hasOwnProperty.call(payload, p)) continue;
          if (NEVER.indexOf(p) >= 0) {
            throw new Error('저장하지 않기로 한 필드: ' + p + ' (docs/philosophy.md)');
          }
          ev[p] = payload[p];
        }
      }
      return ev;
    }
  };
})(window.CC = window.CC || {});
