-- Disposable database checks for BIQ-0263 migration 069. Not production.
create temp table st_test_ids (
  name text primary key,
  id uuid,
  extra jsonb
);

do $$
declare
  v_row public.st_group_activity_occurrences;
begin
  select * into v_row
  from public.st_group_activity_occurrences
  where id = '50000000-0000-4000-8000-000000000001';
  if v_row.original_date <> '2026-01-06' or v_row.occurrence_date <> '2026-01-06' then
    raise exception 'FAIL backfill original date %', v_row.original_date;
  end if;
  if not v_row.snapshotted
    or v_row.activity_type <> 'cardio'
    or v_row.title <> 'Historical ride'
    or v_row.duration_minutes is not null
    or v_row.notes is not null
    or v_row.details <> '{"pace":"easy"}'::jsonb
  then
    raise exception 'FAIL historical snapshot was invented or dropped %', to_jsonb(v_row);
  end if;
  if public.st_group_weekday_index('2026-10-06') <> 1
    or public.st_group_weekday_index('2026-05-05') <> 1
    or public.st_group_weekday_index('2026-08-04') <> 1
    or public.st_group_weekday_index('2026-09-01') <> 1
    or public.st_group_weekday_index('2026-09-02') <> 2
    or public.st_group_weekday_index('2026-11-03') <> 1
    or public.st_group_weekday_index('2026-11-04') <> 2
    or public.st_group_weekday_index('2026-12-01') <> 1
    or public.st_group_weekday_index('2026-03-31') <> 1
    or public.st_group_weekday_index('2026-12-29') <> 1
    or public.st_group_weekday_index('2027-01-06') <> 2
    or public.st_group_weekday_index('2026-04-01') <> 2
  then
    raise exception 'FAIL weekday calendar assumptions';
  end if;
end $$;

do $$
begin
  begin
    insert into public.st_group_activity_series (
      team_id, activity_type, title, start_date, recurrence, recurrence_weekdays
    ) values (
      '10000000-0000-4000-8000-000000000001', 'cardio', 'Bad days', '2026-10-06', 'weekly', '{1,1}'
    );
    raise exception 'FAIL duplicate weekdays were accepted';
  exception
    when check_violation then null;
    when others then
      if sqlerrm ilike 'FAIL%' then raise; end if;
      if sqlerrm not ilike '%weekdays%' and sqlerrm not ilike '%check%' then
        raise exception 'FAIL weekday constraint error %', sqlerrm;
      end if;
  end;
  begin
    insert into public.st_group_activity_occurrences (
      series_id, user_id, original_date, occurrence_date, completed, snapshotted
    ) values (
      '40000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000003',
      '2026-01-08', '2026-01-08', true, false
    );
    raise exception 'FAIL completed insert without snapshot';
  exception
    when others then
      if sqlerrm ilike 'FAIL%' then raise; end if;
      if sqlerrm not ilike '%missing its snapshot%' then
        raise exception 'FAIL snapshot insert error %', sqlerrm;
      end if;
  end;
end $$;

do $$
declare
  v_first jsonb;
  v_second jsonb;
  v_series public.st_group_activity_series;
  v_occurrence public.st_group_activity_occurrences;
  v_count int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  v_first := public.st_save_group_activity(
    p_team_id => '10000000-0000-4000-8000-000000000001',
    p_activity_type => 'strength',
    p_title => 'Stage 1 strength',
    p_occurrence_date => '2026-02-03',
    p_recipient_user_ids => array['00000000-0000-4000-8000-000000000003']::uuid[],
    p_request_key => 'stage1-once',
    p_duration_minutes => 30,
    p_notes => 'keep',
    p_details => '{"from":"stage1"}'::jsonb,
    p_workout_id => '20000000-0000-4000-8000-000000000001',
    p_program_id => '30000000-0000-4000-8000-000000000001',
    p_required => false
  );
  v_second := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001',
    'strength',
    'Stage 1 strength',
    '2026-02-03',
    array['00000000-0000-4000-8000-000000000003']::uuid[],
    'stage1-once',
    30,
    'keep',
    '{"from":"stage1"}'::jsonb,
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    false
  );
  if v_first <> v_second or jsonb_array_length(v_first->'occurrence_ids') <> 1 then
    raise exception 'FAIL stage 1 idempotent shape % %', v_first, v_second;
  end if;
  select * into v_series from public.st_group_activity_series where id = (v_first->>'series_id')::uuid;
  select * into v_occurrence from public.st_group_activity_occurrences where series_id = v_series.id;
  if v_series.recurrence <> 'none' or cardinality(v_series.recurrence_weekdays) <> 0 or v_series.recurrence_until is not null then
    raise exception 'FAIL stage 1 recurrence defaults %', to_jsonb(v_series);
  end if;
  if v_occurrence.original_date <> v_occurrence.occurrence_date or v_occurrence.occurrence_date <> '2026-02-03' then
    raise exception 'FAIL stage 1 occurrence identity';
  end if;
  select count(*) into v_count from public.st_group_activity_series where team_id = '10000000-0000-4000-8000-000000000001' and title = 'Stage 1 strength';
  if v_count <> 1 then
    raise exception 'FAIL stage 1 replay inserted % series', v_count;
  end if;
  insert into st_test_ids values ('stage1', v_series.id, v_first);
end $$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  begin
    perform public.st_save_group_activity(
      '10000000-0000-4000-8000-000000000001', 'strength', 'Duplicate', '2026-02-03',
      array['00000000-0000-4000-8000-000000000003']::uuid[], 'stage1-dup',
      null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000001', null, false
    );
    raise exception 'FAIL stored duplicate was accepted';
  exception
    when others then
      if sqlerrm ilike 'FAIL%' then raise; end if;
      if sqlerrm not ilike '%already on this date%' then
        raise exception 'FAIL duplicate error %', sqlerrm;
      end if;
  end;
end $$;

do $$
declare
  v_save int;
begin
  select count(*) into v_save
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'st_save_group_activity';
  if v_save <> 1 then
    raise exception 'FAIL overload count %', v_save;
  end if;
  if pg_get_function_identity_arguments('public.st_save_group_activity(uuid,text,text,date,uuid[],text,int,text,jsonb,uuid,uuid,boolean,text,smallint[],date)'::regprocedure)
    not like '%p_recurrence text, p_recurrence_weekdays smallint[], p_recurrence_until date'
  then
    raise exception 'FAIL save signature';
  end if;
end $$;

do $$
declare
  v_name text;
  v_definer boolean;
  v_config text[];
  v_public text[] := array[
    'st_save_group_activity',
    'st_list_group_activities',
    'st_complete_group_activity_occurrence',
    'st_edit_group_activity_occurrence',
    'st_edit_group_activity_future',
    'st_edit_group_activity_series',
    'st_skip_group_activity_occurrence',
    'st_restore_group_activity_occurrence',
    'st_end_group_activity_series',
    'st_user_can_change_group_activity',
    'st_user_can_read_group_activity'
  ];
  v_internal text[] := array[
    'st_group_weekdays_valid',
    'st_group_weekday_index',
    'st_group_activity_slot_open',
    'st_group_activity_lock',
    'st_group_activity_date_taken',
    'st_group_activity_rule_overlaps',
    'st_group_activity_assert_clear',
    'st_group_activity_ensure_occurrence',
    'st_group_activity_require_change',
    'st_group_activity_assert_outside',
    'st_group_activity_freeze_completed'
  ];
  v_proc regprocedure;
begin
  for v_name, v_definer, v_config in
    select p.proname, p.prosecdef, p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'st_group_activity%'
        or p.proname like 'st_group_weekday%'
        or p.proname in ('st_save_group_activity', 'st_list_group_activities', 'st_complete_group_activity_occurrence', 'st_skip_group_activity_occurrence', 'st_restore_group_activity_occurrence', 'st_end_group_activity_series', 'st_user_can_change_group_activity', 'st_edit_group_activity_occurrence', 'st_edit_group_activity_future', 'st_edit_group_activity_series')
      )
  loop
    if v_definer and (v_config is null or not ('search_path=public' = any (v_config))) then
      raise exception 'FAIL % is security definer without search_path', v_name;
    end if;
    if v_name = any (v_public) and not v_definer and v_name <> 'st_user_can_read_group_activity' then
      raise exception 'FAIL % should be security definer', v_name;
    end if;
  end loop;
  foreach v_name in array v_public loop
    select p.oid::regprocedure into v_proc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name
    order by p.oid
    limit 1;
    if not has_function_privilege('authenticated', v_proc, 'execute') then
      raise exception 'FAIL authenticated cannot execute %', v_name;
    end if;
    if has_function_privilege('anon', v_proc, 'execute') or has_function_privilege('public', v_proc, 'execute') then
      raise exception 'FAIL anon or public can execute %', v_name;
    end if;
  end loop;
  foreach v_name in array v_internal loop
    for v_proc in
      select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name
    loop
      if has_function_privilege('authenticated', v_proc, 'execute')
        or has_function_privilege('anon', v_proc, 'execute')
      then
        raise exception 'FAIL internal function is granted: %', v_proc;
      end if;
    end loop;
  end loop;
end $$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  begin
    perform public.st_save_group_activity(
      '10000000-0000-4000-8000-000000000001', 'cardio', 'Other', '2026-02-04',
      array['00000000-0000-4000-8000-000000000002']::uuid[], 'member-other',
      null, null, '{}'::jsonb, null, null, false
    );
    raise exception 'FAIL member assigned to someone else';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%not authorized%' then raise exception 'FAIL member-other %', sqlerrm; end if;
  end;
  begin
    perform public.st_save_group_activity(
      '10000000-0000-4000-8000-000000000001', 'cardio', 'Required', '2026-02-04',
      array['00000000-0000-4000-8000-000000000003']::uuid[], 'member-required',
      null, null, '{}'::jsonb, null, null, true
    );
    raise exception 'FAIL member marked required';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%required%' then raise exception 'FAIL member-required %', sqlerrm; end if;
  end;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
  begin
    perform public.st_save_group_activity(
      '10000000-0000-4000-8000-000000000001', 'cardio', 'Outside', '2026-02-04',
      array['00000000-0000-4000-8000-000000000005']::uuid[], 'outsider',
      null, null, '{}'::jsonb, null, null, false
    );
    raise exception 'FAIL outsider saved';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%not authorized%' then raise exception 'FAIL outsider %', sqlerrm; end if;
  end;
  begin
    perform public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2026-02-01', '2026-02-07', null);
    raise exception 'FAIL outsider listed';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%not authorized%' then raise exception 'FAIL outsider list %', sqlerrm; end if;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2026-02-01', '2026-02-07', null);
    raise exception 'FAIL anonymous listed';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%not authenticated%' then raise exception 'FAIL anonymous %', sqlerrm; end if;
  end;
end $$;

do $$
declare
  v_owner jsonb;
  v_manager jsonb;
  v_assigner jsonb;
  v_own jsonb;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  v_owner := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'cardio', 'Owner extra', '2026-02-10',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'role-owner',
    null, null, '{}'::jsonb, null, null, true
  );
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  v_manager := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'mobility', 'Manager extra', '2026-02-11',
    array['00000000-0000-4000-8000-000000000002']::uuid[], 'role-manager',
    null, null, '{}'::jsonb, null, null, false
  );
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  v_own := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'rest', 'My rest', '2026-02-12',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'role-member',
    null, null, '{}'::jsonb, null, null, false
  );
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
  v_assigner := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000002', 'strength', 'Assigned', '2026-02-10',
    array['00000000-0000-4000-8000-000000000001']::uuid[], 'role-assigner',
    null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000002', true
  );
  if v_owner->>'series_id' is null or v_manager->>'series_id' is null
    or v_own->>'series_id' is null or v_assigner->>'series_id' is null
  then
    raise exception 'FAIL role saves % % % %', v_owner, v_manager, v_own, v_assigner;
  end if;
  insert into st_test_ids values
    ('role-owner', (v_owner->>'series_id')::uuid, v_owner),
    ('role-manager', (v_manager->>'series_id')::uuid, v_manager),
    ('role-member', (v_own->>'series_id')::uuid, v_own),
    ('role-assigner', (v_assigner->>'series_id')::uuid, v_assigner);
end $$;

do $$
declare
  v_visible int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  begin
    perform public.st_skip_group_activity_occurrence(
      (select id from st_test_ids where name = 'role-owner'),
      '00000000-0000-4000-8000-000000000003',
      '2026-02-10'
    );
    raise exception 'FAIL member skipped a required extra';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%not authorized%' then raise exception 'FAIL required skip %', sqlerrm; end if;
  end;
  perform public.st_complete_group_activity_occurrence(
    (select id from st_test_ids where name = 'role-owner'),
    '00000000-0000-4000-8000-000000000003',
    '2026-02-10'
  );
  select count(*) into v_visible
  from public.st_list_group_activities(
    '10000000-0000-4000-8000-000000000001', '2026-02-09', '2026-02-15', null
  )
  where series_id = (select id from st_test_ids where name = 'role-member');
  if v_visible <> 1 then
    raise exception 'FAIL member could not read own extra';
  end if;
  select count(*) into v_visible
  from public.st_list_group_activities(
    '10000000-0000-4000-8000-000000000001', '2026-02-09', '2026-02-15', null
  )
  where series_id = (select id from st_test_ids where name = 'role-manager');
  if v_visible <> 0 then
    raise exception 'FAIL member read another optional extra';
  end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  select count(*) into v_visible
  from public.st_list_group_activities(
    '10000000-0000-4000-8000-000000000001', '2026-02-09', '2026-02-15', null
  )
  where series_id = (select id from st_test_ids where name = 'role-member');
  if v_visible <> 1 then
    raise exception 'FAIL manager could not read a member extra';
  end if;
end $$;

do $$
declare
  v_result jsonb;
  v_count int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  v_result := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'strength', 'Tuesday plan', '2026-10-06',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'weekly-main',
    40, 'series note', '{"block":"easy"}'::jsonb,
    '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', false,
    'weekly', array[1]::smallint[], null
  );
  if jsonb_array_length(v_result->'occurrence_ids') <> 0 then
    raise exception 'FAIL weekly save stored occurrences %', v_result;
  end if;
  select count(*) into v_count
  from public.st_list_group_activities(
    '10000000-0000-4000-8000-000000000001', '2026-10-05', '2026-10-18',
    '00000000-0000-4000-8000-000000000003'
  )
  where series_id = (v_result->>'series_id')::uuid and virtual;
  if v_count <> 2 then
    raise exception 'FAIL weekly virtual count %', v_count;
  end if;
  begin
    perform public.st_list_group_activities(
      '10000000-0000-4000-8000-000000000001', '2026-10-05', '2026-10-05'::date + 112, null
    );
    raise exception 'FAIL 17 week range was accepted';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%16 weeks%' then raise exception 'FAIL range error %', sqlerrm; end if;
  end;
  perform public.st_list_group_activities(
    '10000000-0000-4000-8000-000000000001', '2026-10-05', '2026-10-05'::date + 111, null
  );
  insert into st_test_ids values ('weekly', (v_result->>'series_id')::uuid, v_result);
end $$;

do $$
declare
  v_moved jsonb;
  v_on_tuesday int;
  v_on_wednesday int;
  v_span int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  v_moved := public.st_edit_group_activity_occurrence(
    (select id from st_test_ids where name = 'weekly'),
    '00000000-0000-4000-8000-000000000003',
    '2026-10-13',
    '2026-10-14',
    null, null, null, null, null, '{}'
  );
  if (v_moved->>'original_date')::date <> '2026-10-13' or (v_moved->>'occurrence_date')::date <> '2026-10-14' then
    raise exception 'FAIL move identity %', v_moved;
  end if;
  select count(*) into v_on_tuesday
  from public.st_list_group_activities(
    '10000000-0000-4000-8000-000000000001', '2026-10-13', '2026-10-13',
    '00000000-0000-4000-8000-000000000003'
  )
  where series_id = (select id from st_test_ids where name = 'weekly');
  select count(*) into v_on_wednesday
  from public.st_list_group_activities(
    '10000000-0000-4000-8000-000000000001', '2026-10-14', '2026-10-14',
    '00000000-0000-4000-8000-000000000003'
  )
  where series_id = (select id from st_test_ids where name = 'weekly');
  select count(*) into v_span
  from public.st_list_group_activities(
    '10000000-0000-4000-8000-000000000001', '2026-10-12', '2026-10-18',
    '00000000-0000-4000-8000-000000000003'
  )
  where series_id = (select id from st_test_ids where name = 'weekly')
    and original_date = '2026-10-13';
  if v_on_tuesday <> 0 or v_on_wednesday <> 1 or v_span <> 1 then
    raise exception 'FAIL same-week move counts tue % wed % span %', v_on_tuesday, v_on_wednesday, v_span;
  end if;
end $$;

do $$
declare
  v_result jsonb;
  v_before int;
  v_after int;
  v_span int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  v_result := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'strength', 'Year ride', '2026-12-29',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'year-move',
    null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000006', null, false,
    'weekly', array[1]::smallint[], '2027-01-12'
  );
  perform public.st_edit_group_activity_occurrence(
    (v_result->>'series_id')::uuid,
    '00000000-0000-4000-8000-000000000003',
    '2026-12-29', '2027-01-06',
    null, null, null, null, null, '{}'
  );
  select count(*) into v_before
  from public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2026-12-29', '2026-12-29', '00000000-0000-4000-8000-000000000003')
  where series_id = (v_result->>'series_id')::uuid;
  select count(*) into v_after
  from public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2027-01-06', '2027-01-06', '00000000-0000-4000-8000-000000000003')
  where series_id = (v_result->>'series_id')::uuid and original_date = '2026-12-29' and occurrence_date = '2027-01-06' and not virtual;
  select count(*) into v_span
  from public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2026-12-28', '2027-01-10', '00000000-0000-4000-8000-000000000003')
  where series_id = (v_result->>'series_id')::uuid and original_date = '2026-12-29';
  if v_before <> 0 or v_after <> 1 or v_span <> 1 then
    raise exception 'FAIL cross-year move before % after % span %', v_before, v_after, v_span;
  end if;
  select count(*) into v_before
  from public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2026-12-28', '2027-01-03', '00000000-0000-4000-8000-000000000003')
  where series_id = (v_result->>'series_id')::uuid and original_date = '2026-12-29';
  select count(*) into v_after
  from public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2027-01-04', '2027-01-10', '00000000-0000-4000-8000-000000000003')
  where series_id = (v_result->>'series_id')::uuid and original_date = '2026-12-29';
  if v_before <> 0 or v_after <> 1 then
    raise exception 'FAIL cross-week query old week % new week %', v_before, v_after;
  end if;

  v_result := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'strength', 'Month ride', '2026-03-31',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'month-move',
    null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000005', null, false,
    'weekly', array[1]::smallint[], '2026-04-14'
  );
  perform public.st_edit_group_activity_occurrence(
    (v_result->>'series_id')::uuid, '00000000-0000-4000-8000-000000000003',
    '2026-03-31', '2026-04-01', null, null, null, null, null, '{}'
  );
  select count(*) into v_before
  from public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2026-03-31', '2026-03-31', '00000000-0000-4000-8000-000000000003')
  where series_id = (v_result->>'series_id')::uuid;
  select count(*) into v_after
  from public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2026-04-01', '2026-04-01', '00000000-0000-4000-8000-000000000003')
  where series_id = (v_result->>'series_id')::uuid and original_date = '2026-03-31';
  if v_before <> 0 or v_after <> 1 then
    raise exception 'FAIL month move march % april %', v_before, v_after;
  end if;
end $$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  begin
    perform public.st_edit_group_activity_occurrence(
      (select id from st_test_ids where name = 'weekly'),
      '00000000-0000-4000-8000-000000000003',
      '2026-10-20', '2026-10-27',
      null, null, null, null, null, '{}'
    );
    raise exception 'FAIL move onto a live weekday';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%more than one activity%' and sqlerrm not ilike '%already has this activity%' then
      raise exception 'FAIL live collision %', sqlerrm;
    end if;
  end;
  begin
    perform public.st_save_group_activity(
      '10000000-0000-4000-8000-000000000001', 'strength', 'Virtual clash', '2026-10-06',
      array['00000000-0000-4000-8000-000000000003']::uuid[], 'virtual-clash',
      null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000002', null, false
    );
    raise exception 'FAIL virtual duplicate was accepted';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%already on this date%' then raise exception 'FAIL virtual duplicate %', sqlerrm; end if;
  end;
  perform public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'strength', 'Vacated Tuesday', '2026-10-13',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'vacated-tuesday',
    null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000002', null, false
  );
  begin
    perform public.st_save_group_activity(
      '10000000-0000-4000-8000-000000000001', 'strength', 'Wednesday clash', '2026-10-14',
      array['00000000-0000-4000-8000-000000000003']::uuid[], 'wednesday-clash',
      null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000002', null, false
    );
    raise exception 'FAIL moved display duplicate was accepted';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%already on this date%' then raise exception 'FAIL moved duplicate %', sqlerrm; end if;
  end;
end $$;

do $$
declare
  v_early jsonb;
  v_late jsonb;
  v_only_gap jsonb;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  v_early := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'strength', 'Overlap early', '2026-05-05',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'overlap-early',
    null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000004', null, false,
    'weekly', array[1]::smallint[], '2026-05-19'
  );
  v_late := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'strength', 'Overlap late', '2026-05-26',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'overlap-late',
    null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000004', null, false,
    'weekly', array[1]::smallint[], '2026-06-09'
  );
  if v_early->>'series_id' is null or v_late->>'series_id' is null then
    raise exception 'FAIL non-overlapping weekly series';
  end if;
  begin
    perform public.st_save_group_activity(
      '10000000-0000-4000-8000-000000000001', 'strength', 'Overlap mid', '2026-05-12',
      array['00000000-0000-4000-8000-000000000003']::uuid[], 'overlap-mid',
      null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000004', null, false,
      'weekly', array[1]::smallint[], '2026-05-12'
    );
    raise exception 'FAIL overlapping weekly series';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%already on this date%' then raise exception 'FAIL overlap %', sqlerrm; end if;
  end;
  perform public.st_edit_group_activity_occurrence(
    (v_early->>'series_id')::uuid, '00000000-0000-4000-8000-000000000003',
    '2026-05-12', '2026-05-13', null, null, null, null, null, '{}'
  );
  v_only_gap := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'strength', 'Suppressed Tuesday', '2026-05-12',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'overlap-gap',
    null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000004', null, false,
    'weekly', array[1]::smallint[], '2026-05-12'
  );
  if v_only_gap->>'series_id' is null then
    raise exception 'FAIL suppressed slot should be available';
  end if;
end $$;

do $$
declare
  v_result jsonb;
  v_row public.st_group_activity_occurrences;
  v_listed_title text;
  v_listed_duration int;
  v_listed_details jsonb;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  perform public.st_edit_group_activity_series(
    '40000000-0000-4000-8000-000000000001',
    'sport', 'Renamed ride', 45, 'new note', '{"pace":"hard"}'::jsonb,
    '{}'::smallint[], null, false
  );
  select * into v_row from public.st_group_activity_occurrences where id = '50000000-0000-4000-8000-000000000001';
  if v_row.title <> 'Historical ride' or v_row.activity_type <> 'cardio'
    or v_row.duration_minutes is not null or v_row.notes is not null
    or v_row.details <> '{"pace":"easy"}'::jsonb or not v_row.snapshotted
  then
    raise exception 'FAIL series edit rewrote historical snapshot %', to_jsonb(v_row);
  end if;
  select title, duration_minutes, details into v_listed_title, v_listed_duration, v_listed_details
  from public.st_list_group_activities(
    '10000000-0000-4000-8000-000000000001', '2026-01-06', '2026-01-06',
    '00000000-0000-4000-8000-000000000003'
  )
  where occurrence_id = '50000000-0000-4000-8000-000000000001';
  if v_listed_title <> 'Historical ride' or v_listed_duration is not null or v_listed_details <> '{"pace":"easy"}'::jsonb then
    raise exception 'FAIL list leaked the live series % % %', v_listed_title, v_listed_duration, v_listed_details;
  end if;
  begin
    update public.st_group_activity_occurrences set title = 'Invented' where id = '50000000-0000-4000-8000-000000000001';
    raise exception 'FAIL completed title update';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%cannot be changed%' then raise exception 'FAIL freeze %', sqlerrm; end if;
  end;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  v_result := public.st_complete_group_activity_occurrence(
    (select id from st_test_ids where name = 'weekly'),
    '00000000-0000-4000-8000-000000000003',
    '2026-10-06'
  );
  if (v_result->>'title') <> 'Tuesday plan'
    or (v_result->>'activity_type') <> 'strength'
    or (v_result->>'duration_minutes')::int <> 40
    or (v_result->>'notes') <> 'series note'
    or (v_result->'details') <> '{"block":"easy"}'::jsonb
    or (v_result->>'already_completed')::boolean
  then
    raise exception 'FAIL completion snapshot %', v_result;
  end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  perform public.st_edit_group_activity_series(
    (select id from st_test_ids where name = 'weekly'),
    'cardio', 'Changed plan', 15, 'later note', '{"block":"hard"}'::jsonb,
    array[1]::smallint[], null, false
  );
  select * into v_row
  from public.st_group_activity_occurrences
  where series_id = (select id from st_test_ids where name = 'weekly')
    and original_date = '2026-10-06';
  if v_row.title <> 'Tuesday plan' or v_row.activity_type <> 'strength' or v_row.duration_minutes <> 40 then
    raise exception 'FAIL later series edit changed the completion %', to_jsonb(v_row);
  end if;
  v_result := public.st_complete_group_activity_occurrence(
    (select id from st_test_ids where name = 'weekly'),
    '00000000-0000-4000-8000-000000000003',
    '2026-10-06'
  );
  if (v_result->>'title') <> 'Tuesday plan' or not (v_result->>'already_completed')::boolean then
    raise exception 'FAIL repeat completion rewrote history %', v_result;
  end if;
  begin
    perform public.st_skip_group_activity_occurrence(
      (select id from st_test_ids where name = 'weekly'),
      '00000000-0000-4000-8000-000000000003',
      '2026-10-06'
    );
    raise exception 'FAIL completed row was skipped';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%cannot be changed%' then raise exception 'FAIL skip completed %', sqlerrm; end if;
  end;
end $$;

do $$
declare
  v_result jsonb;
  v_new uuid;
  v_old uuid;
  v_before public.st_group_activity_occurrences;
  v_after public.st_group_activity_occurrences;
  v_skip public.st_group_activity_occurrences;
  v_move public.st_group_activity_occurrences;
  v_note public.st_group_activity_occurrences;
  v_count int;
  v_required boolean;
  v_recipients int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  v_result := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'strength', 'Split plan', '2026-11-03',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'split-plan',
    25, 'base', '{"kind":"old"}'::jsonb,
    '20000000-0000-4000-8000-000000000007', null, true,
    'weekly', array[1, 2]::smallint[], '2026-11-25'
  );
  v_old := (v_result->>'series_id')::uuid;
  perform public.st_complete_group_activity_occurrence(v_old, '00000000-0000-4000-8000-000000000003', '2026-11-03');
  perform public.st_skip_group_activity_occurrence(v_old, '00000000-0000-4000-8000-000000000003', '2026-11-04');
  perform public.st_edit_group_activity_occurrence(
    v_old, '00000000-0000-4000-8000-000000000003', '2026-11-10', '2026-11-12',
    null, null, null, 'moved note', null, array['notes']
  );
  perform public.st_edit_group_activity_occurrence(
    v_old, '00000000-0000-4000-8000-000000000003', '2026-11-11', '2026-11-11',
    null, 'One day', null, null, '{"kind":"day"}'::jsonb, array['title', 'details']
  );
  perform public.st_skip_group_activity_occurrence(v_old, '00000000-0000-4000-8000-000000000003', '2026-11-18');
  perform public.st_edit_group_activity_occurrence(
    v_old, '00000000-0000-4000-8000-000000000003', '2026-11-24', '2026-11-26',
    null, null, null, 'future move', null, array['notes']
  );
  perform public.st_complete_group_activity_occurrence(v_old, '00000000-0000-4000-8000-000000000003', '2026-11-17');
  v_result := public.st_edit_group_activity_future(
    v_old, '2026-11-17', 'mobility', 'Future plan', 50, 'future', '{"kind":"new"}'::jsonb,
    array[1, 2]::smallint[], '2026-11-25'
  );
  v_new := (v_result->>'new_series_id')::uuid;
  select * into v_before from public.st_group_activity_occurrences
  where original_date = '2026-11-03' and user_id = '00000000-0000-4000-8000-000000000003';
  select * into v_after from public.st_group_activity_occurrences
  where original_date = '2026-11-17' and user_id = '00000000-0000-4000-8000-000000000003';
  select * into v_skip from public.st_group_activity_occurrences
  where original_date = '2026-11-18' and user_id = '00000000-0000-4000-8000-000000000003';
  select * into v_move from public.st_group_activity_occurrences
  where original_date = '2026-11-24' and user_id = '00000000-0000-4000-8000-000000000003';
  select * into v_note from public.st_group_activity_occurrences
  where original_date = '2026-11-11' and user_id = '00000000-0000-4000-8000-000000000003';
  if v_before.series_id <> v_old or v_before.title <> 'Split plan' or not v_before.completed then
    raise exception 'FAIL completed date before split moved %', to_jsonb(v_before);
  end if;
  if v_after.series_id <> v_new or v_after.title <> 'Split plan' or v_after.activity_type <> 'strength' or not v_after.completed then
    raise exception 'FAIL completed split date lost its snapshot %', to_jsonb(v_after);
  end if;
  if v_skip.series_id <> v_new or v_skip.status <> 'skipped' or v_note.series_id <> v_old or v_note.title <> 'One day' then
    raise exception 'FAIL split did not keep skip or earlier override';
  end if;
  if v_move.series_id <> v_new or v_move.occurrence_date <> '2026-11-26' or v_move.notes <> 'future move' or v_move.original_date <> '2026-11-24' then
    raise exception 'FAIL future move was discarded %', to_jsonb(v_move);
  end if;
  select required into v_required from public.st_group_activity_series where id = v_new;
  select count(*) into v_recipients
  from public.st_group_activity_recipients a
  join public.st_group_activity_recipients b on a.user_id = b.user_id
  where a.series_id = v_old and b.series_id = v_new;
  if not v_required or v_recipients <> 1 then
    raise exception 'FAIL split dropped required or recipients';
  end if;
  select ended_on = '2026-11-16' into v_required from public.st_group_activity_series where id = v_old;
  if not v_required then
    raise exception 'FAIL old series did not end the day before the split';
  end if;
  select count(*) into v_count
  from public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2026-11-17', '2026-11-17', '00000000-0000-4000-8000-000000000003')
  where series_id in (v_old, v_new)
    and original_date = '2026-11-17';
  if v_count <> 1 then
    raise exception 'FAIL split regenerated the completed date %', v_count;
  end if;
  insert into st_test_ids values ('split-old', v_old, null), ('split-new', v_new, null);
end $$;

do $$
declare
  v_result jsonb;
  v_series uuid;
  v_children int;
  v_ended date;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  v_result := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'cardio', 'Rollback plan', '2026-12-01',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'split-rollback',
    null, null, '{}'::jsonb, null, null, false,
    'weekly', array[1]::smallint[], '2026-12-22'
  );
  v_series := (v_result->>'series_id')::uuid;
  perform public.st_edit_group_activity_occurrence(
    v_series, '00000000-0000-4000-8000-000000000003', '2026-12-01', '2026-12-09',
    null, null, null, null, null, '{}'
  );
  begin
    perform public.st_edit_group_activity_future(
      v_series, '2026-12-08', 'cardio', 'Should roll back', null, null, '{}'::jsonb,
      array[1, 2]::smallint[], '2026-12-22'
    );
    raise exception 'FAIL unsafe split committed';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%more than one activity%' then
      raise exception 'FAIL split rollback error %', sqlerrm;
    end if;
  end;
  select count(*) into v_children from public.st_group_activity_series where split_from_series_id = v_series;
  select ended_on into v_ended from public.st_group_activity_series where id = v_series;
  if v_children <> 0 or v_ended is not null then
    raise exception 'FAIL split rollback left children % ended %', v_children, v_ended;
  end if;
end $$;

do $$
declare
  v_result jsonb;
  v_series uuid;
  v_done public.st_group_activity_occurrences;
  v_skip public.st_group_activity_occurrences;
  v_note public.st_group_activity_occurrences;
  v_virtuals int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  v_result := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'cardio', 'Whole series', '2026-08-04',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'whole-series',
    20, 'old', '{"scope":"all"}'::jsonb, null, null, false,
    'weekly', array[1, 2]::smallint[], null
  );
  v_series := (v_result->>'series_id')::uuid;
  perform public.st_complete_group_activity_occurrence(v_series, '00000000-0000-4000-8000-000000000003', '2026-08-04');
  perform public.st_skip_group_activity_occurrence(v_series, '00000000-0000-4000-8000-000000000003', '2026-08-11');
  perform public.st_edit_group_activity_occurrence(
    v_series, '00000000-0000-4000-8000-000000000003', '2026-08-05', '2026-08-05',
    null, null, null, 'keep this note', null, array['notes']
  );
  perform public.st_edit_group_activity_series(
    v_series, 'mobility', 'Whole series renamed', 35, 'new series note', '{"scope":"edited"}'::jsonb,
    array[2]::smallint[], '2026-08-19', true
  );
  select * into v_done from public.st_group_activity_occurrences where series_id = v_series and original_date = '2026-08-04';
  select * into v_skip from public.st_group_activity_occurrences where series_id = v_series and original_date = '2026-08-11';
  select * into v_note from public.st_group_activity_occurrences where series_id = v_series and original_date = '2026-08-05';
  if v_done.title <> 'Whole series' or v_done.activity_type <> 'cardio' or v_done.duration_minutes <> 20 then
    raise exception 'FAIL entire-series edit changed the snapshot %', to_jsonb(v_done);
  end if;
  if v_skip.status <> 'skipped' or not v_skip.detached then
    raise exception 'FAIL removed weekday skip was not preserved %', to_jsonb(v_skip);
  end if;
  if v_note.notes <> 'keep this note' or v_note.detached then
    raise exception 'FAIL future override was reset %', to_jsonb(v_note);
  end if;
  select count(*) into v_virtuals
  from public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2026-08-03', '2026-08-23', '00000000-0000-4000-8000-000000000003')
  where series_id = v_series and virtual and original_date > '2026-08-19';
  if v_virtuals <> 0 then
    raise exception 'FAIL series end still generated % dates', v_virtuals;
  end if;
  select count(*) into v_virtuals
  from public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2026-08-11', '2026-08-11', '00000000-0000-4000-8000-000000000003')
  where series_id = v_series;
  if v_virtuals <> 1 then
    raise exception 'FAIL detached skip disappeared or was duplicated %', v_virtuals;
  end if;
end $$;

do $$
declare
  v_result jsonb;
  v_series uuid;
  v_restore jsonb;
  v_row public.st_group_activity_occurrences;
  v_end jsonb;
  v_future int;
  v_history int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  v_result := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'recovery', 'Skip me', '2026-09-01',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'skip-me',
    null, null, '{}'::jsonb, null, null, false,
    'weekly', array[1]::smallint[], null
  );
  v_series := (v_result->>'series_id')::uuid;
  perform public.st_skip_group_activity_occurrence(v_series, '00000000-0000-4000-8000-000000000003', '2026-09-01');
  v_restore := public.st_restore_group_activity_occurrence(v_series, '00000000-0000-4000-8000-000000000003', '2026-09-01');
  if not (v_restore->>'restored')::boolean or (v_restore->>'status') <> 'scheduled' then
    raise exception 'FAIL restore %', v_restore;
  end if;
  perform public.st_skip_group_activity_occurrence(v_series, '00000000-0000-4000-8000-000000000003', '2026-09-08');
  perform public.st_edit_group_activity_series(
    v_series, 'recovery', 'Skip me', null, null, '{}'::jsonb,
    array[2]::smallint[], null, false
  );
  v_restore := public.st_restore_group_activity_occurrence(v_series, '00000000-0000-4000-8000-000000000003', '2026-09-08');
  select * into v_row from public.st_group_activity_occurrences where series_id = v_series and original_date = '2026-09-08';
  if (v_restore->>'restored')::boolean or v_row.status <> 'skipped' or not v_row.detached then
    raise exception 'FAIL dead weekday restore % %', v_restore, to_jsonb(v_row);
  end if;
  perform public.st_complete_group_activity_occurrence(v_series, '00000000-0000-4000-8000-000000000003', '2026-09-02');
  v_end := public.st_end_group_activity_series(v_series, '2026-09-09');
  if (v_end->>'deleted')::boolean then
    raise exception 'FAIL series with history was deleted';
  end if;
  select count(*) into v_future
  from public.st_list_group_activities('10000000-0000-4000-8000-000000000001', '2026-09-14', '2026-09-20', '00000000-0000-4000-8000-000000000003')
  where series_id = v_series and virtual;
  select count(*) into v_history
  from public.st_group_activity_occurrences
  where series_id = v_series and (completed or status = 'skipped');
  if v_future <> 0 or v_history < 2 then
    raise exception 'FAIL end series future % history %', v_future, v_history;
  end if;

  v_result := public.st_save_group_activity(
    '10000000-0000-4000-8000-000000000001', 'stretching', 'Empty end', '2026-09-22',
    array['00000000-0000-4000-8000-000000000003']::uuid[], 'empty-end',
    null, null, '{}'::jsonb, null, null, false,
    'weekly', array[1]::smallint[], null
  );
  v_end := public.st_end_group_activity_series((v_result->>'series_id')::uuid, '2026-09-21');
  if not (v_end->>'deleted')::boolean then
    raise exception 'FAIL empty series was kept';
  end if;
end $$;

do $$
declare
  v_name text;
  v_count int;
begin
  foreach v_name in array array[
    'st_training_expectations',
    'st_training_enrollments',
    'st_workout_sessions',
    'st_set_logs',
    'st_user_calendar_activities'
  ] loop
    execute format('select count(*) from public.%I', v_name) into v_count;
    if v_count <> 1 then
      raise exception 'FAIL % count is %', v_name, v_count;
    end if;
  end loop;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.st_group_activity_occurrences;
  if v_count <> 0 then
    raise exception 'FAIL outsider RLS saw % rows', v_count;
  end if;
  begin
    insert into public.st_group_activity_occurrences (series_id, user_id, original_date, occurrence_date)
    values (
      '40000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000005',
      '2026-01-09', '2026-01-09'
    );
    raise exception 'FAIL authenticated insert was allowed';
  exception when insufficient_privilege then null;
  when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
  end;
end $$;
rollback;

select 'EXECUTED biq0263 stage 2 database checks passed' as result;
