/* Cut & Check — 교실 입장 진단 8문항 (순수 함수)
 *
 * 학생은 코드를 읽고 결과를 고르기만 한다. 맞았는지는 화면에 절대 내보내지 않는다 —
 * 진단 결과가 보이는 순간 학생은 다음 미션에서도 "맞히러" 간다.
 * 해석(stage)은 교사 화면이 반의 분포를 볼 때만 쓴다.
 *
 * 정답표 KEY 는 이 파일 밖으로 나가지 않는다. QUESTIONS 에도 섞지 않는다.
 */
(function (CC) {
  'use strict';

  var ASK = '이 코드를 실행하면 무엇이 나올까요?';
  var DUNNO = '모르겠어요';

  var QUESTIONS = [
    { id: 'q1', code: 'print("3" + "4")', ask: ASK, options: ['34', '7', '에러가 나요', DUNNO] },
    { id: 'q2', code: 'print("a,b,c".split(","))', ask: ASK, options: ['abc', "['a,b,c']", "['a', 'b', 'c']", DUNNO] },
    { id: 'q3', code: 'x = ["가", "나", "다"]\nprint(x[1])', ask: ASK, options: ['가', '나', '다', DUNNO] },
    { id: 'q4', code: 'for i in range(3):\n    print("안녕")', ask: '"안녕"은 몇 번 나올까요?', options: ['2번', '3번', '4번', DUNNO] },
    { id: 'q5', code: 'n = 7\nif n > 5:\n    print("크다")\nelse:\n    print("작다")', ask: ASK, options: ['작다', '크다', '크다와 작다 둘 다', DUNNO] },
    { id: 'q6', code: 'd = {"명성": "010-1234"}\nprint(d["명성"])', ask: ASK, options: ['명성', '010-1234', '에러가 나요', DUNNO] },
    { id: 'q7', code: 'data = ["떡볶이", "우동", "떡볶이"]\nd = {}\nfor x in data:\n    d[x] = d.get(x, 0) + 1\nprint(d["떡볶이"])',
      ask: ASK, options: ['1', '2', '3', DUNNO] },
    { id: 'q8', code: '# 코드 A\ndata = "2,3,5"\nprint(2+3+5)\n\n# 코드 B\ndata = "2,3,5"\nprint(sum(map(int, data.split(","))))',
      ask: 'data를 "1,1"로 바꾸면 코드 A와 코드 B는 각각 무엇이 나올까요?',
      options: ['A는 10, B는 10', 'A는 2, B는 2', 'A는 10, B는 2', DUNNO] }
  ];

  var KEY = { q1: 0, q2: 2, q3: 1, q4: 1, q5: 1, q6: 1, q7: 1, q8: 2 };

  /* answers: [{q, pick}] → {stage, hardcode}. 답하지 않은 문항은 틀린 것으로 본다 */
  function stage(answers) {
    var picks = {};
    (answers || []).forEach(function (a) { picks[a.q] = a.pick; });
    var missed = function (ids) { return ids.some(function (id) { return picks[id] !== KEY[id]; }); };
    return {
      stage: missed(['q1', 'q2', 'q3']) ? 'base' : missed(['q4', 'q5', 'q6', 'q7']) ? 'combine' : 'ready',
      hardcode: missed(['q8'])
    };
  }

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

  CC.onboard = { QUESTIONS: QUESTIONS, stage: stage, spread: spread };
})(window.CC = window.CC || {});
