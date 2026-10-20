-- 나침반 (2026-10-21, docs/superpowers/specs/2026-10-20-compass-design.md).
-- 단계(levels)·근거·AI 문장은 선생님 화면 전용이라 RLS 를 켜고 정책을 두지 않는다 — 학생은 이 테이블을 읽을 수 없다.
-- 서버(api/compass.py)가 service role 로만 읽고 쓴다. 학생은 compass_mine 이 주는 네 열(바늘·방위·한마디·보낸 시각)만 본다.
create table if not exists compass (
  student_id uuid not null references profiles(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  levels jsonb not null,
  evidence jsonb not null,
  facts jsonb not null,
  ai_note text,
  needle_deg real,
  strongest text check (strongest in ('N', 'E', 'S', 'W')),
  teacher_dir text check (teacher_dir in ('N', 'E', 'S', 'W')),
  teacher_note text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, mission_id)
);
create index if not exists compass_classroom on compass (classroom_id);

alter table compass enable row level security;

-- 보낸 것만, 내 것만, 네 열만. (sent_at 이 null 이면 선생님이 아직 안 보낸 것 — 행이 있어도 0행)
create or replace function public.compass_mine(mid uuid)
returns table (needle_deg real, teacher_dir text, teacher_note text, sent_at timestamptz) as $$
  select c.needle_deg, c.teacher_dir, c.teacher_note, c.sent_at
    from compass c
   where c.student_id = auth.uid() and c.mission_id = mid and c.sent_at is not null;
$$ language sql stable security definer set search_path = public, pg_temp;

revoke all on function public.compass_mine(uuid) from public;
revoke execute on function public.compass_mine(uuid) from anon;
grant execute on function public.compass_mine(uuid) to authenticated;
