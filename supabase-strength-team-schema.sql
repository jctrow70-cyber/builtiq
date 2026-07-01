
create extension if not exists "uuid-ossp";

create table if not exists st_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

create table if not exists st_teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  invite_code text unique not null,
  owner_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists st_team_members (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid references st_teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member',
  status text default 'active',
  created_at timestamptz default now(),
  unique(team_id,user_id)
);

create table if not exists st_programs (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid references auth.users(id) on delete cascade not null,
  team_id uuid references st_teams(id) on delete cascade,
  visibility text not null default 'personal',
  name text not null,
  weeks int default 6,
  created_at timestamptz default now()
);

create table if not exists st_workouts (
  id uuid primary key default uuid_generate_v4(),
  program_id uuid references st_programs(id) on delete cascade not null,
  week int not null,
  day_order int not null default 0,
  day_label text not null,
  workout_type text not null,
  created_at timestamptz default now()
);

create table if not exists st_exercises (
  id uuid primary key default uuid_generate_v4(),
  workout_id uuid references st_workouts(id) on delete cascade not null,
  sort_order int default 0,
  name text not null,
  muscle_group text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists st_planned_sets (
  id uuid primary key default uuid_generate_v4(),
  exercise_id uuid references st_exercises(id) on delete cascade not null,
  sort_order int default 0,
  set_number int not null,
  set_type text not null default 'working',
  target_weight text,
  target_reps text,
  target_rpe text,
  is_deleted boolean default false,
  created_at timestamptz default now()
);

create table if not exists st_set_logs (
  id uuid primary key default uuid_generate_v4(),
  planned_set_id uuid references st_planned_sets(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  log_date date not null default current_date,
  actual_weight text,
  actual_reps text,
  actual_rpe text,
  completed boolean default false,
  updated_at timestamptz default now(),
  unique(planned_set_id,user_id,log_date)
);

alter table st_profiles enable row level security;
alter table st_teams enable row level security;
alter table st_team_members enable row level security;
alter table st_programs enable row level security;
alter table st_workouts enable row level security;
alter table st_exercises enable row level security;
alter table st_planned_sets enable row level security;
alter table st_set_logs enable row level security;

do $$ declare r record; begin
 for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename like 'st_%'
 loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

create policy "profiles_all" on st_profiles for all using (user_id=auth.uid()) with check (user_id=auth.uid());

create policy "teams_read" on st_teams for select using (auth.uid() is not null);
create policy "teams_insert" on st_teams for insert with check (owner_user_id=auth.uid());
create policy "teams_update_owner" on st_teams for update using (owner_user_id=auth.uid());

create policy "team_members_read" on st_team_members for select using (auth.uid() is not null);
create policy "team_members_insert_self" on st_team_members for insert with check (user_id=auth.uid());
create policy "team_members_update_owner" on st_team_members for update using (
 exists(select 1 from st_teams t where t.id=st_team_members.team_id and t.owner_user_id=auth.uid())
);

create policy "programs_read" on st_programs for select using (
 (visibility='personal' and owner_user_id=auth.uid())
 or (visibility='team' and exists(select 1 from st_team_members m where m.team_id=st_programs.team_id and m.user_id=auth.uid() and m.status='active'))
);
create policy "programs_insert" on st_programs for insert with check (
 (visibility='personal' and owner_user_id=auth.uid())
 or (visibility='team' and exists(select 1 from st_team_members m where m.team_id=st_programs.team_id and m.user_id=auth.uid() and m.role in ('owner','editor') and m.status='active'))
);
create policy "programs_update_editor" on st_programs for update using (
 owner_user_id=auth.uid()
 or exists(select 1 from st_team_members m where m.team_id=st_programs.team_id and m.user_id=auth.uid() and m.role in ('owner','editor') and m.status='active')
);

create policy "workouts_read" on st_workouts for select using (exists(select 1 from st_programs p where p.id=st_workouts.program_id));
create policy "workouts_insert" on st_workouts for insert with check (auth.uid() is not null);
create policy "workouts_update" on st_workouts for update using (auth.uid() is not null);
create policy "workouts_delete" on st_workouts for delete using (auth.uid() is not null);

create policy "exercises_all" on st_exercises for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "planned_sets_all" on st_planned_sets for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "set_logs_all" on st_set_logs for all using (user_id=auth.uid()) with check (user_id=auth.uid());
