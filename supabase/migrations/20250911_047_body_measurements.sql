-- BIQ-0173: Body progress measurements (weight + waist circumference)
-- Safe additive migration. Does not drop tables or delete data.

-- ---------------------------------------------------------------------------
-- Body measurement check-ins (one row per user per day)
-- Canonical storage: weight_lbs, waist_inches (matches st_profiles)
-- ---------------------------------------------------------------------------

create table if not exists public.st_body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_lbs numeric,
  waist_inches numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint st_body_measurements_user_date_unique unique (user_id, measured_on),
  constraint st_body_measurements_has_value check (
    weight_lbs is not null or waist_inches is not null
  ),
  constraint st_body_measurements_weight_positive check (
    weight_lbs is null or weight_lbs > 0
  ),
  constraint st_body_measurements_waist_positive check (
    waist_inches is null or waist_inches > 0
  )
);

create index if not exists st_body_measurements_user_date_idx
  on public.st_body_measurements (user_id, measured_on desc);

comment on table public.st_body_measurements is
  'Personal body check-ins (weight, waist). One row per user per calendar day; values stored in imperial canonical units.';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.st_body_measurements_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists st_body_measurements_updated_at on public.st_body_measurements;
create trigger st_body_measurements_updated_at
  before update on public.st_body_measurements
  for each row execute function public.st_body_measurements_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security (owner-only)
-- ---------------------------------------------------------------------------

alter table public.st_body_measurements enable row level security;

drop policy if exists "body_measurements_select" on public.st_body_measurements;
drop policy if exists "body_measurements_insert" on public.st_body_measurements;
drop policy if exists "body_measurements_update" on public.st_body_measurements;
drop policy if exists "body_measurements_delete" on public.st_body_measurements;

create policy "body_measurements_select" on public.st_body_measurements
  for select using (user_id = auth.uid());

create policy "body_measurements_insert" on public.st_body_measurements
  for insert with check (user_id = auth.uid());

create policy "body_measurements_update" on public.st_body_measurements
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "body_measurements_delete" on public.st_body_measurements
  for delete using (user_id = auth.uid());
