# 화면 개편 · 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선생님 화면을 접는 왼쪽 사이드바 + 한 열 본문 + 접는 오른쪽 알림 패널로, 학생 상세를 본문 화면으로, 미션 만들기를 탭으로, 학생 튜터를 오른쪽 사이드바로 바꾸고, 알림 종류(칭찬 타이밍 · 살펴볼 것 · 레벨 테스트)를 더한다.

**Architecture:** 판단(언제 무슨 알림)은 `js/core/alerts.js` 순수 함수. 화면 틀은 `teacher.html`/`teacher.css` 재배치 — 기존 id·class(테스트가 쓰는 것)는 유지하고 자리만 옮긴다. 접힘 상태 같은 보는 사람 편의는 `js/data/` 의 작은 저장 도우미(try/catch localStorage).

**Tech Stack:** 정적 HTML/CSS/JS(번들러·ES 모듈 없음), Playwright e2e, node 단위 테스트.

**Spec:** `docs/superpowers/specs/2026-10-20-shell-alerts-design.md`
**시안(모양의 기준):** `/private/tmp/claude-501/-Users-myeongsung-orca-workspaces-------------------/3cc541ee-1a1d-4c1d-8165-ba91814eb2d0/scratchpad/design-canvas/project/` — Main, Detail, Roster, MissionStep1~4, MissionQuick, Folded, Admin, NewRoom, Mobile, StudentTutor, StudentCompass, LevelChoice/Short/Done `.dc.html`. 색은 시안의 흑백 토큰 대신 기존 `sentence.css` 토큰(다크 테마 포함)을 쓴다.

## Global Constraints

- 층 경계(CLAUDE.md): core 는 DOM·저장소 모름, data 는 DOM 모름, ui 는 서버 유무 모름(`CC.sb.active()` 만).
- 테스트가 쓰는 선택자는 유지: `.room-tile`, `#classroom-cards`, `.student-tile`, `#detail`, `.main-tab[data-dtab=dtab-students|dtab-missions|dtab-invite]`, `#gen-*`, `#sg-*`, `.gen-left`, `.roster-*`, `#ns-*`, `.compass-*`, `#recap-class(-out)`, `.toast`, `#alert-list`, `#moments-empty`, `#tutor-*`, `.tutor-msg`, `.tutor-row`, `data-tour=*`. 동작 검증은 줄이지 않는다 — 구조 때문에 바뀌는 단언만 고친다.
- WCAG 2.2 AA: 본문 17px, 클릭 대상 ≥44px, 대비 4.5:1, `:focus-visible` 테두리, 접기 버튼은 `aria-expanded` + `aria-controls` + `aria-label`.
- 알림: 학생·미션당 종류별 한 번, 첫 화면 기준선 유지, 순서 번호·시간 랭킹·반 평균·칭찬 문장 없음. `TUTOR_MANY = 5`.
- 화면 문구: 존댓말, 너 금지, 질문은 물음표, 조사는 `CC.particle`.
- smoke 9화면 × 3폭 × 2테마 가로 스크롤 없음. 휴대폰(390): ☰ + 아래 노란 막대.
- CLAUDE.md 의 테스트 전부 + `npx playwright test` 통과해야 커밋. `git add` 는 경로 지정.

## Review Focus

1. 접힌 사이드바 상태에서도 키보드로 모든 메뉴에 갈 수 있고 포커스가 보인다 → Task 2 e2e.
2. 학생 상세에서 뒤로 가면 보던 학생 목록 스크롤·탭이 그대로다 → Task 3 e2e.
3. 미션 만들기 탭을 바꿔도 `CC.genflow.quota` 가 두 버튼을 다 찾는다(숨은 탭 포함) → Task 4 e2e(0개면 둘 다 꺼짐).
4. 알림이 5초 폴링마다 다시 뜨지 않는다(같은 학생·미션·종류 한 번) → Task 1 단위 + Task 2 e2e.
5. 학생 튜터 사이드바가 4단계 아닌 단계에서는 안 보이고, 접어도 대화가 이어진다 → Task 5 e2e.

---

### Task 1: 알림 규칙 — `js/core/alerts.js`

**Files:** Modify `js/core/alerts.js`; Create `test/alerts.test.js`; Modify `CLAUDE.md` 작업 순서(테스트 한 줄).

**Interfaces — Produces:**
- `CC.alerts.snap(students, opt)` — `opt = { finishedOf, eventsOf, missionName, server }` (모두 선택). 학생·미션·종류 키 집합을 담는다.
- `CC.alerts.diff(prev, next) -> [{ id, name, mid, kind, tag }]` — `kind ∈ finish | redefine | fixed | hardcode | tutor-many | level | design | code`, `tag ∈ praise | look | info`. prev 가 null 이면 [] (기준선).
- `CC.alerts.say(a) -> string` (스펙 표 문장 그대로; 로컬 `finish` 는 나침반 문장 없이 `OO이 미션 이름을 마쳤어요.`; 기존 `design`/`code` 문장 유지).
- `CC.alerts.TAGS = { praise: '칭찬 타이밍', look: '살펴볼 것', info: '레벨 테스트' }`, `CC.alerts.TUTOR_MANY = 5`.
- 판정 재료: `fixed` = 에러 있는 `s-code` 뒤 code 가 다른 에러 없는 `s-code`; `hardcode` = `CC.facts.of(student, mission)` 에 kind `hardcode`; `level` = `skipped` 가 아닌 `s-onboard` (레벨 문구는 `CC.onboard` 로 계산, 없으면 레벨 문장 생략).

- [ ] Step 1: `test/alerts.test.js` (패턴: `test/compass.test.js`) — 종류별 한 번(같은 이벤트 두 번 snap → 1), 기준선(prev null → []), 다른 미션 → 따로, `tutor-many` 는 4번째 0 · 5번째 1 · 6번째 0, 로컬/서버 `finish` 문장, 조사(`한결이`/`태인이`… `CC.particle`), 칭찬 낱말(`잘했`·`훌륭`) 없음.
- [ ] Step 2: 실패 확인 → 구현 → `node test/alerts.test.js`, `node test/compass.test.js`, `node test/layer.test.js` 통과.
- [ ] Step 3: CLAUDE.md 작업 순서에 `node test/alerts.test.js` 추가. 전체 테스트. 커밋.

### Task 2: 선생님 화면 틀 — 왼쪽 사이드바 · 본문 · 오른쪽 알림

**Files:** Modify `teacher.html`, `teacher.css`, `js/ui/teacher.js`, `js/ui/tour.js`; Create `js/data/prefs.js` (`CC.prefs.get(key, dflt)`, `CC.prefs.set(key, v)` — try/catch localStorage, 이 브라우저 편의만); `test/e2e-flow.spec.js`.

**Interfaces:** Consumes Task 1. Produces: `#side`(왼쪽 nav, `aria-label="교실과 메뉴"`), `#side-toggle`, `#alerts`(오른쪽 aside; 안에 기존 `#alert-list`, `#moments-empty`), `#alerts-toggle`, 알림 고르기 `.al-filter[data-tag=all|praise|look]`, 휴대폰 `#side-open`(☰) · `#alerts-bar`.

- [ ] Step 1: 실패하는 e2e — (a) 넓은 화면에서 왼쪽에 교실 목록(`.room-tile` 유지)과 고른 교실 아래 학생/미션/학생 추가(`.main-tab[data-dtab]` 를 사이드바로 옮김), 아래 관리자 · 설계 의도 · 로그아웃. (b) `#side-toggle` 누르면 72px 아이콘 줄, `aria-expanded=false`, 새로고침해도 유지(`CC.prefs`), Tab 으로 메뉴 전부 갈 수 있음. (c) `#alerts` 에 알림 항목: 이름표(`칭찬 타이밍`/`살펴볼 것`/`레벨 테스트`) + 문장 + 시각, 항목 누르면 학생 상세, 읽으면 굵기 해제, 고르기 칩으로 걸러짐, 5초 폴링 두 번에도 같은 알림 한 번. (d) 본문에 "말 걸 순간" 섹션 없음. (e) 390px: `#side-open` 으로 사이드바 열림, 아래 `#alerts-bar` 누르면 알림 전체 화면, 가로 스크롤 없음. (f) 관리자 링크·새 교실 만들기는 사이드바에서.
- [ ] Step 2: 실패 확인 → 구현. 교실 폴더 타일 화면(`#classroom-selector`)은 사이드바 교실 목록으로 대체하되 `#classroom-cards`/`.room-tile` 이 사이드바 안에 그대로 있게. `showAlert` 는 `#alert-list` 에 이름표와 함께 쌓고(상한 30), toast 는 유지. 투어 단계(`tour.js` 의 `tab()`)를 새 자리에 맞게.
- [ ] Step 3: CLAUDE.md 테스트 + playwright 전체. 스크린샷 1280·390 을 scratchpad `shell/` 에. 커밋.

### Task 3: 학생 상세를 본문 화면으로

**Files:** Modify `teacher.html`, `teacher.css`, `js/ui/teacher.js`, `test/e2e-flow.spec.js`.

- [ ] Step 1: 실패하는 e2e — 학생 타일·알림 항목을 누르면 `#detail` 이 본문 자리에 열리고(목록은 숨김, scrim 없음), 맨 위 `← 학생` 뒤로 가기(`#detail-back`) · Esc 로 목록 복귀 + 목록 스크롤 위치 유지 + 포커스가 그 학생 타일로. 순서: 머리(이름 · 레벨 · 지금 어디) → 미션 고르기 → 나침반 카드(본문 폭 전체) → 시간순 기록(760px) → "튜터 대화 · 짚을 거리" 칸(기존 recap 버튼과 튜터 로그를 본문으로). `알림 항목 → 상세` 는 해당 미션 칩이 골라진 상태.
- [ ] Step 2: 실패 확인 → 구현(`closeDetail` = 목록 복귀, 기존 `CC._closeDetail` 유지). 커밋.

### Task 4: 미션 만들기 — 탭 둘과 4단계

**Files:** Modify `teacher.html`, `teacher.css`, `js/ui/genflow.js`, `test/e2e-flow.spec.js`.

- [ ] Step 1: 실패하는 e2e — `#dtab-missions` 안에 탭 `단계별로 만들기`/`한 번에 만들기`(`role=tablist`, 화살표 키 이동), 단계별: 진행 표시 `n / 4 이름` + 4칸 막대, 끝난 단계는 요약 줄 + `고치기`(그 단계로 돌아감), 각 단계 아래 `남은 생성 N개` + 차감 설명(1·2·4단계 "여기까지는 횟수를 쓰지 않아요", 3단계 "문제 만들기를 누르면 1개를 써요"). 한 번에: 기존 빠른 생성 폼. 남은 0개면 두 탭 버튼 모두 꺼짐(숨은 탭의 버튼 포함). 만든 미션 목록은 본문 아래.
- [ ] Step 2: 실패 확인 → 구현(인라인 `style=` 를 CSS 로). 커밋.

### Task 5: 학생 튜터 — 오른쪽 사이드바

**Files:** Modify `sentence.html`, `sentence.css`, `js/ui/tutor.js`, `js/ui/sentence.js`, `test/e2e-flow.spec.js`.

- [ ] Step 1: 실패하는 e2e — 넓은 화면 4단계에서 `#tutor` 가 본문 오른쪽 `aside`(모달 아님, 본문 클릭 가능), `#tutor-close` 는 접기(`aria-expanded`), `#tutor-open` 은 펼치기, 접었다 펴도 대화 유지, 4단계 아니면 숨김. 390px: 아래 노란 막대 `튜터에게 묻기` → 전체 화면, 닫기. 기존 튜터 테스트(Enter 전송, 지난 대화, 늦은 답 기록) 그대로 통과.
- [ ] Step 2: 실패 확인 → 구현(`<dialog>` → `<aside>`, `showModal()` → 클래스 토글, 휴대폰에서만 전체 화면). 커밋.

### Task 6: 관리자 화면 — 틀과 고칠 것

**Files:** Modify `admin.html`, `js/ui/admin.js`, `teacher.css`(또는 admin 전용 블록), `test/e2e-flow.spec.js`(관리자 화면 가짜 서버 테스트가 있으면 거기, 없으면 새 테스트 하나).

- [ ] Step 1: 실패하는 e2e(가짜 `/api/admin`) — 왼쪽 사이드바 같은 틀(오른쪽 패널 없음), 저장 중 그 줄 버튼 잠금 · 연속 클릭 1회 요청, 저장되면 `저장했어요` 3초 뒤 사라짐, `꺼짐` 과 `다 씀` 다른 표시, 빈 기록 `아직 만든 미션이 없어요.`, 같은 이름 강사는 이메일 함께, 로그인 안 됐으면 로그인 링크, 390px 가로 스크롤 없음 · 오류 문구 보임.
- [ ] Step 2: 실패 확인 → 구현. supabase-js 스크립트 주소를 정확한 버전으로 고정(다른 화면이 쓰는 버전과 같게). 커밋.

### Task 7: 문서 (controller)

- [ ] CLAUDE.md 파일 구조에 `js/data/prefs.js`, 알림 규칙 한 단락(종류 · 한 번 · 칭찬 문장 없음 · `TUTOR_MANY`). 전체 테스트, 커밋.
