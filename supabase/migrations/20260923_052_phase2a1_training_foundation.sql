-- BIQ-0217 Phase 2A.1 training data foundation
-- Additive only. Does not drop programs, workouts, or set-log history.
-- Does NOT implement automatic progression.
-- REVIEW BEFORE APPLYING.

-- ---------------------------------------------------------------------------
-- 1. Prescription metadata on exercises
-- ---------------------------------------------------------------------------

alter table public.st_exercises
  add column if not exists program_role text,
  add column if not exists measurement_type text,
  add column if not exists laterality text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'st_exercises_program_role_check'
      and conrelid = 'public.st_exercises'::regclass
  ) then
    alter table public.st_exercises
      add constraint st_exercises_program_role_check
      check (program_role is null or program_role in (
        'primary', 'secondary', 'accessory', 'isolation', 'warmup', 'power', 'conditioning'
      ));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'st_exercises_measurement_type_check'
      and conrelid = 'public.st_exercises'::regclass
  ) then
    alter table public.st_exercises
      add constraint st_exercises_measurement_type_check
      check (measurement_type is null or measurement_type in ('reps', 'time', 'distance'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'st_exercises_laterality_check'
      and conrelid = 'public.st_exercises'::regclass
  ) then
    alter table public.st_exercises
      add constraint st_exercises_laterality_check
      check (laterality is null or laterality in ('bilateral', 'unilateral', 'alternating'));
  end if;
end $$;

comment on column public.st_exercises.program_role is
  'Session role copied from the science prescription. Null on historical rows.';
comment on column public.st_exercises.measurement_type is
  'reps | time | distance. Null on historical rows; do not backfill.';
comment on column public.st_exercises.laterality is
  'bilateral | unilateral | alternating. Null on historical rows; do not backfill.';

-- ---------------------------------------------------------------------------
-- 2. Planned-vs-performed snapshots on set logs
-- ---------------------------------------------------------------------------

alter table public.st_set_logs
  add column if not exists snapshot_target_rir smallint,
  add column if not exists snapshot_rep_min smallint,
  add column if not exists snapshot_rep_max smallint,
  add column if not exists snapshot_program_role text,
  add column if not exists snapshot_rest_seconds int,
  add column if not exists exercise_id uuid references public.st_exercises(id) on delete set null;

comment on column public.st_set_logs.snapshot_target_rir is
  'Planned RIR at log time. Null on historical logs; never fabricated.';
comment on column public.st_set_logs.exercise_id is
  'Exercise for extra-set logs and orphaned planned-set logs.';

-- ---------------------------------------------------------------------------
-- 3. Week status
-- ---------------------------------------------------------------------------

alter table public.st_workouts
  add column if not exists week_status text;

update public.st_workouts
set week_status = case
  when coalesce(week, 1) <= 1 then 'activated'
  else 'template'
end
where week_status is null or week_status = '';

alter table public.st_workouts
  alter column week_status set default 'activated';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'st_workouts_week_status_check'
      and conrelid = 'public.st_workouts'::regclass
  ) then
    alter table public.st_workouts
      add constraint st_workouts_week_status_check
      check (week_status in ('template', 'activated', 'in_progress', 'completed', 'locked'));
  end if;
end $$;

comment on column public.st_workouts.week_status is
  'template = copied later week; activated = available to train. Historical week 1 is activated, not rewritten from logs.';

-- ---------------------------------------------------------------------------
-- 4. Session + exercise outcomes
-- ---------------------------------------------------------------------------

create table if not exists public.st_workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.st_workouts(id) on delete cascade,
  program_id uuid references public.st_programs(id) on delete set null,
  log_date date not null,
  status text not null default 'not_started',
  skip_reason text,
  completed_at timestamptz,
  duration_minutes int,
  feedback_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint st_workout_sessions_status_check
    check (status in ('not_started', 'in_progress', 'completed', 'partial', 'skipped')),
  constraint st_workout_sessions_unique unique (user_id, workout_id, log_date)
);

comment on table public.st_workout_sessions is
  'Explicit personal workout outcome. skipped is never inferred from empty set logs.';

create index if not exists st_workout_sessions_user_date_idx
  on public.st_workout_sessions (user_id, log_date);

alter table public.st_workout_sessions enable row level security;

drop policy if exists "workout_sessions_own" on public.st_workout_sessions;
create policy "workout_sessions_own" on public.st_workout_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.st_exercise_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.st_exercises(id) on delete cascade,
  workout_session_id uuid references public.st_workout_sessions(id) on delete set null,
  log_date date not null,
  status text not null default 'not_started',
  skip_reason text,
  attempt_outcome text,
  created_at timestamptz not null default now(),
  constraint st_exercise_sessions_status_check
    check (status in ('not_started', 'completed', 'partial', 'skipped')),
  constraint st_exercise_sessions_attempt_check
    check (attempt_outcome is null or attempt_outcome in ('did_not_perform', 'could_not_complete', 'completed')),
  constraint st_exercise_sessions_unique unique (user_id, exercise_id, log_date)
);

comment on table public.st_exercise_sessions is
  'Explicit exercise outcome. skipped = did not perform; partial/could_not_complete = tried.';

create index if not exists st_exercise_sessions_user_date_idx
  on public.st_exercise_sessions (user_id, log_date);

alter table public.st_exercise_sessions enable row level security;

drop policy if exists "exercise_sessions_own" on public.st_exercise_sessions;
create policy "exercise_sessions_own" on public.st_exercise_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Minimal feedback columns (existing table)
-- ---------------------------------------------------------------------------

alter table public.st_workout_feedback
  add column if not exists workout_feel text,
  add column if not exists pain_flag text,
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'st_workout_feedback_feel_check'
      and conrelid = 'public.st_workout_feedback'::regclass
  ) then
    alter table public.st_workout_feedback
      add constraint st_workout_feedback_feel_check
      check (workout_feel is null or workout_feel in ('easy', 'good', 'hard', 'very_hard'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'st_workout_feedback_pain_check'
      and conrelid = 'public.st_workout_feedback'::regclass
  ) then
    alter table public.st_workout_feedback
      add constraint st_workout_feedback_pain_check
      check (pain_flag is null or pain_flag in ('none', 'discomfort', 'pain_limiting', 'stopped_due_to_pain'));
  end if;
end $$;

alter table public.st_workout_sessions
  drop constraint if exists st_workout_sessions_feedback_fk;
alter table public.st_workout_sessions
  add constraint st_workout_sessions_feedback_fk
  foreign key (feedback_id) references public.st_workout_feedback(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 6. Extra sets (never become planned sets)
-- ---------------------------------------------------------------------------

create table if not exists public.st_extra_set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.st_exercises(id) on delete cascade,
  workout_id uuid references public.st_workouts(id) on delete set null,
  catalog_exercise_id uuid references public.st_exercise_catalog(id) on delete set null,
  log_date date not null,
  extra_set_number int not null check (extra_set_number >= 1),
  set_type text not null default 'working',
  actual_weight text,
  actual_reps text,
  actual_rir smallint,
  actual_rpe text,
  actual_duration text,
  actual_distance text,
  completed boolean not null default false,
  log_notes text,
  snapshot_exercise_name text,
  snapshot_program_role text,
  created_at timestamptz not null default now(),
  constraint st_extra_set_logs_unique unique (user_id, exercise_id, log_date, extra_set_number)
);

comment on table public.st_extra_set_logs is
  'User-added working sets. Not st_planned_sets. Future progression may ignore them.';

create index if not exists st_extra_set_logs_exercise_idx
  on public.st_extra_set_logs (exercise_id, log_date);

alter table public.st_extra_set_logs enable row level security;

drop policy if exists "extra_set_logs_own" on public.st_extra_set_logs;
create policy "extra_set_logs_own" on public.st_extra_set_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. Append-only adaptation ledger (no writes in 2A.1)
-- ---------------------------------------------------------------------------

create table if not exists public.st_adaptation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid references public.st_programs(id) on delete set null,
  from_week int,
  to_week int,
  exercise_catalog_id uuid references public.st_exercise_catalog(id) on delete set null,
  decision text not null,
  reason_codes text[] not null default '{}',
  before_json jsonb not null default '{}'::jsonb,
  after_json jsonb not null default '{}'::jsonb,
  actor text not null default 'engine',
  science_version text,
  increment_source text,
  increment_reason text,
  increment_value numeric,
  increment_unit text,
  created_at timestamptz not null default now(),
  constraint st_adaptation_events_actor_check
    check (actor in ('engine', 'ai', 'user'))
);

comment on table public.st_adaptation_events is
  'Append-only Phase 2 decision ledger. 2A.1 creates the table; progression writes start in 2A.2.';

create index if not exists st_adaptation_events_user_idx
  on public.st_adaptation_events (user_id, created_at desc);
create index if not exists st_adaptation_events_program_idx
  on public.st_adaptation_events (program_id, from_week, to_week);

alter table public.st_adaptation_events enable row level security;

drop policy if exists "adaptation_events_select_own" on public.st_adaptation_events;
create policy "adaptation_events_select_own" on public.st_adaptation_events
  for select using (user_id = auth.uid());

drop policy if exists "adaptation_events_insert_own" on public.st_adaptation_events;
create policy "adaptation_events_insert_own" on public.st_adaptation_events
  for insert with check (user_id = auth.uid());

-- No update/delete policies: append-only for clients.

-- ---------------------------------------------------------------------------
-- 8. History-safety guard
-- ---------------------------------------------------------------------------

create or replace function public.st_workout_has_performance_logs(p_workout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.st_exercises e
      join public.st_planned_sets ps on ps.exercise_id = e.id
      join public.st_set_logs sl on sl.planned_set_id = ps.id
      where e.workout_id = p_workout_id
        and (
          sl.completed = true
          or coalesce(length(trim(sl.actual_weight::text)), 0) > 0
          or coalesce(length(trim(sl.actual_reps::text)), 0) > 0
          or coalesce(length(trim(sl.actual_duration::text)), 0) > 0
          or coalesce(length(trim(sl.actual_distance::text)), 0) > 0
        )
    )
    or exists (
      select 1
      from public.st_extra_set_logs x
      where x.workout_id = p_workout_id
    );
$$;

create or replace function public.st_prevent_logged_planned_set_mutation()
returns trigger
language plpgsql
as $$
declare
  v_workout_id uuid;
begin
  select e.workout_id into v_workout_id
  from public.st_exercises e
  where e.id = coalesce(new.exercise_id, old.exercise_id);

  if v_workout_id is not null and public.st_workout_has_performance_logs(v_workout_id) then
    if tg_op = 'INSERT' then
      raise exception 'Cannot add planned sets after performance has been logged. Use extra sets.';
    end if;
    if tg_op = 'DELETE' then
      raise exception 'Cannot delete planned sets after performance has been logged.';
    end if;
    if (
      new.target_weight,
      new.target_reps,
      new.target_rpe,
      new.target_rir,
      new.rep_min,
      new.rep_max,
      new.rest_seconds,
      new.set_type,
      new.set_number,
      coalesce(new.is_deleted, false)
    ) is distinct from (
      old.target_weight,
      old.target_reps,
      old.target_rpe,
      old.target_rir,
      old.rep_min,
      old.rep_max,
      old.rest_seconds,
      old.set_type,
      old.set_number,
      coalesce(old.is_deleted, false)
    ) then
      raise exception 'Cannot change a planned prescription after performance has been logged.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists st_planned_sets_logged_guard on public.st_planned_sets;
create trigger st_planned_sets_logged_guard
  before insert or update or delete on public.st_planned_sets
  for each row
  execute procedure public.st_prevent_logged_planned_set_mutation();
