-- BIQ-0302 proposed. Do not apply until approved.
-- Read-only lift index. It does not update rows, does not list workouts, and does not rerun a backfill.
-- The app already lists lifts from identity columns when this function is absent.
-- DB, Dumbbell, and other aliases are folded in the app after this read. Empty equipment stays null.

create index if not exists st_set_logs_user_lift_identity_idx
  on public.st_set_logs (
    user_id,
    snapshot_catalog_exercise_id,
    snapshot_exercise_name,
    snapshot_equipment,
    snapshot_variant,
    log_date desc
  );

create or replace function public.st_lift_index()
returns table (
  catalog_exercise_id text,
  exercise_name text,
  equipment text,
  variant text,
  last_performed date
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    nullif(trim(snapshot_catalog_exercise_id::text), ''),
    coalesce(nullif(trim(snapshot_exercise_name), ''), 'Exercise'),
    nullif(trim(snapshot_equipment), ''),
    nullif(trim(snapshot_variant), ''),
    max(log_date) as last_performed
  from public.st_set_logs
  where user_id = auth.uid()
    and log_date is not null
  group by 1, 2, 3, 4
  order by max(log_date) desc, 2, 1, 3, 4;
$$;

revoke all on function public.st_lift_index() from public, anon;
grant execute on function public.st_lift_index() to authenticated;

comment on function public.st_lift_index() is
  'One row per stored exercise, equipment, and variant text for auth.uid(). The app folds aliases and keeps unspecified equipment separate. Security invoker, so set-log row security still applies.';
