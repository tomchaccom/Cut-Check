-- 강사가 자기 교실에서 학생을 뺄 수 있게 한다 (2026-10-17 사람 요청 "교실에 등록된 학생을 삭제하는 것도 추가").
-- 지우는 것은 수강(enrollments) 한 줄뿐이다. 학생 계정과 기록(student_events)은 지우지 않는다 —
-- 되돌릴 수 없는 일은 하지 않는다. 다시 들어오면 교실 코드로 같은 줄이 생긴다.
create policy "강사 교실 학생 빼기" on enrollments for delete using (
  exists (select 1 from classrooms where id = classroom_id and teacher_id = auth.uid())
);
