-- 선생님 알림 확인 (2026-10-22 사람 피드백 "알림이 새로고침하니까 사라짐. DB에 저장해서 확인여부로 삭제").
-- 알림 자체는 저장하지 않는다 — 화면이 학생 기록에서 그때 계산한다(js/core/alerts.js). 여기는 '확인했다'는 키만.
-- alert_key = '<학생 id>/<종류>:<미션 등>' (CC.alerts.keyOf). 점수 · 순위 · 소요 시간은 담지 않는다.
-- 선생님 본인 행만, 자기 교실만. 학생은 그 교실의 teacher_id 가 아니므로 읽지도 쓰지도 못한다.
create table if not exists alert_checks (
  teacher_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  alert_key text not null check (length(alert_key) between 1 and 300),
  checked_at timestamptz not null default now(),
  primary key (teacher_id, classroom_id, alert_key)
);

alter table alert_checks enable row level security;
revoke all on alert_checks from anon;

create policy "강사 알림 확인" on alert_checks for all to authenticated
  using (teacher_id = auth.uid() and exists (select 1 from classrooms where id = classroom_id and teacher_id = auth.uid()))
  with check (teacher_id = auth.uid() and exists (select 1 from classrooms where id = classroom_id and teacher_id = auth.uid()));

-- 이 마이그레이션을 적용한 시각. 그 전에 생긴 일은 확인한 것으로 친다 — 첫 배포 날 몇 주 치 알림이 쏟아지지 않게.
-- 적용할 때의 now() 를 함수 본문에 상수로 박는다(다시 적용하지 않는 한 바뀌지 않는다).
do $$
begin
  execute format(
    'create or replace function public.alert_checks_since() returns timestamptz language sql immutable as %L',
    format('select %L::timestamptz', now()));
end $$;

revoke all on function public.alert_checks_since() from public, anon;
grant execute on function public.alert_checks_since() to authenticated;
