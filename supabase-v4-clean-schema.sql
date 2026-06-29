
create extension if not exists "uuid-ossp";

create table if not exists biq_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  onboarding_complete boolean default false,
  height_in numeric,
  birth_year int,
  sex text,
  units text default 'imperial',
  created_at timestamptz default now()
);

create table if not exists biq_teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  invite_code text unique not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists biq_team_members (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid references biq_teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text,
  role text default 'member',
  status text default 'active',
  created_at timestamptz default now(),
  unique(team_id,user_id)
);

create table if not exists biq_programs (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  team_id uuid references biq_teams(id) on delete cascade,
  visibility text not null default 'personal',
  name text not null,
  weeks int default 6,
  goal text default 'Build Muscle',
  priorities jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists biq_workouts (
  id uuid primary key default uuid_generate_v4(),
  program_id uuid references biq_programs(id) on delete cascade,
  week int not null,
  day_label text not null,
  day_order int default 0,
  workout_type text not null,
  created_at timestamptz default now()
);

create table if not exists biq_workout_blocks (
  id uuid primary key default uuid_generate_v4(),
  workout_id uuid references biq_workouts(id) on delete cascade,
  block_type text not null,
  sort_order int default 0,
  name text not null,
  target_sets int default 1,
  target_reps text,
  target_duration text,
  notes text,
  video_url text
);

create table if not exists biq_exercises (
  id uuid primary key default uuid_generate_v4(),
  workout_id uuid references biq_workouts(id) on delete cascade,
  sort_order int default 0,
  name text not null,
  primary_muscle text,
  target_sets int default 3,
  target_rep_min int default 8,
  target_rep_max int default 12,
  target_rpe_min numeric default 7,
  target_rpe_max numeric default 8,
  group_type text default 'single',
  group_label text,
  video_url text
);

create table if not exists biq_set_logs (
  id uuid primary key default uuid_generate_v4(),
  exercise_id uuid references biq_exercises(id) on delete cascade,
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

create table if not exists biq_nutrition_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  log_date date default current_date,
  food_name text not null,
  calories numeric default 0,
  protein numeric default 0,
  carbs numeric default 0,
  fat numeric default 0,
  created_at timestamptz default now()
);

create table if not exists biq_body_metrics (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  metric_date date default current_date,
  body_weight numeric,
  waist numeric,
  body_fat numeric,
  steps int,
  notes text,
  created_at timestamptz default now()
);

alter table biq_profiles enable row level security;
alter table biq_teams enable row level security;
alter table biq_team_members enable row level security;
alter table biq_programs enable row level security;
alter table biq_workouts enable row level security;
alter table biq_workout_blocks enable row level security;
alter table biq_exercises enable row level security;
alter table biq_set_logs enable row level security;
alter table biq_nutrition_logs enable row level security;
alter table biq_body_metrics enable row level security;

do $$ declare r record; begin
  for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename like 'biq_%'
  loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

create policy "p_self_select" on biq_profiles for select using (user_id=auth.uid());
create policy "p_self_insert" on biq_profiles for insert with check (user_id=auth.uid());
create policy "p_self_update" on biq_profiles for update using (user_id=auth.uid());

create policy "teams_read" on biq_teams for select using (auth.uid() is not null);
create policy "teams_insert" on biq_teams for insert with check (owner_user_id=auth.uid());

create policy "tm_read" on biq_team_members for select using (auth.uid() is not null);
create policy "tm_insert" on biq_team_members for insert with check (user_id=auth.uid());

create policy "program_read" on biq_programs for select using (
  (visibility='personal' and owner_user_id=auth.uid())
  or (visibility='team' and exists (select 1 from biq_team_members m where m.team_id=biq_programs.team_id and m.user_id=auth.uid()))
);
create policy "program_insert" on biq_programs for insert with check (
  (visibility='personal' and owner_user_id=auth.uid())
  or (visibility='team' and exists (select 1 from biq_team_members m where m.team_id=biq_programs.team_id and m.user_id=auth.uid()))
);

create policy "workouts_read" on biq_workouts for select using (exists (select 1 from biq_programs p where p.id=biq_workouts.program_id));
create policy "workouts_insert" on biq_workouts for insert with check (auth.uid() is not null);

create policy "blocks_all" on biq_workout_blocks for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "ex_all" on biq_exercises for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "sets_self" on biq_set_logs for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "nut_self" on biq_nutrition_logs for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "body_self" on biq_body_metrics for all using (user_id=auth.uid()) with check (user_id=auth.uid());
