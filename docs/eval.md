# 미션 생성 평가

실행 2026-10-17 02:21 · 모델 `openai/gpt-5.4-mini` · 수업 주제 10개

`uv run --with-requirements requirements.txt python test/eval_generate.py` 로 다시 만든다. 원본 응답은 `docs/eval-raw.json`.

## 요약

| 항목 | 값 |
|---|---|
| 미션 생성 성공 | 10 / 10 |
| 1차 응답이 검사를 바로 통과 | 2 / 10 |
| 재요청 | 8 건 |
| 기본 틀로 바뀐 칸이 없는 미션 | 8 / 10 |
| 기본 틀로 바뀐 칸이 있는 미션 | 2 건 |
| 자료를 보정한 미션 | 2 건 |
| 유형을 LLM 이 고름 | 10 / 10 |
| 유형이 기대와 같음 | 7 / 10 |
| 나온 유형 가짓수 | 8 |
| 검수 1차 통과 | 7 / 10 |
| 검수 통과 (재생성 포함) | 10 / 10 |
| 교사 검수로 넘어감 | 0 / 10 |
| 미션 하나 걸린 시간 | 평균 11.1초 · 최대 27.8초 |
| HTTP `유형 · json_schema → ok` | 14회 · 평균 1.4초 |
| HTTP `초안 · json_schema → ok` | 45회 · 평균 2.0초 |

### 검증에 걸린 칸 (시도 기준)

| 칸 | 횟수 |
|---|---|
| `brief` | 36 |
| `situation` | 20 |
| `itemName` | 19 |
| `title` | 18 |
| `counter` | 18 |
| `data` | 18 |
| `filterDesc` | 9 |
| `filterTarget` | 8 |

## 주제별

| # | 수업 | 기대 유형 | 나온 유형 | 시간 | LLM 호출 | 1차 검증 | 기본 틀 칸 | 결과 |
|---|---|---|---|---|---|---|---|---|
| 1 | 파이썬 리스트와 반복문. for문으로 하나씩 | `split-unique-count` | `split-unique-count` | 9.9초 | 4 | brief | - | 생성 |
| 2 | 조건문 if-else. 조건이 참이면 A,  | `split-filter-count` | `split-filter-count` | 6.5초 | 4 | brief | - | 생성 |
| 3 | 딕셔너리. 키와 값 쌍으로 저장 | `split-group` | `split-group` | 5.0초 | 3 | 통과 | - | 생성 |
| 4 | 함수 정의와 호출. def로 만들고 여러 번 | `split-transform-join` | `split-count` | 9.9초 | 5 | brief | - | 생성 |
| 5 | 문자열 다루기. split, strip, r | `split-transform-join` | `split-transform-join` | 8.3초 | 5 | itemName, brief | - | 생성 |
| 6 | 정렬. sorted와 sort의 차이 | `split-sort-join` | `split-sort-join` | 18.2초 | 13 | brief | brief | 생성 |
| 7 | 숫자 형변환. int()로 문자열을 숫자로 | `split-num-sum` | `split-filter-num-sum` | 4.5초 | 3 | 통과 | - | 생성 |
| 8 | 예외 처리. try-except | `split-filter-num-sum` | `split-filter-num-sum` | 27.8초 | 9 | filterDesc, brief | - | 생성 |
| 9 | 집합 set. 중복 없는 모음 | `split-unique-count` | `split-unique-count` | 7.6초 | 5 | brief, situation | brief | 생성 |
| 10 | 파일 입출력. open, read | `split-filter-count` | `split-filter-join` | 13.0초 | 8 | brief | - | 생성 |

## 상세

### 1. 파이썬 리스트와 반복문. for문으로 하나씩 꺼내서 처리하는 법

- 핵심: 같은 값이 여러 번 있을 때 전체와 서로 다른 개수가 다르다
- HTTP: 유형 ok 5.0초 → 초안 ok 1.7초 → 초안 ok 1.5초 → 초안 ok 1.6초
- 유형: `split-unique-count` (같은 항목이 겹쳐 나오는 목록에서 개수 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '겹쳐 나온 항목의 개수를 알아내 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 통과
- 초안 3차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**겹친 목록 세기** · `split-unique-count`

> 항목이 몇 개인지 알아내 주세요.  
> 목록의 전체 개수를 알아내야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 월요일 목록의 답과 같은 3이 나오면 성공 | hardcode |
| 에러 없이 끝나기만 하면 성공 | luck |
| 겹치는 항목은 한 번만 센 수가 나오면 성공 | 진짜 (unique) |

| 자료 | 값 |
|---|---|
| 월요일 목록 | `사과,배,사과,포도` |
| 화요일 목록 | `사과,사과,배,포도` |
| 금요일 목록 (반례 · count) | `사과,배` |

### 2. 조건문 if-else. 조건이 참이면 A, 거짓이면 B

- 핵심: 어떤 기준으로 걸러내는지를 학생이 직접 정하게
- HTTP: 유형 ok 1.2초 → 초안 ok 1.7초 → 초안 ok 1.6초 → 초안 ok 2.0초
- 유형: `split-filter-count` (조건에 맞는 항목만 골라 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '스티커 목록에서 조건에 맞는 항목 수를 골라 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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

**스티커 세기** · `split-filter-count`

> 스티커 목록에서 몇 개를 골라야 하는지 알려 주세요.  
> 분류 기준을 정해 주세요.

| 성공 조건 보기 | 표시 |
|---|---|
| 월요일 스티커의 답과 같은 1이 나오면 성공 | hardcode |
| 조건에 맞는 스티커만 센 수가 나오면 성공 | 진짜 (filtered_count) |
| 에러 없이 끝나기만 하면 성공 | luck |

| 자료 | 값 |
|---|---|
| 월요일 스티커 | `빨강,동그라미,작다` |
| 화요일 스티커 | `빨강,네모,크다` |
| 빨간 스티커 (반례 · empty) | `동그라미,작다,네모,크다` |

걸러낼 대상: 빨강

### 3. 딕셔너리. 키와 값 쌍으로 저장

- 핵심: 같은 키가 여러 번 나오면 묶어서 센다
- HTTP: 유형 ok 1.2초 → 초안 ok 1.6초 → 초안 ok 2.2초
- 유형: `split-group` (같은 항목끼리 묶어 몇 번씩 나왔는지 세기) · 고른 쪽: llm
- 초안 1차 검증 통과
- 초안 2차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**간식 묶기 세기** · `split-group`

> 간식 이름이 몇 번씩 나왔는지 적어 주세요.  
> 같은 이름은 묶어 세어야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 간식마다 몇 번 나왔는지가 나오면 성공 | 진짜 (group) |
| 에러 없이 끝나기만 하면 성공 | luck |
| 점심 간식처럼 과자가 2번 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 점심 간식 | `과자,우유,과자,빵` |
| 쉬는 시간 간식 | `과자,빵,과자,사과` |
| 화요일 간식 (반례 · count) | `과자,우유,과자,빵,과자,과자` |

### 4. 함수 정의와 호출. def로 만들고 여러 번 호출

- 핵심: 같은 작업을 항목마다 반복할 때 함수로 묶는다
- HTTP: 유형 ok 1.1초 → 초안 ok 1.5초 → 초안 ok 1.7초 → 초안 ok 1.7초 → 초안 ok 3.9초
- 유형: `split-count` (목록의 항목 수 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '자료 세 개의 항목 수를 알아내 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 실패
  - `brief` '자료 세 개의 항목 수를 알아내 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 3차 검증 통과
- 초안 4차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**개수 세기** · `split-count`

> 목록의 항목이 몇 개인지 알아내 주세요.  
> 여러 목록을 보고 각 항목 수를 세어야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 항목이 모두 몇 개인지 나오면 성공 | 진짜 (count) |
| 에러 없이 끝나기만 하면 성공 | luck |
| 월요일 목록의 답과 같은 3이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 목록 | `국어,수학,과학` |
| 화요일 목록 | `미술,체육,영어,도덕` |
| 다른 목록 (반례 · count) | `국어,수학,과학,국어,미술` |

### 5. 문자열 다루기. split, strip, replace

- 핵심: 데이터를 나누고 정리하는 과정에서 공백이 문제를 일으킨다
- HTTP: 유형 ok 1.3초 → 초안 ok 1.7초 → 초안 ok 1.6초 → 초안 ok 1.5초 → 초안 ok 2.2초
- 유형: `split-transform-join` (항목마다 앞뒤 공백 같은 것을 정리하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `itemName` 'itemName': 8자 — 6자 안으로
  - `itemName` 'itemName' — 항목을 부르는 말은 한글로
  - `brief` '앞뒤 공백이 섞인 itemName을 3가지 자료로 살펴보세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 실패
  - `brief` '세 자료의 itemName을 살펴보고 가장 맞는 기준을 생각해 주세​요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
  - `brief` '세 자료의 itemName을 살펴보고 가장 맞는 기준을 생각해 주세​요.' — 무엇의 값인지 없음. 항목 이름 '항목' 을 넣는다
- 초안 3차 검증 통과
- 초안 4차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**공백 정리** · `split-transform-join`

> 세 자료에서 항목을 깔끔하게 정리해 주세​요.  
> 공백을 정리해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 없이 끝나기만 하면 성공 | luck |
| 월요일 공백의 답과 같은 사과,배,복숭아가 나오면 성공 | hardcode |
| 항목마다 깔끔하게 다듬은 목록이 나오면 성공 | 진짜 (transformed) |

| 자료 | 값 |
|---|---|
| 월요일 공백 | ` 사과,배 , 복숭아 ` |
| 화요일 공백 | ` 포도,귤 , 참외 ` |
| 금요일 공백 (반례 · invisible) | ` 포도 , 귤 , 참외 ` |

### 6. 정렬. sorted와 sort의 차이

- 핵심: 순서가 뒤섞인 목록을 기준에 맞게 늘어놓는다
- HTTP: 유형 ok 1.0초 → 초안 ok 1.3초 → 초안 ok 1.4초 → 초안 ok 1.7초 → 유형 ok 1.0초 → 초안 ok 1.5초 → 초안 ok 1.2초 → 초안 ok 1.8초 → 유형 ok 1.0초 → 초안 ok 1.5초 → 초안 ok 1.5초 → 초안 ok 1.4초 → 초안 ok 1.9초
- 유형: `split-sort-join` (항목을 순서대로 늘어놓기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '항목을 기준에 맞게 늘어놓아야 합니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
  - `brief` '항목을 기준에 맞게 늘어놓아야 합니다.' — 구할 값이 없음. '순서' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
  - `brief` '항목을 기준에 맞게 늘어놓아야 합니다.' — 무엇의 값인지 없음. 항목 이름 '순서' 을 넣는다
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
  - `brief` '세 자료의 항목을 기준에 맞게 살펴 정리해 주세요.' — 구할 값이 없음. '순서' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
  - `brief` '세 자료의 항목을 기준에 맞게 살펴 정리해 주세요.' — 무엇의 값인지 없음. 항목 이름 '등수' 을 넣는다
- 초안 6차 검증 통과
- 초안 7차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 초안 8차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 초안 9차 검증 실패
  - `brief` '세 가지 자료를 보고 itemName를 정리해 주세요.' — 구할 값이 없음. '순서' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
  - `brief` '세 가지 자료를 보고 itemName를 정리해 주세요.' — 무엇의 값인지 없음. 항목 이름 '등수' 을 넣는다
- 초안 10차 검증 실패
  - `brief` '세 가지 자료의 등수를 정해 주세요.' — 구할 값이 없음. '순서' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 11차 검증 실패
  - `brief` '세 가지 자료의 순서를 알아내 주세요.' — 무엇의 값인지 없음. 항목 이름 '등수' 을 넣는다
- 초안 12차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 기본 틀로 바뀐 칸: brief

**등수 배열하기** · `split-sort-join`

> 등수는 순서대로 놓은 목록을 만들어 주세요.  
> 같은 기준으로 늘어놓아야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 없이 끝나기만 하면 성공 | luck |
| 등수가 순서대로 놓인 목록이 나오면 성공 | 진짜 (sorted) |
| 월요일 등수의 답과 같은 민준,서연,지우,하윤이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 등수 | `민준,서연,하윤,지우` |
| 화요일 등수 | `지우,하윤,서연,민준` |
| 토요일 등수 (반례 · count) | `민준,서연,하윤,지우,민준,지우` |

### 7. 숫자 형변환. int()로 문자열을 숫자로

- 핵심: 문자로 된 숫자는 더하기 전에 바꿔야 한다
- HTTP: 유형 ok 1.0초 → 초안 ok 1.6초 → 초안 ok 1.8초
- 유형: `split-filter-num-sum` (숫자와 글자가 섞인 목록에서 숫자만 골라 더하기) · 고른 쪽: llm
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
- 자료 보정: 걸러낼 대상에서 자료에 없는 말과 숫자를 뺐어요
- 자료 보정: 걸러낼 대상에 사과, 배 를 넣었어요

**숫자만더하기** · `split-filter-num-sum`

> 목록에서 숫자만 골라 모두 더해 주세요.  
> 문자와 숫자가 섞인 자료를 정리해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 없이 끝나기만 하면 성공 | luck |
| 첫목록의 답과 같은 10이 나오면 성공 | hardcode |
| 숫자인 목록만 더한 값이 나오면 성공 | 진짜 (filtered_sum) |

| 자료 | 값 |
|---|---|
| 첫목록 | `3,사과,5,2` |
| 둘목록 | `4,배,1,6` |
| 빈칸이득인목록 (반례 · empty) | `사과,배,사과` |

걸러낼 대상: 사과, 배

### 8. 예외 처리. try-except

- 핵심: 숫자가 아닌 값이 섞여 있으면 계산이 멈춘다
- HTTP: 유형 ok 1.2초 → 초안 ok 3.4초 → 초안 ok 1.5초 → 초안 ok 2.1초 → 유형 ok 1.4초 → 초안 ok 13.0초 → 초안 ok 1.7초 → 초안 ok 1.7초 → 초안 ok 1.8초
- 유형: `split-filter-num-sum` (숫자와 글자가 섞인 목록에서 숫자만 골라 더하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `filterDesc` '숫자만 골라 더한 목록': 12자 — 10자 안으로
  - `brief` '주어진 목록에서 숫자만 알려 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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
  - `brief` '세 자료의 숫자만 골라 더한 결과를 알아내 주세': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
  - `brief` '세 자료의 숫자만 골라 더한 결과를 알아내 주세' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
  - `brief` '세 자료의 숫자만 골라 더한 결과를 알아내 주세' — 무엇의 값인지 없음. 항목 이름 '목록' 을 넣는다
- 초안 6차 검증 실패
  - `brief` '목록의 숫자만 골라 더한 값이 얼마인지 알아내 주세': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
- 초안 7차 검증 통과
- 초안 8차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 자료 보정: 걸러낼 대상에서 자료에 없는 말과 숫자를 뺐어요
- 자료 보정: 걸러낼 대상에 연필, 책, 공책, 가방 를 넣었어요

**숫자 고르기** · `split-filter-num-sum`

> 목록의 숫자만 골라 더한 값이 얼마인지 알아내 주세요.  
> 섞인 목록에서 더할 숫자만 찾아야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 없이 끝나기만 하면 성공 | luck |
| 첫 번째 목록의 답과 같은 8이 나오면 성공 | hardcode |
| 숫자인 목록만 더한 값이 나오면 성공 | 진짜 (filtered_sum) |

| 자료 | 값 |
|---|---|
| 첫 번째 목록 | `3,연필,5,책` |
| 둘째 목록 | `2,공책,4,가방` |
| 글자만 목록 (반례 · empty) | `연필,책,공책,가방,연필` |

걸러낼 대상: 연필, 책, 공책, 가방

### 9. 집합 set. 중복 없는 모음

- 핵심: 중복을 없애면 개수가 달라진다
- HTTP: 유형 ok 1.2초 → 초안 ok 1.6초 → 초안 ok 1.5초 → 초안 ok 1.4초 → 초안 ok 1.9초
- 유형: `split-unique-count` (같은 항목이 겹쳐 나오는 목록에서 개수 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '중복이 섞인 목록에서 itemName 개수를 찾아 주세요.': 답 암시 '중복' — 업무 요청은 모호해야 분해가 학생 몫으로 남는다
  - `brief` '중복이 섞인 목록에서 itemName 개수를 찾아 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
  - `situation` '같은 항목이 여러 번 나옵니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
- 초안 2차 검증 실패
  - `brief` '같은 항목이 섞인 목록에서 개수를 알아내 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 3차 검증 실패
  - `brief` '몇 가지 itemName이 있는지 알아내 주세요.' — 무엇의 값인지 없음. 항목 이름 '개수' 을 넣는다
- 초안 4차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 기본 틀로 바뀐 칸: brief

**중복 묶음 세기** · `split-unique-count`

> 개수가 모두 몇 가지인지 알려 주세요.  
> 같은 항목이 여러 번 나와요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 없이 끝나기만 하면 성공 | luck |
| 겹치는 개수는 한 번만 센 수가 나오면 성공 | 진짜 (unique) |
| 월요일 자료의 답과 같은 3이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 자료 | `사과,배,사과,포도,배` |
| 화요일 자료 | `사과,배,사과,포도,배` |
| 수요일 자료 (반례 · count) | `사과,배` |

### 10. 파일 입출력. open, read

- 핵심: 파일에서 읽은 줄마다 쓸 것만 골라낸다
- HTTP: 유형 ok 1.3초 → 초안 ok 1.7초 → 초안 ok 1.7초 → 초안 ok 1.9초 → 유형 ok 1.3초 → 초안 ok 1.7초 → 초안 ok 1.8초 → 초안 ok 1.7초
- 유형: `split-filter-join` (조건에 맞는 항목만 골라 다시 이어 붙이기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '급식 알레르기 목록에서 필요한 것만 골라 주세요.' — 무엇의 값인지 없음. 항목 이름 '재료' 을 넣는다
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
  - `situation` '기록을 다시 정리해야 합니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
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

**줄 골라붙이기** · `split-filter-join`

> 파일에서 읽은 줄마다 쓸 것만 골라내세요.  
> 기록을 다시 정리해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 조건에 맞는 줄만 남은 목록이 나오면 성공 | 진짜 (filtered) |
| 월요일 목록의 답과 같은 연필,공책이 나오면 성공 | hardcode |
| 에러 없이 끝나기만 하면 성공 | luck |

| 자료 | 값 |
|---|---|
| 월요일 목록 | `연필,지우개,공책,가위` |
| 화요일 목록 | `연필,자,공책,풀` |
| 토요일 목록 (반례 · empty) | `지우개,가위,풀,사과` |

걸러낼 대상: 연필, 공책, 자

