-- BuildIQ Staging schema replay part 3

-- ===== 20250713_016_program_start_date.sql =====

-- BIQ-0022: Align program week numbers with calendar dates
alter table public.st_programs
  add column if not exists start_date date;

comment on column public.st_programs.start_date is
  'Calendar date when Week 1 begins. Used to map log dates to program weeks.';

-- Backfill existing programs from created_at (UTC date)
update public.st_programs
set start_date = (created_at at time zone 'utc')::date
where start_date is null;


-- ===== 20250713_017_exercise_alternatives_seed.sql =====

-- BIQ-0013: Curated system exercise alternatives (name-based; safe to re-run)

insert into public.st_exercise_alternatives (exercise_id, alternative_id, reason, priority, notes, is_system)
select e.id, a.id, v.reason, v.priority, v.notes, true
from (
  values
    ('Bench Press', 'Dumbbell Bench Press', 'equipment_unavailable', 1, 'No barbell or rack'),
    ('Back Squat', 'Goblet Squat', 'equipment_unavailable', 1, 'No rack or barbell'),
    ('Back Squat', 'Bulgarian Split Squat', 'equipment_unavailable', 2, 'Dumbbell alternative'),
    ('Romanian Deadlift', 'Trap Bar Deadlift', 'preference', 1, 'Trap bar hinge option'),
    ('Overhead Press', 'Dumbbell Shoulder Press', 'equipment_unavailable', 1, 'No barbell'),
    ('Barbell Row', 'Dumbbell Row', 'equipment_unavailable', 1, 'No barbell'),
    ('Lat Pulldown', 'Pull-Up', 'equipment_unavailable', 1, 'No cable machine'),
    ('Lat Pulldown', 'Chin-Up', 'equipment_unavailable', 2, 'Bodyweight pull option'),
    ('Deadlift', 'Trap Bar Deadlift', 'preference', 1, 'Trap bar preference'),
    ('Cable Row', 'Dumbbell Row', 'equipment_unavailable', 1, 'No cable machine'),
    ('Hip Thrust', 'Glute Bridge', 'equipment_unavailable', 1, 'No barbell setup')
) as v(exercise_name, alt_name, reason, priority, notes)
join public.st_exercise_catalog e on lower(e.name) = lower(v.exercise_name) and e.is_system = true
join public.st_exercise_catalog a on lower(a.name) = lower(v.alt_name) and a.is_system = true
where e.id <> a.id
  and not exists (
    select 1 from public.st_exercise_alternatives x
    where x.exercise_id = e.id and x.alternative_id = a.id and x.reason = v.reason
  );


-- ===== 20250715_018_basic_catalog_and_sources.sql =====

-- BIQ-0027: Basic exercise catalog pack + user source preferences
-- Tags existing system seed as builtiq_essentials; adds builtiq_basic library; profile source filter.

-- Tag legacy BuildIQ system seed rows
update public.st_exercise_catalog
set external_source = 'builtiq_essentials',
    external_id = coalesce(external_id, 'essentials_' || lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g')))
where is_system = true
  and user_id is null
  and (external_source is null or external_source = '');

-- User preference: which catalog packs appear in exercise search
alter table public.st_profiles
  add column if not exists catalog_sources text[] default array['builtiq_essentials', 'builtiq_basic']::text[];

comment on column public.st_profiles.catalog_sources is
  'Enabled exercise libraries for search: builtiq_essentials, builtiq_basic, free_exercise_db';

-- Basic gym library — common exercises with clear names (keeps essentials separate)
insert into public.st_exercise_catalog (
  name, category, muscle_group, equipment, movement_pattern,
  is_system, user_id, external_source, external_id, exercise_type
)
select v.name, v.category, v.muscle_group, v.equipment, v.movement_pattern,
       true, null, 'builtiq_basic', v.external_id, v.exercise_type
from (
  values
    ('Push-Up', 'strength', 'Chest', 'bodyweight', 'push_horizontal', 'basic_push_up', 'strength'),
    ('Dip', 'strength', 'Chest', 'bodyweight', 'push_vertical', 'basic_dip', 'strength'),
    ('Sit-Up', 'strength', 'Core', 'bodyweight', 'isolation', 'basic_sit_up', 'strength'),
    ('Crunch', 'strength', 'Core', 'bodyweight', 'isolation', 'basic_crunch', 'strength'),
    ('Russian Twist', 'strength', 'Core', 'bodyweight', 'rotation', 'basic_russian_twist', 'strength'),
    ('Leg Press', 'strength', 'Quads', 'machine', 'squat', 'basic_leg_press', 'strength'),
    ('Hack Squat', 'strength', 'Quads', 'machine', 'squat', 'basic_hack_squat', 'strength'),
    ('Smith Machine Squat', 'strength', 'Quads', 'machine', 'squat', 'basic_smith_squat', 'strength'),
    ('Calf Raise', 'strength', 'Calves', 'machine', 'isolation', 'basic_calf_raise', 'strength'),
    ('Standing Calf Raise', 'strength', 'Calves', 'dumbbell', 'isolation', 'basic_standing_calf_raise', 'strength'),
    ('Leg Press Calf Raise', 'strength', 'Calves', 'machine', 'isolation', 'basic_leg_press_calf', 'strength'),
    ('Pec Deck', 'strength', 'Chest', 'machine', 'isolation', 'basic_pec_deck', 'strength'),
    ('Cable Fly', 'strength', 'Chest', 'cable', 'isolation', 'basic_cable_fly', 'strength'),
    ('Dumbbell Fly', 'strength', 'Chest', 'dumbbell', 'isolation', 'basic_db_fly', 'strength'),
    ('Hammer Curl', 'strength', 'Biceps', 'dumbbell', 'isolation', 'basic_hammer_curl', 'strength'),
    ('Preacher Curl', 'strength', 'Biceps', 'barbell', 'isolation', 'basic_preacher_curl', 'strength'),
    ('Concentration Curl', 'strength', 'Biceps', 'dumbbell', 'isolation', 'basic_concentration_curl', 'strength'),
    ('Overhead Tricep Extension', 'strength', 'Triceps', 'dumbbell', 'isolation', 'basic_oh_tricep_ext', 'strength'),
    ('Tricep Kickback', 'strength', 'Triceps', 'dumbbell', 'isolation', 'basic_tricep_kickback', 'strength'),
    ('Shrugs', 'strength', 'Traps', 'dumbbell', 'isolation', 'basic_shrugs', 'strength'),
    ('Upright Row', 'strength', 'Shoulders', 'barbell', 'pull_vertical', 'basic_upright_row', 'strength'),
    ('Rear Delt Fly', 'strength', 'Rear Delts', 'dumbbell', 'isolation', 'basic_rear_delt_fly', 'strength'),
    ('Front Raise', 'strength', 'Front Delts', 'dumbbell', 'isolation', 'basic_front_raise', 'strength'),
    ('Arnold Press', 'strength', 'Shoulders', 'dumbbell', 'push_vertical', 'basic_arnold_press', 'strength'),
    ('T-Bar Row', 'strength', 'Mid Back', 'barbell', 'pull_horizontal', 'basic_tbar_row', 'strength'),
    ('Chest Supported Row', 'strength', 'Mid Back', 'machine', 'pull_horizontal', 'basic_chest_supported_row', 'strength'),
    ('Straight Arm Pulldown', 'strength', 'Lats', 'cable', 'isolation', 'basic_straight_arm_pulldown', 'strength'),
    ('Single Arm Row', 'strength', 'Mid Back', 'dumbbell', 'pull_horizontal', 'basic_single_arm_row', 'strength'),
    ('Step-Up', 'strength', 'Quads', 'dumbbell', 'squat', 'basic_step_up', 'strength'),
    ('Reverse Lunge', 'strength', 'Quads', 'dumbbell', 'squat', 'basic_reverse_lunge', 'strength'),
    ('Sumo Deadlift', 'strength', 'Glutes', 'barbell', 'hinge', 'basic_sumo_deadlift', 'strength'),
    ('Good Morning', 'strength', 'Hamstrings', 'barbell', 'hinge', 'basic_good_morning', 'strength'),
    ('Glute Ham Raise', 'strength', 'Hamstrings', 'machine', 'hinge', 'basic_ghr', 'strength'),
    ('Cable Pull-Through', 'strength', 'Glutes', 'cable', 'hinge', 'basic_cable_pullthrough', 'strength'),
    ('Ab Wheel Rollout', 'strength', 'Core', 'bodyweight', 'isolation', 'basic_ab_wheel', 'strength'),
    ('Hanging Leg Raise', 'strength', 'Core', 'bodyweight', 'isolation', 'basic_hanging_leg_raise', 'strength'),
    ('Mountain Climber', 'warmup', 'Full Body', 'bodyweight', 'cardio', 'basic_mountain_climber', 'cardio'),
    ('Jump Rope', 'warmup', 'Cardio', 'bodyweight', 'cardio', 'basic_jump_rope', 'cardio'),
    ('Treadmill Walk', 'warmup', 'Cardio', 'machine', 'cardio', 'basic_treadmill_walk', 'cardio'),
    ('Elliptical', 'warmup', 'Cardio', 'machine', 'cardio', 'basic_elliptical', 'cardio'),
    ('Stair Climber', 'warmup', 'Cardio', 'machine', 'cardio', 'basic_stair_climber', 'cardio'),
    ('Cat Cow', 'warmup', 'Full Body', 'bodyweight', 'rotation', 'basic_cat_cow', 'mobility'),
    ('Hip Flexor Stretch', 'cooldown', 'Hip Flexors', 'bodyweight', 'rotation', 'basic_hip_flexor_stretch', 'mobility'),
    ('Figure Four Stretch', 'cooldown', 'Glutes', 'bodyweight', 'rotation', 'basic_figure_four', 'mobility'),
    ('Doorway Stretch', 'cooldown', 'Chest', 'bodyweight', 'rotation', 'basic_doorway_stretch', 'mobility'),
    ('Cross-Body Shoulder Stretch', 'cooldown', 'Shoulders', 'bodyweight', 'rotation', 'basic_cross_body_shoulder', 'mobility')
) as v(name, category, muscle_group, equipment, movement_pattern, external_id, exercise_type)
where not exists (
  select 1 from public.st_exercise_catalog c
  where c.external_source = 'builtiq_basic' and c.external_id = v.external_id
);


-- ===== 20250715_019_exercisedb_catalog_defaults.sql =====

-- BIQ-0028: ExerciseDB guided library defaults
-- Updates profile catalog_sources default to include exercisedb guided library.

alter table public.st_profiles
  alter column catalog_sources set default array['exercisedb', 'builtiq_essentials']::text[];

comment on column public.st_profiles.catalog_sources is
  'Enabled exercise libraries: exercisedb (GIF guides), builtiq_essentials, builtiq_basic, free_exercise_db';

-- Existing users without exercisedb enabled get it added (keeps their other choices)
update public.st_profiles
set catalog_sources = array(
  select distinct unnest(
    coalesce(catalog_sources, array[]::text[]) || array['exercisedb', 'builtiq_essentials']::text[]
  )
)
where not ('exercisedb' = any(coalesce(catalog_sources, array[]::text[])));


-- ===== 20250716_020_nutrition_tracker_foundation.sql =====

-- BIQ-0034: Nutrition tracker foundation
-- Safe additive migration. Does not drop tables or delete data.

-- ---------------------------------------------------------------------------
-- Daily macro targets (one row per user)
-- ---------------------------------------------------------------------------

create table if not exists public.st_nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  calories_target numeric not null default 2000,
  protein_g_target numeric not null default 150,
  carbs_g_target numeric not null default 200,
  fat_g_target numeric not null default 65,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint st_nutrition_goals_user_unique unique (user_id)
);

create index if not exists st_nutrition_goals_user_idx
  on public.st_nutrition_goals (user_id);

-- ---------------------------------------------------------------------------
-- Saved foods library (user-owned templates)
-- ---------------------------------------------------------------------------

create table if not exists public.st_food_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  serving_label text not null default '1 serving',
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists st_food_library_user_idx
  on public.st_food_library (user_id);

create index if not exists st_food_library_user_name_idx
  on public.st_food_library (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- Daily meal entries (macros snapshotted at log time)
-- ---------------------------------------------------------------------------

create table if not exists public.st_meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  meal_type text not null,
  food_name text not null,
  food_library_id uuid references public.st_food_library (id) on delete set null,
  serving_qty numeric not null default 1,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint st_meal_entries_meal_type_check
    check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack'))
);

create index if not exists st_meal_entries_user_date_idx
  on public.st_meal_entries (user_id, log_date);

create index if not exists st_meal_entries_user_date_meal_idx
  on public.st_meal_entries (user_id, log_date, meal_type);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.st_nutrition_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists st_nutrition_goals_updated_at on public.st_nutrition_goals;
create trigger st_nutrition_goals_updated_at
  before update on public.st_nutrition_goals
  for each row execute function public.st_nutrition_set_updated_at();

drop trigger if exists st_food_library_updated_at on public.st_food_library;
create trigger st_food_library_updated_at
  before update on public.st_food_library
  for each row execute function public.st_nutrition_set_updated_at();

drop trigger if exists st_meal_entries_updated_at on public.st_meal_entries;
create trigger st_meal_entries_updated_at
  before update on public.st_meal_entries
  for each row execute function public.st_nutrition_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.st_nutrition_goals enable row level security;
alter table public.st_food_library enable row level security;
alter table public.st_meal_entries enable row level security;

drop policy if exists "nutrition_goals_select" on public.st_nutrition_goals;
drop policy if exists "nutrition_goals_insert" on public.st_nutrition_goals;
drop policy if exists "nutrition_goals_update" on public.st_nutrition_goals;
drop policy if exists "nutrition_goals_delete" on public.st_nutrition_goals;

create policy "nutrition_goals_select" on public.st_nutrition_goals
  for select using (user_id = auth.uid());

create policy "nutrition_goals_insert" on public.st_nutrition_goals
  for insert with check (user_id = auth.uid());

create policy "nutrition_goals_update" on public.st_nutrition_goals
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "nutrition_goals_delete" on public.st_nutrition_goals
  for delete using (user_id = auth.uid());

drop policy if exists "food_library_select" on public.st_food_library;
drop policy if exists "food_library_insert" on public.st_food_library;
drop policy if exists "food_library_update" on public.st_food_library;
drop policy if exists "food_library_delete" on public.st_food_library;

create policy "food_library_select" on public.st_food_library
  for select using (user_id = auth.uid());

create policy "food_library_insert" on public.st_food_library
  for insert with check (user_id = auth.uid());

create policy "food_library_update" on public.st_food_library
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "food_library_delete" on public.st_food_library
  for delete using (user_id = auth.uid());

drop policy if exists "meal_entries_select" on public.st_meal_entries;
drop policy if exists "meal_entries_insert" on public.st_meal_entries;
drop policy if exists "meal_entries_update" on public.st_meal_entries;
drop policy if exists "meal_entries_delete" on public.st_meal_entries;

create policy "meal_entries_select" on public.st_meal_entries
  for select using (user_id = auth.uid());

create policy "meal_entries_insert" on public.st_meal_entries
  for insert with check (user_id = auth.uid());

create policy "meal_entries_update" on public.st_meal_entries
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "meal_entries_delete" on public.st_meal_entries
  for delete using (user_id = auth.uid());


-- ===== 20250716_021_nutrition_ux_polish.sql =====

-- BIQ-0035: Nutrition UX polish — meal templates
-- Safe additive migration. Does not drop tables or delete data.

create table if not exists public.st_meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  meal_type text not null default 'breakfast',
  items jsonb not null default '[]'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint st_meal_templates_meal_type_check
    check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack'))
);

create index if not exists st_meal_templates_user_idx
  on public.st_meal_templates (user_id);

create index if not exists st_meal_templates_user_name_idx
  on public.st_meal_templates (user_id, lower(name));

drop trigger if exists st_meal_templates_updated_at on public.st_meal_templates;
create trigger st_meal_templates_updated_at
  before update on public.st_meal_templates
  for each row execute function public.st_nutrition_set_updated_at();

alter table public.st_meal_templates enable row level security;

drop policy if exists "meal_templates_select" on public.st_meal_templates;
drop policy if exists "meal_templates_insert" on public.st_meal_templates;
drop policy if exists "meal_templates_update" on public.st_meal_templates;
drop policy if exists "meal_templates_delete" on public.st_meal_templates;

create policy "meal_templates_select" on public.st_meal_templates
  for select using (user_id = auth.uid());

create policy "meal_templates_insert" on public.st_meal_templates
  for insert with check (user_id = auth.uid());

create policy "meal_templates_update" on public.st_meal_templates
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "meal_templates_delete" on public.st_meal_templates
  for delete using (user_id = auth.uid());


-- ===== 20250716_022_food_catalog.sql =====

-- BIQ-0036: Starter food catalog for nutrition search
-- Safe additive migration. Does not drop tables or delete data.

create table if not exists public.st_food_catalog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  brand text,
  category text,
  serving_label text not null default '1 serving',
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  is_system boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint st_food_catalog_owner_check check (
    (is_system = true and user_id is null)
    or (is_system = false and user_id is not null)
  )
);

create index if not exists st_food_catalog_system_idx
  on public.st_food_catalog (is_system, is_archived)
  where is_system = true;

create index if not exists st_food_catalog_name_idx
  on public.st_food_catalog (lower(name));

create unique index if not exists st_food_catalog_system_name_unique
  on public.st_food_catalog (lower(name))
  where is_system = true;

drop trigger if exists st_food_catalog_updated_at on public.st_food_catalog;
create trigger st_food_catalog_updated_at
  before update on public.st_food_catalog
  for each row execute function public.st_nutrition_set_updated_at();

alter table public.st_food_catalog enable row level security;

drop policy if exists "food_catalog_select" on public.st_food_catalog;
drop policy if exists "food_catalog_insert" on public.st_food_catalog;
drop policy if exists "food_catalog_update" on public.st_food_catalog;

create policy "food_catalog_select" on public.st_food_catalog
  for select using (is_system = true or user_id = auth.uid());

create policy "food_catalog_insert" on public.st_food_catalog
  for insert with check (is_system = false and user_id = auth.uid());

create policy "food_catalog_update" on public.st_food_catalog
  for update using (is_system = false and user_id = auth.uid())
  with check (is_system = false and user_id = auth.uid());

alter table public.st_meal_entries
  add column if not exists food_catalog_id uuid references public.st_food_catalog (id) on delete set null;

create index if not exists st_meal_entries_food_catalog_idx
  on public.st_meal_entries (food_catalog_id)
  where food_catalog_id is not null;

-- BuiltIQ starter food library (~common whole-food servings; approximate USDA-style values)
insert into public.st_food_catalog (
  name, brand, category, serving_label, calories, protein_g, carbs_g, fat_g, is_system
)
select v.name, v.brand, v.category, v.serving_label, v.calories, v.protein_g, v.carbs_g, v.fat_g, true
from (
  values
    ('Chicken breast', null, 'protein', '4 oz cooked', 185, 35, 0, 4),
    ('Ground turkey 93/7', null, 'protein', '4 oz cooked', 170, 24, 0, 8),
    ('Salmon', null, 'protein', '4 oz cooked', 230, 25, 0, 14),
    ('Tuna, canned in water', null, 'protein', '4 oz drained', 120, 26, 0, 1),
    ('Egg', null, 'protein', '1 large', 70, 6, 0, 5),
    ('Egg whites', null, 'protein', '1 cup', 126, 26, 2, 0),
    ('Greek yogurt, plain nonfat', null, 'dairy', '170 g (6 oz)', 100, 17, 6, 0),
    ('Cottage cheese, low fat', null, 'dairy', '1 cup', 180, 28, 10, 2),
    ('Whey protein powder', null, 'protein', '1 scoop (30 g)', 120, 24, 3, 1),
    ('Steak, sirloin', null, 'protein', '4 oz cooked', 210, 26, 0, 11),
    ('Shrimp', null, 'protein', '4 oz cooked', 120, 23, 1, 2),
    ('Tofu, firm', null, 'protein', '4 oz', 120, 14, 3, 6),
    ('Black beans', null, 'protein', '1 cup cooked', 227, 15, 41, 1),
    ('Lentils', null, 'protein', '1 cup cooked', 230, 18, 40, 1),
    ('Brown rice', null, 'grain', '1 cup cooked', 218, 5, 46, 2),
    ('White rice', null, 'grain', '1 cup cooked', 205, 4, 45, 0),
    ('Oatmeal', null, 'grain', '1 cup cooked', 154, 6, 27, 3),
    ('Whole wheat bread', null, 'grain', '1 slice', 80, 4, 14, 1),
    ('Sweet potato', null, 'grain', '1 medium baked', 103, 2, 24, 0),
    ('Quinoa', null, 'grain', '1 cup cooked', 222, 8, 39, 4),
    ('Pasta, cooked', null, 'grain', '1 cup', 220, 8, 43, 1),
    ('Bagel, plain', null, 'grain', '1 medium', 280, 11, 55, 2),
    ('Banana', null, 'fruit', '1 medium', 105, 1, 27, 0),
    ('Apple', null, 'fruit', '1 medium', 95, 0, 25, 0),
    ('Blueberries', null, 'fruit', '1 cup', 84, 1, 21, 0),
    ('Strawberries', null, 'fruit', '1 cup sliced', 53, 1, 13, 0),
    ('Avocado', null, 'fat', '1/2 medium', 120, 1, 6, 11),
    ('Almonds', null, 'fat', '1 oz (23 nuts)', 164, 6, 6, 14),
    ('Peanut butter', null, 'fat', '2 tbsp', 190, 7, 7, 16),
    ('Olive oil', null, 'fat', '1 tbsp', 119, 0, 0, 14),
    ('Broccoli', null, 'vegetable', '1 cup chopped', 55, 4, 11, 0),
    ('Spinach', null, 'vegetable', '2 cups raw', 14, 2, 2, 0),
    ('Mixed salad greens', null, 'vegetable', '2 cups', 20, 2, 4, 0),
    ('Broccoli and rice bowl', null, 'prepared', '1 serving', 350, 18, 48, 8),
    ('Chicken and rice', null, 'prepared', '1 serving', 420, 38, 45, 8),
    ('Protein shake', null, 'beverage', '12 oz', 180, 30, 8, 3),
    ('Protein bar', null, 'snack', '1 bar', 200, 20, 22, 6),
    ('Cheese stick, part skim', null, 'dairy', '1 stick', 80, 7, 1, 5),
    ('Milk, 2%', null, 'dairy', '1 cup', 122, 8, 12, 5),
    ('Coffee, black', null, 'beverage', '8 oz', 2, 0, 0, 0),
    ('Orange juice', null, 'beverage', '8 oz', 110, 2, 26, 0),
    ('Turkey sandwich', null, 'prepared', '1 sandwich', 320, 22, 36, 10),
    ('Burrito bowl, chicken', null, 'prepared', '1 bowl', 520, 38, 55, 16),
    ('Pizza slice, cheese', null, 'prepared', '1 slice', 285, 12, 36, 10),
    ('Hamburger, no bun', null, 'protein', '4 oz patty', 250, 20, 0, 18),
    ('Hamburger with bun', null, 'prepared', '1 burger', 390, 22, 30, 20),
    ('Protein pancakes', null, 'prepared', '2 medium', 240, 18, 28, 6),
    ('Overnight oats', null, 'prepared', '1 jar', 280, 12, 42, 8),
    ('Trail mix', null, 'snack', '1/4 cup', 170, 4, 16, 11),
    ('Rice cakes', null, 'snack', '2 cakes', 70, 1, 15, 0)
) as v(name, brand, category, serving_label, calories, protein_g, carbs_g, fat_g)
where not exists (
  select 1 from public.st_food_catalog c
  where c.is_system = true and lower(c.name) = lower(v.name)
);


-- ===== 20250717_023_group_training_schema.sql =====

-- BIQ-0043-P2: Group classifications, workout assignments, participation flag
-- Safe additive migration. Does not drop tables or delete data.

-- ---------------------------------------------------------------------------
-- 1. Team members: participation flag + manager role backfill
-- ---------------------------------------------------------------------------

alter table public.st_team_members
  add column if not exists is_active_participant boolean not null default true;

update public.st_team_members
set role = 'manager'
where role = 'editor';

update public.st_team_members
set is_active_participant = true
where status = 'active' and is_active_participant is distinct from true;

alter table public.st_team_members
  drop constraint if exists st_team_members_role_check;

alter table public.st_team_members
  add constraint st_team_members_role_check
  check (role in ('owner', 'manager', 'member'));

-- ---------------------------------------------------------------------------
-- 2. Helpers — accept manager (legacy editor already backfilled)
-- ---------------------------------------------------------------------------

create or replace function public.st_user_can_edit_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'manager')
      and m.status = 'active'
  );
$$;

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
      and coach.role in ('owner', 'manager')
      and coach.status = 'active'
      and member.user_id = p_member_user_id
      and member.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Classifications
-- ---------------------------------------------------------------------------

create table if not exists public.st_group_classifications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (team_id, slug)
);

create index if not exists st_group_classifications_team_idx
  on public.st_group_classifications (team_id);

create table if not exists public.st_group_member_classifications (
  member_id uuid not null references public.st_team_members(id) on delete cascade,
  classification_id uuid not null references public.st_group_classifications(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, classification_id)
);

create index if not exists st_group_member_classifications_classification_idx
  on public.st_group_member_classifications (classification_id);

-- ---------------------------------------------------------------------------
-- 4. Workout assignments + recipients
-- ---------------------------------------------------------------------------

create table if not exists public.st_workout_assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  workout_id uuid references public.st_workouts(id) on delete set null,
  program_id uuid references public.st_programs(id) on delete set null,
  workout_date date,
  target_type text not null
    check (target_type in ('group', 'classification', 'members', 'individual')),
  target_classification_id uuid references public.st_group_classifications(id) on delete set null,
  scheduled_date date not null default current_date,
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'started', 'completed', 'cancelled')),
  template_snapshot_version int not null default 1,
  is_active boolean not null default true,
  title text,
  notes text,
  created_at timestamptz not null default now(),
  check (
    workout_id is not null
    or (program_id is not null and workout_date is not null)
  )
);

create index if not exists st_workout_assignments_team_active_idx
  on public.st_workout_assignments (team_id, is_active, scheduled_date desc);

create table if not exists public.st_assignment_recipients (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.st_workout_assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'started', 'completed', 'skipped', 'cancelled')),
  personal_copy_program_id uuid references public.st_programs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (assignment_id, user_id)
);

create index if not exists st_assignment_recipients_user_idx
  on public.st_assignment_recipients (user_id, status);

-- ---------------------------------------------------------------------------
-- 5. Program assignments — multi-target columns
-- ---------------------------------------------------------------------------

alter table public.st_program_assignments
  add column if not exists target_type text
    check (target_type is null or target_type in ('group', 'classification', 'members', 'individual'));

alter table public.st_program_assignments
  add column if not exists target_classification_id uuid
    references public.st_group_classifications(id) on delete set null;

update public.st_program_assignments
set target_type = 'individual'
where target_type is null and is_active = true;

-- ---------------------------------------------------------------------------
-- 6. RLS — classifications
-- ---------------------------------------------------------------------------

alter table public.st_group_classifications enable row level security;
alter table public.st_group_member_classifications enable row level security;
alter table public.st_workout_assignments enable row level security;
alter table public.st_assignment_recipients enable row level security;

create policy "group_classifications_select" on public.st_group_classifications
  for select using (public.st_user_is_active_team_member(team_id));

create policy "group_classifications_write" on public.st_group_classifications
  for all using (public.st_user_can_edit_team(team_id))
  with check (public.st_user_can_edit_team(team_id));

create policy "group_member_classifications_select" on public.st_group_member_classifications
  for select using (
    exists (
      select 1
      from public.st_team_members tm
      join public.st_group_classifications gc on gc.id = st_group_member_classifications.classification_id
      where tm.id = st_group_member_classifications.member_id
        and public.st_user_is_active_team_member(gc.team_id)
    )
  );

create policy "group_member_classifications_write" on public.st_group_member_classifications
  for all using (
    exists (
      select 1
      from public.st_group_classifications gc
      where gc.id = st_group_member_classifications.classification_id
        and public.st_user_can_edit_team(gc.team_id)
    )
  )
  with check (
    exists (
      select 1
      from public.st_group_classifications gc
      where gc.id = st_group_member_classifications.classification_id
        and public.st_user_can_edit_team(gc.team_id)
    )
  );

-- Members see only their own assignment rows; managers see all team assignments.
create policy "workout_assignments_select" on public.st_workout_assignments
  for select using (
    public.st_user_can_edit_team(team_id)
    or exists (
      select 1
      from public.st_assignment_recipients ar
      where ar.assignment_id = st_workout_assignments.id
        and ar.user_id = auth.uid()
    )
  );

create policy "workout_assignments_insert" on public.st_workout_assignments
  for insert with check (public.st_user_can_edit_team(team_id));

create policy "workout_assignments_update" on public.st_workout_assignments
  for update using (public.st_user_can_edit_team(team_id));

create policy "assignment_recipients_select" on public.st_assignment_recipients
  for select using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.st_workout_assignments wa
      where wa.id = st_assignment_recipients.assignment_id
        and public.st_user_can_edit_team(wa.team_id)
    )
  );

create policy "assignment_recipients_update" on public.st_assignment_recipients
  for update using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.st_workout_assignments wa
      where wa.id = st_assignment_recipients.assignment_id
        and public.st_user_can_edit_team(wa.team_id)
    )
  );

-- Refresh program assignment policies for manager role
drop policy if exists "program_assignments_select" on public.st_program_assignments;
drop policy if exists "program_assignments_insert" on public.st_program_assignments;
drop policy if exists "program_assignments_update" on public.st_program_assignments;

create policy "program_assignments_select" on public.st_program_assignments
  for select using (
    user_id = auth.uid()
    or public.st_user_can_read_program(program_id)
    or exists (
      select 1 from public.st_team_members tm
      where tm.team_id = st_program_assignments.team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner', 'manager')
    )
  );

create policy "program_assignments_insert" on public.st_program_assignments
  for insert with check (
    exists (
      select 1 from public.st_team_members tm
      where tm.team_id = st_program_assignments.team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner', 'manager')
    )
  );

create policy "program_assignments_update" on public.st_program_assignments
  for update using (
    exists (
      select 1 from public.st_team_members tm
      where tm.team_id = st_program_assignments.team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner', 'manager')
    )
  );

-- Coach co-logging policies (manager role)
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
        and coach.role in ('owner', 'manager')
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
        and coach.role in ('owner', 'manager')
        and p.visibility = 'team'
    )
  );

-- ---------------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------------

create or replace function public.st_set_member_participation(
  p_team_id uuid,
  p_member_user_id uuid,
  p_is_active_participant boolean
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
    raise exception 'Not authorized';
  end if;

  update public.st_team_members
  set is_active_participant = coalesce(p_is_active_participant, true)
  where team_id = p_team_id
    and user_id = p_member_user_id
    and status = 'active';

  if not found then
    raise exception 'Member not found';
  end if;
end;
$$;

revoke all on function public.st_set_member_participation(uuid, uuid, boolean) from public;
grant execute on function public.st_set_member_participation(uuid, uuid, boolean) to authenticated;

create or replace function public.st_promote_member_to_manager(
  p_team_id uuid,
  p_member_user_id uuid
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

  if not public.st_user_is_team_owner(p_team_id) then
    raise exception 'Only owner can promote managers';
  end if;

  if p_member_user_id = auth.uid() then
    raise exception 'Owner role is unchanged';
  end if;

  update public.st_team_members
  set role = 'manager'
  where team_id = p_team_id
    and user_id = p_member_user_id
    and status = 'active'
    and role = 'member';

  if not found then
    raise exception 'Member not found or not eligible for promotion';
  end if;
end;
$$;

revoke all on function public.st_promote_member_to_manager(uuid, uuid) from public;
grant execute on function public.st_promote_member_to_manager(uuid, uuid) to authenticated;

create or replace function public.st_assign_member_program(
  p_team_id uuid,
  p_member_user_id uuid,
  p_assignment_type text,
  p_program_id uuid default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'manager')
  ) then
    raise exception 'Not authorized';
  end if;

  update public.st_program_assignments
  set is_active = false
  where user_id = p_member_user_id and team_id = p_team_id and is_active = true;

  insert into public.st_program_assignments (
    user_id, team_id, assigned_by, assignment_type, program_id, notes, is_active, target_type
  ) values (
    p_member_user_id, p_team_id, auth.uid(), p_assignment_type, p_program_id, p_notes, true, 'individual'
  );

  if p_assignment_type = 'personal' then
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'personal');
  else
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'team');
  end if;
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
  p_notes text default null
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

  if not public.st_user_can_edit_team(p_team_id) then
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
    team_id,
    assigned_by,
    workout_id,
    program_id,
    workout_date,
    target_type,
    target_classification_id,
    scheduled_date,
    due_date,
    title,
    notes
  ) values (
    p_team_id,
    auth.uid(),
    p_workout_id,
    p_program_id,
    p_workout_date,
    p_target_type,
    p_target_classification_id,
    coalesce(p_scheduled_date, current_date),
    p_due_date,
    p_title,
    p_notes
  )
  returning id into v_assignment_id;

  if p_target_type = 'group' then
    for v_recipient in
      select tm.user_id
      from public.st_team_members tm
      where tm.team_id = p_team_id
        and tm.status = 'active'
        and tm.is_active_participant = true
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
      where tm.team_id = p_team_id
        and tm.status = 'active'
        and tm.is_active_participant = true
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
  uuid, uuid, uuid, date, text, uuid, uuid[], date, date, text, text
) from public;
grant execute on function public.st_assign_workout_to_targets(
  uuid, uuid, uuid, date, text, uuid, uuid[], date, date, text, text
) to authenticated;


-- ===== 20250717_024_group_remove_member.sql =====

-- BIQ-0043-P3: Manager/owner remove group member (soft delete via status)

create or replace function public.st_remove_group_member(
  p_team_id uuid,
  p_member_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not authorized';
  end if;

  if p_member_user_id = auth.uid() then
    raise exception 'Use leave-group flow to remove yourself';
  end if;

  select role into v_target_role
  from public.st_team_members
  where team_id = p_team_id
    and user_id = p_member_user_id
    and status = 'active';

  if not found then
    raise exception 'Member not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Cannot remove the group owner';
  end if;

  update public.st_team_members
  set status = 'removed'
  where team_id = p_team_id
    and user_id = p_member_user_id
    and status = 'active';
end;
$$;

revoke all on function public.st_remove_group_member(uuid, uuid) from public;
grant execute on function public.st_remove_group_member(uuid, uuid) to authenticated;


-- ===== 20250717_025_copy_assignment_to_personal.sql =====

-- BIQ-0043-P6: Copy assigned group workout into member personal program

create or replace function public.st_copy_assignment_to_personal(p_recipient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient public.st_assignment_recipients%rowtype;
  v_wa public.st_workout_assignments%rowtype;
  v_program public.st_programs%rowtype;
  v_workout public.st_workouts%rowtype;
  v_source_workout_id uuid;
  v_new_program_id uuid;
  v_new_workout_id uuid;
  v_ex record;
  v_new_ex_id uuid;
  v_ps record;
  v_superset_map jsonb := '{}'::jsonb;
  v_new_group uuid;
  v_title text;
  v_start date;
  v_day_label text;
  v_week int;
  v_weeks int;
  v_anchor date;
  v_diff int;
  v_dow int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_recipient
  from public.st_assignment_recipients
  where id = p_recipient_id and user_id = auth.uid();

  if not found then
    raise exception 'Assignment not found';
  end if;

  if v_recipient.personal_copy_program_id is not null then
    return v_recipient.personal_copy_program_id;
  end if;

  select * into v_wa
  from public.st_workout_assignments
  where id = v_recipient.assignment_id;

  if not found then
    raise exception 'Workout assignment not found';
  end if;

  v_source_workout_id := v_wa.workout_id;

  if v_source_workout_id is null and v_wa.program_id is not null and v_wa.workout_date is not null then
    select * into v_program
    from public.st_programs
    where id = v_wa.program_id;

    if not found then
      raise exception 'Source program not found';
    end if;

    v_start := coalesce(v_program.start_date, v_program.created_at::date);
    v_weeks := greatest(coalesce(v_program.weeks, 6), 1);
    v_day_label := trim(to_char(v_wa.workout_date, 'Dy'));

    v_dow := extract(dow from v_start)::int;
    v_anchor := v_start - case when v_dow = 0 then 6 else v_dow - 1 end;
    v_diff := v_wa.workout_date - v_anchor;

    if v_diff < 0 then
      v_week := 1;
    else
      v_week := least(greatest((v_diff / 7) + 1, 1), v_weeks);
    end if;

    select w.id into v_source_workout_id
    from public.st_workouts w
    where w.program_id = v_wa.program_id
      and w.week = v_week
      and w.day_label = v_day_label
    limit 1;

    if v_source_workout_id is null then
      select w.id into v_source_workout_id
      from public.st_workouts w
      where w.program_id = v_wa.program_id
        and w.week = 1
        and w.day_label = v_day_label
      limit 1;
    end if;
  end if;

  if v_source_workout_id is null then
    raise exception 'Could not resolve workout for this assignment';
  end if;

  select * into v_workout
  from public.st_workouts
  where id = v_source_workout_id;

  if not found then
    raise exception 'Source workout not found';
  end if;

  v_title := coalesce(nullif(trim(v_wa.title), ''), v_workout.day_label || ' · ' || v_workout.workout_type);

  insert into public.st_programs (
    owner_user_id,
    team_id,
    visibility,
    name,
    weeks,
    start_date,
    generation_method
  ) values (
    auth.uid(),
    null,
    'personal',
    'Assigned: ' || v_title,
    1,
    coalesce(v_wa.scheduled_date, current_date),
    'manual'
  )
  returning id into v_new_program_id;

  insert into public.st_workouts (
    program_id,
    week,
    day_order,
    day_label,
    workout_type
  ) values (
    v_new_program_id,
    1,
    v_workout.day_order,
    v_workout.day_label,
    v_workout.workout_type
  )
  returning id into v_new_workout_id;

  for v_ex in
    select *
    from public.st_exercises
    where workout_id = v_source_workout_id
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
        target_rpe,
        is_deleted
      ) values (
        v_new_ex_id,
        v_ps.sort_order,
        v_ps.set_number,
        v_ps.set_type,
        v_ps.target_weight,
        v_ps.target_reps,
        v_ps.target_rpe,
        false
      );
    end loop;
  end loop;

  update public.st_assignment_recipients
  set personal_copy_program_id = v_new_program_id
  where id = p_recipient_id;

  return v_new_program_id;
end;
$$;

grant execute on function public.st_copy_assignment_to_personal(uuid) to authenticated;


-- ===== 20250717_026_group_ai_metadata_hooks.sql =====

-- BIQ-0043-P8: AI readiness metadata hooks on group assignments (no AI UI)

alter table public.st_workout_assignments
  add column if not exists coaching_metadata jsonb not null default '{}'::jsonb;

comment on column public.st_workout_assignments.coaching_metadata is
  'AI hooks: intent, progression_rules, readiness_modifiers, target_rpe, notes_for_coach';

alter table public.st_program_assignments
  add column if not exists coaching_metadata jsonb not null default '{}'::jsonb;

comment on column public.st_program_assignments.coaching_metadata is
  'AI hooks for assigned member programs';

alter table public.st_teams
  add column if not exists coaching_metadata jsonb not null default '{}'::jsonb;

comment on column public.st_teams.coaching_metadata is
  'Group AI context: sport, season_phase, group_goals, compliance_targets';

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

  if not public.st_user_can_edit_team(p_team_id) then
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
    team_id,
    assigned_by,
    workout_id,
    program_id,
    workout_date,
    target_type,
    target_classification_id,
    scheduled_date,
    due_date,
    title,
    notes,
    coaching_metadata
  ) values (
    p_team_id,
    auth.uid(),
    p_workout_id,
    p_program_id,
    p_workout_date,
    p_target_type,
    p_target_classification_id,
    coalesce(p_scheduled_date, current_date),
    p_due_date,
    p_title,
    p_notes,
    coalesce(p_coaching_metadata, '{}'::jsonb)
  )
  returning id into v_assignment_id;

  if p_target_type = 'group' then
    for v_recipient in
      select tm.user_id
      from public.st_team_members tm
      where tm.team_id = p_team_id
        and tm.status = 'active'
        and tm.is_active_participant = true
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
      where tm.team_id = p_team_id
        and tm.status = 'active'
        and tm.is_active_participant = true
        and gmc.classification_id = p_target_classification_id
    loop
      insert into public.st_assignment_recipients (assignment_id, user_id)
      values (v_assignment_id, v_recipient)
      on conflict (assignment_id, user_id) do nothing;
    end loop;
  else
    foreach v_uid in array p_target_user_ids
    loop
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
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'manager')
  ) then
    raise exception 'Not authorized';
  end if;

  update public.st_program_assignments
  set is_active = false
  where user_id = p_member_user_id and team_id = p_team_id and is_active = true;

  insert into public.st_program_assignments (
    user_id, team_id, assigned_by, assignment_type, program_id, notes, is_active, target_type, coaching_metadata
  ) values (
    p_member_user_id, p_team_id, auth.uid(), p_assignment_type, p_program_id, p_notes, true, 'individual',
    coalesce(p_coaching_metadata, '{}'::jsonb)
  );

  if p_assignment_type = 'personal' then
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'personal');
  else
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'team');
  end if;
end;
$$;

grant execute on function public.st_assign_workout_to_targets(
  uuid, uuid, uuid, date, text, uuid, uuid[], date, date, text, text, jsonb
) to authenticated;

grant execute on function public.st_assign_member_program(
  uuid, uuid, text, uuid, text, jsonb
) to authenticated;


-- ===== 20250722_027_program_draft_status.sql =====

-- BIQ-0053 Program draft / publish lifecycle

alter table public.st_programs
  add column if not exists status text not null default 'published'
    check (status in ('draft', 'published', 'archived'));

comment on column public.st_programs.status is
  'draft = owner/manager only; published = available for training and group default';

update public.st_programs set status = 'published' where status is null;

-- Draft team programs: only owners/managers may read; members see published only.
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
        or (p.visibility = 'team' and public.st_user_is_active_team_member(p.team_id))
      )
      and (
        coalesce(p.status, 'published') = 'published'
        or (p.visibility = 'personal' and p.owner_user_id = auth.uid())
        or (p.visibility = 'team' and public.st_user_can_edit_team(p.team_id))
      )
  );
$$;

drop policy if exists "programs_read" on public.st_programs;

create policy "programs_read" on public.st_programs
  for select
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (
      visibility = 'team'
      and public.st_user_is_active_team_member(team_id)
      and (
        coalesce(status, 'published') = 'published'
        or public.st_user_can_edit_team(team_id)
      )
    )
  );
