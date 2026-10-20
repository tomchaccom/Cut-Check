# 관리자 대시보드 + 강사별 생성 한도 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 강사마다 미션 생성 한도(기본 3)를 두고 성공한 생성만 1 차감하며, 관리자가 `admin.html` 에서 한도·끄기·기본값·최근 기록을 다룬다.

**Architecture:** DB 테이블 3개 + `security definer` 함수(service_role 전용)로 예약/반환/재요청/기록을 원자적으로. 서버는 `api/_quota.py` 한 곳에서 그 함수를 부르고, `mission-steps` build · `generate-mission` 이 생성 전후로 감싼다. 관리자 API `api/admin.py` 는 `ADMIN_EMAILS` 로 확인. 화면은 `admin.html` + `js/ui/admin.js`, 기존 생성 버튼 옆에 남은 횟수.

**Tech Stack:** Supabase Postgres(마이그레이션 SQL), Python 3.12 Vercel 함수(urllib, 가짜 http 로 테스트), ES5 정적 JS, Playwright 헤드리스.

**Spec:** `docs/superpowers/specs/2026-10-20-admin-quota-design.md`

## Global Constraints

- 차감: build 1번 또는 빠른 생성 1번 = 1. concept · examples · solve 는 차감 없음. 성공했을 때만 — 예약 후 실패하면 반환.
- 재요청: build 성공 응답에 `ticket`(gen_log 행 uuid). 같은 강사 + `retries < 2` 인 ticket 이면 차감 없이 만들고 retries+1. 아니면 새 미션(차감).
- 기본 한도 3. 행이 없으면 첫 예약 때 `gen_settings.default_quota` 로 만든다. 다시 채워지지 않는다.
- 0개 · 꺼짐: 403 `{"error": "생성 횟수를 다 썼어요. 관리자에게 문의해 주세요.", "left": 0}`.
- 화면: 생성 버튼 옆 "남은 생성 N개"; 0 이면 버튼 꺼짐 + 위 문장. 관리자 아님: "관리자만 볼 수 있어요."
- 관리자: `/auth/v1/user` 의 email 이 환경변수 `ADMIN_EMAILS`(쉼표 구분, 대소문자·공백 무시)에 있을 때만. 비었으면 아무도 아님.
- 한도 값: 0 이상 1000 이하 정수, 아니면 400.
- 테이블 3개 RLS 켜고 정책 없음. 함수 `execute` 는 service_role 만 (`revoke ... from public, anon, authenticated`). `security definer set search_path = public, pg_temp`.
- 비밀값·관리자 이메일·비밀번호를 저장소·로그·문서·테스트 픽스처에 쓰지 않는다 (테스트는 `admin@example.com` 같은 가짜).
- 로컬 모드(서버 없음)는 지금처럼 동작, 남은 횟수 표시 없음.
- 운영 반영(마이그레이션 적용·환경변수·배포)은 이 계획에 없다 — 사용자 확인 뒤.
- CLAUDE.md 아홉 + `test_quota.py` + `test_admin.py` + Playwright 통과 후 커밋. 경로 지정 커밋, `git add .` 금지.

## Review Focus

1. 동시에 두 번 누름(남은 1) → 하나만 예약된다. SQL 함수가 조건부 update 한 줄로 원자적인지 (Task 1 SQL 리뷰 + Task 2 가짜 http 로 두 번째가 403).
2. 생성이 예외·422 로 끝남 → 반환되어 남은 횟수 그대로 (Task 3 테스트).
3. 다른 강사의 ticket, retries 2 를 다 쓴 ticket, 형식이 틀린 ticket → 차감되는 새 미션 (Task 2·3 테스트).
4. `ADMIN_EMAILS` 비었거나 없음 / 대문자 섞인 이메일 → 403 / 통과 (Task 4 테스트).
5. 한도를 쓴 횟수보다 낮게 내림 → 남은 0, 음수 표시 없음 (Task 1 SQL `greatest(0, …)`, Task 4·6 테스트).

---

### Task 1: 마이그레이션

**Files:**
- Create: `supabase/migrations/20261020000000_gen_quota.sql`

**Interfaces (Produces, SQL 함수 — 모두 service_role 전용):**
- `gen_reserve(tid uuid) returns int` — 행 없으면 default_quota 로 만든 뒤 `update gen_quota set used = used + 1 where teacher_id = tid and not disabled and used < quota returning quota - used`; 못 올리면 `-1`.
- `gen_refund(tid uuid) returns void` — `used = greatest(0, used - 1)`.
- `gen_retry(tid uuid, ticket uuid) returns boolean` — `update gen_log set retries = retries + 1 where id = ticket and teacher_id = tid and retries < 2`; found 여부.
- `gen_record(tid uuid, kind text, lesson text, concept text, model text) returns uuid` — gen_log 행 id.
- `gen_left(tid uuid) returns table(quota int, used int, disabled boolean)` — 행 없으면 default 로 (만들지 않고) 계산.
- 테이블은 스펙 그대로: `gen_quota`, `gen_log`(lesson 은 앞 200자), `gen_settings`(id=1 한 행, insert on conflict do nothing).

- [ ] **Step 1:** SQL 작성. 파일 머리에 왜(스펙 한 줄 인용)와 날짜 주석 — 기존 `20261019000000_assign_level_test.sql` 형식.
- [ ] **Step 2:** 로컬 문법 확인: `npx supabase db lint` 가 없으면 `psql` 없이 리뷰로 대체 — 운영 DB 에는 적용하지 않는다. (`supabase db push` 금지)
- [ ] **Step 3: 커밋** `supabase/migrations/20261020000000_gen_quota.sql`

### Task 2: `api/_quota.py`

**Files:**
- Create: `api/_quota.py`, `test/test_quota.py`
- Modify: `api/_auth.py` (강사 id 와 email 을 같이 돌려주는 `whoami(token, env, http) -> {'id', 'email'}`; `teacher()` 는 그걸 써서 id 만 돌려주게 — 기존 호출부 그대로)

**Interfaces:**
- Produces: `reserve(tid, env, http) -> int` (남은 수, 실패면 `Fail(403, OUT)` with `left 0`), `refund(tid, env, http)`, `retry_ok(tid, ticket, env, http) -> bool` (ticket 이 uuid 꼴이 아니면 RPC 없이 False), `record(tid, kind, lesson, concept, model, env, http) -> str`, `left(tid, env, http) -> {'left': int, 'disabled': bool}`.
- `OUT = '생성 횟수를 다 썼어요. 관리자에게 문의해 주세요.'`
- RPC 호출: `POST {SUPABASE_URL}/rest/v1/rpc/<name>` service 키 헤더 (`_accounts.py` 의 http 사용 방식).

- [ ] **Step 1: 실패하는 테스트** — 가짜 http 가 RPC 이름별 응답: reserve 2 → 2 반환; reserve -1 → Fail 403 · msg OUT; RPC 502 → Fail 502; retry_ok('not-a-uuid') → False 이고 http 호출 0회; retry_ok(uuid) RPC true/false 그대로; left → `{'left': max(0, quota-used), 'disabled'}`, disabled 면 left 0.
- [ ] **Step 2:** `uv run --with-requirements requirements.txt python test/test_quota.py` → FAIL
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** PASS + `test_steps.py`, `test_accounts.py` 그대로 PASS.
- [ ] **Step 5: 커밋** `api/_quota.py api/_auth.py test/test_quota.py`

### Task 3: 생성 함수에 한도 걸기

**Files:**
- Modify: `api/mission-steps.py`, `api/generate-mission.py`, `test/test_steps.py`, `test/test_quota.py`(흐름 절) 
- Modify: `CLAUDE.md`(작업 순서에 `test_quota.py`), `docs/server.md`(한도·ticket 한 단락)

**Interfaces:**
- Consumes: Task 2.
- Produces: build 성공 → `{draft, ticket, left}`; 빠른 생성 성공 → 기존 미션 JSON + `left`; `action: 'quota'` → `{left, disabled}`; 한도 없음 → 403 `{error: OUT, left: 0}`.
- build 요청에 `ticket`(선택). `retry_ok` 면 예약·기록 없이 생성, 응답 ticket 은 같은 값, left 는 `left()` 로.

- [ ] **Step 1: 실패하는 테스트** (가짜 http + 가짜 llm, `handle(body, token, env, http, llm)`):
  - build 성공 → reserve 1회, record 1회, 응답 ticket·left.
  - build 가 GenerateError → reserve 1, refund 1, 422.
  - build 가 LLM 예외 → refund 1, 502.
  - build + 유효 ticket → reserve 0, retry RPC 1, record 0.
  - build + 남의/다 쓴 ticket(RPC false) → reserve 1.
  - 한도 0 → 403 OUT, LLM 호출 0.
  - concept / examples / solve → reserve 0.
  - action quota → `{left, disabled}`, reserve 0.
  - generate-mission: 성공 reserve 1 · record kind 'quick'; 422 · 502 면 refund. (handler 의 do_POST 를 `handle()` 꼴로 빼서 시험할 수 있게 한다 — mission-steps 와 같은 모양.)
- [ ] **Step 2:** FAIL 확인 → **Step 3:** 구현 → **Step 4:** CLAUDE.md 파이썬 테스트 전부 PASS
- [ ] **Step 5: 커밋** 위 Files

### Task 4: 관리자 API

**Files:**
- Create: `api/admin.py`, `test/test_admin.py`
- Modify: `vercel.json`(`"api/admin.py": { "maxDuration": 15 }`), `CLAUDE.md`(테스트 한 줄), `docs/server.md`(`ADMIN_EMAILS` 환경변수 — 값은 적지 않는다)

**Interfaces:**
- Produces: `handle(body, token, env, http) -> (status, json)`. 관리자 아님 → 403 `{error: '관리자만 볼 수 있어요.'}`.
  - `list` → `{teachers: [{id, name, email, used, quota, left, disabled}], default_quota}` — profiles role=teacher + gen_quota(없으면 default, used 0) + 이메일은 `/auth/v1/admin/users`(service 키, per_page 1000).
  - `set_quota {id, quota}`, `set_disabled {id, disabled}` → upsert gen_quota, 갱신한 그 강사 한 줄.
  - `log` → 최근 50건 `{at, teacher, lesson, concept, kind, retries}`(teacher = 이름).
  - `set_default {quota}` → `{default_quota}`.
  - 한도 검증: int, 0..1000, bool 은 int 로 보지 않는다.

- [ ] **Step 1: 실패하는 테스트**: 토큰 없음 401; ADMIN_EMAILS 없음 403; `' A@Example.com , b@x.com'` 에 `a@example.com` 통과; list 모양(행 없는 강사 used 0 quota=default, left = max(0, quota-used)); set_quota 1001 · -1 · '3' · True → 400; set_quota 2 (used 3) → left 0; set_disabled; log; set_default.
- [ ] **Step 2:** FAIL → **Step 3:** 구현 (`_auth.whoami` 사용) → **Step 4:** PASS
- [ ] **Step 5: 커밋** 위 Files

### Task 5: 강사 화면 — 남은 횟수

**Files:**
- Modify: `js/ui/genflow.js`(ticket 저장·재요청에 실어 보내기, 남은 횟수 표시), `teacher.html`(빠른 생성 옆 표시), 교사 CSS, `test/e2e-flow.spec.js`

**Interfaces:**
- Consumes: Task 3 HTTP.
- 화면 열릴 때 `CC.sb.active()` 면 `action: 'quota'` 1회 → 두 생성 버튼 옆 "남은 생성 N개". 생성 응답의 `left` 로 갱신. 403 이고 `left === 0` 이면 버튼 둘 다 꺼짐 + 문장.
- genflow `make()` 의 재요청(`probs.length`)은 직전 build 응답의 ticket 을 보낸다. 새 "만들기"(첫 호출)는 ticket 없이.

- [ ] **Step 1: 실패하는 e2e** (Playwright route 로 `/api/mission-steps`·`/api/generate-mission` 가짜, `CC.sb.active`·`CC.sb.api` 를 가짜 세션으로): 처음 "남은 생성 3개"; build 성공 left 2 → "남은 생성 2개"; 검사에 걸린 재요청 본문에 첫 응답의 ticket; 403 left 0 → 두 버튼 disabled + 문장; 로컬 모드에서는 표시 없음.
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** 아홉 + Playwright PASS
- [ ] **Step 5: 커밋** 위 Files

### Task 6: 관리자 화면

**Files:**
- Create: `admin.html`, `js/ui/admin.js`
- Modify: `test/smoke.js`(화면 목록에 admin.html), `test/e2e-flow.spec.js`, `CLAUDE.md` 파일 구조 표에 한 줄

**Interfaces:**
- Consumes: Task 4 HTTP via `CC.sb.api('/api/admin', body)`.
- 로그인 안 됨 → `auth.html` 로 보내는 기존 교사 화면 방식 따름. 403 → "관리자만 볼 수 있어요." 한 줄만.
- 강사 표: 이름 · 이메일 · 쓴 · 남은 · 한도(number 입력, 바꾸면 set_quota) · 생성 끄기(checkbox → set_disabled). 기본 한도 입력(set_default). 최근 생성 기록 표: 시각 · 강사 · 수업 내용 · 개념 · 종류(단계별/빠른) · 재요청.
- 모든 문자열은 textContent. 기존 교사 화면 스타일 토큰 재사용, 3폭 가로 스크롤 없음(표는 감싸서 가로 스크롤 영역).

- [ ] **Step 1: 실패하는 e2e** (route 가짜): 403 → 문장만, 표 없음; list → 행 2개, 한도 5 입력 → set_quota 요청 본문 `{action:'set_quota', id, quota:5}`, 응답으로 그 줄 갱신; 1001 입력 → 서버 400 문구가 그 줄 옆에; 기록 표에 `<img onerror>` 수업 내용이 글자로.
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** 아홉(smoke 에 admin 포함) + Playwright PASS
- [ ] **Step 5: 커밋** 위 Files
