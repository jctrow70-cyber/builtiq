-- BIQ-0017: User available equipment for catalog + AI program filtering

alter table public.st_profiles
  add column if not exists available_equipment text[] default '{}';

comment on column public.st_profiles.available_equipment is 'Equipment user has access to; empty or full_gym = no filter';
