-- BuildIQ Staging schema replay part 5

-- ===== 20250813_041_profile_default_team.sql =====

-- BIQ-0116: Remember preferred group when user belongs to multiple teams

alter table public.st_profiles
  add column if not exists default_team_id uuid references public.st_teams (id) on delete set null;

comment on column public.st_profiles.default_team_id is
  'Preferred group for Training and Groups when the user belongs to multiple teams.';

create index if not exists st_profiles_default_team_idx
  on public.st_profiles (default_team_id)
  where default_team_id is not null;


-- ===== 20250902_042_program_design_foundation.sql =====

-- BIQ-0136 Program Design foundation
-- Additive only. Does not drop tables or delete workout history.

-- ---------------------------------------------------------------------------
-- 1. Program cycle + template/instance columns
-- ---------------------------------------------------------------------------

alter table public.st_programs
  add column if not exists end_date date;

alter table public.st_programs
  add column if not exists cycle_length_weeks int;

alter table public.st_programs
  add column if not exists record_kind text not null default 'instance';

comment on column public.st_programs.end_date is
  'Sunday at the end of the selected Monday–Sunday cycle.';
comment on column public.st_programs.cycle_length_weeks is
  'Number of complete Mon–Sun weeks in this program cycle.';
comment on column public.st_programs.record_kind is
  'template = reusable definition; instance = a person''s assigned copy.';

update public.st_programs
set cycle_length_weeks = coalesce(cycle_length_weeks, weeks, 6)
where cycle_length_weeks is null;

update public.st_programs
set record_kind = 'instance'
where record_kind is null or record_kind = '';

update public.st_programs
set end_date = (
  (start_date - ((extract(dow from start_date)::int + 6) % 7))
  + (greatest(coalesce(cycle_length_weeks, weeks, 6), 1) * 7 - 1)
)
where end_date is null
  and start_date is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'st_programs_record_kind_check'
      and conrelid = 'public.st_programs'::regclass
  ) then
    alter table public.st_programs
      add constraint st_programs_record_kind_check
      check (record_kind in ('template', 'instance'));
  end if;
end $$;

-- Expand status without dropping legacy `published`.
do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.st_programs'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
      and pg_get_constraintdef(c.oid) ilike '%draft%'
  loop
    execute format('alter table public.st_programs drop constraint if exists %I', rec.conname);
  end loop;
end $$;

alter table public.st_programs
  drop constraint if exists st_programs_status_check;

alter table public.st_programs
  add constraint st_programs_status_check
  check (status in ('draft', 'published', 'scheduled', 'active', 'completed', 'archived'));

-- ---------------------------------------------------------------------------
-- 2. Health calendar activities (multiple per day)
-- ---------------------------------------------------------------------------

create table if not exists public.st_program_activities (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.st_programs(id) on delete cascade,
  week_number int not null check (week_number >= 1),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  sort_order int not null default 0,
  activity_type text not null,
  title text not null default '',
  duration_minutes int,
  notes text,
  details jsonb not null default '{}'::jsonb,
  workout_id uuid references public.st_workouts(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.st_program_activities is
  'Planned health-calendar activities for a program week. Multiple rows per day are allowed.';
comment on column public.st_program_activities.day_of_week is
  '0=Monday … 6=Sunday.';
comment on column public.st_program_activities.details is
  'Type-specific planned fields (cardio zone, mobility movements, etc.).';
comment on column public.st_program_activities.workout_id is
  'Optional link to an st_workouts strength definition. Null until Phase 2.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'st_program_activities_type_check'
      and conrelid = 'public.st_program_activities'::regclass
  ) then
    alter table public.st_program_activities
      add constraint st_program_activities_type_check
      check (activity_type in (
        'strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest'
      ));
  end if;
end $$;

create index if not exists st_program_activities_program_week_idx
  on public.st_program_activities (program_id, week_number, day_of_week, sort_order);

create index if not exists st_program_activities_workout_idx
  on public.st_program_activities (workout_id)
  where workout_id is not null;

alter table public.st_program_activities enable row level security;

drop policy if exists "program_activities_select" on public.st_program_activities;
create policy "program_activities_select" on public.st_program_activities
  for select using (public.st_user_can_read_program(program_id));

drop policy if exists "program_activities_insert" on public.st_program_activities;
create policy "program_activities_insert" on public.st_program_activities
  for insert with check (
    exists (
      select 1 from public.st_programs p
      where p.id = program_id
        and (
          p.owner_user_id = auth.uid()
          or public.st_user_can_edit_team(p.team_id)
        )
    )
  );

drop policy if exists "program_activities_update" on public.st_program_activities;
create policy "program_activities_update" on public.st_program_activities
  for update using (
    exists (
      select 1 from public.st_programs p
      where p.id = program_id
        and (
          p.owner_user_id = auth.uid()
          or public.st_user_can_edit_team(p.team_id)
        )
    )
  );

drop policy if exists "program_activities_delete" on public.st_program_activities;
create policy "program_activities_delete" on public.st_program_activities
  for delete using (
    exists (
      select 1 from public.st_programs p
      where p.id = program_id
        and (
          p.owner_user_id = auth.uid()
          or public.st_user_can_edit_team(p.team_id)
        )
    )
  );


-- ===== 20250903_043_followed_program.sql =====

-- BIQ-0138 Followed program for Training
-- Additive. Does not delete programs or workout history.

alter table public.st_profiles
  add column if not exists followed_program_id uuid references public.st_programs(id) on delete set null;

comment on column public.st_profiles.followed_program_id is
  'The program this user is following in Training. Group programs are copied to a personal instance before follow.';

create index if not exists st_profiles_followed_program_idx
  on public.st_profiles (followed_program_id)
  where followed_program_id is not null;


-- ===== 20250904_044_group_member_invites.sql =====

-- BIQ-0149: Pending group member invites (email + role) for create/share flow
-- Safe additive migration. Does not drop tables or delete data.

create table if not exists public.st_group_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'member'
    check (role in ('owner', 'manager', 'member')),
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  last_sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, email)
);

create index if not exists st_group_invites_team_idx
  on public.st_group_invites (team_id);

create index if not exists st_group_invites_email_idx
  on public.st_group_invites (lower(email));

comment on table public.st_group_invites is
  'Pending/accepted invites to join a group. Recipients join with the team invite code.';

alter table public.st_group_invites enable row level security;

drop policy if exists "group_invites_select_managers" on public.st_group_invites;
create policy "group_invites_select_managers" on public.st_group_invites
  for select to authenticated
  using (public.st_user_can_edit_team(team_id));

drop policy if exists "group_invites_insert_managers" on public.st_group_invites;
create policy "group_invites_insert_managers" on public.st_group_invites
  for insert to authenticated
  with check (
    public.st_user_can_edit_team(team_id)
    and invited_by = auth.uid()
  );

drop policy if exists "group_invites_update_managers" on public.st_group_invites;
create policy "group_invites_update_managers" on public.st_group_invites
  for update to authenticated
  using (public.st_user_can_edit_team(team_id))
  with check (public.st_user_can_edit_team(team_id));

drop policy if exists "group_invites_delete_managers" on public.st_group_invites;
create policy "group_invites_delete_managers" on public.st_group_invites
  for delete to authenticated
  using (public.st_user_can_edit_team(team_id));

-- Mark matching pending invites accepted when a user joins via invite code.
-- Also applies the invited role (Member / Editor) to the new membership.
create or replace function public.st_mark_group_invite_accepted(
  p_team_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_team_id is null or coalesce(trim(p_email), '') = '' then
    return;
  end if;

  update public.st_group_invites
  set status = 'accepted',
      accepted_at = now()
  where team_id = p_team_id
    and lower(email) = lower(trim(p_email))
    and status = 'pending'
  returning role into v_role;

  if v_role in ('manager', 'member') and auth.uid() is not null then
    update public.st_team_members
    set role = v_role
    where team_id = p_team_id
      and user_id = auth.uid()
      and role is distinct from 'owner';
  end if;
end;
$$;

revoke all on function public.st_mark_group_invite_accepted(uuid, text) from public;
grant execute on function public.st_mark_group_invite_accepted(uuid, text) to authenticated;


-- ===== 20250907_044_science_engine_foundation.sql =====

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


-- ===== 20250908_045_user_calendar_activities.sql =====

-- BIQ-0155: Personal health calendar activities (independent of followed programs)

create table if not exists public.st_user_calendar_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_date date not null,
  activity_type text not null,
  title text not null default '',
  duration_minutes int,
  notes text,
  details jsonb not null default '{}'::jsonb,
  recurrence text not null default 'none',
  recurrence_until date,
  workout_id uuid references public.st_workouts (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint st_user_calendar_activities_type_check
    check (activity_type in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest')),
  constraint st_user_calendar_activities_recurrence_check
    check (recurrence in ('none', 'weekly'))
);

comment on table public.st_user_calendar_activities is
  'Personal calendar activities. These show on Training day/week/month even when no program is followed.';
comment on column public.st_user_calendar_activities.recurrence is
  'none = one date only. weekly = same weekday from activity_date through recurrence_until (open-ended if null).';

create index if not exists st_user_calendar_activities_user_date_idx
  on public.st_user_calendar_activities (user_id, activity_date);

create index if not exists st_user_calendar_activities_user_recurrence_idx
  on public.st_user_calendar_activities (user_id, recurrence, activity_date);

alter table public.st_user_calendar_activities enable row level security;

drop policy if exists "user_calendar_select" on public.st_user_calendar_activities;
create policy "user_calendar_select" on public.st_user_calendar_activities
  for select using (auth.uid() = user_id);

drop policy if exists "user_calendar_insert" on public.st_user_calendar_activities;
create policy "user_calendar_insert" on public.st_user_calendar_activities
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_calendar_update" on public.st_user_calendar_activities;
create policy "user_calendar_update" on public.st_user_calendar_activities
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_calendar_delete" on public.st_user_calendar_activities;
create policy "user_calendar_delete" on public.st_user_calendar_activities
  for delete using (auth.uid() = user_id);


-- ===== 20250909_046_training_intake_preferences.sql =====

-- BIQ-0165 Structured program intake preferences
-- Additive. Does not alter programs, workouts, or set-log history.

alter table public.st_training_profiles
  add column if not exists training_split text,
  add column if not exists preferred_training_days text[] default '{}',
  add column if not exists priority_areas text[] default '{}',
  add column if not exists superset_preference text,
  add column if not exists variety_preference text,
  add column if not exists training_feel text[] default '{}',
  add column if not exists intake_limitations text[] default '{}',
  add column if not exists intake_notes text;

comment on column public.st_training_profiles.training_split is 'User split preference: full_body, upper_lower, ppl, body_part, athletic, hybrid, ai_recommend';
comment on column public.st_training_profiles.superset_preference is 'minimal | sometimes | frequently | ai_decide';
comment on column public.st_training_profiles.variety_preference is 'consistent | balanced | high | ai_decide';
comment on column public.st_training_profiles.intake_notes is 'Optional free-text program instructions. Not medical diagnosis.';


-- ===== 20250910_046_inclusive_plan.sql =====

-- BIQ-0170: All-inclusive programs can carry lifestyle activities (cardio/mobility/sport)
-- on the same plan as training, for group push. Training-only is the default.

alter table public.st_programs
  add column if not exists inclusive_plan boolean not null default false;

comment on column public.st_programs.inclusive_plan is
  'false = training workouts only. true = also schedule cardio/mobility/sport/rest on this plan and push them with the program.';


-- ===== 20250911_047_body_measurements.sql =====

-- BIQ-0173: Body progress measurements (weight + waist circumference)
-- Safe additive migration. Does not drop tables or delete data.

-- ---------------------------------------------------------------------------
-- Body measurement check-ins (one row per user per day)
-- Canonical storage: weight_lbs, waist_inches (matches st_profiles)
-- ---------------------------------------------------------------------------

create table if not exists public.st_body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_lbs numeric,
  waist_inches numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint st_body_measurements_user_date_unique unique (user_id, measured_on),
  constraint st_body_measurements_has_value check (
    weight_lbs is not null or waist_inches is not null
  ),
  constraint st_body_measurements_weight_positive check (
    weight_lbs is null or weight_lbs > 0
  ),
  constraint st_body_measurements_waist_positive check (
    waist_inches is null or waist_inches > 0
  )
);

create index if not exists st_body_measurements_user_date_idx
  on public.st_body_measurements (user_id, measured_on desc);

comment on table public.st_body_measurements is
  'Personal body check-ins (weight, waist). One row per user per calendar day; values stored in imperial canonical units.';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.st_body_measurements_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists st_body_measurements_updated_at on public.st_body_measurements;
create trigger st_body_measurements_updated_at
  before update on public.st_body_measurements
  for each row execute function public.st_body_measurements_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security (owner-only)
-- ---------------------------------------------------------------------------

alter table public.st_body_measurements enable row level security;

drop policy if exists "body_measurements_select" on public.st_body_measurements;
drop policy if exists "body_measurements_insert" on public.st_body_measurements;
drop policy if exists "body_measurements_update" on public.st_body_measurements;
drop policy if exists "body_measurements_delete" on public.st_body_measurements;

create policy "body_measurements_select" on public.st_body_measurements
  for select using (user_id = auth.uid());

create policy "body_measurements_insert" on public.st_body_measurements
  for insert with check (user_id = auth.uid());

create policy "body_measurements_update" on public.st_body_measurements
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "body_measurements_delete" on public.st_body_measurements
  for delete using (user_id = auth.uid());


-- ===== 20250911_048_member_read_active_programs.sql =====

-- BIQ-0174: Let group members read live program templates
-- Safe additive migration. Does not drop tables or delete data.
--
-- Programs lifecycle uses draft | published | scheduled | active | completed | archived.
-- Member RLS still only allowed status = 'published', so members could not load
-- active/scheduled/completed group plans that owners edit in Programs.
-- Draft and archived stay owner/editor-only for team programs.

create or replace function public.st_user_can_read_program(p_program_id uuid)
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
        or (
          p.visibility = 'team'
          and public.st_user_is_active_team_member(p.team_id)
          and (
            coalesce(p.status, 'published') in ('published', 'scheduled', 'active', 'completed')
            or public.st_user_can_edit_team(p.team_id)
          )
        )
      )
  );
$$;

comment on function public.st_user_can_read_program(uuid) is
  'True when the caller may read the program. Personal: owner only. Team: members see published/scheduled/active/completed; owners/editors also see draft/archived.';

drop policy if exists "programs_read" on public.st_programs;

create policy "programs_read" on public.st_programs
  for select
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (
      visibility = 'team'
      and public.st_user_is_active_team_member(team_id)
      and (
        coalesce(status, 'published') in ('published', 'scheduled', 'active', 'completed')
        or public.st_user_can_edit_team(team_id)
      )
    )
  );


-- ===== 20250917_049_intake_cardio_mobility_days.sql =====

-- BIQ-0197 Dedicated cardio / mobility days on program intake
-- Additive. Does not alter programs, workouts, or set-log history.

alter table public.st_training_profiles
  add column if not exists include_cardio_day text default 'ai_decide',
  add column if not exists include_mobility_day text default 'ai_decide';

comment on column public.st_training_profiles.include_cardio_day is 'yes | no | ai_decide — dedicated cardio day in generated programs';
comment on column public.st_training_profiles.include_mobility_day is 'yes | no | ai_decide — dedicated mobility/recovery day in generated programs';


-- ===== 20250920_050_exercise_equipment.sql =====

-- BIQ-0202: Per-workout equipment on a movement card
-- Safe additive migration. Does not drop tables or rewrite history names.

alter table public.st_exercises
  add column if not exists equipment text;

alter table public.st_set_logs
  add column if not exists snapshot_equipment text;

comment on column public.st_exercises.equipment is
  'Implement chosen for this planned exercise, from the catalog compatible list.';

comment on column public.st_set_logs.snapshot_equipment is
  'Equipment in use when the set was logged. History keeps this if the plan later changes.';
