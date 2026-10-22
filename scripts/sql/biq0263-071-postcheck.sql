-- BIQ-0263 Phase 3C post-check. Read-only. Run in the Supabase SQL Editor after
-- supabase/migrations/20261022_071_group_strength_logging.sql has been applied.
-- Do not run this before migration 071. It does not change stored data.
-- A passing result returns one row, verdict = 'passed', and raises a notice.
-- Any installation failure raises an exception.
-- Existing expectation/extra overlaps stay visible in data and do not fail this check.
-- Migration 071 does not delete or rewrite those rows.

drop table if exists biq0263_071_postcheck;
create temp table biq0263_071_postcheck as
with definer_functions as (
  select * from (values
    ('st_group_extra_occupies_date(uuid,uuid,date)'),
    ('st_program_expectation_occupies_date(uuid,uuid,date)'),
    ('st_group_series_conflicts_with_program(uuid)'),
    ('st_reject_group_program_extra_overlap()'),
    ('st_expectation_has_session(uuid)'),
    ('st_group_schedule_adherence(uuid,date,date,date)'),
    ('st_group_expectation_status(uuid,date,date,date,uuid)'),
    ('st_user_can_log_group_strength_workout_date(uuid,date)'),
    ('st_planned_set_on_strength_shelf(uuid)'),
    ('st_exercise_on_strength_shelf(uuid)'),
    ('st_user_can_log_group_strength_set(uuid,date)'),
    ('st_pin_group_strength_history(uuid,date)'),
    ('st_edit_group_strength_occurrence(uuid,uuid,date)'),
    ('st_complete_group_activity_occurrence(uuid,uuid,date)')
  ) as required(signature)
),
authenticated_execute as (
  select * from (values
    ('st_reject_group_program_extra_overlap()'),
    ('st_guard_workout_session_context()'),
    ('st_expectation_has_session(uuid)'),
    ('st_group_schedule_adherence(uuid,date,date,date)'),
    ('st_group_expectation_status(uuid,date,date,date,uuid)'),
    ('st_user_can_log_group_strength_workout_date(uuid,date)'),
    ('st_planned_set_on_strength_shelf(uuid)'),
    ('st_exercise_on_strength_shelf(uuid)'),
    ('st_user_can_log_group_strength_set(uuid,date)'),
    ('st_edit_group_strength_occurrence(uuid,uuid,date)'),
    ('st_complete_group_activity_occurrence(uuid,uuid,date)')
  ) as required(signature)
),
authenticated_revoked as (
  select * from (values
    ('st_group_extra_occupies_date(uuid,uuid,date)'),
    ('st_program_expectation_occupies_date(uuid,uuid,date)'),
    ('st_group_series_conflicts_with_program(uuid)'),
    ('st_pin_group_strength_history(uuid,date)')
  ) as required(signature)
),
restrictive_policies as (
  select * from (values
    ('st_set_logs', 'st_set_logs_shelf_recipient_write', 'INSERT'),
    ('st_set_logs', 'st_set_logs_shelf_recipient_update', 'UPDATE'),
    ('st_workout_sessions', 'st_workout_sessions_shelf_recipient_write', 'INSERT'),
    ('st_workout_sessions', 'st_workout_sessions_shelf_recipient_update', 'UPDATE'),
    ('st_exercise_sessions', 'st_exercise_sessions_shelf_recipient_write', 'INSERT'),
    ('st_exercise_sessions', 'st_exercise_sessions_shelf_recipient_update', 'UPDATE')
  ) as required(table_name, policy_name, command_name)
),
permissive_policies as (
  select * from (values
    ('st_set_logs', 'set_logs_insert', 'INSERT'),
    ('st_set_logs', 'set_logs_update', 'UPDATE'),
    ('st_workout_sessions', 'workout_sessions_own', 'ALL'),
    ('st_exercise_sessions', 'exercise_sessions_own', 'ALL')
  ) as required(table_name, policy_name, command_name)
),
expected_triggers as (
  select * from (values
    ('st_training_expectations_reject_group_extra', '%BEFORE INSERT OR UPDATE OF user_id, workout_id, scheduled_date, excused%'),
    ('st_group_activity_recipients_reject_program', '%AFTER INSERT ON public.st_group_activity_recipients%'),
    ('st_group_activity_series_reject_program', '%AFTER UPDATE OF workout_id, start_date, recurrence, recurrence_weekdays, recurrence_until, ended_on%'),
    ('st_group_activity_occurrences_reject_program', '%BEFORE INSERT OR UPDATE OF occurrence_date, workout_id, status, user_id%'),
    ('st_workout_sessions_guard_context', '%BEFORE UPDATE ON public.st_workout_sessions%')
  ) as required(trigger_name, definition_like)
),
failures as (
  select reason from (
    select 'definer function missing search_path=public: ' || signature as reason
    from definer_functions
    where to_regprocedure('public.' || signature) is null
      or not exists (
        select 1
        from pg_proc p
        where p.oid = to_regprocedure('public.' || signature)
          and p.prosecdef
          and exists (
            select 1
            from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
            where cfg = 'search_path=public'
          )
      )
    union all
    select 'session guard must stay invoker security with search_path=public'
    where to_regprocedure('public.st_guard_workout_session_context()') is null
      or not exists (
        select 1
        from pg_proc p
        where p.oid = to_regprocedure('public.st_guard_workout_session_context()')
          and not p.prosecdef
          and exists (
            select 1
            from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
            where cfg = 'search_path=public'
          )
      )
    union all
    select 'authenticated cannot execute ' || signature
    from authenticated_execute
    where to_regprocedure('public.' || signature) is null
      or not has_function_privilege('authenticated', to_regprocedure('public.' || signature), 'execute')
    union all
    select 'authenticated can execute internal function ' || signature
    from authenticated_revoked
    where to_regprocedure('public.' || signature) is not null
      and has_function_privilege('authenticated', to_regprocedure('public.' || signature), 'execute')
    union all
    select 'anon can execute ' || signature
    from (
      select signature from authenticated_execute
      union
      select signature from authenticated_revoked
    ) as all_functions
    where to_regprocedure('public.' || signature) is not null
      and has_function_privilege('anon', to_regprocedure('public.' || signature), 'execute')
    union all
    select 'completion signature changed'
    where to_regprocedure('public.st_complete_group_activity_occurrence(uuid,uuid,date)') is null
      or pg_get_function_result(to_regprocedure('public.st_complete_group_activity_occurrence(uuid,uuid,date)'))
        is distinct from 'jsonb'
    union all
    select 'fulfillment function does not exclude group-activity sessions: ' || p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'st_expectation_has_session',
        'st_group_schedule_adherence',
        'st_group_expectation_status'
      )
      and pg_get_functiondef(p.oid) not like '%not like ''group-activity:%''%'
    union all
    select 'restrictive policy missing or not restrictive: ' || table_name || '.' || policy_name
    from restrictive_policies required
    where not exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = required.table_name
        and p.policyname = required.policy_name
        and p.permissive = 'RESTRICTIVE'
        and p.cmd = required.command_name
        and p.roles::text like '%authenticated%'
    )
    union all
    select 'restrictive select policy is present: ' || policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('st_set_logs', 'st_workout_sessions', 'st_exercise_sessions')
      and permissive = 'RESTRICTIVE'
      and cmd = 'SELECT'
    union all
    select 'permissive policy is missing: ' || table_name || '.' || policy_name
    from permissive_policies required
    where not exists (
      select 1
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = required.table_name
        and p.policyname = required.policy_name
        and p.permissive = 'PERMISSIVE'
        and (p.cmd = required.command_name or p.cmd = 'ALL')
    )
    union all
    select 'trigger is missing or has the wrong definition: ' || trigger_name
    from expected_triggers required
    where not exists (
      select 1
      from pg_trigger t
      where t.tgname = required.trigger_name
        and not t.tgisinternal
        and pg_get_triggerdef(t.oid) ilike required.definition_like
        and (
          (
            required.trigger_name <> 'st_workout_sessions_guard_context'
            and pg_get_triggerdef(t.oid) ilike '%st_reject_group_program_extra_overlap%'
          )
          or (
            required.trigger_name = 'st_workout_sessions_guard_context'
            and pg_get_triggerdef(t.oid) ilike '%st_guard_workout_session_context%'
          )
        )
    )
    union all
    select 'row level security is off for ' || c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('st_set_logs', 'st_workout_sessions', 'st_exercise_sessions')
      and not c.relrowsecurity
  ) as found
)
select
  case when exists (select 1 from failures) then 'failed' else 'passed' end as verdict,
  (select coalesce(jsonb_agg(distinct reason order by reason), '[]'::jsonb) from failures) as failures,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'signature', signature,
      'security_definer', p.prosecdef,
      'config', p.proconfig,
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'execute'),
      'anon_execute', has_function_privilege('anon', p.oid, 'execute')
    ) order by signature), '[]'::jsonb)
    from (
      select signature from definer_functions
      union
      select 'st_guard_workout_session_context()'
    ) as listed
    join pg_proc p on p.oid = to_regprocedure('public.' || listed.signature)
  ) as functions,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', tablename,
      'policy', policyname,
      'permissive', permissive,
      'command', cmd,
      'roles', roles
    ) order by tablename, policyname), '[]'::jsonb)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('st_set_logs', 'st_workout_sessions', 'st_exercise_sessions')
  ) as policies,
  (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', tgname,
      'definition', pg_get_triggerdef(oid)
    ) order by tgname), '[]'::jsonb)
    from pg_trigger
    where not tgisinternal
      and tgname in (
        'st_training_expectations_reject_group_extra',
        'st_group_activity_recipients_reject_program',
        'st_group_activity_series_reject_program',
        'st_group_activity_occurrences_reject_program',
        'st_workout_sessions_guard_context'
      )
  ) as triggers,
  jsonb_build_object(
    'shelves', (select count(*) from public.st_programs where program_use = 'group_strength_shelf'),
    'expectations', (select count(*) from public.st_training_expectations),
    'group_activity_sessions', (select count(*) from public.st_workout_sessions where coalesce(source_key, '') like 'group-activity:%'),
    'dual_link_sessions', (
      select count(*)
      from public.st_workout_sessions
      where expectation_id is not null
        and coalesce(source_key, '') like 'group-activity:%'
    )
  ) as data;

do $$
declare
  v_verdict text;
  v_failures jsonb;
begin
  select verdict, failures into v_verdict, v_failures from biq0263_071_postcheck;
  if v_verdict is distinct from 'passed' then
    raise exception 'BIQ-0263 migration 071 post-check failed: %', v_failures;
  end if;
  raise notice 'BIQ-0263 migration 071 post-check passed';
end $$;

select * from biq0263_071_postcheck;
