-- BIQ-0263 Phase 3A post-check. Read-only. Run in the Supabase SQL Editor after
-- migration 070 is present. It does not change data.
-- A passing result returns one row and raises a notice. Any failure raises.

drop table if exists biq0263_070_postcheck;
create temp table biq0263_070_postcheck as
with list_fn as (
  select p.oid, p.proacl, p.prosecdef, p.proconfig, pg_get_function_result(p.oid) as result
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'st_list_group_activities'
),
list_dependents as (
  select pg_describe_object(d.classid, d.objid, d.objsubid) as dependent
  from list_fn f
  join pg_depend d on d.refobjid = f.oid
  where d.deptype = 'n'
    and d.classid not in ('pg_proc'::regclass, 'pg_type'::regclass)
),
definer_functions as (
  select * from (values
    ('st_group_activity_date_taken(uuid,uuid,uuid,date,uuid[])'),
    ('st_group_activity_rule_overlaps(uuid,uuid,uuid,date,date,smallint[],uuid[],uuid[])'),
    ('st_group_activity_assert_clear(uuid[])'),
    ('st_save_group_activity(uuid,text,text,date,uuid[],text,int,text,jsonb,uuid,uuid,boolean,text,smallint[],date)'),
    ('st_group_strength_date_has_performance(uuid,uuid,date)'),
    ('st_edit_group_activity_occurrence(uuid,uuid,date,date,text,text,int,text,jsonb,text[])'),
    ('st_edit_group_activity_future(uuid,date,text,text,int,text,jsonb,smallint[],date)'),
    ('st_list_group_activities(uuid,date,date,uuid)'),
    ('st_group_strength_workout_has_performance(uuid)'),
    ('st_user_can_read_group_strength_workout(uuid)'),
    ('st_reject_group_strength_shelf_program()'),
    ('st_ensure_group_strength_shelf(uuid)'),
    ('st_clone_group_strength_workout(uuid)'),
    ('st_pin_group_strength_history(uuid,date)'),
    ('st_save_group_strength_workout(uuid,text,date,uuid[],text,text,boolean,text,smallint[],date,jsonb)'),
    ('st_edit_group_strength_occurrence(uuid,uuid,date)'),
    ('st_edit_group_strength_future(uuid,date)'),
    ('st_edit_group_strength_series(uuid)'),
    ('st_remove_group_activity_recipient(uuid,uuid,date)')
  ) as required(signature)
),
internal_functions as (
  select * from (values
    ('st_group_activity_effective_workout(uuid,uuid)'),
    ('st_group_strength_date_has_performance(uuid,uuid,date)'),
    ('st_group_strength_workout_has_performance(uuid)'),
    ('st_reject_group_strength_shelf_program()'),
    ('st_ensure_group_strength_shelf(uuid)'),
    ('st_clone_group_strength_workout(uuid)'),
    ('st_pin_group_strength_history(uuid,date)')
  ) as internal(signature)
),
public_functions as (
  select * from (values
    ('st_list_group_activities(uuid,date,date,uuid)'),
    ('st_save_group_activity(uuid,text,text,date,uuid[],text,int,text,jsonb,uuid,uuid,boolean,text,smallint[],date)'),
    ('st_save_group_strength_workout(uuid,text,date,uuid[],text,text,boolean,text,smallint[],date,jsonb)'),
    ('st_edit_group_strength_occurrence(uuid,uuid,date)'),
    ('st_edit_group_strength_future(uuid,date)'),
    ('st_edit_group_strength_series(uuid)'),
    ('st_remove_group_activity_recipient(uuid,uuid,date)'),
    ('st_user_can_read_group_strength_workout(uuid)')
  ) as public_fn(signature)
),
failures as (
  select reason from (
    select 'program_use column is missing' as reason
    where not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'st_programs' and column_name = 'program_use'
    )
    union all
    select 'occurrence workout_id column is missing'
    where not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'st_group_activity_occurrences' and column_name = 'workout_id'
    )
    union all
    select 'recipient removed_on column is missing'
    where not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'st_group_activity_recipients' and column_name = 'removed_on'
    )
    union all
    select 'program_use check is missing'
    where not exists (select 1 from pg_constraint where conname = 'st_programs_program_use_check')
    union all
    select 'one-shelf index is missing'
    where not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'st_programs_one_group_strength_shelf')
    union all
    select 'program_use has an unexpected value'
    where exists (
      select 1 from public.st_programs
      where program_use not in ('training', 'group_strength_shelf')
    )
    union all
    select 'a group has more than one strength shelf'
    where exists (
      select 1 from public.st_programs
      where program_use = 'group_strength_shelf'
      group by team_id
      having count(*) > 1
    )
    union all
    select 'a shelf is enrolled or expected'
    where exists (
      select 1 from public.st_training_enrollments e
      join public.st_programs p on p.id = e.program_id
      where p.program_use = 'group_strength_shelf'
    )
    or exists (
      select 1 from public.st_training_expectations e
      join public.st_programs p on p.id = e.program_id
      where p.program_use = 'group_strength_shelf'
    )
    or exists (
      select 1 from public.st_training_program_segments s
      join public.st_programs p on p.id = s.program_id
      where p.program_use = 'group_strength_shelf'
    )
    union all
    select 'list function is missing or duplicated'
    where (select count(*) from list_fn) <> 1
    union all
    select 'list result no longer includes workout_id'
    where not exists (select 1 from list_fn where result ilike '%workout_id%')
    union all
    select 'list function has a dependent object: ' || dependent
    from list_dependents
    union all
    select 'definer function missing search_path=public: ' || signature
    from definer_functions
    where to_regprocedure('public.' || signature) is null
      or not exists (
        select 1
        from pg_proc p
        where p.oid = to_regprocedure('public.' || signature)
          and p.prosecdef
          and exists (
            select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
            where cfg = 'search_path=public'
          )
      )
    union all
    select 'authenticated cannot execute ' || signature
    from public_functions
    where to_regprocedure('public.' || signature) is not null
      and not has_function_privilege('authenticated', to_regprocedure('public.' || signature), 'execute')
    union all
    select 'anon can execute ' || signature
    from public_functions
    where to_regprocedure('public.' || signature) is not null
      and has_function_privilege('anon', to_regprocedure('public.' || signature), 'execute')
    union all
    select 'authenticated can execute internal ' || signature
    from internal_functions
    where to_regprocedure('public.' || signature) is not null
      and has_function_privilege('authenticated', to_regprocedure('public.' || signature), 'execute')
    union all
    select 'anon can execute internal ' || signature
    from internal_functions
    where to_regprocedure('public.' || signature) is not null
      and has_function_privilege('anon', to_regprocedure('public.' || signature), 'execute')
    union all
    select 'shelf select policy is missing'
    where not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and policyname in (
          'st_programs_select_group_strength_shelf',
          'st_workouts_select_group_strength_shelf',
          'st_exercises_select_group_strength_shelf',
          'st_planned_sets_select_group_strength_shelf'
        )
      having count(*) = 4
    )
    union all
    select 'shelf rejection trigger is missing'
    where (
      select count(*) from pg_trigger
      where not tgisinternal
        and tgname in (
          'st_training_enrollments_reject_strength_shelf',
          'st_training_program_segments_reject_strength_shelf',
          'st_training_expectations_reject_strength_shelf'
        )
    ) <> 3
  ) as found
)
select
  case when exists (select 1 from failures) then 'failed' else 'passed' end as verdict,
  (select coalesce(jsonb_agg(reason order by reason), '[]'::jsonb) from failures) as failures,
  (select count(*) from public.st_programs) as programs,
  (select count(*) from public.st_programs where program_use = 'group_strength_shelf') as shelves,
  (select count(*) from public.st_group_activity_series) as series,
  (select count(*) from list_dependents) as list_dependents;

do $$
declare
  v_verdict text;
  v_failures jsonb;
begin
  select verdict, failures into v_verdict, v_failures from biq0263_070_postcheck;
  if v_verdict is distinct from 'passed' then
    raise exception 'BIQ-0263 post-check failed: %', v_failures;
  end if;
  raise notice 'BIQ-0263 post-check passed';
end $$;

select * from biq0263_070_postcheck;
