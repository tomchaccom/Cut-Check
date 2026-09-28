-- 회원가입 시 프로필 생성이 RLS에 막히는 문제 수정
-- 원인: signUp 직후 insert 시점에 auth.uid()는 있지만 profiles 행이 아직 없어서
--       "본인 프로필 생성" 정책이 작동하더라도 Supabase의 insert 타이밍 이슈 발생

-- 기존 정책 제거
drop policy if exists "본인 프로필 생성" on profiles;
drop policy if exists "본인 프로필 조회" on profiles;

-- 프로필은 트리거로 자동 생성하고, 클라이언트 직접 insert를 없앤다
-- auth.users에 행이 생기면 profiles에도 자동으로 만들어짐
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', '이름 없음'),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$$ language plpgsql security definer;

-- 기존 트리거가 있으면 제거
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 프로필 조회: 본인 + 같은 교실 강사
create policy "프로필 조회" on profiles for select using (
  auth.uid() = id
  or exists (
    select 1 from classrooms c
    join enrollments e on e.classroom_id = c.id
    where c.teacher_id = auth.uid() and e.student_id = profiles.id
  )
);

-- 프로필 수정: 본인만
create policy "프로필 수정" on profiles for update using (auth.uid() = id);
