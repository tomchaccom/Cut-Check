-- Cut & Check — Supabase DB 스키마
-- Supabase SQL Editor에서 실행

-- 프로필 (Supabase Auth와 연결)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  role text not null check (role in ('teacher', 'student')),
  created_at timestamptz default now()
);

-- 교실
create table if not exists classrooms (
  id uuid default gen_random_uuid() primary key,
  code text unique not null,
  name text not null,
  teacher_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now()
);

-- 수강 (학생 ↔ 교실)
create table if not exists enrollments (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references profiles(id) on delete cascade not null,
  classroom_id uuid references classrooms(id) on delete cascade not null,
  joined_at timestamptz default now(),
  unique(student_id, classroom_id)
);

-- 미션 (강사가 생성하거나 API로 자동 생성)
create table if not exists missions (
  id uuid default gen_random_uuid() primary key,
  classroom_id uuid references classrooms(id) on delete cascade not null,
  data jsonb not null,  -- SENTENCE_MISSIONS 형식 그대로
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- 학생 이벤트 (기존 localStorage 구조를 서버로)
create table if not exists student_events (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references profiles(id) on delete cascade not null,
  classroom_id uuid references classrooms(id) on delete cascade not null,
  mission_id uuid references missions(id) on delete set null,
  event jsonb not null,  -- CC.events.make() 결과 그대로
  created_at timestamptz default now()
);

-- RLS 정책
alter table profiles enable row level security;
alter table classrooms enable row level security;
alter table enrollments enable row level security;
alter table missions enable row level security;
alter table student_events enable row level security;

-- 프로필: 본인만 읽기/쓰기
create policy "본인 프로필 조회" on profiles for select using (auth.uid() = id);
create policy "본인 프로필 생성" on profiles for insert with check (auth.uid() = id);

-- 교실: 강사는 자기 교실, 학생은 수강 중인 교실
create policy "강사 교실 관리" on classrooms for all using (auth.uid() = teacher_id);
create policy "학생 교실 조회" on classrooms for select using (
  exists (select 1 from enrollments where student_id = auth.uid() and classroom_id = classrooms.id)
);

-- 수강: 본인 수강만
create policy "수강 조회" on enrollments for select using (auth.uid() = student_id);
create policy "수강 등록" on enrollments for insert with check (auth.uid() = student_id);

-- 미션: 교실 참여자 모두 조회
create policy "미션 조회" on missions for select using (
  exists (select 1 from classrooms where id = classroom_id and teacher_id = auth.uid())
  or exists (select 1 from enrollments where student_id = auth.uid() and classroom_id = missions.classroom_id)
);
create policy "강사 미션 생성" on missions for insert with check (
  exists (select 1 from classrooms where id = classroom_id and teacher_id = auth.uid())
);

-- 이벤트: 학생은 본인 것만, 강사는 교실 전체
create policy "학생 이벤트 저장" on student_events for insert with check (auth.uid() = student_id);
create policy "학생 본인 이벤트 조회" on student_events for select using (auth.uid() = student_id);
create policy "강사 교실 이벤트 조회" on student_events for select using (
  exists (select 1 from classrooms where id = classroom_id and teacher_id = auth.uid())
);

-- 교실 코드로 조회할 수 있는 함수 (수강 전 학생도 코드로 교실을 찾을 수 있어야)
create or replace function find_classroom_by_code(join_code text)
returns table(id uuid, name text, code text) as $$
  select id, name, code from classrooms where code = join_code;
$$ language sql security definer;
