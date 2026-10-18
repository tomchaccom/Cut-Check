-- 학생 계정은 선생님이 만든다 (2026-10-18).
-- 스스로 가입하는 사람은 모두 강사다. 학생 계정은 api/create-student.py 가 service role 키로만 만든다.
-- 기존 계정·수강·기록은 건드리지 않는다.

-- 1) 아이디 — 학생 계정의 이메일은 <아이디>@students.invalid 다.
--    교사 화면이 아이디를 다시 보여 주고(비밀번호 다시 만들기), 서버가 아이디로 학생을 찾는 데 쓴다.
alter table profiles add column if not exists login_id text;
create unique index if not exists profiles_login_id_key on profiles(login_id) where login_id is not null;

-- 2) 역할은 서버가 정한다. user_metadata 는 가입하는 사람이 마음대로 넣을 수 있으므로 보지 않는다.
--    app_metadata 는 service role 키로만 쓸 수 있다 → role 'student' 는 우리 서버만 만들 수 있다.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  is_student boolean := coalesce(new.raw_app_meta_data->>'role', '') = 'student';
begin
  -- 학생 도메인은 우리 서버만 쓴다. 누가 공개 가입으로 <교실코드>-<n> 같은 아이디를 먼저 차지해
  -- 선생님의 계정 만들기를 막지 못하게, 학생 역할이 아닌 가입은 여기서 거절한다.
  if lower(new.email) like '%@students.invalid' and not is_student then
    raise exception 'students.invalid 주소는 선생님 화면에서만 만들 수 있어요.';
  end if;
  insert into public.profiles (id, name, role, login_id)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    case when is_student then 'student' else 'teacher' end,
    case when is_student and lower(new.email) like '%@students.invalid' then split_part(lower(new.email), '@', 1) end
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 3) 역할 바꾸기 막기 — "프로필 수정" 정책은 본인 행의 모든 열을 열어 둔다(학생이 스스로 강사가 될 수 있었다).
--    BEFORE UPDATE 트리거 대신 열 단위 권한을 고른다: 선언 한 줄이고, service role 은 영향을 받지 않으며,
--    앞으로 열이 늘어도 기본이 '못 바꿈' 이다. 본인이 바꿀 수 있는 건 이름뿐이다.
revoke update on table profiles from authenticated, anon;
grant update (name) on table profiles to authenticated;

-- 4) 교실 코드로 스스로 들어가기 없애기 — 수강은 선생님(서버)만 만든다.
drop policy if exists "수강 등록" on enrollments;
-- 코드로 교실을 찾는 함수는 스스로 들어가기에만 쓰였다 (js/data/supabase.js joinClassroom, 지금은 없음).
drop function if exists find_classroom_by_code(text);

-- 5) 기록 쓰기 — 본인 것이면서 그 교실의 구성원(강사 또는 수강 학생)일 때만.
--    교실 코드 스스로 들어가기를 없앴으니, 교실 id 만 알아서는 남의 교실에 기록을 넣지 못해야 한다.
--    is_classroom_member 는 20261001000001 의 것(강사 or 수강) — 강사 화면 경로는 그대로다.
drop policy if exists "학생 이벤트 저장" on student_events;
create policy "학생 이벤트 저장" on student_events for insert
  with check (auth.uid() = student_id and is_classroom_member(classroom_id));
