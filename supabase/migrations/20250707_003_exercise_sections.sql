-- Build IQ: workout sections (warmup, strength)
-- Safe additive migration. Does not drop data.

alter table public.st_exercises
  add column if not exists section text not null default 'strength';

update public.st_exercises
set section = 'strength'
where section is null or section = '';

create index if not exists st_exercises_workout_section_sort_idx
  on public.st_exercises (workout_id, section, sort_order);
