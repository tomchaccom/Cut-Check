-- 레벨 테스트 대상자 지정 (2026-10-19 사람 요청 "학생 계정에 내가 테스트 대상자로 할당하면 다음 로그인에 무조건 레벨 테스트").
-- 지정한 시각을 수강 한 줄에 적는다. 학생은 그 시각보다 늦은 진단 기록(student_events.created_at)이 없으면
-- 교실 목록을 열자마자 테스트를 본다. 둘 다 서버 시각이라 기기 시계가 틀려도 어긋나지 않는다.
-- 학생이 지정을 지울 일이 없도록 "끝났다" 를 따로 쓰지 않는다 — 기록이 생기면 끝난 것이다.
alter table enrollments add column if not exists onboard_due timestamptz;

-- 열 단위 update 정책 대신 함수 하나: 시각을 now() 로 서버가 찍고, 강사 본인 교실인지 여기서 본다.
create or replace function public.assign_onboard(cid uuid, sid uuid, assign boolean)
returns timestamptz as $$
declare
  due timestamptz := case when assign then now() end;
begin
  update enrollments set onboard_due = due
   where classroom_id = cid and student_id = sid
     and exists (select 1 from classrooms where id = cid and teacher_id = auth.uid());
  if not found then raise exception '이 교실의 학생이 아니에요.'; end if;
  return due;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.assign_onboard(uuid, uuid, boolean) from public, anon;
grant execute on function public.assign_onboard(uuid, uuid, boolean) to authenticated;
