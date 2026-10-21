-- Stage 1 rows inserted before migration 069, on the disposable database only.
-- Completed history has no per-occurrence overrides. The series values are the only record.

insert into public.st_group_activity_series (
  id, team_id, created_by, activity_type, title, duration_minutes, notes, details, start_date, recurrence, required
) values (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'cardio',
  'Historical ride',
  null,
  null,
  '{"pace":"easy"}'::jsonb,
  '2026-01-06',
  'none',
  false
);

insert into public.st_group_activity_recipients (series_id, user_id) values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003');

insert into public.st_group_activity_occurrences (
  id, series_id, user_id, occurrence_date, completed
) values (
  '50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  '2026-01-06',
  true
);
