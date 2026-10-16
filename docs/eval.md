# 미션 생성 평가

실행 2026-10-16 23:42 · 모델 `openai/gpt-5.4-mini` · 수업 주제 10개

`uv run --with-requirements requirements.txt python test/eval_generate.py` 로 다시 만든다. 원본 응답은 `docs/eval-raw.json`.

## 요약

| 항목 | 값 |
|---|---|
| 미션 생성 성공 | 10 / 10 |
| 1차 응답이 검사를 바로 통과 | 2 / 10 |
| 재요청 | 7 건 |
| 기본 틀로 바뀐 칸이 없는 미션 | 8 / 10 |
| 기본 틀로 바뀐 칸이 있는 미션 | 2 건 |
| 자료를 보정한 미션 | 2 건 |
| 유형을 LLM 이 고름 | 10 / 10 |
| 유형이 기대와 같음 | 9 / 10 |
| 나온 유형 가짓수 | 6 |
| 검수 1차 통과 | 5 / 10 |
| 검수 통과 (재생성 포함) | 7 / 10 |
| 교사 검수로 넘어감 | 3 / 10 |
| 미션 하나 걸린 시간 | 평균 15.1초 · 최대 32.4초 |
| HTTP `유형 · json_schema → ok` | 19회 · 평균 1.7초 |
| HTTP `초안 · json_schema → ok` | 55회 · 평균 2.1초 |

### 검증에 걸린 칸 (시도 기준)

| 칸 | 횟수 |
|---|---|
| `brief` | 49 |
| `situation` | 33 |
| `title` | 28 |
| `itemName` | 28 |
| `counter` | 28 |
| `data` | 28 |
| `filterTarget` | 16 |
| `filterDesc` | 16 |

## 주제별

| # | 수업 | 기대 유형 | 나온 유형 | 시간 | LLM 호출 | 1차 검증 | 기본 틀 칸 | 결과 |
|---|---|---|---|---|---|---|---|---|
| 1 | 파이썬 리스트와 반복문. for문으로 하나씩 | `split-unique-count` | `split-unique-count` | 25.7초 | 11 | situation, brief | - | 생성 |
| 2 | 조건문 if-else. 조건이 참이면 A,  | `split-filter-count` | `split-filter-count` | 7.5초 | 5 | brief | brief | 생성 |
| 3 | 딕셔너리. 키와 값 쌍으로 저장 | `split-group` | `split-group` | 4.5초 | 3 | 통과 | - | 생성 |
| 4 | 함수 정의와 호출. def로 만들고 여러 번 | `split-transform-join` | `split-transform-join` | 7.8초 | 5 | brief | brief | 생성 |
| 5 | 문자열 다루기. split, strip, r | `split-transform-join` | `split-transform-join` | 6.4초 | 4 | brief | - | 생성 |
| 6 | 정렬. sorted와 sort의 차이 | `split-sort-join` | `split-sort-join` | 18.3초 | 8 | brief | - | 생성 |
| 7 | 숫자 형변환. int()로 문자열을 숫자로 | `split-num-sum` | `split-filter-num-sum` | 21.1초 | 10 | brief | - | 생성 |
| 8 | 예외 처리. try-except | `split-filter-num-sum` | `split-filter-num-sum` | 22.0초 | 12 | brief | - | 생성 |
| 9 | 집합 set. 중복 없는 모음 | `split-unique-count` | `split-unique-count` | 5.5초 | 3 | 통과 | - | 생성 |
| 10 | 파일 입출력. open, read | `split-filter-count` | `split-filter-count` | 32.4초 | 13 | brief | - | 생성 |

## 상세

### 1. 파이썬 리스트와 반복문. for문으로 하나씩 꺼내서 처리하는 법

- 핵심: 같은 값이 여러 번 있을 때 전체와 서로 다른 개수가 다르다
- HTTP: 유형 ok 6.0초 → 초안 ok 1.8초 → 초안 ok 1.8초 → 초안 ok 1.5초 → 유형 ok 1.6초 → 초안 ok 1.4초 → 초안 ok 1.5초 → 유형 ok 1.7초 → 초안 ok 1.7초 → 초안 ok 1.6초 → 초안 ok 5.0초
- 유형: `split-unique-count` (같은 항목이 겹쳐 나오는 목록에서 개수 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `situation` '같은 값이 여러 번 나올 수 있습니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
  - `brief` '목록에서 같은 항목의 개수를 정해 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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
- 초안 7차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 초안 8차 검증 실패
  - `brief` '목록에서 항목 수를 살펴보세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 9차 검증 통과
- 초안 10차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**겹친 이름 세기** · `split-unique-count`

> 목록에서 같은 이름이 몇 개인지 알아보세요.  
> 같은 이름이 여러 번 적힌 목록을 정리해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 겹치는 건 한 번만 센 수가 나오면 성공 | 진짜 (unique) |
| 3이 나오면 성공 | hardcode |
| 전체 이름 수가 나오면 성공 | 진짜 (total) |

- 검수: 요청·상황 문장에 답이나 푸는 방법이 드러나지 않았나 — 성공 조건에 어떤 답이 맞는지 일부 드러나 있어 답을 바로 떠올릴 수 있습니다.

| 자료 | 값 |
|---|---|
| 월요일 이름 | `민수,지은,민수,하늘` |
| 화요일 이름 | `민수,지은,하늘,도윤` |
| 금요일 목록 (반례 · count) | `민수,지은,민수,하늘,도윤` |

### 2. 조건문 if-else. 조건이 참이면 A, 거짓이면 B

- 핵심: 어떤 기준으로 걸러내는지를 학생이 직접 정하게
- HTTP: 유형 ok 1.1초 → 초안 ok 1.7초 → 초안 ok 1.6초 → 초안 ok 1.6초 → 초안 ok 1.5초
- 유형: `split-filter-count` (조건에 맞는 항목만 골라 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '교재 세권에서 고를 대상을 찾아 세어 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 실패
  - `brief` '준비물에서 필요한 것만 골라 세어 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 3차 검증 실패
  - `brief` '준비물은 몇 개인지 찾아 주세': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
- 초안 4차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 기본 틀로 바뀐 칸: brief

**준비물 찾기** · `split-filter-count`

> 조건에 맞는 준비물이 몇 개인지 알려 주세요.  
> 수업에 맞는 준비물만 골라야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 3이 나오면 성공 | hardcode |
| 에러 안 나면 성공 | luck |
| 조건에 맞는 준비물 수가 나오면 성공 | 진짜 (filtered_count) |

| 자료 | 값 |
|---|---|
| 1반 준비물 | `연필,지우개,공책,색연필` |
| 2반 준비물 | `연필,공책,자,가위` |
| 금요일 준비물 (반례 · empty) | `색연필,자,가위,사과` |

걸러낼 대상: 연필, 공책, 지우개

### 3. 딕셔너리. 키와 값 쌍으로 저장

- 핵심: 같은 키가 여러 번 나오면 묶어서 센다
- HTTP: 유형 ok 1.4초 → 초안 ok 1.6초 → 초안 ok 1.5초
- 유형: `split-group` (같은 항목끼리 묶어 몇 번씩 나왔는지 세기) · 고른 쪽: llm
- 초안 1차 검증 통과
- 초안 2차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**과일 묶어 세기** · `split-group`

> 세 자료를 보고 같은 항목이 몇 번씩 나왔는지 찾아보세요.  
> 반마다 나온 과일 이름을 정리해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 사과가 2번 나오면 성공 | hardcode |
| 에러 안 나면 성공 | luck |
| 과일마다 나온 횟수가 보이면 성공 | 진짜 (group) |

| 자료 | 값 |
|---|---|
| 월요일 과일 | `사과,배,사과,포도` |
| 화요일 과일 | `배,사과,귤,배` |
| 금요일 과일 (반례 · count) | `사과,배,사과,포도,사과,배` |

### 4. 함수 정의와 호출. def로 만들고 여러 번 호출

- 핵심: 같은 작업을 항목마다 반복할 때 함수로 묶는다
- HTTP: 유형 ok 1.6초 → 초안 ok 1.5초 → 초안 ok 1.7초 → 초안 ok 1.4초 → 초안 ok 1.6초
- 유형: `split-transform-join` (항목마다 앞뒤 공백 같은 것을 정리하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '항목 세 개를 보고 같은 기준으로 정리해 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 실패
  - `brief` '세 항목을 보고 무엇이 같은지 알아내 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 3차 검증 실패
  - `brief` '세 항목을 보고 몇 가지를 알아내 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 4차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 기본 틀로 바뀐 칸: brief

**공백 정리하기** · `split-transform-join`

> 문자열 목록을 깔끔하게 다시 만들어 주세요.  
> 항목마다 앞뒤 공백을 없애야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 사과,배,복숭아가 나오면 성공 | hardcode |
| 문자열마다 깔끔해지면 성공 | 진짜 (transformed) |

| 자료 | 값 |
|---|---|
| 월요일 자료 | ` 사과,배 , 복숭아 ` |
| 화요일 자료 | ` 바나나 ,수박, 참외` |
| 다른 날 자료 (반례 · invisible) | ` 바나나 , 수박 , 참외 ` |

### 5. 문자열 다루기. split, strip, replace

- 핵심: 데이터를 나누고 정리하는 과정에서 공백이 문제를 일으킨다
- HTTP: 유형 ok 1.3초 → 초안 ok 1.7초 → 초안 ok 1.7초 → 초안 ok 1.7초
- 유형: `split-transform-join` (항목마다 앞뒤 공백 같은 것을 정리하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '세 자료를 보고 맞는 기준을 정해 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 통과
- 초안 3차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**과일 정리하기** · `split-transform-join`

> 깔끔한 기준을 찾아 주세요.  
> 공백이 섞인 이름을 정리해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 사과,배,복숭아가 나오면 성공 | hardcode |
| 에러 안 나면 성공 | luck |
| 이름마다 깔끔해지면 성공 | 진짜 (transformed) |

| 자료 | 값 |
|---|---|
| 월요일 이름 | ` 사과,배 , 복숭아 ` |
| 화요일 이름 | `사과 , 배,복숭아` |
| 공백 차이 (반례 · count) | ` 사과,배 , 복숭아 , 사과,사과 ` |

### 6. 정렬. sorted와 sort의 차이

- 핵심: 순서가 뒤섞인 목록을 기준에 맞게 늘어놓는다
- HTTP: 유형 ok 1.2초 → 초안 ok 2.0초 → 초안 ok 1.9초 → 초안 ok 4.3초 → 유형 ok 2.2초 → 초안 ok 2.1초 → 초안 ok 2.2초 → 초안 ok 2.4초
- 유형: `split-sort-join` (항목을 순서대로 늘어놓기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '약속 목록을 기준에 맞게 늘어놓으세요.' — 구할 값이 없음. '순서' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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
- 초안 5차 검증 실패
  - `brief` '반장님이 적은 메모를 알기 쉽게 정리해 주세요.' — 구할 값이 없음. '순서' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 6차 검증 통과
- 초안 7차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**생활기록 정리** · `split-sort-join`

> 메모들 사이의 순서를 알아내 주세요.  
> 오늘 나온 메모를 같은 기준으로 정리해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 도윤,민서,지우,하늘이 나오면 성공 | hardcode |
| 순서대로 늘어서면 성공 | 진짜 (sorted) |

| 자료 | 값 |
|---|---|
| 월요일 메모 | `지우,민서,하늘,도윤` |
| 수요일 메모 | `민서,하늘,도윤,지우` |
| 금요일 메모 (반례 · count) | `지우,민서,하늘,도윤,지우,민서` |

### 7. 숫자 형변환. int()로 문자열을 숫자로

- 핵심: 문자로 된 숫자는 더하기 전에 바꿔야 한다
- HTTP: 유형 ok 2.9초 → 초안 ok 2.0초 → 초안 ok 5.0초 → 초안 ok 1.8초 → 유형 ok 1.1초 → 초안 ok 2.1초 → 초안 ok 1.7초 → 유형 ok 1.1초 → 초안 ok 1.7초 → 초안 ok 1.9초
- 유형: `split-filter-num-sum` (숫자와 글자가 섞인 목록에서 숫자만 골라 더하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '목록에서 숫자만 골라 더해주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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
- 초안 4차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 초안 5차 검증 통과
- 초안 6차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 초안 7차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
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
- 자료 보정: 걸러낼 대상에 사과, 연필, 책 를 넣었어요

**메모 정리** · `split-filter-num-sum`

> 목록에서 필요한 값들을 골라 합을 구해 주세요.  
> 기록을 정리해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 8이 나오면 성공 | hardcode |
| 숫자만 더한 값이 나오면 성공 | 진짜 (filtered_sum) |

- 검수: 요청·상황 문장에 답이나 푸는 방법이 드러나지 않았나 — 숫자만 더하라는 방법이 이미 들어 있어 답이나 푸는 법이 보입니다.

| 자료 | 값 |
|---|---|
| 월요일 메모 | `3,사과,5,연필` |
| 화요일 메모 | `2,책,4,7` |
| 수요일 메모 (반례 · empty) | `사과,연필,책,사과` |

걸러낼 대상: 사과, 연필, 책

### 8. 예외 처리. try-except

- 핵심: 숫자가 아닌 값이 섞여 있으면 계산이 멈춘다
- HTTP: 유형 ok 1.1초 → 초안 ok 1.7초 → 초안 ok 1.5초 → 초안 ok 1.8초 → 유형 ok 1.1초 → 초안 ok 1.7초 → 초안 ok 2.5초 → 초안 ok 1.7초 → 유형 ok 2.6초 → 초안 ok 2.2초 → 초안 ok 2.3초 → 초안 ok 1.8초
- 유형: `split-filter-num-sum` (숫자와 글자가 섞인 목록에서 숫자만 골라 더하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '목록을 보고 숫자만 찾아 더해 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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
  - `situation` '숫자가 섞이면 계산이 멈추는 상황입니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
  - `brief` '세 자료를 살펴서 기준에 맞는 것만 찾아주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 6차 검증 통과
- 초안 7차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 초안 8차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 초안 9차 검증 실패
  - `brief` '세 자료에서 숫자만 찾아 더해 주십시오.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
  - `brief` '세 자료에서 숫자만 찾아 더해 주십시오.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
  - `situation` '숫자가 섞이면 계산이 멈출 수 있습니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
- 초안 10차 검증 통과
- 초안 11차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 자료 보정: 걸러낼 대상에서 자료에 없는 말과 숫자를 뺐어요
- 자료 보정: 걸러낼 대상에 사과, 연필, 공책, 가방 를 넣었어요

**섞인목록더하기** · `split-filter-num-sum`

> 세 자료에서 얼마인지 알아봐 주세요.  
> 숫자가 섞이면 계산이 멈춰요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 숫자만 더한 값이 나오면 성공 | 진짜 (filtered_sum) |
| 10이 나오면 성공 | hardcode |

- 검수: 중1이 요청을 읽고 무엇을 구해야 하는지 아는가 — 세 자료에서 무엇을 더해 얼마를 구하라는지와 숫자만 더할지 판단하기 어렵습니다. / 요청·상황 문장에 답이나 푸는 방법이 드러나지 않았나 — 성공 조건에 숫자만 더한 값과 정답처럼 보이는 값이 들어 있어 답이 드러납니다.

| 자료 | 값 |
|---|---|
| 월요일 목록 | `3,사과,5,연필,2` |
| 화요일 목록 | `1,공책,4,가방,6` |
| 금요일 목록 (반례 · empty) | `사과,연필,공책,가방,사과` |

걸러낼 대상: 사과, 연필, 공책, 가방

### 9. 집합 set. 중복 없는 모음

- 핵심: 중복을 없애면 개수가 달라진다
- HTTP: 유형 ok 1.4초 → 초안 ok 2.5초 → 초안 ok 1.6초
- 유형: `split-unique-count` (같은 항목이 겹쳐 나오는 목록에서 개수 세기) · 고른 쪽: llm
- 초안 1차 검증 통과
- 초안 2차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**중복 개수 세기** · `split-unique-count`

> 겹쳐 나온 항목에서 몇 가지인지 알아내세요.  
> 중복을 없앤 뒤의 개수를 알아내야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 겹치는 건 한 번만 센 수가 나오면 성공 | 진짜 (unique) |
| 전체 목록 수가 나오면 성공 | 진짜 (total) |
| 에러 안 나면 성공 | luck |
| 3이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 목록 | `사과,배,사과,포도` |
| 수요일 목록 | `배,포도,사과,배` |
| 금요일 목록 (반례 · count) | `사과,배` |

### 10. 파일 입출력. open, read

- 핵심: 파일에서 읽은 줄마다 쓸 것만 골라낸다
- HTTP: 유형 ok 1.4초 → 초안 ok 1.8초 → 초안 ok 1.6초 → 초안 ok 1.6초 → 초안 ok 2.1초 → 유형 ok 1.2초 → 초안 ok 2.0초 → 초안 ok 1.6초 → 초안 ok 2.0초 → 유형 ok 1.2초 → 초안 ok 13.0초 → 초안 ok 1.6초 → 초안 ok 1.5초
- 유형: `split-filter-count` (조건에 맞는 항목만 골라 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '파일에서 읽은 항목만 다루어 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 실패
  - `brief` '파일에서 읽은 것 중 남길 것만 찾아 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 3차 검증 실패
  - `brief` '파일에서 남길 것만 알려 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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
  - `situation` '모두 조건에 맞게 다시 이어 붙여야 합니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
  - `brief` '파일에서 필요한 줄만 남겨 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 7차 검증 실패
  - `brief` '파일에서 필요한 줄만 남겨 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 8차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 초안 9차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 초안 10차 검증 실패
  - `situation` '기록을 확인해야 합니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
  - `brief` '읽은 줄에서 필요한 것만 세어 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 11차 검증 통과
- 초안 12차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required

**줄 개수 찾기** · `split-filter-count`

> 읽은 줄에서 몇 개인지 알아내 주세요.  
> 기록을 확인해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 조건에 맞는 기록 수가 나오면 성공 | 진짜 (filtered_count) |
| 에러 안 나면 성공 | luck |
| 1이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 아침 기록 | `준비,출석,정리,청소` |
| 점심 기록 | `식사,정리,휴식,청소` |
| 다음날 기록 (반례 · empty) | `준비,출석,청소,식사` |

걸러낼 대상: 정리

