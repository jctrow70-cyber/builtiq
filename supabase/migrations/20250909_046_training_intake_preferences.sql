-- BIQ-0165 Structured program intake preferences
-- Additive. Does not alter programs, workouts, or set-log history.

alter table public.st_training_profiles
  add column if not exists training_split text,
  add column if not exists preferred_training_days text[] default '{}',
  add column if not exists priority_areas text[] default '{}',
  add column if not exists superset_preference text,
  add column if not exists variety_preference text,
  add column if not exists training_feel text[] default '{}',
  add column if not exists intake_limitations text[] default '{}',
  add column if not exists intake_notes text;

comment on column public.st_training_profiles.training_split is 'User split preference: full_body, upper_lower, ppl, body_part, athletic, hybrid, ai_recommend';
comment on column public.st_training_profiles.superset_preference is 'minimal | sometimes | frequently | ai_decide';
comment on column public.st_training_profiles.variety_preference is 'consistent | balanced | high | ai_decide';
comment on column public.st_training_profiles.intake_notes is 'Optional free-text program instructions. Not medical diagnosis.';
