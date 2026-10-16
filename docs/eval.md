# 미션 생성 평가

실행 2026-10-17 00:12 · 모델 `openai/gpt-5.4-mini` · 수업 주제 10개

`uv run --with-requirements requirements.txt python test/eval_generate.py` 로 다시 만든다. 원본 응답은 `docs/eval-raw.json`.

## 요약

| 항목 | 값 |
|---|---|
| 미션 생성 성공 | 10 / 10 |
| 1차 응답이 검사를 바로 통과 | 2 / 10 |
| 재요청 | 7 건 |
| 기본 틀로 바뀐 칸이 없는 미션 | 10 / 10 |
| 기본 틀로 바뀐 칸이 있는 미션 | 0 건 |
| 자료를 보정한 미션 | 2 건 |
| 유형을 LLM 이 고름 | 10 / 10 |
| 유형이 기대와 같음 | 7 / 10 |
| 나온 유형 가짓수 | 8 |
| 검수 1차 통과 | 7 / 10 |
| 검수 통과 (재생성 포함) | 9 / 10 |
| 교사 검수로 넘어감 | 1 / 10 |
| 미션 하나 걸린 시간 | 평균 9.9초 · 최대 17.1초 |
| HTTP `유형 · json_schema → ok` | 14회 · 평균 1.2초 |
| HTTP `초안 · json_schema → ok` | 39회 · 평균 2.1초 |

### 검증에 걸린 칸 (시도 기준)

| 칸 | 횟수 |
|---|---|
| `brief` | 28 |
| `situation` | 21 |
| `title` | 18 |
| `itemName` | 18 |
| `counter` | 18 |
| `data` | 18 |
| `filterTarget` | 6 |
| `filterDesc` | 6 |

## 주제별

| # | 수업 | 기대 유형 | 나온 유형 | 시간 | LLM 호출 | 1차 검증 | 기본 틀 칸 | 결과 |
|---|---|---|---|---|---|---|---|---|
| 1 | 파이썬 리스트와 반복문. for문으로 하나씩 | `split-unique-count` | `split-unique-count` | 6.4초 | 4 | situation, brief | - | 생성 |
| 2 | 조건문 if-else. 조건이 참이면 A,  | `split-filter-count` | `split-filter-count` | 7.6초 | 4 | brief | - | 생성 |
| 3 | 딕셔너리. 키와 값 쌍으로 저장 | `split-group` | `split-group` | 17.1초 | 4 | situation | - | 생성 |
| 4 | 함수 정의와 호출. def로 만들고 여러 번 | `split-transform-join` | `split-count` | 10.6초 | 7 | brief | - | 생성 |
| 5 | 문자열 다루기. split, strip, r | `split-transform-join` | `split-transform-join` | 6.2초 | 4 | brief | - | 생성 |
| 6 | 정렬. sorted와 sort의 차이 | `split-sort-join` | `split-sort-join` | 14.7초 | 9 | 통과 | - | 생성 |
| 7 | 숫자 형변환. int()로 문자열을 숫자로 | `split-num-sum` | `split-filter-num-sum` | 6.4초 | 4 | brief | - | 생성 |
| 8 | 예외 처리. try-except | `split-filter-num-sum` | `split-filter-num-sum` | 16.9초 | 10 | brief | - | 생성 |
| 9 | 집합 set. 중복 없는 모음 | `split-unique-count` | `split-unique-count` | 6.3초 | 4 | situation, brief | - | 생성 |
| 10 | 파일 입출력. open, read | `split-filter-count` | `split-filter-join` | 6.4초 | 3 | 통과 | - | 생성 |

## 상세

### 1. 파이썬 리스트와 반복문. for문으로 하나씩 꺼내서 처리하는 법

- 핵심: 같은 값이 여러 번 있을 때 전체와 서로 다른 개수가 다르다
- HTTP: 유형 ok 1.4초 → 초안 ok 1.7초 → 초안 ok 1.8초 → 초안 ok 1.6초
- 유형: `split-unique-count` (같은 항목이 겹쳐 나오는 목록에서 개수 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `situation` '목록에 같은 항목이 여러 번 들어 있습니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
  - `brief` '같은 값이 여러 번 나오는 목록에서 개수를 확인해 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 통과
- 초안 3차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**겹친 목록 세기** · `split-unique-count`

> 같은 값이 여러 번 나오는 목록에서 몇 개인지 알아내 주세요.  
> 목록에 같은 항목이 여러 번 들어 있어요.

| 성공 조건 보기 | 표시 |
|---|---|
| 겹치는 건 한 번만 센 수가 나오면 성공 | 진짜 (unique) |
| 에러 안 나면 성공 | luck |
| 전체 항목 수가 나오면 성공 | 진짜 (total) |
| 3이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 목록 | `사과,바나나,사과,포도` |
| 화요일 목록 | `사과,바나나,포도,귤` |
| 다른 날 목록 (반례 · count) | `사과,바나나,사과,포도,귤` |

### 2. 조건문 if-else. 조건이 참이면 A, 거짓이면 B

- 핵심: 어떤 기준으로 걸러내는지를 학생이 직접 정하게
- HTTP: 유형 ok 1.2초 → 초안 ok 3.0초 → 초안 ok 1.6초 → 초안 ok 1.8초
- 유형: `split-filter-count` (조건에 맞는 항목만 골라 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '조건에 맞는 재료만 세어 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 통과
- 초안 3차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required

**급식 재료** · `split-filter-count`

> 조건에 맞는 재료가 몇 개인지 알려 주세요.  
> 급식실에서 정리하려는 일이에요.

| 성공 조건 보기 | 표시 |
|---|---|
| 2가 나오면 성공 | hardcode |
| 에러 안 나면 성공 | luck |
| 조건에 맞는 재료 수가 나오면 성공 | 진짜 (filtered_count) |

| 자료 | 값 |
|---|---|
| 월요일 재료 | `우유,계란,사과,빵` |
| 화요일 재료 | `우유,계란,바나나,빵` |
| 목요일 재료 (반례 · empty) | `사과,빵,바나나,사과` |

걸러낼 대상: 우유, 계란

### 3. 딕셔너리. 키와 값 쌍으로 저장

- 핵심: 같은 키가 여러 번 나오면 묶어서 센다
- HTTP: 유형 ok 1.0초 → 초안 ok 1.7초 → 초안 ok 1.5초 → 초안 ok 12.9초
- 유형: `split-group` (같은 항목끼리 묶어 몇 번씩 나왔는지 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `situation` '같은 이름이 몇 번씩 나왔는지 세어야 합니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
- 초안 2차 검증 통과
- 초안 3차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**과자 세기** · `split-group`

> 과자 이름별로 몇 번 나왔는지 알아보세요.  
> 같은 이름이 몇 번씩 나왔는지 세어야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 감자칩이 2번 나오면 성공 | hardcode |
| 과자마다 나온 횟수가 보이면 성공 | 진짜 (group) |
| 에러 안 나면 성공 | luck |

| 자료 | 값 |
|---|---|
| 월요일 과자 | `감자칩,초코파이,감자칩` |
| 화요일 과자 | `초코파이,새우깡,감자칩` |
| 금요일 과자 (반례 · count) | `감자칩,초코파이,감자칩,감자칩,초코파이` |

### 4. 함수 정의와 호출. def로 만들고 여러 번 호출

- 핵심: 같은 작업을 항목마다 반복할 때 함수로 묶는다
- HTTP: 유형 ok 1.3초 → 초안 ok 1.7초 → 초안 ok 1.4초 → 초안 ok 1.6초 → 유형 ok 1.1초 → 초안 ok 1.5초 → 초안 ok 1.8초
- 유형: `split-count` (목록의 항목 수 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '자료 세 개로 각 목록의 항목 수를 알아내세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 통과
- 초안 3차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 초안 4차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 초안 5차 검증 통과
- 초안 6차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**항목 수 세기** · `split-count`

> 목록을 보고 각각 몇 개인지 알려주세요.  
> 같은 기준으로 세어야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 3이 나오면 성공 | hardcode |
| 목록이 몇 개인지 나오면 성공 | 진짜 (count) |
| 에러 안 나면 성공 | luck |

| 자료 | 값 |
|---|---|
| 월요일 목록 | `우유,빵,달걀` |
| 화요일 목록 | `우유,빵,달걀,치즈` |
| 다른날 목록 (반례 · count) | `우유,빵,달걀,우유,우유` |

### 5. 문자열 다루기. split, strip, replace

- 핵심: 데이터를 나누고 정리하는 과정에서 공백이 문제를 일으킨다
- HTTP: 유형 ok 1.1초 → 초안 ok 1.7초 → 초안 ok 1.6초 → 초안 ok 1.9초
- 유형: `split-transform-join` (항목마다 앞뒤 공백 같은 것을 정리하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '신청 이름을 정리해 주십시오.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
  - `brief` '신청 이름을 정리해 주십시오.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 통과
- 초안 3차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**급식 신청 정리** · `split-transform-join`

> 신청 이름이 깔끔한지 알려 주세요.  
> 공백이 섞여 있어요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 김밥,떡볶이,우유가 나오면 성공 | hardcode |
| 이름마다 깔끔해지면 성공 | 진짜 (transformed) |

| 자료 | 값 |
|---|---|
| 월요일 신청 | ` 김밥 , 떡볶이 , 우유 ` |
| 화요일 신청 | `김밥,떡볶이,우유` |
| 금요일 신청 (반례 · count) | ` 김밥 , 떡볶이 , 우유 , 김밥 ,김밥` |

### 6. 정렬. sorted와 sort의 차이

- 핵심: 순서가 뒤섞인 목록을 기준에 맞게 늘어놓는다
- HTTP: 유형 ok 1.0초 → 초안 ok 1.7초 → 초안 ok 1.7초 → 유형 ok 1.3초 → 초안 ok 1.9초 → 초안 ok 2.0초 → 유형 ok 1.1초 → 초안 ok 2.3초 → 초안 ok 1.6초
- 유형: `split-sort-join` (항목을 순서대로 늘어놓기) · 고른 쪽: llm
- 초안 1차 검증 통과
- 초안 2차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 초안 3차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 초안 4차 검증 통과
- 초안 5차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 초안 6차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 초안 7차 검증 통과
- 초안 8차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**점심 준비** · `split-sort-join`

> 세 자료의 순서를 살펴보세요.  
> 같은 기준으로 늘어놓아야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 순서대로 늘어서면 성공 | 진짜 (sorted) |
| 빵,사과,우유,주스가 나오면 성공 | hardcode |

- 검수: 세 자료가 같은 이야기인가 — 월요일·수요일 재료와 다른 재료가 같은 목록이 아니라 서로 다른 내용이다.

| 자료 | 값 |
|---|---|
| 월요일 재료 | `빵,우유,사과,주스` |
| 수요일 재료 | `주스,사과,빵,우유` |
| 다른 재료 (반례 · count) | `빵,우유,사과,주스,빵,주스` |

### 7. 숫자 형변환. int()로 문자열을 숫자로

- 핵심: 문자로 된 숫자는 더하기 전에 바꿔야 한다
- HTTP: 유형 ok 1.2초 → 초안 ok 1.8초 → 초안 ok 1.7초 → 초안 ok 1.7초
- 유형: `split-filter-num-sum` (숫자와 글자가 섞인 목록에서 숫자만 골라 더하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '목록에서 숫자만 골라 더해 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 통과
- 초안 3차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 자료 보정: 걸러낼 대상에서 자료에 없는 말과 숫자를 뺐어요
- 자료 보정: 걸러낼 대상에 사과, 배, 연필, 공책 를 넣었어요

**숫자만 더하기** · `split-filter-num-sum`

> 목록에서 숫자만 골라 모두 얼마인지 알아내 주세요.  
> 문자와 숫자가 섞여 있어요.

| 성공 조건 보기 | 표시 |
|---|---|
| 숫자만 더한 값이 나오면 성공 | 진짜 (filtered_sum) |
| 에러 안 나면 성공 | luck |
| 10이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 첫 번째 목록 | `3,사과,5,배,2` |
| 두 번째 목록 | `1,연필,4,공책,6` |
| 글자만 목록 (반례 · empty) | `사과,배,연필,공책,사과` |

걸러낼 대상: 사과, 배, 연필, 공책

### 8. 예외 처리. try-except

- 핵심: 숫자가 아닌 값이 섞여 있으면 계산이 멈춘다
- HTTP: 유형 ok 1.1초 → 초안 ok 2.0초 → 초안 ok 1.5초 → 초안 ok 1.8초 → 초안 ok 2.1초 → 유형 ok 1.3초 → 초안 ok 1.8초 → 초안 ok 1.6초 → 초안 ok 1.5초 → 초안 ok 2.2초
- 유형: `split-filter-num-sum` (숫자와 글자가 섞인 목록에서 숫자만 골라 더하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '목록에서 숫자만 골라 더해 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 실패
  - `brief` '목록에서 숫자가 몇 개인지 알아봐 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 3차 검증 통과
- 초안 4차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 초안 5차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 초안 6차 검증 실패
  - `brief` '섞인 목록에서 숫자만 골라 더해 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 7차 검증 실패
  - `brief` '숫자가 몇 개인지 알아내 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 8차 검증 통과
- 초안 9차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 자료 보정: 걸러낼 대상에서 자료에 없는 말과 숫자를 뺐어요
- 자료 보정: 걸러낼 대상에 사과, 메모, 바나나, 쪽지 를 넣었어요

**숫자 합** · `split-filter-num-sum`

> 숫자가 적힌 것만 모두 더해 주세요.  
> 숫자가 아닌 값이 있어도 끝까지 계산해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 15가 나오면 성공 | hardcode |
| 숫자만 더한 값이 나오면 성공 | 진짜 (filtered_sum) |

| 자료 | 값 |
|---|---|
| 월요일 목록 | `3,사과,5,7,메모` |
| 화요일 목록 | `2,바나나,4,6,쪽지` |
| 수요일 목록 (반례 · empty) | `사과,메모,바나나,쪽지,사과` |

걸러낼 대상: 사과, 메모, 바나나, 쪽지

### 9. 집합 set. 중복 없는 모음

- 핵심: 중복을 없애면 개수가 달라진다
- HTTP: 유형 ok 1.1초 → 초안 ok 1.7초 → 초안 ok 1.6초 → 초안 ok 1.9초
- 유형: `split-unique-count` (같은 항목이 겹쳐 나오는 목록에서 개수 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `situation` '중복을 없애면 개수가 달라집니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
  - `brief` '겹친 항목을 보고 개수를 세어 보세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 통과
- 초안 3차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**겹친 목록 세기** · `split-unique-count`

> 겹친 항목이 몇 개인지 알아내세요.  
> 중복을 없애면 개수가 달라져요.

| 성공 조건 보기 | 표시 |
|---|---|
| 3이 나오면 성공 | hardcode |
| 에러 안 나면 성공 | luck |
| 전체 항목 수가 나오면 성공 | 진짜 (total) |
| 겹치는 건 한 번만 센 수가 나오면 성공 | 진짜 (unique) |

| 자료 | 값 |
|---|---|
| 첫 목록 | `사과,배,사과,포도` |
| 둘째 목록 | `배,포도,귤,배` |
| 화요일 목록 (반례 · count) | `사과,배,사과,포도,귤` |

### 10. 파일 입출력. open, read

- 핵심: 파일에서 읽은 줄마다 쓸 것만 골라낸다
- HTTP: 유형 ok 1.3초 → 초안 ok 2.7초 → 초안 ok 2.3초
- 유형: `split-filter-join` (조건에 맞는 항목만 골라 다시 이어 붙이기) · 고른 쪽: llm
- 초안 1차 검증 통과
- 초안 2차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required

**파일 줄 고르기** · `split-filter-join`

> 파일에서 읽은 줄을 보고 필요한 것만 골라 이어 주세요.  
> 기록을 다시 써야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 메모가 나오면 성공 | hardcode |
| 에러 안 나면 성공 | luck |
| 조건에 맞는 줄만 남으면 성공 | 진짜 (filtered) |

| 자료 | 값 |
|---|---|
| 아침 줄 | `사과,메모,우유,연필` |
| 점심 줄 | `물,책,메모,공책` |
| 다른시간 줄 (반례 · empty) | `사과,우유,연필,물` |

걸러낼 대상: 메모, 책

