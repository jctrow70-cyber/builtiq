-- BIQ-0316 / BIQ-0309 Phase 2 — identify only (read-only)
-- Personal enrollments where starts_on precedes program.start_date.
-- Do NOT update rows from this script. Repair requires separate approval.

select
  e.id as enrollment_id,
  e.user_id,
  e.source_key,
  e.status,
  e.starts_on,
  p.id as program_id,
  p.name as program_name,
  p.start_date as program_start_date,
  (p.start_date - e.starts_on) as days_starts_on_before_program,
  e.schedule_visible,
  e.expectation_enabled,
  (
    select count(*)
    from public.st_training_expectations x
    where x.enrollment_id = e.id
      and x.origin = 'program'
      and x.excused = false
  ) as expectation_count
from public.st_training_enrollments e
join public.st_programs p on p.id = e.program_id
where e.source_kind = 'personal'
  and e.starts_on is not null
  and p.start_date is not null
  and e.starts_on < p.start_date
order by e.starts_on, p.start_date, e.id;

-- Optional: for one enrollment, preview which workout week Nov 2–8 would map to
-- after the clock fix (program.start_date) vs before (starts_on).
-- Replace :enrollment_id before running.
/*
with en as (
  select e.id, e.starts_on, p.start_date, p.id as program_id
  from public.st_training_enrollments e
  join public.st_programs p on p.id = e.program_id
  where e.id = 'REPLACE_ENROLLMENT_ID'::uuid
),
bounds as (
  select date '2026-11-02' as week_from, date '2026-11-08' as week_to from en
)
select
  'before_starts_on_clock' as mode,
  ((d.day - public.st_schedule_monday(en.starts_on)) / 7) + 1 as program_week,
  d.day
from en
cross join bounds b
cross join lateral generate_series(b.week_from, b.week_to, interval '1 day') as g(day)
cross join lateral (select g.day::date as day) d
union all
select
  'after_program_start_clock',
  ((d.day - public.st_schedule_monday(en.start_date)) / 7) + 1,
  d.day
from en
cross join bounds b
cross join lateral generate_series(b.week_from, b.week_to, interval '1 day') as g(day)
cross join lateral (select g.day::date as day) d
order by mode, day;
*/

-- Proposed repair (DO NOT RUN without approval):
-- 1) Review identify rows above.
-- 2) For approved enrollment ids only:
--    update st_training_enrollments
--      set starts_on = p.start_date, updated_at = now()
--    from st_programs p
--    where ... and starts_on < p.start_date;
-- 3) Refresh expectations for those enrollments from an agreed effective_on
--    (keeps past rows with sessions; rebuilds future/unfulfilled).
-- 4) Never update st_workout_sessions, st_set_logs, or snapshot columns.
