-- BIQ-0141 Science Engine foundation
-- Additive only. Does not drop programs, workouts, or set-log history.

-- ---------------------------------------------------------------------------
-- 1. Versioned science rules
-- ---------------------------------------------------------------------------

create table if not exists public.st_science_rule_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  effective_date date not null default current_date,
  rules_json jsonb not null default '{}'::jsonb,
  evidence_json jsonb not null default '[]'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.st_science_rule_versions is
  'Versioned BuiltIQ programming rules. Historical programs keep the version used at creation.';

insert into public.st_science_rule_versions (version, effective_date, rules_json, evidence_json, active)
values (
  '1.0.0',
  current_date,
  '{"primaryContribution":1,"secondaryContribution":0.5,"priorityMultiplier":{"high_priority":1.2,"normal":1,"maintenance":0.6}}'::jsonb,
  '[{"topic":"volume_dose_response"},{"topic":"proximity_to_failure"},{"topic":"dynamic_warmup"},{"topic":"potentiation"}]'::jsonb,
  true
)
on conflict (version) do nothing;

alter table public.st_science_rule_versions enable row level security;

drop policy if exists "science_rule_versions_select" on public.st_science_rule_versions;
create policy "science_rule_versions_select" on public.st_science_rule_versions
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. Training profile (extends st_profiles without replacing it)
-- ---------------------------------------------------------------------------

create table if not exists public.st_training_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  primary_goal text,
  secondary_goal text,
  experience_level text,
  training_days_per_week int,
  preferred_session_minutes int default 60,
  available_equipment text[] default '{}',
  preferred_exercises text[] default '{}',
  excluded_exercises text[] default '{}',
  injury_limitations text[] default '{}',
  pain_areas text[] default '{}',
  priority_muscles text[] default '{}',
  low_priority_muscles text[] default '{}',
  training_style_preference text,
  warmup_style text not null default 'dynamic',
  warmup_duration text not null default 'standard',
  potentiation_preference text not null default 'automatic',
  age int,
  sex_optional text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.st_training_profiles is
  'Science-engine training preferences. st_profiles remains the account/onboarding record.';

alter table public.st_training_profiles enable row level security;

drop policy if exists "training_profiles_select" on public.st_training_profiles;
create policy "training_profiles_select" on public.st_training_profiles
  for select using (user_id = auth.uid());

drop policy if exists "training_profiles_insert" on public.st_training_profiles;
create policy "training_profiles_insert" on public.st_training_profiles
  for insert with check (user_id = auth.uid());

drop policy if exists "training_profiles_update" on public.st_training_profiles;
create policy "training_profiles_update" on public.st_training_profiles
  for update using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Program science version + planned-set RIR
-- ---------------------------------------------------------------------------

alter table public.st_programs
  add column if not exists science_version text;

comment on column public.st_programs.science_version is
  'Science engine version used when this program was created.';

alter table public.st_planned_sets
  add column if not exists target_rir smallint,
  add column if not exists rest_seconds int,
  add column if not exists rep_min smallint,
  add column if not exists rep_max smallint;

alter table public.st_set_logs
  add column if not exists actual_rir smallint,
  add column if not exists pain_score smallint;

-- ---------------------------------------------------------------------------
-- 4. Exercise performance decisions (does not replace st_set_logs)
-- ---------------------------------------------------------------------------

create table if not exists public.st_exercise_performance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid references public.st_programs(id) on delete set null,
  workout_id uuid references public.st_workouts(id) on delete set null,
  exercise_id uuid references public.st_exercises(id) on delete set null,
  catalog_exercise_id uuid references public.st_exercise_catalog(id) on delete set null,
  performed_at date not null default current_date,
  prescribed_sets int,
  rep_min smallint,
  rep_max smallint,
  target_rir smallint,
  completed_sets int,
  average_load numeric,
  average_reps numeric,
  average_rir numeric,
  estimated_1rm numeric,
  pain_score smallint,
  performance_score numeric,
  progression_decision text,
  progression_reason text,
  created_at timestamptz not null default now()
);

alter table public.st_exercise_performance enable row level security;

drop policy if exists "exercise_performance_select" on public.st_exercise_performance;
create policy "exercise_performance_select" on public.st_exercise_performance
  for select using (user_id = auth.uid());

drop policy if exists "exercise_performance_write" on public.st_exercise_performance;
create policy "exercise_performance_write" on public.st_exercise_performance
  for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Weekly muscle targets + reviews
-- ---------------------------------------------------------------------------

create table if not exists public.st_muscle_weekly_targets (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.st_programs(id) on delete cascade,
  week_number int not null check (week_number >= 1),
  muscle_group text not null,
  target_sets numeric not null,
  priority text not null default 'normal',
  created_at timestamptz not null default now()
);

create index if not exists st_muscle_weekly_targets_program_idx
  on public.st_muscle_weekly_targets (program_id, week_number);

alter table public.st_muscle_weekly_targets enable row level security;

drop policy if exists "muscle_weekly_targets_select" on public.st_muscle_weekly_targets;
create policy "muscle_weekly_targets_select" on public.st_muscle_weekly_targets
  for select using (public.st_user_can_read_program(program_id));

drop policy if exists "muscle_weekly_targets_write" on public.st_muscle_weekly_targets;
create policy "muscle_weekly_targets_write" on public.st_muscle_weekly_targets
  for insert with check (
    exists (
      select 1 from public.st_programs p
      where p.id = program_id
        and (p.owner_user_id = auth.uid() or public.st_user_can_edit_team(p.team_id))
    )
  );

create table if not exists public.st_weekly_training_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid references public.st_programs(id) on delete set null,
  week_number int,
  status text not null,
  review_json jsonb not null default '{}'::jsonb,
  deload_recommended boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.st_weekly_training_reviews enable row level security;

drop policy if exists "weekly_reviews_select" on public.st_weekly_training_reviews;
create policy "weekly_reviews_select" on public.st_weekly_training_reviews
  for select using (user_id = auth.uid());

drop policy if exists "weekly_reviews_write" on public.st_weekly_training_reviews;
create policy "weekly_reviews_write" on public.st_weekly_training_reviews
  for insert with check (user_id = auth.uid());

create table if not exists public.st_workout_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid references public.st_workouts(id) on delete set null,
  log_date date not null default current_date,
  session_difficulty smallint,
  energy smallint,
  muscle_soreness smallint,
  warmup_feel text,
  target_muscles_ready boolean,
  sleep_quality smallint,
  stress smallint,
  motivation smallint,
  created_at timestamptz not null default now()
);

alter table public.st_workout_feedback enable row level security;

drop policy if exists "workout_feedback_own" on public.st_workout_feedback;
create policy "workout_feedback_own" on public.st_workout_feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
