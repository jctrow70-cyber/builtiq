-- BIQ-0263 Phase 3A preflight. Read-only. Run in the Supabase SQL Editor before
-- supabase/migrations/20261021_070_group_strength_shelf.sql.
-- A passing result returns one row, verdict = 'safe_to_apply', and raises a notice.
-- Any blocker raises an exception and does not change data.

drop table if exists biq0263_070_preflight;
create temp table biq0263_070_preflight as
with required_columns as (
  select * from (values
    ('st_programs', 'id'),
    ('st_programs', 'team_id'),
    ('st_programs', 'visibility'),
    ('st_programs', 'owner_user_id'),
    ('st_programs', 'name'),
    ('st_programs', 'status'),
    ('st_workouts', 'id'),
    ('st_workouts', 'program_id'),
    ('st_workouts', 'week'),
    ('st_workouts', 'day_order'),
    ('st_workouts', 'day_label'),
    ('st_workouts', 'workout_type'),
    ('st_workouts', 'week_status'),
    ('st_exercises', 'id'),
    ('st_exercises', 'workout_id'),
    ('st_exercises', 'sort_order'),
    ('st_exercises', 'name'),
    ('st_exercises', 'muscle_group'),
    ('st_exercises', 'notes'),
    ('st_exercises', 'section'),
    ('st_exercises', 'superset_group_id'),
    ('st_exercises', 'catalog_exercise_id'),
    ('st_exercises', 'equipment'),
    ('st_exercises', 'exercise_type'),
    ('st_exercises', 'superset_label'),
    ('st_exercises', 'superset_order'),
    ('st_exercises', 'program_role'),
    ('st_exercises', 'measurement_type'),
    ('st_exercises', 'laterality'),
    ('st_exercises', 'created_at'),
    ('st_planned_sets', 'id'),
    ('st_planned_sets', 'exercise_id'),
    ('st_planned_sets', 'sort_order'),
    ('st_planned_sets', 'set_number'),
    ('st_planned_sets', 'set_type'),
    ('st_planned_sets', 'target_weight'),
    ('st_planned_sets', 'target_reps'),
    ('st_planned_sets', 'target_rpe'),
    ('st_planned_sets', 'is_deleted'),
    ('st_planned_sets', 'target_rir'),
    ('st_planned_sets', 'rest_seconds'),
    ('st_planned_sets', 'rep_min'),
    ('st_planned_sets', 'rep_max'),
    ('st_set_logs', 'planned_set_id'),
    ('st_set_logs', 'exercise_id'),
    ('st_set_logs', 'user_id'),
    ('st_set_logs', 'log_date'),
    ('st_set_logs', 'completed'),
    ('st_set_logs', 'actual_weight'),
    ('st_set_logs', 'actual_reps'),
    ('st_set_logs', 'actual_duration'),
    ('st_set_logs', 'actual_distance'),
    ('st_group_activity_series', 'id'),
    ('st_group_activity_series', 'workout_id'),
    ('st_group_activity_series', 'recurrence'),
    ('st_group_activity_occurrences', 'id'),
    ('st_group_activity_occurrences', 'completed'),
    ('st_group_activity_occurrences', 'snapshotted'),
    ('st_group_activity_recipients', 'series_id'),
    ('st_group_activity_recipients', 'user_id'),
    ('st_training_enrollments', 'program_id'),
    ('st_training_program_segments', 'program_id'),
    ('st_training_expectations', 'program_id')
  ) as required(table_name, column_name)
),
missing_columns as (
  select r.table_name, r.column_name
  from required_columns r
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = r.table_name
      and c.column_name = r.column_name
  )
),
unfilled_required as (
  select c.table_name, c.column_name
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.is_nullable = 'NO'
    and c.column_default is null
    and coalesce(c.is_generated, 'NEVER') = 'NEVER'
    and (
      (c.table_name = 'st_programs' and c.column_name not in (
        'id', 'team_id', 'visibility', 'owner_user_id', 'name', 'status', 'program_use'
      ))
      or (c.table_name = 'st_workouts' and c.column_name not in (
        'id', 'program_id', 'week', 'day_order', 'day_label', 'workout_type', 'week_status'
      ))
      or (c.table_name = 'st_exercises' and c.column_name not in (
        'workout_id', 'sort_order', 'name', 'muscle_group', 'notes', 'section', 'superset_group_id',
        'catalog_exercise_id', 'equipment', 'exercise_type'
      ))
      or (c.table_name = 'st_planned_sets' and c.column_name not in (
        'exercise_id', 'sort_order', 'set_number', 'set_type', 'target_weight', 'target_reps',
        'target_rir', 'rest_seconds', 'is_deleted'
      ))
    )
),
list_fn as (
  select p.oid, p.proacl, p.prosecdef, p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'st_list_group_activities'
),
list_dependents as (
  select pg_describe_object(d.classid, d.objid, d.objsubid) as dependent, d.deptype
  from list_fn f
  join pg_depend d on d.refobjid = f.oid
  where d.deptype = 'n'
    and d.classid <> 'pg_proc'::regclass
),
function_report as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', p.proname,
    'arguments', pg_get_function_identity_arguments(p.oid),
    'result', pg_get_function_result(p.oid),
    'security_definer', p.prosecdef,
    'config', p.proconfig,
    'acl', coalesce(p.proacl::text, 'default public')
  ) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb) as functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'st_save_group_activity',
      'st_list_group_activities',
      'st_edit_group_activity_occurrence',
      'st_edit_group_activity_future',
      'st_edit_group_activity_series',
      'st_group_activity_freeze_completed',
      'st_group_activity_date_taken',
      'st_group_activity_rule_overlaps',
      'st_group_activity_assert_clear',
      'st_group_activity_require_change',
      'st_ensure_group_strength_shelf',
      'st_save_group_strength_workout',
      'st_user_can_read_group_strength_workout'
    )
),
blockers as (
  select reason from (
    select 'migration 070 objects are already present' as reason
    where exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'st_programs' and column_name = 'program_use'
    )
    or to_regprocedure('public.st_save_group_strength_workout(uuid,text,date,uuid[],text,text,boolean,text,smallint[],date,jsonb)') is not null
    union all
    select 'st_save_group_activity is not the Stage 2 14-argument function'
    where to_regprocedure('public.st_save_group_activity(uuid,text,text,date,uuid[],text,int,text,jsonb,uuid,uuid,boolean,text,smallint[],date)') is null
    union all
    select 'st_list_group_activities(uuid,date,date,uuid) is missing'
    where to_regprocedure('public.st_list_group_activities(uuid,date,date,uuid)') is null
    union all
    select 'st_list_group_activities has ' || count(*) || ' overloads'
    from list_fn
    having count(*) <> 1
    union all
    select 'st_list_group_activities has a dependent object: ' || dependent
    from list_dependents
    union all
    select 'authenticated cannot execute st_list_group_activities'
    where case
      when to_regprocedure('public.st_list_group_activities(uuid,date,date,uuid)') is null then false
      else not has_function_privilege(
        'authenticated',
        'public.st_list_group_activities(uuid,date,date,uuid)',
        'execute'
      )
    end
    union all
    select 'anon can execute st_list_group_activities'
    where case
      when to_regprocedure('public.st_list_group_activities(uuid,date,date,uuid)') is null then false
      else has_function_privilege(
        'anon',
        'public.st_list_group_activities(uuid,date,date,uuid)',
        'execute'
      )
    end
    union all
    select 'missing column ' || table_name || '.' || column_name
    from missing_columns
    union all
    select 'new workout insert would omit required ' || table_name || '.' || column_name
    from unfilled_required
    union all
    select 'row level security is off for ' || c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('st_programs', 'st_workouts', 'st_exercises', 'st_planned_sets')
      and not c.relrowsecurity
    union all
    select 'status check would reject a draft shelf'
    where exists (
      select 1 from pg_constraint
      where conname = 'st_programs_status_check'
        and pg_get_constraintdef(oid) not like '%draft%'
    )
    union all
    select 'week_status check would reject a template workout'
    where exists (
      select 1 from pg_constraint
      where conname = 'st_workouts_week_status_check'
        and pg_get_constraintdef(oid) not like '%template%'
    )
    union all
    select 'visibility check would reject group_shelf'
    where exists (
      select 1
      from pg_constraint
      where conrelid = 'public.st_programs'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%visibility%'
        and pg_get_constraintdef(oid) not ilike '%group_shelf%'
    )
  ) as found
)
select
  case when exists (select 1 from blockers) then 'blocked' else 'safe_to_apply' end as verdict,
  (select coalesce(jsonb_agg(reason order by reason), '[]'::jsonb) from blockers) as blockers,
  (select functions from function_report) as functions,
  (select coalesce(jsonb_agg(jsonb_build_object('dependent', dependent, 'deptype', deptype)), '[]'::jsonb) from list_dependents) as list_dependents,
  (select coalesce(jsonb_agg(table_name || '.' || column_name order by table_name, column_name), '[]'::jsonb) from missing_columns) as missing_columns,
  (select coalesce(jsonb_agg(table_name || '.' || column_name order by table_name, column_name), '[]'::jsonb) from unfilled_required) as unfilled_required,
  jsonb_build_object(
    'programs', (select count(*) from public.st_programs),
    'programs_null_name', (select count(*) from public.st_programs where name is null),
    'programs_null_owner', (select count(*) from public.st_programs where owner_user_id is null),
    'programs_null_status', (select count(*) from public.st_programs where status is null),
    'visibility_values', (select coalesce(jsonb_agg(distinct visibility), '[]'::jsonb) from public.st_programs),
    'status_values', (select coalesce(jsonb_agg(distinct status), '[]'::jsonb) from public.st_programs),
    'week_status_values', (select coalesce(jsonb_agg(distinct week_status), '[]'::jsonb) from public.st_workouts),
    'occurrences', (select count(*) from public.st_group_activity_occurrences),
    'recipients', (select count(*) from public.st_group_activity_recipients),
    'series', (select count(*) from public.st_group_activity_series)
  ) as data,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'rls', c.relrowsecurity,
      'forced', c.relforcerowsecurity
    ) order by c.relname), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'st_programs', 'st_workouts', 'st_exercises', 'st_planned_sets',
        'st_training_enrollments', 'st_training_program_segments', 'st_training_expectations',
        'st_group_activity_occurrences'
      )
  ) as rls,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', tablename,
      'policy', policyname,
      'command', cmd,
      'roles', roles
    ) order by tablename, policyname), '[]'::jsonb)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('st_programs', 'st_workouts', 'st_exercises', 'st_planned_sets')
  ) as policies,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', conname,
      'table', conrelid::regclass::text,
      'definition', pg_get_constraintdef(oid)
    ) order by conname), '[]'::jsonb)
    from pg_constraint
    where conname in (
      'st_programs_status_check',
      'st_programs_program_use_check',
      'st_workouts_week_status_check'
    )
    or (
      conrelid = 'public.st_programs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%visibility%'
    )
  ) as checks,
  current_setting('server_version') as server_version;

do $$
declare
  v_verdict text;
  v_blockers jsonb;
begin
  select verdict, blockers into v_verdict, v_blockers from biq0263_070_preflight;
  if v_verdict is distinct from 'safe_to_apply' then
    raise exception 'BIQ-0263 preflight blocked: %', v_blockers;
  end if;
  raise notice 'BIQ-0263 preflight passed';
end $$;

select * from biq0263_070_preflight;
