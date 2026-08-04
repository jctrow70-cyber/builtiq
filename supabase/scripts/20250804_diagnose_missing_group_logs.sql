-- BIQ-0085 diagnostic + optional rematch helpers
-- Run in Supabase SQL Editor (as project owner) if Training looks empty after
-- regenerating a group program.
--
-- Replace the email below with the affected account.

-- 1) Do completed logs still exist?
select
  u.email,
  count(*) as completed_logs,
  count(*) filter (where sl.planned_set_id is null) as orphaned_null_planned_set,
  min(sl.log_date) as first_log,
  max(sl.log_date) as last_log
from public.st_set_logs sl
join auth.users u on u.id = sl.user_id
where u.email = 'jctrow70@gmail.com'
  and sl.completed = true
group by u.email;

-- 2) How many of those logs still point at a living planned set / program?
select
  p.id as program_id,
  p.name as program_name,
  p.visibility,
  p.team_id,
  p.status,
  count(sl.id) as linked_logs
from public.st_set_logs sl
join auth.users u on u.id = sl.user_id
left join public.st_planned_sets ps on ps.id = sl.planned_set_id
left join public.st_exercises e on e.id = ps.exercise_id
left join public.st_workouts w on w.id = e.workout_id
left join public.st_programs p on p.id = w.program_id
where u.email = 'jctrow70@gmail.com'
  and sl.completed = true
group by p.id, p.name, p.visibility, p.team_id, p.status
order by linked_logs desc;

-- 3) List recent team programs (old one may still be assignable)
select
  t.name as team_name,
  p.id,
  p.name,
  p.status,
  p.created_at,
  (t.default_program_id = p.id) as is_team_default,
  (select count(*) from public.st_workouts w where w.program_id = p.id) as workouts
from public.st_programs p
join public.st_teams t on t.id = p.team_id
join auth.users u on u.id = t.owner_user_id
where u.email = 'jctrow70@gmail.com'
  and p.visibility = 'team'
order by p.created_at desc;

-- If query (1) returns 0 rows, logs were hard-deleted (likely CASCADE before
-- BIQ-0003). Restore from Supabase Dashboard → Database → Backups (PITR).
--
-- If query (1) has rows but Training / member Progress is empty, open the app
-- Groups → member → Progress → Restore history (BIQ-0085/0086), or re-assign
-- the previous manually built program from Groups → Programs as the team default.
--
-- Also apply migrations:
--   20250804_034_preserve_set_logs_on_program_delete.sql
--   20250804_035_member_progress_coach_log_access.sql
