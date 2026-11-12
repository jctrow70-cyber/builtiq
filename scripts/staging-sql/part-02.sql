-- BuildIQ Staging schema replay part 2

-- ===== 20250707_004_set_log_snapshots.sql =====

-- BIQ-0003: Workout history stability via set log snapshots
-- Safe additive migration. Does not drop tables or delete data.

alter table public.st_set_logs
  add column if not exists snapshot_exercise_name text,
  add column if not exists snapshot_muscle_group text,
  add column if not exists snapshot_section text,
  add column if not exists snapshot_set_type text,
  add column if not exists snapshot_set_number int,
  add column if not exists snapshot_target_weight text,
  add column if not exists snapshot_target_reps text,
  add column if not exists snapshot_target_rpe text,
  add column if not exists snapshot_day_label text,
  add column if not exists snapshot_workout_type text;

-- Backfill snapshots for existing logs where the template chain still exists.
update public.st_set_logs sl
set
  snapshot_exercise_name = e.name,
  snapshot_muscle_group = e.muscle_group,
  snapshot_section = coalesce(e.section, 'strength'),
  snapshot_set_type = ps.set_type,
  snapshot_set_number = ps.set_number,
  snapshot_target_weight = ps.target_weight,
  snapshot_target_reps = ps.target_reps,
  snapshot_target_rpe = ps.target_rpe,
  snapshot_day_label = w.day_label,
  snapshot_workout_type = w.workout_type
from public.st_planned_sets ps
join public.st_exercises e on e.id = ps.exercise_id
join public.st_workouts w on w.id = e.workout_id
where sl.planned_set_id = ps.id
  and sl.snapshot_exercise_name is null;

-- Preserve completed logs when planned sets are removed from templates.
alter table public.st_set_logs drop constraint if exists st_set_logs_planned_set_id_fkey;
alter table public.st_set_logs alter column planned_set_id drop not null;
alter table public.st_set_logs
  add constraint st_set_logs_planned_set_id_fkey
  foreign key (planned_set_id) references public.st_planned_sets(id) on delete set null;

create or replace function public.st_user_can_access_set_log(
  p_planned_set_id uuid,
  p_snapshot_exercise_name text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      p_planned_set_id is not null
      and public.st_user_can_read_planned_set(p_planned_set_id)
    )
    or coalesce(length(trim(p_snapshot_exercise_name)), 0) > 0;
$$;

drop policy if exists "set_logs_select" on public.st_set_logs;
drop policy if exists "set_logs_insert" on public.st_set_logs;
drop policy if exists "set_logs_update" on public.st_set_logs;
drop policy if exists "set_logs_delete" on public.st_set_logs;

create policy "set_logs_select" on public.st_set_logs
  for select
  using (
    user_id = auth.uid()
    and public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
  );

create policy "set_logs_insert" on public.st_set_logs
  for insert
  with check (
    user_id = auth.uid()
    and planned_set_id is not null
    and public.st_user_can_read_planned_set(planned_set_id)
    and coalesce(length(trim(snapshot_exercise_name)), 0) > 0
  );

create policy "set_logs_update" on public.st_set_logs
  for update
  using (
    user_id = auth.uid()
    and public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
  )
  with check (
    user_id = auth.uid()
    and public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
  );

create policy "set_logs_delete" on public.st_set_logs
  for delete
  using (
    user_id = auth.uid()
    and public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
  );


-- ===== 20250707_005_exercise_catalog.sql =====

-- BIQ-0005: Exercise catalog (system + user exercises)
-- Safe additive migration. Does not drop tables or delete data.

create table if not exists public.st_exercise_catalog (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text,
  muscle_group text,
  equipment text,
  movement_pattern text,
  is_system boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint st_exercise_catalog_owner_check check (
    (is_system = true and user_id is null)
    or (is_system = false and user_id is not null)
  )
);

create index if not exists st_exercise_catalog_user_idx
  on public.st_exercise_catalog (user_id)
  where user_id is not null;

create index if not exists st_exercise_catalog_system_idx
  on public.st_exercise_catalog (is_system, is_archived)
  where is_system = true;

create index if not exists st_exercise_catalog_name_idx
  on public.st_exercise_catalog (lower(name));

create or replace function public.st_exercise_catalog_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists st_exercise_catalog_updated_at on public.st_exercise_catalog;
create trigger st_exercise_catalog_updated_at
  before update on public.st_exercise_catalog
  for each row execute function public.st_exercise_catalog_set_updated_at();

alter table public.st_exercise_catalog enable row level security;

drop policy if exists "exercise_catalog_select" on public.st_exercise_catalog;
drop policy if exists "exercise_catalog_insert" on public.st_exercise_catalog;
drop policy if exists "exercise_catalog_update" on public.st_exercise_catalog;

create policy "exercise_catalog_select" on public.st_exercise_catalog
  for select
  using (
    is_system = true
    or user_id = auth.uid()
  );

create policy "exercise_catalog_insert" on public.st_exercise_catalog
  for insert
  with check (
    is_system = false
    and user_id = auth.uid()
  );

create policy "exercise_catalog_update" on public.st_exercise_catalog
  for update
  using (
    is_system = false
    and user_id = auth.uid()
  )
  with check (
    is_system = false
    and user_id = auth.uid()
  );

-- BuildIQ system exercise library (available to all users)
insert into public.st_exercise_catalog (
  name, category, muscle_group, equipment, movement_pattern, is_system, user_id
)
select v.name, v.category, v.muscle_group, v.equipment, v.movement_pattern, true, null
from (
  values
    ('Assault Bike or Walk', 'warmup', 'Cardio', 'machine', 'cardio'),
    ('World''s Greatest Stretch', 'warmup', 'Full Body', 'bodyweight', 'mobility'),
    ('Glute Bridge', 'warmup', 'Glutes', 'bodyweight', 'activation'),
    ('Band Pull-Aparts', 'warmup', 'Upper Back', 'band', 'activation'),
    ('Scap Push-ups', 'warmup', 'Chest', 'bodyweight', 'activation'),
    ('Bodyweight Squat', 'warmup', 'Quads', 'bodyweight', 'squat'),
    ('Inchworm', 'warmup', 'Full Body', 'bodyweight', 'mobility'),
    ('Romanian Deadlift', 'strength', 'Hamstrings', 'barbell', 'hinge'),
    ('Back Squat', 'strength', 'Quads', 'barbell', 'squat'),
    ('Front Squat', 'strength', 'Quads', 'barbell', 'squat'),
    ('Goblet Squat', 'strength', 'Quads', 'dumbbell', 'squat'),
    ('Seated Leg Curl', 'strength', 'Hamstrings', 'machine', 'isolation'),
    ('Lying Leg Curl', 'strength', 'Hamstrings', 'machine', 'isolation'),
    ('Leg Extension', 'strength', 'Quads', 'machine', 'isolation'),
    ('Hip Thrust', 'strength', 'Glutes', 'barbell', 'hinge'),
    ('Bulgarian Split Squat', 'strength', 'Quads', 'dumbbell', 'squat'),
    ('Walking Lunge', 'strength', 'Quads', 'dumbbell', 'lunge'),
    ('Bench Press', 'strength', 'Chest', 'barbell', 'push'),
    ('Incline DB Press', 'strength', 'Upper Chest', 'dumbbell', 'push'),
    ('Incline Barbell Press', 'strength', 'Upper Chest', 'barbell', 'push'),
    ('Dumbbell Bench Press', 'strength', 'Chest', 'dumbbell', 'push'),
    ('Overhead Press', 'strength', 'Shoulders', 'barbell', 'push'),
    ('Dumbbell Shoulder Press', 'strength', 'Shoulders', 'dumbbell', 'push'),
    ('Lat Pulldown', 'strength', 'Lats', 'cable', 'pull'),
    ('Pull-Up', 'strength', 'Lats', 'bodyweight', 'pull'),
    ('Chin-Up', 'strength', 'Lats', 'bodyweight', 'pull'),
    ('Cable Row', 'strength', 'Mid Back', 'cable', 'pull'),
    ('Barbell Row', 'strength', 'Mid Back', 'barbell', 'pull'),
    ('Dumbbell Row', 'strength', 'Mid Back', 'dumbbell', 'pull'),
    ('Face Pull', 'strength', 'Rear Delts', 'cable', 'pull'),
    ('Tricep Pushdown', 'strength', 'Triceps', 'cable', 'isolation'),
    ('Skull Crusher', 'strength', 'Triceps', 'barbell', 'isolation'),
    ('Barbell Curl', 'strength', 'Biceps', 'barbell', 'isolation'),
    ('Dumbbell Curl', 'strength', 'Biceps', 'dumbbell', 'isolation'),
    ('Lateral Raise', 'strength', 'Side Delts', 'dumbbell', 'isolation'),
    ('Deadlift', 'strength', 'Full Body', 'barbell', 'hinge'),
    ('Trap Bar Deadlift', 'strength', 'Full Body', 'trap bar', 'hinge'),
    ('Farmer Carry', 'strength', 'Forearms', 'dumbbell', 'carry'),
    ('Plank', 'warmup', 'Core', 'bodyweight', 'stability'),
    ('Dead Bug', 'warmup', 'Core', 'bodyweight', 'stability'),
    ('Box Jump', 'plyometric', 'Quads', 'box', 'power'),
    ('Broad Jump', 'plyometric', 'Full Body', 'bodyweight', 'power'),
    ('Med Ball Slam', 'plyometric', 'Core', 'medicine ball', 'power')
) as v(name, category, muscle_group, equipment, movement_pattern)
where not exists (
  select 1
  from public.st_exercise_catalog c
  where c.is_system = true
    and lower(c.name) = lower(v.name)
);

alter table public.st_exercises
  add column if not exists catalog_exercise_id uuid references public.st_exercise_catalog(id) on delete set null;

create index if not exists st_exercises_catalog_idx
  on public.st_exercises (catalog_exercise_id);

alter table public.st_set_logs
  add column if not exists snapshot_catalog_exercise_id uuid references public.st_exercise_catalog(id) on delete set null;

create index if not exists st_set_logs_snapshot_catalog_idx
  on public.st_set_logs (snapshot_catalog_exercise_id);

-- Link existing workout exercises to system catalog entries by name.
update public.st_exercises e
set catalog_exercise_id = c.id
from public.st_exercise_catalog c
where e.catalog_exercise_id is null
  and c.is_system = true
  and lower(c.name) = lower(e.name);

-- Backfill log snapshots with catalog ids where the template chain still exists.
update public.st_set_logs sl
set snapshot_catalog_exercise_id = coalesce(e.catalog_exercise_id, sl.snapshot_catalog_exercise_id)
from public.st_planned_sets ps
join public.st_exercises e on e.id = ps.exercise_id
where sl.planned_set_id = ps.id
  and sl.snapshot_catalog_exercise_id is null
  and e.catalog_exercise_id is not null;



-- ===== 20250707_006_expand_user_profiles.sql =====

-- BIQ-0006: Expand user profiles and onboarding fields
-- Safe additive migration. Does not drop tables or delete data.

alter table public.st_profiles
  add column if not exists height_inches numeric,
  add column if not exists weight_lbs numeric,
  add column if not exists birth_year int,
  add column if not exists sex text,
  add column if not exists experience_level text,
  add column if not exists primary_goal text,
  add column if not exists units_preference text default 'imperial',
  add column if not exists profile_completed boolean not null default false,
  add column if not exists updated_at timestamptz default now();

-- Existing users with a display name are treated as onboarded.
update public.st_profiles
set profile_completed = true
where coalesce(length(trim(display_name)), 0) > 0
  and profile_completed = false;

create or replace function public.st_profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists st_profiles_updated_at on public.st_profiles;
create trigger st_profiles_updated_at
  before update on public.st_profiles
  for each row execute function public.st_profiles_set_updated_at();


-- ===== 20250707_007_exercise_supersets.sql =====

-- BIQ-0008: Exercise supersets (2-3 exercises grouped)
-- Safe additive migration. Does not drop tables or delete data.

alter table public.st_exercises
  add column if not exists superset_group_id uuid;

create index if not exists st_exercises_superset_group_idx
  on public.st_exercises (workout_id, section, superset_group_id)
  where superset_group_id is not null;

alter table public.st_set_logs
  add column if not exists snapshot_superset_group_id uuid;


-- ===== 20250707_008_team_progress_and_plans.sql =====

-- BIQ-0009: Team progress, member plan choice, coach visibility
-- Safe additive migration. Does not drop tables or delete data.

alter table public.st_team_members
  add column if not exists training_source text not null default 'team'
    check (training_source in ('team', 'personal'));

alter table public.st_teams
  add column if not exists default_program_id uuid
    references public.st_programs(id) on delete set null;

alter table public.st_set_logs
  add column if not exists team_id uuid
    references public.st_teams(id) on delete set null;

create index if not exists st_set_logs_team_user_date_idx
  on public.st_set_logs (team_id, user_id, log_date desc)
  where team_id is not null;

-- Backfill team_id on logs tied to team programs
update public.st_set_logs sl
set team_id = p.team_id
from public.st_planned_sets ps
join public.st_exercises e on e.id = ps.exercise_id
join public.st_workouts w on w.id = e.workout_id
join public.st_programs p on p.id = w.program_id
where sl.planned_set_id = ps.id
  and p.visibility = 'team'
  and p.team_id is not null
  and sl.team_id is null;

-- Coach can read a teammate's personal program template
create or replace function public.st_user_can_coach_read_member_program(p_member_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_team_members coach
    join public.st_team_members member on member.team_id = coach.team_id
    where coach.user_id = auth.uid()
      and coach.role in ('owner', 'editor')
      and coach.status = 'active'
      and member.user_id = p_member_user_id
      and member.status = 'active'
  );
$$;

create or replace function public.st_user_can_coach_read_member_log(p_log_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_log_user_id is distinct from auth.uid()
    and public.st_user_can_coach_read_member_program(p_log_user_id);
$$;

-- Member sets own team vs personal training source
create or replace function public.st_set_my_training_source(
  p_team_id uuid,
  p_training_source text
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

  if p_training_source not in ('team', 'personal') then
    raise exception 'Invalid training source';
  end if;

  update public.st_team_members
  set training_source = p_training_source
  where team_id = p_team_id
    and user_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Not an active team member';
  end if;
end;
$$;

revoke all on function public.st_set_my_training_source(uuid, text) from public;
grant execute on function public.st_set_my_training_source(uuid, text) to authenticated;

-- Owner/editor sets a member's training source
create or replace function public.st_set_member_training_source(
  p_team_id uuid,
  p_member_user_id uuid,
  p_training_source text
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

  if not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not allowed';
  end if;

  if p_training_source not in ('team', 'personal') then
    raise exception 'Invalid training source';
  end if;

  update public.st_team_members
  set training_source = p_training_source
  where team_id = p_team_id
    and user_id = p_member_user_id
    and status = 'active';

  if not found then
    raise exception 'Member not found';
  end if;
end;
$$;

revoke all on function public.st_set_member_training_source(uuid, uuid, text) from public;
grant execute on function public.st_set_member_training_source(uuid, uuid, text) to authenticated;

-- Programs: coaches may read teammates' personal programs
drop policy if exists "programs_read" on public.st_programs;

create policy "programs_read" on public.st_programs
  for select
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_is_active_team_member(team_id))
    or (
      visibility = 'personal'
      and public.st_user_can_coach_read_member_program(owner_user_id)
    )
  );

-- Set logs: own rows OR coach read of teammate logs
drop policy if exists "set_logs_select" on public.st_set_logs;

create policy "set_logs_select" on public.st_set_logs
  for select
  using (
    (
      user_id = auth.uid()
      and public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
    )
    or (
      public.st_user_can_coach_read_member_log(user_id)
      and public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
    )
  );


-- ===== 20250707_009_training_progression_and_focus.sql =====

-- BIQ-0011: Muscle focus on programs + optional log week context

alter table st_programs
  add column if not exists focus_muscles text[] default null,
  add column if not exists progression_profile jsonb default null;

comment on column st_programs.focus_muscles is 'User-selected muscle emphasis at program generation (BIQ-0011)';
comment on column st_programs.progression_profile is 'Future AI/rule progression metadata';

alter table st_set_logs
  add column if not exists snapshot_week smallint default null,
  add column if not exists snapshot_day_order smallint default null;

comment on column st_set_logs.snapshot_week is 'Program week when set was logged (snapshot)';
comment on column st_set_logs.snapshot_day_order is 'Workout day_order when set was logged (snapshot)';


-- ===== 20250708_010_exercise_types_and_program_assignments.sql =====

-- BIQ-0012: exercise types, cardio log fields, superset labels, program assignments

alter table public.st_exercise_catalog
  add column if not exists exercise_type text not null default 'strength';

alter table public.st_exercises
  add column if not exists exercise_type text not null default 'strength',
  add column if not exists superset_label text,
  add column if not exists superset_order smallint;

create index if not exists st_exercises_superset_label_idx
  on public.st_exercises (workout_id, section, superset_group_id);

alter table public.st_set_logs
  add column if not exists snapshot_exercise_type text,
  add column if not exists actual_rpe text,
  add column if not exists actual_duration text,
  add column if not exists actual_distance text,
  add column if not exists actual_pace text,
  add column if not exists actual_hr text,
  add column if not exists actual_calories text,
  add column if not exists log_notes text,
  add column if not exists logged_by_user_id uuid references auth.users(id) on delete set null;

-- Backfill catalog cardio examples
update public.st_exercise_catalog
set exercise_type = 'cardio'
where lower(name) similar to '%(walk|run|bike|row|elliptical|swim|assault bike)%'
  and exercise_type = 'strength';

create table if not exists public.st_program_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.st_teams(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assignment_type text not null check (assignment_type in ('personal','team','individual_team','manual')),
  program_id uuid references public.st_programs(id) on delete set null,
  start_date date not null default current_date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists st_program_assignments_user_team_idx
  on public.st_program_assignments (user_id, team_id, is_active);

alter table public.st_program_assignments enable row level security;

create policy "program_assignments_select" on public.st_program_assignments
  for select using (
    user_id = auth.uid()
    or public.st_user_can_read_program(program_id)
    or exists (
      select 1 from public.st_team_members tm
      where tm.team_id = st_program_assignments.team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner','editor')
    )
  );

create policy "program_assignments_insert" on public.st_program_assignments
  for insert with check (
    exists (
      select 1 from public.st_team_members tm
      where tm.team_id = st_program_assignments.team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner','editor')
    )
  );

create policy "program_assignments_update" on public.st_program_assignments
  for update using (
    exists (
      select 1 from public.st_team_members tm
      where tm.team_id = st_program_assignments.team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner','editor')
    )
  );

-- Coaches may insert/update logs for team members on team programs
drop policy if exists "set_logs_insert" on public.st_set_logs;
drop policy if exists "set_logs_update" on public.st_set_logs;

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
        and coach.role in ('owner','editor')
        and p.visibility = 'team'
    )
  );

create policy "set_logs_update" on public.st_set_logs
  for update using (
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
        and coach.role in ('owner','editor')
        and p.visibility = 'team'
    )
  );

create or replace function public.st_assign_member_program(
  p_team_id uuid,
  p_member_user_id uuid,
  p_assignment_type text,
  p_program_id uuid default null,
  p_notes text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = auth.uid()
      and status = 'active' and role in ('owner','editor')
  ) then
    raise exception 'Not authorized';
  end if;

  update public.st_program_assignments
  set is_active = false
  where user_id = p_member_user_id and team_id = p_team_id and is_active = true;

  insert into public.st_program_assignments (
    user_id, team_id, assigned_by, assignment_type, program_id, notes, is_active
  ) values (
    p_member_user_id, p_team_id, auth.uid(), p_assignment_type, p_program_id, p_notes, true
  );

  if p_assignment_type = 'personal' then
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'personal');
  else
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'team');
  end if;
end;
$$;


-- ===== 20250708_011_exercise_intelligence_database.sql =====

-- BIQ-0013: Exercise Intelligence Database
-- Schema for large external imports + BuildIQ programming intelligence.
-- Does NOT seed exercises. Existing BIQ-0005 seed rows remain; future bulk import replaces expansion strategy.

-- ---------------------------------------------------------------------------
-- External reference + rich media (import-ready)
-- ---------------------------------------------------------------------------
alter table public.st_exercise_catalog
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists media_url text,
  add column if not exists image_url text,
  add column if not exists video_url text,
  add column if not exists gif_url text,
  add column if not exists instructions text;

comment on column public.st_exercise_catalog.external_source is 'Import origin, e.g. wger, exercisedb, builtiq_curated';
comment on column public.st_exercise_catalog.external_id is 'Stable id from external_source for idempotent re-import';
comment on column public.st_exercise_catalog.media_url is 'Primary media asset (image, gif, or video URL)';
comment on column public.st_exercise_catalog.instructions is 'Step-by-step execution instructions (plain text or markdown)';

create unique index if not exists st_exercise_catalog_external_uidx
  on public.st_exercise_catalog (external_source, external_id)
  where external_source is not null and external_id is not null;

-- ---------------------------------------------------------------------------
-- BuildIQ intelligence fields
-- ---------------------------------------------------------------------------
alter table public.st_exercise_catalog
  add column if not exists training_goal text,
  add column if not exists progression_type text,
  add column if not exists primary_muscle_percentage smallint,
  add column if not exists secondary_muscle_percentage smallint,
  add column if not exists muscle_targets jsonb,
  add column if not exists coaching_metadata jsonb not null default '{}'::jsonb;

comment on column public.st_exercise_catalog.movement_pattern is 'BIQ-0013: squat|hinge|push_horizontal|push_vertical|pull_horizontal|pull_vertical|carry|rotation|isolation|cardio';
comment on column public.st_exercise_catalog.training_goal is 'strength|hypertrophy|endurance|power|mobility';
comment on column public.st_exercise_catalog.progression_type is 'weight|reps|duration|distance|intensity';
comment on column public.st_exercise_catalog.muscle_targets is 'Optional fine-grained volume: [{muscle, percentage, role}]';
comment on column public.st_exercise_catalog.coaching_metadata is 'AI programming hints: fatigue, skill, cues, pairing, substitution triggers';

alter table public.st_exercise_catalog
  drop constraint if exists st_exercise_catalog_movement_pattern_check;

alter table public.st_exercise_catalog
  add constraint st_exercise_catalog_movement_pattern_check check (
    movement_pattern is null
    or movement_pattern in (
      'squat', 'hinge', 'push_horizontal', 'push_vertical', 'pull_horizontal',
      'pull_vertical', 'carry', 'rotation', 'isolation', 'cardio',
      -- legacy BIQ-0005 values until import normalizes rows
      'push', 'pull', 'lunge', 'mobility', 'activation', 'stability', 'power'
    )
  );

alter table public.st_exercise_catalog
  drop constraint if exists st_exercise_catalog_training_goal_check;

alter table public.st_exercise_catalog
  add constraint st_exercise_catalog_training_goal_check check (
    training_goal is null
    or training_goal in ('strength', 'hypertrophy', 'endurance', 'power', 'mobility')
  );

alter table public.st_exercise_catalog
  drop constraint if exists st_exercise_catalog_progression_type_check;

alter table public.st_exercise_catalog
  add constraint st_exercise_catalog_progression_type_check check (
    progression_type is null
    or progression_type in ('weight', 'reps', 'duration', 'distance', 'intensity')
  );

alter table public.st_exercise_catalog
  drop constraint if exists st_exercise_catalog_primary_muscle_pct_check;

alter table public.st_exercise_catalog
  add constraint st_exercise_catalog_primary_muscle_pct_check check (
    primary_muscle_percentage is null
    or (primary_muscle_percentage >= 0 and primary_muscle_percentage <= 100)
  );

alter table public.st_exercise_catalog
  drop constraint if exists st_exercise_catalog_secondary_muscle_pct_check;

alter table public.st_exercise_catalog
  add constraint st_exercise_catalog_secondary_muscle_pct_check check (
    secondary_muscle_percentage is null
    or (secondary_muscle_percentage >= 0 and secondary_muscle_percentage <= 100)
  );

-- Search index for 1000+ exercises
create index if not exists st_exercise_catalog_search_idx
  on public.st_exercise_catalog using gin (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' || coalesce(muscle_group, '') || ' ' ||
      coalesce(equipment, '') || ' ' || coalesce(instructions, '')
    )
  );

create index if not exists st_exercise_catalog_movement_idx
  on public.st_exercise_catalog (movement_pattern)
  where is_archived = false;

create index if not exists st_exercise_catalog_training_goal_idx
  on public.st_exercise_catalog (training_goal)
  where is_archived = false;

-- ---------------------------------------------------------------------------
-- Exercise alternatives (substitutions)
-- ---------------------------------------------------------------------------
create table if not exists public.st_exercise_alternatives (
  id uuid primary key default uuid_generate_v4(),
  exercise_id uuid not null references public.st_exercise_catalog(id) on delete cascade,
  alternative_id uuid not null references public.st_exercise_catalog(id) on delete cascade,
  reason text not null default 'similar_stimulus',
  priority smallint not null default 1,
  notes text,
  is_system boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint st_exercise_alternatives_distinct check (exercise_id <> alternative_id),
  constraint st_exercise_alternatives_reason_check check (
    reason in ('equipment_unavailable', 'injury', 'skill_level', 'preference', 'similar_stimulus')
  ),
  constraint st_exercise_alternatives_unique unique (exercise_id, alternative_id, reason)
);

create index if not exists st_exercise_alternatives_exercise_idx
  on public.st_exercise_alternatives (exercise_id, priority);

create index if not exists st_exercise_alternatives_alt_idx
  on public.st_exercise_alternatives (alternative_id);

alter table public.st_exercise_alternatives enable row level security;

drop policy if exists "exercise_alternatives_select" on public.st_exercise_alternatives;
drop policy if exists "exercise_alternatives_insert" on public.st_exercise_alternatives;
drop policy if exists "exercise_alternatives_update" on public.st_exercise_alternatives;
drop policy if exists "exercise_alternatives_delete" on public.st_exercise_alternatives;

-- User can read alternatives when both exercises are visible (system or own custom)
create policy "exercise_alternatives_select" on public.st_exercise_alternatives
  for select
  using (
    exists (
      select 1 from public.st_exercise_catalog e
      where e.id = exercise_id
        and (e.is_system = true or e.user_id = auth.uid())
    )
    and exists (
      select 1 from public.st_exercise_catalog a
      where a.id = alternative_id
        and (a.is_system = true or a.user_id = auth.uid())
    )
  );

-- Users may define alternatives between their own custom exercises
create policy "exercise_alternatives_insert" on public.st_exercise_alternatives
  for insert
  with check (
    is_system = false
    and created_by = auth.uid()
    and exists (
      select 1 from public.st_exercise_catalog e
      where e.id = exercise_id and e.is_system = false and e.user_id = auth.uid()
    )
    and exists (
      select 1 from public.st_exercise_catalog a
      where a.id = alternative_id and a.is_system = false and a.user_id = auth.uid()
    )
  );

create policy "exercise_alternatives_update" on public.st_exercise_alternatives
  for update
  using (is_system = false and created_by = auth.uid())
  with check (is_system = false and created_by = auth.uid());

create policy "exercise_alternatives_delete" on public.st_exercise_alternatives
  for delete
  using (is_system = false and created_by = auth.uid());

-- Example system alternative (only if both catalog rows exist after import)
-- Bench Press -> Dumbbell Bench Press
insert into public.st_exercise_alternatives (exercise_id, alternative_id, reason, priority, notes, is_system)
select bp.id, dbp.id, 'equipment_unavailable', 1, 'No barbell or rack available', true
from public.st_exercise_catalog bp
join public.st_exercise_catalog dbp on lower(dbp.name) = lower('Dumbbell Bench Press')
where lower(bp.name) = lower('Bench Press')
  and bp.is_system = true
  and dbp.is_system = true
  and not exists (
    select 1 from public.st_exercise_alternatives x
    where x.exercise_id = bp.id and x.alternative_id = dbp.id and x.reason = 'equipment_unavailable'
  );


-- ===== 20250708_012_fix_movement_pattern_constraint.sql =====

-- BIQ-0013 hotfix: normalize movement_pattern before constraint (safe to re-run)
-- Run this if migration 011 failed on st_exercise_catalog_movement_pattern_check

alter table public.st_exercise_catalog
  drop constraint if exists st_exercise_catalog_movement_pattern_check;

update public.st_exercise_catalog
set movement_pattern = null
where movement_pattern is not null and trim(movement_pattern) = '';

update public.st_exercise_catalog
set movement_pattern = lower(trim(movement_pattern))
where movement_pattern is not null;

update public.st_exercise_catalog
set movement_pattern = case movement_pattern
  when 'push' then 'push_horizontal'
  when 'pull' then 'pull_horizontal'
  when 'lunge' then 'squat'
  when 'mobility' then 'rotation'
  when 'activation' then 'isolation'
  when 'stability' then 'isolation'
  when 'power' then 'squat'
  else movement_pattern
end
where movement_pattern is not null;

update public.st_exercise_catalog
set movement_pattern = null
where movement_pattern is not null
  and movement_pattern not in (
    'squat', 'hinge', 'push_horizontal', 'push_vertical', 'pull_horizontal',
    'pull_vertical', 'carry', 'rotation', 'isolation', 'cardio'
  );

alter table public.st_exercise_catalog
  add constraint st_exercise_catalog_movement_pattern_check check (
    movement_pattern is null
    or movement_pattern in (
      'squat', 'hinge', 'push_horizontal', 'push_vertical', 'pull_horizontal',
      'pull_vertical', 'carry', 'rotation', 'isolation', 'cardio'
    )
  );


-- ===== 20250709_013_program_generator_v2.sql =====

-- BIQ-0014: AI program generation metadata on st_programs

alter table public.st_programs
  add column if not exists generation_prompt text,
  add column if not exists generation_method text,
  add column if not exists program_summary text,
  add column if not exists program_style text;

comment on column public.st_programs.generation_prompt is 'Natural-language prompt used when generating this program (BIQ-0014)';
comment on column public.st_programs.generation_method is 'How program was created: ai, template, manual';
comment on column public.st_programs.program_summary is 'Human-readable summary of program design';
comment on column public.st_programs.program_style is 'general|hypertrophy|strength|athletic_performance';

alter table public.st_programs
  drop constraint if exists st_programs_generation_method_check;

alter table public.st_programs
  add constraint st_programs_generation_method_check check (
    generation_method is null
    or generation_method in ('ai', 'template', 'manual')
  );

alter table public.st_programs
  drop constraint if exists st_programs_program_style_check;

alter table public.st_programs
  add constraint st_programs_program_style_check check (
    program_style is null
    or program_style in ('general', 'hypertrophy', 'strength', 'athletic_performance')
  );


-- ===== 20250709_014_profile_available_equipment.sql =====

-- BIQ-0017: User available equipment for catalog + AI program filtering

alter table public.st_profiles
  add column if not exists available_equipment text[] default '{}';

comment on column public.st_profiles.available_equipment is 'Equipment user has access to; empty or full_gym = no filter';


-- ===== 20250711_015_coaching_notes_and_bug_reports.sql =====

-- BIQ-0018: Coaching notes on programs + in-app bug reports

alter table public.st_programs
  add column if not exists coaching_notes text;

comment on column public.st_programs.coaching_notes is 'AI-generated coaching guidance shown after program generation';

create table if not exists public.st_bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  description text not null,
  page_context text,
  app_nav text,
  user_agent text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists st_bug_reports_user_id_idx on public.st_bug_reports (user_id);
create index if not exists st_bug_reports_created_at_idx on public.st_bug_reports (created_at desc);

alter table public.st_bug_reports enable row level security;

drop policy if exists st_bug_reports_insert_own on public.st_bug_reports;
create policy st_bug_reports_insert_own
  on public.st_bug_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists st_bug_reports_select_own on public.st_bug_reports;
create policy st_bug_reports_select_own
  on public.st_bug_reports
  for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.st_bug_reports is 'In-app bug / feedback reports from signed-in users (BIQ-0018)';
