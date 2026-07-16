-- BIQ-0034: Repair missing st_profiles.catalog_sources (safe to re-run)
-- Run this if migration 019 failed with: column "catalog_sources" does not exist

alter table public.st_profiles
  add column if not exists catalog_sources text[] default array['exercisedb', 'builtiq_essentials']::text[];

comment on column public.st_profiles.catalog_sources is
  'Legacy per-user library filter (app uses unified catalog since BIQ-0031). Kept for schema compatibility.';

update public.st_profiles
set catalog_sources = array(
  select distinct unnest(
    coalesce(catalog_sources, array[]::text[]) || array['exercisedb', 'builtiq_essentials']::text[]
  )
)
where catalog_sources is null
   or not ('exercisedb' = any(coalesce(catalog_sources, array[]::text[])));
