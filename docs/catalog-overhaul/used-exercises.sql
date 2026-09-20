-- Used exercises for catalog mapping (household).
-- Run in Supabase → SQL Editor (service role / project owner).
-- After it returns, use Download CSV, then fill new_exercise_id / new_exercise_name
-- from BuiltIQ_Exercise_Master_Library_with_Form_Links.xlsx.

-- 1) Who has logged sets? Confirm the three household emails, then run query 2.
select
  u.email,
  p.display_name,
  p.user_id,
  count(*) as set_rows,
  min(sl.log_date) as first_log,
  max(sl.log_date) as last_log
from public.st_set_logs sl
join auth.users u on u.id = sl.user_id
left join public.st_profiles p on p.user_id = sl.user_id
group by u.email, p.display_name, p.user_id
order by set_rows desc;

-- 2) Distinct exercises the household has actually logged.
-- Run this query by itself, then Download CSV.
with household as (
  select u.id
  from auth.users u
  where lower(u.email) in (
    lower('jctrow70@gmail.com'),
    lower('trowbridgemary5@gmail.com'),
    lower('ewtrow14@gmail.com')
  )
),
logged as (
  select
    sl.user_id,
    sl.log_date,
    sl.completed,
    sl.snapshot_catalog_exercise_id,
    nullif(trim(sl.snapshot_exercise_name), '') as logged_name
  from public.st_set_logs sl
  where sl.user_id in (select id from household)
)
select
  coalesce(l.logged_name, c.name, 'Unknown') as logged_name,
  c.name as current_catalog_name,
  c.id::text as current_catalog_id,
  c.external_source,
  c.external_id,
  c.muscle_group,
  c.equipment,
  c.movement_pattern,
  count(*) as set_rows,
  count(*) filter (where l.completed is true) as completed_sets,
  count(distinct l.user_id) as user_count,
  min(l.log_date)::text as first_logged,
  max(l.log_date)::text as last_logged,
  '' as new_exercise_id,
  '' as new_exercise_name
from logged l
left join public.st_exercise_catalog c on c.id = l.snapshot_catalog_exercise_id
group by
  coalesce(l.logged_name, c.name, 'Unknown'),
  c.name,
  c.id,
  c.external_source,
  c.external_id,
  c.muscle_group,
  c.equipment,
  c.movement_pattern
order by set_rows desc, logged_name;

-- 3) Optional: exercises on your current programs that you have not logged yet.
-- Uses the same three household emails as query 2.
with household as (
  select u.id
  from auth.users u
  where lower(u.email) in (
    lower('jctrow70@gmail.com'),
    lower('trowbridgemary5@gmail.com'),
    lower('ewtrow14@gmail.com')
  )
),
followed as (
  select distinct p.followed_program_id as program_id
  from public.st_profiles p
  where p.user_id in (select id from household)
    and p.followed_program_id is not null
  union
  select pr.id
  from public.st_programs pr
  where pr.owner_user_id in (select id from household)
),
program_ex as (
  select distinct
    e.name as program_exercise_name,
    e.catalog_exercise_id
  from public.st_workouts w
  join public.st_exercises e on e.workout_id = w.id
  where w.program_id in (select program_id from followed where program_id is not null)
),
logged_names as (
  select distinct lower(trim(sl.snapshot_exercise_name)) as name_key
  from public.st_set_logs sl
  where sl.user_id in (select id from household)
    and coalesce(length(trim(sl.snapshot_exercise_name)), 0) > 0
)
select
  pe.program_exercise_name,
  c.name as current_catalog_name,
  c.id::text as current_catalog_id,
  c.external_source,
  c.external_id,
  '' as new_exercise_id,
  '' as new_exercise_name
from program_ex pe
left join public.st_exercise_catalog c on c.id = pe.catalog_exercise_id
where lower(trim(pe.program_exercise_name)) not in (select name_key from logged_names)
order by pe.program_exercise_name;
