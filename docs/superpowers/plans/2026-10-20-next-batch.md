# 나침반 2차 · 경계값 · 문법 · 레벨 테스트 · 철학 틈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 나침반을 예/아니오 12항목 + 최근 5개 가중 평균 + 상쇄 시 선생님 선택으로 바꾸고, 경계값 반례 · 튜터 문법 제공 · 상/중/하 레벨 테스트와 기록 · 철학과 실제가 다른 곳을 고친다.

**Spec:** `docs/superpowers/specs/2026-10-20-compass-v2-design.md`, `docs/superpowers/specs/2026-10-20-next-batch-design.md`

## Global Constraints

- CLAUDE.md 전부(층 경계 · ES 모듈 없음 · 화면 문구 규칙 · 이벤트 `NEVER` · 학생 자유 입력은 robust.js).
- 학생에게 가지 않는 것: 나침반 체크 항목·점수·AI 문장, 레벨·문제지 난이도·레벨 테스트 점수.
- 마이그레이션은 새 파일로(기존 파일 수정 금지). 운영 적용은 사람 확인 뒤 — 이 계획 안에서 운영 DB 를 건드리지 않는다.
- 상수는 한 곳: `WEIGHTS = [1.0, 0.85, 0.7, 0.55, 0.4]`, `CANCEL = 0.5`, `RETEST_DAYS = 60`, `TUTOR_MANY = 5`.
- 실제 LLM 호출은 평가 스크립트에서만(`PICKLE_API_KEY` 는 환경변수, 출력·저장 금지).
- CLAUDE.md 테스트 전부 + `npx playwright test` 통과해야 커밋. `git add` 는 경로 지정, 맨 `git stash` 금지.

## Review Focus

1. 같은 저장 판정으로 누적 바늘을 두 번 계산하면 같은 각도·길이·후보(결정적).
2. 학생 RPC/화면 어디에도 체크 항목·점수·AI 문장·문제지 난이도가 없다.
3. 상쇄 → 선생님 선택 → 보낸 뒤 학생 바늘이 바뀌고, 고르기 전에는 학생 바늘이 그대로다.
4. 레벨 테스트 기록에 점수 필드가 저장되지 않는다(`events.make` 가 거절하는 이름 없음).
5. 기존 운영 `compass` 행(1차 levels 만 있는 행)이 2차 코드에서 깨지지 않는다.

---

### Task 1: 나침반 2차 규칙 — `api/_compass.py`
판정 12항목(코드 8 · AI 4, 근거 인용 대조), 튜터 질문 4방향 분류(AI, 저장용), `score(checks) -> {N,E,S,W}`, `cumulative(rows_newest_first) -> {needle_deg, length, dir, cancel: bool, candidates: [..]}`(WEIGHTS, CANCEL, 후보 규칙: 북남 상쇄 → N/S, 동서 → E/W, 넷 다 → 넷; 선생님 선택 `teacher_dir` 이 있는 미션은 그 방향 정중앙 벡터로 대체). `test/test_compass.py` 갱신(코드 항목별, AI 인용 없음 → 아니오, 가중 평균 1~5개 · 6개째 제외, 상쇄 후보 세 경우, 결정성, 1차 행 호환). JS `js/core/compass.js` 의 각도→방위 규칙은 그대로.

### Task 2: 저장 · API
새 마이그레이션: `compass` 에 `checks jsonb`, `tutor_dirs jsonb` 열. `compass_mine` 대체 RPC `compass_mine_v2()` → 학생 본인의 누적 결과(`needle_deg`, `dir`, `length`, `waiting` = 상쇄인데 선생님 미선택이고 보낸 적 없음)와 미션별 `teacher_note` 목록만. 누적 계산은 서버(`api/compass.py` 새 액션 `cumulative {classroomId, studentId}` 강사용; 학생용은 RPC 가 저장된 `student_view jsonb` 를 읽는다 — `send` 때 서버가 누적을 계산해 그 학생의 모든 행 중 최신 행 `student_view` 에 저장). `analyze` 는 checks/tutor_dirs 저장. `send` 는 상쇄 선택(`dir`) 포함. `test/test_compass_api.py` 갱신 + 로컬 PG17 임시 클러스터로 RPC 열 제한 확인.

### Task 3: 선생님 화면
학생 상세 나침반: 누적 바늘(길이 반영) + 방위 + 짧은 설명, 최근 5개 미션 12칸 체크리스트(✓/–, 근거 인용, 방향 모양 ▲◧○◇), 튜터 질문 분포, 상쇄면 후보 버튼(선택 = 그 미션 `send` 의 `dir`). 미션별 한마디 보내기 유지. 알림 새 종류 `cancel`(칭찬 타이밍) — `js/core/alerts.js` + 테스트. 1차 "고르지 않음"·"바늘 숨김" 제거.

### Task 4: 학생 화면
"내 기록" 탭에 누적 나침반(바늘 길이 반영, 방위 + `○쪽으로 가고 있어요`, 짧으면 `고르게 가고 있어요`; `waiting` 이면 `선생님이 곧 방향을 알려 주실 거예요.`). 미션 카드는 바늘 없이 선생님 한마디만. 방향 모양 ▲◧○◇ 는 `CC.compass` 에서 공용.

### Task 5: 경계값 반례
CLAUDE.md 3번 · 미션 생성 프롬프트/검사(`api/_steps.py`, `api/_generate.py`, `api/_schema.py` 중 해당) · `test/test_missionguard.py`·`test/test_steps.py`. 축 이름 `boundary`.

### Task 6: 튜터 문법 제공
`api/_tutor.py` 답 프롬프트 · `api/_tutorjudge.py` 판정 기준 · `test/test_tutorguard.py`. 평가: `test/eval_tutor.py` 로 문법 질문 묶음 실제 LLM(소량) → `docs/eval-2026-10-20-tutor-grammar.md`.

### Task 7: 레벨 테스트 상·중·하
`js/core/onboard.js` 문제지 셋(하·중·상, 지금 것 = 중; `set` 키), 학생 화면은 지정 문제지로 출제(난이도 표시 없음), `s-onboard` 에 `set` 기록, 마이그레이션 `enrollments.onboard_set`, 강사 지정 시 문제지 선택(`roster`), 학생 상세 "레벨 테스트 기록"(날짜 · 문제지 · 맞힌 수 · 문항별 ○/× · 레벨), 재테스트 알림 `retest`(60일, 학생당 한 번) — alerts.js + 테스트.

### Task 8: 철학 틈
`next-batch-design.md` 4절 1~10. 각 항목 먼저 지금도 그런지 확인 → 그런 것만 고치고 테스트. 9번 그림은 e2e 가짜 데이터로 다시 찍는다.

### Task 9: 문서 (controller)
CLAUDE.md(반례 다섯 축 · 나침반 2차 예외 문장 갱신 · 레벨 테스트 기록 규칙 · 새 테스트), docs/server.md 배포 순서(새 마이그레이션 둘).
