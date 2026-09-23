/* Cut & Check — LLM 출력 검사기
 *
 * 왜 검사기가 필요한가.
 *   "AI는 답을 주지 않는다" 를 문서에만 적어두면 반드시 무너진다.
 *   프롬프트를 아무리 잘 써도 모델은 가끔 친절해지고, 친절해지는 순간
 *   우리가 만든 나머지 장치가 전부 무의미해진다.
 *   그래서 규칙을 실행 가능한 코드로 박아두고, 위반하면 폴백 문장으로 대체한다.
 *
 * 두 가지 출력 모드만 허용한다.
 *   ask   학생에게 되묻는 질문.        물음표로 끝나야 한다.
 *   fact  어디서 멈췄는지 알리는 사실.  해법을 말하면 안 된다.
 *
 * 그 외의 모든 출력(칭찬, 해법, 코드, 정답)은 거부한다.
 */
(function (CC) {
  'use strict';

  /* 칭찬 — 인정은 사람의 일이다. 기계가 대신하면 그 자산을 태운다. */
  var PRAISE = /(잘했|훌륭|대단|멋지|최고|완벽|굿|좋아요|훌륭해|참 잘)/;

  /* 해법 지시 — 답을 주면 학생은 고치기만 하고 왜 그런지 모른 채 넘어간다.
   * 명령형만 막으면 새어나간다. "넣고 다시 돌려보면 어때?" 처럼
   * 질문으로 위장한 해법이 실제로는 제일 흔하다. */
  var PRESCRIBE = /(넣으세요|넣어라|넣어야|넣고|넣어서|추가하|바꾸세요|바꿔야|바꿔라|바꿔서|바꿔보|빼세요|빼고|지우세요|옮기세요|고쳐서|고치면|앞에 놓|뒤에 놓|하면 됩니다|하시면 됩니다|하면 돼|정답은|답은|이렇게 하|이렇게 고치)/;

  /* 진단 — 원인을 대신 짚어주는 것도 답이다.
   * "자르기 블록이 없어서 안 나뉜 거야" 는 학생이 스스로 찾아야 할 결론이다. */
  var DIAGNOSE = /(없어서|빠져서|빠졌|때문에 안|때문이야|때문입니다|순서가 (틀려|바뀌|잘못)|거꾸로 (되어|돼|있))/;

  /* 코드 조각 — 베껴 쓸 코드를 주는 순간 그건 정답 공개다. */
  var CODE = /(```|split\s*\(|\bfor\b\s+\w+\s+in|\bif\b\s+\w+\s+in|\.strip\s*\(|append\s*\(|print\s*\()/;

  /* 중1이 읽는 길이. 넘어가면 안 읽고, 안 읽으면 없는 것과 같다. */
  var MAX = 80;

  var FALLBACK = {
    ask: '지금 네가 만든 순서를 처음부터 한 번 읽어볼래?',
    fact: '여기서 멈췄어요.'
  };

  /* check(text, mode) → { ok, reasons[] } */
  function check(text, mode) {
    var t = String(text || '').trim();
    var reasons = [];

    if (!t) reasons.push('빈 출력');
    if (t.length > MAX) reasons.push('너무 김 (' + t.length + '자 > ' + MAX + '자)');
    if (PRAISE.test(t)) reasons.push('칭찬 — 인정은 사람의 일이다');
    if (PRESCRIBE.test(t)) reasons.push('해법 지시 — 답을 주면 안 된다');
    if (CODE.test(t)) reasons.push('코드 조각 — 베껴 쓸 답을 준다');
    if (DIAGNOSE.test(t)) reasons.push('원인 진단 — 학생이 스스로 찾아야 할 결론이다');

    if (mode === 'ask') {
      if (!/[?？]$/.test(t)) reasons.push('질문이 아님 — ask 모드는 물음표로 끝나야 한다');
    } else if (mode === 'fact') {
      if (/[?？]$/.test(t)) reasons.push('fact 모드인데 질문 — 사실만 말해야 한다');
      if (!/블록|주문서|목록|결과|값|여기/.test(t)) reasons.push('무엇에 대한 사실인지 불명확');
    } else {
      reasons.push('허용되지 않은 모드: ' + mode);
    }

    return { ok: reasons.length === 0, reasons: reasons };
  }

  /* 검사를 통과하면 그대로, 아니면 폴백으로 대체한다.
   * 절대 "그냥 내보내기"를 하지 않는다 — 한 번 새면 신뢰가 무너진다. */
  function guard(text, mode) {
    var r = check(text, mode);
    return {
      ok: r.ok,
      text: r.ok ? String(text).trim() : (FALLBACK[mode] || FALLBACK.ask),
      reasons: r.reasons
    };
  }

  CC.llmguard = { check: check, guard: guard, MAX: MAX, FALLBACK: FALLBACK };
})(window.CC = window.CC || {});
