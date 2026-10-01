-- 학생이 미션을 조회할 때 enrollments RLS가 서브쿼리를 방해하는 문제 수정
-- security definer 함수로 수강 확인을 우회

create or replace function is_classroom_member(cid uuid)
returns boolean as $$
  select exists(
    select 1 from classrooms where id = cid and teacher_id = auth.uid()
  ) or exists(
    select 1 from enrollments where classroom_id = cid and student_id = auth.uid()
  );
$$ language sql security definer stable;

-- 기존 미션 조회 정책 교체
drop policy if exists "미션 조회" on missions;
create policy "미션 조회" on missions for select using (
  is_classroom_member(classroom_id)
);
