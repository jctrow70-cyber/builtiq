-- BIQ-0202: Per-workout equipment on a movement card
-- Safe additive migration. Does not drop tables or rewrite history names.

alter table public.st_exercises
  add column if not exists equipment text;

alter table public.st_set_logs
  add column if not exists snapshot_equipment text;

comment on column public.st_exercises.equipment is
  'Implement chosen for this planned exercise, from the catalog compatible list.';

comment on column public.st_set_logs.snapshot_equipment is
  'Equipment in use when the set was logged. History keeps this if the plan later changes.';
