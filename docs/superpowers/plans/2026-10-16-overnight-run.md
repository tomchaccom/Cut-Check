# 밤샘 작업 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문제 생성 품질을 eval 지표로 올리고, 코드 단계 AI 튜터 · 교사 알림 · 안전한 파이썬 실행을 붙여, 교사 생성 → 학생 해결 → 설계도 → 코드 → 완료 흐름이 E2E 로 끝까지 돈다.

**Architecture:** 정적 파일 + Vercel Python 함수. 판단 규칙은 `js/core`(순수), 바깥 세계는 `js/data`, 화면은 `js/ui`. 새 순수 로직(알림 비교, 파이썬 에러 요약)은 `js/core` 에 두고 node 로 테스트한다. 튜터는 기존 미션 생성과 같은 패턴(LLM structured output → 코드 검사 → 1회 재요청 → 고정 문장)으로 `api/` 에 둔다.

**Tech Stack:** 바닐라 JS(ES5 스타일, 모듈 없음), Python 3.12 + pydantic(uv), Pyodide 0.24.1(Web Worker), Playwright, pickle LLM API(`PICKLE_API_KEY`).

**Spec:** `docs/superpowers/specs/2026-10-16-overnight-run-design.md`

## 실행 방법

Task 0 Step 1~4 를 마친 뒤 `overnight` 워크트리에서 새 세션을 띄운다:

```bash
cd /Users/myeongsung/orca/workspaces/산학협력실무/overnight
teamclaude run -- --dangerously-skip-permissions --autocompact 600k
```
그리고 첫 메시지: "docs/superpowers/plans/2026-10-16-overnight-run.md 를 Task 0 Step 5 부터 subagent-driven 으로 실행해."

- `teamclaude run`: 계정 두 개를 도는 프록시로 실행한다. 사용량이 98%(`switchThreshold`)에 닿으면 프록시가 다음 요청부터 다른 계정을 쓴다. 세션 재시작이 필요 없다.
- `--autocompact 600k`: 1M 컨텍스트 중 600k(60%)를 창 크기로 잡아 그 근처에서 자동 압축한다. 플래그가 거절되면 `600000` 으로 다시 시도한다.

## Global Constraints

- **사용량 한도:** 요청이 사용량 한도 에러로 실패하면 `teamclaude switch` 로 지금 계정(`*` 표시)을 확인하고, 다른 계정으로 `teamclaude switch <이름>` 한 뒤 같은 단계를 다시 한다. 두 계정이 모두 한도면 진행 중인 작업을 커밋 가능한 상태로 되돌리고 리포트에 "사용량 소진으로 중단 — Task N Step M" 을 적고 멈춘다.

- 학생 화면 문장은 존댓말(`~해요`), 화면이 학생을 `너`라고 부르지 않는다. 반말은 `js/core/asks.js` 에만.
- 칭찬·점수·순위·소요 시간·정답률을 만들지 않는다. `events.make()` 의 `NEVER` 필드를 담지 않는다.
- 에러는 위치와 사실만. 원인을 대신 짚지 않는다.
- 조사는 `CC.particle(word, '이/가')` 로 계산한다.
- 새 이벤트는 `js/core/events.js` 의 `T` 에 상수로 더하고 `fold.js` 의 `apply()` 에 case 를 더한다. 화면에서 type 문자열을 직접 쓰지 않는다.
- `js/core` 는 `localStorage` · `fetch` · `document` · `window.` 를 쓰지 않는다. `fetch` 는 `js/data` 에만.
- 번들러·ES 모듈 금지. 의존성 추가 금지(Pyodide 는 이미 CDN 으로 쓰고 있다).
- 서버를 필수로 만들지 않는다. 서버가 없어도 수업 흐름은 끝까지 간다.
- 학생 자유 입력(튜터 질문 포함)은 교사 화면에 그대로 올라가고, `test/robust.js` 경로에 들어간다.
- 커밋 전 전체 테스트 통과. 커밋 메시지는 "왜"와 "거절한 선택지". push·PR 금지.
- 문제가 생기면 `docs/트러블슈팅.md` 를 먼저 찾고, 해결을 확인한 것만 추가한다.
- 같은 작업에서 수정 3회 후에도 테스트가 실패하면 마지막 커밋으로 되돌리고 리포트에 적고 다음 작업으로.
- 줄 번호는 2026-10-16 coho 작업 트리 기준이다. 그 사이 coho 세션이 코드를 바꿨을 수 있으므로 **함수·id 이름으로 찾는다.**

**전체 테스트 명령** (이하 "전체 테스트"):

```bash
node test/engine.test.js && node test/hangul.test.js && node test/llmguard.test.js \
  && node test/layer.test.js && node test/smoke.js && node test/robust.js \
  && uv run -q -p 3.12 --with-requirements requirements.txt python test/test_missionguard.py \
  && uv run -q -p 3.12 --with-requirements requirements.txt python test/test_pipeline_parity.py \
  && uv run -q -p 3.12 --with-requirements requirements.txt python test/test_generate.py
```

Task 4 이후에는 `&& uv run -q -p 3.12 --with-requirements requirements.txt python test/test_tutorguard.py`,
Task 1 이후에는 `&& npx playwright test test/e2e-flow.spec.js` 를 덧붙인다.
smoke·robust·playwright 는 `python3 -m http.server 8123` 이 떠 있어야 한다.

## Review Focus

1. **튜터 답이 정답 코드를 우회해서 준다** — 한 줄 예시에 미션 자료와 같은 구분자·연산을 그대로 넣는 경우. Task 4 가드 테스트에 "한 줄이지만 학생 코드와 같은 줄" 사례를 넣는다.
2. **교사 화면을 새로고침하면 알림이 쏟아진다** — 첫 렌더는 비교 기준만 잡고 알림을 띄우지 않아야 한다. Task 3 테스트 `diff(null, …)` 사례.
3. **무한루프 후 Python 이 다시 준비되기 전에 실행을 누른다** — worker 재시작 중에는 실행 버튼이 꺼져 있어야 한다. Task 6 E2E 에서 시간 초과 직후 버튼 상태를 확인한다.
4. **서버 없이 튜터를 연다** — 모달이 열리고 "지금은 튜터를 쓸 수 없어요."가 보이고, 질문은 기록되어 교사 화면에 간다. Task 5 robust 경로.
5. **설계도 제출 전에 코드 단계로 건너뛴다** — 튜터 버튼이 보이면 안 된다. Task 5 E2E 에서 step 1~3 동안 `#tutor-open` 이 숨겨져 있는지 확인한다.

---

### Task 0: 준비

**Files:**
- Create: `docs/overnight/2026-10-17-report.md`

Step 1~4 는 이 계획을 쓴 세션(또는 사람)이 하고, Step 5 부터는 "실행 방법" 의 새 세션이 한다.

- [ ] **Step 1: 잠자기 막기**

```bash
caffeinate -dimsu -t 43200 &
```
맥이 잠들면 세션이 멈춘다. 12시간. 노트북이면 전원이 연결돼 있어야 한다.

- [ ] **Step 2: coho 세션이 끝났는지 확인**

```bash
ps -eo pid,command | grep -E "eval_generate|claude" | grep -v grep
for p in $(pgrep -f "^claude"); do lsof -a -p $p -d cwd -Fn 2>/dev/null | grep -q "/coho$" && echo "coho 세션 살아 있음: $p"; done
```
`coho 세션 살아 있음` 이나 `eval_generate.py` 가 보이면 **여기서 멈추고** 리포트에 "coho 세션이 작업 중이라 시작하지 않음"을 적고 종료한다.

- [ ] **Step 3: coho 변경 확인 후 커밋**

```bash
cd /Users/myeongsung/orca/workspaces/산학협력실무/coho
git status --short
python3 -m http.server 8123 >/dev/null 2>&1 &   # 이미 떠 있으면 생략
```
전체 테스트를 돌린다. 통과하면 변경 파일을 **이름으로** 스테이징해서 커밋한다 (`git add .` 금지):

```bash
git add api/_generate.py api/_pipeline.py api/_schema.py teacher.html \
  test/test_generate.py test/test_missionguard.py test/eval_generate.py \
  docs/eval.md docs/eval-raw.json docs/eval-v1.md docs/eval-v1-raw.json
git status --short   # 남은 게 있으면 무엇인지 보고 관련 있는 것만 더한다
git commit -m "feat: 미션 생성 품질 개선과 평가 스크립트

eval v1 → v2 에서 유형 일치 1/8 → 5/7, 평균 18.8초 → 10.7초.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
테스트가 실패하면 커밋하지 않고 멈춘다 — 다른 세션의 미완성 작업이다. 리포트에 적고 종료.

- [ ] **Step 4: 새 브랜치와 워크트리**

```bash
cd /Users/myeongsung/orca/workspaces/산학협력실무/coho
git worktree add ../overnight -b tomchaccom/overnight-2026-10-17
cd ../overnight
git cherry-pick 26071ba..tomchaccom/밤새계획실행   # 스펙, 계획, 트러블슈팅.md, CLAUDE.md "문제가 생기면"
npm install
```
cherry-pick 이 `CLAUDE.md` 에서 충돌하면 coho 쪽 내용을 유지하고 "문제가 생기면" 절만 "커밋 메시지" 절 앞에 넣는다.
이후 모든 작업은 `/Users/myeongsung/orca/workspaces/산학협력실무/overnight` 에서 한다.

- [ ] **Step 5: 실행 환경 확인**

```bash
teamclaude switch          # 계정 두 개와 지금 계정(*)
ps -eo command | grep -- "--autocompact" | grep -v grep
```
리포트 "설정" 에 지금 계정과 `--autocompact` 로 떠 있는지를 적는다.

- [ ] **Step 6: 기준선 테스트와 리포트 뼈대**

전체 테스트를 돌리고 결과를 리포트에 붙인다.

`docs/overnight/2026-10-17-report.md`:
```markdown
# 밤샘 작업 리포트 — 2026-10-17

브랜치 `tomchaccom/overnight-2026-10-17` · 시작 커밋 <해시>

## 작업별 결과
| 작업 | 결과 | 커밋 |
|---|---|---|

## eval 지표
| 회차 | 생성 성공 | 1차 통과 | 기본 틀 없음 | 유형 일치 | 평균 시간 | 바꾼 것 |
|---|---|---|---|---|---|---|
| v2 (시작) | 7/10 | 0/10 | 0/10 | 5/7 | 10.7초 | — |

## 핵심 흐름 E2E

## 사람이 판단할 것

## 트러블슈팅에 추가된 항목

## 테스트 결과 원문

## 설정
- 자동 압축 60%:
```

- [ ] **Step 7: 커밋**

```bash
git add docs/overnight/2026-10-17-report.md
git commit -m "docs: 밤샘 작업 리포트 뼈대

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: 핵심 흐름 E2E 기준선

**Files:**
- Create: `test/e2e-flow.spec.js`

**Interfaces:**
- Produces: `test/e2e-flow.spec.js` 의 헬퍼 `seedMission(page)`, `studentToCode(page)`, `waitPython(page)` — Task 3·5·6 이 같은 파일에 테스트를 더할 때 쓴다.

- [ ] **Step 1: 스펙 작성**

```js
/* test/e2e-flow.spec.js — 핵심 흐름 한 번에
 *
 * 교사 미션 생성 → 학생 해결 → 설계도 → 파이썬 코드 → 완료 → 교사 화면.
 * LLM 은 고정 응답으로 바꾼다 — 테스트가 API 키와 비용에 묶이지 않게.
 * Supabase 는 막아 로컬 모드로 돈다 — 테스트가 실제 교실 DB 에 쓰면 안 된다.
 *
 *   python3 -m http.server 8123
 *   npx playwright test test/e2e-flow.spec.js
 */
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:8123';

async function local(ctx) {
  await ctx.route('**/supabase-js@2/**', r => r.abort());
}

/* 교사가 확정한 미션은 localStorage 'cutcheck.generated' 로 학생 화면에 간다 (teacher.html 확정 버튼).
 * 기본 미션 하나를 복제해 같은 경로로 넣는다. */
async function seedMission(page) {
  await page.goto(BASE + '/sentence.html');
  await page.evaluate(() => {
    const m = JSON.parse(JSON.stringify(window.CC.SENTENCE_MISSIONS[0]));
    m.id = 'ai-e2e'; m.no = 'AI'; m.title = '시험용 미션';
    localStorage.setItem('cutcheck.generated', JSON.stringify([m]));
    window.CC.store.clear();
  });
  await page.reload();
}

async function studentToCode(page) {
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#reason-define').fill('모두 세야 하니까');
  await page.locator('#go-method').click();
  for (const s of await page.locator('select.slot:visible').all()) await s.selectOption({ index: 1 });
  await page.locator('#reason-method').fill('보이는 대로');
  await page.locator('#go-run').click();
  await expect(page.locator('#step4')).toHaveClass(/active/);
}

async function waitPython(page) {
  await expect(page.locator('#pyodide-status')).toHaveText('Python 준비 완료', { timeout: 60000 });
}

test('교사 화면에서 초안을 만들 수 있다 (LLM 고정 응답)', async ({ context, page }) => {
  await local(context);
  await page.route('**/api/generate-mission', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(require('./fixtures/mission.json'))
  }));
  await page.goto(BASE + '/teacher.html');
  const gen = page.locator('#gen-btn');
  if (!(await gen.isVisible())) {
    test.fixme(true, '로컬 모드에서 교사 미션 생성 탭에 들어갈 수 없다 — 교실 선택이 Supabase 를 요구');
  }
  await page.locator('#gen-lesson').fill('리스트와 반복문');
  await page.locator('#gen-key').fill('같은 값이 여러 번 나올 때');
  await gen.click();
  await expect(page.locator('#confirm-mission')).toBeVisible();
});

test('학생 해결 → 설계도 → 코드 → 완료 → 교사 화면', async ({ context, page }) => {
  test.setTimeout(120000);
  await local(context);
  await seedMission(page);
  await studentToCode(page);

  await expect(page.locator('#design-define')).toContainText('성공');
  await waitPython(page);
  await page.locator('#code-editor').fill('data = "a,b,a"\nprint(len(data.split(",")))\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toHaveText('3', { timeout: 10000 });

  await page.locator('#code-judge .judge-btn').first().click();
  await page.locator('#code-basis').fill('세 개가 나와서');
  await page.locator('#code-judge-save').click();
  await page.locator('#go-wrap').click();
  await page.locator('#wrap-text').fill('처음 생각보다 나눌 게 많았다.');
  await page.locator('#finish').click();

  const t = await context.newPage();
  await t.goto(BASE + '/teacher.html');
  await t.getByRole('button', { name: '내 기록 열기' }).click();
  await expect(t.locator('body')).toContainText('코드 실행');
  await expect(t.locator('body')).toContainText('처음 생각보다 나눌 게 많았다.');
});
```

- [ ] **Step 2: 고정 응답 파일**

`docs/eval-raw.json` 에서 생성에 성공한 미션 하나를 꺼내 `test/fixtures/mission.json` 으로 저장한다:

```bash
mkdir -p test/fixtures
uv run -q -p 3.12 python -c "
import json; raw = json.load(open('docs/eval-raw.json'))
items = raw if isinstance(raw, list) else raw.get('results', [])
m = next(r.get('mission') or r.get('response') for r in items if (r.get('mission') or r.get('response') or {}).get('inputs'))
json.dump(m, open('test/fixtures/mission.json', 'w'), ensure_ascii=False, indent=2)"
```
`eval-raw.json` 의 키 이름이 다르면 파일을 열어 미션 객체(`inputs`·`define`·`method` 가 있는 것)의 경로를 찾아 고친다.

- [ ] **Step 3: 실행하고 깨지는 지점 기록**

```bash
npx playwright test test/e2e-flow.spec.js --reporter=line
```
이 단계에서는 실패해도 된다. **어느 단계에서 무엇이 실패했는지** 리포트 "핵심 흐름 E2E" 에 그대로 적는다.
실패 원인이 테스트의 선택자 오타라면 고친다. 화면 버그라면 고치지 않고 기록만 한다 — 그건 이후 작업 몫이다.
단, **학생 흐름 테스트가 Pyodide 와 무관한 이유로 막히면**(예: 미션 버튼이 안 보임) 원인을 고친다.
이후 작업의 E2E 가 이 흐름 위에 서기 때문이다.

- [ ] **Step 4: 커밋**

```bash
git add test/e2e-flow.spec.js test/fixtures/mission.json docs/overnight/2026-10-17-report.md
git commit -m "test: 교사 생성부터 교사 화면까지 핵심 흐름 E2E 기준선

LLM 은 고정 응답, Supabase 는 막고 로컬 모드로 돈다.
테스트가 API 키·비용·실제 교실 DB 에 묶이면 밤새 돌릴 수 없다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 문제 생성 품질 루프

**Files:**
- Modify: `api/_schema.py` (학생 문장 검사), `api/_generate.py` (프롬프트·재요청), 필요 시 `api/_schema.py` 의 Field description
- Test: `test/test_missionguard.py`
- Create: `docs/overnight/eval-rNN.md` (회차별 결과 사본)

**Interfaces:**
- Consumes: `api/_schema.py` 의 `_text_problem(v)`, `_plain_problem(v)`, `_brief_problem(v)` — 문제가 있으면 사유 문자열, 없으면 `None`.

- [ ] **Step 1: 학생 문장 규칙 테스트부터 (실패해야 함)**

`test/test_missionguard.py` 의 기존 문장 검사 테스트 근처에 더한다:

```python
# 중1이 모르는 개발 용어와 지시문 — 스펙 3.3 학생 문장 규칙
for bad in ['데이터 집계 로직을 검토해 주세요.', '처리 결과의 타당성을 확인해 주세요.',
            '카운터 자료를 만들어 주세요.', '성공 조건을 명시하세요.', '처리 방법을 기술하세요.']:
    t(f'막는다: {bad}', bool(_text_problem(bad)), _text_problem(bad))
for ok in ['주문서에 상품이 몇 개인지 알려 주세요.', '출석부에 학생이 몇 명인지 세어 주세요.']:
    t(f'통과: {ok}', not _text_problem(ok), _text_problem(ok))
```

Run: `uv run -q -p 3.12 --with-requirements requirements.txt python test/test_missionguard.py`
Expected: 새 `막는다:` 5건 FAIL

- [ ] **Step 2: 규칙 추가**

`api/_schema.py` 의 `FOREIGN = ...` 아래에:

```python
# 중1이 읽는다. 개발 용어는 읽히지 않고, 지시문은 문제가 아니라 숙제처럼 읽힌다.
JARGON = re.compile(r'로직|데이터|타당성|집계|카운터|알고리즘|프로세스')
ORDER = re.compile(r'(명시|기술|서술|작성)하(세요|시오)')
```

`_text_problem` 끝에:

```python
    m = JARGON.search(v)
    if m:
        return f"개발 용어 '{m.group(0)}' — 중1이 읽는 문장이다"
    m = ORDER.search(v)
    if m:
        return f"지시문 '{m.group(0)}' — 학생에게 일을 맡기는 요청문으로 쓴다"
```

Run: 같은 명령. Expected: 전부 통과. 기존 손으로 쓴 미션(`SENTENCE_MISSIONS`)이 이 규칙에 걸리면 **규칙이 아니라 미션 문장을 고친다** — 사람이 쓴 문장도 같은 기준을 지켜야 한다.

- [ ] **Step 3: 커밋**

```bash
git add api/_schema.py test/test_missionguard.py
git commit -m "feat: 생성 문장에서 개발 용어와 지시문을 막는다

eval v2 에서 '데이터 집계 로직 검토', '명시하세요' 가 학생 화면까지 갔다.
중1은 이런 문장을 문제가 아니라 숙제로 읽는다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: 루프 — 회차 하나 (최대 20회 반복)**

한 회차:

1. 직전 `docs/eval.md` 의 "검증에 걸린 칸" 과 "상세" 에서 **가장 많이 걸린 사유 하나**를 고른다.
   첫 회차는 `sentences` 의 "`{slot}` 하나가 아님" (14회)과 실패한 num 계열 3주제다.
2. 그 사유를 줄이는 변경 **하나**를 한다. 후보:
   - `api/_schema.py` 의 해당 칸 `Field(description=...)` — LLM 에게 가는 생성 지시다. 예시 문장 한 개를 넣는다.
   - `api/_generate.py` 의 `SYSTEM` 또는 재요청 프롬프트 — 사유를 더 구체적으로 돌려준다.
   - `_repair()` — **코드가 확실히 고칠 수 있는 형식 문제만** (자료 단어를 바꾸지 않는다).
3. 단위 테스트: `test_missionguard.py`, `test_generate.py`, `test_pipeline_parity.py` 통과.
4. eval:
   ```bash
   uv run -q -p 3.12 --with-requirements requirements.txt python test/eval_generate.py
   cp docs/eval.md docs/overnight/eval-r$(printf %02d $N).md
   ```
5. 리포트 "eval 지표" 표에 한 줄 더한다. 그리고 이번 회차 미션 3개(성공한 것 중 서로 다른 유형)의
   제목·brief·situation·방법 문장을 "사람이 판단할 것" 에 원문 그대로 붙인다.
6. 판정:
   - 세 목표 지표(생성 성공, 1차 통과, 기본 틀 없음) 중 **하나라도 나아지고 나머지가 나빠지지 않았으면** 커밋.
   - 아니면 `git checkout -- api/` 로 되돌리고 리포트에 "시도: …, 결과: 나아지지 않음" 을 적는다.
     같은 사유에 3번 연속 실패하면 다음으로 많은 사유로 넘어간다.

커밋 메시지 형식:
```
feat: <칸> 생성 지시를 <무엇으로> 바꾼다

eval rNN: 1차 통과 a/10 → b/10, 기본 틀 없음 c → d.
<왜 이 변경이 그 사유를 줄일 거라고 봤는지 한 줄>
거절: <같이 고려했다 버린 것>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

**금지:** 검사 규칙을 느슨하게 만들어 지표를 올리는 것. 규칙을 바꿔야 한다고 판단되면 바꾸지 말고
리포트 "사람이 판단할 것" 에 "규칙 X 가 정상 문장 Y 를 막는다" 를 근거와 함께 적는다.

- [ ] **Step 5: 종료 조건**

목표(생성 성공 ≥ 9/10, 1차 통과 ≥ 5/10, 기본 틀 없음 ≥ 6/10) 모두 도달 또는 eval 20회.
리포트 작업별 결과에 "작업 2: 완료/부분 완료 — 최종 rNN" 을 적고 커밋한다:

```bash
git add docs/overnight/
git commit -m "docs: 생성 품질 루프 결과

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 교사 알림

**Files:**
- Create: `js/core/alerts.js`
- Modify: `js/core/fold.js` (`sDesignCount`), `js/ui/teacher.js` (알림 표시, 로컬 갱신), `teacher.html` (스크립트, 알림 영역, Supabase 폴링), `teacher.css`
- Test: `test/layer.test.js`, `test/e2e-flow.spec.js`

**Interfaces:**
- Produces: `CC.alerts.snap(students) → { [id]: { name, design: number, judged: number } }`,
  `CC.alerts.diff(prevSnap|null, nextSnap) → [{ id, name, kind: 'design'|'code' }]`,
  `CC.alerts.say(alert) → string`
- Produces: fold 학생 객체에 `sDesignCount: number`

- [ ] **Step 1: 실패하는 테스트**

`test/layer.test.js` 상단 require 에 `require('../js/core/hangul.js'); require('../js/core/alerts.js');` 를 더하고,
`// ── core 는 브라우저 API 를 모른다` 위에:

```js
// ── 교사 알림: 새로 생긴 설계도 제출과 코드 판정만
console.log('\n[알림] 비교');
const st = (id, name, d, j) => ({ id, name, sDesignCount: d, sCodeJudges: new Array(j).fill({}) });
const a0 = CC.alerts.snap([st('a1', '민지', 0, 0), st('a2', '준호', 1, 0)]);
t('첫 렌더는 알리지 않는다', CC.alerts.diff(null, a0).length === 0);
const a1 = CC.alerts.snap([st('a1', '민지', 1, 0), st('a2', '준호', 1, 0)]);
const d1 = CC.alerts.diff(a0, a1);
t('새 설계도 제출 하나', d1.length === 1 && d1[0].id === 'a1' && d1[0].kind === 'design');
const a2 = CC.alerts.snap([st('a1', '민지', 1, 1), st('a2', '준호', 1, 0)]);
t('새 코드 판정 하나', CC.alerts.diff(a1, a2).length === 1 && CC.alerts.diff(a1, a2)[0].kind === 'code');
t('변화가 없으면 없다', CC.alerts.diff(a2, a2).length === 0);
const a3 = CC.alerts.snap([st('a1', '민지', 1, 2), st('a2', '준호', 1, 0), st('a3', '서연', 1, 0)]);
const d3 = CC.alerts.diff(a2, a3);
t('같은 학생 반복 판정도 새 판정이다', d3.some(x => x.id === 'a1' && x.kind === 'code'));
t('새로 들어온 학생의 제출도 알린다', d3.some(x => x.id === 'a3' && x.kind === 'design'));
t('문구는 조사를 계산한다', CC.alerts.say({ name: '민지', kind: 'design' }) === '민지가 설계도를 냈어요.'
  && CC.alerts.say({ name: '준호', kind: 'code' }) === '준호가 코드 결과를 판정했어요.'
  && CC.alerts.say({ name: '서연', kind: 'design' }) === '서연이 설계도를 냈어요.');
t('문구에 순서·시간·판정 결과가 없다', !/첫|번째|분|초|지켰|못했/.test(
  CC.alerts.say({ name: 'x', kind: 'design' }) + CC.alerts.say({ name: 'x', kind: 'code' })));

const df = CC.fold.fold([
  CC.events.make(T.S_DESIGN, { define: 'a', slots: {}, pipelineId: '' }),
  CC.events.make(T.S_DESIGN, { define: 'b', slots: {}, pipelineId: '' })
], { now: Date.now() });
t('설계도 제출 횟수를 접는다', df.sDesignCount === 2);
```

그리고 core 검사 목록 배열에 `'alerts.js'` 를 더한다.

Run: `node test/layer.test.js` — Expected: `Cannot find module '../js/core/alerts.js'`

- [ ] **Step 2: `js/core/alerts.js`**

```js
/* Cut & Check — 교사 알림 (순수 함수)
 *
 * 교사에게 "지금 볼 때"만 알린다. 무엇을 말할지는 교사가 정한다.
 * 순서("첫 번째로")·소요 시간·판정 결과는 띄우지 않는다 — 숫자와 순서가 보이면
 * 교사가 줄을 세우고, 학생은 다시 속도를 겨룬다 (CLAUDE.md "만들면 안 되는 것").
 *
 * 처음 화면을 열 때 이미 있던 제출은 알리지 않는다. 새로고침마다 알림이 쏟아지면
 * 교사는 알림을 끄고, 그 뒤로는 진짜 알림도 못 본다.
 */
(function (CC) {
  'use strict';

  function snap(students) {
    var o = {};
    (students || []).forEach(function (s) {
      if (!s) return;
      o[s.id] = { name: s.name, design: s.sDesignCount || 0, judged: (s.sCodeJudges || []).length };
    });
    return o;
  }

  function diff(prev, next) {
    if (!prev) return [];
    var out = [];
    Object.keys(next || {}).forEach(function (id) {
      var a = prev[id] || { design: 0, judged: 0 };
      var b = next[id];
      if (b.design > a.design) out.push({ id: id, name: b.name, kind: 'design' });
      if (b.judged > a.judged) out.push({ id: id, name: b.name, kind: 'code' });
    });
    return out;
  }

  function say(a) {
    var who = a.name + CC.particle(a.name, '이/가');
    return a.kind === 'design' ? who + ' 설계도를 냈어요.' : who + ' 코드 결과를 판정했어요.';
  }

  CC.alerts = { snap: snap, diff: diff, say: say };
})(window.CC = window.CC || {});
```

- [ ] **Step 3: fold 에 `sDesignCount`**

`js/core/fold.js` 의 `empty()` 에서 `sDesign: null,` 아래에 `sDesignCount: 0,` 를 더하고,
`case 's-design':` 을 다음으로 바꾼다:

```js
      case 's-design':
        s.sDesign = { define: e.define, slots: e.slots, pipelineId: e.pipelineId };
        s.sDesignCount++; break;
```

Run: `node test/layer.test.js` — Expected: `전부 통과`

- [ ] **Step 4: 교사 화면 표시**

`teacher.html`: `<script src="js/core/hangul.js"></script>` 다음 줄에 `<script src="js/core/alerts.js"></script>`.
`#dtab-students` 의 첫 자식으로:

```html
<section id="alerts" hidden>
  <h3 class="alerts-title">최근 알림</h3>
  <ol id="alert-list" class="alert-list"></ol>
</section>
<div id="toasts" class="toasts" aria-live="polite"></div>
```

`js/ui/teacher.js` 의 `renderDashboard` 위에:

```js
  /* ── 교사 알림 ─────────────────────────────────── */
  var lastSnap = null;
  function showAlert(a) {
    var text = CC.alerts.say(a);
    var host = $('#toasts');
    if (host) {
      var toast = el('div', 'toast', text);
      host.appendChild(toast);
      setTimeout(function () { toast.remove(); }, 5000);
    }
    var list = $('#alert-list');
    if (list) {
      list.insertBefore(el('li', null, text), list.firstChild);
      while (list.children.length > 10) list.removeChild(list.lastChild);
      $('#alerts').hidden = false;
    }
  }
```

`renderDashboard()` 의 마지막(`liveBanner` 분기 뒤)에:

```js
    var nowSnap = CC.alerts.snap(C.students);
    CC.alerts.diff(lastSnap, nowSnap).forEach(showAlert);
    lastSnap = nowSnap;
```

로컬 모드 갱신 — `CC._renderDashboard = renderDashboard;` 위에. 학생 탭이 `localStorage` 에 쓰면 브라우저가 다른 탭에 `storage` 이벤트를 준다 (같은 탭에는 안 준다):

```js
  /* 로컬 모드: 학생 탭이 기록하면 브라우저가 storage 이벤트를 준다. 폴링이 필요 없다. */
  window.addEventListener('storage', function () {
    if (CC.sb && CC.sb.active()) return;
    var fresh = CC.store ? CC.store.fold('나') : null;
    C.students = C.students.filter(function (s) { return s !== me && s.id !== (fresh && fresh.id); });
    if (fresh) { me = fresh; C.students = [fresh].concat(C.students); }
    renderDashboard();
  });
```
(`me` 는 파일 위쪽 `var me = CC.store ? CC.store.fold('나') : null;` 이다. 그 선언이 `else` 블록 안에 있으면 블록 밖으로 `var me = null;` 을 먼저 선언해 둔다.)

Supabase 모드 갱신 — `teacher.html` 에서 `loadStudentEvents();` 를 부르는 곳(교실 선택 시)을:

```js
    loadStudentEvents();
    clearInterval(eventTimer);
    eventTimer = setInterval(loadStudentEvents, 5000);
```
로 바꾸고, `function loadStudentEvents()` 위에 `var eventTimer = null;` 를 둔다.

`teacher.css` 끝에:

```css
.toasts { position: fixed; top: 16px; right: 16px; display: flex; flex-direction: column; gap: 8px; z-index: 50; max-width: calc(100vw - 32px); }
.toast { background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; padding: 10px 14px; font-size: 14px; box-shadow: 0 4px 16px rgba(0,0,0,.12); }
.alerts-title { font-size: 13px; margin: 0 0 6px; color: var(--ink-2); }
.alert-list { margin: 0 0 16px; padding-left: 18px; font-size: 14px; }
```

- [ ] **Step 5: E2E — 학생 탭 제출이 교사 탭 알림이 된다**

`test/e2e-flow.spec.js` 끝에:

```js
test('학생이 설계도를 내면 교사 화면에 알림이 뜬다', async ({ context, page }) => {
  await local(context);
  await seedMission(page);
  const t = await context.newPage();
  await t.goto(BASE + '/teacher.html');
  await expect(t.locator('.toast')).toHaveCount(0);     // 처음 연 때는 조용하다
  await studentToCode(page);
  await expect(t.locator('.toast')).toContainText('설계도를 냈어요.', { timeout: 5000 });
  await expect(t.locator('#alert-list li')).toHaveCount(1);
  await t.reload();
  await expect(t.locator('.toast')).toHaveCount(0);     // 새로고침해도 쏟아지지 않는다
});
```

Run: `npx playwright test test/e2e-flow.spec.js -g 알림` — Expected: PASS. 그다음 전체 테스트.

- [ ] **Step 6: 커밋**

```bash
git add js/core/alerts.js js/core/fold.js js/ui/teacher.js teacher.html teacher.css test/layer.test.js test/e2e-flow.spec.js
git commit -m "feat: 설계도 제출과 코드 판정 때 교사에게 알린다

타이밍만 알리고 말은 교사가 한다. 순서·시간·판정 결과는 띄우지 않는다.
교사 화면은 지금까지 교실을 고를 때 한 번만 기록을 읽었다 — Supabase 는 5초 폴링,
로컬은 브라우저 storage 이벤트로 갱신한다.
처음 열 때 이미 있던 제출은 알리지 않는다. 새로고침마다 쏟아지면 교사가 알림을 끈다.
거절: 소리 알림, 브라우저 Notification 권한 요청 — 수업 중 교실 스피커와 권한 팝업은 방해다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 튜터 답변 검사와 API

**Files:**
- Create: `api/_tutorguard.py`, `api/_tutor.py`, `api/tutor.py`
- Test: `test/test_tutorguard.py`

**Interfaces:**
- Consumes: `api/_schema.py` 의 `PRAISE`, `BANMAL`, `YOU`, `FOREIGN` (정규식), `api/_generate.py` 의 `pickle_llm(messages, schema, timeout) → str`, `_json(raw) → dict|None`
- Produces: `problems(answer: str, mission: dict, code: str) → list[str]`,
  `ask(question: str, mission: dict, code: str, call_llm) → {'kind': str, 'answer': str, 'refused': bool}`,
  HTTP `POST /api/tutor {question, mission: {title, itemName, items: [str]}, code}` → 200 `{kind, answer, refused}` | 400 `{error}` | 502 `{error}`.
  `kind` ∈ `syntax` · `solution_request` · `off_topic` · `guarded`.

- [ ] **Step 1: 실패하는 테스트 `test/test_tutorguard.py`**

```python
"""AI 튜터 답변 검사기(api/_tutorguard.py) · 튜터 흐름(api/_tutor.py) 검증.

막아야 하는 것을 통과시킬 것보다 많이 넣는다. 이 검사기의 일은 막는 것이다.

  uv run --with-requirements requirements.txt python test/test_tutorguard.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
from _tutor import REFUSE, ask  # noqa: E402
from _tutorguard import problems  # noqa: E402

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


M = {'title': '창고 주문서 정리', 'itemName': '상품', 'items': ['사과', '바나나', '우유']}
CODE = 'data = "사과,바나나,사과"\nparts = data.split(",")\nprint(len(set(parts)))\n'

print('[막는다]')
for name, ans in [
    ('미션 자료 값', '`"사과,배".split(",")` 처럼 쓰면 쉼표로 나눠져요.'),
    ('미션 제목', '창고 주문서 정리에서는 `split`을 써요.'),
    ('여러 줄 코드', '```\nparts = s.split(",")\nprint(len(parts))\n```'),
    ('코드 조각 둘', '`a.split()` 다음에 `len(a)` 를 쓰면 돼요.'),
    ('학생 코드 그대로', '`print(len(set(parts)))` 는 서로 다른 개수를 세요.'),
    ('방법 판단', '이 문제에서는 중복을 빼야 해요.'),
    ('정답 언급', '정답은 set 을 쓰는 거예요.'),
    ('고치는 법', '`set`으로 고치면 맞아요.'),
    ('칭찬', '훌륭한 질문이에요. `split`은 문자열을 나누는 함수예요.'),
    ('반말', '`split`은 문자열을 나누는 함수야.'),
    ('너', '너 코드에서는 `split`을 쓰고 있어요.'),
    ('너무 김', '`split`은 문자열을 나눠요. ' + '가' * 200),
    ('빈 답', ''),
]:
    r = problems(ans, M, CODE)
    t(name, bool(r), r)

print('[통과]')
for name, ans in [
    ('문법 설명 + 한 줄 예시', '`"a b c".split()` 처럼 쓰면 공백을 기준으로 나눈 목록이 나와요.'),
    ('에러 설명', 'IndentationError 는 들여쓰기가 맞지 않을 때 나오는 에러예요.'),
    ('for 문', '`for x in 목록:` 다음 줄을 들여 쓰면 목록의 값을 하나씩 꺼내요.'),
]:
    r = problems(ans, M, CODE)
    t(name, not r, r)


def fake(*replies):
    calls = []

    def call(messages, schema, timeout):
        calls.append(messages)
        return json.dumps(replies[min(len(calls) - 1, len(replies) - 1)], ensure_ascii=False)
    call.calls = calls
    return call


print('[흐름]')
llm = fake({'kind': 'solution_request', 'answer': ''})
r = ask('정답 코드 알려줘', M, CODE, llm)
t('정답 요청은 고정 문장으로 거절', r == {'kind': 'solution_request', 'answer': REFUSE['solution_request'], 'refused': True}, r)

r = ask('점심 뭐 먹어?', M, CODE, fake({'kind': 'off_topic', 'answer': ''}))
t('범위 밖은 고정 문장', r['answer'] == REFUSE['off_topic'] and r['refused'], r)

good = {'kind': 'syntax', 'answer': '`"a b".split()` 처럼 쓰면 공백으로 나눈 목록이 나와요.'}
r = ask('split 이 뭐예요?', M, CODE, fake(good))
t('문법 질문은 답한다', r['kind'] == 'syntax' and not r['refused'] and r['answer'] == good['answer'], r)

llm = fake({'kind': 'syntax', 'answer': '`"사과,배".split(",")` 처럼 써요.'}, good)
r = ask('split 이 뭐예요?', M, CODE, llm)
t('검사에 걸리면 사유를 붙여 한 번 더 묻는다', len(llm.calls) == 2 and '사과' in llm.calls[1][-1]['content'] and r == {**good, 'refused': False}, r)

bad = {'kind': 'syntax', 'answer': '이 문제에서는 중복을 빼야 해요.'}
llm = fake(bad, bad)
r = ask('어떻게 해요?', M, CODE, llm)
t('두 번 다 걸리면 고정 문장', len(llm.calls) == 2 and r['kind'] == 'guarded' and r['refused'] and r['answer'] == REFUSE['guarded'], r)

r = ask('split?', M, CODE, fake('이건 JSON 이 아님'))
t('JSON 이 아니면 고정 문장', r['kind'] == 'guarded' and r['refused'], r)

print('\n전부 통과' if not fail else f'\n실패 {fail}건')
sys.exit(1 if fail else 0)
```

Run: `uv run -q -p 3.12 --with-requirements requirements.txt python test/test_tutorguard.py`
Expected: `ModuleNotFoundError: No module named '_tutor'`

- [ ] **Step 2: `api/_tutorguard.py`**

```python
"""AI 튜터 답변 검사.

튜터는 설계도를 낸 뒤 코드 단계에서만 열린다. 방법은 학생이 이미 정했으므로
문법을 알려주는 건 판단 대행이 아니다. 대신 아래는 코드로 막는다 —
LLM 에게 "정답 주지 마"라고 말하는 것만으로는 지켜지지 않는다 (docs/llm.md).

막는 것: 이 미션의 자료·제목, 두 줄 이상 코드, 코드 조각 둘 이상, 학생 코드 옮겨 쓰기,
방법 판단, 칭찬, 반말, '너', 한자·일본어, 200자 초과.
"""
import re

from _schema import BANMAL, FOREIGN, PRAISE, YOU

MAX = 200
SEGMENT = re.compile(r'```[\s\S]*?```|`[^`\n]+`')
METHOD = re.compile(r'이 미션|이 문제|이번 자료|여기서는|학생 코드|작성한 코드|정답|답은|고치면|바꾸면 돼|넣으면 돼|'
                    r'이렇게 하면|중복을 (빼|없애|지우)')


def _sentences(text):
    plain = SEGMENT.sub('코드', text)
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+|\n+', plain) if s.strip()]


def problems(answer, mission, code=''):
    a = str(answer or '').strip()
    if not a:
        return ['빈 답변']
    out = []
    if len(a) > MAX:
        out.append(f'{MAX}자 초과 ({len(a)}자)')
    segs = SEGMENT.findall(a)
    if len(segs) > 1:
        out.append('코드 예시가 둘 이상 — 한 줄 예시 하나만')
    for s in segs:
        body = re.sub(r'^python\s*', '', s.strip('`').strip())
        if len([ln for ln in body.splitlines() if ln.strip()]) > 1:
            out.append('코드 예시가 한 줄을 넘음 — 완성 코드가 된다')
            break
    words = list(mission.get('items') or []) + [mission.get('title') or '', mission.get('itemName') or '']
    for w in words:
        w = str(w).strip()
        if len(w) >= 2 and w in a:
            out.append(f"미션 단어 '{w}' — 예시는 미션과 다른 자료로 든다")
            break
    for line in (code or '').splitlines():
        ln = line.strip()
        if len(ln) >= 8 and not ln.startswith('#') and not ln.startswith('data =') and ln in a:
            out.append('학생 코드를 답에 옮김 — 고친 코드를 돌려주지 않는다')
            break
    m = METHOD.search(a)
    if m:
        out.append(f"방법 판단 '{m.group(0)}' — 설계도는 학생이 이미 정했다")
    if PRAISE.search(a):
        out.append('칭찬 — 인정은 사람의 일이다')
    if YOU.search(a):
        out.append("'너' — 화면이 학생을 너라고 부르지 않는다")
    if FOREIGN.search(a):
        out.append('한자·일본어')
    if any(BANMAL.search(s) for s in _sentences(a)):
        out.append('반말 — 튜터는 존댓말로 쓴다')
    return out
```

- [ ] **Step 3: `api/_tutor.py`**

```python
"""AI 튜터 흐름: 분류+답변(한 번의 structured output) → 검사 → 1회 재요청 → 고정 문장.

LLM 호출은 call_llm(messages, schema, timeout) 로 주입받는다. 테스트는 가짜를 넣는다.
"""
import json

from _generate import _json
from _tutorguard import MAX, problems

REFUSE = {
    'solution_request': '코드는 직접 써 보는 거예요. 궁금한 문법이 있으면 물어봐 주세요.',
    'off_topic': '파이썬 문법 질문만 받을 수 있어요.',
    'guarded': '이 질문에는 답하기 어려워요. 궁금한 문법 이름으로 다시 물어봐 주세요.',
}

SCHEMA = {
    'type': 'object',
    'properties': {
        'kind': {'type': 'string', 'enum': ['syntax', 'solution_request', 'off_topic'],
                 'description': 'syntax: 파이썬 문법·함수·에러 이름에 대한 질문. '
                                'solution_request: 이 미션을 어떻게 푸는지, 코드를 써 달라는 질문. off_topic: 그 밖.'},
        'answer': {'type': 'string', 'maxLength': MAX,
                   'description': 'kind 가 syntax 일 때만. 존댓말 두 문장 이내. 코드 예시는 백틱 한 줄 하나까지, '
                                  '미션과 상관없는 자료로.'},
    },
    'required': ['kind', 'answer'],
    'additionalProperties': False,
}

SYSTEM = '\n'.join([
    '당신은 중학교 1학년의 파이썬 문법 튜터다.',
    '학생은 문제를 풀 방법을 이미 스스로 정했고, 그걸 코드로 옮기는 중이다.',
    '문법·함수·에러 메시지가 무슨 뜻인지만 알려준다.',
    '이 미션을 어떻게 풀지, 학생 코드를 어떻게 고칠지, 정답 코드는 절대 말하지 않는다.',
    '예시는 백틱으로 감싼 한 줄 하나까지, 미션 자료와 다른 단어로 든다.',
    '존댓말, 칭찬 없이, 200자 이내. JSON 하나만 응답한다.',
])


def ask(question, mission, code, call_llm, timeout=20):
    user = json.dumps({'question': question, 'mission_title': mission.get('title', ''),
                       'student_code': code}, ensure_ascii=False)
    msgs = [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': user}]
    for _ in range(2):
        raw = call_llm(msgs, SCHEMA, timeout)
        d = _json(raw) or {}
        kind = d.get('kind')
        if kind in ('solution_request', 'off_topic'):
            return {'kind': kind, 'answer': REFUSE[kind], 'refused': True}
        reasons = problems(d.get('answer'), mission, code) if kind == 'syntax' else ['kind 가 없음']
        if not reasons:
            return {'kind': 'syntax', 'answer': d['answer'].strip(), 'refused': False}
        msgs = msgs + [{'role': 'assistant', 'content': str(raw)},
                       {'role': 'user', 'content': '아래 문제를 고쳐 다시 답한다: ' + ' / '.join(reasons)}]
    return {'kind': 'guarded', 'answer': REFUSE['guarded'], 'refused': True}
```

Run: test 명령. Expected: `전부 통과`. 통과 사례가 막히면 정규식을 고친다 — 막아야 할 사례를 빼서 맞추지 않는다.

- [ ] **Step 4: `api/tutor.py` 핸들러**

```python
"""POST /api/tutor  { question, mission: {title, itemName, items}, code }  → { kind, answer, refused }

Vercel Python 핸들러. 일은 _tutor.py 가 하고, 여기는 HTTP 만 다룬다.
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _generate import pickle_llm  # noqa: E402
from _tutor import ask  # noqa: E402

QMAX = 300


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(200, {})

    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
        except json.JSONDecodeError:
            return self._send(400, {'error': '요청 형식이 잘못됐어요.'})
        q = str(body.get('question') or '').strip()[:QMAX]
        if not q:
            return self._send(400, {'error': '질문을 입력해 주세요.'})
        mission = body.get('mission') if isinstance(body.get('mission'), dict) else {}
        mission = {'title': str(mission.get('title') or ''), 'itemName': str(mission.get('itemName') or ''),
                   'items': [str(x) for x in (mission.get('items') or [])][:50]}
        code = str(body.get('code') or '')[:4000]
        try:
            r = ask(q, mission, code, pickle_llm)
            print('[tutor]', json.dumps({'q': q, **r}, ensure_ascii=False), file=sys.stderr)
            self._send(200, r)
        except Exception as e:  # LLM 서버 오류·키 없음
            print('[tutor] 오류', repr(e), file=sys.stderr)
            self._send(502, {'error': '튜터 서버에 연결하지 못했어요.'})
```

`vercel.json` 에 `api/generate-mission.py` 의 `maxDuration` 설정이 있으면 같은 모양으로 `api/tutor.py` 를 30초로 더한다.

- [ ] **Step 5: 실제 키로 한 번 (키가 있을 때만)**

```bash
cd api && uv run -q -p 3.12 --with-requirements ../requirements.txt python -c "
from _generate import pickle_llm; from _tutor import ask
M={'title':'창고 주문서','itemName':'상품','items':['사과','바나나']}
for q in ['split 이 뭐예요?','정답 코드 짜 주세요','IndentationError 가 뭐예요?','중복은 어떻게 빼요?']:
    print(q, '→', ask(q, M, 'data = \"사과,바나나\"', pickle_llm))"
```
결과 4줄을 리포트 "사람이 판단할 것 — 튜터 응답 샘플" 에 그대로 붙인다. 키가 없으면 "실키 확인 안 함" 이라고 적는다.

- [ ] **Step 6: 커밋**

```bash
git add api/_tutorguard.py api/_tutor.py api/tutor.py test/test_tutorguard.py vercel.json docs/overnight/2026-10-17-report.md
git commit -m "feat: 코드 단계 AI 튜터 — 문법만 답하고 정답 코드는 코드로 막는다

설계도를 낸 뒤에만 열리므로 방법 판단은 이미 학생 몫으로 끝났다. 문법 도움은 판단 대행이 아니다.
분류와 답변을 한 번의 structured output 으로 받아 지연을 줄였다.
막는 규칙(미션 자료·두 줄 코드·학생 코드 옮기기·방법 판단)은 프롬프트가 아니라 검사기가 지킨다.
거절: 질문 횟수 제한 — 코드 단계로 범위를 좁히는 쪽을 택했다(사용자 결정).
거절: 설명만 하고 예시 금지 — 중1에게 문법은 한 줄 예시 없이 안 읽힌다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 튜터 모달과 기록

**Files:**
- Create: `js/ui/tutor.js`
- Modify: `js/core/events.js`, `js/core/fold.js`, `js/data/api.js`, `sentence.html`, `sentence.css`, `js/ui/sentence.js`, `js/ui/teacher.js`
- Test: `test/layer.test.js`, `test/robust.js`, `test/e2e-flow.spec.js`

**Interfaces:**
- Consumes: `POST /api/tutor` (Task 4)
- Produces: `T.S_TUTOR = 's-tutor'` 이벤트 `{ question, answer, kind }`; fold 학생 객체 `sTutor: [{ question, answer, kind, t }]`;
  `CC.tutorApi(body) → Promise<{kind, answer, refused}>` (실패 시 reject);
  `CC.tutor.init({ rec, context })`, `CC.tutor.visible(bool)` — `context()` 는 `{ mission: {title, itemName, items}, code }` 를 돌려준다.

- [ ] **Step 1: 이벤트·접기 테스트 (실패해야 함)**

`test/layer.test.js` 의 문장형 접기 테스트 아래에:

```js
const tv = CC.events.make(T.S_TUTOR, { question: 'split 이 뭐예요?', answer: '문자열을 나눠요.', kind: 'syntax' });
t('튜터 이벤트 생성', tv.type === 's-tutor');
const tf = CC.fold.fold([tv], { now: Date.now() });
t('튜터 질문을 접는다', tf.sTutor.length === 1 && tf.sTutor[0].question === 'split 이 뭐예요?' && tf.sTutor[0].kind === 'syntax');
```

Run: `node test/layer.test.js` — Expected: FAIL (`T.S_TUTOR` undefined → `모르는 이벤트 type`)

- [ ] **Step 2: 이벤트와 접기**

`js/core/events.js` 의 `S_CODE_JUDGE: 's-code-judge'` 를 다음으로:

```js
    S_CODE_JUDGE: 's-code-judge',  /* 코드 결과 판정 { verdict, basis } */
    S_TUTOR: 's-tutor'             /* 튜터 질문 { question, answer, kind } */
```

`js/core/fold.js` 의 `empty()` 에 `sCodeJudges: []` 뒤에 `,\n      sTutor: []` 를, `apply()` 의 `s-code-judge` case 뒤에:

```js
      case 's-tutor':
        s.sTutor.push({ question: e.question, answer: e.answer, kind: e.kind, t: e.t }); break;
```

Run: `node test/layer.test.js` — Expected: `전부 통과`

- [ ] **Step 3: 데이터 층에 호출 함수**

`js/data/api.js` 의 IIFE 안 끝(`})(window.CC` 직전)에:

```js
  /* AI 튜터. 서버가 없거나 실패하면 reject — 화면은 "쓸 수 없어요"를 보여주고 수업은 계속된다. */
  CC.tutorApi = function (body) {
    return fetch('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('tutor ' + r.status);
      return r.json();
    });
  };
```

- [ ] **Step 4: `js/ui/tutor.js`**

```js
/* Cut & Check — AI 튜터 모달
 *
 * 설계도를 낸 뒤 코드 단계에서만 보인다. 문법만 답한다 (api/_tutorguard.py 가 지킨다).
 * 질문과 답은 그대로 기록되어 교사 화면에 올라간다 — 학생 자유 입력이므로.
 * 서버가 없으면 모달은 열리고 "쓸 수 없어요"만 말한다. 수업 흐름은 막지 않는다.
 */
(function (CC) {
  'use strict';

  var UNAVAILABLE = '지금은 튜터를 쓸 수 없어요.';
  var opt = null;

  function $(s) { return document.querySelector(s); }
  function bubble(cls, text) {
    var d = document.createElement('div');
    d.className = 'tutor-msg ' + cls;
    d.textContent = text;
    $('#tutor-log').appendChild(d);
    $('#tutor-log').scrollTop = $('#tutor-log').scrollHeight;
  }

  function send(e) {
    e.preventDefault();
    var q = $('#tutor-q').value.trim();
    if (!q || !opt) return;
    $('#tutor-q').value = '';
    $('#tutor-send').disabled = true;
    bubble('me', q);
    var ctx = opt.context();
    CC.tutorApi({ question: q, mission: ctx.mission, code: ctx.code })
      .catch(function () { return { kind: 'unavailable', answer: UNAVAILABLE, refused: true }; })
      .then(function (r) {
        bubble('ai', r.answer);
        opt.rec(CC.events.T.S_TUTOR, { question: q, answer: r.answer, kind: r.kind });
        $('#tutor-send').disabled = false;
        $('#tutor-q').focus();
      });
  }

  CC.tutor = {
    init: function (o) {
      opt = o;
      $('#tutor-open').addEventListener('click', function () { $('#tutor').showModal(); $('#tutor-q').focus(); });
      $('#tutor-close').addEventListener('click', function () { $('#tutor').close(); });
      $('#tutor-form').addEventListener('submit', send);
    },
    visible: function (on) {
      $('#tutor-open').hidden = !on;
      if (!on && $('#tutor').open) $('#tutor').close();
    }
  };
})(window.CC = window.CC || {});
```

- [ ] **Step 5: 마크업·스타일·연결**

`sentence.html` 의 `</body>` 위, 스크립트들보다 앞에:

```html
<button id="tutor-open" class="tutor-open" type="button" hidden>파이썬 문법 물어보기</button>
<dialog id="tutor" class="tutor" aria-labelledby="tutor-title">
  <div class="tutor-head">
    <h2 id="tutor-title">파이썬 문법 물어보기</h2>
    <button id="tutor-close" type="button" aria-label="닫기">×</button>
  </div>
  <p class="tutor-note">문법이나 에러 뜻을 물어볼 수 있어요. 코드는 직접 써요.</p>
  <div id="tutor-log" class="tutor-log"></div>
  <form id="tutor-form" class="tutor-form">
    <textarea id="tutor-q" rows="2" maxlength="300" placeholder="예: split 은 뭐예요?"></textarea>
    <button id="tutor-send" class="btn primary" type="submit">보내기</button>
  </form>
</dialog>
```
스크립트 목록에서 `js/ui/sentence.js` 앞에 `<script src="js/ui/tutor.js"></script>`.

`sentence.css` 끝에:

```css
.tutor-open { position: fixed; right: 16px; bottom: 16px; z-index: 40; padding: 12px 16px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font-size: 14px; font-weight: 700; box-shadow: 0 4px 16px rgba(0,0,0,.12); cursor: pointer; }
.tutor { width: min(420px, calc(100vw - 32px)); max-height: min(560px, calc(100vh - 32px)); padding: 0; border: 1px solid var(--line-strong); border-radius: 14px; background: var(--surface); color: var(--ink); }
.tutor::backdrop { background: rgba(0,0,0,.25); }
.tutor-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.tutor-head h2 { font-size: 15px; margin: 0; }
.tutor-head button { border: 0; background: none; font-size: 20px; color: var(--ink-2); cursor: pointer; }
.tutor-note { margin: 0; padding: 8px 16px; font-size: 12px; color: var(--ink-3); }
.tutor-log { display: flex; flex-direction: column; gap: 8px; padding: 8px 16px; min-height: 120px; max-height: 320px; overflow-y: auto; }
.tutor-msg { padding: 8px 12px; border-radius: 10px; font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.tutor-msg.me { align-self: flex-end; background: var(--green-soft); }
.tutor-msg.ai { align-self: flex-start; background: var(--surface-2); }
.tutor-form { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); }
.tutor-form textarea { flex: 1; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 8px; font: inherit; font-size: 14px; background: var(--surface); color: var(--ink); resize: none; }
```

`js/ui/sentence.js`:
- `rec` 정의 바로 아래에:
  ```js
  if (CC.tutor) CC.tutor.init({
    rec: rec,
    context: function () {
      var items = [];
      (M ? M.inputs : []).forEach(function (inp) { items = items.concat(String(inp.v).split(/[,\n]/)); });
      return {
        mission: { title: M ? M.title : '', itemName: M ? (M.itemName || '') : '', items: items.map(function (x) { return x.trim(); }).filter(Boolean) },
        code: ($('#code-editor') || {}).value || ''
      };
    }
  });
  ```
- `function showStep(n)` 본문 첫 줄에: `if (CC.tutor) CC.tutor.visible(n === 4);`

`js/ui/teacher.js` 의 `openDetail` 에서 `if (s.sWrap) {` 블록 바로 위에:

```js
    if (s.sTutor && s.sTutor.length) {
      var bt = el('div', 'dbox');
      bt.appendChild(el('span', 'k', '튜터에게 물은 것 (' + s.sTutor.length + '회)'));
      s.sTutor.forEach(function (x) {
        bt.appendChild(el('div', 'v', 'Q. ' + x.question));
        bt.appendChild(el('div', 'v', 'A. ' + x.answer));
      });
      g.appendChild(bt);
    }
```
(`el()` 은 `textContent` 로 넣으므로 학생 입력이 HTML 로 해석되지 않는다.)

- [ ] **Step 6: E2E — 버튼은 코드 단계에서만, 서버 없음/있음**

`test/e2e-flow.spec.js` 끝에:

```js
test('튜터는 설계도를 낸 뒤 코드 단계에서만 보인다', async ({ context, page }) => {
  await local(context);
  await seedMission(page);
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await expect(page.locator('#tutor-open')).toBeHidden();
  await page.locator('#go-define').click();
  await expect(page.locator('#tutor-open')).toBeHidden();
  await page.locator('.define-card').first().click();
  await page.locator('#go-method').click();
  await expect(page.locator('#tutor-open')).toBeHidden();
  for (const s of await page.locator('select.slot:visible').all()) await s.selectOption({ index: 1 });
  await page.locator('#go-run').click();
  await expect(page.locator('#tutor-open')).toBeVisible();
  await page.locator('#back-method').click();
  await expect(page.locator('#tutor-open')).toBeHidden();
});

test('튜터: 서버가 없으면 쓸 수 없다고만 말하고, 있으면 답한다', async ({ context, page }) => {
  await local(context);
  await seedMission(page);
  await studentToCode(page);
  await page.locator('#tutor-open').click();
  await page.locator('#tutor-q').fill('split 이 뭐예요?');
  await page.locator('#tutor-send').click();
  await expect(page.locator('.tutor-msg.ai').last()).toHaveText('지금은 튜터를 쓸 수 없어요.');

  await page.route('**/api/tutor', r => r.fulfill({ contentType: 'application/json',
    body: JSON.stringify({ kind: 'syntax', answer: '`"a b".split()` 처럼 쓰면 나눈 목록이 나와요.', refused: false }) }));
  await page.locator('#tutor-q').fill('split 이 뭐예요?');
  await page.locator('#tutor-send').click();
  await expect(page.locator('.tutor-msg.ai').last()).toContainText('나눈 목록');
  const evs = await page.evaluate(() => JSON.parse(localStorage.getItem('cutcheck.events') || '[]'));
  expect(evs.filter(e => e.type === 's-tutor').length).toBe(2);
});
```
`cutcheck.events` 는 `js/data/store.js` 의 저장 키다. 다르면 `store.js` 의 `KEY` 값으로 바꾼다.

- [ ] **Step 7: robust 경로**

`test/robust.js` 의 학생 흐름에서 `await p.locator('#go-run').click();` 다음 줄에:

```js
  await p.locator('#tutor-open').click();
  await p.locator('#tutor-q').fill(EVIL);
  await p.locator('#tutor-send').click(); await p.waitForTimeout(300);
  await p.locator('#tutor-close').click();
```
교사 화면 검사 부분에서 학생 상세를 연 뒤 `window.__pwned` 를 확인하는 기존 검사가 이 입력도 덮는지 본다. 상세를 열지 않는다면, 기존 마무리 문장 확인과 같은 방식으로 `튜터에게 물은 것` 이 보이는지와 `__pwned` 가 없는지를 더한다.

- [ ] **Step 8: 전체 테스트 → 커밋**

```bash
git add js/ui/tutor.js js/core/events.js js/core/fold.js js/data/api.js sentence.html sentence.css js/ui/sentence.js js/ui/teacher.js test/layer.test.js test/robust.js test/e2e-flow.spec.js
git commit -m "feat: 코드 단계에 튜터 모달 — 문의창처럼 묻고, 기록은 교사에게

버튼은 코드 단계(showStep 4)에서만 보인다. 설계도를 내야 그 단계에 간다.
네이티브 <dialog> 를 써서 Esc·포커스 가두기를 브라우저에 맡겼다.
서버가 없으면 '쓸 수 없어요'만 말하고 질문은 그대로 기록한다 — 서버는 수업의 조건이 아니다.
fetch 는 js/data/api.js 에 두었다. 화면은 서버가 있는지 모른다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 파이썬 실행 보강

**Files:**
- Create: `js/ui/pyworker.js`, `js/core/pyerr.js`
- Modify: `js/ui/sentence.js` (Pyodide 로딩·실행 부분), `sentence.html` (스크립트)
- Test: `test/layer.test.js`, `test/e2e-flow.spec.js`, `test/robust.js`

**Interfaces:**
- Produces: `CC.pyerr.short(message: string) → string` (학생에게 보여줄 한 줄),
  `CC.pyerr.TIMEOUT` (문자열). Worker 메시지: 보냄 `{id, code}`, 받음 `{type:'ready'}` · `{type:'load-error', error}` · `{type:'done', id, output, error}`.

설계 결정 (스펙 7절 마지막 문단): **새 이벤트 type 을 만들지 않는다.** Worker 로 옮기면 무한루프도 5초 뒤
"시간 초과" 결과로 돌아오므로 기존 `s-code` 를 실행 후에 기록해도 빠지는 시도가 없다. `s-code` 의 의미가 바뀌지 않으므로 스키마도 그대로.

- [ ] **Step 1: 에러 요약 테스트 (실패해야 함)**

`test/layer.test.js` require 에 `require('../js/core/pyerr.js');`, core 검사 목록에 `'pyerr.js'` 를 더하고:

```js
console.log('\n[파이썬 에러] 위치와 사실만');
const tb = 'Traceback (most recent call last):\n  File "/lib/python311.zip/_pyodide/_base.py", line 571, in eval_code\n' +
  '  File "<exec>", line 3, in <module>\nNameError: name \'pars\' is not defined';
t('줄 번호와 마지막 줄', CC.pyerr.short(tb) === "3번째 줄: NameError: name 'pars' is not defined");
t('input() 은 쓸 수 없다고 알려준다', /input\(\)을 쓸 수 없어요/.test(CC.pyerr.short('RuntimeError: __NO_INPUT__')));
t('줄 번호가 없으면 마지막 줄만', CC.pyerr.short('SyntaxError: invalid syntax') === 'SyntaxError: invalid syntax');
t('원인을 해석하지 않는다', !/때문|하세요|넣으|고치/.test(CC.pyerr.short(tb)));
```

Run: `node test/layer.test.js` — Expected: `Cannot find module '../js/core/pyerr.js'`

- [ ] **Step 2: `js/core/pyerr.js`**

```js
/* Cut & Check — 파이썬 에러를 학생 화면용 한 줄로
 *
 * 에러는 위치와 사실만 (CLAUDE.md 화면 문구 규칙). 몇 번째 줄인지와 파이썬이 한 말만 남기고,
 * 원인은 해석하지 않는다 — 그건 학생이 찾아야 할 결론이다.
 */
(function (CC) {
  'use strict';

  var NO_INPUT = '이 화면에서는 input()을 쓸 수 없어요. 자료는 data에 들어 있어요.';

  function short(msg) {
    var m = String(msg || '');
    if (m.indexOf('__NO_INPUT__') >= 0) return NO_INPUT;
    var lines = m.trim().split('\n').filter(function (x) { return x.trim(); });
    var last = (lines[lines.length - 1] || m).trim();
    var no = null, re = /File "<exec>", line (\d+)/g, x;
    while ((x = re.exec(m))) no = x[1];
    return no ? no + '번째 줄: ' + last : last;
  }

  CC.pyerr = { short: short, TIMEOUT: '5초 안에 끝나지 않아서 멈췄어요.', NO_INPUT: NO_INPUT };
})(window.CC = window.CC || {});
```

Run: `node test/layer.test.js` — Expected: `전부 통과`

- [ ] **Step 3: `js/ui/pyworker.js`**

```js
/* Pyodide 를 메인 스레드 밖에서 돌린다.
 *
 * 메인 스레드에서 runPython 을 부르면 파이썬이 끝날 때까지 돌아오지 않는다.
 * while True: 하나에 탭 전체가 멈추고, 자바스크립트에는 실행 중인 코드를 밖에서 끊을 방법이 없다.
 * Worker 에 두면 화면은 살아 있고, 화면 쪽이 5초 뒤 worker 를 통째로 종료한다.
 */
importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');

var ready = loadPyodide().then(function (py) {
  /* input() 은 브라우저 prompt 창을 띄운다. 자료는 data 변수로 주므로 막는다. */
  py.runPython('import builtins\ndef _no_input(*a):\n    raise RuntimeError("__NO_INPUT__")\nbuiltins.input = _no_input');
  return py;
});

ready.then(function () { postMessage({ type: 'ready' }); },
  function (e) { postMessage({ type: 'load-error', error: String(e) }); });

onmessage = function (e) {
  ready.then(function (py) {
    py.runPython('import io, sys; sys.stdout = io.StringIO()');
    var output = '', error = '';
    try {
      py.runPython(e.data.code);
    } catch (x) {
      error = String((x && x.message) || x);
    }
    output = py.runPython('sys.stdout.getvalue()');
    postMessage({ type: 'done', id: e.data.id, output: output, error: error });
  });
};
```

- [ ] **Step 4: `sentence.js` 실행부 교체**

`sentence.html` 스크립트 목록에서 `js/core/engine.js` 다음에 `<script src="js/core/pyerr.js"></script>` 를 더한다.
`pyodide.js` CDN 태그는 **남긴다** — `file://` 에서 Worker 가 막힐 때 쓰는 대비 경로다.

`sentence.js` 의 `/* Pyodide 로딩 */` 부터 `if (typeof loadPyodide === 'function') { ... }` 블록 끝까지를 아래로 바꾼다:

```js
  /* Pyodide — Worker 에서 돌린다 (js/ui/pyworker.js 머리말).
   * file:// 처럼 Worker 를 못 만드는 곳에서는 예전처럼 메인 스레드에서 돈다 — 그때는 시간 제한이 없다. */
  var pyodideReady = false;
  var py = (function () {
    var w = null, pending = null, seq = 0, main = null;

    function status(text, ready) {
      pyodideReady = ready;
      if ($('#pyodide-status')) $('#pyodide-status').textContent = text;
      if ($('#run-code')) $('#run-code').disabled = !ready;
    }

    function boot() {
      status('Python 로딩 중...', false);
      try { w = new Worker('js/ui/pyworker.js'); } catch (e) { w = null; return bootMain(); }
      w.onmessage = function (e) {
        var d = e.data;
        if (d.type === 'ready') status('Python 준비 완료', true);
        else if (d.type === 'load-error') status('Python을 불러오지 못했어요. 코드는 계속 쓸 수 있어요.', false);
        else if (d.type === 'done' && pending && pending.id === d.id) {
          clearTimeout(pending.timer);
          var cb = pending.cb; pending = null;
          cb(d.output, d.error ? CC.pyerr.short(d.error) : '');
        }
      };
      w.onerror = function () { w = null; bootMain(); };
    }

    function bootMain() {
      if (typeof loadPyodide !== 'function') return status('Python을 불러오지 못했어요. 코드는 계속 쓸 수 있어요.', false);
      loadPyodide().then(function (p) {
        p.runPython('import builtins\ndef _no_input(*a):\n    raise RuntimeError("__NO_INPUT__")\nbuiltins.input = _no_input');
        main = p; status('Python 준비 완료', true);
      }, function () { status('Python을 불러오지 못했어요. 코드는 계속 쓸 수 있어요.', false); });
    }

    function run(code, cb) {
      if (main) {
        main.runPython('import io, sys; sys.stdout = io.StringIO()');
        var err = '';
        try { main.runPython(code); } catch (x) { err = CC.pyerr.short(String((x && x.message) || x)); }
        return cb(main.runPython('sys.stdout.getvalue()'), err);
      }
      var id = ++seq;
      var timer = setTimeout(function () {
        pending = null;
        w.terminate();
        boot();                       /* 새 worker 가 준비될 때까지 실행 버튼은 꺼져 있다 */
        cb('', CC.pyerr.TIMEOUT);
      }, 5000);
      pending = { id: id, cb: cb, timer: timer };
      if ($('#run-code')) $('#run-code').disabled = true;
      w.postMessage({ id: id, code: code });
    }

    boot();
    return { run: run };
  })();
```

`renderCodeStep` 안의 `if ($('#run-code')) $('#run-code').disabled = !pyodideReady;` 는 그대로 둔다.

실행 버튼 핸들러에서 `if (!pyodideReady || !pyodideObj) return;` 부터 `/* 이벤트 기록 */ rec('s-code', ...);` 와 `/* 판정 표시 */` 블록까지를
콜백 안으로 옮긴다. 모양:

```js
    $('#run-code').addEventListener('click', function () {
      if (!pyodideReady) return;
      var code = $('#code-editor').value;
      var dataVal = $('#code-data-select') ? $('#code-data-select').value : '';
      var fullCode = 'data = "' + dataVal.replace(/"/g, '\\"') + '"\n' + code.replace(/^data = ".*"\n?/m, '');

      py.run(fullCode, function (output, error) {
        /* ── 여기부터 기존 "결과 표시" · "이벤트 기록" · "판정 표시" 코드 그대로 ── */
      });
    });
```
worker 경로에서는 `done` 을 받은 뒤 실행 버튼을 다시 켠다 — `w.onmessage` 의 `done` 분기에서 `cb(...)` 호출 앞에
`if ($('#run-code')) $('#run-code').disabled = false;` 를 넣는다 (시간 초과 경로는 `boot()` 가 준비될 때 켠다).
버튼 상태는 `py` 안에서만 다룬다.

- [ ] **Step 5: E2E — 무한루프, input(), 에러 줄 번호**

`test/e2e-flow.spec.js` 끝에:

```js
test('무한루프는 5초 뒤 멈추고 화면은 살아 있다', async ({ context, page }) => {
  test.setTimeout(180000);
  await local(context);
  await seedMission(page);
  await studentToCode(page);
  await waitPython(page);
  await page.locator('#code-editor').fill('data = "a"\nwhile True:\n    pass\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#run-code')).toBeDisabled();
  await page.locator('#back-method').click();                          // 그동안에도 화면은 반응한다
  await expect(page.locator('#step3')).toHaveClass(/active/);
  await page.locator('#go-run').click();
  await expect(page.locator('#code-result')).toHaveText('5초 안에 끝나지 않아서 멈췄어요.', { timeout: 10000 });
  await expect(page.locator('#run-code')).toBeDisabled();              // 새 worker 준비 전
  await waitPython(page);
  await page.locator('#code-editor').fill('data = "a"\nprint(1)\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toHaveText('1', { timeout: 10000 });
  const evs = await page.evaluate(() => JSON.parse(localStorage.getItem('cutcheck.events') || '[]'));
  expect(evs.some(e => e.type === 's-code' && e.error === '5초 안에 끝나지 않아서 멈췄어요.')).toBe(true);
});

test('input() 과 에러는 위치와 사실만', async ({ context, page }) => {
  test.setTimeout(120000);
  await local(context);
  await seedMission(page);
  await studentToCode(page);
  await waitPython(page);
  await page.locator('#code-editor').fill('data = "a"\nx = input()\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toContainText('input()을 쓸 수 없어요', { timeout: 10000 });
  await waitPython(page);
  await page.locator('#code-editor').fill('data = "a"\nparts = 1\nprint(pars)\n');
  await page.locator('#run-code').click();
  await expect(page.locator('#code-result')).toHaveText(/^3번째 줄: NameError/, { timeout: 10000 });
});
```
`#step3` 이 방법 단계 id 가 아니면 `showStep` 이 쓰는 id 로 바꾼다. `#back-method` 를 눌렀을 때 `go-run` 이 다시 `s-design` 을 기록하는 건 기존 동작이다.

- [ ] **Step 6: robust·smoke 가 비동기 실행을 기다리게**

`test/robust.js` 의 `await p.locator('#run-code').click(); await p.waitForTimeout(200);` 을:

```js
  await p.waitForFunction(() => document.querySelector('#pyodide-status').textContent === 'Python 준비 완료', null, { timeout: 60000 });
  await p.locator('#run-code').click();
  await p.locator('#code-output').waitFor({ state: 'visible', timeout: 10000 });
```
로 바꾼다. 코드 에디터 기본값(`data = ...` + 주석)은 출력이 없어도 에러가 아니므로 판정 버튼이 나온다.

Run: 전체 테스트 + `npx playwright test test/e2e-flow.spec.js`. Expected: 전부 통과.

- [ ] **Step 7: 커밋**

```bash
git add js/ui/pyworker.js js/core/pyerr.js js/ui/sentence.js sentence.html test/layer.test.js test/e2e-flow.spec.js test/robust.js
git commit -m "fix: 파이썬을 Worker 에서 돌려 무한루프가 탭을 멈추지 않게 한다

runPython 은 메인 스레드에서 끝날 때까지 돌아오지 않아 while True: 하나에 탭이 멈췄고,
멈추게 만든 코드는 기록되지 않아 교사가 그 순간을 볼 수 없었다.
Worker 를 5초 뒤 종료하면 시간 초과도 s-code 결과로 남는다 — 새 이벤트 type 이 필요 없다.
input() 은 prompt 창 대신 사실을 알리고, 에러는 줄 번호와 파이썬이 한 말만 보여준다.
거절: 실행 전에 따로 기록하는 새 이벤트 — Worker 로 옮기면 빠지는 시도가 없어 불필요.
거절: Pyodide setInterruptBuffer — SharedArrayBuffer 가 COOP/COEP 헤더를 요구한다. 정적 호스팅에서 못 켠다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 최종 평가와 리포트

**Files:**
- Modify: `docs/overnight/2026-10-17-report.md`, 스펙 문서 (사실 정정)

- [ ] **Step 1: 전체 테스트 + E2E 전체**

```bash
<전체 테스트> && uv run -q -p 3.12 --with-requirements requirements.txt python test/test_tutorguard.py \
  && npx playwright test test/e2e-flow.spec.js --reporter=line 2>&1 | tee docs/overnight/e2e-final.txt
```

- [ ] **Step 2: 화면 스크린샷**

```bash
node test/shots.js 2>&1 | tail -5
```
`shots.js` 가 만든 경로를 리포트 "핵심 흐름 E2E" 에 적는다. 튜터 모달 열린 화면과 교사 알림이 뜬 화면이 없으면
E2E 테스트 안에서 `await page.screenshot({ path: 'docs/overnight/tutor.png' })` · `await t.screenshot({ path: 'docs/overnight/alert.png' })` 로 찍어 더한다.

- [ ] **Step 3: 리포트 완성**

`docs/overnight/2026-10-17-report.md` 의 모든 절을 채운다:
- 작업별 결과 표: Task 0~7 각각 완료 / 부분 완료 / 건너뜀 + 커밋 해시 (`git log --oneline` 에서)
- eval 지표 표: 회차별 한 줄씩 (Task 2 에서 쌓은 것), 마지막에 시작 → 끝 비교
- 핵심 흐름 E2E: 테스트별 통과 여부, Task 1 기준선과 비교, 스크린샷 경로
- 사람이 판단할 것: 튜터 응답 샘플, eval 회차별 미션 원문, 검사 규칙이 정상 문장을 막는다고 본 사례, 되돌린 작업과 사유
- 트러블슈팅에 추가된 항목: `git diff <시작 커밋> -- docs/트러블슈팅.md` 의 제목들
- 테스트 결과 원문: Step 1 출력
- 설정: 자동 압축 60% 설정 여부

- [ ] **Step 4: 커밋**

```bash
git add docs/overnight/
git commit -m "docs: 밤샘 작업 리포트

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
push 하지 않는다.
