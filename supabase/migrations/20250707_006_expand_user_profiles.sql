-- BIQ-0006: Expand user profiles and onboarding fields
-- Safe additive migration. Does not drop tables or delete data.

alter table public.st_profiles
  add column if not exists height_inches numeric,
  add column if not exists weight_lbs numeric,
  add column if not exists birth_year int,
  add column if not exists sex text,
  add column if not exists experience_level text,
  add column if not exists primary_goal text,
  add column if not exists units_preference text default 'imperial',
  add column if not exists profile_completed boolean not null default false,
  add column if not exists updated_at timestamptz default now();

-- Existing users with a display name are treated as onboarded.
update public.st_profiles
set profile_completed = true
where coalesce(length(trim(display_name)), 0) > 0
  and profile_completed = false;

create or replace function public.st_profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists st_profiles_updated_at on public.st_profiles;
create trigger st_profiles_updated_at
  before update on public.st_profiles
  for each row execute function public.st_profiles_set_updated_at();
