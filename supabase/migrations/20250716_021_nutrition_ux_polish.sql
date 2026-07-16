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
