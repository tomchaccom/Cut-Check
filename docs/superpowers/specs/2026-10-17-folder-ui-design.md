# 폴더 UI — 디자인 초안을 실제 화면에 적용

날짜 2026-10-17 · 브랜치 `tomchaccom/folder-ui` · 디자인 원본 `docs/design/2026-10-17-folder-ui/*.dc.html`
(사람이 확인한 캔버스: https://claude.ai/artifact/PpPyY3KMFgPpdpKz7bbLUd)

## 왜

"UI 가 보기 힘들고 AI 로 찍어 만든 것 같다" (사람). 레퍼런스(흰 바탕 · 큰 검은 글자 · 가는 선 · 노란 폴더 ·
흰 파일)로 초안 9장을 만들었고 사람이 승인했다: **교실은 폴더, 미션은 파일**.

## 한눈에

| 화면 | 지금 | 바뀐 뒤 (디자인 파일) |
|---|---|---|
| 학생 홈 | 첫 교실 하나의 미션 카드 그리드 | **내 교실 = 노란 폴더들** (`Main`) — 여러 교실, 지난 교실은 회색, 교실 코드로 들어가기 |
| 교실 안 | (없음 — 홈이 곧 미션 목록) | **미션 = 파일들** (`Classroom`) — 완료 검은 파일 · 진행 중 굵은 테두리 · 안 연 것 흰 파일 |
| 미션 01·02 | 카드형 | 위치 표시 + 큰 미션 이름 + 가는 선 + 단계 탭 `01 문제 … 05 정리` (`Success`) |
| 03 설계 | 카드 풀 + ▲▼✕ 목록 | 알약 버튼으로 담고, **노란 줄이 위→아래로 쌓임**, 줄은 글자 폭만큼, ▲▼✕ 는 이름 옆 (`Mission`) |
| 04 코딩 | 결과가 텍스트 줄 | 에디터 + 실행 버튼 + **자료·내용·결과 표** + 판단 상자 (`Code`) |
| 05 정리 | 판정 카드 + 글 | 내가 해 온 것(고친 기록 포함) + 한두 문장 (`Wrap`) |
| 강사 홈 | 분석 패널 8개 | **학생 = 노란 폴더(가나다순)** + **말 걸 순간** 목록 (`Teacher`) — 분석 패널은 아래 "더 보기" 로 접는다 |
| 학생 한 명 | 오른쪽 서랍 | 시간 순 기록 + 튜터 질문 (`TeacherStudent`) — 서랍을 이 모양으로 |
| 미션 만들기 | 초안 상자 | 입력 왼쪽 · 초안 오른쪽, 위에 **검수 필요** 노란 상자, 진짜·함정 표시, **없어도 되는 카드** (`NewMission`) |

## 시각 규칙 (토큰)

이름은 그대로 두고 값만 바꾼다 — 화면 CSS 가 이미 토큰을 쓰므로 한 곳에서 바뀐다 (`sentence.css`, `styles.css` 의 `:root`).

| 토큰 | 밝게 | 어둡게 |
|---|---|---|
| `--paper` `--surface` | `#FFFFFF` | `#111111` / `#1A1A1A` |
| `--surface-2` `--surface-3` | `#F6F6F6` / `#EFEFEF` | `#222222` / `#2B2B2B` |
| `--ink` `--ink-2` `--ink-3` | `#111111` / `#555555` / `#6E6E6E` | `#F2F2F2` / `#BDBDBD` / `#9A9A9A` |
| `--line` `--line-strong` | `#E3E3E3` / `#111111` | `#333333` / `#F2F2F2` |
| `--green` (주 동작색) `--green-soft` | `#111111` / `#FFF23D` | `#FFF23D` / `#3A3610` |
| `--folder` `--folder-tab` (새) | `#FFF23D` / `#E9DB2B` | 같음 |
| `--coral` (에러) | `#C4321F` | `#FF8877` |

- 글꼴: 큰 제목·숫자 `Archivo`(500), 본문 `IBM Plex Sans KR`, 코드 `IBM Plex Mono`. Gothic A1 은 뺀다.
- 큰 제목: `clamp(44px, 7vw, 96px)` (미션), `clamp(56px, 11vw, 150px)` (교실·학생 이름), 학생 홈 워드마크 `CUT:CHECK`.
- 가는 선 `1px var(--line-strong)` 이 제목과 내용을 가른다. 그림자는 폴더·파일에만.
- 노랑은 폴더 · 고른 것 · 강조 한 곳에만. 그라데이션 · 왼쪽 굵은 테두리 카드 · 이모지 금지.

## 지키는 것 (바뀌지 않는다)

- CLAUDE.md 전부: 학생 화면에 반 전체 현황 없음 (교실 폴더 아래 "미션 5개 · 2개 남음" 은 **내** 것), 점수·순위 없음,
  학생 화면 존댓말, core 층 규칙, 번들러·ES 모듈 없음, 서버 없이도 동작 (로컬 모드: 교실 폴더 하나 "내 미션").
- 강사 화면도 정답률·순위·소요 시간 랭킹 없음. 학생 폴더는 **가나다순만** — 진행 순 정렬 금지.
- "말 걸 순간" 은 사실만 ("설계도를 냈어요"). 칭찬 문구는 만들지 않는다.
- E2E·robust 가 쓰는 id·class 는 유지한다: `#go-define .define-card #reason-define #go-method .card-pick
  .design-item select .card-up .card-down .card-remove #go-run #code-editor #run-code #run-all #code-result
  #code-judge .judge-btn #code-basis #code-judge-save #go-wrap #wrap-text #finish #samples #define-brief #define-q
  .m-btn .main-tab #history-list #gen-btn #gen-result`. 결과 표로 바꾸면서 `#code-result` 의 텍스트 형식이 바뀌는 곳은 테스트를 같이 고친다.
- 기능은 빼지 않는다. 강사 분석 패널(지금 답해줄 수 있어요 · 조용히 막혀 있어요 · 위험 · 단계 흐름 등)은 "더 보기" 접힘 안으로.

## 범위 밖

landing · abstract · review · make · print · philosophy 화면 재디자인 (토큰이 바뀌어 색만 따라온다 — smoke 로 깨지지 않는지만 본다),
튜터·생성 로직, 로그인 화면.
