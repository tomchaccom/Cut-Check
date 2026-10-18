# 실제 교실을 위한 서버 설계

지금 프로토타입은 `localStorage` 기반이라 **한 브라우저 안에서만** 학생↔교사가 연결된다.
26명이 각자 기기에서 하는 진짜 교실을 돌리려면 서버가 필요하다. (`docs/risks.md` 5번)

이 문서는 그 서버를 어떻게 만들지에 대한 설계다. **무엇을 저장하지 않을지가 절반이다.**

> **클라이언트 쪽 준비는 끝났다.** `js/` 가 `core / data / ui` 세 층으로 나뉘어 있고,
> 전송은 `js/data/api.js` 의 어댑터 뒤에 숨어 있다. 서버를 붙이는 작업은
> `js/data/config.js` 의 `apiBase` 를 채우는 것이고, 화면 코드는 한 줄도 안 바뀐다.

---

## 1. 설계 제약

이 서비스의 철학이 곧 스키마 제약이 된다.

| 제약 | 이유 |
|---|---|
| **정답 여부를 저장하지 않는다** | 컬럼이 있으면 언젠가 화면에 뜨고, 뜨면 줄 세우기가 시작된다 |
| **소요 시간을 순위로 쓸 수 있게 저장하지 않는다** | 같은 이유. 이벤트 타임스탬프는 남기되 집계 API 를 만들지 않는다 |
| 학생 식별은 **교실 안에서만** 유효하게 | 이름·학번을 서버에 두지 않는다. 좌석 별칭과 세션 토큰이면 충분하다 |
| 이벤트는 **추가만(append-only)** | 학생이 무엇을 언제 바꿨는지가 데이터의 본질이다. 갱신하면 그게 사라진다 |
| 수업이 끝나면 **원본 이벤트는 폐기 가능** | 남길 것은 집계된 교사용 리포트뿐이다 |

> 저장하지 않기로 한 것도 설계다. **없는 컬럼은 화면에 띄울 수 없다.**

---

## 2. 데이터 모델

```
classroom     교실(수업 한 타임)
  id            uuid
  code          6자리 입장 코드 (수업 시간에만 유효)
  mission_id    'm1' | 'm2' | ...
  opened_at     timestamptz
  closed_at     timestamptz  -- 닫히면 입장 불가, 이벤트 수신 중단

seat          좌석 = 학생 한 명 (개인정보 없음)
  id            uuid
  classroom_id  fk
  alias         '민서' 같은 표시용 별칭. 교사가 부여하거나 학생이 고름
  token         입장 시 발급, 이 교실에서만 유효

event         학생 행동 (append-only)
  id            bigserial
  seat_id       fk
  type          'define'|'cut'|'blocks'|'run'|'judge'|'cause'|'handle'
                |'help'|'revise'|'redefine'|'break'|'wrap'
                |'abstract-*'|'review-*'
  payload       jsonb
  at            timestamptz
```

인덱스는 `(classroom_id, at desc)` 와 `(seat_id, at desc)` 두 개면 된다.
교사 화면은 "최근 것부터" 만 본다.

### payload 에 들어가는 것

`js/core/events.js` 의 `T` 목록이 그대로 `type` 이 된다. 스키마를 새로 만들지 않는다.
클라이언트는 `events.make()` 를 거치지 않으면 이벤트를 만들 수 없고,
`NEVER` 목록(`score`·`rank`·`correct`·`duration`·`accuracy`·`level`·`streak`)에
걸리는 필드는 거기서 예외로 막힌다. **서버도 같은 목록을 거절 목록으로 쓴다.**

```json
{"type":"define","trap":"hardcode","text":"화면에 사과, 바나나, 우유 라고 뜨면 성공이다"}
{"type":"cut","sepName":"쉼표","why":"그냥 골랐어요","weak":true}
{"type":"help","exp":"여러 조각으로 나뉜 목록","act":"안 잘린 한 덩어리","blk":"2 · 기준으로 자르기"}
{"type":"redefine","from":"...","to":"...","trap":null}
```

**`correct`, `score`, `duration_rank` 같은 필드는 만들지 않는다.**

---

## 3. API

### 학생

```
POST /classrooms/{code}/seats
  → { seat_id, token, alias }
  입장 코드로 좌석을 받는다. 로그인 없음. 토큰은 그 교실이 닫히면 무효.

POST /seats/{seat_id}/events        Authorization: Bearer <token>
  body: { events: [ {type, payload, at}, ... ] }
  → 204
  배치로 보낸다. 네트워크가 끊겨도 학생 화면은 계속 돌아가야 하므로
  클라이언트는 localStorage 에 큐를 쌓고 재연결 시 flush 한다.
  (지금 프로토타입의 store.js 가 그 큐 역할을 이미 하고 있다)
```

멱등성: `(seat_id, at, type)` 로 중복 제거한다. 재전송이 흔한 구조라서 필요하다.

### 교사

```
GET  /classrooms/{id}/board          → 현재 상태 스냅샷
GET  /classrooms/{id}/stream         → SSE. 새 이벤트를 밀어준다
GET  /seats/{seat_id}                → 학생 한 명 상세
POST /classrooms/{id}/close          → 수업 종료
```

`board` 응답은 **교사 화면이 그리는 칸과 1:1로 맞춘다.**
프런트에서 다시 계산하게 두면 규칙이 두 군데로 갈라진다.

> **fold 는 옮겨 쓰지 않고 옮겨 심는다.**
> 이벤트를 학생 한 명으로 접는 규칙은 `js/core/fold.js` 하나뿐이다.
> 서버가 파이썬으로 같은 로직을 "다시 쓰면" 반드시 갈라지고, 갈라진 날
> 교사 화면은 학생이 실제로 한 것과 다른 걸 보여준다. 그게 이 제품에서
> 제일 비싼 버그다 — 수업 중에, 학생 앞에서 발견되기 때문이다.
>
> 그래서 셋 중 하나를 고른다.
> 1. 서버가 원본 이벤트를 그대로 내려주고 접기는 클라이언트가 한다 (`api.js` 가 이미 지원)
> 2. 서버가 `fold.js` 를 그대로 실행한다 (Node 사이드카 / QuickJS)
> 3. 파이썬으로 포팅하되 **같은 테스트 케이스**(`test/layer.test.js`)를 양쪽에서 돌린다
>
> 1번이 가장 싸고, 26명 규모에서는 충분하다. 3번을 고르면 테스트가 계약서다.

```json
{
  "ready":   [{seat_id, alias, exp, act, blk, idle_sec}],
  "half_asked": [...],
  "quiet":   [{seat_id, alias, stage, idle_sec}],
  "praise":  [{seat_id, alias, kind: "redefined"|"revised"|"self_found"}],
  "risky":   {"hardcode": [alias], "luck": [alias], "own": [alias]},
  "funnel":  [{stage, n}]
}
```

`praise` 의 정렬 순서는 서버가 정한다 — **redefined > revised > self_found**.
이 순서가 이 제품의 가치관이라서 클라이언트에 맡기지 않는다.

### 실시간

SSE 로 충분하다. 교사→학생 방향 통신이 없어서 WebSocket 이 필요 없다.
26명 × 이벤트 몇 십 개면 폴링(3초)으로도 되지만, 교사가 "지금" 개입해야 하는 제품이라
지연이 체감되면 안 된다.

---

## 4. 개인정보

- **이름·학번·연락처를 받지 않는다.** 좌석 별칭만 쓴다.
- 별칭조차 교사가 화면에서만 매핑한다 (종이 좌석표). 서버는 누가 누군지 모른다.
- 수업 종료 후 N일(기본 7일) 뒤 `event` 는 삭제하고, 교사용 요약만 남긴다.
- 요약에도 개인 식별자를 넣지 않는다 — "하드코딩 보기 선택 11명" 처럼 분포만 남긴다.

교육 현장은 개인정보 심사가 도입의 실질 관문이다.
**받지 않는 설계가 제일 싸게 통과한다.**

---

## 5. 학교 네트워크

- 학교 망에서 외부 도메인이 막히는 경우가 흔하다. **먼저 확인해야 한다.**
- 막히면 교사 노트북에서 도는 단일 바이너리(FastAPI + SQLite) 로 떨어뜨린다.
  학생 기기는 같은 Wi-Fi 의 로컬 IP 로 접속한다. 이 구조가 오히려 개인정보 심사에 유리하다.
- 정적 파일(지금의 5개 화면)은 그대로 서빙하면 된다. 빌드가 없는 게 여기서 이득이 된다.

---

## 6. 단계적으로 만든다

| 단계 | 무엇 | 왜 이 순서인가 |
|---|---|---|
| 0 | 지금 (localStorage, `api.js` 의 local 어댑터) | 시연과 리뷰에는 충분하다 |
| 1 | `POST /events` + `GET /board` 폴링 | 한 교실을 실제로 돌려보는 최소 단위 |
| 2 | `GET /stream` (SSE) | 개입 타이밍이 체감되기 시작하면 |
| 3 | 여러 교실·차시 관리 | 두 번째 학교부터 필요하다 |

1단계에서 클라이언트가 할 일은 `config.js` 의 `apiBase` 를 채우는 것뿐이다.
`js/data/store.js` 의 발신함(outbox)이 이미 오프라인 우선으로 동작한다 —
항상 로컬에 먼저 쌓고, 서버로는 뒤에서 보내고, 실패하면 지우지 않고 다시 시도한다.

**1단계까지만 있어도 첫 수업은 돌아간다.** 거기서 얻는 데이터가
`docs/survey.md` 의 가설 H1~H5 를 검증한다. 2·3단계는 그다음이다.

---

## 7. 서버를 만들면서도 지킬 것

새 기능을 서버에 넣을 때 `CLAUDE.md` 의 질문을 그대로 쓴다.

> 이건 시작 비용을 줄이는 건가, 판단을 대신하는 건가?

서버에서 특히 유혹이 큰 것들 —

- **"정답률 API 하나만"** → 만들지 않는다. 한 번 만들면 화면에 뜬다.
- **"학생 랭킹 조회"** → 만들지 않는다.
- **"AI 자동 힌트 푸시"** → 학생이 증상을 말하기 전에는 아무것도 보내지 않는다.
- **"교사 대신 칭찬 메시지 발송"** → 타이밍만 알린다. 문구는 만들지 않는다.
- **"서버가 있어야 수업이 된다"** → 그렇게 만들지 않는다. 학교 와이파이는 끊기고,
  끊긴 순간 학생이 누른 게 사라지면 그 수업은 거기서 끝난다.
  **서버는 기록의 조건이 아니라 기록의 사본이다.**

---

## 8. 지금 쓰는 계정 — Supabase (2026-10-18)

위 1~7 은 처음 설계다. 지금 배포본은 Supabase 인증 + `api/create-student.py` 로 돈다.

- **강사**: `auth.html` 에서 이메일로 스스로 가입한다. 스스로 가입한 사람은 모두 강사다.
- **학생**: 스스로 가입하지 않는다. 선생님 화면 `학생 추가` 탭에서 선생님이 이름·아이디·비밀번호로 만든다.
  학생은 `auth.html` 에 **아이디 + 비밀번호** 로 들어온다. 내부 이메일은 `<아이디>@students.invalid`.
  아이디: 영어 소문자·숫자·`-`, 3~30자. 비밀번호를 비우면 서버가 8자를 만든다(헷갈리는 0/o·1/l/i 제외).
- **교실 코드로 스스로 들어가기는 없앴다.** 수강(enrollments) 줄은 서버만 만든다.
- **역할은 서버가 정한다.** 트리거 `handle_new_user` 는 `app_metadata.role = 'student'` 일 때만 학생,
  그 밖에는 강사로 만든다. `app_metadata` 는 service role 키로만 쓸 수 있다. `user_metadata.role` 은 보지 않는다.
  `profiles` 는 본인도 `name` 열만 고칠 수 있다(열 단위 권한) — 학생이 스스로 강사가 되는 길을 막았다.

```
POST /api/create-student        Authorization: Bearer <선생님 access token>
  { action: 'create', classroomId, name, loginId, password? } → { loginId, password }
  { action: 'reset',  classroomId, loginId, password? }       → { loginId, password }
  401 토큰 없음·무효 / 403 강사 아님·이 교실 선생님이 아님(reset: 이 교실 학생이 아님) / 409 이미 있는 아이디
  400 입력 형식(classroomId 는 UUID) / 502 Supabase 실패·시간 초과(수강 넣기가 실패하면 만든 계정을 지운다) — 모두 { error: '<선생님에게 보일 한국어 문장>' }
```

환경변수(Vercel): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. 값은 저장소에 두지 않는다.
서버가 없으면(로컬 모드) 계정은 못 만들지만 수업 흐름은 그대로 돈다.
