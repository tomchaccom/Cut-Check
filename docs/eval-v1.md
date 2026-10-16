# 미션 생성 평가

실행 2026-10-16 01:53 · 모델 `pickle-general` · 수업 주제 10개

`uv run --with-requirements requirements.txt python test/eval_generate.py` 로 다시 만든다. 원본 응답은 `docs/eval-raw.json`.

## 요약

| 항목 | 값 |
|---|---|
| 미션 생성 성공 | 8 / 10 |
| 1차 응답이 검사를 바로 통과 | 0 / 10 |
| 재요청 | 8 건 |
| 기본 틀로 바뀐 칸이 있는 미션 | 8 건 |
| 유형이 기대와 같음 | 1 / 8 |
| 미션 하나 걸린 시간 | 평균 18.8초 · 최대 25.1초 |
| HTTP `json_schema → ok` | 16회 · 평균 8.6초 |
| HTTP `json_schema → TimeoutError` | 2회 · 평균 25.1초 |

### 검증에 걸린 칸 (시도 기준)

| 칸 | 횟수 |
|---|---|
| `sentences` | 13 |
| `options` | 13 |
| `counter` | 4 |
| `data` | 3 |
| `brief` | 2 |
| `situation` | 1 |

## 주제별

| # | 수업 | 기대 유형 | 나온 유형 | 시간 | LLM 호출 | 1차 검증 | 기본 틀 칸 | 결과 |
|---|---|---|---|---|---|---|---|---|
| 1 | 파이썬 리스트와 반복문. for문으로 하나씩 | `split-unique-count` | `split-sort-join` | 18.7초 | 2 | data | situation, options, sentences | 생성 |
| 2 | 조건문 if-else. 조건이 참이면 A,  | `split-filter-count` | `-` | 25.1초 | 0 | - | - | 실패 |
| 3 | 딕셔너리. 키와 값 쌍으로 저장 | `split-group` | `split-unique-count` | 17.9초 | 2 | data | options, sentences | 생성 |
| 4 | 함수 정의와 호출. def로 만들고 여러 번 | `split-transform-join` | `split-unique-count` | 16.6초 | 2 | counter, options, sentences | counter, options, sentences | 생성 |
| 5 | 문자열 다루기. split, strip, r | `split-transform-join` | `split-sort-join` | 13.3초 | 2 | options, sentences | options, sentences | 생성 |
| 6 | 정렬. sorted와 sort의 차이 | `split-sort-join` | `split-sort-join` | 17.6초 | 2 | data | options, sentences | 생성 |
| 7 | 숫자 형변환. int()로 문자열을 숫자로 | `split-num-sum` | `split-unique-count` | 13.1초 | 2 | counter, options, sentences | counter, options, sentences | 생성 |
| 8 | 예외 처리. try-except | `split-filter-num-sum` | `-` | 25.1초 | 0 | - | - | 실패 |
| 9 | 집합 set. 중복 없는 모음 | `split-unique-count` | `split-sort-join` | 16.5초 | 2 | options, sentences | options, sentences | 생성 |
| 10 | 파일 입출력. open, read | `split-filter-count` | `split-sort-join` | 24.5초 | 2 | brief, options, sentences | brief, options, sentences | 생성 |

## 상세

### 1. 파이썬 리스트와 반복문. for문으로 하나씩 꺼내서 처리하는 법

- 핵심: 같은 값이 여러 번 있을 때 전체와 서로 다른 개수가 다르다
- HTTP: json_schema ok 10.2초 → json_schema ok 8.5초
- 1차 검증 실패
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
- 2차 검증 실패
  - `situation` '찾아보고, 그 숫자가 리스트 전체에 몇 번 나타났는지': 반말 — 학생 화면은 존댓말로 쓴다
  - `sentences` '반복문을 사용하여 각 숫자의 출현 빈도를 세어': 반말 — 학생 화면은 존댓말로 쓴다
  - `sentences` 빈칸이 ['sep', 'sep', 'sep'] — 이 유형은 ['sep', 'dir', 'joinSep'] 를 한 번씩
  - `sentences` '반복문을 사용하여 각 숫자의 출현 빈도를 세어' 의 빈칸이 {sep} 하나가 아님
  - `sentences` '가장 빈도가 높은 숫자를 선택하는 기준을 세웠' 의 빈칸이 {sep} 하나가 아님
  - `sentences` '이 기준이 항상 타당한지 마지막 데이터 세트로' 의 빈칸이 {sep} 하나가 아님
  - `options` 진짜 성공 조건이 없음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` hardcode 함정에 첫 자료의 실제 결과(2, 2, 4, 2, 6, 3, 3,)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(2, 2, 4, 2, 6, 3, 3,)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(2, 2, 4, 2, 6, 3, 3,)가 없음
- 기본 틀로 바뀐 칸: situation, options, sentences

**리스트 데이터 비교 분석** · `split-sort-join`

> 세 개의 숫자 리스트가 주어집니다. 각 리스트에서 가장 많이 나온 숫자를  

| 성공 조건 보기 | 표시 |
|---|---|
| 2가 나오면 성공 | hardcode |
| 순서대로 늘어서면 성공 | 진짜 (sorted) |
| 에러 안 나면 성공 | luck |

방법 문장
- 목록을 [쉼표 / 공백 / 줄바꿈] 기준으로 나눈다.
- [가나다순으로 / 거꾸로] 늘어놓는다.
- [쉼표 / 공백] 기준으로 잇는다.

| 자료 | 값 |
|---|---|
| 세트 1 | `3 3 5 3 7,2 2 4 2 6,9 1 9 9 8` |
| 세트 2 | `4 4 2 2 2,5 5 1 5 5,3 3 3 7 3` |
| 세트 3 (반례 · count) | `이 세트로도 같은 기준으로 판단할 수 있는지 확인해 보세요. 기준이 깨진` |

### 2. 조건문 if-else. 조건이 참이면 A, 거짓이면 B

- 핵심: 어떤 기준으로 걸러내는지를 학생이 직접 정하게
- HTTP: json_schema TimeoutError 25.1초
- **실패**: TimeoutError: The read operation timed out

### 3. 딕셔너리. 키와 값 쌍으로 저장

- 핵심: 같은 키가 여러 번 나오면 묶어서 센다
- HTTP: json_schema ok 9.8초 → json_schema ok 8.1초
- 1차 검증 실패
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
- 2차 검증 실패
  - `options` luck 함정이 없음
  - `options` 진짜 성공 조건이 없음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` hardcode 함정에 첫 자료의 실제 결과(3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(3)가 없음
  - `sentences` 빈칸이 ['output', 'output', 'output'] — 이 유형은 ['sep', 'dedup', 'output'] 를 한 번씩
  - `sentences` '데이터를 정리하겠습니다.' 의 빈칸이 {output} 하나가 아님
  - `sentences` '세 가지 데이터는 다음과 같습니다.' 의 빈칸이 {output} 하나가 아님
- 기본 틀로 바뀐 칸: options, sentences

**데이터 정리 기준 정하기** · `split-unique-count`

> 아래 세 가지 데이터에 대해 공통된 규칙을 정해 보세요. 규칙이 모든 수  
> 데이터를 정리하려고 합니다. 다음 세 가지 데이터를 정

| 성공 조건 보기 | 표시 |
|---|---|
| 3이 나오면 성공 | hardcode |
| 전체 조건 수가 나오면 성공 | 진짜 (total) |
| 겹치는 건 한 번만 센 수가 나오면 성공 | 진짜 (unique) |
| 에러 안 나면 성공 | luck |

방법 문장
- 목록을 [쉼표 / 공백 / 줄바꿈] 기준으로 나눈다.
- 같은 조건은 [각각 남긴다 / 하나만 남긴다].
- [남은 항목의 개수 / 항상 숫자 3]을 보여준다.

| 자료 | 값 |
|---|---|
| 데이터 1 | `이름 홍길동 나이 15,이름 홍길동 나이 15,이름 이순신 나이 45` |
| 데이터 2 | `과일 사과 가격 500,과일 사과 가격 500,과일 바나나 가격 300` |
| 데이터 3 (반례 · count) | `이 데이터는 위에서 정한 조건에 맞지 않습니다. 같은 것을 묶는 기준을` |

### 4. 함수 정의와 호출. def로 만들고 여러 번 호출

- 핵심: 같은 작업을 항목마다 반복할 때 함수로 묶는다
- HTTP: json_schema ok 8.5초 → json_schema ok 8.1초
- 1차 검증 실패
  - `counter` axis=invisible 인데 앞뒤 공백 항목이 없음
  - `options` luck 함정이 없음
  - `options` 진짜 성공 조건이 없음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` hardcode 함정에 첫 자료의 실제 결과(3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(3)가 없음
  - `sentences` 빈칸이 ['sep', 'sep', 'sep'] — 이 유형은 ['sep', 'dedup', 'output'] 를 한 번씩
  - `sentences` '규칙을 정해 보세요' 의 빈칸이 {sep} 하나가 아님
  - `sentences` '함수로 묶어 보세요' 의 빈칸이 {sep} 하나가 아님
  - `sentences` '결과를 확인해 보세요' 의 빈칸이 {sep} 하나가 아님
- 2차 검증 실패
  - `counter` axis=invisible 인데 앞뒤 공백 항목이 없음
  - `options` luck 함정이 없음
  - `options` 진짜 성공 조건이 없음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` hardcode 함정에 첫 자료의 실제 결과(3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(3)가 없음
  - `sentences` 빈칸이 ['dedup', 'dedup', 'output'] — 이 유형은 ['sep', 'dedup', 'output'] 를 한 번씩
  - `sentences` '규칙을 {a} 정해 보세요' 의 빈칸이 {dedup} 하나가 아님
  - `sentences` '함수로 {a} 묶어 보세요' 의 빈칸이 {dedup} 하나가 아님
  - `sentences` '{a} 결과를 확인해 보세요' 의 빈칸이 {output} 하나가 아님
- 기본 틀로 바뀐 칸: counter, options, sentences

**데이터 처리 함수 만들기** · `split-unique-count`

> 세 가지의 숫자 데이터를 처리하고, 가장 적합한 규칙을 찾아 함수로 구현  
> 숫자를 읽고, 정해진 규칙에 따라 값을 계산한 뒤 {a

| 성공 조건 보기 | 표시 |
|---|---|
| 3이 나오면 성공 | hardcode |
| 전체 값 수가 나오면 성공 | 진짜 (total) |
| 겹치는 건 한 번만 센 수가 나오면 성공 | 진짜 (unique) |
| 에러 안 나면 성공 | luck |

방법 문장
- 목록을 [쉼표 / 공백 / 줄바꿈] 기준으로 나눈다.
- 같은 값은 [각각 남긴다 / 하나만 남긴다].
- [남은 항목의 개수 / 항상 숫자 3]을 보여준다.

| 자료 | 값 |
|---|---|
| 자료 1 | `3,7,5` |
| 자료 2 | `2,4,6` |
| 다른 날 자료 (반례 · count) | `3,7,5,3,2` |

### 5. 문자열 다루기. split, strip, replace

- 핵심: 데이터를 나누고 정리하는 과정에서 공백이 문제를 일으킨다
- HTTP: json_schema ok 6.7초 → json_schema ok 6.5초
- 1차 검증 실패
  - `options` 'split(' ')를 사용하여 정리': 코드 조각 — 베껴 쓸 답을 준다
  - `options` 'strip()를 사용하여 정리': 덧붙임 '(' — 부연 설명 없이 한 번에 읽히게 쓴다
  - `options` 'split()를 사용하여 정리': 코드 조각 — 베껴 쓸 답을 준다
  - `options` 'replace(' ', '')를 사용하여 정리': 덧붙임 '(' — 부연 설명 없이 한 번에 읽히게 쓴다
  - `options` hardcode 함정이 없음
  - `options` 진짜 성공 조건이 없음
  - `sentences` 빈칸이 ['sep', 'sep', 'sep'] — 이 유형은 ['sep', 'dir', 'joinSep'] 를 한 번씩
  - `sentences` '파일 {i}의 데이터에서' 의 빈칸이 {sep} 하나가 아님
  - `sentences` '숫자만 남겼습니다.' 의 빈칸이 {sep} 하나가 아님
  - `sentences` '정리된 결과' 의 빈칸이 {sep} 하나가 아님
- 2차 검증 실패
  - `options` hardcode 함정이 없음
  - `options` 진짜 성공 조건이 없음
  - `sentences` '파일 {i}의 데이터 {sep} 기준' 의 빈칸이 {sep} 하나가 아님
- 기본 틀로 바뀐 칸: options, sentences

**학생 성적 정리** · `split-sort-join`

> 성적표 데이터를 정리합니다.  
> 선생님이 학생들의 점수를 정리할 준비를 하고 있습니다.

| 성공 조건 보기 | 표시 |
|---|---|
| 100이 나오면 성공 | hardcode |
| 순서대로 늘어서면 성공 | 진짜 (sorted) |
| 에러 안 나면 성공 | luck |

방법 문장
- 목록을 [쉼표 / 공백 / 줄바꿈] 기준으로 나눈다.
- [가나다순으로 / 거꾸로] 늘어놓는다.
- [쉼표 / 공백] 기준으로 잇는다.

| 자료 | 값 |
|---|---|
| 파일 1 | `100,95,80` |
| 파일 2 | ` 90 , 85, 70 ` |
| 파일 3 (반례 · sep) | ` 100 90 80 ` |

### 6. 정렬. sorted와 sort의 차이

- 핵심: 순서가 뒤섞인 목록을 기준에 맞게 늘어놓는다
- HTTP: json_schema ok 8.9초 → json_schema ok 8.7초
- 1차 검증 실패
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
  - `data` Value error, 항목 안에 쉼표 — 자료는 쉼표로 이어 붙인다
- 2차 검증 실패
  - `options` hardcode 함정이 없음
  - `options` 진짜 성공 조건이 없음
  - `sentences` 빈칸이 ['sep', 'sep', 'sep'] — 이 유형은 ['sep', 'dir', 'joinSep'] 를 한 번씩
  - `sentences` 'sort는 {name}를 기준으로 정렬합니다.' 의 빈칸이 {sep} 하나가 아님
  - `sentences` 'sorted는 {name}를 반환합니다.' 의 빈칸이 {sep} 하나가 아님
  - `sentences` 'sort는 {name}를 반환하지 않습니다.' 의 빈칸이 {sep} 하나가 아님
- 기본 틀로 바뀐 칸: options, sentences

**학생 신상 데이터 정리하기** · `split-sort-join`

> 데이터 세트를 기준으로 나열해보시오.  
> 학교 행사에 참여할 학생의 신상 정보를 정리해야 합니다

| 성공 조건 보기 | 표시 |
|---|---|
| 이름:가 나오면 성공 | hardcode |
| 순서대로 늘어서면 성공 | 진짜 (sorted) |
| 에러 안 나면 성공 | luck |

방법 문장
- 목록을 [쉼표 / 공백 / 줄바꿈] 기준으로 나눈다.
- [가나다순으로 / 거꾸로] 늘어놓는다.
- [쉼표 / 공백] 기준으로 잇는다.

| 자료 | 값 |
|---|---|
| 데이터 1 | `이름: 홍길동 \| 키: 160cm \| 몸무게: 50kg,이름: 김철수 \| 키: 155cm \| 몸무게: 45kg,이름: 이영희 \| 키: 165cm \| 몸무게: 55kg` |
| 데이터 2 | `이름: 홍길동 \| 키: 160cm \| 몸무게: 50kg,이름: 김철수 \| 키: 160cm \| 몸무게: 60kg,이름: 이영희 \| 키: 160cm \| 몸무게: 40kg` |
| 데이터 3 (반례 · sep) | `위 기준만으로는 순서가 정해지지 않는 경우가 발생함` |

### 7. 숫자 형변환. int()로 문자열을 숫자로

- 핵심: 문자로 된 숫자는 더하기 전에 바꿔야 한다
- HTTP: json_schema ok 6.7초 → json_schema ok 6.4초
- 1차 검증 실패
  - `counter` axis=empty 인데 결과가 비어 있지 않음
  - `counter` axis=empty 인데 결과가 비어 있지 않음
  - `options` hardcode 함정이 없음
  - `options` 진짜 성공 조건이 없음
  - `sentences` 빈칸이 ['sep', 'sep', 'sep'] — 이 유형은 ['sep', 'dedup', 'output'] 를 한 번씩
  - `sentences` '데이터의 정확성을 검증합니다.' 의 빈칸이 {sep} 하나가 아님
  - `sentences` '문자열을 숫자로 변환하는 과정을 거칩니다.' 의 빈칸이 {sep} 하나가 아님
  - `sentences` '마지막 데이터에서 오류가 발생합니다.' 의 빈칸이 {sep} 하나가 아님
- 2차 검증 실패
  - `counter` axis=empty 인데 결과가 비어 있지 않음
  - `counter` axis=empty 인데 결과가 비어 있지 않음
  - `options` hardcode 함정이 없음
  - `options` 진짜 성공 조건이 없음
  - `sentences` 빈칸이 ['dedup', 'dedup', 'output'] — 이 유형은 ['sep', 'dedup', 'output'] 를 한 번씩
  - `sentences` '데이터의 정확성을 검증합니다.' 의 빈칸이 {dedup} 하나가 아님
  - `sentences` '문자열을 숫자로 변환하는 과정을 거칩니다.' 의 빈칸이 {dedup} 하나가 아님
  - `sentences` '마지막 데이터에서 오류가 발생합니다.' 의 빈칸이 {output} 하나가 아님
- 기본 틀로 바뀐 칸: counter, options, sentences

**문자열 숫자 합산 검증** · `split-unique-count`

> 문자열로 입력된 숫자 두 개를 더한 결과가 맞는지 확인합니다.  
> 데이터에 저장된 숫자 두 개를 더한 결과를 얻어야 한다

| 성공 조건 보기 | 표시 |
|---|---|
| 3이 나오면 성공 | hardcode |
| 전체 data 수가 나오면 성공 | 진짜 (total) |
| 겹치는 건 한 번만 센 수가 나오면 성공 | 진짜 (unique) |
| 에러 안 나면 성공 | luck |

방법 문장
- 목록을 [쉼표 / 공백 / 줄바꿈] 기준으로 나눈다.
- 같은 data는 [각각 남긴다 / 하나만 남긴다].
- [남은 항목의 개수 / 항상 숫자 3]을 보여준다.

| 자료 | 값 |
|---|---|
| sample_1 | `10,20,30` |
| sample_2 | `15,5,20` |
| 다른 날 자료 (반례 · count) | `10,20,30,10,15` |

### 8. 예외 처리. try-except

- 핵심: 숫자가 아닌 값이 섞여 있으면 계산이 멈춘다
- HTTP: json_schema TimeoutError 25.1초
- **실패**: TimeoutError: The read operation timed out

### 9. 집합 set. 중복 없는 모음

- 핵심: 중복을 없애면 개수가 달라진다
- HTTP: json_schema ok 9.2초 → json_schema ok 7.3초
- 1차 검증 실패
  - `options` luck 함정이 없음
  - `options` 진짜 성공 조건이 없음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` hardcode 함정에 첫 자료의 실제 결과(1, 1, 2, 2, 3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(1, 1, 2, 2, 3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(1, 1, 2, 2, 3)가 없음
  - `sentences` 빈칸이 ['joinSep', 'joinSep', 'joinSep'] — 이 유형은 ['sep', 'dir', 'joinSep'] 를 한 번씩
  - `sentences` '학생은 주어진 자료에서 중복을 제거한 후 원' 의 빈칸이 {joinSep} 하나가 아님
  - `sentences` '자료의 고유한 원소 개수를 정확히 세어야 한다' 의 빈칸이 {joinSep} 하나가 아님
  - `sentences` '반례 자료에서는 기존의 기준이 깨져야 한다' 의 빈칸이 {joinSep} 하나가 아님
- 2차 검증 실패
  - `options` luck 함정이 없음
  - `options` 진짜 성공 조건이 없음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` hardcode 함정에 첫 자료의 실제 결과(1, 1, 2, 2, 3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(1, 1, 2, 2, 3)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(1, 1, 2, 2, 3)가 없음
  - `sentences` '학생은 주어진 자료에서 중복을 제거한 후 원{' 의 빈칸이 {sep} 하나가 아님
  - `sentences` '}수를 세어야 한다{' 의 빈칸이 {joinSep} 하나가 아님
  - `sentences` '}반례 자료에서는 기존의 기준이 깨져야 한다{' 의 빈칸이 {dir} 하나가 아님
- 기본 틀로 바뀐 칸: options, sentences

**중복 제거와 개수 세기** · `split-sort-join`

> 학생, 다음 자료 세 개를 순서대로 처리하여 각 집합의 고유한 원소의 개  
> 수학 시간, 선생님이 중복이 포함된 숫자 목록을 주셨다

| 성공 조건 보기 | 표시 |
|---|---|
| 1이 나오면 성공 | hardcode |
| 순서대로 늘어서면 성공 | 진짜 (sorted) |
| 에러 안 나면 성공 | luck |

방법 문장
- 목록을 [쉼표 / 공백 / 줄바꿈] 기준으로 나눈다.
- [가나다순으로 / 거꾸로] 늘어놓는다.
- [쉼표 / 공백] 기준으로 잇는다.

| 자료 | 값 |
|---|---|
| 1번 | `1,1,2,2,3` |
| 2번 | `4,5,4,6` |
| 3번 (반례 · count) | `처리 결과가 앞의 두 자료와 일관되지 않아 오류가 발생했다` |

### 10. 파일 입출력. open, read

- 핵심: 파일에서 읽은 줄마다 쓸 것만 골라낸다
- HTTP: json_schema ok 12.3초 → json_schema ok 12.1초
- 1차 검증 실패
  - `brief` '주어진 텍스트 파일들을 읽어서, 조건에 맞는 줄만 필터링하는 프로그램을擬': 한자·일본어 — 한국어만 쓴다
  - `options` luck 함정이 없음
  - `options` 진짜 성공 조건이 없음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` hardcode 함정에 첫 자료의 실제 결과(9788901123456, \|, 컴퓨)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(9788901123456, \|, 컴퓨)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(9788901123456, \|, 컴퓨)가 없음
  - `sentences` 빈칸이 ['sep', 'sep', 'sep'] — 이 유형은 ['sep', 'dir', 'joinSep'] 를 한 번씩
  - `sentences` '주어진 데이터 파일 {fileName}에서 {' 의 빈칸이 {sep} 하나가 아님
  - `sentences` '{field}가 {' 의 빈칸이 {sep} 하나가 아님
  - `sentences` '{value}인 줄만 남긴다.' 의 빈칸이 {sep} 하나가 아님
- 2차 검증 실패
  - `brief` '주어진 텍스트 파일들을 읽어서, 조건에 맞는 줄만 필터링하는 프로그램을拟': 한자·일본어 — 한국어만 쓴다
  - `options` luck 함정이 없음
  - `options` 진짜 성공 조건이 없음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` 함정 보기에 key 가 있음
  - `options` hardcode 함정에 첫 자료의 실제 결과(9788901123456, \|, 컴퓨)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(9788901123456, \|, 컴퓨)가 없음
  - `options` hardcode 함정에 첫 자료의 실제 결과(9788901123456, \|, 컴퓨)가 없음
  - `sentences` '주어진 데이터 파일 {fileName}에서 {' 의 빈칸이 {sep} 하나가 아님
  - `sentences` '{field}가 {' 의 빈칸이 {dir} 하나가 아님
  - `sentences` '{value}인 줄만 남긴다.' 의 빈칸이 {joinSep} 하나가 아님
- 기본 틀로 바뀐 칸: brief, options, sentences

**파일에서 중요한 정보만 추출하라** · `split-sort-join`

> 이 목록을 정리해 주세요.  
> 학교 도서관에서 도서 목록 파일이 들어왔다. 이 파일들

| 성공 조건 보기 | 표시 |
|---|---|
| 9788901123456이 나오면 성공 | hardcode |
| 순서대로 늘어서면 성공 | 진짜 (sorted) |
| 에러 안 나면 성공 | luck |

방법 문장
- 목록을 [쉼표 / 공백 / 줄바꿈] 기준으로 나눈다.
- [가나다순으로 / 거꾸로] 늘어놓는다.
- [쉼표 / 공백] 기준으로 잇는다.

| 자료 | 값 |
|---|---|
| 파일_정규.txt | `9788901123456 \| 컴퓨터 과학 기초 \| 2023-05-10 \| 25000원 \| 대출가능,9788901123457 \| 영어 회화 완성 \| 2022-11-01 \| 30000원 \| 재고없음,9788901123458 \| 수학 문제집 \| 2023-06-15 \| 18000원 \| 대출가능,9788901123459 \| 과학 탐구 \| 2021-09-20 \| 22000원 \| 대출가능` |
| 파일_혼합.txt | `A101 \| 국어 문법 \| 2023-01-10 \| 20000원 \| 대출가능,B202 \| 역사 읽기 \| 2020-05-05 \| 15000원 \| 재고없음,C303 \| 지리 탐험 \| 2023-02-28 \| 28000원 \| 대출가능,D404 \| 음악 이론 \| 2023-03-15 \| 19000원 \| 예약중` |
| 파일_오류_시나리오.txt (반례 · count) | `파일 형식이 일정하지 않거나, 상태 정보가 중복되어 있다.` |

