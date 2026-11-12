-- BuildIQ Staging schema replay part 6

-- ===== 20260922_051_generation_runs.sql =====

-- BIQ-0208 Phase 1 generation observability
-- Additive only. Does not change workout history.

create table if not exists public.st_generation_runs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.st_programs(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  generation_method text,
  model text,
  prompt_version text,
  science_version text,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  repair_attempt int not null default 0,
  ok boolean,
  input_json jsonb,
  output_json jsonb,
  validation_json jsonb,
  error_text text
);

create index if not exists st_generation_runs_user_idx on public.st_generation_runs (user_id, created_at desc);
create index if not exists st_generation_runs_program_idx on public.st_generation_runs (program_id);

alter table public.st_generation_runs enable row level security;

drop policy if exists "generation_runs_select_own" on public.st_generation_runs;
create policy "generation_runs_select_own" on public.st_generation_runs
  for select using (user_id = auth.uid());

drop policy if exists "generation_runs_insert_own" on public.st_generation_runs;
create policy "generation_runs_insert_own" on public.st_generation_runs
  for insert with check (user_id = auth.uid());

drop policy if exists "generation_runs_update_own" on public.st_generation_runs;
create policy "generation_runs_update_own" on public.st_generation_runs
  for update using (user_id = auth.uid());

alter table public.st_programs drop constraint if exists st_programs_generation_method_check;
alter table public.st_programs
  add constraint st_programs_generation_method_check check (
    generation_method is null
    or generation_method in (
      'ai',
      'template',
      'manual',
      'science',
      'science_ai',
      'ai_repaired',
      'science_fallback'
    )
  );


-- ===== 20260923_052_phase2a1_training_foundation.sql =====

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


-- ===== 20260924_053_phase2a3_adaptation_application.sql =====

-- BIQ-0219 / BIQ-0220 Phase 2A.3 — additive ledger fields for safe application.
-- DO NOT apply until reviewed. Existing 2A.1 rows stay readable.
-- application_key is the source→target adaptation identity (no engine/science versions).

alter table public.st_adaptation_events
  add column if not exists source_workout_id uuid,
  add column if not exists source_exercise_id uuid,
  add column if not exists source_log_date date,
  add column if not exists target_workout_id uuid,
  add column if not exists target_exercise_id uuid,
  add column if not exists application_status text,
  add column if not exists application_key text,
  add column if not exists target_fingerprint text,
  add column if not exists confidence text,
  add column if not exists adaptation_engine_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'st_adaptation_events_application_status_check'
  ) then
    alter table public.st_adaptation_events
      add constraint st_adaptation_events_application_status_check
      check (
        application_status is null
        or application_status in ('mutated', 'recorded_no_change', 'not_applied')
      );
  end if;
end $$;

comment on column public.st_adaptation_events.application_key is
  'Durable adaptation identity: user + source workout/exercise + target workout/exercise + catalog + decision. Science and engine versions are metadata only and must not mint a new key.';
comment on column public.st_adaptation_events.target_fingerprint is
  'Fingerprint of the target working-set prescription at evaluation time. Mismatch aborts apply.';
comment on column public.st_adaptation_events.application_status is
  'mutated | recorded_no_change | not_applied. Only successful rows are unique on application_key, so a prior stale/not_applied row can be followed by one successful apply of the same identity.';
comment on column public.st_adaptation_events.science_version is
  'Metadata. Changing this value must not allow a second successful mutation of the same application_key.';
comment on column public.st_adaptation_events.adaptation_engine_version is
  'Metadata. Changing this value must not allow a second successful mutation of the same application_key.';

create unique index if not exists st_adaptation_events_application_key_success_idx
  on public.st_adaptation_events (application_key)
  where application_status in ('mutated', 'recorded_no_change')
    and application_key is not null;

create index if not exists st_adaptation_events_source_idx
  on public.st_adaptation_events (user_id, source_exercise_id, source_log_date);


-- ===== 20261005_054_group_architecture_phase1.sql =====

-- BIQ-0238: Group architecture phase 1
-- One authoritative owner, manager-capable group default, collaboration flags,
-- and participation enrollments beside followed_program_id.
-- Enrollments are not the Training calendar. Phase 2 chooses which group
-- slots become visible. Does not drop tables or delete workout history.

-- ---------------------------------------------------------------------------
-- 1. Collaboration flags. Default false keeps today's member behavior.
-- ---------------------------------------------------------------------------

alter table public.st_teams
  add column if not exists members_can_create_shared_workouts boolean not null default false,
  add column if not exists members_can_edit_shared_workouts boolean not null default false,
  add column if not exists members_can_assign_workouts boolean not null default false,
  add column if not exists members_can_view_member_progress boolean not null default false;

comment on column public.st_teams.default_program_id is
  'GROUP DEFAULT PROGRAM. What this group is generally training on. Does not replace a personal program or another group enrollment.';
comment on column public.st_teams.members_can_create_shared_workouts is
  'When true, members may create shared group programs. Default false.';
comment on column public.st_teams.members_can_edit_shared_workouts is
  'When true, members may edit the live shared template. Default false. Training edits still fork to a personal copy.';
comment on column public.st_teams.members_can_assign_workouts is
  'When true, members may assign programs and workouts, including the group default. Default false.';
comment on column public.st_teams.members_can_view_member_progress is
  'When true, members may read other members'' group-scoped training logs. Default false. Does not expose body measurements.';
comment on column public.st_teams.owner_user_id is
  'Authoritative group owner. Membership role owner must match this user. Change only through st_transfer_group_ownership.';

-- ---------------------------------------------------------------------------
-- 2. Exactly one owner membership, matching owner_user_id
-- ---------------------------------------------------------------------------

insert into public.st_team_members (team_id, user_id, role, status)
select t.id, t.owner_user_id, 'owner', 'active'
from public.st_teams t
where t.owner_user_id is not null
  and coalesce(t.is_archived, false) = false
  and not exists (
    select 1 from public.st_team_members m
    where m.team_id = t.id and m.user_id = t.owner_user_id
  );

update public.st_team_members m
set role = 'owner'
from public.st_teams t
where m.team_id = t.id
  and m.user_id = t.owner_user_id
  and m.status = 'active'
  and m.role is distinct from 'owner';

update public.st_team_members m
set role = 'manager'
from public.st_teams t
where m.team_id = t.id
  and m.role = 'owner'
  and t.owner_user_id is distinct from m.user_id;

-- Invites cannot create a second owner. Join still applies manager or member.
do $$
begin
  if to_regclass('public.st_group_invites') is not null then
    update public.st_group_invites set role = 'manager' where role = 'owner';
    alter table public.st_group_invites drop constraint if exists st_group_invites_role_check;
    alter table public.st_group_invites
      add constraint st_group_invites_role_check check (role in ('manager', 'member'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Guards. Normal role edits cannot mint a second owner.
--    Ownership transfer is the only path that changes owner_user_id.
-- ---------------------------------------------------------------------------

create or replace function public.st_guard_group_owner_user()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id
     and coalesce(current_setting('biq.group_owner_transfer', true), '') is distinct from '1' then
    raise exception 'Use st_transfer_group_ownership to change the group owner';
  end if;
  return new;
end;
$$;

drop trigger if exists st_teams_guard_owner on public.st_teams;
create trigger st_teams_guard_owner
  before update of owner_user_id on public.st_teams
  for each row execute function public.st_guard_group_owner_user();

create or replace function public.st_guard_group_membership_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if coalesce(current_setting('biq.group_owner_transfer', true), '') = '1' then
    return new;
  end if;

  select owner_user_id into v_owner
  from public.st_teams
  where id = new.team_id;

  if new.user_id is not distinct from v_owner then
    if new.role is distinct from 'owner' then
      raise exception 'The group owner role cannot be changed except by ownership transfer';
    end if;
  elsif new.role = 'owner' then
    raise exception 'Only the group owner can hold the owner role. Use ownership transfer';
  end if;

  return new;
end;
$$;

drop trigger if exists st_team_members_guard_owner on public.st_team_members;
create trigger st_team_members_guard_owner
  before insert or update of role on public.st_team_members
  for each row execute function public.st_guard_group_membership_owner();

create or replace function public.st_transfer_group_ownership(
  p_team_id uuid,
  p_new_owner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_is_team_owner(p_team_id) then
    raise exception 'Only the group owner can transfer ownership';
  end if;
  if p_new_owner_user_id is null or p_new_owner_user_id = auth.uid() then
    raise exception 'Choose another active member';
  end if;
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = p_new_owner_user_id and status = 'active'
  ) then
    raise exception 'New owner must be an active member';
  end if;

  select owner_user_id into v_previous from public.st_teams where id = p_team_id;
  perform set_config('biq.group_owner_transfer', '1', true);

  update public.st_teams
  set owner_user_id = p_new_owner_user_id
  where id = p_team_id;

  update public.st_team_members
  set role = 'manager'
  where team_id = p_team_id and user_id = v_previous and status = 'active';

  update public.st_team_members
  set role = 'owner'
  where team_id = p_team_id and user_id = p_new_owner_user_id and status = 'active';
end;
$$;

revoke all on function public.st_transfer_group_ownership(uuid, uuid) from public;
grant execute on function public.st_transfer_group_ownership(uuid, uuid) to authenticated;

comment on function public.st_transfer_group_ownership(uuid, uuid) is
  'Explicit ownership transfer. No Groups UI calls this in phase 1.';

create or replace function public.st_set_member_role(
  p_member_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.st_team_members%rowtype;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_member from public.st_team_members where id = p_member_id;
  if not found then
    raise exception 'Member not found';
  end if;
  if not public.st_user_is_team_owner(v_member.team_id) then
    raise exception 'Only the group owner can change roles';
  end if;

  v_role := case when lower(coalesce(p_role, '')) = 'editor' then 'manager' else lower(coalesce(p_role, '')) end;
  if v_role not in ('manager', 'member') then
    raise exception 'Role must be manager or member. Ownership changes use st_transfer_group_ownership';
  end if;
  if v_member.user_id = (select owner_user_id from public.st_teams where id = v_member.team_id) then
    raise exception 'The group owner role cannot be changed here';
  end if;

  update public.st_team_members
  set role = v_role
  where id = p_member_id;
end;
$$;

revoke all on function public.st_set_member_role(uuid, text) from public;
grant execute on function public.st_set_member_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Permission helpers
-- ---------------------------------------------------------------------------

create or replace function public.st_member_has_group_flag(
  p_team_id uuid,
  p_flag text
)
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

create or replace function public.st_user_can_edit_shared_program(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_team_id is not null
    and (
      public.st_user_can_edit_team(p_team_id)
      or public.st_member_has_group_flag(p_team_id, 'edit')
    );
$$;

create or replace function public.st_user_can_create_shared_program(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_team_id is not null
    and (
      public.st_user_can_edit_team(p_team_id)
      or public.st_member_has_group_flag(p_team_id, 'create')
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

create or replace function public.st_user_can_edit_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_programs p
    where p.id = p_program_id
      and (
        (p.visibility = 'personal' and p.owner_user_id = auth.uid())
        or (p.visibility = 'team' and public.st_user_can_edit_shared_program(p.team_id))
      )
  );
$$;

comment on function public.st_user_can_edit_program(uuid) is
  'Edit Shared. Personal: owner. Group template: owner, manager, or a member whose group allows shared edits. Customize-for-me writes a new personal program instead.';

drop policy if exists "programs_insert" on public.st_programs;
create policy "programs_insert" on public.st_programs
  for insert
  with check (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_can_create_shared_program(team_id))
  );

drop policy if exists "programs_update_editor" on public.st_programs;
create policy "programs_update_editor" on public.st_programs
  for update
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_can_edit_shared_program(team_id))
  )
  with check (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_can_edit_shared_program(team_id))
  );

-- Managers (and members only when the assign flag is on) may set the group default.
-- This does not update followed_program_id or personal programs.
create or replace function public.st_set_group_default_program(
  p_team_id uuid,
  p_program_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;

  if p_program_id is not null and not exists (
    select 1
    from public.st_programs p
    where p.id = p_program_id
      and p.team_id = p_team_id
      and p.visibility = 'team'
      and coalesce(p.status, 'published') <> 'draft'
      and coalesce(p.status, 'published') <> 'archived'
  ) then
    raise exception 'Publish a group program before setting it as the group default';
  end if;

  update public.st_teams
  set default_program_id = p_program_id
  where id = p_team_id;
end;
$$;

revoke all on function public.st_set_group_default_program(uuid, uuid) from public;
grant execute on function public.st_set_group_default_program(uuid, uuid) to authenticated;

-- Assign RPCs follow the same assign permission. Nested training_source updates
-- stay inside this function so they do not require a second owner/manager check.
create or replace function public.st_assign_member_program(
  p_team_id uuid,
  p_member_user_id uuid,
  p_assignment_type text,
  p_program_id uuid default null,
  p_notes text default null,
  p_coaching_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if p_assignment_type not in ('personal', 'team', 'individual_team', 'manual') then
    raise exception 'Invalid assignment type';
  end if;
  if p_assignment_type in ('individual_team', 'manual') and p_program_id is null then
    raise exception 'Select a program for this assignment type';
  end if;
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = p_member_user_id and status = 'active'
  ) then
    raise exception 'Member not found';
  end if;

  update public.st_program_assignments
  set is_active = false
  where user_id = p_member_user_id and team_id = p_team_id and is_active = true;

  insert into public.st_program_assignments (
    user_id, team_id, assigned_by, assignment_type, program_id, notes, is_active, target_type, coaching_metadata
  ) values (
    p_member_user_id,
    p_team_id,
    auth.uid(),
    p_assignment_type,
    p_program_id,
    nullif(trim(p_notes), ''),
    true,
    'individual',
    coalesce(p_coaching_metadata, '{}'::jsonb)
  );

  update public.st_team_members
  set training_source = case when p_assignment_type = 'personal' then 'personal' else 'team' end
  where team_id = p_team_id and user_id = p_member_user_id and status = 'active';
end;
$$;

revoke all on function public.st_assign_member_program(uuid, uuid, text, uuid, text, jsonb) from public;
grant execute on function public.st_assign_member_program(uuid, uuid, text, uuid, text, jsonb) to authenticated;

create or replace function public.st_assign_workout_to_targets(
  p_team_id uuid,
  p_workout_id uuid default null,
  p_program_id uuid default null,
  p_workout_date date default null,
  p_target_type text default 'individual',
  p_target_classification_id uuid default null,
  p_target_user_ids uuid[] default null,
  p_scheduled_date date default current_date,
  p_due_date date default null,
  p_title text default null,
  p_notes text default null,
  p_coaching_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_uid uuid;
  v_recipient uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if p_target_type not in ('group', 'classification', 'members', 'individual') then
    raise exception 'Invalid target type';
  end if;
  if p_workout_id is null and (p_program_id is null or p_workout_date is null) then
    raise exception 'Provide workout_id or program_id with workout_date';
  end if;
  if p_target_type = 'classification' and p_target_classification_id is null then
    raise exception 'Classification target requires target_classification_id';
  end if;
  if p_target_type in ('members', 'individual') and (p_target_user_ids is null or array_length(p_target_user_ids, 1) is null) then
    raise exception 'Member targets require target_user_ids';
  end if;

  insert into public.st_workout_assignments (
    team_id, assigned_by, workout_id, program_id, workout_date, target_type,
    target_classification_id, scheduled_date, due_date, title, notes, coaching_metadata
  ) values (
    p_team_id, auth.uid(), p_workout_id, p_program_id, p_workout_date, p_target_type,
    p_target_classification_id, coalesce(p_scheduled_date, current_date), p_due_date,
    p_title, p_notes, coalesce(p_coaching_metadata, '{}'::jsonb)
  )
  returning id into v_assignment_id;

  if p_target_type = 'group' then
    for v_recipient in
      select tm.user_id from public.st_team_members tm
      where tm.team_id = p_team_id and tm.status = 'active' and tm.is_active_participant = true
    loop
      insert into public.st_assignment_recipients (assignment_id, user_id)
      values (v_assignment_id, v_recipient)
      on conflict (assignment_id, user_id) do nothing;
    end loop;
  elsif p_target_type = 'classification' then
    for v_recipient in
      select distinct tm.user_id
      from public.st_team_members tm
      join public.st_group_member_classifications gmc on gmc.member_id = tm.id
      where tm.team_id = p_team_id and tm.status = 'active' and tm.is_active_participant = true
        and gmc.classification_id = p_target_classification_id
    loop
      insert into public.st_assignment_recipients (assignment_id, user_id)
      values (v_assignment_id, v_recipient)
      on conflict (assignment_id, user_id) do nothing;
    end loop;
  else
    foreach v_uid in array p_target_user_ids loop
      if exists (
        select 1 from public.st_team_members tm
        where tm.team_id = p_team_id and tm.user_id = v_uid and tm.status = 'active'
      ) then
        insert into public.st_assignment_recipients (assignment_id, user_id)
        values (v_assignment_id, v_uid)
        on conflict (assignment_id, user_id) do nothing;
      end if;
    end loop;
  end if;

  return v_assignment_id;
end;
$$;

revoke all on function public.st_assign_workout_to_targets(
  uuid, uuid, uuid, date, text, uuid, uuid[], date, date, text, text, jsonb
) from public;
grant execute on function public.st_assign_workout_to_targets(
  uuid, uuid, uuid, date, text, uuid, uuid[], date, date, text, text, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Group progress scope. Personal metrics stay private.
-- ---------------------------------------------------------------------------

create or replace function public.st_set_log_in_group(
  p_log_team_id uuid,
  p_planned_set_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (p_log_team_id is not null and p_log_team_id = p_team_id)
    or exists (
      select 1
      from public.st_planned_sets ps
      join public.st_exercises e on e.id = ps.exercise_id
      join public.st_workouts w on w.id = e.workout_id
      join public.st_programs p on p.id = w.program_id
      where ps.id = p_planned_set_id
        and p.team_id = p_team_id
        and p.visibility = 'team'
    );
$$;

create or replace function public.st_group_progress_logs(
  p_team_id uuid,
  p_user_ids uuid[] default null,
  p_from date default null,
  p_to date default null,
  p_limit int default 400
)
returns setof public.st_set_logs
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_is_active_team_member(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if p_user_ids is not null and exists (
    select 1 from unnest(p_user_ids) uid where uid is distinct from auth.uid()
  ) and not public.st_user_can_view_group_progress(p_team_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select sl.*
  from public.st_set_logs sl
  where sl.completed = true
    and (p_user_ids is null or sl.user_id = any (p_user_ids))
    and (p_user_ids is not null or sl.user_id = auth.uid() or public.st_user_can_view_group_progress(p_team_id))
    and (p_from is null or sl.log_date >= p_from)
    and (p_to is null or sl.log_date <= p_to)
    and public.st_set_log_in_group(sl.team_id, sl.planned_set_id, p_team_id)
    and (sl.user_id = auth.uid() or public.st_user_can_view_group_progress(p_team_id))
  order by sl.log_date desc
  limit greatest(1, least(coalesce(p_limit, 400), 2000));
end;
$$;

revoke all on function public.st_group_progress_logs(uuid, uuid[], date, date, int) from public;
grant execute on function public.st_group_progress_logs(uuid, uuid[], date, date, int) to authenticated;

drop policy if exists "set_logs_select" on public.st_set_logs;
create policy "set_logs_select" on public.st_set_logs
  for select
  using (
    user_id = auth.uid()
    or (
      public.st_user_can_coach_read_member_log(user_id)
      and (
        public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
        or coalesce(length(trim(snapshot_exercise_name)), 0) > 0
        or completed = true
        or coalesce(length(trim(actual_weight::text)), 0) > 0
        or coalesce(length(trim(actual_reps::text)), 0) > 0
      )
    )
    or exists (
      select 1
      from public.st_team_members subject
      where subject.user_id = st_set_logs.user_id
        and subject.status = 'active'
        and public.st_user_can_view_group_progress(subject.team_id)
        and public.st_set_log_in_group(st_set_logs.team_id, st_set_logs.planned_set_id, subject.team_id)
    )
  );

comment on policy "set_logs_select" on public.st_set_logs is
  'Own logs; owner/manager teammate logs; group-scoped logs when members_can_view_member_progress is on. Body measurements stay private.';

-- ---------------------------------------------------------------------------
-- 6. Training participation. This is not the Training calendar.
--    The calendar stays on followed_program_id in Phase 1.
--    Phase 2 must choose which backfilled group slots become visible.
--    Provenance is derived: personal fork via source_program_id,
--    else active individual_team/manual assignment, else default_program_id.
-- ---------------------------------------------------------------------------

create table if not exists public.st_training_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null check (source_kind in ('personal', 'group')),
  source_key text not null,
  team_id uuid references public.st_teams(id) on delete cascade,
  program_id uuid references public.st_programs(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_key),
  check (
    (source_kind = 'personal' and team_id is null and source_key = 'personal')
    or (source_kind = 'group' and team_id is not null and source_key = ('group:' || team_id::text))
  )
);

alter table public.st_training_enrollments drop column if exists is_primary;
drop trigger if exists st_training_enrollments_primary on public.st_training_enrollments;
drop function if exists public.st_training_enrollments_one_primary();

comment on table public.st_training_enrollments is
  'Programs a user participates in. One personal slot and one slot per group. Not the Training calendar. Phase 2 decides which backfilled group slots are shown. followed_program_id remains the Phase 1 display pointer.';
comment on column public.st_training_enrollments.program_id is
  'Program this slot participates in. Why: personal fork when the program is a non-archived personal copy of this group; else the active individual assignment; else the group default.';

create index if not exists st_training_enrollments_user_idx
  on public.st_training_enrollments (user_id, status);

create index if not exists st_training_enrollments_team_idx
  on public.st_training_enrollments (team_id)
  where team_id is not null;

create or replace function public.st_training_enrollments_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists st_training_enrollments_touch on public.st_training_enrollments;
create trigger st_training_enrollments_touch
  before insert or update on public.st_training_enrollments
  for each row execute function public.st_training_enrollments_touch();

alter table public.st_training_enrollments enable row level security;

drop policy if exists "training_enrollments_select" on public.st_training_enrollments;
create policy "training_enrollments_select" on public.st_training_enrollments
  for select using (
    user_id = auth.uid()
    or (team_id is not null and public.st_user_can_edit_team(team_id))
  );

drop policy if exists "training_enrollments_insert" on public.st_training_enrollments;
create policy "training_enrollments_insert" on public.st_training_enrollments
  for insert with check (user_id = auth.uid());

drop policy if exists "training_enrollments_update" on public.st_training_enrollments;
create policy "training_enrollments_update" on public.st_training_enrollments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "training_enrollments_delete" on public.st_training_enrollments;
create policy "training_enrollments_delete" on public.st_training_enrollments
  for delete using (user_id = auth.uid());

-- Additive backfill. Does not update followed_program_id.
-- A pure personal follow becomes the personal slot.
-- A team follow becomes that group's slot.
-- A personal fork of a team program becomes that group's slot, not the personal slot.
-- Other memberships use an explicit individual assignment, otherwise the group default.
-- on conflict do nothing so a later group cannot replace the program Training already shows.
-- Phase 2 must decide visibility before rendering these extra group slots.

insert into public.st_training_enrollments (
  user_id, source_kind, source_key, team_id, program_id, status
)
select
  pr.user_id,
  'personal',
  'personal',
  null,
  pr.followed_program_id,
  'active'
from public.st_profiles pr
join public.st_programs prog on prog.id = pr.followed_program_id
where prog.visibility = 'personal'
  and prog.source_program_id is null
on conflict (user_id, source_key) do nothing;

insert into public.st_training_enrollments (
  user_id, source_kind, source_key, team_id, program_id, status
)
select
  pr.user_id,
  'group',
  'group:' || prog.team_id::text,
  prog.team_id,
  pr.followed_program_id,
  'active'
from public.st_profiles pr
join public.st_programs prog on prog.id = pr.followed_program_id
where prog.visibility = 'team'
  and prog.team_id is not null
on conflict (user_id, source_key) do nothing;

insert into public.st_training_enrollments (
  user_id, source_kind, source_key, team_id, program_id, status
)
select
  pr.user_id,
  'group',
  'group:' || src.team_id::text,
  src.team_id,
  pr.followed_program_id,
  'active'
from public.st_profiles pr
join public.st_programs fork on fork.id = pr.followed_program_id
join public.st_programs src on src.id = fork.source_program_id
where fork.visibility = 'personal'
  and fork.source_program_id is not null
  and lower(coalesce(fork.status, '')) <> 'archived'
  and src.visibility = 'team'
  and src.team_id is not null
on conflict (user_id, source_key) do nothing;

insert into public.st_training_enrollments (
  user_id, source_kind, source_key, team_id, program_id, status
)
select
  m.user_id,
  'group',
  'group:' || m.team_id::text,
  m.team_id,
  coalesce(asg.program_id, t.default_program_id),
  'active'
from public.st_team_members m
join public.st_teams t on t.id = m.team_id
left join lateral (
  select a.program_id
  from public.st_program_assignments a
  where a.user_id = m.user_id
    and a.team_id = m.team_id
    and a.is_active = true
    and a.assignment_type in ('individual_team', 'manual')
    and a.program_id is not null
  order by a.created_at desc
  limit 1
) asg on true
where m.status = 'active'
  and coalesce(t.is_archived, false) = false
  and coalesce(asg.program_id, t.default_program_id) is not null
on conflict (user_id, source_key) do nothing;

-- Leaving a group ends only that group's participation slot.
create or replace function public.st_leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role
  from public.st_team_members
  where team_id = p_team_id
    and user_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'You are not an active member of this group';
  end if;

  if v_role = 'owner' then
    raise exception 'Owners cannot leave — transfer ownership or delete the group';
  end if;

  update public.st_team_members
  set status = 'removed'
  where team_id = p_team_id
    and user_id = auth.uid()
    and status = 'active';

  update public.st_training_enrollments
  set status = 'ended',
      updated_at = now()
  where user_id = auth.uid()
    and source_key = 'group:' || p_team_id::text;
end;
$$;

revoke all on function public.st_leave_team(uuid) from public;
grant execute on function public.st_leave_team(uuid) to authenticated;

create or replace function public.st_delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.st_user_is_team_owner(p_team_id) then
    raise exception 'Only the group owner can delete the group';
  end if;

  update public.st_team_members
  set status = 'removed'
  where team_id = p_team_id
    and status = 'active';

  update public.st_training_enrollments
  set status = 'ended',
      updated_at = now()
  where team_id = p_team_id
    and status <> 'ended';

  update public.st_teams
  set is_archived = true,
      default_program_id = null
  where id = p_team_id;
end;
$$;

revoke all on function public.st_delete_team(uuid) from public;
grant execute on function public.st_delete_team(uuid) to authenticated;


-- ===== 20261005_055_group_program_edit_auth.sql =====

-- BIQ-0239: Group program edits follow current membership, not st_programs.owner_user_id.
-- Personal programs, including just-me forks, stay with their personal owner.
-- Apply this if 20261005_054 was already applied before this policy correction.
-- A fresh apply of the revised 054 already contains the same program update policy.

create or replace function public.st_user_can_edit_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_programs p
    where p.id = p_program_id
      and (
        (p.visibility = 'personal' and p.owner_user_id = auth.uid())
        or (p.visibility = 'team' and public.st_user_can_edit_shared_program(p.team_id))
      )
  );
$$;

comment on function public.st_user_can_edit_program(uuid) is
  'Personal: the personal owner, including a just-me fork. Group template: current owner, manager, or a member whose group allows shared edits. st_programs.owner_user_id does not authorize a group template.';

drop policy if exists "programs_update_editor" on public.st_programs;
create policy "programs_update_editor" on public.st_programs
  for update
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_can_edit_shared_program(team_id))
  )
  with check (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_can_edit_shared_program(team_id))
  );

drop policy if exists "muscle_weekly_targets_write" on public.st_muscle_weekly_targets;
create policy "muscle_weekly_targets_write" on public.st_muscle_weekly_targets
  for insert
  with check (public.st_user_can_edit_program(program_id));


-- ===== 20261005_056_secure_group_invitations.sql =====

-- BIQ-0242: Secure group invitations and Quick Join.
-- Extends st_group_invites. Does not create a second invitation table.
-- Does not apply remotely from the app. Run this in Supabase after 054 and 055.
--
-- Legacy pending rows were code-based (the permanent group code was emailed).
-- They are revoked here. They are not upgraded into secure invitations and
-- they cannot grant Manager. Accepted history is kept.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Invite row: hash only. The raw token exists only in the emailed URL.
-- classification_ids holds zero or more existing group classifications.
-- This phase's screen sends one. Acceptance applies every id that still
-- belongs to the group, so more than one can be stored later without a new table.
-- ---------------------------------------------------------------------------

alter table public.st_group_invites
  add column if not exists token_hash text,
  add column if not exists expires_at timestamptz,
  add column if not exists accepted_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists classification_ids uuid[] not null default '{}';

create unique index if not exists st_group_invites_token_hash_uidx
  on public.st_group_invites (token_hash)
  where token_hash is not null;

update public.st_group_invites
set email = lower(trim(email))
where email is distinct from lower(trim(email))
  and not exists (
    select 1
    from public.st_group_invites other
    where other.team_id = st_group_invites.team_id
      and other.id <> st_group_invites.id
      and lower(trim(other.email)) = lower(trim(st_group_invites.email))
  );

-- Code-based pending invites have no token. Revoke them so they cannot be accepted.
update public.st_group_invites
set status = 'revoked',
    token_hash = null,
    updated_at = now()
where status = 'pending'
  and token_hash is null;

comment on table public.st_group_invites is
  'Secure email invitations. token_hash is the only token material stored. Quick Join uses st_group_quick_join, not this table.';

comment on column public.st_group_invites.classification_ids is
  'Classifications to apply on acceptance. One or more. Ids that no longer belong to the group are ignored.';

-- Managers cannot invite Managers unless the owner turns this on.
alter table public.st_teams
  add column if not exists managers_can_invite_managers boolean not null default false;

-- ---------------------------------------------------------------------------
-- Quick Join code lives off the member-readable team row.
-- st_teams.invite_code stays NOT NULL UNIQUE but is no longer the join secret.
-- ---------------------------------------------------------------------------

create table if not exists public.st_group_quick_join (
  team_id uuid primary key references public.st_teams(id) on delete cascade,
  code text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint st_group_quick_join_code_unique unique (code)
);

insert into public.st_group_quick_join (team_id, code, enabled)
select id, upper(invite_code), true
from public.st_teams
on conflict (team_id) do nothing;

-- Replace the public column only while it still equals the live Quick Join code.
update public.st_teams t
set invite_code = 'DQ' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14))
where exists (
  select 1
  from public.st_group_quick_join q
  where q.team_id = t.id
    and q.code = upper(t.invite_code)
);

create or replace function public.st_teams_seal_quick_join_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_real text;
  v_decoy text;
begin
  v_real := upper(trim(new.invite_code));
  if v_real is null or v_real = '' then
    v_real := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  v_decoy := 'DQ' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14));
  insert into public.st_group_quick_join (team_id, code, enabled)
  values (new.id, v_real, true)
  on conflict (team_id) do nothing;
  new.invite_code := v_decoy;
  return new;
end;
$$;

drop trigger if exists st_teams_seal_quick_join_code on public.st_teams;
create trigger st_teams_seal_quick_join_code
  before insert on public.st_teams
  for each row execute function public.st_teams_seal_quick_join_code();

alter table public.st_group_quick_join enable row level security;

drop policy if exists "quick_join_select_managers" on public.st_group_quick_join;
create policy "quick_join_select_managers" on public.st_group_quick_join
  for select to authenticated
  using (public.st_user_can_edit_team(team_id));

revoke insert, update, delete on public.st_group_quick_join from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Token hash. Not granted to clients.
-- ---------------------------------------------------------------------------

create or replace function public.st_hash_invite_token(p_token text)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
begin
  if coalesce(trim(p_token), '') = '' then
    return null;
  end if;
  return encode(extensions.digest(convert_to(trim(p_token), 'UTF8'), 'sha256'), 'hex');
end;
$$;

revoke all on function public.st_hash_invite_token(text) from public, anon, authenticated;

create or replace function public.st_new_invite_token()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select encode(extensions.gen_random_bytes(32), 'hex');
$$;

revoke all on function public.st_new_invite_token() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who may invite which role. Owner is never an invitation role.
-- ---------------------------------------------------------------------------

create or replace function public.st_user_can_invite_role(p_team_id uuid, p_role text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_flag boolean;
begin
  if auth.uid() is null or p_role not in ('member', 'manager') then
    return false;
  end if;

  select m.role into v_role
  from public.st_team_members m
  where m.team_id = p_team_id
    and m.user_id = auth.uid()
    and m.status = 'active';

  if v_role = 'editor' then
    v_role := 'manager';
  end if;

  if v_role = 'owner' then
    return true;
  end if;

  if v_role = 'manager' and p_role = 'member' then
    return true;
  end if;

  if v_role = 'manager' and p_role = 'manager' then
    select coalesce(t.managers_can_invite_managers, false) into v_flag
    from public.st_teams t
    where t.id = p_team_id;
    return coalesce(v_flag, false);
  end if;

  return false;
end;
$$;

revoke all on function public.st_user_can_invite_role(uuid, text) from public;
grant execute on function public.st_user_can_invite_role(uuid, text) to authenticated;

-- Group participation slot only. Does not write the personal slot or followed_program_id.
create or replace function public.st_ensure_group_participation(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program uuid;
  v_key text;
begin
  if auth.uid() is null or p_team_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.st_team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) then
    return;
  end if;

  v_key := 'group:' || p_team_id::text;
  if v_key = 'personal' then
    raise exception 'Refusing to change personal training';
  end if;

  select t.default_program_id into v_program
  from public.st_teams t
  where t.id = p_team_id;

  insert into public.st_training_enrollments (user_id, source_kind, source_key, team_id, program_id, status)
  values (auth.uid(), 'group', v_key, p_team_id, v_program, 'active')
  on conflict (user_id, source_key) do update
    set status = 'active',
        updated_at = now(),
        program_id = coalesce(public.st_training_enrollments.program_id, excluded.program_id)
    where public.st_training_enrollments.source_kind = 'group'
      and public.st_training_enrollments.source_key <> 'personal';
exception
  when undefined_table then
    return;
end;
$$;

revoke all on function public.st_ensure_group_participation(uuid) from public, anon, authenticated;

create or replace function public.st_create_group_invite(
  p_team_id uuid,
  p_email text,
  p_display_name text,
  p_role text,
  p_classification_ids uuid[] default '{}'
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text;
  v_role text;
  v_token text;
  v_hash text;
  v_expires timestamptz;
  v_ids uuid[];
  v_row public.st_group_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;

  v_role := lower(trim(coalesce(p_role, 'member')));
  if v_role = 'owner' then
    raise exception 'Ownership is transferred separately. An invitation cannot create an Owner';
  end if;
  if v_role not in ('member', 'manager') then
    raise exception 'Role must be Member or Manager';
  end if;
  if not public.st_user_can_invite_role(p_team_id, v_role) then
    raise exception 'You cannot invite that role';
  end if;

  if exists (
    select 1 from public.st_teams t
    where t.id = p_team_id and coalesce(t.is_archived, false) = true
  ) then
    raise exception 'This group is archived';
  end if;

  if exists (
    select 1
    from public.st_team_members m
    join auth.users u on u.id = m.user_id
    where m.team_id = p_team_id
      and m.status = 'active'
      and lower(u.email) = v_email
  ) then
    raise exception 'This person is already in the group';
  end if;

  select coalesce(array_agg(c.id), '{}')
  into v_ids
  from public.st_group_classifications c
  where c.team_id = p_team_id
    and c.id = any(coalesce(p_classification_ids, '{}'));

  v_token := public.st_new_invite_token();
  v_hash := public.st_hash_invite_token(v_token);
  v_expires := now() + interval '7 days';

  insert into public.st_group_invites (
    team_id, email, display_name, role, invited_by, status,
    token_hash, expires_at, classification_ids, last_sent_at, accepted_at, accepted_by_user_id, updated_at
  )
  values (
    p_team_id, v_email, nullif(trim(coalesce(p_display_name, '')), ''), v_role, auth.uid(), 'pending',
    v_hash, v_expires, coalesce(v_ids, '{}'), now(), null, null, now()
  )
  on conflict (team_id, email) do update
    set display_name = excluded.display_name,
        role = excluded.role,
        invited_by = auth.uid(),
        status = 'pending',
        token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        classification_ids = excluded.classification_ids,
        last_sent_at = now(),
        accepted_at = null,
        accepted_by_user_id = null,
        updated_at = now()
  returning * into v_row;

  -- Notification hook: group_invitation. Delivery is a later phase.
  return json_build_object(
    'id', v_row.id,
    'token', v_token,
    'expires_at', v_row.expires_at,
    'email', v_row.email,
    'role', v_row.role
  );
end;
$$;

revoke all on function public.st_create_group_invite(uuid, text, text, text, uuid[]) from public;
grant execute on function public.st_create_group_invite(uuid, text, text, text, uuid[]) to authenticated;

create or replace function public.st_resend_group_invite(p_invite_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.st_group_invites%rowtype;
  v_token text;
  v_hash text;
  v_expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_row
  from public.st_group_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if not public.st_user_can_invite_role(v_row.team_id, v_row.role) then
    raise exception 'You cannot resend this invitation';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Only a pending invitation can be resent';
  end if;

  v_token := public.st_new_invite_token();
  v_hash := public.st_hash_invite_token(v_token);
  v_expires := now() + interval '7 days';

  update public.st_group_invites
  set token_hash = v_hash,
      expires_at = v_expires,
      last_sent_at = now(),
      updated_at = now()
  where id = p_invite_id;

  -- Notification hook: group_invitation (resend). Delivery is a later phase.
  return json_build_object(
    'id', p_invite_id,
    'token', v_token,
    'expires_at', v_expires,
    'email', v_row.email,
    'role', v_row.role,
    'team_id', v_row.team_id
  );
end;
$$;

revoke all on function public.st_resend_group_invite(uuid) from public;
grant execute on function public.st_resend_group_invite(uuid) to authenticated;

create or replace function public.st_revoke_group_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.st_group_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_row
  from public.st_group_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if not public.st_user_can_invite_role(v_row.team_id, 'member')
     and not public.st_user_is_team_owner(v_row.team_id) then
    raise exception 'You cannot cancel this invitation';
  end if;
  if v_row.role = 'manager' and not public.st_user_can_invite_role(v_row.team_id, 'manager') then
    raise exception 'You cannot cancel this invitation';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Only a pending invitation can be canceled';
  end if;

  update public.st_group_invites
  set status = 'revoked',
      updated_at = now()
  where id = p_invite_id;
end;
$$;

revoke all on function public.st_revoke_group_invite(uuid) from public;
grant execute on function public.st_revoke_group_invite(uuid) to authenticated;

create or replace function public.st_preview_group_invite(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_row public.st_group_invites%rowtype;
  v_email text;
  v_team public.st_teams%rowtype;
  v_inviter text;
begin
  if auth.uid() is null then
    return json_build_object('state', 'unauthenticated');
  end if;

  v_hash := public.st_hash_invite_token(p_token);
  if v_hash is null then
    return json_build_object('state', 'invalid');
  end if;

  select * into v_row
  from public.st_group_invites
  where token_hash = v_hash;

  if not found then
    return json_build_object('state', 'invalid');
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid();

  if v_email is null or v_email is distinct from v_row.email then
    return json_build_object('state', 'email_mismatch');
  end if;

  select * into v_team from public.st_teams where id = v_row.team_id;

  select coalesce(nullif(trim(m.display_name), ''), 'A group member')
  into v_inviter
  from public.st_team_members m
  where m.team_id = v_row.team_id
    and m.user_id = v_row.invited_by
  limit 1;

  if v_row.status = 'revoked' or v_row.token_hash is null then
    return json_build_object('state', 'revoked');
  end if;
  if v_row.status = 'accepted' then
    return json_build_object(
      'state', 'accepted',
      'group_name', v_team.name,
      'inviter_name', coalesce(v_inviter, 'A group member'),
      'role', v_row.role
    );
  end if;
  if v_row.status <> 'pending' or v_row.expires_at is null or v_row.expires_at < now() then
    return json_build_object(
      'state', 'expired',
      'group_name', v_team.name,
      'inviter_name', coalesce(v_inviter, 'A group member'),
      'role', v_row.role
    );
  end if;
  if coalesce(v_team.is_archived, false) then
    return json_build_object('state', 'archived', 'group_name', v_team.name);
  end if;

  return json_build_object(
    'state', 'ready',
    'group_name', v_team.name,
    'inviter_name', coalesce(v_inviter, 'A group member'),
    'role', v_row.role,
    'expires_at', v_row.expires_at
  );
end;
$$;

revoke all on function public.st_preview_group_invite(text) from public;
grant execute on function public.st_preview_group_invite(text) to authenticated;

create or replace function public.st_accept_group_invite(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_row public.st_group_invites%rowtype;
  v_email text;
  v_team public.st_teams%rowtype;
  v_member public.st_team_members%rowtype;
  v_member_id uuid;
  v_display text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_hash := public.st_hash_invite_token(p_token);
  if v_hash is null then
    raise exception 'This invitation link is not valid';
  end if;

  select * into v_row
  from public.st_group_invites
  where token_hash = v_hash
  for update;

  if not found or v_row.token_hash is null then
    raise exception 'This invitation link is not valid';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid();

  if v_email is null or v_email is distinct from v_row.email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  if v_row.status = 'accepted' and v_row.accepted_by_user_id = auth.uid() then
    return json_build_object('ok', true, 'already_accepted', true, 'team_id', v_row.team_id);
  end if;
  if v_row.status = 'accepted' then
    raise exception 'This invitation has already been used';
  end if;
  if v_row.status = 'revoked' then
    raise exception 'This invitation was canceled';
  end if;
  if v_row.status <> 'pending' or v_row.expires_at is null or v_row.expires_at < now() then
    raise exception 'This invitation has expired';
  end if;
  if v_row.role not in ('member', 'manager') then
    raise exception 'This invitation is not valid';
  end if;

  select * into v_team from public.st_teams where id = v_row.team_id;
  if not found or coalesce(v_team.is_archived, false) then
    raise exception 'This group is not accepting members';
  end if;

  select coalesce(nullif(trim(v_row.display_name), ''), nullif(trim(u.raw_user_meta_data->>'display_name'), ''))
  into v_display
  from auth.users u
  where u.id = auth.uid();

  perform set_config('app.st_join_team_id', v_row.team_id::text, true);
  perform set_config('app.st_secure_invite_approved', 'true', true);
  perform set_config('app.st_secure_invite_role', v_row.role, true);

  select * into v_member
  from public.st_team_members
  where team_id = v_row.team_id
    and user_id = auth.uid();

  if found and v_member.status = 'active' then
    v_member_id := v_member.id;
  else
    insert into public.st_team_members (team_id, user_id, display_name, role, status)
    values (v_row.team_id, auth.uid(), v_display, v_row.role, 'active')
    on conflict (team_id, user_id) do update
      set status = 'active',
          role = excluded.role,
          display_name = coalesce(excluded.display_name, public.st_team_members.display_name)
    returning id into v_member_id;
  end if;

  insert into public.st_group_member_classifications (member_id, classification_id)
  select v_member_id, c.id
  from public.st_group_classifications c
  where c.team_id = v_row.team_id
    and c.id = any(coalesce(v_row.classification_ids, '{}'))
  on conflict do nothing;

  perform public.st_ensure_group_participation(v_row.team_id);

  update public.st_group_invites
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      accepted_by_user_id = auth.uid(),
      updated_at = now()
  where id = v_row.id
    and status = 'pending';

  -- Notification hook: group_invitation_accepted. Delivery is a later phase.
  return json_build_object('ok', true, 'team_id', v_row.team_id, 'invite_id', v_row.id, 'role', v_row.role);
end;
$$;

revoke all on function public.st_accept_group_invite(text) from public;
grant execute on function public.st_accept_group_invite(text) to authenticated;

-- Joining by code must not apply an emailed invitation role.
create or replace function public.st_mark_group_invite_accepted(
  p_team_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Intentionally empty. BIQ-0242 acceptance is st_accept_group_invite.
  return;
end;
$$;

-- Quick Join: Member only. Archived and disabled codes are rejected.
create or replace function public.st_join_team_by_invite(
  p_invite_code text,
  p_display_name text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_name text;
  v_owner uuid;
  v_enabled boolean;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select q.team_id, q.enabled, t.name, t.owner_user_id
  into v_team_id, v_enabled, v_name, v_owner
  from public.st_group_quick_join q
  join public.st_teams t on t.id = q.team_id
  where q.code = upper(trim(p_invite_code))
    and coalesce(t.is_archived, false) = false
  limit 1;

  if not found then
    raise exception 'Group not found';
  end if;
  if coalesce(v_enabled, false) = false then
    raise exception 'Quick Join is turned off for this group';
  end if;

  perform set_config('app.st_join_team_id', v_team_id::text, true);
  perform set_config('app.st_join_team_approved', 'true', true);

  insert into public.st_team_members (team_id, user_id, display_name, role, status)
  values (v_team_id, v_uid, p_display_name, 'member', 'active')
  on conflict (team_id, user_id) do update
    set display_name = coalesce(excluded.display_name, public.st_team_members.display_name),
        status = 'active',
        role = case
          when public.st_team_members.status = 'active' then public.st_team_members.role
          else 'member'
        end;

  perform public.st_ensure_group_participation(v_team_id);

  return json_build_object(
    'id', v_team_id,
    'name', v_name,
    'owner_user_id', v_owner
  );
end;
$$;

alter function public.st_join_team_by_invite(text, text) owner to postgres;

create or replace function public.st_group_quick_join_info(p_team_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_enabled boolean;
  v_owner boolean;
begin
  if auth.uid() is null or not public.st_user_can_edit_team(p_team_id) then
    return json_build_object('enabled', false, 'code', null);
  end if;

  select q.code, q.enabled into v_code, v_enabled
  from public.st_group_quick_join q
  where q.team_id = p_team_id;

  v_owner := public.st_user_is_team_owner(p_team_id);
  if v_owner then
    return json_build_object('enabled', coalesce(v_enabled, false), 'code', v_code);
  end if;
  if coalesce(v_enabled, false) then
    return json_build_object('enabled', true, 'code', v_code);
  end if;
  return json_build_object('enabled', false, 'code', null);
end;
$$;

revoke all on function public.st_group_quick_join_info(uuid) from public;
grant execute on function public.st_group_quick_join_info(uuid) to authenticated;

create or replace function public.st_set_group_quick_join(p_team_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.st_user_is_team_owner(p_team_id) then
    raise exception 'Only the group owner can change Quick Join';
  end if;
  update public.st_group_quick_join
  set enabled = coalesce(p_enabled, false),
      updated_at = now()
  where team_id = p_team_id;
end;
$$;

revoke all on function public.st_set_group_quick_join(uuid, boolean) from public;
grant execute on function public.st_set_group_quick_join(uuid, boolean) to authenticated;

create or replace function public.st_regenerate_group_code(p_team_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
begin
  if not public.st_user_is_team_owner(p_team_id) then
    raise exception 'Only the group owner can regenerate the group code';
  end if;
  v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  update public.st_group_quick_join
  set code = v_code,
      updated_at = now()
  where team_id = p_team_id;
  if not found then
    raise exception 'Quick Join is not set up for this group';
  end if;
  return v_code;
end;
$$;

revoke all on function public.st_regenerate_group_code(uuid) from public;
grant execute on function public.st_regenerate_group_code(uuid) to authenticated;

-- Insert/update policies so acceptance works when RLS is enforced inside security definer.
drop policy if exists "team_members_insert_via_secure_invite" on public.st_team_members;
create policy "team_members_insert_via_secure_invite" on public.st_team_members
  for insert
  with check (
    user_id = auth.uid()
    and current_setting('app.st_secure_invite_approved', true) = 'true'
    and team_id::text = current_setting('app.st_join_team_id', true)
    and role = current_setting('app.st_secure_invite_role', true)
    and role in ('member', 'manager')
  );

drop policy if exists "team_members_update_via_join" on public.st_team_members;
create policy "team_members_update_via_join" on public.st_team_members
  for update
  using (
    user_id = auth.uid()
    and team_id::text = current_setting('app.st_join_team_id', true)
    and (
      current_setting('app.st_join_team_approved', true) = 'true'
      or current_setting('app.st_secure_invite_approved', true) = 'true'
    )
  )
  with check (
    user_id = auth.uid()
    and team_id::text = current_setting('app.st_join_team_id', true)
    and role in ('member', 'manager', 'owner')
    and (
      (current_setting('app.st_join_team_approved', true) = 'true' and role = 'member')
      or current_setting('app.st_join_team_approved', true) = 'true'
      or (
        current_setting('app.st_secure_invite_approved', true) = 'true'
        and role = current_setting('app.st_secure_invite_role', true)
      )
      or role = 'owner'
    )
  );

drop policy if exists "group_member_classifications_insert_via_invite" on public.st_group_member_classifications;
create policy "group_member_classifications_insert_via_invite" on public.st_group_member_classifications
  for insert
  with check (
    current_setting('app.st_secure_invite_approved', true) = 'true'
    and exists (
      select 1
      from public.st_team_members tm
      where tm.id = member_id
        and tm.user_id = auth.uid()
        and tm.team_id::text = current_setting('app.st_join_team_id', true)
    )
    and exists (
      select 1
      from public.st_group_classifications gc
      where gc.id = classification_id
        and gc.team_id::text = current_setting('app.st_join_team_id', true)
    )
  );

-- Clients can read invitation rows they manage, but not the token hash.
revoke select (token_hash) on public.st_group_invites from public, anon, authenticated;
revoke insert, update, delete on public.st_group_invites from public, anon, authenticated;


-- ===== 20261005_057_notification_foundation.sql =====

-- BIQ-0243: Notification foundation.
-- One private notification per user. This is not a group activity feed and not chat.
-- Chat unread state stays on future conversation membership, not on st_notifications.
-- Apply manually after 056. Do not apply from the app.

-- ---------------------------------------------------------------------------
-- Preferences. Categories, not raw event names.
-- In-app defaults on. Email defaults off. Push is not a column yet.
-- ---------------------------------------------------------------------------

create table if not exists public.st_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages_in_app boolean not null default true,
  training_assignments_in_app boolean not null default true,
  program_updates_in_app boolean not null default true,
  group_activity_in_app boolean not null default true,
  reminders_in_app boolean not null default true,
  messages_email boolean not null default false,
  training_assignments_email boolean not null default false,
  program_updates_email boolean not null default false,
  group_activity_email boolean not null default false,
  reminders_email boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.st_notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_own" on public.st_notification_preferences;
create policy "notification_preferences_select_own" on public.st_notification_preferences
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_preferences_insert_own" on public.st_notification_preferences;
create policy "notification_preferences_insert_own" on public.st_notification_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_preferences_update_own" on public.st_notification_preferences;
create policy "notification_preferences_update_own" on public.st_notification_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notifications. Title and body are the short message.
-- destination_* points at the entity. Workout and program bodies are not copied here.
-- ---------------------------------------------------------------------------

create table if not exists public.st_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'group_invitation',
    'group_invitation_accepted',
    'program_assigned',
    'program_updated',
    'workout_assigned',
    'group_message',
    'direct_message'
  )),
  category text not null check (category in (
    'messages',
    'training_assignments',
    'program_updates',
    'group_activity',
    'reminders'
  )),
  title text not null,
  body text not null,
  destination_kind text check (destination_kind is null or destination_kind in (
    'group', 'member', 'conversation', 'program', 'workout', 'progress', 'invitation'
  )),
  destination_id uuid,
  team_id uuid references public.st_teams(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create unique index if not exists st_notifications_dedupe_uidx
  on public.st_notifications (user_id, dedupe_key);

create index if not exists st_notifications_user_created_idx
  on public.st_notifications (user_id, created_at desc);

create index if not exists st_notifications_unread_user_idx
  on public.st_notifications (user_id, created_at desc)
  where read_at is null;

comment on table public.st_notifications is
  'Private per-user alerts. Not the group activity feed and not chat unread state.';

alter table public.st_notifications enable row level security;

drop policy if exists "notifications_select_own" on public.st_notifications;
create policy "notifications_select_own" on public.st_notifications
  for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.st_notifications from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Publish. Server-side only. Honors the in-app preference. Email is not sent here.
-- ---------------------------------------------------------------------------

create or replace function public.st_notification_category(p_event_type text)
returns text
language sql
immutable
as $$
  select case p_event_type
    when 'group_message' then 'messages'
    when 'direct_message' then 'messages'
    when 'workout_assigned' then 'training_assignments'
    when 'program_assigned' then 'training_assignments'
    when 'program_updated' then 'program_updates'
    when 'group_invitation' then 'group_activity'
    when 'group_invitation_accepted' then 'group_activity'
    else null
  end;
$$;

revoke all on function public.st_notification_category(text) from public, anon, authenticated;

create or replace function public.st_notification_in_app_enabled(p_user_id uuid, p_category text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pref public.st_notification_preferences%rowtype;
begin
  if p_user_id is null or p_category is null then
    return false;
  end if;
  select * into v_pref from public.st_notification_preferences where user_id = p_user_id;
  if not found then
    return true;
  end if;
  if p_category = 'messages' then return v_pref.messages_in_app; end if;
  if p_category = 'training_assignments' then return v_pref.training_assignments_in_app; end if;
  if p_category = 'program_updates' then return v_pref.program_updates_in_app; end if;
  if p_category = 'group_activity' then return v_pref.group_activity_in_app; end if;
  if p_category = 'reminders' then return v_pref.reminders_in_app; end if;
  return false;
end;
$$;

revoke all on function public.st_notification_in_app_enabled(uuid, text) from public, anon, authenticated;

create or replace function public.st_notification_display_name(p_user_id uuid, p_team_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if p_user_id is null then
    return 'Someone';
  end if;
  select nullif(trim(m.display_name), '') into v_name
  from public.st_team_members m
  where m.user_id = p_user_id and m.team_id = p_team_id
  limit 1;
  if v_name is not null then
    return v_name;
  end if;
  select nullif(trim(p.display_name), '') into v_name
  from public.st_profiles p
  where p.user_id = p_user_id;
  return coalesce(v_name, 'Someone');
end;
$$;

revoke all on function public.st_notification_display_name(uuid, uuid) from public, anon, authenticated;

create or replace function public.st_publish_notification(
  p_user_id uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_destination_kind text,
  p_destination_id uuid,
  p_team_id uuid,
  p_dedupe_key text,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_id uuid;
begin
  if p_user_id is null or coalesce(trim(p_title), '') = '' then
    return null;
  end if;
  v_category := public.st_notification_category(p_event_type);
  if v_category is null then
    return null;
  end if;
  if not public.st_notification_in_app_enabled(p_user_id, v_category) then
    return null;
  end if;

  insert into public.st_notifications (
    user_id, event_type, category, title, body,
    destination_kind, destination_id, team_id, actor_user_id, dedupe_key
  ) values (
    p_user_id, p_event_type, v_category, left(trim(p_title), 180), left(coalesce(p_body, ''), 400),
    p_destination_kind, p_destination_id, p_team_id, p_actor_user_id, nullif(trim(p_dedupe_key), '')
  )
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.st_publish_notification(uuid, text, text, text, text, uuid, uuid, text, uuid) from public, anon, authenticated;

create or replace function public.st_mark_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_id is null then
    return;
  end if;
  update public.st_notifications
  set read_at = coalesce(read_at, now())
  where id = p_id
    and user_id = auth.uid();
end;
$$;

revoke all on function public.st_mark_notification_read(uuid) from public;
grant execute on function public.st_mark_notification_read(uuid) to authenticated;

create or replace function public.st_mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.st_notifications
  set read_at = coalesce(read_at, now())
  where user_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.st_mark_all_notifications_read() from public;
grant execute on function public.st_mark_all_notifications_read() to authenticated;

-- ---------------------------------------------------------------------------
-- Group invitations. No account means no in-app row. The invitation email stays separate.
-- ---------------------------------------------------------------------------

create or replace function public.st_notify_group_invite_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_team_name text;
  v_actor text;
  v_role text;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.token_hash is not distinct from old.token_hash then
    return new;
  end if;

  select t.name into v_team_name from public.st_teams t where t.id = new.team_id;

  if new.status = 'pending' and new.token_hash is not null then
    select u.id into v_user
    from auth.users u
    where lower(u.email) = new.email
    limit 1;
    if v_user is null or v_user = new.invited_by then
      return new;
    end if;
    v_actor := public.st_notification_display_name(new.invited_by, new.team_id);
    v_role := case when new.role = 'manager' then 'Manager' else 'Member' end;
    perform public.st_publish_notification(
      v_user,
      'group_invitation',
      v_actor || ' invited you to ' || coalesce(v_team_name, 'a group'),
      'You would join as a ' || v_role || '.',
      'invitation',
      new.id,
      new.team_id,
      'group_invitation:' || new.id::text || ':' || new.token_hash,
      new.invited_by
    );
  elsif new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    if new.invited_by is null or new.invited_by = new.accepted_by_user_id then
      return new;
    end if;
    v_actor := public.st_notification_display_name(new.accepted_by_user_id, new.team_id);
    perform public.st_publish_notification(
      new.invited_by,
      'group_invitation_accepted',
      v_actor || ' joined ' || coalesce(v_team_name, 'your group'),
      'They accepted your invitation.',
      'group',
      new.team_id,
      new.team_id,
      'group_invitation_accepted:' || new.id::text,
      new.accepted_by_user_id
    );
  end if;
  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists st_notify_group_invite_change on public.st_group_invites;
create trigger st_notify_group_invite_change
  after insert or update on public.st_group_invites
  for each row execute function public.st_notify_group_invite_change();

-- ---------------------------------------------------------------------------
-- One notification per program assignment, and one per workout recipient.
-- Not one per exercise or set.
-- ---------------------------------------------------------------------------

create or replace function public.st_notify_program_assignment(
  p_assignment_id uuid,
  p_team_id uuid,
  p_member_user_id uuid,
  p_program_id uuid,
  p_assignment_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program text;
  v_team text;
  v_actor text;
begin
  if p_assignment_id is null or p_program_id is null then
    return;
  end if;
  if p_assignment_type not in ('team', 'individual_team', 'manual') then
    return;
  end if;
  if p_member_user_id is null or p_member_user_id = auth.uid() then
    return;
  end if;
  select pr.name into v_program from public.st_programs pr where pr.id = p_program_id;
  select t.name into v_team from public.st_teams t where t.id = p_team_id;
  v_actor := public.st_notification_display_name(auth.uid(), p_team_id);
  perform public.st_publish_notification(
    p_member_user_id,
    'program_assigned',
    coalesce(v_program, 'A program') || ' was assigned to you',
    v_actor || ' assigned this program in ' || coalesce(v_team, 'your group') || '.',
    'program',
    p_program_id,
    p_team_id,
    'program_assigned:' || p_assignment_id::text,
    auth.uid()
  );
exception
  when others then
    return;
end;
$$;

revoke all on function public.st_notify_program_assignment(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.st_notify_workout_recipient(
  p_assignment_id uuid,
  p_team_id uuid,
  p_recipient uuid,
  p_label text,
  p_workout_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_label text;
begin
  if p_assignment_id is null or p_recipient is null or p_recipient = auth.uid() then
    return;
  end if;
  v_label := coalesce(nullif(trim(p_label), ''), 'A workout');
  v_actor := public.st_notification_display_name(auth.uid(), p_team_id);
  perform public.st_publish_notification(
    p_recipient,
    'workout_assigned',
    v_label,
    v_actor || ' assigned you ' || v_label || '.',
    'workout',
    coalesce(p_workout_id, p_assignment_id),
    p_team_id,
    'workout_assigned:' || p_assignment_id::text || ':' || p_recipient::text,
    auth.uid()
  );
exception
  when others then
    return;
end;
$$;

revoke all on function public.st_notify_workout_recipient(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;

create or replace function public.st_assign_member_program(
  p_team_id uuid,
  p_member_user_id uuid,
  p_assignment_type text,
  p_program_id uuid default null,
  p_notes text default null,
  p_coaching_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if p_assignment_type not in ('personal', 'team', 'individual_team', 'manual') then
    raise exception 'Invalid assignment type';
  end if;
  if p_assignment_type in ('individual_team', 'manual') and p_program_id is null then
    raise exception 'Select a program for this assignment type';
  end if;
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = p_member_user_id and status = 'active'
  ) then
    raise exception 'Member not found';
  end if;

  update public.st_program_assignments
  set is_active = false
  where user_id = p_member_user_id and team_id = p_team_id and is_active = true;

  insert into public.st_program_assignments (
    user_id, team_id, assigned_by, assignment_type, program_id, notes, is_active, target_type, coaching_metadata
  ) values (
    p_member_user_id,
    p_team_id,
    auth.uid(),
    p_assignment_type,
    p_program_id,
    nullif(trim(p_notes), ''),
    true,
    'individual',
    coalesce(p_coaching_metadata, '{}'::jsonb)
  )
  returning id into v_assignment_id;

  update public.st_team_members
  set training_source = case when p_assignment_type = 'personal' then 'personal' else 'team' end
  where team_id = p_team_id and user_id = p_member_user_id and status = 'active';

  perform public.st_notify_program_assignment(
    v_assignment_id, p_team_id, p_member_user_id, p_program_id, p_assignment_type
  );
end;
$$;

create or replace function public.st_assign_workout_to_targets(
  p_team_id uuid,
  p_workout_id uuid default null,
  p_program_id uuid default null,
  p_workout_date date default null,
  p_target_type text default 'individual',
  p_target_classification_id uuid default null,
  p_target_user_ids uuid[] default null,
  p_scheduled_date date default current_date,
  p_due_date date default null,
  p_title text default null,
  p_notes text default null,
  p_coaching_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_uid uuid;
  v_recipient uuid;
  v_label text;
  v_day text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if p_target_type not in ('group', 'classification', 'members', 'individual') then
    raise exception 'Invalid target type';
  end if;
  if p_workout_id is null and (p_program_id is null or p_workout_date is null) then
    raise exception 'Provide workout_id or program_id with workout_date';
  end if;
  if p_target_type = 'classification' and p_target_classification_id is null then
    raise exception 'Classification target requires target_classification_id';
  end if;
  if p_target_type in ('members', 'individual') and (p_target_user_ids is null or array_length(p_target_user_ids, 1) is null) then
    raise exception 'Member targets require target_user_ids';
  end if;

  insert into public.st_workout_assignments (
    team_id, assigned_by, workout_id, program_id, workout_date, target_type,
    target_classification_id, scheduled_date, due_date, title, notes, coaching_metadata
  ) values (
    p_team_id, auth.uid(), p_workout_id, p_program_id, p_workout_date, p_target_type,
    p_target_classification_id, coalesce(p_scheduled_date, current_date), p_due_date,
    p_title, p_notes, coalesce(p_coaching_metadata, '{}'::jsonb)
  )
  returning id into v_assignment_id;

  select w.day_label into v_day from public.st_workouts w where w.id = p_workout_id;
  v_label := coalesce(nullif(trim(p_title), ''), nullif(trim(v_day), ''), 'A workout');

  if p_target_type = 'group' then
    for v_recipient in
      select tm.user_id from public.st_team_members tm
      where tm.team_id = p_team_id and tm.status = 'active' and tm.is_active_participant = true
    loop
      insert into public.st_assignment_recipients (assignment_id, user_id)
      values (v_assignment_id, v_recipient)
      on conflict (assignment_id, user_id) do nothing;
      perform public.st_notify_workout_recipient(v_assignment_id, p_team_id, v_recipient, v_label, p_workout_id);
    end loop;
  elsif p_target_type = 'classification' then
    for v_recipient in
      select distinct tm.user_id
      from public.st_team_members tm
      join public.st_group_member_classifications gmc on gmc.member_id = tm.id
      where tm.team_id = p_team_id and tm.status = 'active' and tm.is_active_participant = true
        and gmc.classification_id = p_target_classification_id
    loop
      insert into public.st_assignment_recipients (assignment_id, user_id)
      values (v_assignment_id, v_recipient)
      on conflict (assignment_id, user_id) do nothing;
      perform public.st_notify_workout_recipient(v_assignment_id, p_team_id, v_recipient, v_label, p_workout_id);
    end loop;
  else
    foreach v_uid in array p_target_user_ids loop
      if exists (
        select 1 from public.st_team_members tm
        where tm.team_id = p_team_id and tm.user_id = v_uid and tm.status = 'active'
      ) then
        insert into public.st_assignment_recipients (assignment_id, user_id)
        values (v_assignment_id, v_uid)
        on conflict (assignment_id, user_id) do nothing;
        perform public.st_notify_workout_recipient(v_assignment_id, p_team_id, v_uid, v_label, p_workout_id);
      end if;
    end loop;
  end if;

  return v_assignment_id;
end;
$$;


-- ===== 20261005_058_group_communication.sql =====

-- BIQ-0244 Group communication.
-- Apply after 20261005_057_notification_foundation.sql.
-- Do not apply from the app. Run this manually in Supabase.
--
-- conversation_type is group or direct in this phase.
-- A later migration can add classification without a new message table.
-- Future workout, program, exercise, or progress references can be added as
-- columns. Do not copy that data into the message body.
-- Chat is human communication. It is not the notification bell and not group activity.

alter table public.st_teams
  add column if not exists members_can_use_group_chat boolean not null default true,
  add column if not exists members_can_message_managers boolean not null default true,
  add column if not exists members_can_message_members boolean not null default false;

comment on column public.st_teams.members_can_use_group_chat is
  'When false, members cannot read or send in the primary group chat. Owners and managers still can. History is kept.';
comment on column public.st_teams.members_can_message_managers is
  'When false, members cannot send new direct messages to owners or managers. They can still read existing direct history while they remain in the group.';
comment on column public.st_teams.members_can_message_members is
  'When false, members cannot direct-message other members. Default off.';

create table if not exists public.st_conversations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  conversation_type text not null,
  participant_key text not null,
  created_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint st_conversations_type_check check (conversation_type in ('group', 'direct')),
  constraint st_conversations_team_participant_key unique (team_id, participant_key)
);

create unique index if not exists st_conversations_one_primary_group_chat
  on public.st_conversations (team_id)
  where conversation_type = 'group';

comment on table public.st_conversations is
  'One human conversation. group is the single primary group chat. direct is one pair inside one group. classification can be added later.';

create table if not exists public.st_conversation_members (
  conversation_id uuid not null references public.st_conversations(id) on delete cascade,
  user_id uuid not null,
  joined_at timestamptz not null default clock_timestamp(),
  left_at timestamptz,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

comment on table public.st_conversation_members is
  'Per-user read cursor (last_read_at). A row here does not grant access after the person leaves the group.';

create index if not exists st_conversation_members_user_idx
  on public.st_conversation_members (user_id);

create table if not exists public.st_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.st_conversations(id) on delete cascade,
  sender_user_id uuid not null,
  body text not null default '',
  created_at timestamptz not null default clock_timestamp(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint st_messages_body_check check (
    char_length(body) <= 2000
    and (
      (deleted_at is not null and body = '')
      or (deleted_at is null and char_length(btrim(body)) > 0)
    )
  )
);

comment on table public.st_messages is
  'Text messages only. Soft delete clears body. Authorization is current group membership, not this table.';

create index if not exists st_messages_conversation_created_idx
  on public.st_messages (conversation_id, created_at desc, id desc);

alter table public.st_messages replica identity full;

-- ---------------------------------------------------------------------------
-- Authorization. Active group membership is required every time.
-- A leftover st_conversation_members row is not enough.
-- ---------------------------------------------------------------------------

create or replace function public.st_chat_member_role(p_team_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when lower(m.role) in ('editor', 'manager') then 'manager'
    when lower(m.role) = 'owner' then 'owner'
    when lower(m.role) = 'member' then 'member'
    else null
  end
  from public.st_team_members m
  join public.st_teams t on t.id = m.team_id
  where m.team_id = p_team_id
    and m.user_id = p_user_id
    and m.status = 'active'
    and coalesce(t.is_archived, false) = false
  limit 1;
$$;

create or replace function public.st_chat_user_can_read(p_user_id uuid, p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_type text;
  v_role text;
  v_group_chat boolean;
begin
  if p_user_id is null or p_conversation_id is null then
    return false;
  end if;

  select c.team_id, c.conversation_type
    into v_team, v_type
  from public.st_conversations c
  where c.id = p_conversation_id;

  if v_team is null then
    return false;
  end if;

  v_role := public.st_chat_member_role(v_team, p_user_id);
  if v_role is null then
    return false;
  end if;

  if v_type = 'group' then
    if v_role in ('owner', 'manager') then
      return true;
    end if;
    select t.members_can_use_group_chat into v_group_chat
    from public.st_teams t
    where t.id = v_team;
    return coalesce(v_group_chat, false);
  end if;

  if v_type = 'direct' then
    return exists (
      select 1
      from public.st_conversation_members cm
      where cm.conversation_id = p_conversation_id
        and cm.user_id = p_user_id
        and cm.left_at is null
    );
  end if;

  return false;
end;
$$;

create or replace function public.st_chat_user_can_send(p_user_id uuid, p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_type text;
  v_role text;
  v_other uuid;
  v_other_role text;
  v_managers boolean;
  v_members boolean;
begin
  if not public.st_chat_user_can_read(p_user_id, p_conversation_id) then
    return false;
  end if;

  select c.team_id, c.conversation_type
    into v_team, v_type
  from public.st_conversations c
  where c.id = p_conversation_id;

  v_role := public.st_chat_member_role(v_team, p_user_id);

  if v_type = 'group' then
    return true;
  end if;

  if v_type <> 'direct' then
    return false;
  end if;

  select cm.user_id into v_other
  from public.st_conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id <> p_user_id
    and cm.left_at is null
  limit 1;

  v_other_role := public.st_chat_member_role(v_team, v_other);
  if v_other_role is null then
    return false;
  end if;

  if v_role in ('owner', 'manager') then
    return true;
  end if;

  select t.members_can_message_managers, t.members_can_message_members
    into v_managers, v_members
  from public.st_teams t
  where t.id = v_team;

  if v_other_role in ('owner', 'manager') then
    return coalesce(v_managers, false);
  end if;

  if v_other_role = 'member' then
    return coalesce(v_members, false);
  end if;

  return false;
end;
$$;

create or replace function public.st_chat_can_start_direct(p_team_id uuid, p_caller uuid, p_other uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller text;
  v_other text;
  v_managers boolean;
  v_members boolean;
begin
  if p_caller is null or p_other is null or p_caller = p_other then
    return false;
  end if;

  v_caller := public.st_chat_member_role(p_team_id, p_caller);
  v_other := public.st_chat_member_role(p_team_id, p_other);
  if v_caller is null or v_other is null then
    return false;
  end if;

  if v_caller in ('owner', 'manager') then
    return true;
  end if;

  if v_caller <> 'member' then
    return false;
  end if;

  select t.members_can_message_managers, t.members_can_message_members
    into v_managers, v_members
  from public.st_teams t
  where t.id = p_team_id;

  if v_other in ('owner', 'manager') then
    return coalesce(v_managers, false);
  end if;

  if v_other = 'member' then
    return coalesce(v_members, false);
  end if;

  return false;
end;
$$;

create or replace function public.st_user_can_read_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.st_chat_user_can_read(auth.uid(), p_conversation_id);
$$;

-- ---------------------------------------------------------------------------
-- One bell row per unread conversation. Does not change st_publish_notification.
-- ---------------------------------------------------------------------------

create or replace function public.st_upsert_conversation_notification(
  p_user_id uuid,
  p_event_type text,
  p_conversation_id uuid,
  p_team_id uuid,
  p_actor_user_id uuid,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_dedupe text;
  v_id uuid;
begin
  if p_user_id is null or p_user_id = p_actor_user_id or coalesce(trim(p_title), '') = '' then
    return null;
  end if;
  if p_event_type not in ('group_message', 'direct_message') then
    return null;
  end if;

  v_category := public.st_notification_category(p_event_type);
  if v_category is null then
    return null;
  end if;
  if not public.st_notification_in_app_enabled(p_user_id, v_category) then
    return null;
  end if;

  v_dedupe := p_event_type || ':' || p_conversation_id::text || ':' || p_user_id::text;

  insert into public.st_notifications (
    user_id, event_type, category, title, body,
    destination_kind, destination_id, team_id, actor_user_id, dedupe_key
  ) values (
    p_user_id,
    p_event_type,
    v_category,
    left(trim(p_title), 180),
    left(coalesce(p_body, ''), 400),
    'conversation',
    p_conversation_id,
    p_team_id,
    p_actor_user_id,
    v_dedupe
  )
  on conflict (user_id, dedupe_key) do update
  set title = excluded.title,
      body = excluded.body,
      event_type = excluded.event_type,
      category = excluded.category,
      destination_kind = excluded.destination_kind,
      destination_id = excluded.destination_id,
      team_id = excluded.team_id,
      actor_user_id = excluded.actor_user_id,
      created_at = clock_timestamp(),
      read_at = null
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.st_notify_conversation_message(p_conversation_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_type text;
  v_sender uuid := auth.uid();
  v_name text;
  v_team_name text;
  v_event text;
  v_preview text;
  v_recipient uuid;
  v_count integer;
  v_title text;
  v_body text;
begin
  if v_sender is null then
    return;
  end if;

  select c.team_id, c.conversation_type
    into v_team, v_type
  from public.st_conversations c
  where c.id = p_conversation_id;

  if v_team is null then
    return;
  end if;

  v_event := case when v_type = 'direct' then 'direct_message' else 'group_message' end;
  v_name := public.st_notification_display_name(v_sender, v_team);
  select t.name into v_team_name from public.st_teams t where t.id = v_team;
  select left(m.body, 120) into v_preview
  from public.st_messages m
  where m.id = p_message_id and m.deleted_at is null;

  for v_recipient in
    select m.user_id
    from public.st_team_members m
    where m.team_id = v_team
      and m.status = 'active'
      and m.user_id <> v_sender
  loop
    if v_type = 'direct' and not exists (
      select 1
      from public.st_conversation_members cm
      where cm.conversation_id = p_conversation_id
        and cm.user_id = v_recipient
        and cm.left_at is null
    ) then
      continue;
    end if;

    if not public.st_chat_user_can_read(v_recipient, p_conversation_id) then
      continue;
    end if;

    select count(*)::integer into v_count
    from public.st_messages msg
    left join public.st_conversation_members mine
      on mine.conversation_id = msg.conversation_id
     and mine.user_id = v_recipient
    where msg.conversation_id = p_conversation_id
      and msg.deleted_at is null
      and msg.sender_user_id is distinct from v_recipient
      and msg.created_at > coalesce(mine.last_read_at, '-infinity'::timestamptz);

    if v_type = 'direct' then
      v_title := v_name;
      v_body := case
        when v_count > 1 then v_name || ' sent you ' || v_count || ' new messages.'
        else coalesce(v_preview, 'New message')
      end;
    else
      v_title := coalesce(nullif(trim(v_team_name), ''), 'Group');
      v_body := case
        when v_count > 1 then v_count || ' new messages'
        else v_name || ': ' || coalesce(v_preview, 'New message')
      end;
    end if;

    perform public.st_upsert_conversation_notification(
      v_recipient, v_event, p_conversation_id, v_team, v_sender, v_title, v_body
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------

create or replace function public.st_ensure_group_conversation(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_role := public.st_chat_member_role(p_team_id, auth.uid());
  if v_role is null then
    raise exception 'Not authorized';
  end if;

  if v_role = 'member' and not exists (
    select 1
    from public.st_teams t
    where t.id = p_team_id
      and t.members_can_use_group_chat
  ) then
    raise exception 'Not authorized';
  end if;

  begin
    insert into public.st_conversations (team_id, conversation_type, participant_key, created_by)
    values (p_team_id, 'group', 'group', auth.uid())
    on conflict on constraint st_conversations_team_participant_key do nothing;
  exception
    when unique_violation then
      null;
  end;

  select c.id into v_id
  from public.st_conversations c
  where c.team_id = p_team_id
    and c.conversation_type = 'group'
  limit 1;

  if v_id is null then
    raise exception 'Not authorized';
  end if;

  insert into public.st_conversation_members (conversation_id, user_id)
  values (v_id, auth.uid())
  on conflict (conversation_id, user_id) do update
    set left_at = null;

  return v_id;
end;
$$;

create or replace function public.st_open_direct_conversation(p_team_id uuid, p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_id uuid;
  v_low text;
  v_high text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if p_other_user_id is null or p_other_user_id = auth.uid() then
    raise exception 'Not authorized';
  end if;
  if public.st_chat_member_role(p_team_id, auth.uid()) is null
     or public.st_chat_member_role(p_team_id, p_other_user_id) is null then
    raise exception 'Not authorized';
  end if;

  if auth.uid()::text < p_other_user_id::text then
    v_low := auth.uid()::text;
    v_high := p_other_user_id::text;
  else
    v_low := p_other_user_id::text;
    v_high := auth.uid()::text;
  end if;
  v_key := v_low || ':' || v_high;

  select c.id into v_id
  from public.st_conversations c
  where c.team_id = p_team_id
    and c.conversation_type = 'direct'
    and c.participant_key = v_key;

  if v_id is null then
    if not public.st_chat_can_start_direct(p_team_id, auth.uid(), p_other_user_id) then
      raise exception 'Not authorized';
    end if;
    begin
      insert into public.st_conversations (team_id, conversation_type, participant_key, created_by)
      values (p_team_id, 'direct', v_key, auth.uid())
      on conflict on constraint st_conversations_team_participant_key do nothing;
    exception
      when unique_violation then
        null;
    end;
    select c.id into v_id
    from public.st_conversations c
    where c.team_id = p_team_id
      and c.participant_key = v_key;
  end if;

  if v_id is null or not public.st_chat_user_can_read(auth.uid(), v_id) then
    -- The caller is not a participant yet on a brand-new row. Membership is added next
    -- only for this authorized pair. Re-check after the membership write.
    if v_id is null then
      raise exception 'Not authorized';
    end if;
  end if;

  insert into public.st_conversation_members (conversation_id, user_id)
  values (v_id, auth.uid()), (v_id, p_other_user_id)
  on conflict (conversation_id, user_id) do update
    set left_at = null;

  if not public.st_chat_user_can_read(auth.uid(), v_id) then
    raise exception 'Not authorized';
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Messages. sender_user_id is always auth.uid().
-- ---------------------------------------------------------------------------

create or replace function public.st_send_message(p_conversation_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
  v_id uuid;
  v_created timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.st_chat_user_can_send(auth.uid(), p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'Message is empty';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Message is too long';
  end if;

  insert into public.st_messages (conversation_id, sender_user_id, body)
  values (p_conversation_id, auth.uid(), v_body)
  returning id, created_at into v_id, v_created;

  insert into public.st_conversation_members (conversation_id, user_id, last_read_at)
  values (p_conversation_id, auth.uid(), clock_timestamp())
  on conflict (conversation_id, user_id) do update
    set last_read_at = clock_timestamp(),
        left_at = null;

  begin
    perform public.st_notify_conversation_message(p_conversation_id, v_id);
  exception
    when others then
      null;
  end;

  return jsonb_build_object(
    'id', v_id,
    'conversation_id', p_conversation_id,
    'sender_user_id', auth.uid(),
    'body', v_body,
    'created_at', v_created,
    'edited_at', null,
    'deleted_at', null
  );
end;
$$;

create or replace function public.st_edit_message(p_message_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
  v_conversation uuid;
  v_sender uuid;
  v_row public.st_messages;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'Message is empty';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Message is too long';
  end if;

  select m.conversation_id, m.sender_user_id
    into v_conversation, v_sender
  from public.st_messages m
  where m.id = p_message_id
    and m.deleted_at is null;

  if v_conversation is null
     or v_sender is distinct from auth.uid()
     or not public.st_chat_user_can_read(auth.uid(), v_conversation) then
    raise exception 'Not authorized';
  end if;

  update public.st_messages
  set body = v_body,
      edited_at = clock_timestamp()
  where id = p_message_id
    and sender_user_id = auth.uid()
    and deleted_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Not authorized';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'conversation_id', v_row.conversation_id,
    'sender_user_id', v_row.sender_user_id,
    'body', v_row.body,
    'created_at', v_row.created_at,
    'edited_at', v_row.edited_at,
    'deleted_at', v_row.deleted_at
  );
end;
$$;

create or replace function public.st_delete_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation uuid;
  v_sender uuid;
  v_row public.st_messages;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select m.conversation_id, m.sender_user_id
    into v_conversation, v_sender
  from public.st_messages m
  where m.id = p_message_id;

  if v_conversation is null
     or v_sender is distinct from auth.uid()
     or not public.st_chat_user_can_read(auth.uid(), v_conversation) then
    raise exception 'Not authorized';
  end if;

  update public.st_messages
  set body = '',
      deleted_at = coalesce(deleted_at, clock_timestamp())
  where id = p_message_id
    and sender_user_id = auth.uid()
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Not authorized';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'conversation_id', v_row.conversation_id,
    'sender_user_id', v_row.sender_user_id,
    'body', '',
    'created_at', v_row.created_at,
    'edited_at', v_row.edited_at,
    'deleted_at', v_row.deleted_at
  );
end;
$$;

create or replace function public.st_list_messages(
  p_conversation_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.st_chat_user_can_read(auth.uid(), p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 50);

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
    into v_rows
  from (
    select m.id, m.conversation_id, m.sender_user_id, m.body, m.created_at, m.edited_at, m.deleted_at
    from public.st_messages m
    where m.conversation_id = p_conversation_id
      and (
        p_before_created_at is null
        or (
          p_before_id is not null
          and (m.created_at, m.id) < (p_before_created_at, p_before_id)
        )
        or (
          p_before_id is null
          and m.created_at < p_before_created_at
        )
      )
    order by m.created_at desc, m.id desc
    limit v_limit
  ) q;

  return v_rows;
end;
$$;

create or replace function public.st_mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.st_chat_user_can_read(auth.uid(), p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  insert into public.st_conversation_members (conversation_id, user_id, last_read_at)
  values (p_conversation_id, auth.uid(), clock_timestamp())
  on conflict (conversation_id, user_id) do update
    set last_read_at = clock_timestamp(),
        left_at = null;

  update public.st_notifications n
  set read_at = clock_timestamp()
  where n.user_id = auth.uid()
    and n.read_at is null
    and n.destination_kind = 'conversation'
    and n.destination_id = p_conversation_id
    and n.event_type in ('group_message', 'direct_message');
end;
$$;

create or replace function public.st_conversation_unread_count(p_conversation_id uuid, p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.st_messages msg
  left join public.st_conversation_members mine
    on mine.conversation_id = msg.conversation_id
   and mine.user_id = p_user_id
  where msg.conversation_id = p_conversation_id
    and msg.deleted_at is null
    and msg.sender_user_id is distinct from p_user_id
    and msg.created_at > coalesce(mine.last_read_at, '-infinity'::timestamptz);
$$;

create or replace function public.st_list_group_conversations(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_role := public.st_chat_member_role(p_team_id, auth.uid());
  if v_role is null then
    raise exception 'Not authorized';
  end if;

  if v_role in ('owner', 'manager') or exists (
    select 1
    from public.st_teams t
    where t.id = p_team_id
      and t.members_can_use_group_chat
  ) then
    perform public.st_ensure_group_conversation(p_team_id);
  end if;

  select coalesce(
    jsonb_agg(listed.item order by listed.sort_group, listed.last_message_at desc nulls last),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      jsonb_build_object(
        'id', c.id,
        'conversation_type', c.conversation_type,
        'other_user_id', other_m.user_id,
        'other_name', case
          when c.conversation_type = 'group' then t.name
          else public.st_notification_display_name(other_m.user_id, c.team_id)
        end,
        'preview', case
          when last_msg.id is null then ''
          when last_msg.deleted_at is not null then 'Message deleted'
          else left(coalesce(last_msg.body, ''), 120)
        end,
        'last_message_at', last_msg.created_at,
        'unread_count', public.st_conversation_unread_count(c.id, auth.uid()),
        'can_send', public.st_chat_user_can_send(auth.uid(), c.id)
      ) as item,
      case when c.conversation_type = 'group' then 0 else 1 end as sort_group,
      last_msg.created_at as last_message_at
    from public.st_conversations c
    join public.st_teams t on t.id = c.team_id
    left join lateral (
      select cm.user_id
      from public.st_conversation_members cm
      where cm.conversation_id = c.id
        and cm.user_id <> auth.uid()
        and cm.left_at is null
      limit 1
    ) other_m on true
    left join lateral (
      select m.id, m.body, m.created_at, m.deleted_at
      from public.st_messages m
      where m.conversation_id = c.id
      order by m.created_at desc, m.id desc
      limit 1
    ) last_msg on true
    where c.team_id = p_team_id
      and public.st_chat_user_can_read(auth.uid(), c.id)
  ) listed;

  return v_rows;
end;
$$;

create or replace function public.st_group_unread_conversation_count(p_team_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or public.st_chat_member_role(p_team_id, auth.uid()) is null then
    return 0;
  end if;

  select count(*)::integer into v_count
  from public.st_conversations c
  where c.team_id = p_team_id
    and public.st_chat_user_can_read(auth.uid(), c.id)
    and public.st_conversation_unread_count(c.id, auth.uid()) > 0;

  return coalesce(v_count, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS. Clients can read authorized rows for Realtime. Writes go through RPCs.
-- ---------------------------------------------------------------------------

alter table public.st_conversations enable row level security;
alter table public.st_conversation_members enable row level security;
alter table public.st_messages enable row level security;

drop policy if exists conversations_select_authorized on public.st_conversations;
create policy conversations_select_authorized on public.st_conversations
  for select to authenticated
  using (public.st_user_can_read_conversation(id));

drop policy if exists conversation_members_select_own on public.st_conversation_members;
create policy conversation_members_select_own on public.st_conversation_members
  for select to authenticated
  using (
    user_id = auth.uid()
    and public.st_user_can_read_conversation(conversation_id)
  );

drop policy if exists messages_select_authorized on public.st_messages;
create policy messages_select_authorized on public.st_messages
  for select to authenticated
  using (public.st_user_can_read_conversation(conversation_id));

revoke all on table public.st_conversations from public, anon, authenticated;
revoke all on table public.st_conversation_members from public, anon, authenticated;
revoke all on table public.st_messages from public, anon, authenticated;
grant select on table public.st_conversations to authenticated;
grant select on table public.st_conversation_members to authenticated;
grant select on table public.st_messages to authenticated;

revoke all on function public.st_chat_member_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public.st_chat_user_can_read(uuid, uuid) from public, anon, authenticated;
revoke all on function public.st_chat_user_can_send(uuid, uuid) from public, anon, authenticated;
revoke all on function public.st_chat_can_start_direct(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.st_user_can_read_conversation(uuid) from public, anon;
grant execute on function public.st_user_can_read_conversation(uuid) to authenticated;
revoke all on function public.st_upsert_conversation_notification(uuid, text, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.st_notify_conversation_message(uuid, uuid) from public, anon, authenticated;
revoke all on function public.st_conversation_unread_count(uuid, uuid) from public, anon, authenticated;

grant execute on function public.st_ensure_group_conversation(uuid) to authenticated;
grant execute on function public.st_open_direct_conversation(uuid, uuid) to authenticated;
grant execute on function public.st_send_message(uuid, text) to authenticated;
grant execute on function public.st_edit_message(uuid, text) to authenticated;
grant execute on function public.st_delete_message(uuid) to authenticated;
grant execute on function public.st_list_messages(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.st_mark_conversation_read(uuid) to authenticated;
grant execute on function public.st_list_group_conversations(uuid) to authenticated;
grant execute on function public.st_group_unread_conversation_count(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.st_messages;
exception
  when duplicate_object then
    null;
  when undefined_object then
    null;
end $$;


-- ===== 20261007_056_program_generation_criteria.sql =====

-- BIQ-0249 Program criteria snapshot
-- Additive. Existing programs stay null. Workouts and set logs are not rewritten.

alter table public.st_programs
  add column if not exists generation_criteria jsonb;

comment on column public.st_programs.generation_criteria is
  'Intake and generation outcome for this program. Null before BIQ-0249. Does not store validation codes or set logs.';

create or replace function public.st_duplicate_program(
  p_source_program_id uuid,
  p_name text default null,
  p_visibility text default null,
  p_team_id uuid default null,
  p_owner_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.st_programs%rowtype;
  v_new_program_id uuid;
  v_workout record;
  v_new_workout_id uuid;
  v_ex record;
  v_new_ex_id uuid;
  v_ps record;
  v_superset_map jsonb := '{}'::jsonb;
  v_new_group uuid;
  v_visibility text;
  v_owner uuid;
  v_team uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_source
  from public.st_programs
  where id = p_source_program_id;

  if not found then
    raise exception 'Source program not found';
  end if;

  if not public.st_user_can_read_program(p_source_program_id) then
    raise exception 'Not authorized to read source program';
  end if;

  v_visibility := coalesce(nullif(trim(p_visibility), ''), v_source.visibility);
  if v_visibility not in ('personal', 'team') then
    raise exception 'Invalid visibility';
  end if;

  v_owner := coalesce(p_owner_user_id, auth.uid());
  v_team := case when v_visibility = 'team' then coalesce(p_team_id, v_source.team_id) else null end;

  if v_visibility = 'team' then
    if v_team is null then
      raise exception 'Team id required for team programs';
    end if;
    if not public.st_user_can_edit_team(v_team) then
      raise exception 'Not authorized to create team programs';
    end if;
  elsif v_owner <> auth.uid() then
    if not (
      v_source.visibility = 'team'
      and v_source.team_id is not null
      and public.st_user_can_edit_team(v_source.team_id)
    ) then
      raise exception 'Not authorized to duplicate for another user';
    end if;
  end if;

  insert into public.st_programs (
    owner_user_id,
    team_id,
    visibility,
    name,
    weeks,
    start_date,
    generation_method,
    generation_prompt,
    program_summary,
    program_style,
    coaching_notes,
    focus_muscles,
    status,
    source_program_id,
    generation_criteria
  ) values (
    v_owner,
    v_team,
    v_visibility,
    coalesce(nullif(trim(p_name), ''), v_source.name || ' (Copy)'),
    v_source.weeks,
    v_source.start_date,
    coalesce(v_source.generation_method, 'manual'),
    v_source.generation_prompt,
    v_source.program_summary,
    v_source.program_style,
    v_source.coaching_notes,
    v_source.focus_muscles,
    coalesce(v_source.status, 'draft'),
    p_source_program_id,
    v_source.generation_criteria
  )
  returning id into v_new_program_id;

  for v_workout in
    select *
    from public.st_workouts
    where program_id = p_source_program_id
    order by week, day_order, created_at
  loop
    insert into public.st_workouts (
      program_id, week, day_order, day_label, workout_type
    ) values (
      v_new_program_id,
      v_workout.week,
      v_workout.day_order,
      v_workout.day_label,
      v_workout.workout_type
    )
    returning id into v_new_workout_id;

    v_superset_map := '{}'::jsonb;

    for v_ex in
      select *
      from public.st_exercises
      where workout_id = v_workout.id
      order by section, sort_order, created_at
    loop
      v_new_group := null;
      if v_ex.superset_group_id is not null then
        if v_superset_map ? v_ex.superset_group_id::text then
          v_new_group := (v_superset_map ->> v_ex.superset_group_id::text)::uuid;
        else
          v_new_group := gen_random_uuid();
          v_superset_map := v_superset_map || jsonb_build_object(v_ex.superset_group_id::text, v_new_group);
        end if;
      end if;

      insert into public.st_exercises (
        workout_id,
        sort_order,
        name,
        muscle_group,
        notes,
        section,
        catalog_exercise_id,
        exercise_type,
        superset_group_id,
        superset_label,
        superset_order
      ) values (
        v_new_workout_id,
        v_ex.sort_order,
        v_ex.name,
        v_ex.muscle_group,
        v_ex.notes,
        v_ex.section,
        v_ex.catalog_exercise_id,
        v_ex.exercise_type,
        v_new_group,
        v_ex.superset_label,
        v_ex.superset_order
      )
      returning id into v_new_ex_id;

      for v_ps in
        select *
        from public.st_planned_sets
        where exercise_id = v_ex.id
          and coalesce(is_deleted, false) = false
        order by sort_order, set_number
      loop
        insert into public.st_planned_sets (
          exercise_id,
          sort_order,
          set_number,
          set_type,
          target_weight,
          target_reps,
          target_rpe
        ) values (
          v_new_ex_id,
          v_ps.sort_order,
          v_ps.set_number,
          v_ps.set_type,
          v_ps.target_weight,
          v_ps.target_reps,
          v_ps.target_rpe
        );
      end loop;
    end loop;
  end loop;

  return v_new_program_id;
end;
$$;

revoke all on function public.st_duplicate_program(uuid, text, text, uuid, uuid) from public;
grant execute on function public.st_duplicate_program(uuid, text, text, uuid, uuid) to authenticated;


-- ===== 20261007_059_unified_training_schedule.sql =====

-- BIQ-0245 Unified Training Schedule
-- Apply manually after 054, 055, 056, 057, and 058. Do not run this from the app.
-- Expectations are written when training becomes effective. Opening Training does not create them.
-- A workout scheduled for the local today is due, not missed. Historical adherence uses scheduled_date < local today.
-- Hiding a source does not delete expectation rows. Stopping future expectation does not end membership.

alter table public.st_training_enrollments
  add column if not exists schedule_visible boolean not null default false,
  add column if not exists expectation_enabled boolean not null default false,
  add column if not exists starts_on date,
  add column if not exists ended_on date;

comment on column public.st_training_enrollments.schedule_visible is
  'Personal combined Training display only. Hiding a source does not delete expectations or change adherence.';
comment on column public.st_training_enrollments.expectation_enabled is
  'Whether future required training should generate expectations. Historical rows stay when this is turned off.';
comment on column public.st_training_enrollments.starts_on is
  'First local date this enrollment can expect training. Does not shift when participation is paused.';
comment on column public.st_training_enrollments.ended_on is
  'Local date participation ended. Distinct from schedule visibility and expectation.';

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

create index if not exists st_training_program_segments_program_idx
  on public.st_training_program_segments (program_id);

comment on table public.st_training_program_segments is
  'Which program applies to an enrollment over a period. One open segment per enrollment. Historical expectations keep their segment.';

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

create unique index if not exists st_training_expectations_assignment_identity
  on public.st_training_expectations (assignment_recipient_id)
  where origin = 'assignment' and assignment_recipient_id is not null;

create index if not exists st_training_expectations_user_date_idx
  on public.st_training_expectations (user_id, scheduled_date);

create index if not exists st_training_expectations_source_date_idx
  on public.st_training_expectations (source_key, scheduled_date);

comment on table public.st_training_expectations is
  'This person was expected to perform this workout from this source on this local date. Does not copy exercises or sets.';

alter table public.st_workout_sessions
  add column if not exists expectation_id uuid references public.st_training_expectations(id) on delete set null,
  add column if not exists source_key text,
  add column if not exists scheduled_date date;

comment on column public.st_workout_sessions.expectation_id is
  'The scheduled expectation this performed workout fulfills. Completion is not "any workout that day".';

create or replace function public.st_schedule_day_label(p_date date)
returns text
language sql
immutable
as $$
  select (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from p_date)::int + 1];
$$;

create or replace function public.st_schedule_monday(p_date date)
returns date
language sql
immutable
as $$
  select (p_date - ((extract(dow from p_date)::int + 6) % 7))::date;
$$;

create or replace function public.st_program_cycle_weeks(p_weeks numeric, p_cycle numeric)
returns integer
language sql
immutable
as $$
  select case
    when p_weeks is not null and p_weeks >= 1 then least(52, floor(p_weeks)::int)
    when p_cycle is not null and p_cycle >= 1 then least(52, floor(p_cycle)::int)
    else 6
  end;
$$;

create or replace function public.st_expectation_has_session(p_expectation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_training_expectations e
    join public.st_workout_sessions s
      on s.user_id = e.user_id
     and (
       s.expectation_id = e.id
       or (e.workout_id is not null and s.workout_id = e.workout_id and s.log_date = e.scheduled_date)
     )
    where e.id = p_expectation_id
  );
$$;

create or replace function public.st_guard_training_expectation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cut text;
  v_cut_date date;
begin
  v_cut := nullif(current_setting('app.expectation_effective_on', true), '');
  v_cut_date := coalesce(v_cut::date, current_date);
  if tg_op = 'DELETE' then
    if old.scheduled_date < v_cut_date then
      raise exception 'Past training expectations cannot be removed by a schedule refresh';
    end if;
    if old.scheduled_date = v_cut_date and public.st_expectation_has_session(old.id) then
      raise exception 'Today''s expectation is frozen because a workout session exists';
    end if;
    return old;
  end if;
  if old.scheduled_date < v_cut_date and (
    new.scheduled_date is distinct from old.scheduled_date
    or new.workout_id is distinct from old.workout_id
    or new.program_id is distinct from old.program_id
    or new.segment_id is distinct from old.segment_id
    or new.title is distinct from old.title
    or new.day_label is distinct from old.day_label
    or new.origin is distinct from old.origin
    or new.user_id is distinct from old.user_id
    or new.source_key is distinct from old.source_key
  ) then
    raise exception 'Past training expectations are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists st_training_expectations_guard on public.st_training_expectations;
create trigger st_training_expectations_guard
  before update or delete on public.st_training_expectations
  for each row execute function public.st_guard_training_expectation();

create or replace function public.st_withdraw_future_program_expectations(
  p_enrollment_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.expectation_effective_on', p_effective_on::text, true);
  delete from public.st_training_expectations e
  where e.enrollment_id = p_enrollment_id
    and e.origin = 'program'
    and (
      e.scheduled_date > p_effective_on
      or (
        e.scheduled_date = p_effective_on
        and not public.st_expectation_has_session(e.id)
      )
    );
end;
$$;

create or replace function public.st_refresh_enrollment_expectations(
  p_enrollment_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enroll public.st_training_enrollments%rowtype;
  v_program public.st_programs%rowtype;
  v_segment_id uuid;
  v_anchor date;
  v_weeks integer;
  v_end date;
  v_from date;
  v_date date;
  v_week integer;
  v_today_frozen boolean;
  v_workout record;
begin
  select * into v_enroll from public.st_training_enrollments where id = p_enrollment_id;
  if not found or v_enroll.program_id is null then
    return;
  end if;

  select s.id into v_segment_id
  from public.st_training_program_segments s
  where s.enrollment_id = v_enroll.id and s.ends_on is null
  order by s.starts_on desc
  limit 1;

  select * into v_program from public.st_programs where id = v_enroll.program_id;
  if not found then
    return;
  end if;

  perform set_config('app.expectation_effective_on', p_effective_on::text, true);
  v_today_frozen := exists (
    select 1
    from public.st_training_expectations e
    where e.enrollment_id = v_enroll.id
      and e.origin = 'program'
      and e.scheduled_date = p_effective_on
      and public.st_expectation_has_session(e.id)
  );

  delete from public.st_training_expectations e
  where e.enrollment_id = v_enroll.id
    and e.origin = 'program'
    and e.scheduled_date > p_effective_on;

  if not v_today_frozen then
    delete from public.st_training_expectations e
    where e.enrollment_id = v_enroll.id
      and e.origin = 'program'
      and e.scheduled_date = p_effective_on
      and not public.st_expectation_has_session(e.id);
  end if;

  if v_enroll.status <> 'active' or not v_enroll.expectation_enabled then
    return;
  end if;

  v_weeks := public.st_program_cycle_weeks(v_program.weeks::numeric, v_program.cycle_length_weeks::numeric);
  v_anchor := public.st_schedule_monday(
    case
      when v_enroll.source_kind = 'personal' then coalesce(v_enroll.starts_on, v_program.start_date, p_effective_on)
      else coalesce(v_program.start_date, v_enroll.starts_on, p_effective_on)
    end
  );
  v_end := v_anchor + (v_weeks * 7 - 1);
  v_from := greatest(p_effective_on, coalesce(v_enroll.starts_on, p_effective_on));
  if v_from > v_end then
    return;
  end if;

  v_date := v_from;
  while v_date <= v_end loop
    if v_today_frozen and v_date = p_effective_on then
      v_date := v_date + 1;
      continue;
    end if;
    v_week := ((v_date - v_anchor) / 7) + 1;
    if v_week >= 1 and v_week <= v_weeks then
      for v_workout in
        select w.id, w.day_label, w.workout_type
        from public.st_workouts w
        where w.program_id = v_enroll.program_id
          and w.week = v_week
          and w.day_label = public.st_schedule_day_label(v_date)
      loop
        insert into public.st_training_expectations (
          user_id, source_key, team_id, enrollment_id, program_id, segment_id, workout_id,
          scheduled_date, title, day_label, origin, excused
        ) values (
          v_enroll.user_id,
          v_enroll.source_key,
          v_enroll.team_id,
          v_enroll.id,
          v_enroll.program_id,
          v_segment_id,
          v_workout.id,
          v_date,
          coalesce(nullif(trim(v_workout.workout_type), ''), nullif(trim(v_workout.day_label), ''), 'Workout'),
          v_workout.day_label,
          'program',
          false
        )
        on conflict (user_id, source_key, workout_id, scheduled_date)
          where origin = 'program' and workout_id is not null
          do nothing;
      end loop;
    end if;
    v_date := v_date + 1;
  end loop;
end;
$$;

create or replace function public.st_sync_enrollment_schedule(
  p_enrollment_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enroll public.st_training_enrollments%rowtype;
  v_segment_id uuid;
  v_segment_program uuid;
  v_segment_start date;
begin
  select * into v_enroll from public.st_training_enrollments where id = p_enrollment_id;
  if not found then
    return;
  end if;

  perform set_config('app.expectation_effective_on', p_effective_on::text, true);

  if v_enroll.program_id is not null and v_enroll.status = 'active' then
    select s.id, s.program_id, s.starts_on
      into v_segment_id, v_segment_program, v_segment_start
    from public.st_training_program_segments s
    where s.enrollment_id = v_enroll.id and s.ends_on is null
    order by s.starts_on desc
    limit 1;

    if v_segment_id is null then
      insert into public.st_training_program_segments (enrollment_id, program_id, starts_on)
      values (v_enroll.id, v_enroll.program_id, coalesce(v_enroll.starts_on, p_effective_on));
    elsif v_segment_program is distinct from v_enroll.program_id then
      if v_segment_start >= p_effective_on then
        update public.st_training_program_segments
        set program_id = v_enroll.program_id
        where id = v_segment_id;
      else
        update public.st_training_program_segments
        set ends_on = p_effective_on - 1
        where id = v_segment_id and ends_on is null;
        insert into public.st_training_program_segments (enrollment_id, program_id, starts_on)
        values (v_enroll.id, v_enroll.program_id, p_effective_on);
      end if;
    end if;
  end if;

  if v_enroll.status = 'active' and v_enroll.expectation_enabled and v_enroll.program_id is not null then
    perform public.st_refresh_enrollment_expectations(v_enroll.id, p_effective_on);
  else
    perform public.st_withdraw_future_program_expectations(v_enroll.id, p_effective_on);
  end if;
end;
$$;

create or replace function public.st_refresh_program_expectations(
  p_program_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_edit_program(p_program_id) then
    raise exception 'Not authorized';
  end if;
  perform set_config('app.expectation_effective_on', p_effective_on::text, true);
  for v_id in
    select e.id
    from public.st_training_enrollments e
    join public.st_training_program_segments s
      on s.enrollment_id = e.id and s.ends_on is null and s.program_id = p_program_id
    where e.status = 'active' and e.expectation_enabled
  loop
    perform public.st_refresh_enrollment_expectations(v_id, p_effective_on);
  end loop;
end;
$$;

create or replace function public.st_set_enrollment_schedule_visible(
  p_enrollment_id uuid,
  p_visible boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.st_training_enrollments
  set schedule_visible = p_visible, updated_at = now()
  where id = p_enrollment_id and user_id = auth.uid();
  if not found then
    raise exception 'Not authorized';
  end if;
end;
$$;

create or replace function public.st_set_enrollment_expectation(
  p_enrollment_id uuid,
  p_enabled boolean,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from public.st_training_enrollments
    where id = p_enrollment_id and user_id = auth.uid() and status <> 'ended'
  ) then
    raise exception 'Not authorized';
  end if;
  perform set_config('app.expectation_effective_on', p_effective_on::text, true);
  update public.st_training_enrollments
  set expectation_enabled = p_enabled, updated_at = now()
  where id = p_enrollment_id and user_id = auth.uid();
end;
$$;

create or replace function public.st_activate_followed_program(
  p_program_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program public.st_programs%rowtype;
  v_team uuid;
  v_just_me boolean;
  v_key text;
begin
  if auth.uid() is null or p_program_id is null then
    return;
  end if;
  select * into v_program from public.st_programs where id = p_program_id;
  if not found then
    return;
  end if;

  v_just_me := v_program.visibility = 'personal'
    and v_program.owner_user_id = auth.uid()
    and v_program.source_program_id is not null
    and lower(coalesce(v_program.status, '')) <> 'archived'
    and v_program.name ilike '%(just me)%';

  perform set_config('app.expectation_effective_on', p_effective_on::text, true);

  if v_just_me then
    select p.team_id into v_team
    from public.st_programs p
    where p.id = v_program.source_program_id;
    if v_team is null then
      return;
    end if;
    if not exists (
      select 1 from public.st_team_members m
      where m.team_id = v_team and m.user_id = auth.uid() and m.status = 'active'
    ) then
      return;
    end if;
    v_key := 'group:' || v_team::text;
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      auth.uid(), 'group', v_key, v_team, v_program.id, 'active', true, true, p_effective_on
    )
    on conflict (user_id, source_key) do update
      set program_id = excluded.program_id,
          status = 'active',
          schedule_visible = true,
          expectation_enabled = true,
          ended_on = null,
          starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
          updated_at = now()
      where public.st_training_enrollments.source_kind = 'group';
    return;
  end if;

  if v_program.visibility = 'team' and v_program.team_id is not null then
    if not exists (
      select 1 from public.st_team_members m
      where m.team_id = v_program.team_id and m.user_id = auth.uid() and m.status = 'active'
    ) then
      return;
    end if;
    v_key := 'group:' || v_program.team_id::text;
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      auth.uid(), 'group', v_key, v_program.team_id, v_program.id, 'active', true, true, p_effective_on
    )
    on conflict (user_id, source_key) do update
      set program_id = excluded.program_id,
          status = 'active',
          schedule_visible = true,
          expectation_enabled = true,
          ended_on = null,
          starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
          updated_at = now()
      where public.st_training_enrollments.source_kind = 'group';
    return;
  end if;

  if v_program.visibility = 'personal' and v_program.owner_user_id = auth.uid() then
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      auth.uid(), 'personal', 'personal', null, v_program.id, 'active', true, true, p_effective_on
    )
    on conflict (user_id, source_key) do update
      set program_id = excluded.program_id,
          status = 'active',
          schedule_visible = true,
          expectation_enabled = true,
          ended_on = null,
          starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
          updated_at = now()
      where public.st_training_enrollments.source_kind = 'personal'
        and public.st_training_enrollments.source_key = 'personal';
  end if;
end;
$$;

create or replace function public.st_repair_followed_training_schedule(p_local_today date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_followed uuid;
  v_enrollment uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select pr.followed_program_id into v_followed
  from public.st_profiles pr
  where pr.user_id = auth.uid();
  if v_followed is null then
    return;
  end if;

  if exists (
    select 1
    from public.st_training_enrollments e
    where e.user_id = auth.uid()
      and e.program_id = v_followed
      and e.schedule_visible = true
      and e.status = 'active'
  ) then
    select e.id into v_enrollment
    from public.st_training_enrollments e
    where e.user_id = auth.uid()
      and e.program_id = v_followed
      and e.schedule_visible = true
      and e.expectation_enabled = true
      and e.status = 'active'
    limit 1;
    if v_enrollment is not null and not exists (
      select 1
      from public.st_training_expectations x
      where x.enrollment_id = v_enrollment and x.origin = 'program'
    ) then
      perform public.st_sync_enrollment_schedule(v_enrollment, p_local_today);
    end if;
    return;
  end if;

  select e.id into v_enrollment
  from public.st_training_enrollments e
  where e.user_id = auth.uid()
    and e.program_id = v_followed
    and e.status <> 'ended'
  order by case when e.source_kind = 'group' then 0 else 1 end, e.created_at
  limit 1;

  if v_enrollment is null then
    perform public.st_activate_followed_program(v_followed, p_local_today);
    return;
  end if;

  perform set_config('app.expectation_effective_on', p_local_today::text, true);
  update public.st_training_enrollments
  set schedule_visible = true,
      expectation_enabled = true,
      status = 'active',
      starts_on = coalesce(starts_on, p_local_today),
      updated_at = now()
  where id = v_enrollment
    and user_id = auth.uid();
end;
$$;

create or replace function public.st_withdraw_assignment_expectation(
  p_recipient_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scheduled date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select a.scheduled_date into v_scheduled
  from public.st_assignment_recipients r
  join public.st_workout_assignments a on a.id = r.assignment_id
  where r.id = p_recipient_id and r.user_id = auth.uid();
  if v_scheduled is null or v_scheduled <= p_effective_on then
    return;
  end if;
  perform set_config('app.expectation_effective_on', p_effective_on::text, true);
  delete from public.st_training_expectations e
  where e.assignment_recipient_id = p_recipient_id
    and e.origin = 'assignment'
    and e.scheduled_date > p_effective_on;
end;
$$;

create or replace function public.st_group_schedule_adherence(
  p_team_id uuid,
  p_from_date date,
  p_to_date date,
  p_local_today date
)
returns table (
  user_id uuid,
  expected_past integer,
  completed_past integer,
  partial_past integer,
  skipped_past integer,
  missed integer,
  due_today integer,
  completed_today integer,
  future integer,
  completion_rate numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_see_all boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null then
    raise exception 'Group is required';
  end if;
  if not exists (
    select 1 from public.st_team_members m
    where m.team_id = p_team_id and m.user_id = auth.uid() and m.status = 'active'
  ) and not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not authorized';
  end if;

  v_see_all := public.st_user_can_view_group_progress(p_team_id) or public.st_user_can_edit_team(p_team_id);

  return query
  with classified as (
    select
      e.user_id as member_id,
      e.scheduled_date,
      e.excused,
      sess.status as session_status,
      rec.status as recipient_status
    from public.st_training_expectations e
    left join lateral (
      select s.status
      from public.st_workout_sessions s
      where s.user_id = e.user_id
        and (
          s.expectation_id = e.id
          or (e.workout_id is not null and s.workout_id = e.workout_id and s.log_date = e.scheduled_date)
        )
      order by case when s.expectation_id = e.id then 0 else 1 end, s.completed_at desc nulls last
      limit 1
    ) sess on true
    left join public.st_assignment_recipients rec on rec.id = e.assignment_recipient_id
    where e.scheduled_date between p_from_date and p_to_date
      and (
        e.source_key = ('group:' || p_team_id::text)
        or (e.origin = 'assignment' and e.team_id = p_team_id)
      )
  )
  select
    tm.user_id,
    (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false))::integer,
    (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false and c.session_status = 'completed'))::integer,
    (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false and c.session_status = 'partial'))::integer,
    (count(*) filter (
      where c.scheduled_date < p_local_today and c.excused = false
        and (c.session_status = 'skipped' or (c.session_status is null and c.recipient_status = 'skipped'))
    ))::integer,
    (count(*) filter (
      where c.scheduled_date < p_local_today and c.excused = false
        and c.session_status is distinct from 'completed'
        and c.session_status is distinct from 'partial'
        and c.session_status is distinct from 'skipped'
        and coalesce(c.recipient_status, '') is distinct from 'skipped'
    ))::integer,
    (count(*) filter (
      where c.scheduled_date = p_local_today and c.excused = false and c.session_status is distinct from 'completed'
    ))::integer,
    (count(*) filter (where c.scheduled_date = p_local_today and c.excused = false and c.session_status = 'completed'))::integer,
    (count(*) filter (where c.scheduled_date > p_local_today and c.excused = false))::integer,
    case
      when (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false)) = 0 then null
      else round(
        (
          (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false and c.session_status = 'completed'))::numeric
          / (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false))::numeric
        ) * 100,
        1
      )
    end
  from public.st_team_members tm
  left join classified c on c.member_id = tm.user_id
  where tm.team_id = p_team_id
    and tm.status = 'active'
    and (v_see_all or tm.user_id = auth.uid())
  group by tm.user_id;
end;
$$;

create or replace function public.st_training_enrollment_schedule_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective date;
begin
  if tg_op = 'UPDATE'
     and new.program_id is not distinct from old.program_id
     and new.expectation_enabled is not distinct from old.expectation_enabled
     and new.status is not distinct from old.status then
    return new;
  end if;
  v_effective := coalesce(nullif(current_setting('app.expectation_effective_on', true), '')::date, current_date);
  perform public.st_sync_enrollment_schedule(new.id, v_effective);
  return new;
end;
$$;

create or replace function public.st_program_schedule_refresh_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective date;
begin
  if new.start_date is not distinct from old.start_date
     and new.weeks is not distinct from old.weeks
     and new.cycle_length_weeks is not distinct from old.cycle_length_weeks then
    return new;
  end if;
  if auth.uid() is not null and public.st_user_can_edit_program(new.id) then
    v_effective := coalesce(nullif(current_setting('app.expectation_effective_on', true), '')::date, current_date);
    perform public.st_refresh_program_expectations(new.id, v_effective);
  end if;
  return new;
end;
$$;

create or replace function public.st_workout_schedule_refresh_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program uuid;
  v_effective date;
begin
  v_program := coalesce(new.program_id, old.program_id);
  if v_program is null then
    return coalesce(new, old);
  end if;
  if auth.uid() is not null and public.st_user_can_edit_program(v_program) then
    v_effective := coalesce(nullif(current_setting('app.expectation_effective_on', true), '')::date, current_date);
    perform public.st_refresh_program_expectations(v_program, v_effective);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.st_assignment_recipient_expectation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.st_workout_assignments%rowtype;
  v_day text;
  v_title text;
  v_scheduled date;
begin
  if tg_op = 'INSERT' then
    select * into v_assignment from public.st_workout_assignments where id = new.assignment_id;
    if not found or v_assignment.team_id is null then
      return new;
    end if;
    select w.day_label into v_day from public.st_workouts w where w.id = v_assignment.workout_id;
    v_title := coalesce(nullif(trim(v_assignment.title), ''), nullif(trim(v_day), ''), 'Workout');
    v_scheduled := coalesce(v_assignment.scheduled_date, current_date);
    insert into public.st_training_expectations (
      user_id, source_key, team_id, workout_id, assignment_id, assignment_recipient_id,
      scheduled_date, title, day_label, origin, excused
    ) values (
      new.user_id,
      'group:' || v_assignment.team_id::text,
      v_assignment.team_id,
      v_assignment.workout_id,
      v_assignment.id,
      new.id,
      v_scheduled,
      v_title,
      v_day,
      'assignment',
      false
    )
    on conflict (assignment_recipient_id) where origin = 'assignment' and assignment_recipient_id is not null
    do nothing;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('cancelled', 'skipped') then
    select a.scheduled_date into v_scheduled
    from public.st_workout_assignments a
    where a.id = new.assignment_id;
    if v_scheduled is not null and v_scheduled > current_date then
      perform set_config('app.expectation_effective_on', current_date::text, true);
      delete from public.st_training_expectations e
      where e.assignment_recipient_id = new.id
        and e.origin = 'assignment'
        and e.scheduled_date > current_date;
    end if;
  end if;
  return new;
end;
$$;

-- Existing rows default to hidden and not expected. Only the followed program is revealed.
update public.st_training_enrollments e
set schedule_visible = true,
    expectation_enabled = true,
    starts_on = coalesce(
      e.starts_on,
      public.st_schedule_monday(coalesce(p.start_date, current_date))
    )
from public.st_profiles pr
join public.st_programs p on p.id = pr.followed_program_id
where e.user_id = pr.user_id
  and e.program_id = pr.followed_program_id
  and e.status <> 'ended';

insert into public.st_training_program_segments (enrollment_id, program_id, starts_on)
select e.id, e.program_id, coalesce(e.starts_on, current_date)
from public.st_training_enrollments e
where e.program_id is not null
  and e.status <> 'ended'
  and not exists (
    select 1
    from public.st_training_program_segments s
    where s.enrollment_id = e.id and s.ends_on is null
  );

do $$
declare
  v_id uuid;
begin
  for v_id in
    select e.id
    from public.st_training_enrollments e
    where e.expectation_enabled = true
      and e.status = 'active'
      and e.program_id is not null
  loop
    perform public.st_sync_enrollment_schedule(v_id, current_date);
  end loop;
end $$;

drop trigger if exists st_training_enrollments_schedule on public.st_training_enrollments;
create trigger st_training_enrollments_schedule
  after insert or update of program_id, expectation_enabled, status
  on public.st_training_enrollments
  for each row execute function public.st_training_enrollment_schedule_trigger();

drop trigger if exists st_programs_schedule_refresh on public.st_programs;
create trigger st_programs_schedule_refresh
  after update of start_date, weeks, cycle_length_weeks
  on public.st_programs
  for each row execute function public.st_program_schedule_refresh_trigger();

drop trigger if exists st_workouts_schedule_refresh on public.st_workouts;
create trigger st_workouts_schedule_refresh
  after insert or update of week, day_label, workout_type, program_id or delete
  on public.st_workouts
  for each row execute function public.st_workout_schedule_refresh_trigger();

drop trigger if exists st_assignment_recipients_expectation on public.st_assignment_recipients;
create trigger st_assignment_recipients_expectation
  after insert or update of status
  on public.st_assignment_recipients
  for each row execute function public.st_assignment_recipient_expectation_trigger();

-- New joins turn the group source on and materialize in this same function's transaction.
create or replace function public.st_ensure_group_participation(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program uuid;
  v_key text;
begin
  if auth.uid() is null or p_team_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.st_team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) then
    return;
  end if;

  v_key := 'group:' || p_team_id::text;
  if v_key = 'personal' then
    raise exception 'Refusing to change personal training';
  end if;

  select t.default_program_id into v_program
  from public.st_teams t
  where t.id = p_team_id;

  perform set_config('app.expectation_effective_on', current_date::text, true);
  insert into public.st_training_enrollments (
    user_id, source_kind, source_key, team_id, program_id, status,
    schedule_visible, expectation_enabled, starts_on
  )
  values (auth.uid(), 'group', v_key, p_team_id, v_program, 'active', true, true, current_date)
  on conflict (user_id, source_key) do update
    set status = 'active',
        schedule_visible = true,
        expectation_enabled = true,
        ended_on = null,
        updated_at = now(),
        starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
        program_id = coalesce(public.st_training_enrollments.program_id, excluded.program_id)
    where public.st_training_enrollments.source_kind = 'group'
      and public.st_training_enrollments.source_key <> 'personal';
exception
  when undefined_table then
    return;
end;
$$;

revoke all on function public.st_ensure_group_participation(uuid) from public, anon, authenticated;

create or replace function public.st_assign_member_program(
  p_team_id uuid,
  p_member_user_id uuid,
  p_assignment_type text,
  p_program_id uuid default null,
  p_notes text default null,
  p_coaching_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_key text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if p_assignment_type not in ('personal', 'team', 'individual_team', 'manual') then
    raise exception 'Invalid assignment type';
  end if;
  if p_assignment_type in ('individual_team', 'manual') and p_program_id is null then
    raise exception 'Select a program for this assignment type';
  end if;
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = p_member_user_id and status = 'active'
  ) then
    raise exception 'Member not found';
  end if;

  update public.st_program_assignments
  set is_active = false
  where user_id = p_member_user_id and team_id = p_team_id and is_active = true;

  insert into public.st_program_assignments (
    user_id, team_id, assigned_by, assignment_type, program_id, notes, is_active, target_type, coaching_metadata
  ) values (
    p_member_user_id,
    p_team_id,
    auth.uid(),
    p_assignment_type,
    p_program_id,
    nullif(trim(p_notes), ''),
    true,
    'individual',
    coalesce(p_coaching_metadata, '{}'::jsonb)
  )
  returning id into v_assignment_id;

  update public.st_team_members
  set training_source = case when p_assignment_type = 'personal' then 'personal' else 'team' end
  where team_id = p_team_id and user_id = p_member_user_id and status = 'active';

  if p_program_id is not null and p_assignment_type <> 'personal' then
    v_key := 'group:' || p_team_id::text;
    perform set_config('app.expectation_effective_on', current_date::text, true);
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      p_member_user_id, 'group', v_key, p_team_id, p_program_id, 'active', true, true, current_date
    )
    on conflict (user_id, source_key) do update
      set program_id = excluded.program_id,
          status = 'active',
          schedule_visible = true,
          expectation_enabled = true,
          ended_on = null,
          starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
          updated_at = now();
  end if;

  perform public.st_notify_program_assignment(
    v_assignment_id, p_team_id, p_member_user_id, p_program_id, p_assignment_type
  );
end;
$$;

alter table public.st_training_program_segments enable row level security;
alter table public.st_training_expectations enable row level security;

drop policy if exists "training_segments_select" on public.st_training_program_segments;
create policy "training_segments_select" on public.st_training_program_segments
  for select using (
    exists (
      select 1
      from public.st_training_enrollments e
      where e.id = enrollment_id
        and (
          e.user_id = auth.uid()
          or (e.team_id is not null and public.st_user_can_edit_team(e.team_id))
        )
    )
  );

drop policy if exists "training_expectations_select" on public.st_training_expectations;
create policy "training_expectations_select" on public.st_training_expectations
  for select using (
    user_id = auth.uid()
    or (team_id is not null and public.st_user_can_edit_team(team_id))
    or (
      source_key like 'group:%'
      and public.st_user_can_edit_team(substring(source_key from 7)::uuid)
    )
  );

revoke insert, update, delete on public.st_training_program_segments from anon, authenticated;
revoke insert, update, delete on public.st_training_expectations from anon, authenticated;
grant select on public.st_training_program_segments to authenticated;
grant select on public.st_training_expectations to authenticated;

revoke all on function public.st_set_enrollment_schedule_visible(uuid, boolean) from public, anon;
revoke all on function public.st_set_enrollment_expectation(uuid, boolean, date) from public, anon;
revoke all on function public.st_activate_followed_program(uuid, date) from public, anon;
revoke all on function public.st_repair_followed_training_schedule(date) from public, anon;
revoke all on function public.st_withdraw_assignment_expectation(uuid, date) from public, anon;
revoke all on function public.st_group_schedule_adherence(uuid, date, date, date) from public, anon;
revoke all on function public.st_refresh_program_expectations(uuid, date) from public, anon;

grant execute on function public.st_set_enrollment_schedule_visible(uuid, boolean) to authenticated;
grant execute on function public.st_set_enrollment_expectation(uuid, boolean, date) to authenticated;
grant execute on function public.st_activate_followed_program(uuid, date) to authenticated;
grant execute on function public.st_repair_followed_training_schedule(date) to authenticated;
grant execute on function public.st_withdraw_assignment_expectation(uuid, date) to authenticated;
grant execute on function public.st_group_schedule_adherence(uuid, date, date, date) to authenticated;
grant execute on function public.st_refresh_program_expectations(uuid, date) to authenticated;


-- ===== 20261008_060_progress_snapshot_foundation.sql =====

-- BIQ-0250: Progress snapshot foundation
-- Additive. Does not drop logs, rewrite existing snapshot text, or delete measurements.

alter table public.st_set_logs
  add column if not exists snapshot_movement_pattern text,
  add column if not exists snapshot_muscle_credits jsonb,
  add column if not exists snapshot_variant text,
  add column if not exists snapshot_provenance jsonb;

comment on column public.st_set_logs.snapshot_movement_pattern is
  'Movement pattern copied when the set was first logged.';
comment on column public.st_set_logs.snapshot_muscle_credits is
  'Resolved muscle credits copied when the set was first logged. Effective-set math treats these as estimates.';
comment on column public.st_set_logs.snapshot_variant is
  'Meaningful variant such as unilateral. Empty when the catalog exercise and equipment already identify the series.';
comment on column public.st_set_logs.snapshot_provenance is
  'Internal data-quality labels: snapshotted, backfilled, estimated, or unknown.';

-- Keep the catalog id that was logged even if that catalog row is later removed.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'st_set_logs'
      and con.contype = 'f'
      and pg_get_constraintdef(con.oid) ilike '%snapshot_catalog_exercise_id%'
  loop
    execute format('alter table public.st_set_logs drop constraint %I', constraint_name);
  end loop;
end $$;

-- Equipment options from the catalog. Distinct, case-insensitive.
create or replace function public.st_catalog_equipment_options(p_equipment text, p_meta jsonb)
returns text[]
language plpgsql
immutable
as $$
declare
  result text[] := '{}';
  item text;
  elem jsonb;
begin
  if p_equipment is not null and length(trim(p_equipment)) > 0 then
    result := array_append(result, trim(p_equipment));
  end if;
  if p_meta is null then
    return public.st_distinct_text(result);
  end if;

  if jsonb_typeof(p_meta->'default_equipment') = 'string' then
    item := nullif(trim(p_meta->>'default_equipment'), '');
    if item is not null then
      result := array_append(result, item);
    end if;
  elsif jsonb_typeof(p_meta->'default_equipment') = 'array' then
    for elem in select jsonb_array_elements(p_meta->'default_equipment')
    loop
      item := nullif(trim(elem #>> '{}'), '');
      if item is not null then
        result := array_append(result, item);
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_meta->'compatible_equipment') = 'array' then
    for elem in select jsonb_array_elements(p_meta->'compatible_equipment')
    loop
      item := nullif(trim(elem #>> '{}'), '');
      if item is not null then
        result := array_append(result, item);
      end if;
    end loop;
  elsif jsonb_typeof(p_meta->'compatible_equipment') = 'string' then
    item := nullif(trim(p_meta->>'compatible_equipment'), '');
    if item is not null then
      result := array_append(result, item);
    end if;
  end if;

  return public.st_distinct_text(result);
end;
$$;

create or replace function public.st_distinct_text(p_values text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(val order by lower(val)), '{}'::text[])
  from (
    select distinct on (lower(val)) val
    from unnest(coalesce(p_values, '{}'::text[])) as val
    where val is not null and length(trim(val)) > 0
    order by lower(val), val
  ) deduped;
$$;

-- Mirrors lib/progress/equipmentBackfill.ts. Do not guess an implement that the name does not name.
create or replace function public.st_infer_snapshot_equipment(
  p_existing text,
  p_name text,
  p_options text[]
)
returns jsonb
language plpgsql
immutable
as $$
declare
  existing text := nullif(trim(coalesce(p_existing, '')), '');
  name_l text := lower(coalesce(p_name, ''));
  opt text;
  hits text[] := '{}';
  longest text;
  contained boolean := true;
  other text;
begin
  if existing is not null then
    return jsonb_build_object('equipment', existing, 'provenance', 'snapshotted', 'detail', 'existing');
  end if;

  if p_options is not null then
    foreach opt in array p_options loop
      if opt is not null and length(trim(opt)) > 0 and position(lower(trim(opt)) in name_l) > 0 then
        hits := array_append(hits, trim(opt));
      end if;
    end loop;
  end if;

  if coalesce(cardinality(hits), 0) > 1 then
    select h into longest from unnest(hits) as h order by length(h) desc, h limit 1;
    foreach other in array hits loop
      if lower(other) <> lower(longest) and position(lower(other) in lower(longest)) = 0 then
        contained := false;
      end if;
    end loop;
    if contained then
      hits := array[longest];
    end if;
  end if;

  if coalesce(cardinality(hits), 0) = 1 then
    return jsonb_build_object('equipment', hits[1], 'provenance', 'backfilled', 'detail', 'logged_name');
  end if;

  if p_options is not null and cardinality(p_options) = 1 and length(trim(coalesce(p_options[1], ''))) > 0 then
    return jsonb_build_object('equipment', trim(p_options[1]), 'provenance', 'backfilled', 'detail', 'single_implement');
  end if;

  return jsonb_build_object('equipment', null, 'provenance', 'unknown', 'detail', 'unspecified');
end;
$$;

-- Weights must match SCIENCE_RULES_V1: primary 1, secondary 0.5, minor 0.25.
-- Explicit hypertrophy_volume_credits win. Name guesses are not applied here.
create or replace function public.st_estimated_muscle_credits(p_meta jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  credits jsonb := '[]'::jsonb;
  elem jsonb;
begin
  if p_meta is null then
    return null;
  end if;
  if jsonb_typeof(p_meta->'hypertrophy_volume_credits') = 'array'
     and jsonb_array_length(p_meta->'hypertrophy_volume_credits') > 0 then
    for elem in select jsonb_array_elements(p_meta->'hypertrophy_volume_credits')
    loop
      if nullif(elem->>'muscle', '') is not null and (elem->>'credit') ~ '^[0-9]+(\.[0-9]+)?$' then
        credits := credits || jsonb_build_array(jsonb_build_object(
          'muscle', elem->>'muscle',
          'contribution', (elem->>'credit')::numeric
        ));
      end if;
    end loop;
    if jsonb_array_length(credits) > 0 then
      return credits;
    end if;
  end if;

  credits := '[]'::jsonb;
  if jsonb_typeof(p_meta->'primary_muscles') = 'array' then
    for elem in select jsonb_array_elements(p_meta->'primary_muscles')
    loop
      if nullif(elem #>> '{}', '') is not null then
        credits := credits || jsonb_build_array(jsonb_build_object('muscle', elem #>> '{}', 'contribution', 1));
      end if;
    end loop;
  end if;
  if jsonb_typeof(p_meta->'secondary_muscles') = 'array' then
    for elem in select jsonb_array_elements(p_meta->'secondary_muscles')
    loop
      if nullif(elem #>> '{}', '') is not null
         and not exists (
           select 1 from jsonb_array_elements(credits) existing
           where lower(existing->>'muscle') = lower(elem #>> '{}')
         ) then
        credits := credits || jsonb_build_array(jsonb_build_object('muscle', elem #>> '{}', 'contribution', 0.5));
      end if;
    end loop;
  end if;
  if jsonb_typeof(p_meta->'minor_muscles') = 'array' then
    for elem in select jsonb_array_elements(p_meta->'minor_muscles')
    loop
      if nullif(elem #>> '{}', '') is not null
         and not exists (
           select 1 from jsonb_array_elements(credits) existing
           where lower(existing->>'muscle') = lower(elem #>> '{}')
         ) then
        credits := credits || jsonb_build_array(jsonb_build_object('muscle', elem #>> '{}', 'contribution', 0.25));
      end if;
    end loop;
  end if;
  if jsonb_array_length(credits) = 0 then
    return null;
  end if;
  return credits;
end;
$$;

-- Fill blanks only. Existing equipment, pattern, and credit snapshots stay as written.
update public.st_set_logs sl
set
  snapshot_equipment = case
    when nullif(trim(coalesce(sl.snapshot_equipment, '')), '') is not null then sl.snapshot_equipment
    else computed.inferred->>'equipment'
  end,
  snapshot_movement_pattern = coalesce(
    nullif(trim(sl.snapshot_movement_pattern), ''),
    nullif(trim(computed.movement_pattern), '')
  ),
  snapshot_muscle_credits = coalesce(sl.snapshot_muscle_credits, public.st_estimated_muscle_credits(computed.coaching_metadata)),
  snapshot_provenance = coalesce(sl.snapshot_provenance, '{}'::jsonb) || jsonb_build_object(
    'equipment', computed.inferred->>'provenance',
    'equipmentDetail', computed.inferred->>'detail',
    'movementPattern', case
      when nullif(trim(coalesce(sl.snapshot_movement_pattern, '')), '') is not null then 'snapshotted'
      when nullif(trim(coalesce(computed.movement_pattern, '')), '') is not null then 'estimated'
      else 'unknown'
    end,
    'muscleCredits', case
      when sl.snapshot_muscle_credits is not null then 'snapshotted'
      when public.st_estimated_muscle_credits(computed.coaching_metadata) is not null then 'estimated'
      else 'unknown'
    end,
    'variant', 'unknown'
  )
from (
  select
    source.id,
    c.movement_pattern,
    c.coaching_metadata,
    inference.inferred
  from public.st_set_logs source
  left join public.st_exercise_catalog c on c.id = source.snapshot_catalog_exercise_id
  cross join lateral (
    select public.st_infer_snapshot_equipment(
      source.snapshot_equipment,
      source.snapshot_exercise_name,
      public.st_catalog_equipment_options(c.equipment, c.coaching_metadata)
    ) as inferred
  ) inference
) computed
where sl.id = computed.id
  and (
    sl.snapshot_provenance is null
    or not (sl.snapshot_provenance ? 'equipment')
  );

-- After this trigger, an ordinary set update cannot rewrite snapshot identity.
-- A later conservative backfill may set st.allow_snapshot_backfill = on for that transaction.
create or replace function public.st_set_logs_preserve_snapshots()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('st.allow_snapshot_backfill', true), '') = 'on' then
    return new;
  end if;
  new.snapshot_exercise_name := old.snapshot_exercise_name;
  new.snapshot_catalog_exercise_id := old.snapshot_catalog_exercise_id;
  new.snapshot_superset_group_id := old.snapshot_superset_group_id;
  new.snapshot_muscle_group := old.snapshot_muscle_group;
  new.snapshot_equipment := old.snapshot_equipment;
  new.snapshot_section := old.snapshot_section;
  new.snapshot_exercise_type := old.snapshot_exercise_type;
  new.snapshot_set_type := old.snapshot_set_type;
  new.snapshot_set_number := old.snapshot_set_number;
  new.snapshot_target_weight := old.snapshot_target_weight;
  new.snapshot_target_reps := old.snapshot_target_reps;
  new.snapshot_target_rpe := old.snapshot_target_rpe;
  new.snapshot_day_label := old.snapshot_day_label;
  new.snapshot_workout_type := old.snapshot_workout_type;
  new.snapshot_week := old.snapshot_week;
  new.snapshot_day_order := old.snapshot_day_order;
  new.snapshot_target_rir := old.snapshot_target_rir;
  new.snapshot_rep_min := old.snapshot_rep_min;
  new.snapshot_rep_max := old.snapshot_rep_max;
  new.snapshot_program_role := old.snapshot_program_role;
  new.snapshot_rest_seconds := old.snapshot_rest_seconds;
  new.snapshot_movement_pattern := old.snapshot_movement_pattern;
  new.snapshot_muscle_credits := old.snapshot_muscle_credits;
  new.snapshot_variant := old.snapshot_variant;
  new.snapshot_provenance := old.snapshot_provenance;
  return new;
end;
$$;

drop trigger if exists st_set_logs_preserve_snapshots on public.st_set_logs;
create trigger st_set_logs_preserve_snapshots
  before update on public.st_set_logs
  for each row execute function public.st_set_logs_preserve_snapshots();

create or replace function public.st_progress_snapshot_provenance_counts()
returns table(field text, provenance text, detail text, sets bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select 'equipment'::text,
    snapshot_provenance->>'equipment',
    snapshot_provenance->>'equipmentDetail',
    count(*)
  from public.st_set_logs
  group by 2, 3
  union all
  select 'movement_pattern'::text,
    snapshot_provenance->>'movementPattern',
    null::text,
    count(*)
  from public.st_set_logs
  group by 2
  union all
  select 'muscle_credits'::text,
    snapshot_provenance->>'muscleCredits',
    null::text,
    count(*)
  from public.st_set_logs
  group by 2;
$$;

-- Body measurements. Existing weight and waist rows stay valid.
alter table public.st_body_measurements
  add column if not exists chest_inches numeric,
  add column if not exists arm_inches numeric,
  add column if not exists thigh_inches numeric,
  add column if not exists hip_inches numeric,
  add column if not exists neck_inches numeric,
  add column if not exists body_fat_percent numeric,
  add column if not exists measurement_extras jsonb;

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_has_value;

alter table public.st_body_measurements
  add constraint st_body_measurements_has_value check (
    weight_lbs is not null
    or waist_inches is not null
    or chest_inches is not null
    or arm_inches is not null
    or thigh_inches is not null
    or hip_inches is not null
    or neck_inches is not null
    or body_fat_percent is not null
    or (measurement_extras is not null and measurement_extras <> '{}'::jsonb)
  );

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_chest_positive;
alter table public.st_body_measurements
  add constraint st_body_measurements_chest_positive check (chest_inches is null or chest_inches > 0);

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_arm_positive;
alter table public.st_body_measurements
  add constraint st_body_measurements_arm_positive check (arm_inches is null or arm_inches > 0);

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_thigh_positive;
alter table public.st_body_measurements
  add constraint st_body_measurements_thigh_positive check (thigh_inches is null or thigh_inches > 0);

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_hip_positive;
alter table public.st_body_measurements
  add constraint st_body_measurements_hip_positive check (hip_inches is null or hip_inches > 0);

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_neck_positive;
alter table public.st_body_measurements
  add constraint st_body_measurements_neck_positive check (neck_inches is null or neck_inches > 0);

alter table public.st_body_measurements
  drop constraint if exists st_body_measurements_body_fat_range;
alter table public.st_body_measurements
  add constraint st_body_measurements_body_fat_range check (
    body_fat_percent is null or (body_fat_percent > 0 and body_fat_percent <= 100)
  );

comment on column public.st_body_measurements.measurement_extras is
  'Optional future measurements keyed by the body measurement registry. Standard fields stay in their own columns.';


-- ===== 20261008_061_phase2b1_adaptation_orchestration.sql =====

-- BIQ-0254 Phase 2B.1 — workout-level adaptation run lock and summary.
-- Completion stays on st_workout_sessions. This table records whether
-- adaptation ran after that completion so retries stay idempotent.
-- DO NOT apply until reviewed.

create table if not exists public.st_adaptation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.st_workouts(id) on delete cascade,
  program_id uuid references public.st_programs(id) on delete set null,
  log_date date not null,
  workout_session_id uuid references public.st_workout_sessions(id) on delete set null,
  status text not null default 'pending',
  skipped_reason text,
  evaluated_count int not null default 0,
  updated_count int not null default 0,
  held_count int not null default 0,
  review_count int not null default 0,
  failed_count int not null default 0,
  summary_text text,
  error_text text,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint st_adaptation_runs_status_check
    check (status in ('pending', 'completed', 'failed', 'skipped')),
  constraint st_adaptation_runs_unique unique (user_id, workout_id, log_date)
);

comment on table public.st_adaptation_runs is
  'Phase 2B.1 one adaptation pass per user + workout + log date. Completion is stored on st_workout_sessions even if this row is failed.';

create index if not exists st_adaptation_runs_user_date_idx
  on public.st_adaptation_runs (user_id, log_date desc);

alter table public.st_adaptation_runs enable row level security;

drop policy if exists "adaptation_runs_select_own" on public.st_adaptation_runs;
create policy "adaptation_runs_select_own" on public.st_adaptation_runs
  for select using (user_id = auth.uid());

drop policy if exists "adaptation_runs_insert_own" on public.st_adaptation_runs;
create policy "adaptation_runs_insert_own" on public.st_adaptation_runs
  for insert with check (user_id = auth.uid());

drop policy if exists "adaptation_runs_update_own" on public.st_adaptation_runs;
create policy "adaptation_runs_update_own" on public.st_adaptation_runs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
