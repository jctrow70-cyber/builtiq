-- BIQ-0197 Dedicated cardio / mobility days on program intake
-- Additive. Does not alter programs, workouts, or set-log history.

alter table public.st_training_profiles
  add column if not exists include_cardio_day text default 'ai_decide',
  add column if not exists include_mobility_day text default 'ai_decide';

comment on column public.st_training_profiles.include_cardio_day is 'yes | no | ai_decide — dedicated cardio day in generated programs';
comment on column public.st_training_profiles.include_mobility_day is 'yes | no | ai_decide — dedicated mobility/recovery day in generated programs';
