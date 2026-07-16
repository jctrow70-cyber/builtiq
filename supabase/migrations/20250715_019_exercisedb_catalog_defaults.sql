-- BIQ-0028: ExerciseDB guided library defaults
-- Updates profile catalog_sources default to include exercisedb guided library.
-- Safe if 20250715_018 was skipped: create column before altering default.

alter table public.st_profiles
  add column if not exists catalog_sources text[] default array['builtiq_essentials', 'builtiq_basic']::text[];

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
