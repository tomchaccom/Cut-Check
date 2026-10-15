# LLM 미션 생성 — 구조까지 LLM이, 검사는 코드가

작성일 2026-10-15

## 1. 왜 바꾸나

지금 `api/generate-mission.js` 에서 LLM이 만드는 건 **제목·상황·자료 단어**뿐이다.
문제 유형, 성공 조건 보기와 함정, 반례, 방법 문장은 전부 코드의 고정 틀(`switch`)이 만든다.
주제만 바뀌고 문제 모양은 매번 같다 — "하드코딩"이라는 지적이 맞다.

바꾼 뒤:

- **LLM이 문제 구조 전체를 제안한다.** (유형, 자료, 반례, 성공 조건 보기, 방법 문장 표현)
- **형식은 pydantic 모델이 강제한다.** 같은 모델을 structured output 스키마로 LLM에 넘긴다.
- **지금의 고정 틀 코드는 지우지 않고 가드레일이 된다.** 검사 기준 + 실패한 칸의 폴백.
- **검사를 통과한 JSON만 화면으로 간다.** 학생 화면은 이미 데이터만 보고 그리므로 그대로 쓴다.

`docs/llm.md` 의 원칙을 그대로 따른다 — LLM 출력을 "그냥 내보내기"는 절대 없다.

## 2. 범위

| 바뀜 | 안 바뀜 |
|---|---|
| 미션 생성 서버 함수 (Node → Python) | 학생 기본 미션 `js/core/missions.js` |
| 교사 화면의 초안 미리보기 (`teacher.html`) | 학생 화면 `sentence.js` 의 미션 렌더링 |
| 문서 `docs/llm.md`, `CLAUDE.md` 작업 순서 | Supabase, `js/data/*`, 되묻기 `asks.js` |

Vercel은 함수 파일마다 런타임을 고른다. 화면(정적 파일)과 함수는 지금처럼 한 저장소에서 같이 배포된다.
`PICKLE_API_KEY` 환경 변수는 그대로 쓴다.

## 3. 흐름

```
교사: 수업 내용 + 핵심 입력
  ↓
POST /api/generate-mission
  ↓
① LLM 호출 — response_format 에 pydantic 모델의 JSON 스키마
  ↓
② 형식 검사 (pydantic) — 칸, 타입, 허용 값, 길이
  ↓
③ 내용 검사 (코드) — 실제로 실행해 보고 판정
  ├ 전부 통과 → ⑤
  └ 실패 → ④
  ↓
④ 위반 사유를 붙여 1회 재요청 → 다시 ②③
   그래도 실패한 칸만 폴백(기존 고정 틀)으로 교체
  ↓
⑤ 응답: 미션 JSON + guard { fallback: [...], reasons: {...} }
  ↓
교사 화면: 미리보기 · 수정 · 확정  →  학생 화면: 그대로 풀이
```

형식 검사(②)가 실패해 칸 자체가 없는 경우에도 같은 경로를 탄다.
재요청까지 형식이 깨지면 **미션 전체를 폴백으로 조립**한다 (자료는 폴백이 없으므로 이때만 에러 반환).

## 4. 형식 — pydantic 모델

모델이 곧 문제 형식이다. LLM이 정하는 것과 코드가 정하는 것을 나눈다.

### 4.1 LLM이 채우는 모델 (`MissionDraft`)

구현은 `api/_schema.py`. 아래는 모양만 줄여 적은 것이다.

- `Field(description=...)` 이 곧 LLM 에게 주는 생성 지시다. 모델의 JSON 스키마를 그대로 structured output 에 넘긴다.
- 글자 수 한도는 `json_schema_extra={'maxLength': n}` 으로 스키마에만 보이게 하고, 실제 검사는 `model_validator` 에서 한다 (4.4).

```python
class Option(BaseModel):
    v: str                   # 25자
    trap: Literal['hardcode', 'luck'] | None
    key: str | None          # trap 이 None 일 때만. 유형별 허용 key 목록에서

class Sentence(BaseModel):
    template: str            # 25자. 반드시 {slot} 을 정확히 하나 포함
    slot: str                              # 유형별 고정 목록에서

class DataSet(BaseModel):
    name: str                # 15자
    items: list[str] = Field(min_length=3, max_length=5)

class Counter(DataSet):
    axis: Literal['count', 'sep', 'empty', 'invisible']   # CLAUDE.md 반례 네 축

class MissionDraft(BaseModel):
    pipelineId: Literal[...]               # 아래 7개
    title: str               # 20자
    brief: str               # 40자, 한 문장. 배경은 situation 으로
    situation: str           # 30자, 한 문장
    itemName: str            # 6자
    data: list[DataSet] = Field(min_length=2, max_length=2)
    counter: Counter                       # 항상 마지막 자료가 된다
    options: list[Option] = Field(min_length=3, max_length=4)
    sentences: list[Sentence]
    filterTarget: list[str] | None         # filter 계열 유형만
    filterDesc: str | None
```

### 4.2 코드가 소유하는 것 (LLM이 못 바꾼다)

| 무엇 | 왜 |
|---|---|
| 유형 7개 목록 | `js/core/pipeline.js` WHITELIST 중 생성기가 지원하는 것 |
| 유형별 빈칸 이름과 **보기 값** | 보기 값이 `pipeline.run` 의 의미와 맞물린다 (`'있는'`, `'앞뒤 공백을 없앤다'` 등). LLM이 바꾸면 실행이 깨진다 |
| 유형별 정답 `key` 목록 | 학생 기록·교사 화면 집계 키 |
| 미션 `id`, `no`, `type: 'sentence'`, `inputs[].id` | 저장·식별용 |

LLM은 `sentences[].template` 의 **문장 표현만** 쓴다. 응답 조립 시 `options` 는 코드가 유형별 표에서 붙인다.

### 4.3 유형별 고정 표

기존 `assembleMission` 의 값을 그대로 옮긴다.

| pipelineId | 빈칸(slot) → 보기 | 정답 key |
|---|---|---|
| split-unique-count | sep, dedup, output | total, unique |
| split-filter-count | sep, cond | filtered_count |
| split-sort-join | sep, dir, joinSep | sorted |
| split-num-sum | sep | sum |
| split-group | sep | group |
| split-transform-join | sep, op, joinSep | transformed |
| split-filter-num-sum | sep, cond | filtered_sum |

pydantic 에서 `pipelineId` 로 갈라지는 discriminated union 으로 표현해,
스키마 단계에서 유형에 없는 slot 이 나오지 못하게 한다.

### 4.4 검사를 어디에 두나

필드 단위 검사(`max_length`, `AfterValidator`)가 하나라도 실패하면 pydantic 은
`model_validator(mode='after')` 를 건너뛴다. 그러면 반례·함정 같은 내용 사유가 묻히는데,
재요청은 한 번뿐이라 사유를 **한꺼번에** 넘겨야 한다.
그래서 엔진을 돌리기 전 조건(자료 항목의 쉼표·플레이스홀더, 칸 개수)만 필드 단계에 두고,
문장 규칙과 글자 수를 포함한 나머지는 전부 `model_validator` 에서 모은다.
실패는 `ValidationError.from_exception_data` 로 칸 이름(loc)을 달아 내고,
`failed_fields()` 가 `{칸: [사유]}` 로 바꾼다.

## 5. 내용 검사 (가드레일)

형식이 맞아도 내용이 틀릴 수 있다. 아래는 **코드가 실제로 계산해서** 판정한다.
각 검사는 실패하면 사유 문자열을 남기고, 사유는 재요청 프롬프트와 로그에 들어간다.

| 칸 | 검사 | 폴백 |
|---|---|---|
| pipelineId | (스키마가 보장) 키워드와 너무 동떨어져도 막지 않는다 — 유형 선택은 LLM 판단 | `selectPipeline()` (형식 실패 시만) |
| 학생에게 보이는 모든 문장 | 칭찬·코드 없음 / **반말 종결어미 없음, `너` 없음** (CLAUDE.md 화면 문구 규칙) / 한자·일본어 없음 / **한 칸에 한 문장, 괄호·줄표·"예를 들어" 같은 덧붙임 없음** / 글자 수 | 칸별 폴백 |
| brief | 답 암시 단어 없음 (`서로 다른`, `전체 개수`, `중복` — 기존 `test-quality` 규칙) | `'{title} 일을 맡았어요. 정리해 주세요.'` (일부러 모호한 기본문) |
| data | 플레이스홀더(`항목1`, `A`) 없음, num 계열은 정수, `filterTarget` 이 자료에 실제로 있음, transform 은 앞뒤 공백 항목 존재 | 없음 — 재요청까지 실패하면 에러 |
| counter | 정답 슬롯으로 `pipeline.run` → **자료1 결과와 달라야 함**. 축별 확인: `sep` 은 `,` 아닌 구분자 포함 / `invisible` 은 앞뒤 공백 항목 포함 / `empty` 는 결과가 0 또는 빈 목록 / `count` 는 항목 수가 자료1과 다름 | `buildCounterexample()` |
| options | `hardcode` ≥1 · `luck` ≥1 · 정답 ≥1 / `hardcode` 보기에 **자료1의 실제 결과값이 들어 있음** (코드 계산) / 정답 보기에 방법 단어(쉼표, 나눈다, 자른다 등) 없음 — CLAUDE.md "통과 조건은 결과로만" / key 가 유형 허용 목록 안 | 기존 `define` 템플릿 |
| sentences | 유형의 slot 집합과 정확히 일치 / 각 template 에 `{slot}` 정확히 1개 / 빈칸 밖에 보기 값이 미리 적혀 있지 않음 (답 노출) | 기존 문장 템플릿 |

"정답 슬롯"은 유형별 고정 표에 같이 둔다 (예: unique-count 는 `sep=쉼표`, `dedup=하나만 남긴다`).
자료는 쉼표로 이어 붙이므로 정답 `sep` 은 항상 `쉼표` 다.

### 5.1 실행 엔진 중복

반례 검사에는 `js/core/pipeline.js` 의 Python 판(`api/_pipeline.py`)이 필요하다.
규칙이 두 군데 생기는 건 CLAUDE.md 가 경고하는 패턴이므로 **동등성 테스트**로 묶는다:
같은 (유형, 슬롯, 입력) 고정 목록을 JS·Python 양쪽에 넣어 결과가 다르면 실패.
JS 쪽은 테스트가 `node -e` 로 `pipeline.js` 를 불러 실행한다.

## 6. 응답 형식

학생 화면이 이미 읽는 모양 그대로 + `guard`:

```json
{
  "id": "ai-…", "no": "AI", "type": "sentence",
  "pipelineId": "split-filter-count",
  "stage": "급식", "title": "…", "brief": "…", "situation": "…",
  "lesson": "…", "keyPoint": "…",
  "define": { "q": "언제 성공이라고 할 수 있을까요?", "options": [ … ] },
  "method": { "sentences": [ { "template": "…", "slot": "sep", "options": ["쉼표","공백","줄바꿈"] } ] },
  "inputs": [ {"id":"d01",…}, {"id":"d02",…}, {"id":"d03",…,"counter":true,"axis":"sep"} ],
  "pipelineParams": { "filterTarget": [ … ] },
  "guard": {
    "fallback": ["options"],
    "reasons": { "options": ["hardcode 보기에 자료1 결과값(2)이 없음"] },
    "retried": true
  }
}
```

`guard` 는 교사 화면 전용이다. 확정 시 저장 전에 제거한다 — 학생 기록에 섞이지 않게.

## 7. 화면

### 학생 (`sentence.html`)
변경 없음. 응답이 기존 미션 모양과 같다. `inputs[].counter` · `axis` 는 무시된다.

### 교사 (`teacher.html` 초안 폼)
기존 폼에 세 가지만 더한다.

1. **폴백 표시** — `guard.fallback` 에 든 칸 옆에 "기본 틀로 채워졌어요" 배지.
   사유는 배지에 마우스를 올리면 보인다 (`title`).
2. **방법 문장 미리보기** — 지금 초안 폼에 없다. 빈칸을 `[쉼표/공백/줄바꿈]` 처럼 보여준다.
3. **반례 축 표시** — 반례 자료 옆 "반례" 라벨을 "반례 · 구분자 변화" 처럼.

교사가 초안을 고친 뒤 재검사는 하지 않는다 — 교사의 수정은 교사의 판단이다.
필요해지면 그때 같은 검사기를 `/api/validate-mission` 으로 연다.

## 8. 파일

| 파일 | 내용 |
|---|---|
| `api/generate-mission.py` | Vercel 핸들러. LLM 호출 → 검사 → 재요청 → 폴백 → 응답 |
| `api/_schema.py` | pydantic 모델 + 유형별 고정 표 |
| `api/_guard.py` | 내용 검사 + 폴백 (기존 `selectPipeline` / `buildCounterexample` / define·문장 템플릿 이식) |
| `api/_pipeline.py` | 실행 엔진 Python 판 |
| `requirements.txt` | `pydantic>=2,<3` (Vercel 배포용) |
| `api/generate-mission.js` | **삭제** |
| `teacher.html` | 7절의 세 가지 |
| `test/test_missionguard.py` | 검사기: 통과해야 할 것보다 **막아야 할 것을 더 많이** (`docs/llm.md` 7절) |
| `test/test_pipeline_parity.py` | JS·Python 엔진 동등성 |
| `docs/llm.md` | "미션 생성 계약" 절 추가 |
| `CLAUDE.md` | 작업 순서에 Python 테스트 2개 추가 |

`_` 로 시작하는 파일은 Vercel 이 라우트로 만들지 않는다.
URL 은 `/api/generate-mission` 을 유지해 `teacher.html`·`debug.html`·`test-quality.js` 의 호출 주소를 안 바꾼다
(하이픈 파일명이 Python 런타임에서 라우트가 되는지는 9절 확인 1).

테스트는 기존 스타일대로 프레임워크 없이 돈다. venv 대신 `uv run --with-requirements requirements.txt python test/…py`.
`test_missionguard.py` 는 우리가 손으로 쓴 문장형 미션(`SENTENCE_MISSIONS`)도 같은 문장 규칙으로 검사한다.

## 9. 구현 전에 확인할 것

1. **pickle API 의 structured output 지원** — `response_format: {type: 'json_schema', …}` 를 실제로 호출해 본다.
   안 되면 `json_object` → 그것도 안 되면 프롬프트에 스키마를 넣고 JSON만 받는다.
   어느 쪽이든 ②③ 검사는 똑같이 돈다.
2. **Vercel Python 라우트** — `api/generate-mission.py` 가 `/api/generate-mission` 이 되는지 `vercel dev` 로 확인.
   안 되면 `generate_mission.py` + 호출 3곳 수정.
3. **실행 시간** — LLM 2회 + 검사가 기본 제한(10초)을 넘을 수 있다. `vercel.json` 에 `maxDuration` 지정.
4. **로컬 Python** — uv 가 3.12(Vercel 런타임과 같은 버전)와 pydantic 을 준비한다.

## 10. 하지 않는 것

- 학생이 들어올 때마다 실시간 생성 — 교사가 확인·확정한 미션만 학생에게 간다.
- 교사 수정 후 재검사 — 7절.
- 점수·품질 점수 표시 — `guard` 는 "어느 칸이 폴백됐는지" 사실만 보여준다. 숫자로 만들지 않는다.
- LLM 제공자 교체.

## 11. 성공 기준

- 같은 수업 입력으로 여러 번 생성했을 때 **유형·보기·반례·문장 모양이 실제로 달라진다.**
- 검사기를 통과한 미션은 학생 화면에서 그대로 풀리고, 반례에서 정답 슬롯 결과가 자료1과 다르다.
- 검사기는 아래를 전부 막는다: 칭찬, 반말, 방법이 적힌 성공 조건, 가짜 반례, 결과값 없는 hardcode 함정, 빈칸 밖에 노출된 답.
- 기존 6개 테스트 + 새 Python 테스트 2개 통과.

## 12. 진행 기록

- 완료: `api/_schema.py`, `api/_pipeline.py`, 테스트 2개 (2026-10-16)
- 엔진 동등성 테스트가 기존 엔진 버그 2개를 드러냈고 함께 고쳤다
  ('빼고 숫자만 남긴다' 가 거꾸로 돌던 것, '각각 남긴다' 가 무시되던 것)
- 남은 것: `api/generate-mission.py` 핸들러(LLM 호출·재요청·부분 폴백), 교사 화면 7절, 9절 확인 1~3
