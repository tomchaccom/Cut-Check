-- 강사가 자기 교실의 미션을 수정/삭제할 수 있도록 RLS 정책 추가
create policy "강사 미션 수정" on missions for update using (
  exists (select 1 from classrooms where id = classroom_id and teacher_id = auth.uid())
);
create policy "강사 미션 삭제" on missions for delete using (
  exists (select 1 from classrooms where id = classroom_id and teacher_id = auth.uid())
);
