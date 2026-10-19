# 단계별 미션 생성 + 학생 코드 사실 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 강사가 개념 확인 → 스토리 예시 고르기 → 만들기 → 확인 네 단계로 미션을 만들고(정답은 모범 답안을 강사 브라우저에서 실행해 얻음), 강사 서랍에는 학생 코드의 사실(반례 출력·개념 사용)이 보인다.

**Architecture:** 서버(`api/mission-steps.py` + `api/_steps.py`)는 LLM 만 부르고 코드를 실행하지 않는다. 모범 답안·따로 풀기 코드·학생 코드는 브라우저 Pyodide worker(`js/ui/pyrun.js`, 학생 화면 실행기를 뽑아낸 것)에서 돈다. 개념 표·자료 줄·검사 규칙은 core 순수 모듈 `js/core/codemission.js` 한 곳, 학생 코드 사실 판단은 `js/core/facts.js` 한 곳.

**Tech Stack:** 정적 HTML + ES5(번들러·ES 모듈 없음), Pyodide 0.24.1 worker, Python 3 Vercel 함수(표준 라이브러리 + 기존 requirements), Supabase, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-stepwise-generation-design.md`, `docs/superpowers/specs/2026-10-19-student-code-facts-design.md` — 둘 다 읽는다. 스펙이 계획보다 우선한다.

**Base:** 브랜치 `tomchaccom/level-test`(레벨 테스트 + 설계 문서 커밋 포함) 위에 새 브랜치 `tomchaccom/stepwise-gen` 을 만든다.

## Global Constraints

- CLAUDE.md 전부. 특히: 층 경계(core 는 `document`·`fetch`·`localStorage`·`window` 모름 — `test/layer.test.js`), ES 모듈·번들러 금지, 새 이벤트는 `T` 상수 + `fold.js` case, NEVER 필드(`correct`,`score`,`rank`,`duration`,`accuracy`,`level`,`streak`) 금지.
- 학생 문구: 존댓말 `~해요`, `너` 금지, 질문은 `?`로 끝나고 80자 이하, 조사는 `CC.particle`/`CC.josa`, 판정·칭찬 금지, 방법 지시 금지.
- 학생 화면에 모범 답안·정답 값·하드코딩/개념 사실을 절대 띄우지 않는다. 강사 화면에 점수·정답률·순위·집계 숫자를 만들지 않는다.
- **서버는 AI 가 쓴 코드를 실행하지 않는다.** 저장할 때 `solution` 을 뗀다.
- 모델: 가벼운 단계(`concept`·`examples`·`solve`) = 환경변수 `LLM_MODEL_LIGHT` 기본 `openai/gpt-5.4-mini`; `build` = 기존 `LLM_MODEL` 기본 `openai/gpt-5.4`. 다시 만들기 최대 2번.
- 단위 시험은 전부 가짜 LLM. 실제 gateway 호출은 Task 8 에서만, 예산 $3.
- 개념 키 8개(정확히): `split` 문자열 나누기 · `index` 리스트·인덱스 · `if` 조건문 if · `for` 반복문 for · `while` 반복문 while · `dict` 딕셔너리 · `set` 집합 · `func` 함수.
- 반례 축은 `count`(개수 변화) · `empty`(빈 결과) 두 개만. CLAUDE.md 를 고치지 않는다.
- 아홉 시험 + e2e 통과 후 커밋, `git add .` 금지(경로를 적어 add), bare `git stash` 금지.
- 운영 반영(merge·push·Supabase 마이그레이션·Vercel 설정) 금지 — 브랜치에서 끝낸다. 운영 비밀번호·키를 저장소·문서·로그에 쓰지 않는다.
- 8123 포트를 다른 작업이 쓰고 있으면 `python3 -m http.server 8131` + `CC_BASE=http://localhost:8131`.

## Review Focus

1. 리터럴 자료(`[1500, 800]`, `{'주급': 3000}`, `''`)를 학생이 "자료 바꾸기"로 반례로 바꿔 실행하면 반드시 그 자료로 돈다(자료 1 줄이 덮어쓰지 않음) — Task 1 e2e.
2. 모범 답안이 무한 반복이면 강사 화면은 5초 뒤 "시간 초과" 이유로 다시 만들기에 들어가고 탭이 멈추지 않는다 — Task 2·5 시험.
3. 강사가 4단계에서 자료를 고치면 정답·외우기 함정 문장이 새 값으로 바뀌고, 반례가 자료 1과 같아지면 검사 이유가 보인다 — Task 5 e2e.
4. 저장된 미션 JSON 에 `solution`·`wish`(강사 자유 입력)가 없다 — Task 5 e2e.
5. 학생 코드 출력에 `<img onerror>`·`</script>` 가 있어도 강사 서랍에서 글자로만 보인다 — Task 10 robust.

---

### Task 1: core 자료 줄 · 개념 표 · 검사 함수 + 학생 화면이 새 꼴 미션을 돈다

**Files:**
- Create: `js/core/codemission.js`
- Modify: `js/core/cards.js` (`forMission`: `m.cards` 분기; `fixedList` 는 `kind==='code'` 면 `null`)
- Modify: `js/ui/sentence.js` (자료 줄 418·420·423–425·436·467–469 → `CC.codemission.dataLine`/`DATA_RE`; 튜터 context 41 근처: `kind==='code'` 면 `items: []`)
- Modify: `sentence.html`, `teacher.html` (`<script src="js/core/codemission.js">` 를 `cards.js` 앞에)
- Modify: `test/layer.test.js` (core 목록에 `codemission.js` 추가 + 시험), `test/e2e-flow.spec.js`

**Interfaces:**
- Produces (`CC.codemission`):
  - `CONCEPTS`: `[{id, label, needs: [string]}]` 8개, 순서는 Global Constraints 순. `needs` 는 ast 노드 이름 또는 `call:<이름>`: split `['call:split']`, index `['Subscript']`, if `['If','IfExp']`, for `['For','ListComp','SetComp','DictComp','GeneratorExp']`, while `['While']`, dict `['Dict','DictComp','call:dict']`, set `['Set','SetComp','call:set']`, func `['FunctionDef','Lambda']`.
  - `concept(id) → {id,label,needs} | null`
  - `uses(conceptId, usesList) → boolean` (usesList 가 `null` 이면 `true` — 판단 안 함)
  - `USES_PY`: 파이썬 소스 문자열. 앞에 `_src = <JSON 문자열>` 한 줄을 붙여 실행하면 `ast.walk` 노드 클래스 이름 + `call:<함수/메서드 이름>` 의 정렬된 목록을 JSON 한 줄로 print. 구문 에러면 `null` 을 print.
  - `usesCode(src) → string` (`'_src = ' + JSON.stringify(src) + '\n' + USES_PY`)
  - `DATA_RE` = `/^data = .*$/m`
  - `dataLine(m, v) → string` — `m.kind === 'code'` 면 `'data = ' + v`, 아니면 `'data = ' + JSON.stringify(String(v))`
  - `solcheck(draft, runs, usesList) → [{code, msg}]` — draft `{concept, brief, inputs:[{name, v, counter}]}`, runs `[{output, error}]`(inputs 와 같은 순서), code 값은 정확히 `'error'|'timeout'|'concept'|'counter-same'|'shape'|'count-not-number'`. 규칙: 에러(타임아웃 문구 `CC.pyerr.TIMEOUT` 이면 `timeout`) / 개념 노드 없음 / 마지막(반례) 출력 trim == 첫 출력 trim / 출력 trim 이 비었거나 줄바꿈 포함이거나 200자 초과 / brief 에 `몇` 이 있는데 출력이 숫자(`^-?\d+(\.\d+)?$`)가 아님. msg 는 한국어 한 문장(강사 화면과 다시 만들기 요청에 그대로 쓴다).
  - `hardcodeOption(name, value) → {v, trap:'hardcode'}` — v = `name + '의 답과 같은 ' + value + CC.particle(value,'이/가') + ' 나오면 성공'`(빈 값이면 `name + '처럼 빈 결과가 나오면 성공'`). `CC.particle` 이 없으면(노드 시험) hangul.js 를 먼저 require.
- Produces (`CC.cards.forMission(m)`): `m.cards` 가 배열이면 `m.cards.map((c,i) => ({op:'c'+i, label:c.label, detail:null, decoy:!!c.decoy}))` 를 가나다순으로.

- [ ] **Step 1: layer 시험 추가** — `test/layer.test.js` 에 `[코드 미션]` 절: `CONCEPTS.length===8` 이고 id 순서 정확; `uses('while',['For'])===false`, `uses('while',['While'])===true`, `uses('x',null)===true`; `dataLine({kind:'code'},'[1, 2]')==='data = [1, 2]'`, `dataLine({},'a,b')==='data = "a,b"'`, `dataLine({},'a\\b"c')` 가 파이썬에서 원래 글자로 읽히는 꼴(`JSON.stringify`); `DATA_RE.test('x=1\ndata = [1]\n')`; `solcheck` 6개 code 각각을 하나씩 일으키는 입력과 통과 입력 하나(빈 배열); `hardcodeOption('주문서 1','7').v==='주문서 1의 답과 같은 7이 나오면 성공'`; `cards.forMission({kind:'code',cards:[{label:'더하기'},{label:'나누기',decoy:true}]})` 가 가나다순 2장, decoy 표시 유지; `fixedList({kind:'code'})===null`. core 목록 배열(222줄 근처)에 `'codemission.js'`.
- [ ] **Step 2: 실패 확인** — `node test/layer.test.js` → `실패 N건`.
- [ ] **Step 3: `js/core/codemission.js` 구현 + cards.js 분기** (IIFE `(function (CC) {...})(window.CC = window.CC || {})` 꼴, 다른 core 파일과 같은 머리말 주석).
- [ ] **Step 4: sentence.js 자료 줄 교체** — 모든 `data = "` 문자열 조립과 `/^data = ".*"/m` 를 `CC.codemission.dataLine(M, v)` / `CC.codemission.DATA_RE` 로. 미리보기 텍스트도 `dataLine`.
- [ ] **Step 5: e2e 시험 추가** — `test/e2e-flow.spec.js` 에 `local()` + seed 방식(기존 `seedMission` 참고)으로 손으로 만든 새 꼴 미션 하나(`kind:'code', concept:'for', inputs: [{id:'d01',name:'영수증 1',v:'[1500, 800]'},{id:'d02',name:'영수증 2',v:'[300]'},{id:'d03',name:'새 영수증',v:'[]',counter:true,axis:'empty'}], cards:[{label:'하나씩 꺼내기'},{label:'모두 더하기'},{label:'가장 큰 값 찾기',decoy:true}]`, define 보기 3개). 시험 이름 `새 꼴 미션 — 리터럴 자료로 돌고 반례로 바꾸면 반례로 돈다`: 03 에서 카드 3장이 보이고, 04 에서 편집기 첫 줄이 `data = [1500, 800]`, 코드 `print(sum(data))` 를 반례 자료로 실행하면 결과가 `0`. 그리고 `예전 미션 — 쉼표 자료는 그대로 따옴표로 돈다` 회귀 한 개.
- [ ] **Step 6: 전체 시험** — CLAUDE.md 아홉 개 + `npx playwright test` 전부 통과.
- [ ] **Step 7: Commit** — `git add js/core/codemission.js js/core/cards.js js/ui/sentence.js sentence.html teacher.html test/layer.test.js test/e2e-flow.spec.js && git commit` (메시지에 "왜 자료를 리터럴 문자열로 두었는지").

### Task 2: Pyodide 실행기를 `js/ui/pyrun.js` 로 뽑아 학생·강사 화면이 같이 쓴다

**Files:**
- Create: `js/ui/pyrun.js`
- Modify: `js/ui/sentence.js:323-397` (안의 `py` IIFE → `CC.pyrun.create`)
- Modify: `sentence.html` (`pyrun.js` 를 `sentence.js` 앞에), `teacher.html` (Pyodide 는 아직 부르지 않음 — 스크립트만 싣는다)
- Test: `test/e2e-flow.spec.js`

**Interfaces:**
- Produces: `CC.pyrun.create(onStatus) → { run(code, cb), ready() }`. `onStatus(text, ready)` 는 지금 `status()` 와 같은 문구(`'Python 로딩 중...'`, `'Python 준비 완료'`, LOAD_FAIL). `run(code, cb)`: `cb(output, error)` — error 는 `CC.pyerr.short` 를 거친 문자열, 5초 넘으면 worker 재시작 + `cb('', CC.pyerr.TIMEOUT)`. 실행 중 다시 부르면 **대기열에 넣어 차례로** 돈다(지금은 pending 하나 — 강사 화면은 자료 여러 개를 이어 돌린다). 생성 즉시 boot 한다. `js/ui/pyworker.js` 경로는 그대로.
- sentence.js 는 `var py = CC.pyrun.create(function (text, ready) { pyodideReady = ready; ...; runBtns(!ready); })` 로 바뀌고 실행 버튼 동작은 그대로.

- [ ] **Step 1: e2e 시험** `실행기 — 앞 실행이 도는 동안 부른 실행도 차례로 끝난다`: sentence.html 로컬 모드에서 페이지 안 `CC.pyrun.create(()=>{})` 로 실행기 하나를 만들고 준비를 기다린 뒤 `run('print(1)')`, `run('print(2)')` 를 연달아 불러 두 콜백이 `1\n`, `2\n` 순서로 오는지. 그리고 `run('while True: pass')` → error 가 `CC.pyerr.TIMEOUT` 이고 그 뒤 `run('print(3)')` 이 `3\n`. (Pyodide 로딩은 느리다 — 시험 timeout 60초.)
- [ ] **Step 2: 실패 확인** (`CC.pyrun` 없음).
- [ ] **Step 3: 구현** — sentence.js 의 `py` 를 옮기고 대기열 추가. 메인 스레드 폴백(`bootMain`)도 옮긴다.
- [ ] **Step 4: 기존 실행 관련 e2e + smoke 통과 확인.**
- [ ] **Step 5: Commit.**

### Task 3: 서버 — `api/mission-steps.py` 네 action + 강사 인증

**Files:**
- Create: `api/_auth.py`, `api/_steps.py`, `api/mission-steps.py`, `test/test_steps.py`
- Modify: `api/_accounts.py` (1·2단계를 `_auth.teacher(token, env, http)` 로 교체), `api/generate-mission.py` (같은 인증), `vercel.json` (`"api/mission-steps.py": { "maxDuration": 60 }`), `js/data/supabase.js` (`api(path, body)`), `teacher.html` (빠른 생성 fetch → `CC.sb.api`)
- Test: `test/test_accounts.py`(그대로 통과해야 함), `test/test_steps.py`

**Interfaces:**
- `_auth.teacher(token, env, http=urllib_http) -> str` (강사 user id). 토큰 없음/401 → `Fail(401,'다시 로그인해 주세요.')`, 역할이 teacher 아님 → `Fail(403,'선생님 계정만 할 수 있어요.')`, 설정 없음 → `Fail(502, ...)`. `Fail`·`urllib_http`·`bearer` 는 `_auth` 로 옮기고 `_accounts` 는 import 해서 쓴다.
- `_steps.py` (모든 함수 `call_llm` 주입 가능 — `_generate.pickle_llm(messages, schema, timeout)` 과 같은 꼴):
  - `concept(lesson, key_point, call_llm) -> {'concept': id, 'label': str, 'by': 'keyword'|'llm'}` — 먼저 낱말 규칙(`while|~할 때까지|반복 조건`→while, `def|함수`→func, `딕셔너리|dict`→dict, `집합|set|교집합|중복 제거`→set, `if|조건`→if, `for|range|반복`→for, `인덱스|리스트|몇 번째`→index, `split|나누|쪼개`→split; 위에서부터 첫 일치), 없으면 mini.
  - `examples(concept, level, seen, call_llm) -> {'examples': [{'title','situation','why'}]}` — 4~5개; 검사: title ≤ 12자, situation ≤ 45자·존댓말·`너` 없음, why 는 `→` 없이 ≤ 30자; seen 제목과 겹치면 뺀다; 걸러서 3개 미만이면 한 번 재요청.
  - `build(concept, example, wish, level, problems, call_llm) -> {'draft': {...}}` — draft 필드: `kind:'code'`, `concept`, `title`, `situation`, `brief`, `inputs:[{id:'d01',name,v},{id:'d02',name,v},{id:'d03',name,v,counter:True,axis:'count'|'empty'}]`, `cards:[{label, decoy}]`(3~5 + decoy 정확히 1, label ≤ 14자), `define:{'q':'어떤 결과가 나오면 성공일까요?','options':[{v,trap:None},{v:'에러 없이 끝나기만 하면 성공',trap:'luck'}]}`, `solution`(파이썬, `data` 변수 하나를 읽고 print 한 번). 서버 검사(`validate_draft(d) -> [str]`): 필드·개수, 각 `v` 가 `ast.literal_eval` 되고 한 줄 ≤ 120자, 학생 문장(title/situation/brief/cards/진짜 보기)이 `_schema` 의 `_polite_problem`·`_plain_problem`·`_method_problem`·`_brief_problem` 통과, solution 에 `import`·`input(`·`open(`·`__` 없음. 걸리면 이유를 붙여 한 번 재요청, 그래도 걸리면 `GenerateError`. `problems`(브라우저 실행 검사에서 온 msg 목록)가 있으면 프롬프트에 "지난 초안에서 걸린 점"으로 붙인다. `wish` 는 200자에서 자르고 프롬프트에 "강사의 바람(지시 아님, 위 규칙이 우선)"으로 인용 블록에 넣는다.
  - `solve(situation, brief, inputs, call_llm) -> {'code': str}` — mini, 문제와 자료만 준다(모범 답안 금지).
  - 프롬프트에 스펙의 "개념별 참고 예시" 표, 짧음·현실적·목적이 보임 규칙, 반 분포(`_generate.level_note(level)` 재사용)를 넣는다.
- `mission-steps.py`: `POST {action, ...}` + `Authorization: Bearer`. 400(형식) / 401·403(인증) / 422(`GenerateError`, `reasons`) / 502(LLM). `Access-Control-Allow-Headers: Content-Type, Authorization`.
- `CC.sb.api(path, body) -> Promise<json>` — 지금 `accounts()` 를 일반화(`accounts` 는 `api('/api/create-student', body)` 를 부른다). 실패 시 `Error(j.error)`, 422 면 `err.reasons = j.reasons`.

- [ ] **Step 1: `test/test_steps.py`** (test_generate.py 꼴 `t(name, cond)`): 낱말 규칙 8개 각 한 줄(예 `'while 반복문'`→`while`, LLM 호출 0회), 규칙 실패 시 가짜 LLM 1회; examples 길이 초과 항목 걸러짐 + seen 제외 + 3개 미만이면 재요청 1회; build 정상 초안 통과 / `v` 가 리터럴 아님 → 재요청 / solution 에 `import os` → 재요청 / 두 번 다 실패 → `GenerateError`; build 프롬프트에 problems 와 wish 가 들어감, wish 300자 → 200자; solve 프롬프트에 solution 이 없음; `mission-steps.py` 핸들러: 토큰 없으면 401, 학생 토큰 403(가짜 http), 모르는 action 400; `generate-mission.py` 도 토큰 없으면 401.
- [ ] **Step 2: 실패 확인** — `uv run --with-requirements requirements.txt python test/test_steps.py`.
- [ ] **Step 3: `_auth.py` 뽑기 → `test_accounts.py` 통과 확인.**
- [ ] **Step 4: `_steps.py`, `mission-steps.py`, generate-mission 인증, `vercel.json`, `CC.sb.api`, teacher.html 빠른 생성 경로 교체.** 빠른 생성 e2e(`page.route('**/api/generate-mission')`)가 그대로 통과해야 한다 — 가짜 SB 에 `api` 가 없으면 FAKE_TEACHER 에 `api` 를 더한다(라우트로 fetch 하는 구현).
- [ ] **Step 5: 시험 전부 + `CLAUDE.md` 작업 순서에 `test_steps.py` 한 줄 추가.**
- [ ] **Step 6: Commit** (메시지: 로그인은 비용 남용 방지일 뿐 보안 경계가 아니라서 코드 실행은 서버에 두지 않았다는 것).

### Task 4: 강사 화면 1·2단계 — 개념 확인과 예시 고르기

**Files:**
- Create: `js/ui/genflow.js` (단계별 생성 화면 전체 — teacher.html 인라인에 넣지 않는다)
- Modify: `teacher.html` (미션 탭 생성 영역: 지금 입력칸 아래에 단계 영역 `#sg` 와 버튼 `#sg-concept`; 기존 `#gen-btn` 은 "빠른 생성" 이름으로 남김; `genflow.js` 스크립트)
- Test: `test/e2e-flow.spec.js`

**Interfaces:**
- Consumes: `CC.sb.api`, `CC.codemission.CONCEPTS`, `CC.onboard.spread`.
- Produces: `CC.genflow.init({ room: () => selectedRoom, students: () => CC.classroom.students, saved: () => void })`(teacher.html 이 부른다). DOM id: `#sg-concept`(버튼), `#sg-concept-pick`(select, 8개), `#sg-examples`(목록), `.sg-ex`(예시 카드 버튼, `aria-pressed`), `#sg-more`(다른 예시 더 보기), `#sg-wish`(textarea maxlength 200), `#sg-build`(만들기), `#sg-status`(진행 문장), `#sg-draft`(4단계 영역). 1단계 버튼을 누르면 `CC.pyrun.create` 로 강사 실행기를 미리 부팅한다(한 번만).
- 예시 카드는 세 줄: 제목 / 상황 / `→ why`.

- [ ] **Step 1: e2e** `강사 단계별 생성 — 개념을 확인하고 예시를 고른다`: FAKE_TEACHER + `page.route('**/api/mission-steps')` 가 action 별 가짜 응답(concept → `for`, examples → 4개). 개념 select 가 `for` 로 맞춰지고 바꿀 수 있음, 예시 4장이 세 줄 꼴, `#sg-more` 가 `seen` 에 지금 제목 4개를 실어 보냄(요청 본문 검사), 하나를 고르면 `aria-pressed=true` 이고 `#sg-build` 가 켜짐. 요청에 `Authorization` 헤더가 있음.
- [ ] **Step 2: 실패 확인 → Step 3: 구현 → Step 4: smoke(3폭·2테마 가로 스크롤 없음) + e2e 통과 → Step 5: Commit.**

### Task 5: 강사 화면 3·4단계 — 만들기, 실행해 정답 얻기, 고치기, 확정

**Files:**
- Modify: `js/ui/genflow.js`, `teacher.html`(필요한 CSS 만)
- Test: `test/e2e-flow.spec.js`

**Interfaces:**
- Consumes: Task 1 `solcheck`/`usesCode`/`hardcodeOption`/`concept`, Task 2 `CC.pyrun`, Task 3 `build`.
- 흐름: `build` → 자료마다 `pyrun.run(dataLine(draft, v) + '\n' + solution)` 차례로 → `pyrun.run(usesCode(solution))` → `solcheck` → 이유가 있으면 `#sg-status` 에 "다시 만드는 중"과 함께 `problems` 에 msg 를 실어 `build` 재요청(최대 2번; 그래도 남으면 초안을 보이고 이유를 노란 검수 상자로). 통과하면 `draft.expected = outputs.map(trim)`, define 보기 = 서버 보기 2개 + `hardcodeOption(inputs[0].name, expected[0])`, 섞는다.
- 4단계 편집칸 id: `#sg-title`, `#sg-situation`, `#sg-brief`, `.sg-data-name`/`.sg-data-val`(data-idx), `.sg-card`(라벨 input, 마지막 decoy 표시), `.sg-opt`(진짜·luck 보기 input; hardcode 는 읽기 전용 + 자동 계산 표시), `.sg-answer`(자료별 정답 읽기 전용), `#sg-problems`(검사 이유), `#sg-save`(확정).
- 자료 값을 고치고 칸을 벗어나면(`change`) 그 자리에서 다시 실행 → `expected`·hardcode 보기·`#sg-problems` 갱신. 리터럴이 아니면(실행 에러) 이유로 보인다.
- 확정: `solution` 과 강사 `wish` 를 뺀 미션을 `CC.sb.saveMission(room.id, mission)` → `saved()`. 미션 id 는 `'ai-' + Date.now().toString(36)`, `no:'AI'`, `type:'sentence'`, `stage: title`, `lesson`, `keyPoint`.
- 확정 뒤 자료 고치기는 없다 — 4단계 아래에 "확정한 뒤에는 자료를 바꿔도 정답이 다시 계산되지 않아요. 자료를 바꾸려면 새로 만들어 주세요." 한 줄.

- [ ] **Step 1: e2e 셋** — (a) `만든 초안을 실행해 자료별 정답과 외우기 함정이 채워진다`: 가짜 build 가 for 미션(solution `print(sum(data))`, 자료 `[1500, 800]`/`[300]`/`[]`) → `.sg-answer` 가 `2300`,`300`,`0`, hardcode 보기 `… 2300이 나오면 성공`. (b) `검사에 걸리면 이유를 붙여 다시 만든다`: 첫 build 의 solution 이 `print(2300)` → 두 번째 build 요청 본문 `problems` 에 반례 msg 가 있고, 두 번째(정상) 초안이 보인다. 무한 반복 solution 이면 timeout 이유(Review Focus 2). (c) `자료를 고치면 다시 계산하고, 확정하면 solution 없이 저장한다`: 자료 1 을 `[1, 2]` 로 바꾸면 `.sg-answer` 첫 칸 `3`·hardcode 보기 갱신; 반례를 자료 1과 같은 합이 되게 바꾸면 `#sg-problems` 에 반례 문구; 확정 시 FAKE_TEACHER `saveMission` 이 받은 객체에 `solution`·`wish` 키가 없고 `kind:'code'`, `concept:'for'`, `expected` 3개.
- [ ] **Step 2–4: 실패 확인 → 구현 → 전체 시험(robust 에 강사 자유 입력 `#sg-wish` 가 학생 화면으로 안 가는지 한 줄).**
- [ ] **Step 5: Commit.**

### Task 6: 따로 풀어 맞춰 보기 (비동기)

**Files:** Modify `js/ui/genflow.js`; Test `test/e2e-flow.spec.js`

**Interfaces:** Consumes Task 3 `solve`. 초안이 4단계에 뜬 직후 `solve` 를 부르고(기다리지 않음), 받은 코드를 자료마다 실행해 trim 출력이 `expected` 와 다른 자료가 있으면 `#sg-solve` 에 `'따로 푼 답과 달라요: ' + name + ' — ' + expected + ' / ' + other` (여러 개면 ` · ` 로 잇기), 모두 같으면 `'따로 푼 답과 같아요'`, 실패하면 아무것도 안 띄움. 자료를 고치면 다시.

- [ ] Step 1 e2e `따로 푼 답이 다르면 사실 한 줄로 보인다` (가짜 solve 가 `print(sum(data)+1)`) + 같으면 같은 문구 → Step 2 실패 확인 → Step 3 구현 → Step 4 시험 → Step 5 Commit.

### Task 7: 문서

**Files:** Modify `docs/수업-흐름.md`(2절 미션 만들기에 네 단계, 빠른 생성 한 줄, 자료별 정답·따로 풀기), `README.md` 핵심 흐름 표 문구(스크린샷은 Task 8 에서), `docs/server.md`(mission-steps, 인증, `LLM_MODEL_LIGHT`), `docs/트러블슈팅.md`(작업 중 실제로 해결한 문제만).

- [ ] Step 1 고치기 → Step 2 smoke → Step 3 Commit.

### Task 8: 완성 확인 — 개념마다 2개 실제 생성 + 보고서 (gateway 예산 $3)

**Files:**
- Create: `test/eval_stepwise.py`, `docs/eval-2026-10-20-stepwise-gen.md`
- Modify (걸리는 점이 구조적일 때만): `api/_steps.py` 프롬프트·검사

**Interfaces:** `eval_stepwise.py` 는 두 단계로 나눠 돈다 — `examples` 단계(개념 8개 × 예시 목록을 `scratchpad`/`.superpowers/sdd/eval/examples.json` 에 저장) 뒤 **실행 중인 에이전트가 직접** 스펙 "사람 대신 고르기 기준" 1~4 로 개념마다 2개를 골라 `picks.json`(고른 제목, 기준 번호로 쓴 이유, 필요하면 wish 한 줄) → `build` 단계(초안 생성 → 로컬 `python3 -I` 하위 프로세스로 solution 실행(로컬 평가 전용, 5초 제한) → `node` 로 `CC.codemission.solcheck` 를 불러 검사 → 걸리면 problems 붙여 재요청 최대 2번 → `solve` 로 따로 풀기). 호출마다 토큰(`usage`)을 누적하고 단가(mini $0.6/M, 5.4 $2.2/M)로 금액을 추정해 $3 넘기 전에 멈춘다. `PICKLE_API_KEY` 는 환경변수에서만 읽는다(파일에 쓰지 않는다; 없으면 `.env.local`·Vercel 에서 받지 말고 보고서에 "키 없음"으로 적고 멈춘다).

- [ ] **Step 1: 스크립트 작성, `--dry` 로 가짜 LLM 한 바퀴.**
- [ ] **Step 2: examples 단계 실행 → picks.json 작성(에이전트가 기준대로 고름).**
- [ ] **Step 3: build 단계 실행.**
- [ ] **Step 4: 보고서** — 스펙 "완성 확인" 절의 항목 그대로(고른 예시·이유, 미션 전문, 자료별 정답, 기계 검사, 따로 풀기, 사람 기준 솔직한 평, 개념별 한 줄 요약, 고칠 거리, 돌린 횟수, 호출 수·토큰·추정 금액).
- [ ] **Step 5: 구조적 문제가 있으면 `_steps.py` 고치고 그 개념만 다시 2개(예산 안에서), 단위 시험 다시 통과.**
- [ ] **Step 6: 강사 화면 4단계를 headless 로 끝까지 한 번(가짜 SB + 실제 API 대신 build 결과 JSON 을 route 로) 스크린샷 → `docs/수업-흐름/t5-stepwise-*.png`, README·수업-흐름 에 넣기.**
- [ ] **Step 7: Commit.**

### Task 9: 학생 코드 조용한 실행 — `s-probe` 이벤트

**Files:** Modify `js/core/events.js`(`S_PROBE: 's-probe'` + 주석 `{ sig, outs:[{dataId, output, error}], uses }`), `js/core/fold.js`(`sProbe: null` → 마지막 것), `js/core/codemission.js`(`sig(code) -> string` djb2 16진), `js/ui/sentence.js`(판정 저장 직후), `test/layer.test.js`, `test/e2e-flow.spec.js`

**Interfaces:**
- 판정 저장(`rec('s-code-judge', …)`, sentence.js:509 근처) 직후, 마지막 보이는 실행(`state.codes` 마지막)에 에러가 없고, 같은 코드(`sig`)의 probe 가 이미 없으면: `M.inputs` 마다 `py.run(dataLine(M, v) 로 자료 줄을 바꾼 코드)` 를 차례로 → `py.run(usesCode(code))` → `rec('s-probe', {sig, outs, uses})`. output 은 200자에서 자름. 보이는 결과 화면·`state.codes`·정리 화면에는 아무것도 더하지 않는다. 판정 저장 UI 는 기다리지 않는다.
- fold: `s.sProbe = { sig, outs, uses, t }`.

- [ ] Step 1 시험: layer — `events.make(T.S_PROBE, {...})` 통과, NEVER 필드 넣으면 예외, fold 가 마지막 probe 를 남김, `sig('a')!==sig('b')` 이고 같은 입력엔 같은 값. e2e `판정을 저장하면 모든 자료로 조용히 돌린 기록이 남고 학생 화면은 그대로다`: 로컬 모드 기존 미션에서 자료 1만 실행 → 판정 저장 → 잠시 뒤 이벤트에 `s-probe` 하나, `outs.length===3`, 학생 정리 화면 실행 결과 줄 수는 그대로. 마지막 실행이 에러면 probe 없음.
- [ ] Step 2 실패 확인 → Step 3 구현 → Step 4 전체 시험 → Step 5 Commit.

### Task 10: 강사 서랍 — 코드 사실 + 설계 카드와 코드 나란히

**Files:** Create `js/core/facts.js`; Modify `teacher.html`(스크립트), `js/ui/teacher.js`(서랍), `test/layer.test.js`, `test/robust.js`, `test/e2e-flow.spec.js`

**Interfaces:**
- `CC.facts.of(student, mission) -> [{kind, text}]` — student 는 그 미션으로 접은 학생(`sCodes`, `sProbe`), mission 은 미션 데이터. kind 와 문장(정확히):
  - `nocounter`: 반례 자료(`counter:true`)가 있고 `sCodes` 중 `dataId === counter.v` 가 없으면 `'새로 온 자료로는 실행하지 않았어요'`
  - `error`: probe `outs` 중 첫 에러 자료 → `'자료 ' + name + '에서는 에러가 나요'` (있으면 hardcode 는 판단하지 않음)
  - `hardcode`: probe 의 반례 출력 trim === 첫 자료 출력 trim → `'새로 온 자료에서도 ' + name1 + CC.particle(name1,'과/와') + ' 같은 결과 ' + out + CC.particle(out,'이/가') + ' 나와요'`
  - `concept`: `mission.concept` 있고 `uses` 가 배열이고 `!CC.codemission.uses(concept, uses)` → `'오늘 개념 ' + label + CC.particle(label,'이/가') + ' 코드에 없어요'`
  - probe 가 없으면 nocounter 만 판단.
- 서랍: "자료별 결과" 줄 다음에 `row(dl, '코드 사실', probe.t, ...)` — 사실마다 한 줄, 없으면 줄 자체 없음. 설계도와 마지막 코드를 `.d-pair` 안 `.d-pair-cards` / `.d-pair-code` 로 좌우(900px 미만 위아래). 학생 화면 파일은 건드리지 않는다.

- [ ] Step 1 시험: layer — 네 kind 각각 + 에러가 있으면 hardcode 없음 + 예전 미션(concept 없음)은 concept 없음 + probe 없으면 nocounter 만. robust — probe output 에 `<img src=x onerror=alert(1)>` 를 넣은 학생이 서랍에서 글자로만 보이고 alert 없음. e2e `서랍에 코드 사실과 설계·코드 나란히` (FAKE_TEACHER 이벤트에 s-code + s-probe 추가).
- [ ] Step 2 실패 확인 → Step 3 구현 → Step 4 전체 시험(smoke 3폭) → Step 5 문서(`docs/수업-흐름.md` 서랍 절) → Step 6 Commit.
