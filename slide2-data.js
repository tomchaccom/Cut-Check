/* /slide2 설문 데이터 — 어떤 문항이 화면에 나올지는 이 파일만 고쳐 정한다. slide2.html 은 고치지 않는다.
 *
 * 설문은 둘 — 강사(SLIDE2_SURVEY)와 학생(SLIDE2_STUDENT). 둘 다 같은 형식, 같은 코드로 그린다.
 * 모든 문항은 "무엇을 물었나" 목록 한 장에 배열 순서대로 나온다(인적 문항 — 동의 · 성함 · 이름 · 학년 · 담당 수업 — 은 넣지 않는다).
 * 그 밖에 화면에 나오는 길은 둘이다(2026-10-22 — "설문이 너무 많다" 피드백. 문항은 지우지 않고 끈다).
 *   signals [{ no, head, pick, unit, made }]  목록 다음 "문제 셋" 한 장에 no 순서로 나온다. 한 문항에서 여럿 나올 수 있다.
 *           head  신호 한 줄 · pick  보기 이름 · unit  큰 수 아래 한 마디 · made  그래서 만든 것 한 줄
 *           큰 수 — choice 는 pick 보기들의 count 합 / n. multi 는 pick 보기 중 가장 큰 count / n
 *           (사람별 응답을 옮기지 않아 합집합을 모른다 — 더하면 한 사람을 두 번 셀 수 있다).
 *   aside   true 면 문제 셋 장 아래에 한 줄로(short: 앞에 붙일 짧은 이름). multi 는 보기별 count/n, quote 는 인용.
 *   show    true 면 문항 하나가 그래프 + "이 결과 때문에 정한 것" 한 장으로, 강사 문제 셋 장 바로 뒤에 나온다(강사 설문만, 지금은 전부 false).
 *
 * JSON 이 아니라 JS 인 이유: file:// 에서 fetch 가 막힌다(저장소 규칙 — ES 모듈 · 번들러 없음).
 * 원본 xlsx 는 저장소에 넣지 않는다(이름이 들어 있다). 응답자는 원본 행 순서대로 응답자 A–E.
 * 복수 선택은 ", " 로 나눈 뒤 보기에 없는 글은 "기타" 로 센다(한 응답자당 한 번).
 *
 * 형식
 *   id      짧은 이름(겹치지 않게)
 *   q       문항 그대로
 *   kind    'choice' 하나 고르기(100% 누적 막대) · 'multi' 여럿 고르기(막대, n 명 중 몇 명)
 *           'scale' 1–5 척도(숫자 축 위 응답자 점) · 'quote' 서술(인용 카드)
 *   n       응답자 수
 *   show    true/false — 문항 한 장을 띄울지
 *   signals 문제 셋 장에 낼 신호(선택) — 위 설명
 *   options [{ label, count }]            choice · multi
 *   points  [{ who, v }]                  scale — ends: ['1 쪽 이름표', '5 쪽 이름표'] 를 주면 축 양 끝에 쓴다(없으면 숫자만)
 *   quotes  [{ who, text, verdict? }]     어느 kind 든 옆에 붙는 인용. verdict: 'yes' 받아들인 제안 · 'no' 거절한 제안
 *   links   [{ philosophy, feature }]     이 결과 때문에 정한 것 — 철학 한 줄과 기능 이름(문항 한 장에서)
 *   sample  true 면 화면에 "예시 데이터" 가 뜬다(실제 결과를 받기 전)
 *
 * 예시 한 문항 (sample 이라 화면에 "예시 데이터" 가 뜬다):
 *   { id: 'ex', q: '이 도구를 다음 학기에도 쓰시겠어요?', kind: 'choice', n: 5, show: false, show: true, sample: true,
 *     options: [{ label: '예', count: 4 }, { label: '아니오', count: 1 }],
 *     links: [{ philosophy: '…', feature: '…' }] }
 *
 * 원본: 강사용 "파이썬 수업에서 학생의 '의도' 확인하기", 2026-10-18~20, 강사 5명.
 *       학생용 "설계도 써보니 어땠나요", 학생 2명(중1 · 중2) — 타임스탬프 · 이름 열은 옮기지 않았다. 학생 A · B.
 */
window.SLIDE2_SURVEY = [
  { id: 'explain',
    signals: [{ no: 1, head: '코드는 돌아가는데, 왜 그렇게 짰는지 설명하지 못한다', pick: ['거의 매 수업', '자주 (매주)'], unit: '매주 이상',
      made: '03 설계에서 카드마다 이유 한 줄 — 설명을 코드 앞에 둔다' }],
    q: '코드는 돌아가는데, 학생이 왜 그렇게 짰는지 설명하지 못하는 경우가 얼마나 자주 있나요?', kind: 'choice', n: 5, show: false,
    options: [{ label: '거의 매 수업', count: 3 }, { label: '자주 (매주)', count: 2 }, { label: '가끔 (한 달에 몇 번)', count: 0 }],
    links: [{ philosophy: '설명을 코드 앞에 둔다', feature: '03 설계 — 카드마다 이유 한 줄' },
      { philosophy: '끝난 뒤에도 자기 말로', feature: '05 정리 — 마무리 문장' }] },

  { id: 'misread',
    signals: [{ no: 2, head: '다 짠 뒤에야, 문제를 다르게 이해했다는 걸 안다', pick: ['거의 매 수업', '자주 (매주)'], unit: '매주 이상',
      made: '02 성공 조건 — 코드 전에 무엇이 성공인지 먼저 고른다' }],
    q: '코드를 다 짠 뒤에야 학생이 문제를 다르게 이해했다는 걸 알게 된 경우가 얼마나 자주 있나요?', kind: 'choice', n: 5, show: false,
    options: [{ label: '거의 매 수업', count: 2 }, { label: '자주 (매주)', count: 2 }, { label: '가끔 (한 달에 몇 번)', count: 1 }],
    quotes: [{ who: '응답자 B', text: '다풀고 설명해보라고 하였을때 문제의 핵심 개념부터 잘 모르고있어 그 개념부터 다시 설명해줌' }],
    links: [{ philosophy: '코드 전에 무엇이 성공인지 고른다', feature: '02 성공 조건 — 보기에 함정을 섞는다' }] },

  { id: 'plan', q: '학생이 말로 설명한 풀이 계획과 실제로 짠 코드가 달랐던 경우가 얼마나 자주 있나요?', kind: 'choice', n: 5, show: false,
    options: [{ label: '거의 매 수업', count: 1 }, { label: '자주 (매주)', count: 1 }, { label: '가끔 (한 달에 몇 번)', count: 3 }],
    links: [{ philosophy: '계획과 코드를 나란히 본다', feature: '강사 화면 — 설계와 코드를 한 줄에' },
      { philosophy: '설계를 고친 일도 기록이다', feature: '나침반 동쪽 · 설계' }] },

  { id: 'point',
    signals: [{ no: 3, head: '가장 자주 지적하는 것 1위, 문제 해석 자체가 다름', pick: ['문제 해석 자체가 다름'], unit: '여럿 고르기 — 다음 보기들은 3 이하',
      made: '마지막 자료는 늘 반례 — 다르게 읽은 것이 실행 결과로 드러난다' }],
    q: '학생 코드에 코멘트할 때 가장 자주 지적하시는 것은?', kind: 'multi', n: 5, show: false,
    options: [{ label: '문제 해석 자체가 다름', count: 4 }, { label: '조건·예외 상황 누락', count: 3 },
      { label: '하드코딩 (특정 입력에서만 맞는 코드)', count: 3 }, { label: '반복문·조건문 구조', count: 3 },
      { label: '문법 오류', count: 3 }, { label: '변수명·가독성', count: 1 }, { label: '기타', count: 1 }],
    links: [{ philosophy: '마지막 자료는 늘 반례', feature: '미션 생성 — 반례 다섯 축' },
      { philosophy: '외운 답은 결과로 드러난다', feature: '하드코딩 알림 · 성공 조건 함정' },
      { philosophy: '문법은 주고 풀이는 안 준다', feature: 'AI 튜터' }] },

  { id: 'check', q: '수업 중 학생이 이해했는지 지금은 어떻게 확인하시나요?', kind: 'multi', n: 5, show: false,
    options: [{ label: '작성한 코드를 직접 읽어봄', count: 4 }, { label: '실행 결과(출력값) 확인', count: 3 },
      { label: '학생에게 말로 설명하게 함', count: 3 }, { label: '옆에서 코드 짜는 과정을 지켜봄', count: 3 }, { label: '기타', count: 1 }],
    links: [{ philosophy: '옆에서 지켜본 것을 화면에 남긴다', feature: '강사 화면 — 시간순 기록 · 설계와 코드 · 튜터 대화' }] },

  { id: 'practice', q: '연습문제는 주로 어떻게 준비하시나요?', kind: 'multi', n: 5, show: false,
    options: [{ label: '교재에 있는 문제 활용', count: 4 }, { label: 'AI로 생성한 뒤 수정', count: 4 },
      { label: '온라인 저지(백준, 프로그래머스 등) 활용', count: 2 }, { label: '직접 만듦', count: 1 }],
    links: [{ philosophy: '시작은 대신해 준다', feature: 'AI 문제 생성' },
      { philosophy: '판단은 강사가 한다', feature: '강사가 확정해야 학생에게 보인다' }] },

  { id: 'prepare', q: '수업을 준비할 때 가장 신경 쓰시는 부분은?', kind: 'multi', n: 5, show: false,
    options: [{ label: '진도에 맞춰 개념을 정확하게 전달하기', count: 3 }, { label: '학생 수준에 맞는 난이도 조절', count: 3 },
      { label: '학생들이 흥미를 갖게 만들기', count: 2 }, { label: '실습·연습문제 준비', count: 2 }],
    links: [{ philosophy: '난이도는 반 분포로 맞춘다', feature: '레벨 테스트 → 미션 생성' },
      { philosophy: '흥미는 강사가 고른다', feature: '이야기 고르기' }] },

  { id: 'goal', q: '수업을 통해 결국 아이들에게 가르치려고 하시는 것은 무엇인가요?', kind: 'multi', n: 5, show: false,
    options: [{ label: '파이썬 문법을 정확히 아는 것', count: 3 }, { label: '에러를 스스로 찾아 해결하는 힘', count: 2 },
      { label: '코딩에 대한 흥미와 자신감', count: 2 }, { label: '문제를 작게 쪼개서 생각하는 법', count: 1 },
      { label: '실제로 무언가를 만들어보는 경험', count: 1 }, { label: '기타', count: 1 }],
    links: [{ philosophy: '문법은 주고 풀이는 안 준다', feature: 'AI 튜터' },
      { philosophy: '에러는 위치와 사실만', feature: '실행 결과 — 원인을 대신 짚지 않는다' }] },

  { id: 'style', q: '개념을 설명할 때 어느 쪽에 더 가까우신가요?', kind: 'scale', n: 5, show: false,
    points: [{ who: '응답자 A', v: 3 }, { who: '응답자 B', v: 4 }, { who: '응답자 C', v: 1 }, { who: '응답자 D', v: 3 }, { who: '응답자 E', v: 4 }],
    links: [{ philosophy: '한 가지 설명 방식을 강요하지 않는다', feature: '튜터는 묻는 만큼만 답한다' }] },

  { id: 'understood', q: '학생이 "진짜 이해했다"고 확신하게 되는 순간은 언제인가요?', kind: 'quote', n: 5, show: false,
    quotes: [
      { who: '응답자 A', text: '코드를 보고 학생이 이문제를 풀기 위해 어떤 것을 고려하고 코딩했는지 말로 설명한것과 코드가 일치할때' },
      { who: '응답자 B', text: '직접 코드를 설명하고 이해했다고 했을때' },
      { who: '응답자 C', text: '자신이 생각한걸 코드로 작성할 수 있다' },
      { who: '응답자 E', text: '자기 스스로 설명할 수 있을때' }],
    links: [{ philosophy: '말한 것과 코드가 맞는지 본다', feature: '설계 ↔ 코드 · 나침반 북쪽(이해)과 동쪽(설계)' }] },

  { id: 'opinion', q: '이런 방식을 수업에 도입하는 것을 어떻게 보시나요? 더 좋은 방식이 있다면?', kind: 'quote', n: 5, show: false,
    quotes: [
      { who: '응답자 E', text: '각 학생 개인이 얼마나 이해한지 볼 수 있어서 좋은거같다.' },
      { who: '응답자 A', text: 'LLM을 튜터로 잘 제공하기', verdict: 'yes' },
      { who: '응답자 E', text: '학생들은 승부욕이 강해서 점수를 매기는것도 나쁘지 않다고 생각한다. 만약 본인이 90점이라면 100을 채우기 위해 노력할 것이다.', verdict: 'no' }],
    links: [{ philosophy: '받아들였다 — 튜터', feature: '문법은 주고 풀이는 안 준다' },
      { philosophy: '받아들이지 않았다 — 학생 점수', feature: '점수를 보면 학생은 결과를 맞히러 간다. 대신 방향(나침반)만 보여 준다' }] }
];

/* 학생 설문 — 응답 2명뿐(n = 2). 화면에 n 을 그대로 쓴다. 학년 · 배운 기간은 목록 장 위 한 줄로만. */
window.SLIDE2_STUDENT = [
  { id: 'forget', q: '배운 내용을 보통 얼마나 지나면 까먹나요?', kind: 'choice', n: 2, show: false,
    options: [{ label: '1주일쯤 지나면', count: 1 }, { label: '2주~한 달 지나면', count: 1 }], links: [] },

  { id: 'hesitate', q: '코드를 쓰기 전에 망설이게 되는 이유를 모두 골라주세요.', kind: 'multi', n: 2, show: false,
    options: [{ label: '뭐부터 써야 할지 모르겠어요', count: 2 }, { label: '문법이 기억 안 나요', count: 2 },
      { label: '어떤 순서로 풀지 모르겠어요', count: 1 }, { label: '에러가 나면 어떻게 고칠지 몰라요', count: 1 }],
    signals: [
      { no: 1, head: '"뭐부터 써야 할지 모르겠어요"', pick: ['뭐부터 써야 할지 모르겠어요'], unit: '둘 다 골랐다',
        made: '01 문제 → 02 성공 조건 → 03 설계 카드로 시작을 대신 열어 준다' },
      { no: 2, head: '"문법이 기억 안 나요"', pick: ['문법이 기억 안 나요'], unit: '둘 다 골랐다 · 배운 걸 1주~한 달이면 까먹는다',
        made: '튜터는 문법은 바로 알려 준다' },
      { no: 3, head: '"어떤 순서로 풀지 모르겠어요" · "에러가 나면 어떻게 고칠지 몰라요"', pick: ['어떤 순서로 풀지 모르겠어요', '에러가 나면 어떻게 고칠지 몰라요'], unit: '한 명이 둘 다 골랐다',
        made: '설계 카드 순서 맞추기 · 에러는 몇 번 줄인지와 사실만' }],
    links: [] },

  { id: 'hard', q: '화면이나 문제에서 알아보기 힘들었던 부분을 모두 골라주세요.', kind: 'multi', n: 2, show: false,
    options: [{ label: '문제 설명', count: 1 }, { label: '순서 정하는 부분', count: 1 }, { label: '없었어요', count: 1 }], links: [] },

  { id: 'why', q: '설계도가 도움이 될 것 같은 이유를 적어주세요.', kind: 'quote', n: 2, show: false,
    quotes: [{ who: '학생 A', text: '코드를 미리생각해볼수있다' }, { who: '학생 B', text: '그냥 도움이 되요' }], links: [] },

  { id: 'whynot', q: '그래도 설계도를 안 쓴다면, 그 이유는 뭘까요?', kind: 'choice', n: 2, show: false,
    options: [{ label: '안 쓸 이유 없어요', count: 2 }], links: [] },

  { id: 'whynot2', q: '굳이 하나 더 적는다면, 안 쓸 것 같은 이유는? (안 적어도 돼요)', kind: 'quote', n: 2, show: false,
    quotes: [], links: [] },

  { id: 'want', q: '이런 기능이 나오면 쓸 건가요? 줄마다 O 또는 X', kind: 'multi', n: 2, show: false,
    aside: true, short: '쓰고 싶은 기능(O)',
    options: [{ label: 'AI 튜터', count: 2 }, { label: '설계도 저장 · 복습', count: 2 }, { label: '선생님 코멘트', count: 2 },
      { label: '자주 틀리는 부분 정리', count: 2 }, { label: '레벨 · 뱃지', count: 1 }, { label: '내 코드가 앱으로 동작', count: 1 }],
    links: [] },

  { id: 'tutor', q: 'AI 튜터는 어디까지 도와주면 좋겠나요?', kind: 'choice', n: 2, show: false,
    aside: true, short: 'AI 튜터는 어디까지',
    options: [{ label: '틀린 부분을 짚어줘요', count: 1 }, { label: '힌트까지 알려줘요', count: 1 }], links: [] },

  { id: 'more', q: '이런 기능이 있으면 또 쓸 것 같다! 하는 게 있으면 적어주세요. (안 적어도 돼요)', kind: 'quote', n: 2, show: false,
    quotes: [{ who: '학생 A', text: '뒤로가기버튼' }], links: [] }
];
