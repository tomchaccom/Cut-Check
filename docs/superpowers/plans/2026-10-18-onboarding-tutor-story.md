# 온보딩 진단 · 튜터 완화 · 스토리형 문제 · 설계|코드 반반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 튜터가 문제와 직전 대화를 알고 덜 엄격하게 답하되 LLM 판정이 정답 유출을 막고, 04 코딩이 설계|코드 반반이 되며, 생성 문제가 생활 이야기가 되고, 교실 입장 때 진단 8문항이 반 분포를 문제 생성에 넘긴다.

**Architecture:** 튜터는 `api/_tutor.py` 가 맥락(ctx)을 받아 답 → 정규식(형식) → `api/_tutorjudge.py`(유출 판정) 순으로 거른다. 진단 문항·정답표·해석은 순수 함수로 `js/core/onboard.js` 에, 화면은 `sentence.html` 안 섹션 + `js/ui/onboard.js`. 진단 결과는 `s-onboard` 이벤트 → `fold` → 교사 화면이 반 분포를 세어 생성 API 에 보낸다. DB 마이그레이션 없음.

**Tech Stack:** 정적 HTML + ES5 (번들러·ES 모듈 금지), Python 3.12 Vercel 함수, Supabase, Pyodide, node 테스트, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-onboarding-tutor-story-design.md`

## 실행

```bash
bash docs/overnight/2026-10-18-run.sh 02:00   # 02:00 에 시작. 시각을 빼면 바로 시작
```
첫 메시지(스크립트가 넣는다): "docs/superpowers/plans/2026-10-18-onboarding-tutor-story.md 를 Task 0 부터 subagent-driven 으로 실행해."

## Global Constraints

- 브랜치 `tomchaccom/onboarding-tutor-story` 에서만. 로컬 커밋만, **push·PR 금지**, `git add .` 금지.
- 시간 상자 **7시간**. 6시간 30분이 지나면 남은 작업을 하지 않고 Task 9 로 간다. 밀리면 Task 8(CSV) → Task 7 의 hardcode 축 순서로 버린다. **Task 1·2·6 은 버리지 않는다.**
- 작업 하나가 수정 3회 시도 후에도 테스트 실패면 마지막 커밋으로 되돌리고 리포트에 사유를 적고 다음으로.
- 사용량 한도 에러: `teamclaude switch` 로 지금 계정 확인 → `teamclaude switch <다른 계정>` → 같은 단계 다시. 둘 다 한도면 리포트에 "사용량 소진으로 중단 — Task N Step M" 을 적고 멈춘다.
- CLAUDE.md 전부. 특히: 학생 화면 존댓말·`너` 금지(반말은 `js/core/asks.js` 만) · 칭찬·점수·순위·정답률 없음 · 진단 결과를 학생 화면에 띄우지 않음 · `events.make()` 의 `NEVER`(`level`,`score` 등) 이름을 쓰지 않음 · core 층에 `localStorage`/`fetch`/`document`/`window` 금지 · 서버 없이도 수업 흐름이 끝까지 간다 · 조사는 `CC.particle`.
- 새 이벤트는 `js/core/events.js` 의 `T` 에 상수, `fold.js` `apply()` 에 case. 화면에서 type 문자열 직접 쓰지 않음.
- 스토리형은 **AI 생성 미션에만**. `js/core/missions.js` 는 건드리지 않는다.
- 튜터 시간 예산 (스펙의 숫자를 이 계획이 확정): 답 생성 `timeout=10`, 판정 `timeout=5`, 재요청은 남은 시간 ≥ 10초일 때 한 번. **재답은 판정하지 않고, 정규식 통과 + 백틱 코드가 없을 때만** 내보낸다. 그 밖은 `REFUSE['ask_back']`. 전체 예산 26초 (`vercel.json` 한도 30초).
- 판정 호출 실패(예외·타임아웃·JSON 아님) → 답을 내보내지 않고 `REFUSE['ask_back']`, `reasons` 에 `'judge_failed'`.
- 커밋 전 전체 테스트 (8123 정적 서버는 이 워크트리 기준으로 떠 있어야 한다):
  ```bash
  node test/engine.test.js && node test/hangul.test.js && node test/llmguard.test.js && node test/layer.test.js \
    && node test/cards.test.js && node test/smoke.js && node test/robust.js
  for t in test/test_*.py; do env -u PICKLE_API_KEY uv run -q -p 3.12 --with-requirements requirements.txt python $t || break; done
  npx playwright test test/e2e-flow.spec.js
  ```
- 커밋 메시지: 한국어 Conventional Commits, 왜 + 거절한 것 + `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- 문제가 생기면 `docs/트러블슈팅.md` 를 먼저 본다. 해결을 확인한 것만 더한다.

## Review Focus

1. **서버 없는 로컬 모드** — 진단 화면은 뜨지 않고(교실이 없다) 미션이 바로 열린다. 튜터는 "지금은 튜터를 쓸 수 없어요." → Task 6 E2E·Task 2.
2. **예전 `s-tutor` 기록** (`kind: syntax/solution_request/guarded`, 새 칸 없음) — 교사 서랍·CSV 가 깨지지 않는다 → Task 2·8 테스트.
3. **진단을 건너뛴 학생 / 같은 학생이 진단을 두 번 낸 경우** — 분포에서 빠지거나 마지막 것만 센다 → Task 6 `fold` 테스트.
4. **폰 폭 420px** — 04 반반이 위아래로 쌓이고 가로 스크롤 없음 (smoke 의 가로 스크롤 검사) → Task 4.
5. **튜터 질문에 미션 자료가 그대로 든 경우** ("떡볶이,우동 개수 세는 코드") — 판정이 막고 되묻는다 → Task 1 테스트 + Task 3 리플레이.

---

### Task 0: 준비

**Files:** Create `docs/overnight/2026-10-18-report.md`

- [ ] **Step 1:** `git status` 가 깨끗하고 브랜치가 `tomchaccom/onboarding-tutor-story` 인지 확인. 아니면 멈추고 리포트.
- [ ] **Step 2:** 8123 서버가 이 워크트리 기준인지 확인 (`curl -s localhost:8123/sentence.html | grep -c step4` ≥ 1). 아니면 `python3 -m http.server 8123 &`.
- [ ] **Step 3:** 전체 테스트를 돌려 기준선을 기록. 기준선에서 이미 실패하는 테스트는 리포트에 적고, 이후 "새로 깨뜨리지 않았는가" 로 판단한다.
- [ ] **Step 4:** 리포트 뼈대 작성 후 커밋.

```markdown
# 밤샘 작업 리포트 — 2026-10-18 (온보딩·튜터·스토리)
브랜치 `tomchaccom/onboarding-tutor-story` · 시작 커밋 <해시> · 계정 <teamclaude switch 결과>
## 기준선 테스트
## 작업별 결과   (Task · 커밋 · 한 줄 · 못 한 것)
## 튜터 리플레이 (Task 3)
## 생성 미션 원문 3개 (Task 5)
## 사람이 판단할 것
```

---

### Task 1: 튜터 백엔드 — 맥락 · 되묻기 · 판정

**Files:**
- Modify: `api/_tutor.py` (전체), `api/_tutorguard.py` (`MAX`, `problems`), `api/tutor.py:40-48`
- Create: `api/_tutorjudge.py`
- Test: `test/test_tutorguard.py` (흐름·HTTP 절 교체, 뺀 규칙 케이스 정리)

**Interfaces:**
- Produces:
  - `ask(question: str, ctx: dict, call_llm, now=time.monotonic) -> dict` — `now()` 는 **시작에 한 번, 재요청 여부를 정할 때 한 번만** 부른다 (테스트가 이 순서에 기댄다).
    `ctx = {'mission': {'title','itemName','items':[str],'situation','brief','inputs':[{'name','v'}]}, 'code': str, 'define': str, 'design': [str], 'last_output': str, 'last_error': str, 'history': [{'q': str, 'a': str}]}` (빠진 칸은 빈 값)
    반환 `{'kind': 'answer'|'ask_back'|'off_topic', 'answer': str, 'refused': bool, 'reasons': [str], 'retried': bool, 'judged': bool}`
  - `REFUSE = {'ask_back': '지금 코드를 실행하면 무엇이 나오고, 원하는 결과와 어디가 달라요?', 'off_topic': '파이썬 질문만 받을 수 있어요. 코드에서 막힌 곳을 물어봐 주세요.'}` — 이름과 `키: '문장'` 모양 유지 (`test/llmguard.test.js:90` 이 정규식으로 읽는다).
  - `judge(answer: str, ctx: dict, call_llm, timeout: float) -> list[str]` (`_tutorjudge.py`) — 빈 목록이면 통과, `['leak: <why>']` 면 유출. JSON 아님·항목 빠짐은 `ValueError`.
  - `problems(answer: str, kind: str = 'answer') -> list[str]` (`_tutorguard.py`) — 형식만.
  - HTTP 응답은 `ask()` 반환 그대로.

- [ ] **Step 1: 실패하는 테스트 작성** (`test/test_tutorguard.py` 의 `fake()` 를 그대로 쓰되, 판정 호출도 같은 `call_llm` 으로 오므로 응답을 순서대로 준다)

```python
CTX = {'mission': {'title': '메뉴 묶기', 'itemName': '메뉴', 'items': ['떡볶이', '우동', '김밥'],
                   'situation': '매점 주문을 정리해야 해요.', 'brief': '메뉴마다 몇 번 나왔는지 알려 주세요.',
                   'inputs': [{'name': '자료 1', 'v': '떡볶이,우동,김밥,우동'}]},
       'code': 'data = "떡볶이,우동,김밥,우동"\nprint(data)', 'define': '', 'design': ['나누기', '세기'],
       'last_output': '떡볶이,우동,김밥,우동', 'last_error': '', 'history': [{'q': 'split은 뭐고', 'a': '`"a,b".split(",")` 처럼 나눠요.'}]}
OK = {'leak': False, 'why': ''}
LEAK = {'leak': True, 'why': '이 자료로 바로 세는 코드'}

# 맥락이 프롬프트에 들어간다
llm = fake({'kind': 'answer', 'answer': '딕셔너리에 없던 키를 넣으면 새로 생겨요. 예: `d["a"] = 1`'}, OK)
r = ask('어떻게 써먹어요?', CTX, llm)
user = llm.calls[0][-1]['content']
t('미션 brief·history·마지막 출력이 프롬프트에', all(s in user for s in ['메뉴마다 몇 번', 'split은 뭐고', '떡볶이,우동,김밥,우동']), user)
t('통과하면 답한다', r['kind'] == 'answer' and not r['refused'] and r['judged'] and r['reasons'] == [], r)

# 판정이 유출로 잡으면 이유를 붙여 재요청, 재답에 백틱이 없으면 내보낸다
llm = fake({'kind': 'answer', 'answer': '`for m in data.split(","): d[m] = d.get(m, 0) + 1` 이렇게요.'}, LEAK,
           {'kind': 'answer', 'answer': '딕셔너리는 키마다 값을 하나 가져요. 같은 키에 값을 다시 넣으면 바뀌어요.'})
r = ask('메뉴 세는 코드 알려줘', CTX, llm)
t('유출 → 재요청 → 재답', len(llm.calls) == 3 and '이 자료로 바로 세는 코드' in llm.calls[2][-1]['content'] and r['retried'] and r['kind'] == 'answer', r)

# 재답에 백틱 코드가 있으면 되묻기 고정 문장
llm = fake({'kind': 'answer', 'answer': '`x`'}, LEAK, {'kind': 'answer', 'answer': '`d[m] += 1` 쓰세요.'})
r = ask('코드 줘', CTX, llm)
t('재답에 코드 → ask_back', r == {**r, 'kind': 'ask_back', 'answer': REFUSE['ask_back'], 'refused': True}, r)

# 판정 실패는 막는다
llm = fake({'kind': 'answer', 'answer': '문자열은 따옴표로 감싼 글자예요.'}, '판정 아님')
r = ask('문자열이 뭐고', CTX, llm)
t('판정 실패 → ask_back', r['kind'] == 'ask_back' and 'judge_failed' in r['reasons'], r)

# LLM 이 직접 쓴 되묻기는 형식 검사만 거쳐 그대로
llm = fake({'kind': 'ask_back', 'answer': '지금 print(data) 결과는 글자 한 줄인가요, 목록인가요?'})
r = ask('모르겠어요', CTX, llm)
t('되묻기는 판정 없이', r['kind'] == 'ask_back' and r['answer'].endswith('?') and not r['judged'] and len(llm.calls) == 1, r)

# 시간이 모자라면 재요청하지 않는다
clock = iter([0, 17])
llm = fake({'kind': 'answer', 'answer': '`x`'}, LEAK)
r = ask('코드 줘', CTX, llm, now=lambda: next(clock))
t('남은 시간 < 10초면 재요청 없음', len(llm.calls) == 2 and r['kind'] == 'ask_back' and not r['retried'], r)

r = ask('점심 뭐 먹어?', CTX, fake({'kind': 'off_topic', 'answer': ''}))
t('범위 밖', r['answer'] == REFUSE['off_topic'] and r['refused'], r)
```

형식 검사(`problems`) 케이스: 막음 — 300자 초과, 백틱 예시 3개, 두 줄 코드 예시, `;`, 칭찬, `너`, 반말, 한자. `kind='ask_back'` 이면 `?` 로 안 끝나거나 80자 초과도 막음. 통과 — 미션 단어가 든 설명("메뉴마다 세려면 딕셔너리가 쓰여요")은 **이제 통과**(판정 몫), 학생 코드 줄 인용("3번째 줄 `print(data)` 는 글자 한 줄을 보여줘요")도 통과. 기존 `[막는 것]` 목록에서 미션 단어·학생 코드·`data`·`METHOD` 케이스는 지운다.

HTTP 절: `post()` 에 `ctx` 모양 본문(`{'question','mission':{...,'situation','brief','inputs'},'code','define','design','lastOutput','lastError','history'}`)을 보내 400/502 만 나는지, `history` 가 리스트가 아니거나 6개 이상이어도 죽지 않는지(앞 3개만 씀).

- [ ] **Step 2:** `env -u PICKLE_API_KEY uv run -q -p 3.12 --with-requirements requirements.txt python test/test_tutorguard.py` → 새 케이스 FAIL.
- [ ] **Step 3: 구현**
  - `_tutorguard.py`: `MAX = 300`. `problems(answer, kind='answer')` 에서 미션 단어·학생 코드·`data`·`METHOD` 검사를 지운다(시그니처에서 `mission`, `code` 제거). 백틱 예시 `lines` 상한 2. `kind == 'ask_back'` 이면 `?` 끝·80자 이하 추가. 모듈 docstring 을 "형식만 본다, 유출은 `_tutorjudge.py`" 로 고친다.
  - `_tutorjudge.py`: `api/_review.py` 의 `review()` 와 같은 모양. SCHEMA `{leak: bool, why: str}`. SYSTEM 핵심 문장: "학생 코드에 이 답을 그대로 옮기거나 답의 단계를 따라 하면 이 미션의 요청이 풀리는가? 미션과 다른 값으로 든 한 줄 문법 예시, 개념 설명, 학생 코드에서 틀린 줄의 위치를 짚는 것은 유출이 아니다. 풀이 단계 순서(먼저 나누고 그다음 세기 같은)를 알려주는 것은 유출이다." 입력은 답 + 미션(brief·situation·inputs) + 학생 코드.
  - `_tutor.py`: SCHEMA kind enum `['answer','ask_back','off_topic']`, `answer.maxLength = MAX`. SYSTEM 을 스펙 1-2 대로 다시 쓴다(중1, 존댓말, 개념·틀린 위치·다른 자료 예시까지, 풀 방법·이 자료로 동작하는 코드 금지, 막힐 땐 학생이 다음에 확인할 것 하나를 `?` 로 묻는 `ask_back`, 칭찬 없음, "자료·설계는 이해하라고 주는 것이지 답에 쓰라는 게 아니다"). user 메시지는 `ctx` 전체 JSON + `question`, `history` 는 assistant/user 메시지로 앞에 펼친다. 흐름은 Global Constraints 의 시간 예산 그대로.
  - `tutor.py`: 본문에서 `situation, brief`(각 200자), `inputs`(≤5, 각 `v` 200자), `define`(200), `design`(≤12, 각 40), `lastOutput`/`lastError`(각 500), `history`(리스트일 때 앞 3개, `q`/`a` 각 300) 를 잘라 `ctx` 로. `ask(q, ctx, pickle_llm)`. stderr 로그에 `reasons` 포함.
- [ ] **Step 4:** Step 2 명령 → PASS. `node test/llmguard.test.js` → PASS (새 REFUSE 문장 규칙).
- [ ] **Step 5:** 전체 테스트 → 커밋 `fix: 튜터가 문제와 직전 대화를 알고 되묻게, 정답 유출은 LLM 판정으로`.

---

### Task 2: 튜터 화면 · 로그 칸

**Files:** Modify `js/ui/tutor.js`, `js/ui/sentence.js:36-46` (`context()`), `js/core/events.js:65` (주석), `js/core/fold.js:135`, `js/ui/teacher.js:369-380` (서랍), Test `test/layer.test.js`, `test/robust.js`

**Interfaces:**
- Consumes: Task 1 HTTP 응답 `{kind, answer, refused, reasons, retried, judged}`.
- Produces: `s-tutor` 이벤트 `{ question, answer, kind, refused, step, code, history_len, reasons, retried, judged }`; fold `sTutor[]` 항목에 `reasons`, `step` 추가(없으면 `[]`, `null`).

- [ ] **Step 1: 실패하는 테스트** (`test/layer.test.js`, 기존 fold 테스트 옆)
  - 새 칸이 든 `s-tutor` 를 접으면 `sTutor[0].reasons` 가 그대로, 예전 기록(`kind:'syntax'`, 칸 없음)을 접으면 `reasons: []`, `step: null`.
  - `CC.events.make(T.S_TUTOR, {... history_len: 2 ...})` 가 `NEVER` 에 안 걸린다.
- [ ] **Step 2:** `node test/layer.test.js` → FAIL.
- [ ] **Step 3: 구현**
  - `tutor.js`: 모듈 변수 `history = []`(같은 미션 동안, `CC.tutor.reset()` 로 비움 — `loadMission` 에서 부른다). 보낼 때 `history.slice(-3)` 를 `{q, a}` 로. 응답 받으면 push. `rec` 에 위 칸 전부. 모듈 주석의 "문법만 답한다" 를 고친다.
  - `sentence.js` `context()`: `situation, brief, inputs(M.inputs 의 name·v), define: state.defineChoice, design: picked().map(c => c.label + (c.detail ? ' ' + c.detail : '')), lastOutput/lastError: 마지막 코드 실행 결과(실행 함수가 이미 갖고 있는 값을 모듈 변수 `lastRun` 에 남긴다), step: 4`.
  - `fold.js` `s-tutor` case 에 `reasons: e.reasons || [], step: e.step == null ? null : e.step`.
  - `teacher.js` 서랍: 거절이면 `' · 튜터가 되물었어요'`(`kind==='ask_back'`) / `' · 튜터가 답하지 않았어요'`(예전 기록). `reasons` 가 있으면 작은 회색 줄로 그대로.
  - `robust.js` 튜터 경로: `reasons` 에 `<script>` 가 든 기록이 교사 서랍에 텍스트로만 보이는지 한 줄 추가.
- [ ] **Step 4:** layer·robust·smoke → PASS.
- [ ] **Step 5:** 전체 테스트 → 커밋 `feat: 튜터에 미션·설계·마지막 실행·직전 3턴을 넘기고 막힌 이유를 기록`.

---

### Task 3: 튜터 리플레이 (실제 LLM, 키가 있을 때만)

**Files:** Create `test/eval_tutor.py`. 입력 `test/fixtures/tutor_real_questions.json` (이미 있음: 실제 질문 25건, 학생은 S1·S2, 각 항목 `{student, question, old_kind, old_answer, mission:{title,itemName,situation,brief,inputs}, code, last_output, last_error}`).

- [ ] **Step 1:** `PICKLE_API_KEY` 가 없으면(`.env` 도 없음) 이 Task 를 건너뛰고 리포트에 "키 없음 — 리플레이 못 함" 을 적는다.
- [ ] **Step 2:** `eval_tutor.py`: 학생별로 순서대로 `ask()` 를 부르며 `history` 를 직전 3턴으로 채운다(새 답 기준). 결과를 표로 `docs/overnight/2026-10-18-tutor-replay.md` 에: `질문 | 예전 kind | 새 kind | 새 답 | reasons`. 끝에 집계: 거절(ask_back·off_topic) 비율 예전 19/25 → 새 n/25, `judge_failed` 수.
- [ ] **Step 3:** 사람이 읽을 판단: 새 답 중 **이 미션 자료로 동작하는 코드나 풀이 순서**가 보이면 리포트 "사람이 판단할 것" 에 원문을 붙인다. 그런 답이 3건 이상이면 `_tutorjudge.py` SYSTEM 을 고쳐 한 번 더 돌린다(최대 2회). **숫자를 맞추려고 정규식을 다시 조이지 않는다.**
- [ ] **Step 4:** 커밋 `test: 실제 학생 질문 25건으로 튜터 리플레이`.

---

### Task 4: 단계 탭 이동 · 04 반반 · 문제 설명

**Files:** Modify `sentence.html:64-70` (탭), `sentence.html:129-137` (04 머리), `js/ui/sentence.js:155-172` (`showStep`), `js/ui/sentence.js:373-380` (설계 요약 렌더), `sentence.css` (끝에 클래스), Test `test/e2e-flow.spec.js`

**Interfaces:** 기존 id 유지: `#design-summary`, `#design-define`, `#design-steps`, `#code-editor`, `#run-all`, `#run-code`, `#back-method`, `#code-table`, `#code-result`. 새 id: `#step4-brief`(접는 문제 설명), `#code-split`(반반 그리드), `#design-side`(왼쪽 설계 목록).

- [ ] **Step 1: 실패하는 E2E** (`test/e2e-flow.spec.js` 기존 흐름에 덧붙임)
  - 04 에 도착하면 `#step4-brief` 안에 미션 brief 텍스트가 보인다.
  - `#design-side li` 개수 = 03 에서 담은 카드 수, 순서 같음.
  - 탭 `#steps-nav button[data-step="2"]` 클릭 → `#step2` 가 `.active`. 이어서 `button[data-step="5"]` 는 `disabled`.
  - 뷰포트 420px 에서 `#design-side` 의 `top` < `#code-editor` 의 `top` (위아래로 쌓임).
- [ ] **Step 2:** `npx playwright test test/e2e-flow.spec.js` → FAIL.
- [ ] **Step 3: 구현**
  - 탭 `<span>` → `<button type="button" data-step>`. `showStep` 이 `done` 탭만 `disabled=false`, 나머지 `disabled`. 클릭은 `showStep(n)` — 기존 뒤로가기 버튼과 같은 길이라 수정 기록(`s-redefine`/`s-remethod`)은 기존 제출 핸들러가 그대로 남긴다. 버튼 모양은 지금 `span` 스타일을 그대로 쓰고 `disabled` 는 `cursor:default`.
  - 04: 제목 아래 `<details id="step4-brief" open><summary>받은 요청</summary>` 안에 situation·brief. 그 아래 `#code-split` = `grid-template-columns: 1fr 1fr`, 왼쪽 `#design-summary`(성공 조건 알약) + `<ol id="design-side">` (카드 순서, 읽기 전용), 오른쪽에 자료 선택~결과 표~판정까지 기존 마크업을 옮긴다. `@media (max-width: 720px)` 에서 한 줄. 폴더 UI 토큰만 쓴다 (노랑은 설계 줄에만).
  - 튜터 버튼은 오른쪽 열 머리.
- [ ] **Step 4:** E2E·smoke(3폭×2테마 가로 스크롤) → PASS.
- [ ] **Step 5:** 전체 테스트 → 커밋 `feat: 04 코딩을 설계|코드 반반으로, 지난 단계 탭으로 돌아가기, 받은 요청을 계속 보이게`.

---

### Task 5: 스토리형 생성 (생성 미션만)

**Files:** Modify `api/_schema.py:173` (`_LIMIT`), `api/_schema.py:247-253` (`title`/`brief`/`situation` description), `api/_generate.py:33-46` (`SYSTEM`), `api/_review.py:17-22,24-36` (`ITEMS['noAnswer']`, `SYSTEM`), Test `test/test_missionguard.py`, `test/test_review.py`

- [ ] **Step 1: 실패하는 테스트**
  - `test_missionguard.py`: situation 80자짜리 이야기("엄마가 명성이 번호를 물어봤어요. 내 연락처에는 있는데 엄마 폰에는 없어요.")가 길이로 걸리지 않는다. 91자는 걸린다. brief 에 방법 단어가 든 것("딕셔너리에서 명성 키를 찾아 주세요")은 걸린다 — `api/_schema.py:146` `_brief_problem` 의 정규식에 `딕셔너리|키를|값을|리스트` 를 더한다.
  - `test_review.py`: 가짜 LLM 이 받는 SYSTEM 에 "이야기 속에 푸는 방법" 문구가 들어 있다.
- [ ] **Step 2:** 두 파일 실행 → FAIL.
- [ ] **Step 3: 구현**
  - `_LIMIT`: `situation` 30 → **90**, `brief` 40 → **60**.
  - `situation` description: "중학생이 겪는 생활 장면(가족·친구·학교·매점·단톡방). 인물 이름 하나 이상. 두 문장까지, 존댓말 '~요.'". `brief`: "그 장면에서 무엇을 알아내야 하는지 한 문장(~해 주세요). 함수·자료구조·단계 이름(딕셔너리·키·값·나누기·세기·리스트) 금지. itemName 은 그대로 쓴다".
  - `SYSTEM`: "문제는 일부러 모호하게" 는 유지하고 "상황은 구체적인 이야기로, 방법은 쓰지 않는다" 를 더한다. 예시 한 쌍(좋은 예: 명성이 번호 이야기 → "엄마한테 명성이 번호를 알려 주세요" / 나쁜 예: "딕셔너리에서 명성 키를 찾아 값을 추출해 주세요").
  - `_review.py` `noAnswer`: "요청·상황 문장(이야기 포함)에 답이나 푸는 방법이 드러나지 않았나".
- [ ] **Step 4:** 테스트 PASS. `uv run … python test/test_pipeline_parity.py`, `test_generate.py` PASS.
- [ ] **Step 5:** 키가 있으면 `test/eval_generate.py` 를 한 번 돌려 생성 미션 원문 3개를 리포트에 붙인다(숫자보다 원문). 없으면 "키 없음".
- [ ] **Step 6:** 전체 테스트 → 커밋 `feat: 생성 미션의 상황·요청을 생활 이야기로 — 방법 단어는 계속 막는다`.

---

### Task 6: 진단 8문항

**Files:**
- Create: `js/core/onboard.js`, `js/ui/onboard.js`
- Modify: `js/core/events.js` (`T.S_ONBOARD`), `js/core/fold.js` (blank `onboard: null`, case), `sentence.html` (섹션 + 스크립트 2줄), `js/ui/sentence.js:824` (`openRoom`)
- Test: `test/layer.test.js`, `test/e2e-flow.spec.js`

스펙 편차 (내가 정함): 새 `onboard.html` 대신 **`sentence.html` 안 섹션** `#onboard-view`. Supabase 초기화·`currentClassroomId`·`pushEvent` 를 그대로 쓰고 smoke 대상 화면이 늘지 않는다.

**Interfaces:**
- Produces:
  - `CC.onboard.QUESTIONS: [{id: 'q1'..'q8', code: string, ask: string, options: [string]}]` — 마지막 보기는 항상 `'모르겠어요'`.
  - `CC.onboard.stage(answers: [{q: string, pick: number}]) -> {stage: 'base'|'combine'|'ready', hardcode: boolean}` — 정답표 `KEY` 는 이 파일 안 비공개 변수.
  - `T.S_ONBOARD = 's-onboard'`, payload `{ answers: [{q, pick}], skipped: boolean }`.
  - fold: `s.onboard = { stage, hardcode, skipped, t }` (마지막 이벤트가 이긴다; `skipped` 면 `stage: null`).
- Consumes: `CC.sb.getMyEvents(classroomId)`, `CC.sb.pushEvent(classroomId, null, ev)`.

- [ ] **Step 1: 실패하는 테스트** (`test/layer.test.js`)
  - `QUESTIONS.length === 8`, 모든 문항 마지막 보기 `'모르겠어요'`, 모든 `ask` 가 `?` 로 끝나고 80자 이하.
  - `stage`: 1~3 중 하나라도 오답/모르겠어요 → `base`; 1~6 맞고 7 오답 → `combine`; 1~7 맞음 → `ready`; 8 오답/모르겠어요 → `hardcode: true`.
  - fold: `s-onboard` 두 번이면 마지막 것, `skipped:true` 면 `stage: null`.
  - core 경계 검사 목록(`test/layer.test.js:160`, 파일 이름을 직접 나열한다)에 `onboard.js` 를 더한다.
- [ ] **Step 2:** `node test/layer.test.js` → FAIL.
- [ ] **Step 3: 구현**
  - 문항은 스펙 4절 표 그대로(문자열 · split · 인덱스 · for 횟수 · if · 딕셔너리 꺼내기 `d["명성"]` · 딕셔너리로 개수 세는 5줄 코드의 출력 · 코드 A `print(2+3+5)` / 코드 B `print(sum(map(int, data.split(","))))` 에서 data 가 `"1,1"` 일 때 둘의 출력). 보기 문장은 빌더가 쓴다.
  - `#onboard-view`: 한 화면에 한 문항, 코드 블록 + 보기 버튼 + "이전"(뒤로). 맞고 틀림은 보이지 않는다. 끝에 "고마워요. 이제 미션을 볼 수 있어요." 버튼. 첫 화면에 "건너뛰기"(→ `skipped: true`).
  - `openRoom(r)`: `CC.sb.active()` 일 때만 `getMyEvents(r.id)` 에 `type === CC.events.T.S_ONBOARD` 가 없으면 `#onboard-view` 를 띄우고 미션 목록은 끝난 뒤에. 로컬 모드는 검사하지 않는다.
- [ ] **Step 4:** layer → PASS. E2E(로컬 모드)에서 진단이 뜨지 않고 미션이 열리는 기존 흐름이 그대로 PASS. smoke(존댓말·금지어) PASS.
- [ ] **Step 5:** 전체 테스트 → 커밋 `feat: 교실 입장 때 파이썬 진단 8문항 — 결과는 학생에게 보이지 않는다`.

---

### Task 7: 진단 분포 → 문제 생성

**Files:** Modify `teacher.html:113-116,463-478`, `api/generate-mission.py:35-48`, `api/_review.py:66` (`make_mission`), `api/_generate.py:408-415` (`generate`), Test `test/test_generate.py`, `test/layer.test.js`

**Interfaces:**
- Produces:
  - `CC.onboard.spread(students: [foldedStudent]) -> {base: int, combine: int, ready: int, hardcode: int, none: int}` (`js/core/onboard.js`) — `onboard` 없거나 `skipped` 면 `none`.
  - 생성 요청 본문 `{lesson, keyPoint, difficulty: 'easy'|'medium'|'hard', stages: <spread 결과>}`.
  - `make_mission(lesson, key_point, call_llm=pickle_llm, level=None)`, `generate(lesson, key_point, call_llm=pickle_llm, feedback=None, t0=None, level=None)` — `level = {'difficulty': str, 'stages': dict}` 또는 `None`.
  - `level_note(level) -> str` (`_generate.py`) — ask 에 붙일 문장. `None` 이면 `''`.
- [ ] **Step 1: 실패하는 테스트**
  - `layer.test.js`: `spread` 가 stage·hardcode·none 을 센다.
  - `test_generate.py`: `level={'difficulty':'easy','stages':{'base':5,'combine':1,'ready':0,'hardcode':4,'none':2}}` 로 `generate` 를 부르면 가짜 LLM 이 받은 user 메시지에 `level_note` 가 든다. `level_note`: base 가 가장 많으면 "한 가지 개념만", combine 이면 "두 개념을 엮는", hardcode 가 응답자 절반 이상이면 "반례는 항목 개수를 바꾸는 것으로" 가 들어간다. `None` 이면 ask 가 지금과 같다.
  - HTTP: `difficulty` 가 목록에 없는 값이거나 `stages` 가 dict 가 아니어도 400 이 아니라 무시하고 진행.
- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3: 구현**
  - `generate-mission.py`: `difficulty` 를 `('easy','medium','hard')` 안에서만, `stages` 는 정수 값만 걸러 `level` 로 만들어 `make_mission(..., level=level)`.
  - `make_mission` → `generate(..., level=level)` 로 넘기고, `generate` 의 `ask` 끝에 `level_note(level)`.
  - `teacher.html`: 생성 칸 위에 `#gen-spread` 한 줄 "이 반 진단: 기초 n · 조합 전 n · 조합 가능 n · 안 함 n" (`CC.classroom.students` 로 `spread`). 개인 이름·순서 없음. 요청 본문에 `stages` 추가. 기초가 가장 많으면 `#gen-diff` 기본값을 `easy` 로(교사가 바꿀 수 있다). `teacher.html` 에 `js/core/onboard.js` 스크립트 추가.
- [ ] **Step 4:** PASS 확인.
- [ ] **Step 5:** 전체 테스트 → 커밋 `feat: 반의 진단 분포를 문제 생성에 넘긴다 — 개인 결과는 교사에게도 띄우지 않는다`.

---

### Task 8: 튜터 기록 CSV

**Files:** Create `js/core/csv.js`, Modify `teacher.html` (버튼·스크립트), `js/ui/teacher.js`, Test `test/layer.test.js`

**Interfaces:**
- Produces: `CC.csv.tutorRows(students) -> [[string]]` (헤더 포함: `시각, 학생, 미션, 단계, 분류, 거절, 질문, 답, 막힌 이유, 다시 요청`), `CC.csv.toCsv(rows) -> string` (BOM `﻿` 시작, 셀에 `"`·`,`·줄바꿈 있으면 `"` 로 감싸고 `""` 로 이스케이프, 줄 끝 `\r\n`).
- [ ] **Step 1: 실패하는 테스트**: core 경계 목록(`test/layer.test.js:160`)에 `csv.js` 추가. 질문에 `,` 와 `"` 와 줄바꿈이 든 기록 → 셀이 올바르게 감싸짐; 예전 기록(`reasons` 없음)도 빈 칸으로 한 줄; 학생 2명 기록이 시각순.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** 교사 화면 "튜터 기록 내려받기" `<button>` → `Blob` + `<a download="tutor-<교실이름>-<YYYYMMDD>.csv">`. 미션 이름은 학생 기록의 `mid` 로 이미 가진 미션 목록에서 찾는다(없으면 `mid`).
- [ ] **Step 4:** layer·smoke PASS.
- [ ] **Step 5:** 전체 테스트 → 커밋 `feat: 교사 화면에서 튜터 기록을 CSV 로 — 수업 개선용`.

---

### Task 9: 마무리

- [ ] **Step 1:** 전체 테스트 + E2E. 결과를 리포트 "기준선 테스트" 옆에 붙인다.
- [ ] **Step 2:** `node test/shots.js` 가 있으면 04 반반(넓은 폭·420px), 진단 첫 문항, 교사 생성 칸 캡처를 `docs/overnight/2026-10-18-shots/` 에.
- [ ] **Step 3:** 리포트 완성: 작업별 결과, 못 한 것과 이유, 튜터 리플레이 집계, "사람이 판단할 것"(판정이 놓친 의심 답 원문, 진단 문항 문장, 스토리 원문 3개).
- [ ] **Step 4:** 커밋 `docs: 밤샘 리포트 — 온보딩·튜터·스토리`. push 하지 않는다.
