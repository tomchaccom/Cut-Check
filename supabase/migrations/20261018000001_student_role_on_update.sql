-- 학생 표시는 INSERT 뒤 UPDATE 로 온다 (2026-10-18).
-- GoTrue 의 admin 계정 만들기는 auth.users 에 provider 정보만 담아 INSERT 하고,
-- 요청한 app_metadata(role 'student')는 같은 트랜잭션의 다음 UPDATE 에서 넣는다.
-- 그래서 20261018000000 의 handle_new_user(AFTER INSERT)는 role 을 못 보고
-- @students.invalid 를 거절했다 → 운영에서 학생 계정 만들기가 전부 500.
-- 이미 적용된 마이그레이션은 고치지 않고 여기서 덮어쓴다.

-- 1) INSERT 트리거는 거절하지 않는다. 학생 표시가 INSERT 에 이미 있으면(앞으로 GoTrue 가 바뀌면) 그대로 학생.
--    공개 가입으로 @students.invalid 를 먼저 차지한 계정은 강사 행이 되고(login_id 없음),
--    api/_accounts.py 가 같은 아이디를 만들 때 그 계정을 지우고 다시 만든다.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  is_student boolean := coalesce(new.raw_app_meta_data->>'role', '') = 'student'
                        and lower(new.email) like '%@students.invalid';
begin
  insert into public.profiles (id, name, role, login_id)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    case when is_student then 'student' else 'teacher' end,
    case when is_student then split_part(lower(new.email), '@', 1) end
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 2) app_metadata 가 학생으로 바뀌는 순간 프로필을 학생으로. app_metadata 는 service role 키로만 쓸 수 있다.
--    GoTrue 의 같은 트랜잭션 안이라 admin 호출이 돌아오기 전에 login_id 가 채워진다.
create or replace function public.handle_student_role()
returns trigger as $$
begin
  insert into public.profiles (id, name, role, login_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'student',
    split_part(lower(new.email), '@', 1)
  )
  on conflict (id) do update set role = 'student', login_id = excluded.login_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_student_role on auth.users;
create trigger on_auth_user_student_role
  after update of raw_app_meta_data on auth.users
  for each row
  when (new.raw_app_meta_data->>'role' = 'student'
        and lower(new.email) like '%@students.invalid'
        and (old.raw_app_meta_data->>'role') is distinct from 'student')
  execute function public.handle_student_role();
