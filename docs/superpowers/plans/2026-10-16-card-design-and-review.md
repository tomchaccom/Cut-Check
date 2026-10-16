# 설계 카드 · 코드 뼈대 · 생성 검수 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 설계 단계를 빈칸 문장에서 동작 카드로 바꾸고, 설계도를 코드 주석 뼈대로 넘기며, 미션 생성에서 성공 조건·방법을 코드가 쓰고 생성 직전 LLM 검수(재생성 2번 → 교사 검수)를 넣는다.

**Architecture:** 카드 카탈로그는 `js/core/cards.js` 한 곳(순수 함수, `pipelineId` 로 결정). 서버는 카드를 모르고 `pipelineId`·`filterDesc` 만 낸다. 생성은 `generate()`(초안 하나) 위에 `make_mission()`(검수·재생성 루프)을 얹고 핸들러가 `make_mission` 을 부른다.

**Tech Stack:** 정적 HTML + ES5 스크립트(번들러·ES 모듈 없음), Python 3 Vercel 함수 + pydantic, Playwright E2E, node 단위 테스트.

**Spec:** `docs/superpowers/specs/2026-10-16-card-design-and-review-design.md`

## Global Constraints

- core 층(`js/core/*`)은 `localStorage` · `fetch` · `document` · `window` 를 쓰지 않는다 (`test/layer.test.js` 가 검사).
- 번들러·ES 모듈(import/export) 금지. 새 스크립트는 `<script src>` 로 순서대로 싣는다. ES5 문법(var, function)을 따른다.
- 학생 화면 문장은 존댓말, 학생을 `너`라 부르지 않는다, 칭찬·점수·판정 없음. 반말은 `js/core/asks.js` 에만.
- **카드 순서·세부를 정답과 대조하는 채점 함수를 만들지 않는다** (CLAUDE.md 금지 목록).
- 세부 보기에 대놓고 틀린 보기("항상 숫자 3")를 넣지 않는다.
- 함수 이름(split · set · len)을 학생 화면에 보여주지 않는다.
- 학생이 쓴 코드를 덮어쓰지 않는다 — 에디터가 비었거나 직전 뼈대 그대로일 때만 새 뼈대를 넣는다.
- 검수 결과(`guard.review`)는 교사 화면에만. 교사가 확정할 때 `guard` 를 떼는 기존 동작을 유지한다.
- Vercel 함수 60초 — 요청 전체에 `DEADLINE = 55` 초. 재생성은 남은 시간 25초 초과일 때만.
- 서버를 필수로 만들지 않는다. push · PR 은 사람이 시킬 때만. `git add .` 금지(파일 이름으로).
- 커밋 전 전체 테스트: `node test/engine.test.js`, `hangul`, `llmguard`, `layer`, `node test/smoke.js`, `node test/robust.js`, `test/test_*.py` 4개(pydantic 있는 `/usr/local/bin/python3`), `npx playwright test test/e2e-flow.spec.js`.
- 커밋 메시지에 "왜"와 "거절한 선택지". 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- 문제가 생기면 `docs/트러블슈팅.md` 를 먼저 찾고, 해결을 확인한 뒤에만 그 파일에 적는다.

## Review Focus

1. **예전 기록(`slots` 만 있고 `cards` 가 없는 `s-method`/`s-design`)** — 교사 화면·학생 "내 기록"이 깨지지 않고 예전처럼 슬롯 값을 보여줘야 한다. → Task 4 layer 테스트, Task 5 교사 표시.
2. **학생이 코드를 쓴 뒤 "설계 수정" 으로 카드를 바꾸면** — 쓴 코드가 남아 있어야 한다. → Task 4 E2E.
3. **`filterDesc` 가 없는 예전 미션(Supabase 에 저장된 생성 미션)** — 골라내기 카드 세부 이름이 `목록에` 로 나와야 한다. → Task 1 cards 테스트.
4. **검수 LLM 이 JSON 이 아닌 걸 돌려주거나 항목이 빠짐** — 생성이 실패하지 않고 교사 검수로 넘어가야 한다. → Task 3 테스트.
5. **다른 미션으로 바꿨을 때 앞 미션의 코드가 에디터에 남음** — 새 미션은 새 뼈대로 시작해야 한다 (지금 `loadMission` 이 에디터를 비우지 않는다). → Task 4 E2E.

---

## 파일 구조

| 파일 | 책임 | 작업 |
|---|---|---|
| `js/core/cards.js` (새) | 카드 카탈로그 · 헷갈리는 카드 표 · 카드 문장 · 코드 뼈대 | 1 |
| `test/cards.test.js` (새) | 위 단위 테스트 | 1 |
| `test/llmguard.test.js` | 카드 문구를 "실제 문장" 검사에 추가 | 1 |
| `api/_schema.py` | LLM 칸에서 goals·sentences 제거, 요청 "구할 값" 규칙 | 2 |
| `api/_generate.py` | 성공 조건 보기 코드 작성, 요청 기본 틀, `filterDesc` 내보내기, `generate(feedback, t0)` | 2 |
| `test/test_generate.py` | 위에 맞춰 수정 | 2 |
| `api/_review.py` (새) | LLM 검수 `review()` · 루프 `make_mission()` | 3 |
| `api/generate-mission.py` | `make_mission` 호출 | 3 |
| `test/test_review.py` (새) | 검수 흐름 5가지 | 3 |
| `test/eval_generate.py` | `make_mission` + 검수 지표 | 3 |
| `sentence.html` · `sentence.css` · `js/ui/sentence.js` | 자료 2개, 카드 화면, 뼈대, 옛 빈칸 UI·실행 단계 삭제 | 4 |
| `js/core/missions.js` | sm1·sm2·sm3 에 `pipelineId`, sm-filter-1 에 `filterDesc` | 4 |
| `js/core/events.js` · `js/core/fold.js` | 방법·설계 이벤트에 `cards` | 4 |
| `test/layer.test.js` · `test/e2e-flow.spec.js` · `test/robust.js` | 카드 흐름 | 4 |
| `test/e2e-pipeline.spec.js` | **삭제** — 지운 빈칸·실행 단계(`#slot-sep`, `.data-card`)만 검사한다 | 4 |
| `teacher.html` · `js/ui/teacher.js` | 초안 카드 미리보기 · 검수 배지 · 학생 설계 카드 표시 | 5 |
| `docs/eval.md` · `docs/eval-raw.json` | 최종 eval | 6 |

---

### Task 1: 카드 카탈로그 (`js/core/cards.js`)

**Files:**
- Create: `js/core/cards.js`, `test/cards.test.js`
- Modify: `test/llmguard.test.js` (실제 문장 검사 끝부분, `fixed.forEach` 앞)

**Interfaces:**
- Consumes: `CC.pipeline.WHITELIST` (`js/core/pipeline.js`, `[{id, ops}]`)
- Produces:
  - `CC.cards.forMission(m) → [{op, label, detail: {name, options[]} | null, decoy: bool}]` — 가나다순 고정. 모르는 `pipelineId` 면 `[]`.
  - `CC.cards.text(c) → string` — `c = {label, detail}` 이고 `detail` 은 `'기준: 쉼표'` 같은 문자열 또는 `''`. 예: `'나누기 (기준: 쉼표)'`.
  - `CC.cards.skeleton(picked) → string` — `picked = [{op, label, detail}]`. 결과 예:
    `'# 1. 나누기 (기준: 쉼표)\n\n# 2. 개수 세기\n\n'`
  - `CC.cards.ALL_LABELS → string[]` (llmguard 검사용)

- [ ] **Step 1: 실패하는 테스트 작성** — `test/cards.test.js`

```js
/* test/cards.test.js — 설계 카드 카탈로그
 *   node test/cards.test.js
 */
global.window = global;
require('../js/core/pipeline.js');
require('../js/core/cards.js');
const CC = global.CC;
let fail = 0;
const t = (name, ok, extra) => { console.log((ok ? '  ok  ' : '  FAIL') + ' ' + name); if (!ok) { fail++; if (extra !== undefined) console.log('       → ' + JSON.stringify(extra)); } };

CC.pipeline.WHITELIST.forEach(w => {
  const cards = CC.cards.forMission({ pipelineId: w.id, filterDesc: '알레르기 목록' });
  const real = cards.filter(c => !c.decoy), decoy = cards.filter(c => c.decoy);
  t(w.id + ': 연산마다 카드 하나', real.length === w.ops.length, cards.map(c => c.op));
  t(w.id + ': 헷갈리는 카드 1장, 그 유형에 없는 연산', decoy.length === 1 && w.ops.indexOf(decoy[0].op) < 0, decoy);
  const labels = cards.map(c => c.label);
  t(w.id + ': 카드 이름이 겹치지 않는다', new Set(labels).size === labels.length, labels);
  t(w.id + ': 가나다순 (고르는 순서를 드러내지 않는다)', labels.join() === labels.slice().sort((a, b) => a.localeCompare(b, 'ko')).join(), labels);
});

const f = CC.cards.forMission({ pipelineId: 'split-filter-count', filterDesc: '알레르기 목록' }).filter(c => c.op === 'filter')[0];
t('골라내기 세부 이름에 걸러낼 대상 이름', f.detail.name === '알레르기 목록에', f.detail);
const old = CC.cards.forMission({ pipelineId: 'split-filter-count' }).filter(c => c.op === 'filter')[0];
t('filterDesc 가 없는 예전 미션은 "목록에"', old.detail.name === '목록에', old.detail);
const num = CC.cards.forMission({ pipelineId: 'split-filter-num-sum' }).filter(c => c.op === 'filter')[0];
t('숫자 유형의 골라내기는 "글자 빼기", 세부 없음', num.label === '글자 빼기' && num.detail === null, num);
t('모르는 유형은 빈 목록', CC.cards.forMission({ pipelineId: 'nope' }).length === 0 && CC.cards.forMission(null).length === 0);

t('카드 문장', CC.cards.text({ label: '나누기', detail: '기준: 쉼표' }) === '나누기 (기준: 쉼표)' &&
  CC.cards.text({ label: '개수 세기', detail: '' }) === '개수 세기');
t('코드 뼈대 — 번호 주석과 빈 줄',
  CC.cards.skeleton([{ op: 'split', label: '나누기', detail: '기준: 쉼표' }, { op: 'count', label: '개수 세기', detail: '' }]) ===
  '# 1. 나누기 (기준: 쉼표)\n\n# 2. 개수 세기\n\n');
const every = CC.cards.ALL_LABELS.join(' ');
t('함수 이름을 보여주지 않는다', !/split|set|len|sum|sort|join|strip|int\(/.test(every), every);
t('대놓고 틀린 보기 없음', !/항상|숫자 3/.test(every), every);

console.log('\n' + (fail ? 'FAIL ' + fail : '전부 통과'));
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: 실패 확인**

Run: `node test/cards.test.js`
Expected: `Cannot find module '../js/core/cards.js'`

- [ ] **Step 3: 구현** — `js/core/cards.js`

```js
/* Cut & Check — 설계 카드 (core)
 *
 * 연산 하나 = 카드 하나 ≈ 코드 한 줄. 미션의 pipelineId 로 정해진다 — 서버는 카드를 모른다.
 * 채점하지 않는다: 학생이 고른 카드 순서를 정답과 대조하는 함수는 여기 없고, 만들지 않는다.
 * 틀린 설계는 코드를 반례로 돌릴 때 학생이 스스로 발견한다.
 */
(function (CC) {
  'use strict';

  var CARD = {
    split:      { label: '나누기', detail: { name: '기준', options: ['쉼표', '공백', '줄바꿈'] } },
    filter:     { label: '골라내기', detail: { name: '{desc}에', options: ['있는 것만', '없는 것만'] } },
    filterNum:  { label: '글자 빼기' },
    toNumber:   { label: '숫자로 바꾸기' },
    transform:  { label: '항목마다 다듬기', detail: { name: '어떻게', options: ['앞뒤 공백 없애기', '첫 글자만 남기기'] } },
    unique:     { label: '겹친 것은 하나만' },
    sort:       { label: '순서대로 늘어놓기', detail: { name: '순서', options: ['가나다순', '거꾸로'] } },
    join:       { label: '다시 이어 붙이기', detail: { name: '이을 때', options: ['쉼표', '공백'] } },
    count:      { label: '개수 세기' },
    sum:        { label: '모두 더하기' },
    max:        { label: '가장 큰 값 찾기' },
    min:        { label: '가장 작은 값 찾기' },
    groupCount: { label: '항목마다 몇 번인지 세기' }
  };

  /* 헷갈리는 카드 — 그 유형에 없는 연산. 무작위면 교사와 학생이 다른 화면을 본다 */
  var DECOY = {
    'split-count': 'unique', 'split-unique-count': 'sort', 'split-filter-count': 'unique',
    'split-filter-join': 'sort', 'split-filter-unique-count': 'sort', 'split-sort-join': 'unique',
    'split-filter-sort-join': 'unique', 'split-transform-join': 'sort',
    'split-transform-unique-count': 'sort', 'split-num-sum': 'max', 'split-num-max': 'sum',
    'split-num-min': 'max', 'split-group': 'unique', 'split-filter-num-sum': 'max'
  };

  function opsOf(pid) {
    var w = CC.pipeline.WHITELIST.filter(function (x) { return x.id === pid; })[0];
    return w ? w.ops : null;
  }

  function make(op, all, m, decoy) {
    var c = CARD[op === 'filter' && all.indexOf('toNumber') >= 0 ? 'filterNum' : op];
    var d = c.detail ? {
      name: c.detail.name.replace('{desc}', (m && m.filterDesc) || '목록'),
      options: c.detail.options.slice()
    } : null;
    return { op: op, label: c.label, detail: d, decoy: !!decoy };
  }

  function forMission(m) {
    var all = m && opsOf(m.pipelineId);
    if (!all) return [];
    var list = all.map(function (op) { return make(op, all, m, false); });
    list.push(make(DECOY[m.pipelineId], all, m, true));
    /* 가나다순 — 늘 같은 순서라 교사도 같은 화면을 보고, 처리 순서를 드러내지 않는다 */
    return list.sort(function (a, b) { return a.label.localeCompare(b.label, 'ko'); });
  }

  function text(c) {
    return c.label + (c.detail ? ' (' + c.detail + ')' : '');
  }

  function skeleton(picked) {
    return picked.map(function (c, i) { return '# ' + (i + 1) + '. ' + text(c) + '\n\n'; }).join('');
  }

  var ALL_LABELS = [];
  Object.keys(CARD).forEach(function (k) {
    ALL_LABELS.push(CARD[k].label);
    if (CARD[k].detail) ALL_LABELS = ALL_LABELS.concat(CARD[k].detail.options);
  });

  CC.cards = { forMission: forMission, text: text, skeleton: skeleton, ALL_LABELS: ALL_LABELS };
})(window.CC = window.CC || {});
```

- [ ] **Step 4: 통과 확인**

Run: `node test/cards.test.js`
Expected: `전부 통과`. `node test/layer.test.js` 도 통과 (core 금지어 검사가 새 파일을 자동으로 훑는다).

- [ ] **Step 5: 카드 문구를 llmguard 실제 문장 검사에 넣기** — `test/llmguard.test.js` 의 `if (fixed.length !== 7)` 줄 **뒤**, `fixed.forEach` **앞**에:

```js
/* 설계 카드 문구 — 학생 화면에 그대로 나간다. 고정 문장 개수(7) 확인 뒤에 더한다 */
require('../js/core/pipeline.js'); require('../js/core/cards.js');
CC.cards.ALL_LABELS.forEach(x => fixed.push(x));
```

Run: `node test/llmguard.test.js`
Expected: 마지막 줄 `실제 문장 전부 통과`. 카드 문구가 걸리면 문구를 고친다(규칙을 고치지 않는다).

- [ ] **Step 6: 커밋**

```bash
git add js/core/cards.js test/cards.test.js test/llmguard.test.js
git commit -F - <<'EOF'
feat: 설계 카드 카탈로그를 core 에 둔다

왜: 빈칸 문장 설계가 시험지처럼 보였다 (스펙 2026-10-16). 연산 하나를 카드 하나로,
카드는 pipelineId 로 정해지게 core 한 곳에 둔다 — 서버와 화면이 같은 표를 본다.
헷갈리는 카드는 고정 표, 목록은 가나다순 (교사·학생이 같은 화면, 처리 순서를 숨김).

거절: 카드를 미션 데이터에 싣기 (LLM 이 쓰면 문장이 흔들린다), 무작위 헷갈리는 카드,
정답 순서 대조 함수 (CLAUDE.md 채점 금지).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: 생성 — 성공 조건·방법을 코드가 쓰고, 요청에 "구할 값"

**Files:**
- Modify: `api/_schema.py` (`_draft`, `_Base._guard`, `_check_text` 의 `said`, `_check_goals`·`_check_steps` 삭제, 빈칸 문장 전용 상수 삭제)
- Modify: `api/_generate.py` (`ORDER`, `_fallback`, `_options`, `_assemble`, `generate` 서명, `SYSTEM`)
- Test: `test/test_generate.py`

**Interfaces:**
- Produces:
  - `generate(lesson, key_point, call_llm=pickle_llm, feedback=None, t0=None) → mission` — `feedback` 은 문자열 목록(검수 이유). `t0` 는 `time.monotonic()` 값; 주면 `DEADLINE` 을 그 시각부터 센다.
  - 미션 dict: `method` 키 **없음**. `pipelineId`, `define.options`(코드가 씀), `filterDesc`(골라내기 유형일 때), `inputs`, `guard`.
  - `_schema.KEY_TARGET: dict[key → regex 문자열]`, `_generate.BRIEF_FALLBACK: dict[key → 문장 틀]`

- [ ] **Step 1: 테스트를 새 설계에 맞게 고치기** — `test/test_generate.py`

`GOOD` 에서 `goals`·`sentences` 를 빼고 요청에 구할 값을 넣는다:

```python
GOOD = {**DATA[U], 'brief': '이번 주 재료가 모두 몇 가지인지 알려 주세요.',
        'counter': {'name': '수요일 재료'}}
```

`base()` 의 기본 요청도 바꾼다 (14개 유형 테스트가 요청 기본 틀 없이 통과하게 하려면 유형마다 맞는 말이 필요하므로, `DATA` 는 그대로 두고 그 테스트의 기대만 고친다 — 아래).

다음 기대를 바꾼다:
- `'유형 고르기는 작은 스키마, 초안은 그 유형 스키마만'` → 초안 스키마에 `Steps_` 대신 `'goals' not in` 과 `'sentences' not in`:

```python
t('초안 스키마에 성공 조건·방법 칸이 없다 — 코드가 쓴다',
  'pipelineId' in json.dumps(llm.calls[0]['schema'])
  and '"goals"' not in json.dumps(llm.calls[1]['schema']) and '"sentences"' not in json.dumps(llm.calls[1]['schema']))
```
- `'방법 문장은 빈칸 순서대로, 보기는 코드가 붙인다'` 와 `'빈칸은 코드가 끼운다'` 를 지우고 다음으로 바꾼다:

```python
t('미션에 method 가 없다 — 카드는 화면이 pipelineId 로 꺼낸다', 'method' not in m and m['pipelineId'] == U)
t('성공 조건 보기는 코드 문장: 진짜(키마다) + 함정 둘',
  sorted(o.get('key') or o['trap'] for o in m['define']['options']) == ['hardcode', 'luck', 'total', 'unique'], m['define'])
```
- `[두 번 다 틀림 → 틀린 칸만 기본 틀로]` 블록: `bad['goals']`·`bad['sentences']` 대신 요청을 틀리게:

```python
bad = copy.deepcopy(GOOD)
bad['brief'] = '재료 목록을 정리해 주세요.'  # 구할 값이 없다
m, _ = quiet(generate, '리스트', '중복', fake(U, bad, bad, bad))
t('brief 만 바뀐다', m['guard']['fallback'] == ['brief'], m['guard'])
t('요청 기본 틀에는 구할 값이 있다', '몇' in m['brief'], m['brief'])
t('맞았던 칸은 LLM 것 그대로', m['title'] == GOOD['title'])
```
- 14개 유형 블록의 `ok` 를: `ok = 'brief' in m['guard']['fallback'] or re.search(KEY_TARGET[first_key], m['brief'])` 로 (DATA 의 요청은 구할 값이 없으므로 기본 틀로 바뀌는 게 맞다). 파일 위에 `import re` 와 `from _schema import KEY_TARGET` 추가, 루프 안에서 `first_key = next(iter(SPEC[pid]['keys']))`.
- `[방법 문장 길이는 빈칸 이름을 빼고 센다]` 블록(`_g['sentences']` 를 쓰는 다섯 줄)을 지운다 — 방법 문장 칸이 없어진다.
- `[빠진 칸을 채운 뒤에야 드러나는 칸도 갈아 끼운다]` 의 이름 `'counter · goals · sentences 다음에 brief 까지'` → `'빠진 칸 다음에 brief 까지'` (기대는 그대로 `fallback[-1] == 'brief'`).
- 새 테스트 추가 (`[보내는 스키마` 블록 앞):

```python
print('\n[요청에는 구할 값이 있어야 한다]')
from _schema import DRAFTS  # noqa: E402
for brief, ok in [('이번 주 재료가 모두 몇 가지인지 알려 주세요.', True), ('재료 목록을 정리해 주세요.', False)]:
    _, b = _generate._parse(U, {**copy.deepcopy(GOOD), 'brief': brief})
    t(f"'{brief}' → {'통과' if ok else '걸림'}", ('brief' not in b) == ok, b)
for pid in SPEC:
    k = next(iter(SPEC[pid]['keys']))
    fb = _generate.BRIEF_FALLBACK[k].format(item='재료', iga='가', eunneun='는')
    t(f'{pid}: 요청 기본 틀이 구할 값 규칙을 지킨다', re.search(KEY_TARGET[k], fb), fb)

print('\n[골라내기 유형은 걸러낼 대상 이름을 미션에 싣는다 — 카드 세부 이름]')
m, _ = quiet(generate, '수업', '핵심', fake('split-filter-count', *[DATA['split-filter-count']] * 3))
t('filterDesc', m.get('filterDesc') == '알레르기 목록', m.get('filterDesc'))

print('\n[검수 이유를 받아 다시 만들 때 프롬프트에 넣는다]')
llm = fake(U, GOOD)
quiet(lambda: generate('리스트', '중복', llm, feedback=['세 자료가 다른 이야기예요']))
t('feedback 이 사용자 메시지에', '세 자료가 다른 이야기예요' in llm.calls[1]['messages'][-1]['content'])
```

- [ ] **Step 2: 실패 확인**

Run: `/usr/local/bin/python3 test/test_generate.py | grep -E "FAIL|ALL"`
Expected: FAIL 여러 개 (`KEY_TARGET` import 에러가 먼저 날 수 있다).

- [ ] **Step 3: `api/_schema.py` 구현**

1. `KEY_MEAN` 아래에 추가:

```python
# 요청 문장에 있어야 하는 '구할 값' 말. 첫 번째 정답 key 로 고른다 (사람 결정 2026-10-16)
KEY_TARGET = {
    'count': r'몇', 'total': r'몇', 'unique': r'몇', 'filtered_count': r'몇', 'group': r'몇|횟수',
    'sum': r'얼마|합|모두 더', 'filtered_sum': r'얼마|합|모두 더', 'max': r'가장|제일', 'min': r'가장|제일',
    'sorted': r'순서|차례', 'filtered': r'목록|명단', 'transformed': r'목록|명단',
}
```

2. `_Base._guard` 에서 `bad += self._check_goals() + self._check_steps(spec)` 를 다음으로:

```python
        key = next(iter(spec['keys']))
        if not re.search(KEY_TARGET[key], self.brief):
            bad.append(('brief', f"'{self.brief}' — 구할 값이 없음. '{KEY_TARGET[key].split('|')[0]}' 처럼 "
                                 '무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)'))
```

3. `_check_text` 의 `said` 에서 `'goals'`·`'sentences'` 두 줄을 지우고, 길이 계산을 원래대로 `n = len(t)` 로 (빈칸 이름 예외가 필요 없어졌다). 그 위 주석 두 줄도 지운다.
4. `_check_goals`, `_check_steps` 메서드를 지운다.
5. `_draft()` 에서 `goals`·`steps`·`verb_hint`·`example` 정의와 `fields` 의 `'goals'`·`'sentences'` 를 지운다.
6. `brief` 필드 설명에 같은 규칙을 쓴다 (`grep -n "brief: str" api/_schema.py` 로 찾는다): 설명 끝에 `' 무엇을 알아내야 하는지("몇 가지", "모두 얼마", "가장 큰")는 꼭 쓴다.'` 를 붙인다.
7. 이제 안 쓰는 이름을 지운다: `STEP_EXAMPLE`, `STEP_EXAMPLE_NUM_COND`, `JOSA_START`, `_has_batchim`, `template`, `SLOT_VERB`, `StepParts`. 지우기 전에 `grep -rn "<이름>" api test` 로 다른 사용처가 없는지 본다 (`test_pipeline_parity.py` 가 쓰면 남긴다).

- [ ] **Step 4: `api/_generate.py` 구현**

1. import 에서 지운 이름(`STEP_EXAMPLE`, `STEP_EXAMPLE_NUM_COND`, `template` 등)을 뺀다.
2. `SYSTEM` 에 줄 추가 (`'- 칭찬하지 않는다. 한국어만 쓴다.',` 다음): `'- 성공 조건과 처리 방법은 코드가 붙인다. 당신은 쓰지 않는다.',`
3. `CORRECT` 아래에 요청 기본 틀:

```python
BRIEF_FALLBACK = {  # 요청 기본 틀 — 구할 값만 말하고 방법은 말하지 않는다
    'count': '{item}{iga} 모두 몇 개인지 알려 주세요.', 'total': '{item}{iga} 모두 몇 개인지 알려 주세요.',
    'unique': '{item}{iga} 모두 몇 가지인지 알려 주세요.', 'filtered_count': '조건에 맞는 {item}{iga} 몇 개인지 알려 주세요.',
    'filtered': '조건에 맞는 {item}만 남긴 목록을 만들어 주세요.', 'sorted': '{item}{eunneun} 순서대로 놓은 목록을 만들어 주세요.',
    'transformed': '{item} 목록을 깔끔하게 다시 만들어 주세요.', 'sum': '모두 더하면 얼마인지 알려 주세요.',
    'filtered_sum': '숫자를 모두 더하면 얼마인지 알려 주세요.', 'max': '가장 큰 값이 얼마인지 알려 주세요.',
    'min': '가장 작은 값이 얼마인지 알려 주세요.', 'group': '{item}마다 몇 번 나왔는지 알려 주세요.',
}
```

4. `_fallback`: `brief` 분기를

```python
    if field == 'brief':
        key = next(iter(SPEC[pid]['keys']))
        return BRIEF_FALLBACK[key].format(item=item, iga=_josa(item, '이가'), eunneun=_josa(item, '은는'))
```

   `goals`·`sentences` 분기를 지운다. `ORDER` 에서 `'goals', 'sentences'` 를 뺀다.
5. `_options` 의 진짜 보기 줄을 코드 문장으로:

```python
    item = m.get('itemName') or '항목'
    opts += [{'v': CORRECT[k].format(item=item, iga=_josa(item, '이가')), 'trap': None, 'key': k}
             for k in SPEC[pid]['keys']]
```

6. `_assemble`: `'method': {...}` 두 줄을 지우고, `if m.get('filterTarget'):` 블록 안에 `mission['filterDesc'] = m.get('filterDesc', '')` 추가.
7. `generate` 서명과 시작:

```python
def generate(lesson, key_point, call_llm=pickle_llm, feedback=None, t0=None):
    t0 = t0 or time.monotonic()  # make_mission 이 주면 요청 전체 시간을 같이 쓴다
    left = lambda: DEADLINE - (time.monotonic() - t0)  # noqa: E731
```

   그리고 초안 메시지의 사용자 내용 끝에:

```python
    ask = f'오늘 수업: {lesson}\n핵심: {key_point}\n유형: {DESC[pid]}\n\n이 수업과 이어지는 문제 하나를 만드세요.'
    if feedback:  # 검수에서 걸린 이유 — 처음부터 다시 만들 때만 온다
        ask += '\n\n지난번 문제는 검수에서 이렇게 걸렸습니다. 이번엔 피하세요:\n' + '\n'.join('- ' + f for f in feedback)
```

- [ ] **Step 5: 통과 확인**

Run: `for t in test/test_*.py; do /usr/local/bin/python3 $t >/dev/null 2>&1 && echo "$t ok" || echo "$t FAIL"; done`
Expected: 4개 모두 ok. 실패하면 `/usr/local/bin/python3 test/test_generate.py | grep -A2 FAIL`.

- [ ] **Step 6: 커밋**

```bash
git add api/_schema.py api/_generate.py test/test_generate.py
git commit -F - <<'EOF'
feat: 성공 조건·방법은 코드가 쓰고, 요청에는 구할 값을 쓴다

왜: 학생이 뜻을 모르던 성공 조건("하나로 정한 기준이 맞으면 성공")은 LLM 문장이었고,
기본 틀로 바뀌던 칸이 거의 다 방법 문장이었다. LLM 은 이야기만 쓰고 판단 뼈대는 코드가 쓴다.
요청이 "수를 세어 보세요" 처럼 무슨 수인지 없어 이해가 안 됐다 — 구할 값 규칙을 검사기와
스키마 설명에 같은 말로 넣는다 (둘이 어긋나면 모델이 못 맞춘다, PR #30·#31).

거절: LLM 문장을 더 다듬기 (계속 흔들렸다), 구할 값 규칙 없이 기본 틀만 고치기.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: 생성 직전 LLM 검수 (`api/_review.py`)

**Files:**
- Create: `api/_review.py`, `test/test_review.py`
- Modify: `api/generate-mission.py`, `test/eval_generate.py`

**Interfaces:**
- Consumes: `generate(lesson, key_point, call_llm, feedback, t0)`, `GenerateError`, `DEADLINE`, `pickle_llm`, `_json` (Task 2)
- Produces:
  - `review(mission, call_llm, timeout) → list[str]` — 빈 목록이면 통과. 응답이 JSON 이 아니면 `ValueError`.
  - `make_mission(lesson, key_point, call_llm=pickle_llm) → mission` — `mission['guard']['review'] = {'status': 'pass' | 'teacher', 'reasons': [str], 'rounds': int}`

- [ ] **Step 1: 실패하는 테스트** — `test/test_review.py`

```python
"""생성 직전 LLM 검수 흐름 — LLM 은 가짜.

  /usr/local/bin/python3 test/test_review.py
"""
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'api'))
import _review  # noqa: E402
from _review import make_mission, review  # noqa: E402

sys.path.insert(0, os.path.join(ROOT, 'test'))
from test_generate import DATA  # noqa: E402  — 14개 유형 자료 초안 (모듈 끝의 sys.exit 는 아래에서 막는다)

fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:300])


U = 'split-unique-count'
DRAFT = {**DATA[U], 'brief': '이번 주 재료가 모두 몇 가지인지 알려 주세요.', 'counter': {'name': '수요일 재료'}}
OK = {k: {'ok': True, 'why': '좋아요'} for k in ('understand', 'sameStory', 'noAnswer', 'easy')}
BAD = {**OK, 'sameStory': {'ok': False, 'why': '셋째 자료만 다른 이야기예요'}}


def fake(*reviews):
    """스키마로 누구를 부르는지 가린다: 유형 고르기 / 초안 / 검수. reviews 는 차례대로 쓰고, 예외면 던진다."""
    calls = {'type': 0, 'draft': 0, 'review': 0, 'feedback': []}

    def call(messages, schema, timeout):
        s = json.dumps(schema)
        if '"understand"' in s:
            r = reviews[calls['review']]
            calls['review'] += 1
            if isinstance(r, Exception):
                raise r
            return r if isinstance(r, str) else json.dumps(r, ensure_ascii=False)
        if '"pipelineId"' in s:
            calls['type'] += 1
            return json.dumps({'pipelineId': U})
        calls['draft'] += 1
        calls['feedback'].append('검수에서' in messages[-1]['content'])
        return json.dumps(DRAFT, ensure_ascii=False)
    call.calls = calls
    return call


def quiet(fn):
    err, sys.stderr = sys.stderr, io.StringIO()
    try:
        return fn()
    finally:
        sys.stderr = err


print('[통과]')
llm = fake(OK)
m = quiet(lambda: make_mission('리스트', '중복', llm))
t('한 번에 통과', m['guard']['review'] == {'status': 'pass', 'reasons': [], 'rounds': 1}, m['guard'].get('review'))

print('[1번 탈락 후 통과]')
llm = fake(BAD, OK)
m = quiet(lambda: make_mission('리스트', '중복', llm))
t('다시 만들어 통과', m['guard']['review']['status'] == 'pass' and m['guard']['review']['rounds'] == 2, m['guard']['review'])
t('다시 만들 때 검수 이유를 넣는다', llm.calls['feedback'] == [False, True], llm.calls['feedback'])

print('[3번 탈락 → 교사]')
llm = fake(BAD, BAD, BAD, OK)
m = quiet(lambda: make_mission('리스트', '중복', llm))
r = m['guard']['review']
t('재생성은 2번까지', llm.calls['review'] == 3 and llm.calls['draft'] == 3, llm.calls)
t('교사 검수 + 이유', r['status'] == 'teacher' and any('다른 이야기' in x for x in r['reasons']), r)

print('[검수 호출 실패 · JSON 아님 → 교사]')
for name, bad in [('호출 실패', RuntimeError('504')), ('JSON 아님', '검수 못 함'), ('항목 빠짐', {'understand': {'ok': True, 'why': ''}})]:
    m = quiet(lambda: make_mission('리스트', '중복', fake(bad)))
    r = m['guard']['review']
    t(name + ' — 생성은 실패하지 않고 교사로', r['status'] == 'teacher' and r['reasons'], r)

print('[시간 부족 → 재생성 없음]')
real = _review.DEADLINE
_review.DEADLINE = 20  # 첫 검수 뒤 남은 시간이 25초 안
try:
    llm = fake(BAD, OK)
    m = quiet(lambda: make_mission('리스트', '중복', llm))
    t('다시 만들지 않고 교사로', llm.calls['draft'] == 1 and m['guard']['review']['status'] == 'teacher', llm.calls)
finally:
    _review.DEADLINE = real

print('[review 는 학생이 볼 문장만 넘긴다]')
seen = {}


def spy(messages, schema, timeout):
    seen['user'] = messages[-1]['content']
    return json.dumps(OK)


mission = {'title': '급식', 'brief': '몇 가지인지 알려 주세요.', 'situation': '', 'guard': {'reasons': {'x': ['비밀']}},
           'inputs': [{'name': '월', 'v': '밥,국'}], 'define': {'options': [{'v': '2가 나오면 성공', 'trap': 'hardcode'}]}}
t('통과면 빈 목록', review(mission, spy, 10) == [])
t('guard·함정 표시는 넘기지 않는다', '비밀' not in seen['user'] and 'hardcode' not in seen['user'], seen['user'])

print(f'\n{"FAIL " + str(fail) if fail else "ALL PASS"}')
sys.exit(1 if fail else 0)
```

`test_generate.py` 를 import 하면 그 파일의 테스트가 돌고 끝에서 `sys.exit` 한다. 그래서 `test_generate.py` 마지막 두 줄을 다음으로 바꾼다:

```python
if __name__ == '__main__':
    print(f'\n{"FAIL " + str(fail) if fail else "ALL PASS"}')
    sys.exit(1 if fail else 0)
```

(import 될 때도 테스트 출력이 나오지만 결과에는 영향이 없다 — 출력은 `quiet` 밖이므로 그대로 보인다. 거슬리면 `DATA` 를 `test/fixtures_generate.py` 로 옮기는 건 하지 않는다: 파일을 늘리지 않는다.)

- [ ] **Step 2: 실패 확인**

Run: `/usr/local/bin/python3 test/test_review.py`
Expected: `ModuleNotFoundError: No module named '_review'`

- [ ] **Step 3: 구현** — `api/_review.py`

```python
"""생성 직전 LLM 검수와 재생성 루프.

학생이 볼 문장과 자료 그대로 넘겨 네 가지를 묻는다. 탈락하면 이유를 붙여 처음부터 다시 만든다
(최대 2번). 그래도 탈락하거나 시간이 모자라거나 검수를 못 하면 교사 검수로 넘긴다 — 내보낼지는
교사가 정한다 (사람 결정 2026-10-16). 검수 문장은 교사 화면에만 간다.
"""
import json
import sys
import time

from _generate import DEADLINE, GenerateError, _json, generate, pickle_llm

MAX_REGEN = 2
REGEN_NEEDS = 25   # 초. 다시 만들고(~8초) 다시 검수(~3초)할 여유
REVIEW_NEEDS = 5   # 초. 이만큼도 없으면 검수 없이 교사에게

ITEMS = {
    'understand': '중1이 요청을 읽고 무엇을 구해야 하는지 아는가',
    'sameStory': '세 자료가 같은 이야기인가 (과일 목록과 문구 목록이 섞이면 아니다)',
    'noAnswer': '요청·상황 문장에 답이나 푸는 방법이 드러나지 않았나',
    'easy': '쉬운 말로 짧게 썼나',
}
SCHEMA = {
    'type': 'object',
    'properties': {k: {'type': 'object', 'description': v,
                       'properties': {'ok': {'type': 'boolean'}, 'why': {'type': 'string', 'description': '교사에게 한 문장'}},
                       'required': ['ok', 'why'], 'additionalProperties': False} for k, v in ITEMS.items()},
    'required': list(ITEMS), 'additionalProperties': False,
}
SYSTEM = '\n'.join([
    '당신은 중학교 1학년 수업에 쓸 문제를 학생에게 내기 직전에 검수한다.',
    '학생이 볼 문장과 자료만 보고 항목마다 ok 와 이유 한 문장을 쓴다.',
    *[f'- {k}: {v}' for k, v in ITEMS.items()],
    'JSON 하나만 응답한다.',
])


def review(mission, call_llm, timeout):
    """→ 걸린 이유 목록. 빈 목록이면 통과. 응답이 JSON 이 아니면 ValueError."""
    shown = {  # guard · 함정 표시는 넘기지 않는다 — 학생이 보는 것만
        '제목': mission.get('title', ''), '요청': mission.get('brief', ''), '상황': mission.get('situation', ''),
        '자료': [f"{i['name']}: {i['v']}" for i in mission.get('inputs', [])],
        '성공 조건 보기': [o['v'] for o in mission.get('define', {}).get('options', [])],
    }
    raw = call_llm([{'role': 'system', 'content': SYSTEM},
                    {'role': 'user', 'content': json.dumps(shown, ensure_ascii=False)}], SCHEMA, timeout)
    d = _json(raw)
    if not isinstance(d, dict):
        raise ValueError('검수 응답이 JSON 이 아님')
    out = []
    for k, label in ITEMS.items():
        v = d.get(k) if isinstance(d.get(k), dict) else {}
        if v.get('ok') is not True:
            out.append(f"{label.split(' (')[0]} — {v.get('why') or '답이 없어요'}")
    return out


def make_mission(lesson, key_point, call_llm=pickle_llm):
    t0 = time.monotonic()
    left = lambda: DEADLINE - (time.monotonic() - t0)  # noqa: E731
    m, feedback, rounds, status, reasons = None, None, 0, 'teacher', []
    while True:
        try:
            m = generate(lesson, key_point, call_llm, feedback=feedback, t0=t0)
        except GenerateError:
            if m is None:
                raise
            reasons = reasons + ['다시 만들기에 실패해서 앞 문제를 보여 드려요']
            break
        if left() < REVIEW_NEEDS:
            reasons = ['검수할 시간이 모자랐어요']
            break
        rounds += 1
        try:
            reasons = review(m, call_llm, min(15, left()))
        except Exception as e:  # noqa: BLE001 — 504·JSON 아님 등. 생성은 살리고 교사에게
            print('[generate-mission] 검수 실패', repr(e), file=sys.stderr)
            reasons = ['검수를 못 했어요']
            break
        if not reasons:
            status = 'pass'
            break
        print(f'[generate-mission] 검수 {rounds}차 탈락', json.dumps(reasons, ensure_ascii=False), file=sys.stderr)
        if rounds > MAX_REGEN or left() < REGEN_NEEDS:
            break
        feedback = reasons
    m['guard']['review'] = {'status': status, 'reasons': reasons, 'rounds': rounds}
    return m
```

주의: `make_mission` 안의 `DEADLINE` 은 이 모듈의 이름이어야 테스트가 `_review.DEADLINE` 을 바꿀 수 있다 (`from _generate import DEADLINE` 로 가져온 이름을 그대로 쓰면 된다 — `left` 가 호출될 때 모듈 전역을 읽는다).

- [ ] **Step 4: 핸들러** — `api/generate-mission.py`

`from _generate import GenerateError, generate` 를 `from _generate import GenerateError` 와 `from _review import make_mission` 으로, `self._send(200, generate(lesson, key_point))` 를 `self._send(200, make_mission(lesson, key_point))` 로.

- [ ] **Step 5: 통과 확인**

Run: `for t in test/test_*.py; do /usr/local/bin/python3 $t >/dev/null 2>&1 && echo "$t ok" || echo "$t FAIL"; done`
Expected: 5개 모두 ok.

- [ ] **Step 6: eval** — `test/eval_generate.py`

1. import 에 `from _review import make_mission` 추가, `run_case` 의 `m = generate(lesson, key_point, call)` → `m = make_mission(lesson, key_point, call)`.
2. 요약표(`'| 나온 유형 가짓수 |'` 줄 다음)에:

```python
    rv = [r['guard'].get('review', {}) for r in ok]
    L.append(f'| 검수 1차 통과 | {sum(1 for x in rv if x.get("status") == "pass" and x.get("rounds") == 1)} / {len(ok)} |')
    L.append(f'| 검수 통과 (재생성 포함) | {sum(1 for x in rv if x.get("status") == "pass")} / {len(ok)} |')
    L.append(f'| 교사 검수로 넘어감 | {sum(1 for x in rv if x.get("status") == "teacher")} / {len(ok)} |')
```

3. 미션별 상세에서 `m['method']` 를 쓰는 곳이 있으면 지우고(`grep -n "method" test/eval_generate.py`), `guard.review` 가 teacher 면 `- 검수: ` + 이유를 한 줄로 남긴다.

Run (실제 LLM, 약 2~3분): `set -a; . ./.env; set +a; uv run --with-requirements requirements.txt python test/eval_generate.py`
Expected: 생성 성공 ≥ 9/10. 결과를 커밋 메시지에 옮긴다. LLM 서버 장애면 `docs/트러블슈팅.md` 를 먼저 본다.

- [ ] **Step 7: 커밋**

```bash
git add api/_review.py api/generate-mission.py test/test_review.py test/test_generate.py test/eval_generate.py docs/eval.md docs/eval-raw.json
git commit -F - <<'EOF'
feat: 미션을 내보내기 직전에 LLM 이 검수하고, 안 되면 교사에게 넘긴다

왜: 규칙 검사기는 형식만 본다 — 과일·문구가 섞인 자료, 무슨 수인지 모를 요청은 통과했다.
학생이 볼 문장 그대로 네 가지를 묻고, 탈락하면 이유를 붙여 처음부터 다시 만든다 (최대 2번).
그래도 안 되면 '검수 필요' 로 교사에게 — 내보낼지는 교사 판단 (사람 결정).
검수 호출이 실패해도 생성은 살린다.

eval: (결과 숫자)

거절: 탈락 시 자동 폐기 (교사가 고쳐 쓸 수 있는 초안을 버린다), 무제한 재생성 (Vercel 60초).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: 학생 화면 — 자료 2개, 카드 설계, 코드 뼈대

**Files:**
- Modify: `sentence.html` (step1 자료 칸 ~68-69줄, step3 ~97-140줄, 스크립트 목록 ~281-283줄)
- Modify: `sentence.css` (카드 스타일 추가)
- Modify: `js/ui/sentence.js` (`loadMission`, `summarizeMethod`, `checkMethodComplete`, `onSlotChange`, `#go-run` 핸들러, `renderCodeStep`, 기록 보기 ~921줄, `renderRunStep`·`renderResult` 삭제)
- Modify: `js/core/missions.js` (sm1·sm2·sm3, sm-filter-1)
- Modify: `js/core/events.js` (주석), `js/core/fold.js` (`s-method`·`s-remethod`·`s-design`)
- Test: `test/layer.test.js`, `test/e2e-flow.spec.js`, `test/robust.js`
- Delete: `test/e2e-pipeline.spec.js`

**Interfaces:**
- Consumes: `CC.cards.forMission`, `CC.cards.text`, `CC.cards.skeleton` (Task 1). 미션의 `pipelineId`, `filterDesc` (Task 2).
- Produces (이벤트):
  - `s-method { cards: [{op, label, detail}], reason, pipelineId }` · `s-remethod { toCards: [...], reason }`
  - `s-design { define, cards: [...], pipelineId }`
  - `detail` 은 `'기준: 쉼표'` 같은 문자열, 세부 없는 카드는 `''`.
  - fold: `sMethod = { slots, cards, reason }`, `sDesign = { define, slots, cards, pipelineId }` — 예전 기록은 `cards` 가 `undefined`.

- [ ] **Step 1: fold 테스트 먼저** — `test/layer.test.js` 의 `'문장형 접기 — 버전'` 테스트 다음에:

```js
/* 카드 설계 — 새 기록은 cards, 예전 기록(slots 만)도 그대로 접힌다 */
const card = [{ op: 'split', label: '나누기', detail: '기준: 쉼표' }, { op: 'count', label: '개수 세기', detail: '' }];
const cf = CC.fold([
  CC.events.make('s-method', { cards: card, reason: '쉼표니까', pipelineId: 'split-count' }),
  CC.events.make('s-design', { define: '몇 개', cards: card, pipelineId: 'split-count' })
]);
const cs = cf[Object.keys(cf)[0]];
t('카드 접기 — 방법', cs.sMethod && cs.sMethod.cards.length === 2 && cs.sMethod.cards[0].detail === '기준: 쉼표');
t('카드 접기 — 설계', cs.sDesign && cs.sDesign.cards[1].label === '개수 세기');
t('예전 기록은 cards 없이 slots 그대로', sf.sMethod.cards === undefined && sf.sMethod.slots.sep === '쉼표');
```

(`CC.fold` 의 실제 호출 모양은 같은 파일 위쪽 `sf` 를 만드는 줄을 따라 맞춘다 — 학생 id·좌석이 필요하면 그 줄과 같은 인자를 쓴다.)

Run: `node test/layer.test.js` → Expected: 새 테스트 FAIL.

- [ ] **Step 2: fold · events** — `js/core/fold.js`

```js
      case 's-method':
        s.sMethod = { slots: e.slots, cards: e.cards, reason: e.reason };
        s.sMethodVer++; break;
      case 's-remethod':
        s.sMethod = { slots: e.toSlots, cards: e.toCards, reason: e.reason };
        s.sMethodVer++; break;
```
```js
      case 's-design':
        s.sDesign = { define: e.define, slots: e.slots, cards: e.cards, pipelineId: e.pipelineId };
        s.sDesignCount++; break;
```

`js/core/events.js` 주석 세 줄:
```js
    S_METHOD: 's-method',          /* 방법 확정 { cards, reason, pipelineId } — 예전 기록은 slots */
    S_REMETHOD: 's-remethod',      /* 방법 수정 { toCards, reason } — 예전 기록은 toSlots */
    S_DESIGN: 's-design',          /* 설계 제출 { define, cards, pipelineId } — 예전 기록은 slots */
```

Run: `node test/layer.test.js` → Expected: `전부 통과`.

- [ ] **Step 3: 기본 미션** — `js/core/missions.js`

sm1·sm2·sm3 는 모두 나누기 → 같은 이름 하나만 → 개수 세기다. 각 객체의 `type: 'sentence',` 다음 줄에 `pipelineId: 'split-unique-count',` 를 넣고 `method: {...}` 블록을 지운다. sm-filter-1 에는 `pipelineId` 옆에 `filterDesc: '주의 재료 목록',` 을 넣고 `method` 블록을 지운다. 지운 뒤 `grep -n "method" js/core/missions.js` 로 문장형 미션에 남은 게 없는지 본다(블록형 미션의 다른 `method` 는 건드리지 않는다).

- [ ] **Step 4: E2E 먼저 고치기** — `test/e2e-flow.spec.js`

`studentToCode` 의 슬롯 고르기 줄(37줄)과 111줄을 카드 고르기로 바꾼다. 파일 위쪽(헬퍼들 옆)에:

```js
/* 카드 화면: 진짜 카드를 순서대로 놓고 세부를 고른다. 시험용 미션은 split-unique-count (sm1 복제) */
async function pickCards(page) {
  for (const label of ['나누기', '겹친 것은 하나만', '개수 세기']) {
    await page.locator('.card-pick', { hasText: label }).click();
  }
  await page.locator('.design-item select').first().selectOption('쉼표');
}
```

37줄과 111줄의 `for (const s of await page.locator('select.slot:visible').all()) ...` 를 `await pickCards(page);` 로.

새 테스트 둘 (파일 끝):

```js
test('설계 카드가 코드 뼈대가 되고, 쓴 코드는 설계를 고쳐도 남는다', async ({ page }) => {
  await local(page.context());
  await seedMission(page);
  await page.locator('.m-btn[data-id="ai-e2e"]').click();
  await expect(page.locator('#samples .sample-data')).toHaveCount(2);           // 첫 화면에 자료 2개
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#go-method').click();
  await expect(page.locator('.card-pick')).toHaveCount(4);                      // 진짜 3 + 헷갈리는 1
  await pickCards(page);
  await page.locator('.design-item').nth(2).locator('.card-up').click();        // 개수 세기를 위로
  await expect(page.locator('.design-item').nth(1)).toContainText('개수 세기');
  await page.locator('.design-item').nth(1).locator('.card-down').click();      // 되돌리기
  await page.locator('#go-run').click();
  const code = await page.locator('#code-editor').inputValue();
  expect(code).toContain('# 1. 나누기 (기준: 쉼표)');
  expect(code).toContain('# 3. 개수 세기');
  expect(code).not.toMatch(/split|set\(|len\(/);                                // 함수 이름은 안 준다

  await page.locator('#code-editor').fill('data = "a,b"\nprint(1)\n');
  await page.locator('#back-method').click();
  await page.locator('.design-item').nth(2).locator('.card-remove').click();
  await page.locator('#go-run').click();
  expect(await page.locator('#code-editor').inputValue()).toContain('print(1)'); // 덮어쓰지 않는다
});

test('다른 미션으로 바꾸면 앞 미션 코드가 남지 않는다', async ({ page }) => {
  await local(page.context());
  await seedMission(page);
  await studentToCode(page);
  await page.locator('#code-editor').fill('print("앞 미션")');
  await page.locator('.m-btn[data-id="sm2"]').click();
  await page.locator('#go-define').click();
  await page.locator('.define-card').first().click();
  await page.locator('#go-method').click();
  await pickCards(page);
  await page.locator('#go-run').click();
  expect(await page.locator('#code-editor').inputValue()).not.toContain('앞 미션');
});
```

`test/robust.js` 41줄의 슬롯 고르기도 같은 방식으로 (`pickCards` 와 같은 세 줄을 그 파일 안에 직접 쓴다).

`test/e2e-pipeline.spec.js` 를 지운다: `git rm test/e2e-pipeline.spec.js` — 지울 빈칸(`#slot-sep`)과 이미 호출되지 않는 실행 단계(`.data-card`)만 검사한다.

Run: `npx playwright test test/e2e-flow.spec.js` → Expected: 카드 관련 테스트 FAIL (`.card-pick` 없음).

- [ ] **Step 5: HTML** — `sentence.html`

1. step1 의 `<span class="sample-label" id="sample-label">…</span>` 과 `<code class="sample-data" id="sample-data"></code>` 를 `<div id="samples"></div>` 하나로.
2. step3 의 `<div class="method-sentences">…</div>` 와 `<div class="method-summary" id="method-summary" hidden>…</div>` 를 통째로:

```html
      <p class="card-hint">필요한 카드를 골라 순서대로 놓아 보세요.</p>
      <div class="card-pool" id="card-pool" aria-label="고를 수 있는 카드"></div>
      <h3 class="design-title">내 설계도</h3>
      <ol class="design-list" id="design-list" aria-label="내 설계도"></ol>
```
3. 스크립트: `<script src="js/core/pipeline.js"></script>` 다음 줄에 `<script src="js/core/cards.js"></script>`.

- [ ] **Step 6: CSS** — `sentence.css` 끝에 (기존 토큰 `--green`, `--line`, `--surface` 를 쓴다):

```css
/* 설계 카드 */
.card-hint { color: var(--ink-2); font-size: 14px; margin: 0 0 10px; }
.card-pool { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.card-pick { padding: 10px 14px; border: 1.5px solid var(--line-strong); border-radius: 12px; background: var(--surface); font: inherit; cursor: pointer; }
.card-pick:disabled { opacity: .4; cursor: default; }
.design-title { font-size: 14px; margin: 0 0 6px; color: var(--ink-2); }
.design-list { list-style: none; padding: 0; margin: 0 0 12px; min-height: 48px; border: 1.5px dashed var(--line-strong); border-radius: 12px; }
.design-list:empty::before { content: '아직 고른 카드가 없어요.'; display: block; padding: 14px; color: var(--ink-3); font-size: 14px; }
.design-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.design-item:last-child { border-bottom: 0; }
.design-item .num { font-weight: 700; color: var(--green); min-width: 1.5em; }
.design-item .label { font-weight: 600; }
.design-item select { padding: 4px 8px; border: 1px solid var(--green); border-radius: 8px; font: inherit; background: var(--surface); color: var(--ink); }
.design-item .moves { margin-left: auto; display: flex; gap: 4px; }
.design-item .moves button { width: 32px; height: 32px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); cursor: pointer; }
```

- [ ] **Step 7: JS** — `js/ui/sentence.js`

1. `loadMission` 의 상태: `slots: initSlots,` 를 `design: [],` 로, `initSlots` 만드는 두 줄을 지운다. `codeText` 옆에 `skeleton: '',` 추가.
2. 화면 1:

```js
    var samples = $('#samples');
    samples.innerHTML = '';
    M.inputs.slice(0, 2).forEach(function (inp) {   /* 반례는 코드 단계에서 — 처음엔 앞 두 자료만 */
      samples.appendChild(el('span', 'sample-label', inp.name));
      samples.appendChild(el('code', 'sample-data', inp.v));
    });
```
   (`$('#sample-data')`·`$('#sample-label')` 두 줄을 지운다.)
3. 화면 3: `/* 화면 3: 방법 문장 전체를 … */` 블록 전체(`methodBox` …)를 `renderDesign();` 한 줄로. `$('#method-summary').hidden = true;` 를 지운다. 그 아래 화면 4·5 초기화에 `if ($('#code-editor')) $('#code-editor').value = '';` 추가 (Review Focus 5).
4. `summarizeMethod`, `checkMethodComplete`, `onSlotChange` 를 다음으로 바꾼다:

```js
  /* ── 화면 3: 설계 카드 ────────────────────────── */
  function picked() {   /* 기록·뼈대에 쓰는 모양 { op, label, detail:'기준: 쉼표' } */
    return state.design.map(function (c) {
      return { op: c.op, label: c.label, detail: c.detail ? c.detail.name + ': ' + c.choice : '' };
    });
  }

  function summarizeMethod() {
    return picked().map(function (c) { return CC.cards.text(c); }).join(' → ');
  }

  function checkMethodComplete() {
    return state.design.length > 0 && state.design.every(function (c) { return !c.detail || !!c.choice; });
  }

  function renderDesign() {
    var pool = $('#card-pool'), list = $('#design-list');
    pool.innerHTML = ''; list.innerHTML = '';
    CC.cards.forMission(M).forEach(function (c) {
      var b = el('button', 'card-pick', c.label);
      b.type = 'button';
      b.disabled = state.design.some(function (d) { return d.op === c.op; });
      b.addEventListener('click', function () {
        state.design.push({ op: c.op, label: c.label, detail: c.detail, choice: '' });
        renderDesign();
      });
      pool.appendChild(b);
    });
    state.design.forEach(function (c, i) {
      var li = el('li', 'design-item');
      li.appendChild(el('span', 'num', (i + 1) + '.'));
      li.appendChild(el('span', 'label', c.label));
      if (c.detail) {
        var sel = document.createElement('select');
        sel.setAttribute('aria-label', c.label + ' ' + c.detail.name);
        sel.appendChild(new Option(c.detail.name + ' 고르기', ''));
        c.detail.options.forEach(function (o) { sel.appendChild(new Option(o, o)); });
        sel.value = c.choice;
        sel.addEventListener('change', function () { c.choice = sel.value; $('#go-run').disabled = !checkMethodComplete(); });
        li.appendChild(sel);
      }
      var moves = el('span', 'moves');
      [['card-up', '▲', '위로', -1], ['card-down', '▼', '아래로', 1]].forEach(function (b) {
        var btn = el('button', b[0], b[1]);
        btn.type = 'button';
        btn.setAttribute('aria-label', c.label + ' ' + b[2]);
        btn.disabled = (b[3] < 0 && i === 0) || (b[3] > 0 && i === state.design.length - 1);
        btn.addEventListener('click', function () {
          var j = i + b[3];
          state.design[i] = state.design[j]; state.design[j] = c;
          renderDesign();
        });
        moves.appendChild(btn);
      });
      var rm = el('button', 'card-remove', '✕');
      rm.type = 'button';
      rm.setAttribute('aria-label', c.label + ' 빼기');
      rm.addEventListener('click', function () { state.design.splice(i, 1); renderDesign(); });
      moves.appendChild(rm);
      li.appendChild(moves);
      list.appendChild(li);
    });
    $('#go-run').disabled = !checkMethodComplete();
  }
```

5. `#go-run` 핸들러의 기록을 카드로:

```js
    var cardsSnapshot = picked();
    if (state.methodVer > 0) {
      rec('s-remethod', { toCards: cardsSnapshot, reason: state.methodReason });
    } else {
      rec('s-method', { cards: cardsSnapshot, reason: state.methodReason, pipelineId: M.pipelineId || '' });
    }
    state.methodVer++;
    rec('s-design', { define: state.defineChoice, cards: cardsSnapshot, pipelineId: M.pipelineId || '' });
```
   (`slotsSnapshot` 과 `methodPayload` 줄을 지운다.)

6. `renderCodeStep` 의 설계도 표시와 에디터 초기값:

```js
    if ($('#design-steps')) {
      $('#design-steps').innerHTML = picked().map(function (c, i) {
        return '<div>' + (i + 1) + '. ' + esc(CC.cards.text(c)) + '</div>';
      }).join('');
    }
```
```js
    /* 코드 에디터 — 비었거나 직전 뼈대 그대로일 때만 새 뼈대. 학생이 쓴 코드는 덮어쓰지 않는다 */
    var editor = $('#code-editor');
    if (editor && (!editor.value || editor.value === state.skeleton)) {
      state.skeleton = 'data = "' + (M ? M.inputs[0].v : '') + '"\n# data 에 자료가 들어 있어요.\n' + CC.cards.skeleton(picked());
      editor.value = state.skeleton;
    }
```
   (기존 `if (editor && !editor.value) { editor.value = 'data = …설계도대로…' }` 블록을 이것으로 바꾼다.)

7. 기록 보기(~921줄)의 방법 문장:

```js
      var methText = lastM.cards || lastM.toCards
        ? (lastM.cards || lastM.toCards).map(function (c) { return CC.cards.text(c); }).join(' → ')
        : Object.keys(sl).map(function (k) { return sl[k]; }).filter(Boolean).join(' → ');  /* 예전 기록 */
```
   (`if (M && M.method && M.method.sentences) {…} else {…}` 를 이것으로.)

8. `renderRunStep` 과 `renderResult` 함수를 지운다. 지운 뒤 `grep -n "renderRunStep\|renderResult\|data-runner\|M.method\|state.slots" js/ui/sentence.js` 가 아무것도 내지 않아야 한다. `renderWrapStep` 이 쓰는 `findLatestRun`·`findJudgeForRun` 은 남긴다.

- [ ] **Step 8: 통과 확인**

Run: `node test/layer.test.js && node test/llmguard.test.js && node test/smoke.js && node test/robust.js && npx playwright test test/e2e-flow.spec.js`
Expected: 모두 통과, E2E `9 passed`.

- [ ] **Step 9: 커밋**

```bash
git add sentence.html sentence.css js/ui/sentence.js js/core/missions.js js/core/events.js js/core/fold.js test/layer.test.js test/e2e-flow.spec.js test/robust.js
git rm test/e2e-pipeline.spec.js
git commit -F - <<'EOF'
feat: 학생 설계를 동작 카드로, 설계도는 코드 주석 뼈대로

왜: 빈칸 문장 설계는 시험지였고("같은 목록은 [선택하기]."), 고른 값은 실행되지도 않았다.
카드를 골라 순서를 정하고 필요한 카드만 세부를 고른다. 그 설계도가 코드 에디터에 번호 주석으로
들어가 한 줄씩 옮길 길잡이가 된다. 첫 화면에 자료 2개 — 같은 방법을 두 번 쓴다는 게 보인다.
쓴 코드는 덮어쓰지 않고, 미션을 바꾸면 에디터를 비운다 (앞 미션 코드가 남던 문제).

기본 미션 sm1~3·sm-filter-1 도 같은 화면 (두 화면을 두면 갈라진다).
e2e-pipeline.spec.js 는 지운 빈칸·호출되지 않던 실행 단계만 검사해서 지웠다.

거절: 끌어 놓기 (휴대폰·키보드), 카드에 함수 이름 (코드를 대신 써 준다), 순서 채점 (CLAUDE.md).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: 교사 화면 — 초안 카드 미리보기 · 검수 배지 · 학생 설계 카드

**Files:**
- Modify: `teacher.html` (스크립트 목록 ~140-148줄, 초안 렌더링 ~430-480줄)
- Modify: `js/ui/teacher.js` (~255-262줄 `s.sMethod` 표시)
- Test: `test/e2e-flow.spec.js`

**Interfaces:**
- Consumes: `CC.cards.forMission` (`decoy` 표시), `CC.cards.text`, `m.guard.review` (Task 3), `s.sMethod.cards` (Task 4)

- [ ] **Step 1: 테스트** — `test/e2e-flow.spec.js` 의 교사 초안 테스트(`'교사 화면에서 초안을 만들 수 있다'`)에서 고정 응답 미션에 검수 결과를 넣고 확인을 더한다. 고정 응답을 만드는 곳(`fixtures/mission.json` 을 읽는 `route`)에서 응답 본문을:

```js
const draft = { ...fixture, guard: { ...(fixture.guard || {}), fallback: [], reasons: {},
  review: { status: 'teacher', reasons: ['세 자료가 같은 이야기인가 — 셋째만 문구예요'], rounds: 3 } } };
delete draft.method;
```
로 바꾸고, 초안이 뜬 뒤:

```js
  await expect(page.locator('#gen-result')).toContainText('검수 필요');
  await expect(page.locator('#gen-result')).toContainText('셋째만 문구예요');
  await expect(page.locator('#gen-result')).toContainText('헷갈리는 카드');
```

`test/fixtures/mission.json` 에 `method` 가 있으면 지우고 `pipelineId` 가 있는지 확인한다.

Run: `npx playwright test test/e2e-flow.spec.js -g 초안` → Expected: FAIL.

- [ ] **Step 2: 스크립트** — `teacher.html` 의 `<script src="js/core/alerts.js"></script>` 다음에:

```html
<script src="js/core/pipeline.js"></script>
<script src="js/core/cards.js"></script>
```

- [ ] **Step 3: 초안 화면** — `teacher.html`

1. `fb('goals')` 를 지운다 (성공 조건 제목 줄).
2. `/* 방법 문장 — … */` 블록(`if (m.method && m.method.sentences) {…}`)을:

```js
      /* 설계 카드 — 학생 화면과 같은 표(js/core/cards.js). 헷갈리는 카드는 교사에게만 표시 */
      var cards = CC.cards.forMission(m);
      if (cards.length) {
        draft += '<div style="background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:10px">';
        draft += '<div style="font-size:12px;font-weight:700;color:var(--ink-2);margin-bottom:6px">설계 카드 (학생이 골라 순서를 정함)</div>';
        cards.forEach(function (c) {
          draft += '<div style="font-size:13px;padding:3px 0">' + esc(c.label) +
            (c.detail ? ' <b style="color:var(--blue,#3A7BD5)">[' + esc(c.detail.name + ': ' + c.detail.options.join(' / ')) + ']</b>' : '') +
            (c.decoy ? ' <span style="font-size:11px;color:var(--ink-3)">헷갈리는 카드</span>' : '') + '</div>';
        });
        draft += '</div>';
      }
```
3. 핵심 개념 줄의 `'개 빈칸을 선택'` 부분을 `' — 카드 ' + cards.filter(function (c) { return !c.decoy; }).length + '장으로 설계'` 로 (`m.method.sentences.length` 참조를 없앤다).
4. 초안 머리(`'초안 — 수정 후 확정하세요'` 줄 다음)에 검수 배지:

```js
      var rv = guard.review;
      if (rv && rv.status === 'teacher') {
        draft += '<div role="status" style="background:var(--amber-soft,#FFF3DC);border:1px solid var(--amber);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:13px">' +
          '<b style="color:var(--amber)">검수 필요</b> — 학생에게 내기 전에 확인해 주세요.<ul style="margin:4px 0 0 18px;padding:0">' +
          rv.reasons.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
      }
```
   (`guard` 는 이미 위에서 `var guard = m.guard || {…}` 로 있다. 이 블록은 그 선언 **뒤**에 둔다.)

- [ ] **Step 4: 학생 설계 표시** — `js/ui/teacher.js` 의 `if (s.sMethod) {…}` 안 `slotParts` 부분을:

```js
      var sl = s.sMethod.slots || {};
      var text = s.sMethod.cards
        ? s.sMethod.cards.map(function (c) { return CC.cards.text(c); }).join(' → ')
        : Object.keys(sl).map(function (k) { return sl[k]; }).filter(Boolean).join(' → ');  /* 예전 기록 */
      bs2.appendChild(el('div', 'v', text + (s.sMethodVer > 1 ? ' (수정 ' + (s.sMethodVer - 1) + '회)' : '')));
```
   (교사 화면이 `CC.cards` 를 쓰므로 Step 2 의 스크립트가 필요하다.)

- [ ] **Step 5: 통과 확인**

Run: `node test/smoke.js && node test/robust.js && npx playwright test test/e2e-flow.spec.js`
Expected: 모두 통과.

- [ ] **Step 6: 커밋**

```bash
git add teacher.html js/ui/teacher.js test/e2e-flow.spec.js test/fixtures/mission.json
git commit -F - <<'EOF'
feat: 교사 초안에 설계 카드와 검수 결과를, 학생 기록에 카드 설계를 보인다

왜: 검수 탈락 미션은 교사가 판단한다 — 이유를 초안 위에 그대로 보인다. 확정하면 guard 를
떼는 기존 동작 그대로라 학생에게는 가지 않는다. 카드 미리보기는 학생과 같은 표를 쓰고,
헷갈리는 카드는 교사에게만 표시한다. 예전 기록(slots)도 그대로 읽는다.

거절: 검수 필요 미션의 확정 버튼 막기 (판단은 교사 몫).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: 최종 확인

**Files:**
- Modify: `docs/eval.md`, `docs/eval-raw.json` (eval 재실행 결과)

- [ ] **Step 1: 전체 테스트**

```bash
python3 -m http.server 8123 &   # 이미 떠 있으면 생략
node test/engine.test.js && node test/hangul.test.js && node test/llmguard.test.js && node test/layer.test.js && node test/cards.test.js && node test/smoke.js && node test/robust.js
for t in test/test_*.py; do /usr/local/bin/python3 $t >/dev/null 2>&1 && echo "$t ok" || echo "$t FAIL"; done
npx playwright test test/e2e-flow.spec.js
```
Expected: 전부 통과.

- [ ] **Step 2: eval 두 번** (회차 편차가 커서 두 번)

```bash
set -a; . ./.env; set +a
uv run --with-requirements requirements.txt python test/eval_generate.py
```
Expected: 생성 성공 ≥ 9/10 두 번. 검수 통과·교사 검수 비율을 기록. 교사 검수가 절반을 넘으면 `docs/eval.md` 의 검수 이유를 읽고, 이유가 생성 프롬프트 문제인지 검수 기준 문제인지 판단해 리포트에 적는다 (기준을 느슨하게 고치지 않는다).

- [ ] **Step 3: 실제 화면 한 번** — 생성 API 응답 하나(eval 결과의 미션)를 `localStorage['cutcheck.generated']` 로 넣고 학생 화면 1~4단계를 420px 폭으로 캡처해서 확인한다 (스크립트는 저장소에 넣지 않는다). 확인할 것: 요청에 구할 값, 자료 2개, 성공 조건 문장, 카드 4장, 코드 뼈대.

- [ ] **Step 4: 커밋**

```bash
git add docs/eval.md docs/eval-raw.json
git commit -F - <<'EOF'
docs: 카드 설계·생성 검수 뒤 eval

(두 회차 숫자: 생성 성공 · 검수 1차 통과 · 재생성 포함 통과 · 교사 검수 · 평균 시간)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```
