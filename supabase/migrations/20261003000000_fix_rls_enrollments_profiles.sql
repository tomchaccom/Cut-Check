-- 강사가 enrollments와 profiles를 읽을 수 있도록 RLS 수정
-- 문제: enrollments SELECT가 student_id=auth.uid()만 허용 → 강사가 학생 목록/이름 못 읽음
-- 문제: profiles 조회 정책이 enrollments를 raw join → enrollments RLS에 막힘

-- enrollments: 강사도 자기 교실 학생 조회 가능
create policy "강사 교실 수강 조회" on enrollments for select using (
  exists (select 1 from classrooms where id = classroom_id and teacher_id = auth.uid())
);

-- profiles: is_classroom_member 사용으로 교체
drop policy if exists "프로필 조회" on profiles;
drop policy if exists "본인 프로필 조회" on profiles;

create policy "프로필 조회" on profiles for select using (
  auth.uid() = id
  or exists (
    select 1 from classrooms c
    where c.teacher_id = auth.uid()
    and exists (select 1 from enrollments e where e.classroom_id = c.id and e.student_id = profiles.id)
  )
);
