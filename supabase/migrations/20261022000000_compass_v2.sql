-- 나침반 2차 (2026-10-22, docs/superpowers/specs/2026-10-20-compass-v2-design.md).
-- 12칸 체크리스트 원본 판정(checks)과 튜터 질문 분류(tutor_dirs)만 저장한다. 점수·평균은 서버가 그때그때 계산한다.
-- 2차 행은 levels·evidence 를 쓰지 않으므로 NOT NULL 을 푼다. 1차 운영 데이터는 건드리지 않는다.
alter table compass add column if not exists checks jsonb;
alter table compass add column if not exists tutor_dirs jsonb;
alter table compass add column if not exists student_view jsonb;  -- { needle_deg, dir, length, sent_at } 학생에게 보낸 누적 바늘. send 때 서버가 최신 행에 쓴다
alter table compass alter column levels drop not null;
alter table compass alter column evidence drop not null;

-- 학생의 누적 나침반: student_view 가 있는 행 중 가장 최근 것 하나. 0행이면 "선생님이 곧 방향을 알려 주실 거예요."
-- checks · 점수 · 근거 인용 · AI 문장은 이 함수가 주지 않는다.
create or replace function public.compass_mine_v2()
returns table (needle_deg real, dir text, length real, sent_at timestamptz) as $$
  select (c.student_view->>'needle_deg')::real, c.student_view->>'dir',
         (c.student_view->>'length')::real, (c.student_view->>'sent_at')::timestamptz
    from compass c
   where c.student_id = auth.uid() and c.student_view is not null
   order by c.created_at desc
   limit 1;
$$ language sql stable security definer set search_path = public, pg_temp;

-- 미션별 선생님 한마디. 보낸 것만, 내 것만.
create or replace function public.compass_note(mid uuid)
returns table (teacher_note text, sent_at timestamptz) as $$
  select c.teacher_note, c.sent_at
    from compass c
   where c.student_id = auth.uid() and c.mission_id = mid and c.sent_at is not null;
$$ language sql stable security definer set search_path = public, pg_temp;

revoke all on function public.compass_mine_v2() from public;
revoke execute on function public.compass_mine_v2() from anon;
grant execute on function public.compass_mine_v2() to authenticated;
revoke all on function public.compass_note(uuid) from public;
revoke execute on function public.compass_note(uuid) from anon;
grant execute on function public.compass_note(uuid) to authenticated;
