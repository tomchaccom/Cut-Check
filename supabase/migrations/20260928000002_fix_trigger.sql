-- 트리거 함수 수정: raw_user_meta_data가 비어있어도 프로필 생성
-- Supabase signUp의 options.data는 raw_user_meta_data에 들어가지만
-- 이메일 확인 끄면 메타데이터 구조가 다를 수 있음

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- 기존 유저 중 프로필 없는 사람 보충
insert into public.profiles (id, name, role)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'name', split_part(u.email::text, '@', 1)),
  coalesce(u.raw_user_meta_data->>'role', 'student')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
