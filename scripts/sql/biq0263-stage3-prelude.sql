-- Disposable PostgreSQL only. Applied after migrations 068 and 069 and before 070.
-- Gives the shelf migration the workout columns that hosted Supabase already has.

alter table public.st_programs
  add column if not exists name text,
  add column if not exists status text;

alter table public.st_workouts
  add column if not exists week int,
  add column if not exists day_order int,
  add column if not exists day_label text,
  add column if not exists workout_type text,
  add column if not exists week_status text;

create table if not exists public.st_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.st_workouts(id) on delete cascade,
  sort_order int default 0,
  name text not null,
  muscle_group text,
  notes text,
  section text not null default 'strength',
  superset_group_id uuid,
  catalog_exercise_id uuid,
  equipment text,
  exercise_type text not null default 'strength',
  superset_label text,
  superset_order smallint,
  program_role text,
  measurement_type text,
  laterality text,
  created_at timestamptz not null default now()
);

create table if not exists public.st_planned_sets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.st_exercises(id) on delete cascade,
  sort_order int default 0,
  set_number int not null,
  set_type text not null default 'working',
  target_weight text,
  target_reps text,
  target_rpe text,
  is_deleted boolean default false,
  target_rir smallint,
  rest_seconds int,
  rep_min smallint,
  rep_max smallint,
  created_at timestamptz not null default now()
);

drop table if exists public.st_set_logs;
create table public.st_set_logs (
  id uuid primary key default gen_random_uuid(),
  planned_set_id uuid references public.st_planned_sets(id) on delete set null,
  exercise_id uuid,
  user_id uuid not null,
  log_date date not null,
  actual_weight text,
  actual_reps text,
  actual_duration text,
  actual_distance text,
  completed boolean default false,
  snapshot_catalog_exercise_id uuid,
  snapshot_equipment text,
  team_id uuid
);

drop table if exists public.st_training_expectations;
create table public.st_training_expectations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  program_id uuid,
  workout_id uuid,
  scheduled_date date
);

drop table if exists public.st_training_program_segments;
drop table if exists public.st_training_enrollments;
create table public.st_training_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  program_id uuid,
  team_id uuid,
  source_key text
);

create table public.st_training_program_segments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid,
  program_id uuid,
  starts_on date
);
