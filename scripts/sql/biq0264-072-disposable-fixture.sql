-- Disposable schema for BIQ-0264 Phase 2B.2. Not a migration. Not for hosted Supabase.
-- The node runner loads production functions after this file, then the trigger file, then migration 072.

create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to public;
grant execute on function auth.uid() to public;

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

create table if not exists public.st_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique,
  owner_user_id uuid references auth.users(id),
  default_program_id uuid,
  members_can_create_shared_workouts boolean not null default false,
  members_can_edit_shared_workouts boolean not null default false,
  members_can_assign_workouts boolean not null default false,
  members_can_view_member_progress boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.st_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('owner', 'manager', 'member')),
  status text not null default 'active',
  is_active_participant boolean not null default true,
  training_source text not null default 'team' check (training_source in ('team', 'personal')),
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table if not exists public.st_programs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id),
  team_id uuid references public.st_teams(id),
  visibility text,
  name text not null,
  weeks integer,
  cycle_length_weeks integer,
  start_date date,
  status text,
  created_at timestamptz not null default now()
);

create table if not exists public.st_workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.st_programs(id) on delete cascade,
  week integer not null,
  day_order integer not null default 0,
  day_label text not null,
  workout_type text not null
);

create table if not exists public.st_training_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null check (source_kind in ('personal', 'group')),
  source_key text not null,
  team_id uuid references public.st_teams(id) on delete cascade,
  program_id uuid references public.st_programs(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  schedule_visible boolean not null default false,
  expectation_enabled boolean not null default false,
  starts_on date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_key),
  check (
    (source_kind = 'personal' and team_id is null and source_key = 'personal')
    or (source_kind = 'group' and team_id is not null and source_key = ('group:' || team_id::text))
  )
);

create table if not exists public.st_training_program_segments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.st_training_enrollments(id) on delete cascade,
  program_id uuid not null references public.st_programs(id) on delete cascade,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create unique index if not exists st_training_program_segments_one_open
  on public.st_training_program_segments (enrollment_id)
  where ends_on is null;

create table if not exists public.st_workout_assignments (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.st_assignment_recipients (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.st_workout_assignments(id) on delete cascade
);

create table if not exists public.st_training_expectations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  team_id uuid references public.st_teams(id) on delete cascade,
  enrollment_id uuid references public.st_training_enrollments(id) on delete cascade,
  program_id uuid references public.st_programs(id) on delete set null,
  segment_id uuid references public.st_training_program_segments(id) on delete set null,
  workout_id uuid references public.st_workouts(id) on delete set null,
  assignment_id uuid references public.st_workout_assignments(id) on delete cascade,
  assignment_recipient_id uuid references public.st_assignment_recipients(id) on delete cascade,
  scheduled_date date not null,
  title text not null default 'Workout',
  day_label text,
  origin text not null check (origin in ('program', 'assignment')),
  excused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (origin = 'program' and enrollment_id is not null and workout_id is not null and assignment_recipient_id is null)
    or (origin = 'assignment' and assignment_recipient_id is not null)
  )
);

create unique index if not exists st_training_expectations_program_identity
  on public.st_training_expectations (user_id, source_key, workout_id, scheduled_date)
  where origin = 'program' and workout_id is not null;

create table if not exists public.st_workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  workout_id uuid,
  log_date date,
  status text,
  completed_at timestamptz,
  expectation_id uuid references public.st_training_expectations(id) on delete set null,
  source_key text,
  scheduled_date date
);

create table if not exists public.st_set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  team_id uuid,
  log_date date not null,
  actual_reps text
);

create table if not exists public.st_program_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  team_id uuid,
  program_id uuid,
  is_active boolean,
  assignment_type text,
  notes text
);

create table if not exists public.st_training_schedule_profiles (
  enrollment_id uuid primary key references public.st_training_enrollments(id) on delete cascade,
  mode text not null default 'program_days' check (mode in ('program_days', 'custom_weekdays')),
  weekdays text[] not null default '{}'::text[],
  cycle_anchor date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.st_training_schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.st_training_enrollments(id) on delete cascade,
  workout_id uuid not null,
  original_scheduled_date date not null,
  action text not null check (action in ('move', 'excuse')),
  new_scheduled_date date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (action <> 'move' or new_scheduled_date is not null),
  unique (enrollment_id, workout_id, original_scheduled_date, action)
);

create table if not exists public.st_group_activity_series (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.st_teams(id) on delete cascade,
  workout_id uuid,
  activity_type text,
  title text,
  start_date date,
  recurrence text,
  recurrence_until date,
  recurrence_weekdays smallint[] not null default '{}',
  ended_on date
);

create table if not exists public.st_group_activity_recipients (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.st_group_activity_series(id) on delete cascade,
  user_id uuid not null,
  removed_on date
);

create table if not exists public.st_group_activity_occurrences (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.st_group_activity_series(id) on delete cascade,
  user_id uuid not null,
  occurrence_date date not null,
  original_date date,
  status text not null default 'scheduled',
  workout_id uuid
);
