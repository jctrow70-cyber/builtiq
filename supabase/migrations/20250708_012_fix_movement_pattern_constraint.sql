-- BIQ-0013 hotfix: normalize movement_pattern before constraint (safe to re-run)
-- Run this if migration 011 failed on st_exercise_catalog_movement_pattern_check

alter table public.st_exercise_catalog
  drop constraint if exists st_exercise_catalog_movement_pattern_check;

update public.st_exercise_catalog
set movement_pattern = null
where movement_pattern is not null and trim(movement_pattern) = '';

update public.st_exercise_catalog
set movement_pattern = lower(trim(movement_pattern))
where movement_pattern is not null;

update public.st_exercise_catalog
set movement_pattern = case movement_pattern
  when 'push' then 'push_horizontal'
  when 'pull' then 'pull_horizontal'
  when 'lunge' then 'squat'
  when 'mobility' then 'rotation'
  when 'activation' then 'isolation'
  when 'stability' then 'isolation'
  when 'power' then 'squat'
  else movement_pattern
end
where movement_pattern is not null;

update public.st_exercise_catalog
set movement_pattern = null
where movement_pattern is not null
  and movement_pattern not in (
    'squat', 'hinge', 'push_horizontal', 'push_vertical', 'pull_horizontal',
    'pull_vertical', 'carry', 'rotation', 'isolation', 'cardio'
  );

alter table public.st_exercise_catalog
  add constraint st_exercise_catalog_movement_pattern_check check (
    movement_pattern is null
    or movement_pattern in (
      'squat', 'hinge', 'push_horizontal', 'push_vertical', 'pull_horizontal',
      'pull_vertical', 'carry', 'rotation', 'isolation', 'cardio'
    )
  );
