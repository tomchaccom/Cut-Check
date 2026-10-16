# 미션 생성 평가

실행 2026-10-17 01:26 · 모델 `openai/gpt-5.4-mini` · 수업 주제 10개

`uv run --with-requirements requirements.txt python test/eval_generate.py` 로 다시 만든다. 원본 응답은 `docs/eval-raw.json`.

## 요약

| 항목 | 값 |
|---|---|
| 미션 생성 성공 | 10 / 10 |
| 1차 응답이 검사를 바로 통과 | 1 / 10 |
| 재요청 | 8 건 |
| 기본 틀로 바뀐 칸이 없는 미션 | 8 / 10 |
| 기본 틀로 바뀐 칸이 있는 미션 | 2 건 |
| 자료를 보정한 미션 | 2 건 |
| 유형을 LLM 이 고름 | 10 / 10 |
| 유형이 기대와 같음 | 8 / 10 |
| 나온 유형 가짓수 | 7 |
| 검수 1차 통과 | 7 / 10 |
| 검수 통과 (재생성 포함) | 10 / 10 |
| 교사 검수로 넘어감 | 0 / 10 |
| 미션 하나 걸린 시간 | 평균 8.7초 · 최대 17.5초 |
| HTTP `유형 · json_schema → ok` | 14회 · 평균 1.1초 |
| HTTP `초안 · json_schema → ok` | 43회 · 평균 1.7초 |

### 검증에 걸린 칸 (시도 기준)

| 칸 | 횟수 |
|---|---|
| `brief` | 35 |
| `situation` | 20 |
| `title` | 18 |
| `itemName` | 18 |
| `counter` | 18 |
| `data` | 18 |
| `filterTarget` | 6 |
| `filterDesc` | 6 |

## 주제별

| # | 수업 | 기대 유형 | 나온 유형 | 시간 | LLM 호출 | 1차 검증 | 기본 틀 칸 | 결과 |
|---|---|---|---|---|---|---|---|---|
| 1 | 파이썬 리스트와 반복문. for문으로 하나씩 | `split-unique-count` | `split-unique-count` | 10.5초 | 7 | brief | - | 생성 |
| 2 | 조건문 if-else. 조건이 참이면 A,  | `split-filter-count` | `split-filter-count` | 6.7초 | 4 | brief | - | 생성 |
| 3 | 딕셔너리. 키와 값 쌍으로 저장 | `split-group` | `split-group` | 4.4초 | 3 | 통과 | - | 생성 |
| 4 | 함수 정의와 호출. def로 만들고 여러 번 | `split-transform-join` | `split-transform-join` | 7.6초 | 5 | brief | brief | 생성 |
| 5 | 문자열 다루기. split, strip, r | `split-transform-join` | `split-transform-join` | 6.2초 | 4 | brief | - | 생성 |
| 6 | 정렬. sorted와 sort의 차이 | `split-sort-join` | `split-sort-join` | 7.1초 | 5 | situation, brief | - | 생성 |
| 7 | 숫자 형변환. int()로 문자열을 숫자로 | `split-num-sum` | `split-filter-num-sum` | 14.5초 | 9 | brief | brief | 생성 |
| 8 | 예외 처리. try-except | `split-filter-num-sum` | `split-filter-num-sum` | 6.3초 | 4 | brief | - | 생성 |
| 9 | 집합 set. 중복 없는 모음 | `split-unique-count` | `split-unique-count` | 17.5초 | 12 | brief | - | 생성 |
| 10 | 파일 입출력. open, read | `split-filter-count` | `split-filter-join` | 6.0초 | 4 | brief, situation | - | 생성 |

## 상세

### 1. 파이썬 리스트와 반복문. for문으로 하나씩 꺼내서 처리하는 법

- 핵심: 같은 값이 여러 번 있을 때 전체와 서로 다른 개수가 다르다
- HTTP: 유형 ok 1.1초 → 초안 ok 1.7초 → 초안 ok 1.6초 → 초안 ok 1.7초 → 유형 ok 1.1초 → 초안 ok 1.5초 → 초안 ok 1.8초
- 유형: `split-unique-count` (같은 항목이 겹쳐 나오는 목록에서 개수 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '목록에서 itemName의 전체와 서로 다른 개수를 알아내세요.': 답 암시 '서로 다른' — 업무 요청은 모호해야 분해가 학생 몫으로 남는다
  - `brief` '목록에서 itemName의 전체와 서로 다른 개수를 알아내세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
  - `brief` '목록에서 itemName의 전체와 서로 다른 개수를 알아내세요.' — 무엇의 값인지 없음. 항목 이름 '재료' 을 넣는다
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

**재료 종류 세기** · `split-unique-count`

> 재료 목록에서 몇 가지인지 알아내세요.  
> 같은 재료가 여러 번 나오는지 확인해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 겹치는 건 한 번만 센 수가 나오면 성공 | 진짜 (unique) |
| 전체 재료 수가 나오면 성공 | 진짜 (total) |
| 3이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 아침 재료 | `계란,우유,계란,식빵` |
| 간식 재료 | `우유,식빵,딸기,우유` |
| 빵 재료 (반례 · count) | `계란,우유,계란,식빵,딸기` |

### 2. 조건문 if-else. 조건이 참이면 A, 거짓이면 B

- 핵심: 어떤 기준으로 걸러내는지를 학생이 직접 정하게
- HTTP: 유형 ok 1.0초 → 초안 ok 2.0초 → 초안 ok 1.9초 → 초안 ok 1.8초
- 유형: `split-filter-count` (조건에 맞는 항목만 골라 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '오늘 급식 재료 목록에서 알레르기 관련 재료를 몇 가지 골라 세어 주세요.': 41자 — 40자 안으로
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

**급식 알레르기 찾기** · `split-filter-count`

> 급식 재료 목록에서 알레르기 재료를 몇 가지 골라 세어 주세요.  
> 급식에 들어간 재료를 알아봐야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 조건에 맞는 재료 수가 나오면 성공 | 진짜 (filtered_count) |
| 에러 안 나면 성공 | luck |
| 3이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 재료 | `우유,달걀,양배추,돼지고기,사과` |
| 화요일 재료 | `우유,달걀,양배추,돼지고기,사과` |
| 금요일 재료 (반례 · empty) | `양배추,사과,사과,바나나` |

걸러낼 대상: 우유, 달걀, 돼지고기

### 3. 딕셔너리. 키와 값 쌍으로 저장

- 핵심: 같은 키가 여러 번 나오면 묶어서 센다
- HTTP: 유형 ok 1.2초 → 초안 ok 1.7초 → 초안 ok 1.6초
- 유형: `split-group` (같은 항목끼리 묶어 몇 번씩 나왔는지 세기) · 고른 쪽: llm
- 초안 1차 검증 통과
- 초안 2차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**간식횟수정리** · `split-group`

> 간식 이름별 횟수를 정리해 주세요.  
> 같은 이름이 몇 번 나왔는지 알아야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 간식마다 나온 횟수가 보이면 성공 | 진짜 (group) |
| 에러 안 나면 성공 | luck |
| 우유가 2번 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 간식 | `우유,빵,우유` |
| 수요일 간식 | `빵,우유,과자` |
| 겹친 간식 (반례 · count) | `우유,빵,우유,우유,빵` |

### 4. 함수 정의와 호출. def로 만들고 여러 번 호출

- 핵심: 같은 작업을 항목마다 반복할 때 함수로 묶는다
- HTTP: 유형 ok 1.3초 → 초안 ok 1.5초 → 초안 ok 1.7초 → 초안 ok 1.3초 → 초안 ok 1.7초
- 유형: `split-transform-join` (항목마다 앞뒤 공백 같은 것을 정리하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '항목마다 앞뒤 공백을 정리해 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
  - `brief` '항목마다 앞뒤 공백을 정리해 주세요.' — 무엇의 값인지 없음. 항목 이름 '이름' 을 넣는다
- 초안 2차 검증 실패
  - `brief` '각 항목의 이름을 알아내 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 3차 검증 실패
  - `brief` '각 항목의 이름을 알아내 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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
> 같은 기준으로 정리해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 이름마다 깔끔해지면 성공 | 진짜 (transformed) |
| 에러 안 나면 성공 | luck |
| 사과,배,포도가 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 월요일 이름 | ` 사과,배 , 포도` |
| 화요일 이름 | `  사과 ,배,포도  ` |
| 띄어쓰기 다른 이름 (반례 · count) | ` 사과,배 , 포도, 사과,  사과 ` |

### 5. 문자열 다루기. split, strip, replace

- 핵심: 데이터를 나누고 정리하는 과정에서 공백이 문제를 일으킨다
- HTTP: 유형 ok 1.1초 → 초안 ok 1.7초 → 초안 ok 1.8초 → 초안 ok 1.6초
- 유형: `split-transform-join` (항목마다 앞뒤 공백 같은 것을 정리하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '각 자료의 itemName을 보고 항목을 정리해 주세요.' — 구할 값이 없음. '깔끔' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 2차 검증 통과
- 초안 3차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**공백 정리하기** · `split-transform-join`

> 각 자료의 항목을 보고 깔끔한 항목을 알려 주세요.  
> 공백이 섞인 항목을 정리해야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 항목마다 깔끔해지면 성공 | 진짜 (transformed) |
| 사과,배,복숭아,포도가 나오면 성공 | hardcode |
| 에러 안 나면 성공 | luck |

| 자료 | 값 |
|---|---|
| 과일 상자 | `사과,배 , 복숭아,포도 ` |
| 과일 상자 | `사과 ,배,복숭아 , 포도` |
| 빈칸 항목 (반례 · count) | `사과,배 , 복숭아,포도 ,사과,사과 ` |

### 6. 정렬. sorted와 sort의 차이

- 핵심: 순서가 뒤섞인 목록을 기준에 맞게 늘어놓는다
- HTTP: 유형 ok 1.1초 → 초안 ok 1.5초 → 초안 ok 1.5초 → 초안 ok 1.3초 → 초안 ok 1.6초
- 유형: `split-sort-join` (항목을 순서대로 늘어놓기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `situation` '비슷한 자료를 같은 기준으로 살펴보셔야 합니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
  - `brief` '세 자료를 보고 맞는 기준의 줄세우기를 찾으세요.' — 구할 값이 없음. '순서' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
  - `brief` '세 자료를 보고 맞는 기준의 줄세우기를 찾으세요.' — 무엇의 값인지 없음. 항목 이름 '값' 을 넣는다
- 초안 2차 검증 실패
  - `brief` '세 자료의 순서를 찾으세요.' — 무엇의 값인지 없음. 항목 이름 '값' 을 넣는다
- 초안 3차 검증 통과
- 초안 4차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**순서 찾기** · `split-sort-join`

> 세 자료의 값 순서를 찾으세요.  
> 비슷한 자료를 같은 기준으로 살펴보셔야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 딸기,바나나,사과,포도가 나오면 성공 | hardcode |
| 순서대로 늘어서면 성공 | 진짜 (sorted) |

| 자료 | 값 |
|---|---|
| 월요일 목록 | `사과,바나나,딸기,포도` |
| 금요일 목록 | `포도,사과,딸기,바나나` |
| 혼합 자료 (반례 · count) | `사과,바나나,딸기,포도,사과,포도` |

### 7. 숫자 형변환. int()로 문자열을 숫자로

- 핵심: 문자로 된 숫자는 더하기 전에 바꿔야 한다
- HTTP: 유형 ok 1.1초 → 초안 ok 1.5초 → 초안 ok 1.6초 → 초안 ok 1.8초 → 유형 ok 1.2초 → 초안 ok 1.5초 → 초안 ok 1.6초 → 초안 ok 2.1초 → 초안 ok 1.9초
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
  - `brief` '목록에서 숫자만 몇 가지 골라 더해 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 6차 검증 실패
  - `brief` '목록에서 숫자만 몇 가지 얼만지 알아내 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
- 초안 7차 검증 실패
  - `brief` '숫자와 글자가 함께 있는 목록에서 숫자 몇 가지의 합이 얼마인지 알아내 주세요.': 44자 — 40자 안으로
- 초안 8차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required
  - `filterTarget` Field required
  - `filterDesc` Field required
- 기본 틀로 바뀐 칸: brief
- 자료 보정: 걸러낼 대상에서 자료에 없는 말과 숫자를 뺐어요
- 자료 보정: 걸러낼 대상에 사과, 배, 노트 를 넣었어요

**숫자합구하기** · `split-filter-num-sum`

> 목록 중 숫자를 모두 더하면 얼마인지 알려 주세요.  
> 숫자와 글자가 함께 있어요.

| 성공 조건 보기 | 표시 |
|---|---|
| 에러 안 나면 성공 | luck |
| 숫자만 더한 값이 나오면 성공 | 진짜 (filtered_sum) |
| 8이 나오면 성공 | hardcode |

| 자료 | 값 |
|---|---|
| 첫째 목록 | `3,사과,5,배` |
| 둘째 목록 | `2,7,노트,1` |
| 글자만목록 (반례 · empty) | `사과,배,노트,사과` |

걸러낼 대상: 사과, 배, 노트

### 8. 예외 처리. try-except

- 핵심: 숫자가 아닌 값이 섞여 있으면 계산이 멈춘다
- HTTP: 유형 ok 1.3초 → 초안 ok 1.4초 → 초안 ok 1.5초 → 초안 ok 2.0초
- 유형: `split-filter-num-sum` (숫자와 글자가 섞인 목록에서 숫자만 골라 더하기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '숫자와 글자가 섞인 목록에서 숫자만 골라 더해 주세요.' — 구할 값이 없음. '얼마' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
  - `brief` '숫자와 글자가 섞인 목록에서 숫자만 골라 더해 주세요.' — 무엇의 값인지 없음. 항목 이름 '자료' 을 넣는다
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
- 자료 보정: 걸러낼 대상에 사과, 배 를 넣었어요

**숫자만 더하기** · `split-filter-num-sum`

> 자료에서 숫자만 골라 얼마인지 알아내 주세요.  
> 숫자가 아닌 값이 섞이면 계산이 멈춰요.

| 성공 조건 보기 | 표시 |
|---|---|
| 숫자만 더한 값이 나오면 성공 | 진짜 (filtered_sum) |
| 10이 나오면 성공 | hardcode |
| 에러 안 나면 성공 | luck |

| 자료 | 값 |
|---|---|
| 월요일 자료 | `3,사과,5,2` |
| 수요일 자료 | `7,배,1,4` |
| 금요일 자료 (반례 · empty) | `사과,배,사과` |

걸러낼 대상: 사과, 배

### 9. 집합 set. 중복 없는 모음

- 핵심: 중복을 없애면 개수가 달라진다
- HTTP: 유형 ok 0.9초 → 초안 ok 1.6초 → 초안 ok 1.4초 → 초안 ok 1.6초 → 유형 ok 1.1초 → 초안 ok 1.6초 → 초안 ok 1.7초 → 초안 ok 1.8초 → 유형 ok 0.9초 → 초안 ok 1.6초 → 초안 ok 1.4초 → 초안 ok 1.8초
- 유형: `split-unique-count` (같은 항목이 겹쳐 나오는 목록에서 개수 세기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '자료 세 개로 항목 개수를 알아내세요.' — 구할 값이 없음. '몇' 처럼 무엇을 알아내야 하는지 생활 말로 쓴다 (방법은 쓰지 않는다)
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
  - `brief` '같은 항목이 몇 가지인지 알려 주세요.' — 무엇의 값인지 없음. 항목 이름 '자료' 을 넣는다
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
  - `brief` '같은 항목이 몇 가지인지 알려주세요. 이름 그대로 세어야 합니다.': 두 문장 이상 — 한 칸에 한 문장만 쓴다
- 초안 10차 검증 통과
- 초안 11차 검증 실패
  - `title` Field required
  - `brief` Field required
  - `situation` Field required
  - `itemName` Field required
  - `counter` Field required
  - `data` Field required

**겹친 목록 세기** · `split-unique-count`

> 같은 항목이 몇 가지인지 알려주세요.  
> 서로 같은 것이 몇 번 나오는지 알아봐요.

| 성공 조건 보기 | 표시 |
|---|---|
| 겹치는 건 한 번만 센 수가 나오면 성공 | 진짜 (unique) |
| 3이 나오면 성공 | hardcode |
| 전체 항목 수가 나오면 성공 | 진짜 (total) |
| 에러 안 나면 성공 | luck |

| 자료 | 값 |
|---|---|
| 첫 목록 | `사과,배,사과,포도` |
| 둘째 목록 | `배,사과,포도,배` |
| 수요일 항목 (반례 · count) | `사과,배` |

### 10. 파일 입출력. open, read

- 핵심: 파일에서 읽은 줄마다 쓸 것만 골라낸다
- HTTP: 유형 ok 1.2초 → 초안 ok 1.6초 → 초안 ok 1.5초 → 초안 ok 1.7초
- 유형: `split-filter-join` (조건에 맞는 항목만 골라 다시 이어 붙이기) · 고른 쪽: llm
- 초안 1차 검증 실패
  - `brief` '파일에서 읽은 줄마다 쓸 것만 골라내야 합니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
  - `situation` '조건에 맞는 것만 다시 이어 붙여야 합니다.': 존댓말(~요)로 끝나지 않음 — 화면이 학생에게 말할 때는 ~해요
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

**줄 고르기** · `split-filter-join`

> 파일에서 읽은 줄마다 쓸 것만 골라내요.  
> 조건에 맞는 것만 다시 이어 붙여야 해요.

| 성공 조건 보기 | 표시 |
|---|---|
| 조건에 맞는 줄만 남으면 성공 | 진짜 (filtered) |
| 수요일이 나오면 성공 | hardcode |
| 에러 안 나면 성공 | luck |

| 자료 | 값 |
|---|---|
| 아침 메모 | `사과,수요일,우유,버스` |
| 점심 메모 | `연필,목요일,지우개,책` |
| 수요일 줄 (반례 · empty) | `사과,우유,버스,연필` |

걸러낼 대상: 수요일, 목요일

