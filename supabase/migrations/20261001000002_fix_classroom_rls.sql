-- 학생이 자기 교실 정보를 조회할 수 있도록 RLS 수정
-- 기존 "학생 교실 조회" 정책도 enrollments 서브쿼리가 RLS에 막힘

drop policy if exists "학생 교실 조회" on classrooms;
create policy "교실 참여자 조회" on classrooms for select using (
  is_classroom_member(id)
);
