-- BIQ-0217 Phase 2A.1 training data foundation (revised pre-apply)
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
-- 2. Planned-vs-performed snapshots + extra sets on st_set_logs
-- ---------------------------------------------------------------------------

alter table public.st_set_logs
  add column if not exists snapshot_target_rir smallint,
  add column if not exists snapshot_rep_min smallint,
  add column if not exists snapshot_rep_max smallint,
  add column if not exists snapshot_program_role text,
  add column if not exists snapshot_rest_seconds int,
  add column if not exists exercise_id uuid references public.st_exercises(id) on delete set null,
  add column if not exists is_extra_set boolean not null default false,
  add column if not exists extra_set_number int;

comment on column public.st_set_logs.snapshot_target_rir is
  'Planned RIR at log time. Null on historical logs; never fabricated.';
comment on column public.st_set_logs.exercise_id is
  'Required for extra sets. Optional on planned-set logs.';
comment on column public.st_set_logs.is_extra_set is
  'true = user-added performed set. Never a planned set. Excluded from 2A progression unless later decided.';
comment on column public.st_set_logs.extra_set_number is
  '1-based extra set index for that exercise/date. Null on planned-set logs.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'st_set_logs_extra_set_check'
      and conrelid = 'public.st_set_logs'::regclass
  ) then
    alter table public.st_set_logs
      add constraint st_set_logs_extra_set_check
      check (
        is_extra_set = false
        or (
          is_extra_set = true
          and planned_set_id is null
          and exercise_id is not null
          and extra_set_number is not null
          and extra_set_number >= 1
        )
      );
  end if;
end $$;

create unique index if not exists st_set_logs_extra_unique
  on public.st_set_logs (user_id, exercise_id, log_date, extra_set_number)
  where is_extra_set = true;

create index if not exists st_set_logs_extra_exercise_idx
  on public.st_set_logs (exercise_id, log_date)
  where is_extra_set = true;

-- Owner insert already allows user_id = auth.uid() without planned_set_id.
-- Extend insert so coaches can log extras through exercise_id.
drop policy if exists "set_logs_insert" on public.st_set_logs;
create policy "set_logs_insert" on public.st_set_logs
  for insert with check (
    user_id = auth.uid()
    or exists (
      select 1
      from public.st_planned_sets ps
      join public.st_exercises e on e.id = ps.exercise_id
      join public.st_workouts w on w.id = e.workout_id
      join public.st_programs p on p.id = w.program_id
      join public.st_team_members coach on coach.team_id = p.team_id
      where ps.id = st_set_logs.planned_set_id
        and coach.user_id = auth.uid()
        and coach.status = 'active'
        and coach.role in ('owner', 'manager')
        and p.visibility = 'team'
    )
    or (
      coalesce(st_set_logs.is_extra_set, false) = true
      and st_set_logs.planned_set_id is null
      and st_set_logs.exercise_id is not null
      and exists (
        select 1
        from public.st_exercises e
        join public.st_workouts w on w.id = e.workout_id
        join public.st_programs p on p.id = w.program_id
        join public.st_team_members coach on coach.team_id = p.team_id
        where e.id = st_set_logs.exercise_id
          and coach.user_id = auth.uid()
          and coach.status = 'active'
          and coach.role in ('owner', 'manager')
          and p.visibility = 'team'
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Week status — evidence-based backfill
-- ---------------------------------------------------------------------------

alter table public.st_workouts
  add column if not exists week_status text;

create or replace function public.st_log_row_has_performance(
  p_completed boolean,
  p_weight text,
  p_reps text,
  p_duration text,
  p_distance text
)
returns boolean
language sql
immutable
as $$
  select
    coalesce(p_completed, false)
    or coalesce(length(trim(p_weight)), 0) > 0
    or coalesce(length(trim(p_reps)), 0) > 0
    or coalesce(length(trim(p_duration)), 0) > 0
    or coalesce(length(trim(p_distance)), 0) > 0;
$$;

create or replace function public.st_program_current_week(p_start date, p_created timestamptz, p_weeks int)
returns int
language sql
stable
as $$
  select
    case
      when coalesce(p_start, p_created::date) is null then null
      when current_date < date_trunc('week', coalesce(p_start, p_created::date))::date then 1
      else least(
        greatest(
          1,
          floor(
            (current_date - date_trunc('week', coalesce(p_start, p_created::date))::date) / 7
          )::int + 1
        ),
        greatest(1, coalesce(p_weeks, 6))
      )
    end;
$$;

update public.st_workouts w
set week_status = computed.status
from (
  select
    w2.id,
    case
      when w2.week_status in ('template', 'activated', 'in_progress', 'completed', 'locked')
        then w2.week_status
      when complete.fully_completed then 'completed'
      when perf.has_performance then 'in_progress'
      when coalesce(w2.week, 1) <= 1 then 'activated'
      when public.st_program_current_week(p.start_date, p.created_at, p.weeks) is null
        then 'activated'
      when coalesce(w2.week, 1) <= public.st_program_current_week(p.start_date, p.created_at, p.weeks)
        then 'activated'
      else 'template'
    end as status
  from public.st_workouts w2
  left join public.st_programs p on p.id = w2.program_id
  left join lateral (
    select
      exists (
        select 1
        from public.st_exercises e
        join public.st_planned_sets ps on ps.exercise_id = e.id
        join public.st_set_logs sl on sl.planned_set_id = ps.id
        where e.workout_id = w2.id
          and public.st_log_row_has_performance(
            sl.completed,
            sl.actual_weight::text,
            sl.actual_reps::text,
            sl.actual_duration::text,
            sl.actual_distance::text
          )
      )
      or exists (
        select 1
        from public.st_exercises e
        join public.st_set_logs sl on sl.exercise_id = e.id
        where e.workout_id = w2.id
          and sl.is_extra_set = true
          and public.st_log_row_has_performance(
            sl.completed,
            sl.actual_weight::text,
            sl.actual_reps::text,
            sl.actual_duration::text,
            sl.actual_distance::text
          )
      ) as has_performance
  ) perf on true
  left join lateral (
    select
      exists (
        select 1
        from public.st_exercises e
        join public.st_planned_sets ps on ps.exercise_id = e.id
        where e.workout_id = w2.id
          and coalesce(e.section, 'strength') <> 'warmup'
          and coalesce(ps.is_deleted, false) = false
          and coalesce(ps.set_type, 'working') <> 'warmup'
      )
      and not exists (
        select 1
        from public.st_exercises e
        join public.st_planned_sets ps on ps.exercise_id = e.id
        where e.workout_id = w2.id
          and coalesce(e.section, 'strength') <> 'warmup'
          and coalesce(ps.is_deleted, false) = false
          and coalesce(ps.set_type, 'working') <> 'warmup'
          and not exists (
            select 1
            from public.st_set_logs sl
            where sl.planned_set_id = ps.id
              and sl.completed = true
          )
      ) as fully_completed
  ) complete on true
) computed
where w.id = computed.id
  and (w.week_status is null or w.week_status = '');

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
  'Evidence-based: completed/in_progress from logs; current/elapsed untouched = activated; future untouched = template. locked is never inferred.';

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

comment on column public.st_workout_feedback.pain_flag is
  'NULL = unanswered. none = user explicitly reported no pain.';

alter table public.st_workout_sessions
  drop constraint if exists st_workout_sessions_feedback_fk;
alter table public.st_workout_sessions
  add constraint st_workout_sessions_feedback_fk
  foreign key (feedback_id) references public.st_workout_feedback(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 6. Append-only adaptation ledger (no writes in 2A.1)
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
-- 7. History protection — planned-set-specific UPDATE only
-- ---------------------------------------------------------------------------

create or replace function public.st_planned_set_has_performance(p_planned_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_set_logs sl
    where sl.planned_set_id = p_planned_set_id
      and public.st_log_row_has_performance(
        sl.completed,
        sl.actual_weight::text,
        sl.actual_reps::text,
        sl.actual_duration::text,
        sl.actual_distance::text
      )
  );
$$;

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
        and public.st_log_row_has_performance(
          sl.completed,
          sl.actual_weight::text,
          sl.actual_reps::text,
          sl.actual_duration::text,
          sl.actual_distance::text
        )
    )
    or exists (
      select 1
      from public.st_exercises e
      join public.st_set_logs sl on sl.exercise_id = e.id
      where e.workout_id = p_workout_id
        and sl.is_extra_set = true
        and public.st_log_row_has_performance(
          sl.completed,
          sl.actual_weight::text,
          sl.actual_reps::text,
          sl.actual_duration::text,
          sl.actual_distance::text
        )
    );
$$;

create or replace function public.st_prevent_logged_planned_set_rewrite()
returns trigger
language plpgsql
as $$
begin
  if not public.st_planned_set_has_performance(old.id) then
    return new;
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
    new.set_number
  ) is distinct from (
    old.target_weight,
    old.target_reps,
    old.target_rpe,
    old.target_rir,
    old.rep_min,
    old.rep_max,
    old.rest_seconds,
    old.set_type,
    old.set_number
  ) then
    raise exception 'Cannot rewrite a planned prescription after that set has been logged.';
  end if;
  return new;
end;
$$;

drop trigger if exists st_planned_sets_logged_guard on public.st_planned_sets;
drop trigger if exists st_planned_sets_logged_rewrite_guard on public.st_planned_sets;
create trigger st_planned_sets_logged_rewrite_guard
  before update on public.st_planned_sets
  for each row
  execute procedure public.st_prevent_logged_planned_set_rewrite();
