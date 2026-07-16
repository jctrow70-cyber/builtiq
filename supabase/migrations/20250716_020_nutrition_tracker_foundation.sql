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
