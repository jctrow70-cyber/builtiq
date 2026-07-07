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

-- BuiltIQ system exercise library (available to all users)
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
