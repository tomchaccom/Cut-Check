/* Cut & Check — 이벤트 → 학생 한 명 (순수 함수)
 *
 * 이벤트 목록을 교사 화면이 쓰는 학생 객체 하나로 접는다.
 * 저장소도 네트워크도 모른다. 입력이 같으면 출력이 같다.
 *
 * 왜 store.js 에서 떼어냈는가 —
 *   서버의 board 응답도 결국 같은 접기를 한다.
 *   접는 규칙이 클라이언트와 서버 두 군데에 따로 있으면 반드시 갈라지고,
 *   갈라진 그날 교사 화면은 학생이 한 것과 다른 걸 보여준다.
 *   그래서 접기는 한 곳에만 있어야 한다. 서버는 이 파일을 그대로 포팅한다
 *   (docs/server.md 의 "fold 는 옮겨 쓰지 않고 옮겨 심는다").
 *
 * 여기서 파생하는 값은 전부 "무엇을 했는가"이고,
 * "얼마나 잘했는가"는 한 개도 만들지 않는다.
 */
(function (CC) {
  'use strict';

  function empty(id, name) {
    return {
      id: id || 'me',
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
      redefined: 0,
      lastRevision: null,
      cause: null,
      handle: null,
      wrap: null,
      abstractOk: null,
      abstractPicked: null,
      reviewComments: 0,
      reviewGuess: null,
      made: null,
      mission: null,
      idleSec: 0,

      /* 문장형 미션 */
      sDefine: null,         /* { choice, reason } */
      sMethod: null,         /* { cards, reason } — 예전 기록은 slots */
      sRuns: [],             /* [{ dataId, result, t }] */
      sJudges: [],           /* [{ runId, verdict, basis, t }] */
      sHelps: 0,
      sWrap: null,
      sMethodVer: 0,
      sDefineVer: 0,

      /* 코드 작성 */
      sDesignCount: 0,
      sDesign: null,         /* { define, cards, pipelineId } — 예전 기록은 slots */
      sCodes: [],            /* [{ code, dataId, output, error, t }] */
      sCodeJudges: [],       /* [{ verdict, basis, t }] */
      sProbe: null,          /* 마지막 s-probe { sig, outs, uses, t } */
      sTutor: [],            /* [{ question, answer, kind, refused, reasons, step, t }] */

      /* 교실 입장 진단 — 교사 화면만 쓴다. 학생 화면에 띄우지 않는다 */
      onboard: null          /* { stage, hardcode, skipped, t } — 마지막 것이 이긴다 */
    };
  }

  /* 한 이벤트를 학생 객체에 적용한다. 순서에 의존하지 않도록
   * stage 는 항상 max 로만 올린다 — 이벤트가 늦게 도착해도 되돌아가지 않는다. */
  function apply(s, e) {
    switch (e.type) {
      case 'define':
        s.define = { text: e.text, trap: e.trap };
        s.stage = Math.max(s.stage, 1); break;
      case 'cut':
        s.why = { text: e.why, weak: !!e.weak };
        s.sep = e.sepName;
        s.stage = Math.max(s.stage, 2); break;
      case 'blocks':
        s.blocks = e.blocks; break;
      case 'run':
        s.stage = Math.max(s.stage, 3);
        s.allpass = e.allpass;
        if (e.mission) s.mission = e.mission; break;
      case 'judge':
        s.stage = Math.max(s.stage, 4);
        if (e.found) s.selfFound = true; break;
      case 'help':
        s.asked = true;
        s.symptom = { exp: e.exp, act: e.act || '', blk: e.blk || '' }; break;
      case 'make-submit': s.made = e; break;
      case 'abstract-slots': s.abstractPicked = e.picked; break;
      case 'abstract-run': s.abstractOk = e.allOk; break;
      case 'review-guess': s.reviewGuess = e; break;
      case 'review-comment': s.reviewComments++; break;
      case 'wrap': s.wrap = e.text; break;
      case 'cause': s.cause = e.cause; break;
      case 'handle': s.handle = e.choice; break;
      case 'revise':
        s.revised++;
        s.lastRevision = e; break;
      case 'redefine':
        s.redefined++;
        s.define = { text: e.to, trap: e.trap }; break;
      case 'break':
        s.breaks++;
        if (e.broke) s.brokeOwn = true; break;

      /* 문장형 미션 */
      case 's-define':
        s.sDefine = { choice: e.choice, reason: e.reason };
        s.sDefineVer++; break;
      case 's-redefine':
        s.sDefine = { choice: e.to, reason: e.reason };
        s.sDefineVer++; break;
      case 's-method':
        s.sMethod = { slots: e.slots, cards: e.cards, reason: e.reason };
        s.sMethodVer++; break;
      case 's-remethod':
        s.sMethod = { slots: e.toSlots, cards: e.toCards, reason: e.reason };
        s.sMethodVer++; break;
      case 's-run':
        s.sRuns.push({ dataId: e.dataId, result: e.result, t: e.t }); break;
      case 's-judge':
        s.sJudges.push({ runId: e.runId, verdict: e.verdict, basis: e.basis, t: e.t }); break;
      case 's-help':
        s.sHelps++; break;
      case 's-wrap':
        s.sWrap = e.text; break;
      case 's-design':
        s.sDesign = { define: e.define, slots: e.slots, cards: e.cards, pipelineId: e.pipelineId };
        s.sDesignCount++; break;
      case 's-code':
        s.sCodes.push({ code: e.code, dataId: e.dataId, output: e.output, error: e.error, t: e.t }); break;
      case 's-code-judge':
        s.sCodeJudges.push({ verdict: e.verdict, basis: e.basis, t: e.t }); break;
      case 's-probe':
        s.sProbe = { sig: e.sig, outs: e.outs || [], uses: e.uses == null ? null : e.uses, t: e.t }; break;
      case 's-tutor':
        s.sTutor.push({ question: e.question, answer: e.answer, kind: e.kind, refused: !!e.refused, reasons: e.reasons || [], retried: !!e.retried, mid: e.mid || '', step: e.step == null ? null : e.step, t: e.t }); break;
      case 's-onboard':
        /* 해석은 core/onboard.js 한 곳에만 — 이 파일을 쓰는 화면은 onboard.js 도 싣는다 */
        var ob = e.skipped || !CC.onboard ? { stage: null, hardcode: false } : CC.onboard.stage(e.answers);
        s.onboard = { stage: ob.stage, hardcode: ob.hardcode, skipped: !!e.skipped, t: e.t }; break;

      default: /* 모르는 type 은 무시한다 — 구버전 화면이 새 서버를 만나도 안 죽는다 */ break;
    }
    return s;
  }

  /* 이벤트 목록 하나 → 학생 하나 */
  function fold(evs, opt) {
    opt = opt || {};
    if (!evs || !evs.length) return null;
    var s = empty(opt.id, opt.name);
    evs.forEach(function (e) { apply(s, e); });
    var last = evs[evs.length - 1].t || 0;
    s.idleSec = Math.max(0, Math.round(((opt.now || Date.now()) - last) / 1000));
    return s;
  }

  /* 여러 학생의 이벤트를 한 번에 — 서버 board 응답이 이 모양이다.
   * evs 각각에 sid(좌석 id)가 붙어 있다고 가정한다. 이름은 서버가 모른다. */
  function foldMany(evs, opt) {
    opt = opt || {};
    var bySid = {};
    (evs || []).forEach(function (e) {
      var k = e.sid || 'me';
      (bySid[k] = bySid[k] || []).push(e);
    });
    return Object.keys(bySid).map(function (k) {
      return fold(bySid[k], { id: k, name: (opt.names && opt.names[k]) || k, now: opt.now });
    });
  }

  /* 학생 한 명의 미션 하나 → 'none' | 'doing' | 'done'. 마무리(s-wrap)를 저장하면 푼 미션이다.
   * 상태만 말한다 — 점수·정답 여부는 담지 않는다 (CLAUDE.md) */
  function missionStatus(events) {
    if (!events || !events.length) return 'none';
    return events.some(function (e) { return e.type === 's-wrap'; }) ? 'done' : 'doing';
  }

  CC.fold = { fold: fold, foldMany: foldMany, empty: empty, apply: apply, missionStatus: missionStatus };
})(window.CC = window.CC || {});
