"""알림 확인 마이그레이션(20261024000000_alert_checks.sql) — 선생님 본인 행 · 자기 교실만, 학생 · anon 은 못 읽고 못 쓴다.

  uv run --with-requirements requirements.txt python test/test_alert_checks.py

문장 검사는 늘 돈다. 이 컴퓨터에 PostgreSQL(initdb · pg_ctl)이 있으면 임시 DB 를 띄워 RLS 를 실제로 돌려 본다
(운영 DB 에는 닿지 않는다). 없으면 그 부분만 건너뛴다고 알린다.
"""
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIG = open(os.path.join(ROOT, 'supabase/migrations/20261024000000_alert_checks.sql'), encoding='utf-8').read()
fail = 0


def t(name, cond, extra=''):
    global fail
    print(('  ok  ' if cond else '  FAIL') + ' ' + name)
    if not cond:
        fail += 1
        if extra:
            print('       → ' + str(extra)[:400])


# ── 문장
t('RLS 를 켠다', 'alter table alert_checks enable row level security' in MIG)
t('정책은 본인 행 + 자기 교실 (using · with check 둘 다)',
  len(re.findall(r'teacher_id = auth\.uid\(\) and exists \(select 1 from classrooms where id = classroom_id and teacher_id = auth\.uid\(\)\)', MIG)) == 2)
t('키는 한 줄 — 선생님 · 교실 · 키가 기본 키', 'primary key (teacher_id, classroom_id, alert_key)' in MIG)
t('점수 · 순위 · 소요 시간 열이 없다', not re.search(r'\b(score|rank|duration|elapsed|percent)\b', MIG))
t('since 함수는 anon 이 못 부른다', 'revoke all on function public.alert_checks_since() from public, anon' in MIG)


# ── 임시 PostgreSQL 에서 RLS 를 실제로
def pgbin(name):
    p = shutil.which(name)
    if p:
        return p
    for d in ('/opt/homebrew/opt/postgresql@17/bin', '/opt/homebrew/opt/postgresql@16/bin', '/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin'):
        if os.path.exists(os.path.join(d, name)):
            return os.path.join(d, name)
    return None


STUB = """
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create table profiles (id uuid primary key references auth.users, name text, role text);
create table classrooms (id uuid primary key, teacher_id uuid references profiles(id));
grant all on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
insert into profiles values ('00000000-0000-0000-0000-00000000000a', '김', 'teacher'), ('00000000-0000-0000-0000-00000000000b', '이', 'teacher'), ('00000000-0000-0000-0000-00000000000c', '태인', 'student');
insert into classrooms values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b');
"""
A, B, S = '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c'
RA, RB = '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1'

initdb, pg_ctl, psql = pgbin('initdb'), pgbin('pg_ctl'), pgbin('psql')
if not (initdb and pg_ctl and psql):
    print('  --   PostgreSQL 이 없어 RLS 실제 검사는 건너뛴다')
else:
    d = tempfile.mkdtemp(prefix='alertchecks-')
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    try:
        subprocess.run([initdb, '-D', d + '/db', '-U', 'postgres', '-A', 'trust'], check=True, capture_output=True)
        subprocess.run([pg_ctl, '-D', d + '/db', '-l', d + '/log', '-o', f'-p {port} -k {d} -c listen_addresses=', '-w', 'start'], check=True, capture_output=True)

        def sql(q, role=None, uid=None):
            pre = ''
            if role:
                pre = f"set role {role}; select set_config('request.jwt.claim.sub', '{uid or ''}', false);\n"
            r = subprocess.run([psql, '-h', d, '-p', str(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', pre + q],
                               capture_output=True, text=True)
            return r.returncode, (r.stdout.strip().splitlines() or [''])[-1], r.stderr

        t('가짜 auth · 교실 준비', sql(STUB)[0] == 0)
        rc, _, err = sql(MIG)
        t('마이그레이션이 에러 없이 적용된다', rc == 0, err)
        rc, since, _ = sql('select alert_checks_since()', 'authenticated', A)
        body = sql("select prosrc from pg_proc where proname = 'alert_checks_since'")[1]
        t('since 는 적용한 시각을 박은 상수 — 부를 때마다 now() 가 아니다',
          rc == 0 and re.match(r'^\d{4}-\d\d-\d\d ', since) and 'now' not in body and since[:10] in body, (since, body))
        t('anon 은 since 를 못 부른다', sql('select alert_checks_since()', 'anon')[0] != 0)

        ins = "insert into alert_checks (classroom_id, alert_key) values ('{r}', '{k}') on conflict (teacher_id, classroom_id, alert_key) do nothing"
        t('선생님 A — 자기 교실에 확인을 남긴다(teacher_id 는 기본값)', sql(ins.format(r=RA, k='s1/finish:m1'), 'authenticated', A)[0] == 0)
        t('같은 키를 또 눌러도 한 줄', sql(ins.format(r=RA, k='s1/finish:m1'), 'authenticated', A)[0] == 0 and sql('select count(*) from alert_checks')[1] == '1')
        t('선생님 A — 남의 교실(B)에는 못 남긴다', sql(ins.format(r=RB, k='x'), 'authenticated', A)[0] != 0)
        t('선생님 A — teacher_id 를 B 로 속여도 못 남긴다',
          sql(f"insert into alert_checks (teacher_id, classroom_id, alert_key) values ('{B}', '{RA}', 'y')", 'authenticated', A)[0] != 0)
        t('선생님 A 는 자기 것을 읽는다', sql('select alert_key from alert_checks', 'authenticated', A)[1] == 's1/finish:m1')
        t('선생님 B 는 A 의 것을 못 읽는다', sql('select count(*) from alert_checks', 'authenticated', B)[1] == '0')
        t('학생은 못 읽는다', sql('select count(*) from alert_checks', 'authenticated', S)[1] == '0')
        t('학생은 못 쓴다', sql(ins.format(r=RA, k='z'), 'authenticated', S)[0] != 0)
        t('anon 은 못 읽는다', sql('select count(*) from alert_checks', 'anon')[0] != 0)
        sql(f"update alert_checks set alert_key = 'hacked'", 'authenticated', B)
        sql('delete from alert_checks', 'authenticated', S)
        t('B · 학생의 고치기 · 지우기는 아무것도 못 바꾼다', sql('select alert_key from alert_checks')[1] == 's1/finish:m1')
        sql('delete from classrooms where id = \'%s\'' % RA)
        t('교실을 지우면 확인도 함께 지워진다', sql('select count(*) from alert_checks')[1] == '0')
    finally:
        subprocess.run([pg_ctl, '-D', d + '/db', '-m', 'immediate', 'stop'], capture_output=True)
        shutil.rmtree(d, ignore_errors=True)

print(('\n실패 %d건' % fail) if fail else '\n전부 통과')
sys.exit(1 if fail else 0)
