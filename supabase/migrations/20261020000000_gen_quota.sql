-- 강사별 미션 생성 한도 (2026-10-20, docs/superpowers/specs/2026-10-20-admin-quota-design.md).
-- "차감 시점: 성공했을 때만" — AI 호출 전에 1을 예약하고 실패하면 돌려준다. 먼저 확인하고 나중에 빼면
-- 동시에 두 번 누를 때 한도를 넘으므로, 예약은 조건부 update 한 번으로 원자적으로 올린다.
-- 세 테이블 모두 RLS 켜고 정책 없음 → anon · authenticated 는 못 본다. 서버가 service role 로만 부른다.

create table if not exists gen_settings (
  id int primary key check (id = 1),
  default_quota int not null default 3 check (default_quota >= 0)
);
insert into gen_settings (id) values (1) on conflict do nothing;

-- 행이 없으면 첫 예약 때 default_quota 로 만든다 — 기존 · 신규 강사가 같은 규칙.
create table if not exists gen_quota (
  teacher_id uuid primary key references profiles(id) on delete cascade,
  quota int not null check (quota >= 0),
  used int not null default 0 check (used >= 0),
  disabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 성공한 생성만 남는다. id 가 재요청 ticket — 추측할 수 없고 강사 id 와 대조하므로 서명 비밀값을 두지 않는다.
create table if not exists gen_log (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('step', 'quick')),
  lesson text,
  concept text,
  retries int not null default 0,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists gen_log_created_at on gen_log (created_at desc);

alter table gen_settings enable row level security;
alter table gen_quota enable row level security;
alter table gen_log enable row level security;

-- 예약 → 남은 수. 못 올리면 -1 (0개 · 꺼짐).
-- insert … on conflict do nothing 을 먼저: 동시에 두 요청이 와도 행은 하나, 차감은 아래 update 의 행 잠금이 줄 세운다.
create or replace function public.gen_reserve(tid uuid)
returns int as $$
declare
  n int;
begin
  insert into gen_quota (teacher_id, quota)
  values (tid, coalesce((select default_quota from gen_settings where id = 1), 3))
  on conflict (teacher_id) do nothing;
  update gen_quota set used = used + 1, updated_at = now()
   where teacher_id = tid and not disabled and used < quota
  returning quota - used into n;
  return coalesce(n, -1);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;  -- pg_temp 를 끝에: 임시 스키마의 같은 이름 테이블이 앞서지 않게

-- 예약 후 생성이 실패하면 돌려준다. 음수가 되지 않게.
create or replace function public.gen_refund(tid uuid)
returns void as $$
  update gen_quota set used = greatest(0, used - 1), updated_at = now() where teacher_id = tid;
$$ language sql security definer set search_path = public, pg_temp;

-- 재요청: 그 ticket 이 이 강사의 것이고 재요청 < 2 일 때만 차감 없이 +1.
create or replace function public.gen_retry(tid uuid, ticket uuid)
returns boolean as $$
begin
  update gen_log set retries = retries + 1 where id = ticket and teacher_id = tid and retries < 2;
  return found;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 성공한 생성 한 줄 → ticket. 수업 내용은 앞 200자만.
create or replace function public.gen_record(tid uuid, kind text, lesson text, concept text, model text)
returns uuid as $$
  insert into gen_log (teacher_id, kind, lesson, concept, model)
  values (tid, gen_record.kind, left(gen_record.lesson, 200), gen_record.concept, gen_record.model)
  returning id;
$$ language sql security definer set search_path = public, pg_temp;

-- 남은 수를 보여줄 때 — 행이 없으면 만들지 않고 기본값으로 계산한다.
create or replace function public.gen_left(tid uuid)
returns table (quota int, used int, disabled boolean) as $$
  select coalesce(q.quota, s.default_quota), coalesce(q.used, 0), coalesce(q.disabled, false)
    from gen_settings s left join gen_quota q on q.teacher_id = tid
   where s.id = 1;
$$ language sql stable security definer set search_path = public, pg_temp;

revoke execute on function public.gen_reserve(uuid) from public, anon, authenticated;
revoke execute on function public.gen_refund(uuid) from public, anon, authenticated;
revoke execute on function public.gen_retry(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.gen_record(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.gen_left(uuid) from public, anon, authenticated;
grant execute on function public.gen_reserve(uuid) to service_role;
grant execute on function public.gen_refund(uuid) to service_role;
grant execute on function public.gen_retry(uuid, uuid) to service_role;
grant execute on function public.gen_record(uuid, text, text, text, text) to service_role;
grant execute on function public.gen_left(uuid) to service_role;
