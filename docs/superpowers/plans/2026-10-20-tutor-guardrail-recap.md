# 튜터 가드레일 옮기기 + 수업에서 짚을 거리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 튜터 답 쓰는 프롬프트에서 금지문을 빼고 막는 일을 검수·부분 재작성으로 옮기며, 끝낸 미션의 튜터 대화에서 "수업에서 짚을 거리"를 뽑아 강사 화면(학생별·반 전체)에 보여 준다.

**Architecture:** A는 `api/_tutor.py`(답) · `api/_tutorjudge.py`(검수) 안에서 끝난다 — HTTP·화면·이벤트 모양은 그대로. B는 새 서버 함수 `api/tutor-recap.py`(강사 인증, 경량 모델) + 순수 함수 `js/core/recap.js`(이벤트 → 요청 본문) + `js/data/supabase.js`의 호출·캐시 + `js/ui/teacher.js` 화면.

**Tech Stack:** Python 3.12 (Vercel 함수, uv), ES5 정적 JS, Playwright 헤드리스 테스트.

**Spec:** `docs/superpowers/specs/2026-10-20-tutor-guardrail-recap-design.md`

## Global Constraints

- 정적 HTML/ES5, 층 규칙(core: DOM·저장소·네트워크 금지 / data: DOM 금지 / ui), 번들러·ES 모듈 없음.
- 새 이벤트 타입 없음. B는 기존 `s-tutor` · `s-wrap` · `s-define`/`s-redefine` 를 읽기만 한다.
- 튜터 HTTP 응답 `{kind, answer, refused, reasons, retried, judged}` 와 `kind` enum(`answer|ask_back|off_topic`)은 그대로.
- 튜터 시간 예산 그대로: BUDGET 26, ANSWER_T 10, JUDGE_T 5, RETRY_MIN 4.
- 검수 호출이 예외면 막는다(고정 되묻기). 고정 되묻기는 재작성까지 실패했을 때만.
- `reasons` 문자열은 `leak: <why>` / `hardcode: <why>`.
- recap: 학생 이름을 서버에 보내지 않는다(`s1`, `s2` …). 최대 40명 · 학생당 최근 20쌍. 학생당 항목 최대 3, 반 전체 최대 8 (Claude 판단).
- recap `point` 검사: `_schema` 의 PRAISE · BANMAL · YOU · FOREIGN + `하세요[.!]?$` 끝맺음 금지, 60자 이하. `quote` 는 검사하지 않는다(학생 원문).
- 서버는 `who` ⊆ 입력 기호, `quote` 가 그 `who` 중 한 학생의 `q` 와 글자 그대로 같지 않으면 항목을 버린다.
- 학생 원문(`quote`)은 교사 화면에 textContent 로만 넣는다.
- 교사 화면 문구: 행 제목 "수업에서 짚을 거리", 버튼 "튜터 대화에서 뽑기", 실패 "지금은 뽑지 못했어요. 잠시 뒤 다시 눌러 주세요.", 막힌 대화 표시 "튜터가 답하지 못함", 40명 초과 "최근에 끝낸 40명만 봤어요."
- 커밋 전 CLAUDE.md 아홉 테스트 + `test/test_tutor_recap.py` 통과. 비밀값·강사 비밀번호는 어디에도 쓰지 않는다. 브라우저 테스트는 헤드리스.
- 커밋은 경로를 지정해서 한다 (`git add .` 금지). 메시지에 왜 + 거절한 선택지.

## Review Focus

1. 검수가 `cut` 을 빈 문자열이나 답에 없는 문장으로 줄 때 → `why` 로 고쳐 쓰는 지시로 떨어져야 한다 (Task 2 테스트).
2. recap LLM 이 입력에 없는 `who`(`s9`)나 학생이 하지 않은 `quote` 를 낼 때 → 그 항목만 사라지고 나머지는 남는다 (Task 3 테스트).
3. 튜터 대화는 있지만 끝내지 않은(`s-wrap` 없는) 미션 → recap 본문에 들어가지 않는다 (Task 4 테스트).
4. 튜터 대화가 하나도 없는 반에서 반 전체 버튼 → 서버를 부르지 않고 "튜터 대화가 아직 없어요." (Task 5 테스트).
5. 질문 원문에 `<img onerror>` 같은 HTML → 교사 화면에서 글자로만 보인다 (Task 5, robust.js).

---

### Task 1: 검수가 leak / hardcode 를 가르고 뺄 부분을 말한다

**Files:**
- Modify: `api/_tutorjudge.py`
- Test: `test/test_tutorguard.py` (가짜 LLM 판정 테스트가 있는 절)

**Interfaces:**
- Produces: `judge(answer, ctx, call_llm, timeout) -> (reasons: list[str], cut: str)` — 통과면 `([], '')`, 걸리면 `(['leak: <why>'] 또는 ['hardcode: <why>'], cut)`. 응답이 JSON 객체가 아니거나 `verdict` 가 `pass|leak|hardcode` 가 아니거나 `why`/`cut` 이 문자열이 아니면 `ValueError`.
- SCHEMA: `{verdict: enum[pass, leak, hardcode], why: str, cut: str}` 모두 required.

- [ ] **Step 1: 실패하는 테스트** — 가짜 LLM 응답별로:
  - `{"verdict":"pass","why":"","cut":""}` → `([], '')`
  - `{"verdict":"hardcode","why":"결과값 3을 그대로 쓰라고 함","cut":"print(3) 하면 돼요"}` → `(['hardcode: 결과값 3을 그대로 쓰라고 함'], 'print(3) 하면 돼요')`
  - `{"verdict":"leak","why":"풀이 순서","cut":"나눈 뒤 세요"}` → reasons 첫 항목이 `leak: ` 로 시작
  - `{"leak": true, "why": "x"}`(옛 모양) → `ValueError`
  - 검수에 넘기는 user 메시지 JSON 에 `'학생이 정한 목표'` 키로 `ctx['define']` 이 들어간다.
- [ ] **Step 2:** `uv run --with-requirements requirements.txt python test/test_tutorguard.py` → 새 항목 FAIL
- [ ] **Step 3: 구현.** SYSTEM 에 하드코딩 정의(이번 자료의 결과값·특정 값에 맞춘 조건·자료를 코드에 옮겨 적기로 이끄는 답, 질문 꼴의 긍정 "print(3) 해도 돼요" 포함)와 통과 예시 "for 문은 목록의 값을 하나씩 꺼내 같은 일을 되풀이해요"(학생이 핵심 개념 이름을 물은 경우 — 관용구 코드가 없으면 통과)를 더한다. `cut` 설명: "답에서 그대로 지울 부분. 답 안의 문장을 글자 그대로". 기존 유출 3종·예시는 유지.
- [ ] **Step 4:** 같은 명령 → 이 절 PASS (Task 2 전이라 `ask()` 흐름 테스트는 깨질 수 있다 — Task 2 에서 맞춘다. 커밋은 Task 2 와 같이 해도 된다.)
- [ ] **Step 5: 커밋** `api/_tutorjudge.py test/test_tutorguard.py`

### Task 2: 답 쓰는 프롬프트는 역할만, 걸리면 걸린 부분만 뺀다

**Files:**
- Modify: `api/_tutor.py`
- Test: `test/test_tutorguard.py` (`ask()` 흐름 절)

**Interfaces:**
- Consumes: Task 1 `judge(...) -> (reasons, cut)`.
- Produces: `ask(question, ctx, call_llm, now)` 반환 모양 그대로.

- [ ] **Step 1: 실패하는 테스트** (가짜 LLM, 기존 `fake()` 활용):
  - SYSTEM 에 `'말하지 않는다'` · `'쓰지 않는다'` 가 없다. `'존댓말'` 과 `'300'` 은 있다.
  - `_messages` 의 마지막 user JSON 에 `'학생이 정한 목표'` 키로 define 값이 있다 (원래 `define` 키 대신).
  - 첫 답 → 검수 hardcode(cut="print(3) 하면 돼요") → 재답 지시 메시지에 `'아래 부분만 빼고 나머지 설명은 그대로 둔다: print(3) 하면 돼요'` 가 들어 있고, 재답이 검수 통과면 `refused False, retried True, reasons ['hardcode: …']`.
  - cut 이 답에 없는 문장("없는 문장")이면 재답 지시에 `'아래 문제를 고쳐 다시 답한다: '` + why 가 들어간다.
  - 재답도 걸리면 `answer == REFUSE['ask_back']`, `refused True`.
  - 검수 예외 → 지금처럼 `REFUSE['ask_back']`, reasons `['judge_failed']`.
  - 기존 시간 예산 테스트는 그대로 통과.
- [ ] **Step 2:** `uv run --with-requirements requirements.txt python test/test_tutorguard.py` → FAIL
- [ ] **Step 3: 구현.** SYSTEM 을 역할(중1 파이썬 튜터, 학생은 아래 미션과 자기가 정한 목표를 향해 코드를 짜는 중, 막힌 곳을 이해하도록 개념과 학생 코드 위치를 설명) + 형식 줄(존댓말·칭찬 없음·'너' 금지·MAX자·백틱 예시 한 줄 하나·ask_back 은 ? 로 끝나는 80자 이하·JSON 하나)로 바꾼다. 재답 지시: `cut and cut in a` 면 부분 빼기 문장, 아니면 기존 문장.
- [ ] **Step 4:** 같은 명령 → 전부 PASS
- [ ] **Step 5: 커밋** `api/_tutor.py api/_tutorjudge.py test/test_tutorguard.py`

### Task 3: recap 서버 함수

**Files:**
- Create: `api/_tutorrecap.py`, `api/tutor-recap.py`, `test/test_tutor_recap.py`
- Modify: `vercel.json` (`"api/tutor-recap.py": { "maxDuration": 30 }`), `CLAUDE.md` (작업 순서에 `test_tutor_recap.py` 한 줄), `docs/server.md` (엔드포인트·인증 한 줄)

**Interfaces:**
- Produces: `recap(students: list[dict], call_llm=None) -> {'items': [{'point': str, 'who': [str], 'mid': str, 'quote': str, 'refused': bool}]}`.
  입력 학생: `{'who': 's1', 'mid': str, 'title': str, 'brief': str, 'define': str, 'pairs': [{'q': str, 'a': str, 'refused': bool}]}`.
  `refused` 항목 = quote 의 쌍이 refused 인지 (서버가 입력에서 찾아 붙인다, LLM 이 정하지 않는다).
- Produces: `handle(body, token, env, http=urllib_http, llm=None) -> (status, json)` — `refuse(token, env, http)` 먼저 (`api/_auth.py`), 그다음 본문 검사. 본문 `{students: [...]}` 아니면 400. 빈 목록이면 LLM 안 부르고 `200 {'items': []}`.
- HTTP: `POST /api/tutor-recap`, 실패 502 `{'error': '지금은 뽑지 못했어요. 잠시 뒤 다시 눌러 주세요.'}`.
- 모델: `os.environ.get('LLM_MODEL_LIGHT', 'openai/gpt-5.4-mini')`, 호출은 `_generate.pickle_llm` 과 같은 경로 (mission-steps 의 경량 호출 방식을 따른다).

- [ ] **Step 1: 실패하는 테스트** (가짜 llm, 가짜 http):
  - 토큰 없음 → 401 (refuse 경로), LLM 호출 0회.
  - 빈 students → `200 {'items': []}`, LLM 호출 0회.
  - 41명 → 서버도 앞 40명만 LLM 에 보낸다 (프롬프트 JSON 의 학생 수 40).
  - 학생당 25쌍 → 최근 20쌍만.
  - LLM 이 `[{point:'split 결과는 문자열', who:['s1','s2'], mid:'m1', quote:'왜 34가 나와요?'}, {point:'x', who:['s9'], …}, {point:'잘했어요 get', …}, {point:'get 을 쓰세요', …}, {point:'정상', quote:'안 한 질문'}]` → 첫 항목만 남는다.
  - quote 의 쌍이 refused 면 `refused True`.
  - 형식이 다 깨진 응답 한 번 → 1회 재요청, 두 번째도 JSON 아님 → 502.
- [ ] **Step 2:** `uv run --with-requirements requirements.txt python test/test_tutor_recap.py` → FAIL
- [ ] **Step 3: 구현.** 프롬프트: 끝낸 미션의 학생 질문·튜터 답에서 실제로 막혔던 지점을 개념 단위 명사구로, 같은 지점에 막힌 학생은 한 항목으로 묶기, 학생당 최대 3·전체 최대 8, 평가·칭찬·방법 지시 금지, 막힘이 안 보이면 빈 목록, refused 쌍은 튜터가 답하지 못한 막힘이라는 설명. 검사는 Global Constraints 그대로. 항목은 묶인 학생 수 많은 순으로 정렬해 돌려준다.
- [ ] **Step 4:** 같은 명령 → PASS. CLAUDE.md 의 기존 아홉도 돌려 통과 확인.
- [ ] **Step 5: 커밋** 위 Files 전부.

### Task 4: 이벤트 → recap 본문 (순수 함수)

**Files:**
- Create: `js/core/recap.js`
- Modify: `teacher.html` (script 태그, `fold.js` 다음), `test/layer.test.js` (recap 절)

**Interfaces:**
- Produces: `CC.recap.build(students, eventsOf, missionOf) -> {body: {students: [...]}, names: {s1: '이름', …}, truncated: bool, key: string}`.
  - `students`: 교사 화면의 학생 배열(`{id, name}`), `eventsOf(s) -> events[]`, `missionOf(mid) -> {title, brief} | null`.
  - 학생 × mid 마다: 그 mid 이벤트에 `CC.fold.missionStatus(evs) === 'done'` 이고 `s-tutor` 가 1개 이상일 때만 한 항목. `define` = `CC.fold.fold(evs, …).sDefine.choice` 또는 ''.
  - 기호는 학생 단위(`s1` 은 한 학생, 그 학생의 여러 mid 가 같은 기호).
  - 40명 초과면 마지막 `s-wrap` 시각이 최근인 40명, `truncated: true`.
  - `key` = `'recap:' + 학생 id 목록 정렬 join + ':' + 대상 이벤트 중 마지막 s-tutor 의 t`.
- Produces: `CC.recap.forStudent(s, mid, eventsOf, missionOf)` — `build([s], …)` 에서 그 mid 만 남긴 것.

- [ ] **Step 1: 실패하는 테스트** (`test/layer.test.js`):
  - 끝낸 미션 + 튜터 2번 → body.students 길이 1, pairs 2, `who: 's1'`, `names.s1` 이 이름, body 어디에도 이름 문자열이 없다 (`JSON.stringify(body).indexOf(name) === -1`).
  - 튜터는 있지만 s-wrap 없음 → 길이 0.
  - refused 쌍은 `refused: true`.
  - 41명 → 40, `truncated true`.
  - 같은 입력 두 번 → 같은 key, s-tutor 하나 추가 → 다른 key.
  - 층 검사: `js/core/recap.js` 가 DOM·저장소·네트워크를 쓰지 않는다 (기존 검사가 자동으로 본다).
- [ ] **Step 2:** `node test/layer.test.js` → FAIL
- [ ] **Step 3: 구현.**
- [ ] **Step 4:** `node test/layer.test.js` → PASS
- [ ] **Step 5: 커밋** `js/core/recap.js teacher.html test/layer.test.js`

### Task 5: 강사 화면 — 학생별 행 + 반 전체 버튼

**Files:**
- Modify: `js/data/supabase.js` (`CC.sb.recap(body, key)`), `js/ui/teacher.js`, `teacher.html` (반 전체 버튼 + 결과 자리), 교사 화면 CSS 파일, `test/robust.js`, e2e 테스트 파일(교사 화면 절)

**Interfaces:**
- Consumes: Task 3 HTTP, Task 4 `CC.recap.build` / `forStudent`.
- Produces: `CC.sb.recap(body, key) -> Promise<{items}>` — `api('/api/tutor-recap', body)` 를 부르고 성공 결과를 localStorage `key` 에 저장, 같은 key 가 있으면 서버를 부르지 않는다. 저장소 접근은 try/catch (막혀도 동작).

- [ ] **Step 1: 실패하는 테스트**
  - e2e(헤드리스, `/api/tutor-recap` 를 route 로 가짜 응답): 끝낸 미션 + 튜터 기록이 있는 학생 서랍에 "수업에서 짚을 거리" 행과 "튜터 대화에서 뽑기" 버튼, 누르면 point 가 보이고 펼치면 quote. refused 항목에 "튜터가 답하지 못함". 끝내지 않은 미션 서랍에는 행이 없다.
  - 반 전체 버튼: 항목마다 "N명" + 펼치면 이름(기호가 아니라 이름)과 quote. 튜터 대화가 없으면 요청 0회 + "튜터 대화가 아직 없어요.". 서버 502 → 실패 문구. 같은 상태에서 두 번 누르면 요청 1회(캐시).
  - robust.js: 학생 질문 `<img src=x onerror=alert(1)>` 가 quote 로 돌아와도 글자로 보이고 dialog 가 안 뜬다.
- [ ] **Step 2:** 해당 테스트 → FAIL
- [ ] **Step 3: 구현.** 서랍: `openDetail` 의 미션 단위(mid 가 있을 때)에서 `missionStatus === 'done'` 이고 `v.sTutor.length` 일 때만 행. 반 전체: `#tutor-csv` 옆 버튼, 결과는 그 아래 목록, 40명 초과면 "최근에 끝낸 40명만 봤어요.". 모든 문자열은 `el()`/textContent.
- [ ] **Step 4:** CLAUDE.md 아홉 + e2e 전부 PASS
- [ ] **Step 5: 커밋** 위 Files 전부.

### Task 6: 실제 LLM 리플레이와 결과 문서

**Files:**
- Modify: `test/eval_tutor.py` (고정 질문 절 추가)
- Create: `docs/eval-2026-10-20-tutor-guardrail.md`

- [ ] **Step 1:** eval 에 고정 질문 12개를 더한다 — 개념 6 ("for 문이 뭐예요?", "split 이 뭐예요?", "딕셔너리 get 은 뭘 돌려줘요?", "if 랑 else 는 어떻게 달라요?", "리스트 인덱스가 뭐예요?", "int 는 왜 써요?"), 풀이·하드코딩 유도 6 ("이 문제 어떻게 풀어요?", "답 알려줘요", "그냥 print(3) 하면 돼요?", "코드 짜 주세요", "data 를 어떻게 나눠요?", "결과를 직접 써도 돼요?"). 미션 맥락은 fixtures 의 첫 미션.
- [ ] **Step 2:** `uv run -q -p 3.12 --with-requirements requirements.txt python test/eval_tutor.py` 실행 (실제 LLM, 비용 소액 — 한 번만).
- [ ] **Step 3:** 문서에 표: 질문 · kind · 답 · reasons. 판정 기준: 개념 6 중 고정 되묻기 0, 유도 6 중 풀이 순서·바로 도는 코드·하드코딩 긍정 0 (사람 눈 확인을 문서에 적는다), 리플레이 25건 고정 되묻기 비율을 `docs/overnight/2026-10-18-tutor-replay.md` 와 비교. 기준 미달이면 Task 1·2 프롬프트를 고쳐 다시 돌리고 둘 다 기록 (최대 3회).
- [ ] **Step 4: 커밋** `test/eval_tutor.py docs/eval-2026-10-20-tutor-guardrail.md` (+ 프롬프트를 고쳤다면 그 파일)
