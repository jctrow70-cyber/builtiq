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
