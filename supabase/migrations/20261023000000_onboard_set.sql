-- 레벨 테스트 문제지 하·중·상 (2026-10-20 사람이 정함 "레벨 테스트를 상/중/하로 미리 만들어 두고, 강사가 학생에게 레벨테스트 지정시 할당").
-- 지정할 때 고른 문제지를 수강 한 줄에 적는다. 비어 있으면 중(mid) — 지정 없는 첫 입장도 중.
-- 점수·레벨은 저장하지 않는다: 기록(student_events)에는 문제지 이름과 학생 답만 있고, 맞음은 강사 화면이 푼다.
alter table enrollments add column if not exists onboard_set text
  check (onboard_set in ('low', 'mid', 'high'));

-- assign_onboard 와 같은 확인(강사 본인 교실) + 문제지. 매개변수 이름은 qset — set 은 SQL 낱말이라 update ... set 과 헷갈린다.
-- 옛 assign_onboard 는 남겨 둔다: 배포 사이에 옛 화면이 부를 수 있다.
create or replace function public.assign_onboard2(cid uuid, sid uuid, assign boolean, qset text)
returns timestamptz as $$
declare
  due timestamptz := case when assign then now() end;
begin
  update enrollments set onboard_due = due, onboard_set = case when assign then coalesce(qset, 'mid') end
   where classroom_id = cid and student_id = sid
     and exists (select 1 from classrooms where id = cid and teacher_id = auth.uid());
  if not found then raise exception '이 교실의 학생이 아니에요.'; end if;
  return due;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function public.assign_onboard2(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.assign_onboard2(uuid, uuid, boolean, text) to authenticated;
