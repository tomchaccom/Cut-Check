# 관리자 대시보드 + 강사별 생성 한도 — 설계

날짜: 2026-10-20 · 사용자 승인: 2026-10-20 ("둘다 승인할게")

## 왜

생성 API(`/api/mission-steps` build, `/api/generate-mission`)는 로그인한 강사면 누구나 원하는 만큼 부를 수 있다.
이메일로 가입하면 누구나 강사라서, 비용을 관리자가 통제할 장치가 없다.

## 사용자가 정한 것

- **토큰 1개 = 미션 1개 만들기.** 단계별 생성의 "만들기"(build) 1번, 또는 빠른 생성 1번.
  개념 확인 · 예시 목록 · 따로 풀기(solve)는 차감하지 않는다.
  검사에 걸려 자동으로 다시 만드는 것(브라우저가 최대 2번 다시 부름)은 같은 1개에 포함한다.
- **다시 채워지지 않는다.** 관리자가 한도를 늘려 줄 때만 늘어난다.
- **기존 강사도 3개.** 관리자 본인 포함, 모두 3으로 시작한다. 쓴 횟수는 이 기능이 들어간 때부터 센다.
- **대시보드:** 강사별 쓴/남은 횟수 + 한도 바꾸기, 최근 생성 기록, 신규 가입 기본 한도 바꾸기.
- 빠른 생성 = 기존 한 번에 만드는 방식(`/api/generate-mission`).

## 하지 않는 것

- 시간 단위 자동 충전, 결제, 강사가 스스로 늘리는 것.
- 학생 · 강사가 한도 테이블을 직접 읽거나 쓰는 것 (서버만).
- 관리자 이메일을 저장소 · DB · 문서에 적는 것.

## 규칙

- **차감 시점: 성공했을 때만.** 구현은 "AI 호출 전에 1을 예약 → 실패하면 돌려줌"으로 한다.
  먼저 확인하고 나중에 빼면 동시에 두 번 누를 때 한도를 넘는다 (Claude 판단).
  예약은 DB 함수 하나에서 `used < quota and not disabled` 를 조건으로 원자적으로 올린다.
- **재요청 묶기:** build 가 성공하면 생성 기록 행 id(uuid)를 `ticket` 으로 돌려준다. 브라우저가 다시 만들 때
  `ticket` 을 같이 보내면, 서버는 그 행이 부른 강사의 것이고 재요청 횟수 < 2 인지 DB 에서 확인한 뒤 차감 없이
  만들고 재요청 횟수를 1 올린다. 조건이 안 맞는 ticket 은 새 미션으로 본다(차감).
  행 id 는 추측할 수 없고 강사 id 와 대조하므로 서명 비밀값을 따로 두지 않는다 (Claude 판단 — 처음 제안의
  "서버 서명 표식"보다 단순하고 같은 위조 방지).
- 빠른 생성은 서버 안에서 재요청까지 끝나므로 한 번 부름 = 1.
- **0개일 때:** 서버는 403 `{error: '생성 횟수를 다 썼어요. 관리자에게 문의해 주세요.', left: 0}`.
  화면은 생성 버튼 옆에 그 문장, 버튼 꺼짐. 남은 횟수는 늘 버튼 옆에 "남은 생성 N개".
- **생성 끄기**(`disabled`)된 강사도 같은 403 문장.

## 구조

### DB (마이그레이션 1개)
- `gen_quota(teacher_id pk → profiles, quota int, used int default 0, disabled bool default false, updated_at)`
  — 행이 없으면 첫 예약 때 `quota = gen_settings.default_quota` 로 만든다. 그래서 기존 · 신규 강사가 같은 규칙.
- `gen_log(id uuid pk, teacher_id, kind 'step'|'quick', lesson text, concept text, retries int default 0, model text, created_at)`
  — 성공한 생성만 남는다 (예약 실패·생성 실패는 행을 지우거나 만들지 않는다).
- `gen_settings(id int pk check (id = 1), default_quota int default 3)`.
- 세 테이블 모두 RLS 켜고 정책 없음 → anon · authenticated 접근 불가. 서버는 service role 로 부른다.
- 예약 · 반환 · 재요청 확인은 `security definer` 함수(`search_path = public, pg_temp`), `execute` 는 service_role 에만.

### 서버
- `api/_quota.py`: `reserve(teacher_id, env, http) -> left`(없으면 Fail 403), `refund(...)`, `retry_ok(ticket, teacher_id, ...) -> bool`, `log(...) -> ticket`.
  `_auth.teacher()` 가 돌려주는 강사 id 를 쓴다 (`refuse` 대신 id 를 받는 경로 필요).
- `api/mission-steps.py` build, `api/generate-mission.py`: 예약 → 생성 → 성공이면 기록 · 응답에 `left`(와 build 는 `ticket`), 실패면 반환.
  `mission-steps` 에 `action: 'quota'` → `{left, disabled}` (차감 없음, 화면이 처음 열릴 때).
- `api/admin.py`: 관리자만. `/auth/v1/user` 의 email 이 환경변수 `ADMIN_EMAILS`(쉼표 구분, 대소문자 무시)에 있어야 한다.
  없거나 비었으면 403. action: `list`(강사별 이름 · 이메일 · used · quota · left · disabled), `set_quota`, `set_disabled`,
  `log`(최근 50건), `get_default` / `set_default`. 한도는 0 이상 정수, 1000 이하.

### 화면
- `admin.html` + `js/ui/admin.js`: 로그인 세션으로 `/api/admin` 을 부른다. 관리자가 아니면 "관리자만 볼 수 있어요." 한 줄.
  강사 표(이름 · 이메일 · 쓴 · 남은 · 한도 입력 · 생성 끄기), 기본 한도 입력, 최근 생성 기록 표
  (시각 · 강사 · 수업 내용 · 개념 · 종류 · 재요청 수).
- `teacher.html`(빠른 생성) · `js/ui/genflow.js`(만들기): 남은 횟수 표시, 0 이면 버튼 꺼짐 + 문장.
  genflow 는 재요청에 `ticket` 을 보낸다.
- AI 비용 추정: 게이트웨이 응답에 usage 가 있으면 기록에 토큰 수를 남기고 화면에 대략 금액, 없으면 그 열을 뺀다
  (빌더 판단).

## 제약

- 정적 HTML/ES5, 층 규칙, 서버 필수 아님(로컬 모드에서는 한도 없이 지금처럼 — 서버가 없으면 생성도 없다).
- 비밀값(service role 키, PICKLE_API_KEY), 관리자 이메일, 강사 비밀번호는 저장소 · 로그 · 문서에 쓰지 않는다.
- 운영 반영(마이그레이션 적용, `ADMIN_EMAILS` 추가, 배포)은 사용자 확인 뒤. 순서: 마이그레이션 → 환경변수 → 배포.
- 테스트: 가짜 http 로 `_quota` · `admin` · build/quick 의 예약/반환/재요청 흐름, Playwright 로 admin.html · 남은 횟수 표시.
  CLAUDE.md 아홉 통과.

## 빌더에게 맡기는 것

SQL 함수 이름 · 정확한 문장 외 라벨 · 표 CSS · 비용 열.
