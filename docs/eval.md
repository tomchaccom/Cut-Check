# 미션 생성 평가

실행 2026-10-17 01:07 · 모델 `openai/gpt-5.4-mini` · 수업 주제 10개

`uv run --with-requirements requirements.txt python test/eval_generate.py` 로 다시 만든다. 원본 응답은 `docs/eval-raw.json`.

## 요약

| 항목 | 값 |
|---|---|
| 미션 생성 성공 | 10 / 10 |
| 1차 응답이 검사를 바로 통과 | 5 / 10 |
| 재요청 | 6 건 |
| 기본 틀로 바뀐 칸이 없는 미션 | 9 / 10 |
| 기본 틀로 바뀐 칸이 있는 미션 | 1 건 |
| 자료를 보정한 미션 | 1 건 |
| 유형을 LLM 이 고름 | 10 / 10 |
| 유형이 기대와 같음 | 8 / 10 |
| 나온 유형 가짓수 | 7 |
| 검수 1차 통과 | 8 / 10 |
| 검수 통과 (재생성 포함) | 10 / 10 |
| 교사 검수로 넘어감 | 0 / 10 |
| 미션 하나 걸린 시간 | 평균 8.8초 · 최대 23.5초 |
| HTTP `유형 · json_schema → ok` | 13회 · 평균 1.3초 |
| HTTP `초안 · json_schema → ok` | 37회 · 평균 1.9초 |

### 검증에 걸린 칸 (시도 기준)

| 칸 | 횟수 |
|---|---|
| `brief` | 29 |
| `title` | 16 |
| `situation` | 16 |
| `itemName` | 16 |
| `counter` | 16 |
| `data` | 16 |
| `filterTarget` | 10 |
| `filterDesc` | 10 |

## 주제별

| # | 수업 | 기대 유형 | 나온 유형 | 시간 | LLM 호출 | 1차 검증 | 기본 틀 칸 | 결과 |
|---|---|---|---|---|---|---|---|---|
| 1 | 파이썬 리스트와 반복문. for문으로 하나씩 | `split-unique-count` | `split-unique-count` | 5.2초 | 3 | 통과 | - | 생성 |
| 2 | 조건문 if-else. 조건이 참이면 A,  | `split-filter-count` | `split-filter-count` | 12.6초 | 7 | 통과 | - | 생성 |
| 3 | 딕셔너리. 키와 값 쌍으로 저장 | `split-group` | `split-group` | 5.3초 | 3 | 통과 | - | 생성 |
| 4 | 함수 정의와 호출. def로 만들고 여러 번 | `split-transform-join` | `split-transform-join` | 8.8초 | 5 | brief | brief | 생성 |
| 5 | 문자열 다루기. split, strip, r | `split-transform-join` | `split-transform-join` | 8.6초 | 5 | brief | - | 생성 |
| 6 | 정렬. sorted와 sort의 차이 | `split-sort-join` | `split-sort-join` | 5.6초 | 3 | 통과 | - | 생성 |
| 7 | 숫자 형변환. int()로 문자열을 숫자로 | `split-num-sum` | `split-filter-num-sum` | 6.8초 | 4 | brief | - | 생성 |
| 8 | 예외 처리. try-except | `split-filter-num-sum` | `split-filter-num-sum` | 23.5초 | 13 | brief | - | 생성 |
| 9 | 집합 set. 중복 없는 모음 | `split-unique-count` | `split-unique-count` | 4.8초 | 3 | 통과 | - | 생성 |
| 10 | 파일 입출력. open, read | `split-filter-count` | `split-filter-join` | 7.3초 | 4 | brief | - | 생성 |

## 상세

### 1. 파이썬 리스트와 반복문. for문으로 하나씩 꺼내서 처리하는 법

- 핵심: 같은 값이 여러 번 있을 때 전체와 서로 다른 개수가 다르다
- HTTP: 유형 ok 1.2초 → 초안 ok 1.9초 → 초안 ok 2.1초
- 유형: `split-unique-count` (같은 항목이 겹쳐 나오는 목록에서 개수 세기) · 고른 쪽: llm
- 초안 1차 검증 통과
- 초안 2차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**겹친 목록 세기** · `split-unique-count`

> 목록에서 몇 가지를 알아내 주세요.  
> 같은 항목이 여러 번 들어 있어요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 겹치는 건 한 번만 센 수가 나오면 성공 | 진짜 (unique) |
| 전체 자료 수가 나오면 성공 | 진짜 (total) |
| 3이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 목록 | `연필,지우개,연필,책` |
| 수요일 목록 | `연필,공책,연필,책` |
| 겹친 자료 (반례 · count) | `연필,지우개,연필,책,연필,공책` |

### 2. 조건문 if-else. 조건이 참이면 A, 거짓이면 B

- 핵심: 어떤 기준으로 걸러내는지를 학생이 직접 정하게
- HTTP: 유형 ok 1.2초 → 초안 ok 2.1초 → 초안 ok 2.1초 → 유형 ok 1.2초 → 초안 ok 2.1초 → 초안 ok 1.8초 → 초안 ok 2.1초
- 유형: `split-filter-count` (조건에 맞는 항목만 골라 세기) · 고른 쪽: llm
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
  - `brief` '어떤 것을 셀지 정해 주세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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

**준비물 세기** · `split-filter-count`

> 준비물에서 몇 개를 셀지 알아내 주세요.  
> 준비물을 확인해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 조건에 맞는 준비물 수가 나오면 성공 | 진짜 (filtered_count) |
| 3이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 1반 준비물 | `물통,연필,공책,색연필` |
| 2반 준비물 | `물통,연필,공책,지우개` |
| 수요일 준비물 (반례 · empty) | `색연필,지우개,사과,바나나` |

걸러낼 대상: 물통, 연필, 공책

### 3. 딕셔너리. 키와 값 쌍으로 저장

- 핵심: 같은 키가 여러 번 나오면 묶어서 센다
- HTTP: 유형 ok 1.2초 → 초안 ok 1.9초 → 초안 ok 2.2초
- 유형: `split-group` (같은 항목끼리 묶어 몇 번씩 나왔는지 세기) · 고른 쪽: llm
- 초안 1차 검증 통과
- 초안 2차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**급식 선호** · `split-group`

> 급식 기록을 묶어 나온 횟수를 알아내세요.  
> 같은 항목을 모아야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 항목마다 나온 횟수가 보이면 성공 | 진짜 (group) |
| 우유가 2번 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 항목 | `우유,빵,우유,사과` |
| 화요일 항목 | `빵,우유,빵,바나나` |
| 목요일 항목 (반례 · count) | `우유,빵,우유,사과,우유,빵` |

### 4. 함수 정의와 호출. def로 만들고 여러 번 호출

- 핵심: 같은 작업을 항목마다 반복할 때 함수로 묶는다
- HTTP: 유형 ok 1.2초 → 초안 ok 2.0초 → 초안 ok 1.8초 → 초안 ok 1.9초 → 초안 ok 1.9초
- 유형: `split-transform-join` (항목마다 앞뒤 공백 같은 것을 정리하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '항목마다 앞뒤 공백이 다른 자료를 정리해 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 실패
  - `brief` '항목마다 앞뒤 공백이 있는 이름을 알아내 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 3차 검증 실패
  - `brief` '항목마다 앞뒤 공백이 있는 이름을 찾아 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 4차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
- 기본 틀로 바뀐 칸: brief

**공백 정리** · `split-transform-join`

> 이름 목록을 깔끔하게 다시 만들어 주세요.  
> 이름을 보기 좋게 맞춰야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 이름마다 깔끔해지면 성공 | 진짜 (transformed) |
| 김철수,이영희,박민준이 나오면 성공 | hardcode |
| 에러 안 나면 성공 | luck |

| 자료 | 값 |
|---|---|
| 월요일 이름 | ` 김철수 ,이영희, 박민준 ` |
| 화요일 이름 | ` 최수진 ,오지훈, 한서연 ` |
| 한글 이름 (반례 · invisible) | ` 최수진 , 오지훈 , 한서연 ` |

### 5. 문자열 다루기. split, strip, replace

- 핵심: 데이터를 나누고 정리하는 과정에서 공백이 문제를 일으킨다
- HTTP: 유형 ok 1.2초 → 초안 ok 1.7초 → 초안 ok 1.8초 → 초안 ok 1.5초 → 초안 ok 2.2초
- 유형: `split-transform-join` (항목마다 앞뒤 공백 같은 것을 정리하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '세 자료를 보고 같은 기준으로 정리해 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 실패
  - `brief` '세 자료에서 알아낼 것을 정해 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 3차 검증 통과
- 초안 4차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**자료 나누기** · `split-transform-join`

> 세 자료에서 깔끔한 이름을 골라 주세요.  
> 공백이 섞인 자료를 정리해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 이름마다 깔끔해지면 성공 | 진짜 (transformed) |
| 사과,배,복숭아가 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 자료 | ` 사과,배 , 복숭아 ` |
| 화요일 자료 | `사과 , 배,복숭아` |
| 공백 반대 (반례 · count) | ` 사과,배 , 복숭아 , 사과,사과 ` |

### 6. 정렬. sorted와 sort의 차이

- 핵심: 순서가 뒤섞인 목록을 기준에 맞게 늘어놓는다
- HTTP: 유형 ok 1.2초 → 초안 ok 2.2초 → 초안 ok 2.2초
- 유형: `split-sort-join` (항목을 순서대로 늘어놓기) · 고른 쪽: llm
- 초안 1차 검증 통과
- 초안 2차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**간식 순서 맞추기** · `split-sort-join`

> 간식 목록을 순서대로 늘려 주세요.  
> 오늘 간식 시간에 맞춰야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 순서대로 늘어서면 성공 | 진짜 (sorted) |
| 빵,사과,우유가 나오면 성공 | hardcode |
| 에러 안 나면 성공 | luck |

| 자료 | 값 |
|---|---|
| 월요일 간식 | `사과,빵,우유` |
| 화요일 간식 | `우유,사과,빵` |
| 금요일 간식 (반례 · count) | `사과,빵,우유,사과,우유` |

### 7. 숫자 형변환. int()로 문자열을 숫자로

- 핵심: 문자로 된 숫자는 더하기 전에 바꿔야 한다
- HTTP: 유형 ok 1.2초 → 초안 ok 1.7초 → 초안 ok 1.6초 → 초안 ok 2.2초
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
- 자료 보정: 걸러낼 대상에 사과, 바나나, 포도 를 넣었어요

**숫자만 더하기** · `split-filter-num-sum`

> 목록에서 숫자만 골라 더해서 얼마인지 알아내 주세요.  
> 문자와 숫자가 섞여 있어서 그래요.

| 성공 조건 보기 | 표시 |
|---|---|
| 5가 나오면 성공 | hardcode |
| 숫자만 더한 값이 나오면 성공 | 진짜 (filtered_sum) |
| 에러 안 나면 성공 | luck |

| 자료 | 값 |
|---|---|
| 첫째 자료 | `3,사과,2,바나나` |
| 둘째 자료 | `1,4,포도,2` |
| 셋째 자료 (반례 · empty) | `사과,바나나,포도,사과` |

걸러낼 대상: 사과, 바나나, 포도

### 8. 예외 처리. try-except

- 핵심: 숫자가 아닌 값이 섞여 있으면 계산이 멈춘다
- HTTP: 유형 ok 1.3초 → 초안 ok 2.2초 → 초안 ok 1.7초 → 초안 ok 2.3초 → 유형 ok 1.7초 → 초안 ok 1.9초 → 초안 ok 1.7초 → 초안 ok 1.6초 → 초안 ok 2.3초 → 유형 ok 1.2초 → 초안 ok 2.1초 → 초안 ok 1.6초 → 초안 ok 1.9초
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
- 초안 5차 검증 실패
  - `brief` '섞인 목록에서 더할 수 있는 값만 골라 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 6차 검증 실패
  - `brief` '목록에서 몇 가지를 골라 더해 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 7차 검증 실패
  - `brief` '숫자가 몇 개인지 더해 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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
  - `brief` '세 자료에서 숫자만 찾아 더해주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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

**숫자만찾기** · `split-filter-num-sum`

> 세 자료에서 얼마를 더할지 알아내주세요.  
> 숫자가 아닌 값이 섞이면 계산이 멈춰요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 숫자만 더한 값이 나오면 성공 | 진짜 (filtered_sum) |
| 12가 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 첫째자료 | `3,사과,7,배,2` |
| 둘째자료 | `5,포도,1,수박,4` |
| 셋째자료 (반례 · empty) | `사과,배,포도,수박,사과` |

걸러낼 대상: 사과, 배, 포도, 수박

### 9. 집합 set. 중복 없는 모음

- 핵심: 중복을 없애면 개수가 달라진다
- HTTP: 유형 ok 1.1초 → 초안 ok 1.7초 → 초안 ok 2.0초
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

> 같은 항목이 겹쳐 나온 목록에서 몇 가지인지 알아보세요.  
> 중복을 없애면 개수가 달라져요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 전체 자료 수가 나오면 성공 | 진짜 (total) |
| 겹치는 건 한 번만 센 수가 나오면 성공 | 진짜 (unique) |
| 3이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 자료 | `사과,배,사과,포도` |
| 화요일 자료 | `배,사과,포도,배` |
| 다른 날 자료 (반례 · count) | `사과,배` |

### 10. 파일 입출력. open, read

- 핵심: 파일에서 읽은 줄마다 쓸 것만 골라낸다
- HTTP: 유형 ok 1.7초 → 초안 ok 1.9초 → 초안 ok 1.7초 → 초안 ok 2.1초
- 유형: `split-filter-join` (조건에 맞는 항목만 골라 다시 이어 붙이기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '파일에서 읽은 줄을 정리해 보세요.' — 구할 값이 없음. '만 남' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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

**파일 줄 고르기** · `split-filter-join`

> 파일에서 읽은 줄에서 몇 가지를 골라야 해요.  
> 읽은 내용을 다시 이어 붙여야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 조건에 맞는 줄만 남으면 성공 | 진짜 (filtered) |
| 사과,포도가 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 기록 | `사과,배,포도` |
| 화요일 기록 | `사과,감,포도` |
| 금요일 줄 (반례 · count) | `사과,배,포도,사과,사과` |

걸러낼 대상: 사과, 포도

