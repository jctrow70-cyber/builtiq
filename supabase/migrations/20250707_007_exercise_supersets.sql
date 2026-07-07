-- BIQ-0008: Exercise supersets (2-3 exercises grouped)
-- Safe additive migration. Does not drop tables or delete data.

alter table public.st_exercises
  add column if not exists superset_group_id uuid;

create index if not exists st_exercises_superset_group_idx
  on public.st_exercises (workout_id, section, superset_group_id)
  where superset_group_id is not null;

alter table public.st_set_logs
  add column if not exists snapshot_superset_group_id uuid;
