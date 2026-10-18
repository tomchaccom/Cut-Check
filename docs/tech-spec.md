# Cut & Check — 테크스펙

---

## 1. 개요 및 비전

Cut & Check는 중학교 1~2학년이 **문제를 정의하고, 처리 방법을 설계하고, 실행 결과를 스스로 판정하는** 과정을 연습하는 수업 도구다. 파이썬 문법이 아니라, 문법이 바뀌어도 남는 사고 방식을 가르친다. 시작 비용은 0으로 만들되, 판단은 하나도 대신하지 않는다.

---

## 2. 포지셔닝

### 타겟 사용자
- **학생**: 중1~2, 코딩 경험 없음
- **강사**: 1명이 20~26명 수업

### 기존 도구와의 차별점

| 기존 도구 | Cut & Check |
|-----------|-------------|
| 코드를 치게 한다 → 문법 오류로 막힘 | 선택형 빈칸 → 시작 비용 0 |
| 정답과 대조해서 채점 | 시스템이 채점하지 않음. 학생이 판정 |
| 점수·배지·리더보드 | 점수 없음. 저장조차 안 함 |
| 힌트를 먼저 보여줌 | 실행 후에만 단서가 보임 |
| 교사에게 정답률 제공 | 정답률 대신 개입 순서 제공 |

### 핵심 가치
> **시작은 대신해주고, 판단은 하나도 대신하지 않는다.**

---

## 3. 시스템 아키텍처

### 3계층 구조

```
js/core/    판단의 규칙 — 저장소도 네트워크도 화면도 모른다
js/data/    바깥 세계 — localStorage와 fetch만 안다
js/ui/      화면 — DOM만 만진다. 서버 존재 여부를 모른다
```

### 의존성 규칙

| 층 | 알아도 되는 것 | 알면 안 되는 것 |
|----|---------------|----------------|
| `core` | 순수 자바스크립트 | `localStorage`, `fetch`, `document`, `window` |
| `data` | `core`, 브라우저 저장소, 네트워크 | `document` |
| `ui` | `core`, `data`, DOM | 서버가 있는지 없는지 |

`test/layer.test.js`가 이 경계를 자동 검사한다. `core` 안에서 `localStorage`를 한 번 쓰면 테스트가 깨진다.

### 오프라인 우선 설계

학교 와이파이는 끊긴다. 끊긴 순간 학생이 누른 게 사라지면 그 수업은 거기서 끝난다.
- localStorage에 먼저 저장 (항상 성공)
- 서버가 설정되어 있으면 발신함(outbox)에 넣고 뒤에서 전송
- 실패 시 재시도, 발신함을 삭제하지 않음
- **서버는 기록의 조건이 아니라 기록의 사본**

### 기술 제약
- 번들러 없음 — 교사가 파일을 열어서 고칠 수 있어야 한다
- ES 모듈 없음 — `file://`에서 CORS로 막힌다
- 정적 파일만 사용 — 빌드 스텝 없음

---

## 4. 데이터 모델

### 4-1. 이벤트 스키마 (`js/core/events.js`)

모든 이벤트는 `CC.events.make(type, payload)`로 생성. 알 수 없는 type은 throw.

```javascript
// 이벤트 타입 상수 (T)
var T = {
  // 블록형 미션
  DEFINE: 'define',       CUT: 'cut',           BLOCKS: 'blocks',
  RUN: 'run',             JUDGE: 'judge',       CAUSE: 'cause',
  HANDLE: 'handle',       HELP: 'help',         BREAK: 'break',
  WRAP: 'wrap',           REVISE: 'revise',     REDEFINE: 'redefine',

  // 미션 04·05
  ABSTRACT_SLOTS: 'abstract-slots',   ABSTRACT_RUN: 'abstract-run',
  ABSTRACT_NAME: 'abstract-name',     ABSTRACT_SAME: 'abstract-same',
  REVIEW_GUESS: 'review-guess',       REVIEW_COMMENT: 'review-comment',
  REVIEW_RUN: 'review-run',

  // 졸업 시험
  MAKE_CHECK: 'make-check',  MAKE_SUBMIT: 'make-submit',

  // 문장형 미션
  S_DEFINE: 's-define',       S_REDEFINE: 's-redefine',
  S_METHOD: 's-method',       S_REMETHOD: 's-remethod',
  S_PREDICT: 's-predict',     S_RUN: 's-run',
  S_JUDGE: 's-judge',         S_HELP: 's-help',
  S_WRAP: 's-wrap'
};
```

**저장 금지 필드 (NEVER):**
```javascript
var NEVER = ['correct', 'score', 'rank', 'duration', 'accuracy', 'level', 'streak'];
```

`CC.events.make()`에 이 필드가 포함되면 예외를 던진다.

### 4-2. 학생 상태 객체 (`js/core/fold.js`)

```javascript
function empty(id, name) {
  return {
    id: id || 'me',  name: name || '나',
    live: true,       stage: 0,
    define: { text: '아직 안 정함', trap: null },
    why: { text: '아직 안 정함', weak: false },
    blocks: [],       symptom: null,    asked: false,
    selfFound: false, breaks: 0,        brokeOwn: false,
    revised: 0,       redefined: 0,     lastRevision: null,
    cause: null,      handle: null,     wrap: null,
    abstractOk: null, abstractPicked: null,
    reviewComments: 0, reviewGuess: null,
    made: null,       mission: null,    idleSec: 0,

    // 문장형 미션
    sDefine: null,       // { choice, reason }
    sMethod: null,       // { slots, reason }
    sRuns: [],           // [{ dataId, result, t }]
    sJudges: [],         // [{ runId, verdict, basis, t }]
    sHelps: 0,
    sWrap: null,
    sMethodVer: 0,
    sDefineVer: 0
  };
}
```

### 4-3. 미션 데이터 구조

```javascript
// SENTENCE_MISSIONS 스키마
{
  id: 'sm1',              // 고유 식별자
  no: '01',               // 표시 번호
  type: 'sentence',       // 미션 타입
  stage: '분해',          // 단계명
  title: '창고에 주문서가 들어왔어요',
  brief: '...',           // 업무 요청 (모호하게)

  define: {
    q: '성공 조건 질문',
    options: [
      { v: '주문된 상품의 전체 개수', key: 'total' },
      { v: '서로 다른 상품 이름의 개수', key: 'unique' }
    ]
  },

  method: {
    sentences: [
      { template: '주문서를 {sep} 기준으로 나눈다.', slot: 'sep', options: ['쉼표', '공백', '줄바꿈'] },
      { template: '같은 이름은 {dedup}.', slot: 'dedup', options: ['각각 남긴다', '하나만 남긴다'] },
      { template: '{output}을 출력한다.', slot: 'output', options: ['남은 항목의 개수', '항상 숫자 3'] }
    ]
  },

  inputs: [
    { id: 'd01', name: '주문서 01', v: '사과,바나나,우유' },
    { id: 'd02', name: '주문서 02', v: '빵,치즈,주스' },
    { id: 'd03', name: '주문서 03', v: '사과,바나나,우유,사과,빵' }
  ],

  verify: [...]  // 개발·강사용 검증 표
}
```

### 4-4. 저장 구조

| localStorage 키 | 용도 | 최대 |
|-----------------|------|------|
| `cutcheck.log.v1` | 이벤트 기록 | 200건 |
| `cutcheck.outbox.v1` | 서버 미전송 발신함 | — |

localStorage 불가 시 메모리(`mem` 객체)로 폴백. 탭 닫으면 소실.

---

## 5. 기능적 요구사항

### 5-1. 학생 화면

| 단계 | 요구사항 |
|------|---------|
| 미션 선택 | SENTENCE_MISSIONS에서 미션 선택. 전환 시 상태 초기화 |
| Step 1 요청 | brief + 첫 자료 표시. 풀이 순서·정답 예시 제시하지 않음 |
| Step 2 성공 | 모든 빈칸 미선택 상태로 시작. 두 해석 중 정답을 지정하지 않음 |
| Step 3 방법 | 3줄 순서 고정. 선택값은 실행 규칙에 대응. 요약 자동 표시 |
| Step 4 실행 | 자료 하나씩 진행. 예상→실행→판정. 빈 슬롯은 실행 거부 + 구체적 안내 |
| Step 4 판정 | 3종(지켰다/못했다/어렵다). '어렵다'도 유효한 판정 |
| Step 5 마무리 | 문장 틀 채우기. 자동 입력 없음. 수정 안 해도 마무리 가능 |
| 수정 루프 | 방법/성공 조건 수정 후 이전 결과 구분, 재실행 필요 |
| 도움 요청 | 모든 단계에서 접근 가능. 미입력도 접수 가능 |

### 5-2. 강사 화면

| 구성 요소 | 요구사항 |
|-----------|---------|
| 요약 타일 | 답해줄 수 있음 / 조용히 막힘 / 위험군 / 3장 도달 |
| 명단 | 학생별 현재 단계, 마지막 활동, 성공 조건, 방법, 증상 |
| 학생 상세 | 수정 전후 이력, 판정과 근거, 도움 요청 횟수 |
| 제외 | 정답률, 순위, 소요 시간, 자동 칭찬 문구 |

### 5-3. 실행 엔진

```javascript
CC.engine.runSentence(slots, text)
// slots: { sep: '쉼표', dedup: '하나만 남긴다', output: '남은 항목의 개수' }
// text: '사과,바나나,우유'
// → { err: 0, type: 'number', value: 3, steps: [...] }
// → { err: 1, msg: '나누는 기준을 선택해 주세요.' }  (빈 슬롯)
```

결정적 함수: 같은 입력·같은 슬롯은 항상 같은 출력. AI 해석 없음.

---

## 6. 비기능적 요구사항

| 항목 | 요구 |
|------|------|
| **동시 접속** | 20명 수업 기준. 서버 없이도 동작 |
| **접근성** | 모든 기능 키보드 사용 가능. 44px 터치 영역. 의미를 색에만 의존하지 않음 |
| **오프라인** | localStorage 우선. 서버 없어도 전체 흐름 가능 |
| **반응형** | 최소 360px~1280px. 좁은 화면에서 세로 배치 |
| **보안** | 학생 간 기록 격리 (localStorage 기반). 수업 코드만으로 강사 권한 불가 |
| **성능** | 변경 후 3초 이내 강사 화면 반영 (서버 연동 시) |
| **저장 안전** | 새로고침·재접속에도 초안 복구. 저장 실패를 숨기지 않음 |

---

## 7. API 명세

### 7-1. 클라이언트 API

#### `CC.engine.runSentence(slots, text) → result`

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `slots` | `{ sep, dedup, output }` | 학생이 선택한 방법 슬롯 |
| `text` | `string` | 입력 자료 |
| **반환** | `{ err, type, value, steps }` | 실행 결과 또는 검증 오류 |

#### `CC.events.make(type, payload) → event`

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `type` | `string` | T 상수 중 하나 |
| `payload` | `object` | 이벤트 데이터. NEVER 필드 포함 시 throw |
| **반환** | `{ type, v: 1, t: Date.now(), ...payload }` | 이벤트 객체 |

#### `CC.fold.fold(events, options) → student`

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `events` | `array` | 이벤트 배열 |
| `options` | `{ id, name, now }` | 학생 식별, 현재 시각 |
| **반환** | `student` 객체 또는 `null` (빈 배열) |

#### `CC.store`

| 메서드 | 설명 |
|--------|------|
| `push(ev)` | 이벤트 저장. 항상 로컬 먼저. 서버 설정 시 발신함에도 추가 |
| `all()` | 전체 이벤트 배열 반환 |
| `fold(name)` | 현재 저장된 이벤트를 접어서 학생 객체 반환 |
| `pending()` | 미전송 발신함 건수 |
| `clear()` | 전체 삭제 |
| `available()` | localStorage 사용 가능 여부 |

### 7-2. 서버 API (미구현, docs/server.md 기반 설계)

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `POST /events` | POST | 이벤트 배치 전송 |
| `GET /board?class={code}` | GET | 교실 전체 이벤트 → foldMany 결과 |
| `POST /class` | POST | 수업 생성 → 참여 코드 발급 |
| `POST /join` | POST | 학생 참여 (좌석 id 할당) |

### 7-3. 계정 (2026-10-18 현재, Supabase)

| 누가 | 어떻게 |
|------|--------|
| 강사 | `auth.html` 에서 이메일로 스스로 가입. 스스로 가입하면 모두 강사 |
| 학생 | 선생님이 `teacher.html` 의 `학생 추가` 탭에서 만든다 → `POST /api/create-student`. 아이디 + 비밀번호로 로그인 (내부 이메일 `<아이디>@students.invalid`) |
| 교실 코드로 들어가기 | 없앴다. 수강 줄은 서버(service role)만 만든다 |

역할은 트리거가 `app_metadata.role` 로만 정하고, `profiles` 는 본인도 `name` 만 고칠 수 있다.
자세한 건 `docs/server.md` 8절.

---

## 8. 테스트 전략

| 파일 | 검증 대상 |
|------|-----------|
| `engine.test.js` | 블록형 + 문장형 실행 결과. 대표 방법 3종 × 자료 3개. 빈 슬롯 거부. 에러 위치 |
| `hangul.test.js` | 조사 계산 (은/는, 이/가, 을/를) |
| `llmguard.test.js` | AI 출력 규칙 위반 차단. 실제 사용 문장 통과 확인 |
| `layer.test.js` | 계층 경계 (core에 localStorage/fetch/document 없음). 이벤트 계약. fold 접기 |
| `smoke.js` | 8개 화면 × 3폭 × 2테마 = 48조합. JS 에러, 가로 스크롤, 금지 단어 |
| `robust.js` | 학생 자유 입력이 교사 화면까지 안전하게 흐르는지 |

6개 모두 통과해야 커밋한다.

---

## 9. 만들지 않기로 한 것

| 항목 | 이유 | 거절 방식 |
|------|------|-----------|
| 점수·포인트·레벨 | 칭찬을 기계에 넘기면 사람의 격려가 싸구려가 된다 | `events.js` NEVER |
| 성공 팝업 | 인정은 사람의 일 | `smoke.js` 금지 단어 |
| 정답 채점 | 채점하면 학생이 우리 답을 추측한다 | 엔진이 goal 판정 안 함 |
| 다음 행동 추천 | 판단 대행 | 코드에 없음 |
| 교사 정답률·순위 | 교사가 줄을 세운다 | `events.js` NEVER |
| AI 칭찬 문구 | 타이밍만 알려주고 말은 교사가 한다 | `llmguard.js` 차단 |
| 앞뒤 공백 자동 처리 | 봐주면 그 개념을 영영 못 배운다 | 엔진 코드 주석 |

---

## 10. 향후 계획

| 단계 | 내용 |
|------|------|
| **API 문제 생성** | LLM으로 미션 brief·자료·선택지 자동 생성. 실행 규칙은 유지 |
| **회원가입** | 학생별 계정 → 기록 영속화. 좌석 id 대신 사용자 id |
| **학생별 분리** | 학생 간 기록 격리. 강사만 전체 조회 |
| **서버 연동** | docs/server.md 기반 구현. SSE/WebSocket 또는 주기 조회 |
| **수업 생성** | 참여 코드 발급 → 학생 참여 → 실시간 강사 화면 |
| **기록 내보내기** | 학생별 인쇄용 기록 + JSON 내보내기 |
