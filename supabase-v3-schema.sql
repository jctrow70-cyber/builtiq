
-- BuiltIQ V3 schema/migration
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

create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  height_in numeric,
  birth_year int,
  sex text,
  units text default 'imperial',
  updated_at timestamptz default now()
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
alter table programs add column if not exists priorities jsonb default '{}'::jsonb;

create table if not exists workouts (
  id uuid primary key default uuid_generate_v4(),
  program_id uuid references programs(id) on delete cascade,
  week int not null,
  day_label text not null,
  day_order int default 0,
  workout_type text not null,
  readiness jsonb default '{}'::jsonb,
  cardio jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table workouts add column if not exists readiness jsonb default '{}'::jsonb;
alter table workouts add column if not exists cardio jsonb default '{}'::jsonb;

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

alter table workout_blocks enable row level security;


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
  instructions text[] default '{}',
  tips text[] default '{}',
  created_at timestamptz default now()
);

alter table exercises add column if not exists target_sets int default 3;
alter table exercises add column if not exists target_rep_min int default 8;
alter table exercises add column if not exists target_rep_max int default 12;
alter table exercises add column if not exists target_rpe_min numeric default 7;
alter table exercises add column if not exists target_rpe_max numeric default 8;
alter table exercises add column if not exists video_url text;
alter table exercises add column if not exists instructions text[] default '{}';
alter table exercises add column if not exists tips text[] default '{}';

create table if not exists mobility_exercises (
  id uuid primary key default uuid_generate_v4(),
  workout_id uuid references workouts(id) on delete cascade,
  sort_order int default 0,
  name text not null,
  focus_area text,
  duration text,
  video_url text,
  notes text,
  created_at timestamptz default now()
);

alter table mobility_exercises add column if not exists video_url text;

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

create table if not exists exercise_logs (
  id uuid primary key default uuid_generate_v4(),
  exercise_id uuid references exercises(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  notes text,
  completed boolean default false,
  updated_at timestamptz default now(),
  unique(exercise_id, user_id)
);

create table if not exists mobility_logs (
  id uuid primary key default uuid_generate_v4(),
  mobility_exercise_id uuid references mobility_exercises(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  completed boolean default false,
  notes text,
  updated_at timestamptz default now(),
  unique(mobility_exercise_id, user_id)
);

create table if not exists nutrition_logs (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
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
  household_id uuid references households(id) on delete cascade,
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

alter table body_metrics add column if not exists body_fat numeric;
alter table body_metrics add column if not exists chest numeric;
alter table body_metrics add column if not exists hips numeric;
alter table body_metrics add column if not exists arm numeric;
alter table body_metrics add column if not exists thigh numeric;
alter table body_metrics add column if not exists steps int;

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
where esl.set_type = 'working'
  and esl.completed = true
order by esl.user_id, e.name, esl.updated_at desc;

alter table households enable row level security;
alter table household_members enable row level security;
alter table user_profiles enable row level security;
alter table programs enable row level security;
alter table workouts enable row level security;
alter table exercises enable row level security;
alter table mobility_exercises enable row level security;
alter table exercise_set_logs enable row level security;
alter table exercise_logs enable row level security;
alter table mobility_logs enable row level security;
alter table nutrition_logs enable row level security;
alter table body_metrics enable row level security;

-- Drop old policies
do $$
declare r record;
begin
  for r in (
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
    and tablename in ('households','household_members','user_profiles','programs','workouts','exercises','mobility_exercises','workout_blocks','exercise_set_logs','exercise_logs','mobility_logs','nutrition_logs','body_metrics')
  ) loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy "households_insert" on households for insert with check (auth.uid() is not null);
create policy "households_select" on households for select using (auth.uid() is not null);

create policy "household_members_select_own" on household_members for select using (user_id = auth.uid());
create policy "household_members_insert_own" on household_members for insert with check (user_id = auth.uid());

create policy "profiles_own_select" on user_profiles for select using (user_id = auth.uid());
create policy "profiles_own_insert" on user_profiles for insert with check (user_id = auth.uid());
create policy "profiles_own_update" on user_profiles for update using (user_id = auth.uid());

create policy "programs_select" on programs for select using (
  (visibility = 'personal' and owner_user_id = auth.uid())
  or
  (visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = programs.household_id and hm.user_id = auth.uid()))
);

create policy "programs_insert" on programs for insert with check (
  (visibility = 'personal' and owner_user_id = auth.uid())
  or
  (visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = programs.household_id and hm.user_id = auth.uid()))
);

create policy "programs_update" on programs for update using (
  (visibility = 'personal' and owner_user_id = auth.uid())
  or
  (visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = programs.household_id and hm.user_id = auth.uid()))
);

create policy "workouts_select" on workouts for select using (
  exists (select 1 from programs p where p.id = workouts.program_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);
create policy "workouts_insert" on workouts for insert with check (
  exists (select 1 from programs p where p.id = workouts.program_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);
create policy "workouts_update" on workouts for update using (
  exists (select 1 from programs p where p.id = workouts.program_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);

create policy "exercises_select" on exercises for select using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=exercises.workout_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);
create policy "exercises_insert" on exercises for insert with check (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=exercises.workout_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);
create policy "exercises_update" on exercises for update using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=exercises.workout_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);
create policy "exercises_delete" on exercises for delete using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=exercises.workout_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);

create policy "mobility_exercises_select" on mobility_exercises for select using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=mobility_exercises.workout_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);
create policy "mobility_exercises_insert" on mobility_exercises for insert with check (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=mobility_exercises.workout_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);



create policy "workout_blocks_select" on workout_blocks for select using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=workout_blocks.workout_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);
create policy "workout_blocks_insert" on workout_blocks for insert with check (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=workout_blocks.workout_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);
create policy "workout_blocks_update" on workout_blocks for update using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=workout_blocks.workout_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);
create policy "workout_blocks_delete" on workout_blocks for delete using (
  exists (select 1 from workouts w join programs p on p.id=w.program_id where w.id=workout_blocks.workout_id and (
    (p.visibility = 'personal' and p.owner_user_id = auth.uid())
    or (p.visibility = 'household' and exists (select 1 from household_members hm where hm.household_id = p.household_id and hm.user_id = auth.uid()))
  ))
);

create policy "set_logs_own_select" on exercise_set_logs for select using (user_id = auth.uid());
create policy "set_logs_own_insert" on exercise_set_logs for insert with check (user_id = auth.uid());
create policy "set_logs_own_update" on exercise_set_logs for update using (user_id = auth.uid());

create policy "exercise_logs_own_select" on exercise_logs for select using (user_id = auth.uid());
create policy "exercise_logs_own_insert" on exercise_logs for insert with check (user_id = auth.uid());
create policy "exercise_logs_own_update" on exercise_logs for update using (user_id = auth.uid());

create policy "mobility_logs_own_select" on mobility_logs for select using (user_id = auth.uid());
create policy "mobility_logs_own_insert" on mobility_logs for insert with check (user_id = auth.uid());
create policy "mobility_logs_own_update" on mobility_logs for update using (user_id = auth.uid());

create policy "nutrition_own_select" on nutrition_logs for select using (user_id = auth.uid());
create policy "nutrition_own_insert" on nutrition_logs for insert with check (user_id = auth.uid());
create policy "nutrition_own_update" on nutrition_logs for update using (user_id = auth.uid());

create policy "body_metrics_own_select" on body_metrics for select using (user_id = auth.uid());
create policy "body_metrics_own_insert" on body_metrics for insert with check (user_id = auth.uid());
create policy "body_metrics_own_update" on body_metrics for update using (user_id = auth.uid());
