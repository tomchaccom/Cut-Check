/* Cut & Check — 레벨 테스트 문제지 셋 · 각 10문항 (순수 함수)
 *
 * 문제지는 하(low) · 중(mid) · 상(high). 선생님이 지정할 때 고르고, 지정 없이 처음 들어온 학생은 중.
 * 학생 화면은 문제만 낸다 — 어느 문제지인지(하/중/상)는 학생 화면 어디에도 쓰지 않는다 (2026-10-20 사람이 정함).
 *
 * 중(mid): 문법 6문항(앞 여섯) + 의도 4문항(뒤 넷). 객관식은 고르고, 단답형은 짧게 쓴다.
 *
 * 채점은 룰베이스다 — 학생이 쓴 글자가 정답표 밖으로 새면 안 된다 (2026-10-21 사람이 정함).
 * 단답형은 화면에 찍히는 값이 숫자 하나 · 낱말 하나뿐인 문항만 남긴다("8", "나", "우산").
 * "몇 번" 처럼 "4", "4번", "네 번" 으로 갈리는 것, ">=" 같은 기호, 식("len(names)-1")은 객관식으로 바꿨다.
 * 맞았는지는 학생 화면에 절대 내보내지 않는다 — 결과가 보이는 순간 학생은 다음 미션에서도 "맞히러" 간다.
 * 해석(stage)은 교사 화면만 쓴다. 상 = ready, 중 = combine, 하 = base (생성 서버가 이 키를 받는다).
 *
 *   하: 문법 대부분 미숙지 — 문법 6개 중 2개 이하
 *   상: 문법 거의 다 + 의도를 설계해 정확히 코드로 — 문법 5개 이상 그리고 의도 3개 이상
 *   중: 그 사이 — 문법은 대체로 알지만 의도를 코드에 옮기기보다 직감으로 짠다
 *
 * 하(low): 기초 10문항(l1~l10 — print · 변수 · 글자와 숫자 · 리스트 번호 · 간단한 if/for).
 *   쉬운 문제지라 상을 줄 근거가 없다: 8개 이상 맞으면 중, 아니면 하.
 * 상(high): 어려운 10문항(사전 세기 · 겹친 조건 · 함수와 return · 빈 리스트 · 반례 찾기 · 하나 차이 · <= · 보이지 않는 공백).
 *   어려운 문제지라 몇 개 틀려도 하로 내리지 않는다: 7개 이상 상, 2개 이하 하, 그 사이 중.
 *   h8 은 중 문제지 일곱째 문항(d13, 예전 d7)처럼 하드코딩을 알아보는지 본다. 하 문제지에는 그런 문항이 없어 hardcode 는 늘 false.
 *
 * 정답표 KEY 는 이 파일 밖으로 나가지 않는다. QUESTIONS 에도 섞지 않는다.
 *
 * 문항을 바꾸면 id 를 새로 쓴다 — 같은 id 에 다른 문제를 걸면 예전 기록이 새 정답표로 채점된다.
 * 예전 문제지(V1, 2026-10-21 이전)의 id 와 정답은 KEY 에 남겨 두고, 기록에 빠진 id 가 있으면 V1 순서로 푼다.
 */
(function (CC) {
  'use strict';

  var ASK = '이 코드를 실행하면 무엇이 나올까요?';
  var DUNNO = '모르겠어요';

  /* options 가 있으면 객관식, 없으면 단답형 */
  var LOW = [
    { id: 'l1', code: 'print("안녕")', ask: ASK, options: ['안녕', '"안녕"', '에러가 나요', DUNNO] },
    { id: 'l2', code: 'a = 5\nb = 3\nprint(a + b)', ask: ASK },
    { id: 'l3', code: 'print(2 + 3)\nprint("2" + "3")', ask: '두 줄에 각각 무엇이 나올까요?', options: ['5 그리고 5', '5 그리고 23', '23 그리고 23', DUNNO] },
    { id: 'l4', code: 'x = 10\nx = x + 1\nprint(x)', ask: ASK },
    { id: 'l5', code: 'fruits = ["사과", "배", "귤"]\nprint(fruits[0])', ask: ASK, options: ['사과', '배', '귤', DUNNO] },
    { id: 'l6', code: 'nums = [4, 7, 9]\nprint(len(nums))', ask: ASK },
    { id: 'l7', code: 'age = 14\nif age >= 14:\n    print("중학생")\nelse:\n    print("초등학생")', ask: ASK, options: ['중학생', '초등학생', '둘 다', DUNNO] },
    { id: 'l11', code: 'for i in range(4):\n    print("*")', ask: '"*"은 몇 번 나올까요?', options: ['3번', '4번', '5번', DUNNO] },
    { id: 'l9', code: 'name = "민지"\nprint(name + "야")', ask: ASK },
    { id: 'l10', code: 'total = 0\nfor n in [1, 2, 3]:\n    total = total + n\nprint(total)', ask: ASK, options: ['3', '6', '123', DUNNO] }
  ];

  var HIGH = [
    { id: 'h1', code: 'votes = ["짜장", "짬뽕", "짜장", "짜장"]\nd = {}\nfor v in votes:\n    d[v] = d.get(v, 0) + 1\nprint(d)',
      ask: ASK, options: ["{'짜장': 3, '짬뽕': 1}", "{'짜장': 1, '짬뽕': 1}", "['짜장', '짬뽕']", DUNNO] },
    { id: 'h2', code: 't = 30\nrain = True\nif t > 25:\n    if rain:\n        print("우산")\n    else:\n        print("모자")\nelse:\n    print("겉옷")', ask: ASK },
    { id: 'h3', code: 'def double(n):\n    return n * 2\n\nprint(double(3) + 1)', ask: ASK },
    { id: 'h11', code: '# 하고 싶은 것: 친구가 몇 명인지 세기\nnames = "가은,도윤,서아"\nprint(len(names.split(",")))',
      ask: 'names가 어떤 글이면 실제 친구 수와 다르게 나올까요?', options: ['"민서,하람"', '"민서 하람"', '"민서,하람,지우"', DUNNO] },
    { id: 'h5', code: 'scores = []\nprint(sum(scores) / len(scores))', ask: ASK, options: ['0', '0.0', '에러가 나요', DUNNO] },
    { id: 'h6', code: 'for i in range(1, 5):\n    print(i)', ask: '마지막에 나오는 수는 무엇일까요?' },
    { id: 'h12', code: '# 하고 싶은 것: 10살 이하면 "어린이 요금"\nage = 10\nif age < 10:\n    print("어린이 요금")',
      ask: '하고 싶은 것과 맞게 하려면 < 자리에 무엇을 써야 할까요?', options: ['<=', '>', '==', DUNNO] },
    { id: 'h8', code: '# 하고 싶은 것: 점수 중 가장 큰 값 보여 주기\nscores = [70, 95, 88]\nprint(95)',
      ask: 'scores를 [60, 75]로 바꾸면 무엇이 나올까요?', options: ['75', '95', '에러가 나요', DUNNO] },
    { id: 'h13', code: 'a = "사과 "\nprint(a == "사과")', ask: ASK, options: ['True', 'False', '에러가 나요', DUNNO] },
    { id: 'h14', code: 'names = ["가은", "도윤", "서아"]\nfor i in range(len(names) - 1):\n    print(names[i])', ask: '이름은 몇 개 나올까요?',
      options: ['2개', '3개', '에러가 나요', DUNNO] }
  ];

  var QUESTIONS = [
    { id: 'd1', code: 'print("3" + "4")', ask: ASK, options: ['34', '7', '에러가 나요', DUNNO] },
    { id: 'd2', code: 'x = ["가", "나", "다"]\nprint(x[1])', ask: ASK },
    { id: 'd11', code: 'for i in range(3):\n    print("안녕")', ask: '"안녕"은 몇 번 나올까요?', options: ['2번', '3번', '4번', DUNNO] },
    { id: 'd4', code: 'n = 7\nif n > 5:\n    print("크다")\nelse:\n    print("작다")', ask: ASK, options: ['작다', '크다', '크다와 작다 둘 다', DUNNO] },
    { id: 'd5', code: 'data = "a,b,c"\nparts = data.split(",")\nprint(len(parts))', ask: ASK },
    { id: 'd12', code: 'nums = [5, 1, 4]\nnums.append(2)\nprint(len(nums))', ask: ASK },
    { id: 'd13', code: '# 코드 A\ndata = "2,3,5"\nprint(3)\n\n# 코드 B\ndata = "2,3,5"\nprint(len(data.split(",")))',
      ask: 'data를 "1,1"로 바꾸면 코드 A와 코드 B는 각각 무엇이 나올까요?',
      options: ['A는 3, B는 3', 'A는 2, B는 2', 'A는 3, B는 2', DUNNO] },
    { id: 'd8', code: 'orders = "떡볶이,우동,떡볶이,김밥"',
      ask: '주문에 메뉴가 몇 종류인지 알고 싶어요. 어떤 순서로 하면 될까요?',
      options: ['나누기 → 겹친 것은 하나만 → 개수 세기', '나누기 → 개수 세기 → 겹친 것은 하나만', '겹친 것은 하나만 → 개수 세기', DUNNO] },
    { id: 'd14', code: '# 하고 싶은 것: 60점 이상이면 "통과"\nscore = 60\nif score > 60:\n    print("통과")\nelse:\n    print("다시")',
      ask: '하고 싶은 것과 맞게 하려면 > 자리에 무엇을 써야 할까요?', options: ['>=', '<', '==', DUNNO] },
    { id: 'd15', code: '# 하고 싶은 것: 명단의 마지막 이름 보여 주기\nnames = ["민서", "가은", "하람"]\nprint(names[2])',
      ask: '명단에 "도윤"이 하나 더 붙으면 무엇이 나올까요?', options: ['하람', '도윤', '에러가 나요', DUNNO] }
  ];

  /* 객관식은 보기 번호, 단답형은 받아 주는 답 목록(공백·따옴표·대소문자는 보지 않는다).
   * 아래 줄의 "V1" 은 2026-10-21 이전 문항 — 예전 기록을 푸는 데만 쓴다 */
  var KEY = { d1: 0, d2: ['나'], d11: 1, d4: 1, d5: ['3'], d12: ['4'], d13: 2, d8: 0, d14: 0, d15: 0,
    l1: 0, l2: ['8'], l3: 1, l4: ['11'], l5: 0, l6: ['3'], l7: 0, l11: 1, l9: ['민지야'], l10: 1,
    h1: 0, h2: ['우산'], h3: ['7'], h11: 1, h5: 2, h6: ['4'], h12: 0, h8: 1, h13: 1, h14: 0,
    /* V1 */ d3: ['3', '3번', '세번'], d6: 1, d7: 2, d9: ['>='], d10: ['-1', 'len(names)-1'], l8: ['4', '4번', '네번'],
    h4: 1, h7: ['<='], h9: 0, h10: ['2', '2개', '두개'] };
  var SETS = { low: LOW, mid: QUESTIONS, high: HIGH };
  var SET_LABEL = { low: '하', mid: '중', high: '상' };   /* 선생님 화면만 쓴다 */
  var seq = function (p) { return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) { return p + i; }); };
  var V1 = { low: seq('l'), mid: seq('d'), high: seq('h') };

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

  function picksOf(answers) {
    var picks = {};
    (answers || []).forEach(function (a) { picks[a.q] = a.pick; });
    return picks;
  }
  function setOf(set) { return Object.prototype.hasOwnProperty.call(SETS, set) ? set : 'mid'; }   /* set 이 없던 예전 기록은 중 */
  /* 이 기록을 낸 문제지의 문항 id 순서 — 지금 문제지에서 빠진 V1 id 가 들어 있으면 V1 */
  function idsOf(set, picks) {
    var now = SETS[set].map(function (q) { return q.id; });
    return V1[set].some(function (id) { return now.indexOf(id) < 0 && id in picks; }) ? V1[set] : now;
  }

  /* 문항별 맞음 [true, false, ...] — 문제지 순서대로. 예전 8문항 기록은 q1~q8 */
  function marks(answers, set) {
    var picks = picksOf(answers);
    if ('q1' in picks) return Object.keys(OLD_KEY).map(function (id) { return picks[id] === OLD_KEY[id]; });
    return idsOf(setOf(set), picks).map(function (id) { return right(id, picks[id]); });
  }

  /* answers: [{q, pick}], set → {stage, hardcode}. 답하지 않은 문항은 틀린 것으로 본다 */
  function stage(answers, set) {
    var picks = picksOf(answers);
    if ('q1' in picks) return oldStage(picks);
    set = setOf(set);
    if (set !== 'mid') {
      var n = marks(answers, set).filter(Boolean).length;
      if (set === 'low') return { stage: n >= 8 ? 'combine' : 'base', hardcode: false };
      return { stage: n >= 7 ? 'ready' : n <= 2 ? 'base' : 'combine', hardcode: !right('h8', picks.h8) };
    }
    var count = function (ids) { return ids.filter(function (id) { return right(id, picks[id]); }).length; };
    var ids = idsOf(set, picks);                                     /* 앞 여섯은 문법, 뒤 넷은 의도. 일곱째가 하드코딩 문항 */
    var syn = count(ids.slice(0, 6)), intent = count(ids.slice(6));
    return {
      stage: syn <= 2 ? 'base' : syn >= 5 && intent >= 3 ? 'ready' : 'combine',
      hardcode: !right(ids[6], picks[ids[6]])
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

  CC.onboard = { QUESTIONS: QUESTIONS, SETS: SETS, SET_LABEL: SET_LABEL, marks: marks, stage: stage, spread: spread, LABEL: LABEL, pending: pending };
})(window.CC = window.CC || {});
