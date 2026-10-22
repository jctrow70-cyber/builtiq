-- BIQ-0263 Phase 3C preflight. Read-only. Run in the Supabase SQL Editor before
-- supabase/migrations/20261022_071_group_strength_logging.sql.
--
-- This script selects catalog and production rows. It creates one temporary
-- table in the SQL Editor session and does not insert, update, or delete
-- stored application data. Do not run migration 071 in the same query.
--
-- A passing result returns one row, verdict = 'safe_to_apply', and raises a notice.
-- Existing overlaps return verdict = 'reconcile' and do not raise.
-- A catalog incompatibility returns verdict = 'blocked' and raises an exception.

drop table if exists biq0263_071_preflight;
create temp table biq0263_071_preflight as
with required_functions as (
  select * from (values
    ('st_complete_group_activity_occurrence(uuid,uuid,date)', 'jsonb'),
    ('st_edit_group_strength_occurrence(uuid,uuid,date)', 'jsonb'),
    ('st_pin_group_strength_history(uuid,date)', 'void'),
    ('st_expectation_has_session(uuid)', 'boolean'),
    ('st_group_schedule_adherence(uuid,date,date,date)', 'table'),
    ('st_group_expectation_status(uuid,date,date,date,uuid)', 'table'),
    ('st_save_group_activity(uuid,text,text,date,uuid[],text,int,text,jsonb,uuid,uuid,boolean,text,smallint[],date)', 'jsonb'),
    ('st_save_group_strength_workout(uuid,text,date,uuid[],text,text,boolean,text,smallint[],date,jsonb)', 'jsonb'),
    ('st_group_activity_effective_workout(uuid,uuid)', 'uuid'),
    ('st_group_weekday_index(date)', 'integer'),
    ('st_group_strength_date_has_performance(uuid,uuid,date)', 'boolean'),
    ('st_group_activity_ensure_occurrence(uuid,uuid,date)', 'uuid'),
    ('st_group_activity_slot_open(public.st_group_activity_series,date)', 'boolean')
  ) as required(signature, result_kind)
),
absent_functions as (
  select * from (values
    ('st_group_extra_occupies_date(uuid,uuid,date)'),
    ('st_program_expectation_occupies_date(uuid,uuid,date)'),
    ('st_group_series_conflicts_with_program(uuid)'),
    ('st_reject_group_program_extra_overlap()'),
    ('st_guard_workout_session_context()'),
    ('st_user_can_log_group_strength_workout_date(uuid,date)'),
    ('st_planned_set_on_strength_shelf(uuid)'),
    ('st_exercise_on_strength_shelf(uuid)'),
    ('st_user_can_log_group_strength_set(uuid,date)')
  ) as absent(signature)
),
required_columns as (
  select * from (values
    ('st_programs', 'program_use'),
    ('st_group_activity_series', 'workout_id'),
    ('st_group_activity_series', 'start_date'),
    ('st_group_activity_series', 'recurrence'),
    ('st_group_activity_series', 'recurrence_weekdays'),
    ('st_group_activity_series', 'recurrence_until'),
    ('st_group_activity_series', 'ended_on'),
    ('st_group_activity_recipients', 'series_id'),
    ('st_group_activity_recipients', 'user_id'),
    ('st_group_activity_recipients', 'removed_on'),
    ('st_group_activity_occurrences', 'series_id'),
    ('st_group_activity_occurrences', 'user_id'),
    ('st_group_activity_occurrences', 'original_date'),
    ('st_group_activity_occurrences', 'occurrence_date'),
    ('st_group_activity_occurrences', 'workout_id'),
    ('st_group_activity_occurrences', 'status'),
    ('st_training_expectations', 'user_id'),
    ('st_training_expectations', 'workout_id'),
    ('st_training_expectations', 'scheduled_date'),
    ('st_training_expectations', 'excused'),
    ('st_workout_sessions', 'user_id'),
    ('st_workout_sessions', 'workout_id'),
    ('st_workout_sessions', 'log_date'),
    ('st_workout_sessions', 'status'),
    ('st_workout_sessions', 'expectation_id'),
    ('st_workout_sessions', 'source_key'),
    ('st_workout_sessions', 'scheduled_date'),
    ('st_exercise_sessions', 'user_id'),
    ('st_exercise_sessions', 'exercise_id'),
    ('st_exercise_sessions', 'log_date'),
    ('st_set_logs', 'planned_set_id'),
    ('st_set_logs', 'user_id'),
    ('st_set_logs', 'log_date'),
    ('st_set_logs', 'completed'),
    ('st_set_logs', 'actual_weight'),
    ('st_set_logs', 'actual_reps'),
    ('st_set_logs', 'actual_duration'),
    ('st_set_logs', 'actual_distance')
  ) as required(table_name, column_name)
),
missing_columns as (
  select r.table_name, r.column_name
  from required_columns r
  where to_regclass('public.' || r.table_name) is null
    or not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = r.table_name
        and c.column_name = r.column_name
    )
),
function_report as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'signature', required.signature,
    'present', to_regprocedure('public.' || required.signature) is not null,
    'result', case
      when to_regprocedure('public.' || required.signature) is null then null
      else pg_get_function_result(to_regprocedure('public.' || required.signature))
    end,
    'security_definer', case
      when to_regprocedure('public.' || required.signature) is null then null
      else (select p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.' || required.signature))
    end,
    'config', case
      when to_regprocedure('public.' || required.signature) is null then null
      else (select p.proconfig from pg_proc p where p.oid = to_regprocedure('public.' || required.signature))
    end,
    'authenticated_execute', case
      when to_regprocedure('public.' || required.signature) is null then null
      else has_function_privilege('authenticated', to_regprocedure('public.' || required.signature), 'execute')
    end,
    'overload_count', (
      select count(*)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = split_part(required.signature, '(', 1)
    )
  ) order by required.signature), '[]'::jsonb) as functions
  from required_functions required
),
replaced_dependents as (
  select pg_describe_object(d.classid, d.objid, d.objsubid) as dependent,
    p.proname as function_name
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_depend d on d.refobjid = p.oid
  where n.nspname = 'public'
    and p.proname in (
      'st_expectation_has_session',
      'st_group_schedule_adherence',
      'st_group_expectation_status',
      'st_pin_group_strength_history',
      'st_edit_group_strength_occurrence',
      'st_complete_group_activity_occurrence'
    )
    and d.deptype = 'n'
    and d.classid not in ('pg_proc'::regclass, 'pg_type'::regclass)
),
permissive_policies as (
  select * from (values
    ('st_set_logs', 'set_logs_insert', 'INSERT'),
    ('st_set_logs', 'set_logs_update', 'UPDATE'),
    ('st_workout_sessions', 'workout_sessions_own', 'ALL'),
    ('st_exercise_sessions', 'exercise_sessions_own', 'ALL')
  ) as required(table_name, policy_name, command_name)
),
expectation_hits as (
  select e.id as expectation_id, e.user_id, e.workout_id, e.scheduled_date,
    case
      when exists (
        select 1
        from public.st_group_activity_occurrences o
        join public.st_group_activity_series s on s.id = o.series_id
        join public.st_group_activity_recipients r
          on r.series_id = s.id and r.user_id = o.user_id
        where o.user_id = e.user_id
          and o.occurrence_date = e.scheduled_date
          and coalesce(o.status, 'scheduled') <> 'skipped'
          and coalesce(o.workout_id, s.workout_id) = e.workout_id
          and (r.removed_on is null or e.scheduled_date < r.removed_on)
          and (s.ended_on is null or e.scheduled_date <= s.ended_on)
      ) then 'stored_occurrence'
      else 'weekly_pattern'
    end as kind
  from public.st_training_expectations e
  where coalesce(e.excused, false) = false
    and e.user_id is not null
    and e.workout_id is not null
    and e.scheduled_date is not null
    and (
      exists (
        select 1
        from public.st_group_activity_occurrences o
        join public.st_group_activity_series s on s.id = o.series_id
        join public.st_group_activity_recipients r
          on r.series_id = s.id and r.user_id = o.user_id
        where o.user_id = e.user_id
          and o.occurrence_date = e.scheduled_date
          and coalesce(o.status, 'scheduled') <> 'skipped'
          and coalesce(o.workout_id, s.workout_id) = e.workout_id
          and (r.removed_on is null or e.scheduled_date < r.removed_on)
          and (s.ended_on is null or e.scheduled_date <= s.ended_on)
      )
      or exists (
        select 1
        from public.st_group_activity_series s
        join public.st_group_activity_recipients r
          on r.series_id = s.id and r.user_id = e.user_id
        where s.workout_id = e.workout_id
          and s.recurrence = 'weekly'
          and e.scheduled_date >= s.start_date
          and (s.ended_on is null or e.scheduled_date <= s.ended_on)
          and (s.recurrence_until is null or e.scheduled_date <= s.recurrence_until)
          and (r.removed_on is null or e.scheduled_date < r.removed_on)
          and (extract(dow from e.scheduled_date)::int + 6) % 7 = any (s.recurrence_weekdays)
          and not exists (
            select 1
            from public.st_group_activity_occurrences o
            where o.series_id = s.id
              and o.user_id = e.user_id
              and o.original_date = e.scheduled_date
          )
      )
    )
),
series_hits as (
  select s.id as series_id, r.user_id, e.scheduled_date,
    case when s.recurrence = 'weekly' then 'weekly' else 'one_off' end as kind
  from public.st_group_activity_series s
  join public.st_group_activity_recipients r on r.series_id = s.id
  join public.st_training_expectations e
    on e.user_id = r.user_id
   and e.workout_id = s.workout_id
   and coalesce(e.excused, false) = false
  where s.workout_id is not null
    and e.scheduled_date >= s.start_date
    and (s.ended_on is null or e.scheduled_date <= s.ended_on)
    and (s.recurrence_until is null or e.scheduled_date <= s.recurrence_until)
    and (r.removed_on is null or e.scheduled_date < r.removed_on)
    and (
      (s.recurrence <> 'weekly' and e.scheduled_date = s.start_date)
      or (
        s.recurrence = 'weekly'
        and (extract(dow from e.scheduled_date)::int + 6) % 7 = any (s.recurrence_weekdays)
        and not exists (
          select 1
          from public.st_group_activity_occurrences o
          where o.series_id = s.id
            and o.user_id = r.user_id
            and o.original_date = e.scheduled_date
            and (
              o.occurrence_date is distinct from e.scheduled_date
              or coalesce(o.status, 'scheduled') = 'skipped'
            )
        )
      )
    )
),
dual_sessions as (
  select s.id, s.user_id, s.workout_id, s.log_date
  from public.st_workout_sessions s
  where s.expectation_id is not null
    and coalesce(s.source_key, '') like 'group-activity:%'
),
activity_on_expectation as (
  select s.id, s.user_id, s.workout_id, s.log_date
  from public.st_workout_sessions s
  join public.st_training_expectations e
    on e.user_id = s.user_id
   and e.workout_id = s.workout_id
   and e.scheduled_date = s.log_date
   and coalesce(e.excused, false) = false
  where s.expectation_id is null
    and coalesce(s.source_key, '') like 'group-activity:%'
),
shelf_log_gaps as (
  select sl.id, sl.user_id, e.workout_id, sl.log_date
  from public.st_set_logs sl
  join public.st_planned_sets ps on ps.id = sl.planned_set_id
  join public.st_exercises e on e.id = ps.exercise_id
  join public.st_workouts w on w.id = e.workout_id
  join public.st_programs p on p.id = w.program_id
  where p.program_use = 'group_strength_shelf'
    and not (
      exists (
        select 1
        from public.st_group_activity_occurrences o
        join public.st_group_activity_series s on s.id = o.series_id
        join public.st_group_activity_recipients r
          on r.series_id = s.id and r.user_id = o.user_id
        where o.user_id = sl.user_id
          and o.occurrence_date = sl.log_date
          and coalesce(o.status, 'scheduled') <> 'skipped'
          and coalesce(o.workout_id, s.workout_id) = e.workout_id
          and (r.removed_on is null or sl.log_date < r.removed_on)
          and (s.ended_on is null or sl.log_date <= s.ended_on)
      )
      or exists (
        select 1
        from public.st_group_activity_series s
        join public.st_group_activity_recipients r
          on r.series_id = s.id and r.user_id = sl.user_id
        where s.workout_id = e.workout_id
          and s.recurrence = 'weekly'
          and sl.log_date >= s.start_date
          and (s.ended_on is null or sl.log_date <= s.ended_on)
          and (s.recurrence_until is null or sl.log_date <= s.recurrence_until)
          and (r.removed_on is null or sl.log_date < r.removed_on)
          and (extract(dow from sl.log_date)::int + 6) % 7 = any (s.recurrence_weekdays)
          and not exists (
            select 1
            from public.st_group_activity_occurrences o
            where o.series_id = s.id
              and o.user_id = sl.user_id
              and o.original_date = sl.log_date
          )
      )
    )
),
blockers as (
  select reason from (
    select 'migration 071 object is already present: ' || signature as reason
    from absent_functions
    where to_regprocedure('public.' || signature) is not null
    union all
    select 'migration 071 policy is already present: ' || policyname
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'st_set_logs_shelf_recipient_write',
        'st_set_logs_shelf_recipient_update',
        'st_workout_sessions_shelf_recipient_write',
        'st_workout_sessions_shelf_recipient_update',
        'st_exercise_sessions_shelf_recipient_write',
        'st_exercise_sessions_shelf_recipient_update'
      )
    union all
    select 'migration 071 trigger is already present: ' || tgname
    from pg_trigger
    where not tgisinternal
      and tgname in (
        'st_training_expectations_reject_group_extra',
        'st_group_activity_recipients_reject_program',
        'st_group_activity_series_reject_program',
        'st_group_activity_occurrences_reject_program',
        'st_workout_sessions_guard_context'
      )
    union all
    select 'required function is missing or has the wrong result: ' || signature
    from required_functions
    where to_regprocedure('public.' || signature) is null
      or (
        result_kind = 'table'
        and pg_get_function_result(to_regprocedure('public.' || signature)) not ilike 'TABLE(%'
      )
      or (
        result_kind <> 'table'
        and pg_get_function_result(to_regprocedure('public.' || signature)) is distinct from result_kind
      )
    union all
    select split_part(signature, '(', 1) || ' has ' || count(*) || ' overloads'
    from required_functions
    join pg_proc p on p.proname = split_part(signature, '(', 1)
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    group by signature
    having count(*) <> 1
    union all
    select 'adherence result is missing a column'
    where to_regprocedure('public.st_group_schedule_adherence(uuid,date,date,date)') is not null
      and pg_get_function_result(to_regprocedure('public.st_group_schedule_adherence(uuid,date,date,date)'))
        not ilike '%expected_past integer%completed_past integer%partial_past integer%skipped_past integer%missed integer%due_today integer%completed_today integer%future integer%completion_rate numeric%'
    union all
    select 'expectation status result is missing a column'
    where to_regprocedure('public.st_group_expectation_status(uuid,date,date,date,uuid)') is not null
      and pg_get_function_result(to_regprocedure('public.st_group_expectation_status(uuid,date,date,date,uuid)'))
        not ilike '%expectation_id uuid%user_id uuid%workout_id uuid%scheduled_date date%status text%'
    union all
    select 'missing column ' || table_name || '.' || column_name
    from missing_columns
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
    select 'row level security is off for ' || c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('st_set_logs', 'st_workout_sessions', 'st_exercise_sessions')
      and not c.relrowsecurity
    union all
    select 'program_use check would reject group_strength_shelf'
    where exists (
      select 1
      from pg_constraint
      where conname = 'st_programs_program_use_check'
        and pg_get_constraintdef(oid) not ilike '%group_strength_shelf%'
    )
  ) as found
),
reconcile as (
  select reason from (
    select 'unexcused expectation overlaps a live group extra: ' || expectation_id::text as reason
    from expectation_hits
    union all
    select 'series edit would conflict with a program expectation: ' || series_id::text || ' ' || scheduled_date::text
    from series_hits
    union all
    select 'session has both an expectation and a group-activity source: ' || id::text
    from dual_sessions
    union all
    select 'group-activity session occupies an expectation date: ' || id::text
    from activity_on_expectation
    union all
    select 'shelf set log is outside the recipient occupation: ' || id::text
    from shelf_log_gaps
  ) as found
)
select
  case
    when exists (select 1 from blockers) then 'blocked'
    when exists (select 1 from reconcile) then 'reconcile'
    else 'safe_to_apply'
  end as verdict,
  (select coalesce(jsonb_agg(reason order by reason), '[]'::jsonb) from blockers) as blockers,
  (select coalesce(jsonb_agg(reason order by reason), '[]'::jsonb) from reconcile) as reconcile,
  (select functions from function_report) as functions,
  (select coalesce(jsonb_agg(jsonb_build_object('function', function_name, 'dependent', dependent)), '[]'::jsonb) from replaced_dependents) as replaced_dependents,
  (select coalesce(jsonb_agg(table_name || '.' || column_name order by table_name, column_name), '[]'::jsonb) from missing_columns) as missing_columns,
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
        'st_set_logs', 'st_workout_sessions', 'st_exercise_sessions',
        'st_training_expectations', 'st_group_activity_series',
        'st_group_activity_recipients', 'st_group_activity_occurrences'
      )
  ) as rls,
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
    select coalesce(jsonb_agg(tgname order by tgname), '[]'::jsonb)
    from pg_trigger
    where not tgisinternal
      and tgrelid in (
        'public.st_training_expectations'::regclass,
        'public.st_group_activity_series'::regclass,
        'public.st_group_activity_recipients'::regclass,
        'public.st_group_activity_occurrences'::regclass,
        'public.st_workout_sessions'::regclass
      )
  ) as triggers,
  jsonb_build_object(
    'programs', (select count(*) from public.st_programs),
    'shelves', (select count(*) from public.st_programs where program_use = 'group_strength_shelf'),
    'series', (select count(*) from public.st_group_activity_series),
    'series_with_workout', (select count(*) from public.st_group_activity_series where workout_id is not null),
    'recipients', (select count(*) from public.st_group_activity_recipients),
    'occurrences', (select count(*) from public.st_group_activity_occurrences),
    'expectations', (select count(*) from public.st_training_expectations),
    'excused_expectations', (select count(*) from public.st_training_expectations where excused),
    'sessions', (select count(*) from public.st_workout_sessions),
    'group_activity_sessions', (select count(*) from public.st_workout_sessions where coalesce(source_key, '') like 'group-activity:%'),
    'expectation_extra_collisions', (select count(*) from expectation_hits),
    'series_pattern_collisions', (select count(*) from series_hits),
    'dual_link_sessions', (select count(*) from dual_sessions),
    'activity_sessions_on_expectation_dates', (select count(*) from activity_on_expectation),
    'shelf_logs_outside_occupation', (select count(*) from shelf_log_gaps)
  ) as data,
  current_setting('server_version') as server_version;

do $$
declare
  v_verdict text;
  v_blockers jsonb;
begin
  select verdict, blockers into v_verdict, v_blockers from biq0263_071_preflight;
  if v_verdict = 'blocked' then
    raise exception 'BIQ-0263 migration 071 preflight blocked: %', v_blockers;
  elsif v_verdict = 'reconcile' then
    raise notice 'BIQ-0263 migration 071 preflight needs reconciliation before apply';
  else
    raise notice 'BIQ-0263 migration 071 preflight passed';
  end if;
end $$;

select * from biq0263_071_preflight;
