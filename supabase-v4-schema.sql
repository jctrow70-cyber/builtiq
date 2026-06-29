
-- BuiltIQ V4 schema
-- Run the whole script in Supabase SQL Editor.

create extension if not exists "uuid-ossp";

create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  onboarding_complete boolean default false,
  height_in numeric,
  birth_year int,
  sex text,
  units text default 'imperial',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists exercise_teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  invite_code text unique not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists exercise_team_members (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid references exercise_teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text,
  role text default 'member',
  status text default 'active',
  created_at timestamptz default now(),
  unique(team_id,user_id)
);

create table if not exists programs (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  team_id uuid references exercise_teams(id) on delete cascade,
  visibility text not null default 'personal',
  name text not null,
  weeks int default 6,
  goal text default 'Build Muscle',
  priorities jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists workouts (
  id uuid primary key default uuid_generate_v4(),
  program_id uuid references programs(id) on delete cascade,
  week int not null,
  day_label text not null,
  day_order int default 0,
  workout_type text not null,
  readiness jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists workout_blocks (
  id uuid primary key default uuid_generate_v4(),
  workout_id uuid references workouts(id) on delete cascade,
  block_type text not null default 'strength',
  sort_order int default 0,
  name text not null,
  focus_area text,
  target_sets int default 1,
  target_reps text,
  target_duration text,
  notes text,
  video_url text,
  created_at timestamptz default now()
);

create table if not exists exercises (
  id uuid primary key default uuid_generate_v4(),
  workout_id uuid references workouts(id) on delete cascade,
  sort_order int default 0,
  name text not null,
  primary_muscle text,
  secondary_muscles text[] default '{}',
  target_sets int default 3,
  target_rep_min int default 8,
  target_rep_max int default 12,
  target_rpe_min numeric default 7,
  target_rpe_max numeric default 8,
  group_type text default 'single',
  group_id uuid,
  group_label text,
  group_order int default 0,
  video_url text,
  instructions text[] default '{}',
  tips text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists exercise_set_logs (
  id uuid primary key default uuid_generate_v4(),
  exercise_id uuid references exercises(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  set_number int not null,
  set_type text not null default 'working',
  target_weight text,
  target_reps text,
  target_rpe text,
  weight text,
  reps text,
  rpe text,
  completed boolean default false,
  is_removed boolean default false,
  updated_at timestamptz default now(),
  unique(exercise_id,user_id,set_number,set_type)
);

create table if not exists nutrition_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  log_date date not null default current_date,
  food_name text not null,
  calories numeric default 0,
  protein numeric default 0,
  carbs numeric default 0,
  fat numeric default 0,
  source text default 'manual',
  created_at timestamptz default now()
);

create table if not exists body_metrics (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  metric_date date not null default current_date,
  body_weight numeric,
  waist numeric,
  body_fat numeric,
  chest numeric,
  hips numeric,
  arm numeric,
  thigh numeric,
  steps int,
  notes text,
  created_at timestamptz default now()
);

create or replace view team_member_progress_summary as
select
  etm.team_id,
  etm.user_id,
  etm.display_name,
  count(distinct esl.exercise_id) filter (where esl.completed = true and coalesce(esl.is_removed,false)=false) as completed_exercises,
  count(esl.id) filter (where esl.completed = true and coalesce(esl.is_removed,false)=false) as completed_sets,
  max(esl.updated_at) as last_training_update
from exercise_team_members etm
left join exercise_set_logs esl on esl.user_id = etm.user_id
where etm.status = 'active'
group by etm.team_id, etm.user_id, etm.display_name;

alter table user_profiles enable row level security;
alter table exercise_teams enable row level security;
alter table exercise_team_members enable row level security;
alter table programs enable row level security;
alter table workouts enable row level security;
alter table workout_blocks enable row level security;
alter table exercises enable row level security;
alter table exercise_set_logs enable row level security;
alter table nutrition_logs enable row level security;
alter table body_metrics enable row level security;

do $$
declare r record;
begin
  for r in (
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
    and tablename in ('user_profiles','exercise_teams','exercise_team_members','programs','workouts','workout_blocks','exercises','exercise_set_logs','nutrition_logs','body_metrics')
  ) loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy "profiles_own_select" on user_profiles for select using (user_id = auth.uid());
create policy "profiles_own_insert" on user_profiles for insert with check (user_id = auth.uid());
create policy "profiles_own_update" on user_profiles for update using (user_id = auth.uid());

create policy "teams_select_authenticated" on exercise_teams for select using (auth.uid() is not null);
create policy "teams_insert_owner" on exercise_teams for insert with check (owner_user_id = auth.uid());
create policy "teams_update_owner" on exercise_teams for update using (owner_user_id = auth.uid());

create policy "team_members_select_team" on exercise_team_members for select using (
  user_id = auth.uid()
  or exists (select 1 from exercise_team_members etm where etm.team_id = exercise_team_members.team_id and etm.user_id = auth.uid())
);
create policy "team_members_insert_self" on exercise_team_members for insert with check (user_id = auth.uid());
create policy "team_members_update_self_or_owner" on exercise_team_members for update using (
  user_id = auth.uid()
  or exists (select 1 from exercise_teams t where t.id = exercise_team_members.team_id and t.owner_user_id = auth.uid())
);

create policy "programs_select" on programs for select using (
  (visibility='personal' and owner_user_id=auth.uid())
  or
  (visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=programs.team_id and etm.user_id=auth.uid() and etm.status='active'))
);
create policy "programs_insert" on programs for insert with check (
  (visibility='personal' and owner_user_id=auth.uid())
  or
  (visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=programs.team_id and etm.user_id=auth.uid() and etm.status='active'))
);
create policy "programs_update" on programs for update using (
  (visibility='personal' and owner_user_id=auth.uid())
  or
  (visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=programs.team_id and etm.user_id=auth.uid() and etm.status in ('active')))
);
create policy "programs_delete" on programs for delete using (
  owner_user_id=auth.uid()
);

create policy "workouts_select" on workouts for select using (
  exists (select 1 from programs p where p.id=workouts.program_id and (
    (p.visibility='personal' and p.owner_user_id=auth.uid())
    or (p.visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=p.team_id and etm.user_id=auth.uid() and etm.status='active'))
  ))
);
create policy "workouts_insert" on workouts for insert with check (
  exists (select 1 from programs p where p.id=workouts.program_id and (
    (p.visibility='personal' and p.owner_user_id=auth.uid())
    or (p.visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=p.team_id and etm.user_id=auth.uid() and etm.status='active'))
  ))
);
create policy "workouts_update" on workouts for update using (
  exists (select 1 from programs p where p.id=workouts.program_id and (
    (p.visibility='personal' and p.owner_user_id=auth.uid())
    or (p.visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=p.team_id and etm.user_id=auth.uid() and etm.status='active'))
  ))
);

create policy "blocks_select" on workout_blocks for select using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=workout_blocks.workout_id and (
    (p.visibility='personal' and p.owner_user_id=auth.uid())
    or (p.visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=p.team_id and etm.user_id=auth.uid() and etm.status='active'))
  ))
);
create policy "blocks_insert" on workout_blocks for insert with check (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=workout_blocks.workout_id and (
    (p.visibility='personal' and p.owner_user_id=auth.uid())
    or (p.visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=p.team_id and etm.user_id=auth.uid() and etm.status='active'))
  ))
);
create policy "blocks_update" on workout_blocks for update using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=workout_blocks.workout_id and (
    (p.visibility='personal' and p.owner_user_id=auth.uid())
    or (p.visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=p.team_id and etm.user_id=auth.uid() and etm.status='active'))
  ))
);
create policy "blocks_delete" on workout_blocks for delete using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=workout_blocks.workout_id and (
    (p.visibility='personal' and p.owner_user_id=auth.uid())
    or (p.visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=p.team_id and etm.user_id=auth.uid() and etm.status='active'))
  ))
);

create policy "exercises_select" on exercises for select using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=exercises.workout_id and (
    (p.visibility='personal' and p.owner_user_id=auth.uid())
    or (p.visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=p.team_id and etm.user_id=auth.uid() and etm.status='active'))
  ))
);
create policy "exercises_insert" on exercises for insert with check (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=exercises.workout_id and (
    (p.visibility='personal' and p.owner_user_id=auth.uid())
    or (p.visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=p.team_id and etm.user_id=auth.uid() and etm.status='active'))
  ))
);
create policy "exercises_update" on exercises for update using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=exercises.workout_id and (
    (p.visibility='personal' and p.owner_user_id=auth.uid())
    or (p.visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=p.team_id and etm.user_id=auth.uid() and etm.status='active'))
  ))
);
create policy "exercises_delete" on exercises for delete using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=exercises.workout_id and (
    (p.visibility='personal' and p.owner_user_id=auth.uid())
    or (p.visibility='team' and exists (select 1 from exercise_team_members etm where etm.team_id=p.team_id and etm.user_id=auth.uid() and etm.status='active'))
  ))
);

create policy "set_logs_own_select" on exercise_set_logs for select using (user_id=auth.uid());
create policy "set_logs_own_insert" on exercise_set_logs for insert with check (user_id=auth.uid());
create policy "set_logs_own_update" on exercise_set_logs for update using (user_id=auth.uid());
create policy "set_logs_own_delete" on exercise_set_logs for delete using (user_id=auth.uid());

create policy "nutrition_own_select" on nutrition_logs for select using (user_id=auth.uid());
create policy "nutrition_own_insert" on nutrition_logs for insert with check (user_id=auth.uid());
create policy "nutrition_own_update" on nutrition_logs for update using (user_id=auth.uid());

create policy "metrics_own_select" on body_metrics for select using (user_id=auth.uid());
create policy "metrics_own_insert" on body_metrics for insert with check (user_id=auth.uid());
create policy "metrics_own_update" on body_metrics for update using (user_id=auth.uid());
