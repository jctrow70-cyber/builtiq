-- BIQ-0011: Muscle focus on programs + optional log week context

alter table st_programs
  add column if not exists focus_muscles text[] default null,
  add column if not exists progression_profile jsonb default null;

comment on column st_programs.focus_muscles is 'User-selected muscle emphasis at program generation (BIQ-0011)';
comment on column st_programs.progression_profile is 'Future AI/rule progression metadata';

alter table st_set_logs
  add column if not exists snapshot_week smallint default null,
  add column if not exists snapshot_day_order smallint default null;

comment on column st_set_logs.snapshot_week is 'Program week when set was logged (snapshot)';
comment on column st_set_logs.snapshot_day_order is 'Workout day_order when set was logged (snapshot)';
