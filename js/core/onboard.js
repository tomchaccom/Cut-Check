/* Cut & Check — 레벨 테스트 10문항 (순수 함수)
 *
 * 문법 6문항(d1~d6) + 의도 4문항(d7~d10). 객관식은 고르고, 단답형은 짧게 쓴다.
 * 맞았는지는 학생 화면에 절대 내보내지 않는다 — 결과가 보이는 순간 학생은 다음 미션에서도 "맞히러" 간다.
 * 해석(stage)은 교사 화면만 쓴다. 상 = ready, 중 = combine, 하 = base (생성 서버가 이 키를 받는다).
 *
 *   하: 문법 대부분 미숙지 — 문법 6개 중 2개 이하
 *   상: 문법 거의 다 + 의도를 설계해 정확히 코드로 — 문법 5개 이상 그리고 의도 3개 이상
 *   중: 그 사이 — 문법은 대체로 알지만 의도를 코드에 옮기기보다 직감으로 짠다
 *
 * 정답표 KEY 는 이 파일 밖으로 나가지 않는다. QUESTIONS 에도 섞지 않는다.
 */
(function (CC) {
  'use strict';

  var ASK = '이 코드를 실행하면 무엇이 나올까요?';
  var DUNNO = '모르겠어요';

  /* options 가 있으면 객관식, 없으면 단답형 */
  var QUESTIONS = [
    { id: 'd1', code: 'print("3" + "4")', ask: ASK, options: ['34', '7', '에러가 나요', DUNNO] },
    { id: 'd2', code: 'x = ["가", "나", "다"]\nprint(x[1])', ask: ASK },
    { id: 'd3', code: 'for i in range(3):\n    print("안녕")', ask: '"안녕"은 몇 번 나올까요?' },
    { id: 'd4', code: 'n = 7\nif n > 5:\n    print("크다")\nelse:\n    print("작다")', ask: ASK, options: ['작다', '크다', '크다와 작다 둘 다', DUNNO] },
    { id: 'd5', code: 'data = "a,b,c"\nparts = data.split(",")\nprint(len(parts))', ask: ASK },
    { id: 'd6', code: 'data = ["떡볶이", "우동", "떡볶이"]\nd = {}\nfor x in data:\n    d[x] = d.get(x, 0) + 1\nprint(d["떡볶이"])',
      ask: ASK, options: ['1', '2', '3', DUNNO] },
    { id: 'd7', code: '# 코드 A\ndata = "2,3,5"\nprint(2+3+5)\n\n# 코드 B\ndata = "2,3,5"\nprint(sum(map(int, data.split(","))))',
      ask: 'data를 "1,1"로 바꾸면 코드 A와 코드 B는 각각 무엇이 나올까요?',
      options: ['A는 10, B는 10', 'A는 2, B는 2', 'A는 10, B는 2', DUNNO] },
    { id: 'd8', code: 'orders = "떡볶이,우동,떡볶이,김밥"',
      ask: '주문에 메뉴가 몇 종류인지 알고 싶어요. 어떤 순서로 하면 될까요?',
      options: ['나누기 → 겹친 것은 하나만 → 개수 세기', '나누기 → 개수 세기 → 겹친 것은 하나만', '겹친 것은 하나만 → 개수 세기', DUNNO] },
    { id: 'd9', code: '# 하고 싶은 것: 60점 이상이면 "통과"\nscore = 60\nif score > 60:\n    print("통과")\nelse:\n    print("다시")',
      ask: '하고 싶은 것과 맞게 하려면 > 자리에 무엇을 써야 할까요?' },
    { id: 'd10', code: '# 하고 싶은 것: 명단의 마지막 이름 보여 주기 (명단 길이는 매번 달라요)\nnames = ["민서", "가은", "하람"]\nprint(names[2])',
      ask: '명단 길이가 바뀌어도 늘 마지막 이름이 나오려면 [ ] 안에 무엇을 써야 할까요?' }
  ];

  /* 객관식은 보기 번호, 단답형은 받아 주는 답 목록(공백·따옴표·대소문자는 보지 않는다) */
  var KEY = { d1: 0, d2: ['나'], d3: ['3', '3번', '세번'], d4: 1, d5: ['3'], d6: 1, d7: 2, d8: 0, d9: ['>='], d10: ['-1', 'len(names)-1'] };
  var SYNTAX = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
  var INTENT = ['d7', 'd8', 'd9', 'd10'];

  function norm(v) { return String(v).replace(/\s+/g, '').replace(/["'“”‘’]/g, '').toLowerCase(); }
  function right(id, pick) {
    var k = KEY[id];
    if (pick == null) return false;
    return typeof k === 'number' ? pick === k : k.indexOf(norm(pick)) >= 0;
  }

  /* 2026-10-19 이전 8문항(q1~q8) 기록 — 그때 규칙으로 푼다 */
  var OLD_KEY = { q1: 0, q2: 2, q3: 1, q4: 1, q5: 1, q6: 1, q7: 1, q8: 2 };
  function oldStage(picks) {
    var missed = function (ids) { return ids.some(function (id) { return picks[id] !== OLD_KEY[id]; }); };
    return {
      stage: missed(['q1', 'q2', 'q3']) ? 'base' : missed(['q4', 'q5', 'q6', 'q7']) ? 'combine' : 'ready',
      hardcode: missed(['q8'])
    };
  }

  /* answers: [{q, pick}] → {stage, hardcode}. 답하지 않은 문항은 틀린 것으로 본다 */
  function stage(answers) {
    var picks = {};
    (answers || []).forEach(function (a) { picks[a.q] = a.pick; });
    if ('q1' in picks) return oldStage(picks);
    var count = function (ids) { return ids.filter(function (id) { return right(id, picks[id]); }).length; };
    var syn = count(SYNTAX), intent = count(INTENT);
    return {
      stage: syn <= 2 ? 'base' : syn >= 5 && intent >= 3 ? 'ready' : 'combine',
      hardcode: !right('d7', picks.d7)
    };
  }

  var LABEL = { ready: '상', combine: '중', base: '하' };

  /* 반의 분포. 이름·순서 없이 숫자만 — 진단을 안 했거나 건너뛴 학생은 none */
  function spread(students) {
    var n = { base: 0, combine: 0, ready: 0, hardcode: 0, none: 0 };
    (students || []).forEach(function (s) {
      var o = s && s.onboard;
      if (!o || o.skipped || !o.stage) { n.none++; return; }
      n[o.stage]++;
      if (o.hardcode) n.hardcode++;
    });
    return n;
  }

  /* 선생님이 정한 시각(due) 뒤에 낸 진단 기록이 없으면 아직 볼 차례다. 둘 다 서버 시각(ISO) */
  function pending(due, doneAts) {
    if (!due) return false;
    var d = Date.parse(due);
    return !(doneAts || []).some(function (t) { return t && Date.parse(t) >= d; });
  }

  CC.onboard = { QUESTIONS: QUESTIONS, stage: stage, spread: spread, LABEL: LABEL, pending: pending };
})(window.CC = window.CC || {});
