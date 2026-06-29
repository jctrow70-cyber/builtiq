
-- BuiltIQ V2 migration: household/shared programs + personal programs + warm-up/working set logs

create extension if not exists "uuid-ossp";

create table if not exists households (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  invite_code text unique not null,
  created_at timestamptz default now()
);

create table if not exists household_members (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now(),
  unique(household_id, user_id)
);

create table if not exists programs (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  visibility text not null default 'household',
  name text not null,
  weeks int default 6,
  goal text default 'Build Muscle',
  priorities jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table programs add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table programs add column if not exists visibility text not null default 'household';

create table if not exists workouts (
  id uuid primary key default uuid_generate_v4(),
  program_id uuid references programs(id) on delete cascade,
  week int not null,
  day_label text not null,
  day_order int default 0,
  workout_type text not null,
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
  video_url text,
  created_at timestamptz default now()
);

alter table exercises add column if not exists target_sets int default 3;
alter table exercises add column if not exists target_rep_min int default 8;
alter table exercises add column if not exists target_rep_max int default 12;
alter table exercises add column if not exists target_rpe_min numeric default 7;
alter table exercises add column if not exists target_rpe_max numeric default 8;
alter table exercises add column if not exists video_url text;

create table if not exists exercise_set_logs (
  id uuid primary key default uuid_generate_v4(),
  exercise_id uuid references exercises(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  set_number int not null,
  set_type text not null default 'working',
  target_weight text,
  target_reps text,
  weight text,
  reps text,
  rpe text,
  completed boolean default false,
  updated_at timestamptz default now(),
  unique(exercise_id, user_id, set_number, set_type)
);

create table if not exists nutrition_logs (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
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
  household_id uuid references households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  body_weight numeric,
  waist numeric,
  notes text,
  created_at timestamptz default now()
);

create or replace view latest_exercise_performance as
select distinct on (esl.user_id, e.name)
  esl.user_id,
  e.name as exercise_name,
  esl.exercise_id,
  esl.weight,
  esl.reps,
  esl.rpe,
  esl.updated_at
from exercise_set_logs esl
join exercises e on e.id = esl.exercise_id
where esl.set_type = 'working' and esl.completed = true
order by esl.user_id, e.name, esl.updated_at desc;

alter table households enable row level security;
alter table household_members enable row level security;
alter table programs enable row level security;
alter table workouts enable row level security;
alter table exercises enable row level security;
alter table exercise_set_logs enable row level security;
alter table nutrition_logs enable row level security;
alter table body_metrics enable row level security;

drop policy if exists "households_insert" on households;
drop policy if exists "households_select" on households;
drop policy if exists "household_members_select_own" on household_members;
drop policy if exists "household_members_insert_own" on household_members;
drop policy if exists "programs_select" on programs;
drop policy if exists "programs_insert" on programs;
drop policy if exists "workouts_select" on workouts;
drop policy if exists "workouts_insert" on workouts;
drop policy if exists "exercises_select" on exercises;
drop policy if exists "exercises_insert" on exercises;
drop policy if exists "exercise_set_logs_own_select" on exercise_set_logs;
drop policy if exists "exercise_set_logs_own_insert" on exercise_set_logs;
drop policy if exists "exercise_set_logs_own_update" on exercise_set_logs;

create policy "households_insert" on households for insert with check (auth.uid() is not null);
create policy "households_select" on households for select using (auth.uid() is not null);

create policy "household_members_select_own" on household_members for select using (user_id = auth.uid());
create policy "household_members_insert_own" on household_members for insert with check (user_id = auth.uid());

create policy "programs_select" on programs for select using (
  (visibility = 'personal' and owner_user_id = auth.uid())
  or
  (visibility = 'household' and exists (
    select 1 from household_members hm
    where hm.household_id = programs.household_id and hm.user_id = auth.uid()
  ))
);

create policy "programs_insert" on programs for insert with check (
  (visibility = 'personal' and owner_user_id = auth.uid())
  or
  (visibility = 'household' and exists (
    select 1 from household_members hm
    where hm.household_id = programs.household_id and hm.user_id = auth.uid()
  ))
);

create policy "workouts_select" on workouts for select using (
  exists (select 1 from programs p where p.id = workouts.program_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (
      select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()
    ))
  ))
);

create policy "workouts_insert" on workouts for insert with check (
  exists (select 1 from programs p where p.id = workouts.program_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (
      select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()
    ))
  ))
);

create policy "exercises_select" on exercises for select using (
  exists (select 1 from workouts w join programs p on p.id = w.program_id where w.id = exercises.workout_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (
      select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()
    ))
  ))
);

create policy "exercises_insert" on exercises for insert with check (
  exists (select 1 from workouts w join programs p on p.id = w.program_id where w.id = exercises.workout_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (
      select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()
    ))
  ))
);

create policy "exercise_set_logs_own_select" on exercise_set_logs for select using (user_id = auth.uid());
create policy "exercise_set_logs_own_insert" on exercise_set_logs for insert with check (user_id = auth.uid());
create policy "exercise_set_logs_own_update" on exercise_set_logs for update using (user_id = auth.uid());
