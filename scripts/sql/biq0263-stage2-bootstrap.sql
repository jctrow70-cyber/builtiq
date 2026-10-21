-- Disposable PostgreSQL only. This is not a Supabase migration.
-- It builds the smallest Stage 1 dependencies so migrations 068 and 069 can run unchanged.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to anon, authenticated;

create table public.st_teams (
  id uuid primary key,
  name text not null,
  owner_user_id uuid,
  members_can_create_shared_workouts boolean not null default false,
  members_can_edit_shared_workouts boolean not null default false,
  members_can_assign_workouts boolean not null default false,
  members_can_view_member_progress boolean not null default false
);

create table public.st_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  display_name text
);

create table public.st_programs (
  id uuid primary key,
  team_id uuid references public.st_teams(id) on delete cascade,
  visibility text,
  owner_user_id uuid
);

create table public.st_workouts (
  id uuid primary key,
  program_id uuid references public.st_programs(id) on delete cascade,
  name text
);

create table public.st_training_expectations (id int primary key);
create table public.st_training_enrollments (id int primary key);
create table public.st_workout_sessions (id int primary key);
create table public.st_set_logs (id int primary key);
create table public.st_user_calendar_activities (id int primary key);
insert into public.st_training_expectations values (1);
insert into public.st_training_enrollments values (1);
insert into public.st_workout_sessions values (1);
insert into public.st_set_logs values (1);
insert into public.st_user_calendar_activities values (1);

create or replace function public.st_user_can_edit_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'manager', 'editor')
      and m.status = 'active'
  );
$$;

create or replace function public.st_member_has_group_flag(p_team_id uuid, p_flag text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_team_members m
    join public.st_teams t on t.id = m.team_id
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'member'
      and (
        (p_flag = 'create' and coalesce(t.members_can_create_shared_workouts, false))
        or (p_flag = 'edit' and coalesce(t.members_can_edit_shared_workouts, false))
        or (p_flag = 'assign' and coalesce(t.members_can_assign_workouts, false))
        or (p_flag = 'progress' and coalesce(t.members_can_view_member_progress, false))
      )
  );
$$;

create or replace function public.st_user_can_assign_in_group(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_team_id is not null
    and (
      public.st_user_can_edit_team(p_team_id)
      or public.st_member_has_group_flag(p_team_id, 'assign')
    );
$$;

create or replace function public.st_user_can_view_group_progress(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_team_id is not null
    and (
      public.st_user_can_edit_team(p_team_id)
      or public.st_member_has_group_flag(p_team_id, 'progress')
    );
$$;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000005');

insert into public.st_teams (
  id, name, owner_user_id, members_can_assign_workouts, members_can_view_member_progress
) values
  ('10000000-0000-4000-8000-000000000001', 'Team A', '00000000-0000-4000-8000-000000000001', false, false),
  ('10000000-0000-4000-8000-000000000002', 'Team B', '00000000-0000-4000-8000-000000000001', true, false);

insert into public.st_team_members (team_id, user_id, role, status, display_name) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'owner', 'active', 'Owner'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'manager', 'active', 'Manager'),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'member', 'active', 'Member'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'owner', 'active', 'Owner'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', 'member', 'active', 'Assigner');

insert into public.st_programs (id, team_id, visibility, owner_user_id) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'team', '00000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'team', '00000000-0000-4000-8000-000000000001');

insert into public.st_workouts (id, program_id, name) values
  ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Stage one'),
  ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'Weekly'),
  ('20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'Move'),
  ('20000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'Overlap'),
  ('20000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000001', 'Month'),
  ('20000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000001', 'Year'),
  ('20000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000001', 'Split'),
  ('20000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000001', 'Rollback'),
  ('20000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000001', 'Series edit'),
  ('20000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000001', 'Skip'),
  ('20000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000002', 'Assign'),
  ('20000000-0000-4000-8000-000000000099', '30000000-0000-4000-8000-000000000001', 'Concurrent');
