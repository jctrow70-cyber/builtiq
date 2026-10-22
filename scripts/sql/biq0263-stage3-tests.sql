-- Disposable checks for BIQ-0263 migration 070. Not production.

do $$
declare
  v_saved jsonb;
  v_series uuid;
  v_workout uuid;
  v_program uuid;
  v_other uuid;
  v_clone uuid;
  v_owner_clone uuid;
  v_monday date := '2026-10-19';
  v_next date := '2026-10-26';
  v_owner uuid := '00000000-0000-4000-8000-000000000001';
  v_member uuid := '00000000-0000-4000-8000-000000000003';
  v_outsider uuid := '00000000-0000-4000-8000-000000000005';
  v_team uuid := '10000000-0000-4000-8000-000000000001';
  v_count int;
  v_old_reps text;
  v_new_reps text;
  v_listed uuid;
  v_expectations int;
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  begin
    perform public.st_save_group_activity(
      v_team, 'strength', 'No workout', v_monday, array[v_owner], 'stage3-empty',
      null, null, '{}'::jsonb, null, null, false, 'none', '{}', null
    );
    raise exception 'FAIL strength without a workout was accepted';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%custom group workout is not available yet%' then
      raise exception 'FAIL strength guard %', sqlerrm;
    end if;
  end;

  v_saved := public.st_save_group_strength_workout(
    v_team, 'Shelf press', v_monday, array[v_owner, v_member], 'stage3-shelf',
    'Keep the back flat', false, 'weekly', array[0]::smallint[], null,
    jsonb_build_array(jsonb_build_object(
      'name', 'Bench press',
      'equipment', 'Barbell',
      'catalog_exercise_id', '90000000-0000-4000-8000-000000000001',
      'sort_order', 0,
      'sets', jsonb_build_array(
        jsonb_build_object('set_type', 'warmup', 'set_number', 1, 'target_reps', '8', 'target_weight', '45'),
        jsonb_build_object('set_type', 'working', 'set_number', 2, 'target_reps', '5', 'target_weight', '135', 'target_rir', 2, 'rest_seconds', 180)
      )
    ))
  );
  v_series := (v_saved ->> 'series_id')::uuid;
  v_workout := (v_saved ->> 'workout_id')::uuid;
  v_program := (v_saved ->> 'program_id')::uuid;

  if (select program_use from public.st_programs where id = v_program) <> 'group_strength_shelf'
    or (select visibility from public.st_programs where id = v_program) <> 'group_shelf'
  then
    raise exception 'FAIL shelf identity';
  end if;
  if (select count(*) from public.st_programs where team_id = v_team and program_use = 'group_strength_shelf') <> 1 then
    raise exception 'FAIL more than one shelf';
  end if;
  if (select equipment from public.st_exercises where workout_id = v_workout) <> 'Barbell' then
    raise exception 'FAIL equipment was not stored';
  end if;
  if (select catalog_exercise_id::text from public.st_exercises where workout_id = v_workout) <> '90000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL catalog id was not stored';
  end if;

  v_expectations := (select count(*) from public.st_training_expectations);
  perform public.st_complete_group_activity_occurrence(v_series, v_member, v_monday);
  if (select count(*) from public.st_training_expectations) <> v_expectations then
    raise exception 'FAIL completion inserted an expectation';
  end if;
  if (select count(*) from public.st_group_activity_occurrences where series_id = v_series and completed) <> 1 then
    raise exception 'FAIL completion updated more than one member';
  end if;
  if (select user_id from public.st_group_activity_occurrences where series_id = v_series and completed) <> v_member then
    raise exception 'FAIL the wrong member was completed';
  end if;

  insert into public.st_set_logs (planned_set_id, user_id, log_date, actual_reps, actual_weight, completed, snapshot_equipment, snapshot_catalog_exercise_id)
  select ps.id, v_member, v_monday, '5', '135', true, 'Barbell', '90000000-0000-4000-8000-000000000001'
  from public.st_planned_sets ps
  join public.st_exercises e on e.id = ps.exercise_id
  where e.workout_id = v_workout and ps.set_type = 'working';

  select target_reps into v_old_reps
  from public.st_planned_sets ps
  join public.st_exercises e on e.id = ps.exercise_id
  where e.workout_id = v_workout and ps.set_type = 'working';

  v_saved := public.st_edit_group_strength_series(v_series);
  if (v_saved ->> 'cloned') <> 'true' then
    raise exception 'FAIL series edit did not copy a logged workout';
  end if;
  if (select workout_id from public.st_group_activity_occurrences where series_id = v_series and user_id = v_member and original_date = v_monday) <> v_workout then
    raise exception 'FAIL completed member lost the original workout';
  end if;
  if (select workout_id from public.st_group_activity_series where id = v_series) = v_workout then
    raise exception 'FAIL series still points at the logged workout';
  end if;
  select target_reps into v_new_reps
  from public.st_planned_sets ps
  join public.st_exercises e on e.id = ps.exercise_id
  where e.workout_id = v_workout and ps.set_type = 'working';
  if v_new_reps is distinct from v_old_reps then
    raise exception 'FAIL logged planned set changed';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  select l.workout_id into v_listed
  from public.st_list_group_activities(v_team, v_monday, v_monday, v_member) l
  where l.series_id = v_series and l.user_id = v_member;
  if v_listed <> v_workout then
    raise exception 'FAIL completed date listed the new workout';
  end if;
  select l.workout_id into v_listed
  from public.st_list_group_activities(v_team, v_monday, v_monday, v_owner) l
  where l.series_id = v_series and l.user_id = v_owner;
  if v_listed = v_workout or v_listed is null then
    raise exception 'FAIL uncompleted member did not follow the new series workout';
  end if;

  v_saved := public.st_save_group_strength_workout(
    v_team, 'Future press', v_next, array[v_owner, v_member], 'stage3-future',
    null, false, 'weekly', array[0]::smallint[], null,
    jsonb_build_array(jsonb_build_object(
      'name', 'Row',
      'equipment', 'Dumbbell',
      'sets', jsonb_build_array(jsonb_build_object('set_type', 'working', 'target_reps', '10'))
    ))
  );
  v_series := (v_saved ->> 'series_id')::uuid;
  v_workout := (v_saved ->> 'workout_id')::uuid;
  perform public.st_complete_group_activity_occurrence(v_series, v_owner, v_next);
  insert into public.st_set_logs (planned_set_id, user_id, log_date, actual_reps, completed, snapshot_equipment)
  select ps.id, v_owner, v_next, '10', true, 'Dumbbell'
  from public.st_planned_sets ps
  join public.st_exercises e on e.id = ps.exercise_id
  where e.workout_id = v_workout;

  v_saved := public.st_edit_group_strength_future(v_series, '2026-11-02');
  v_other := (v_saved ->> 'new_series_id')::uuid;
  if (
    select public.st_group_activity_effective_workout(o.workout_id, s.workout_id)
    from public.st_group_activity_occurrences o
    join public.st_group_activity_series s on s.id = o.series_id
    where o.user_id = v_owner and o.original_date = v_next
  ) <> v_workout or (
    select s.id
    from public.st_group_activity_occurrences o
    join public.st_group_activity_series s on s.id = o.series_id
    where o.user_id = v_owner and o.original_date = v_next
  ) <> v_series then
    raise exception 'FAIL this-and-future changed the completed workout';
  end if;
  if (select workout_id from public.st_group_activity_series where id = v_other) = v_workout then
    raise exception 'FAIL future series kept the logged workout';
  end if;
  if (select workout_id from public.st_group_activity_series where id = v_series) <> v_workout then
    raise exception 'FAIL earlier series changed';
  end if;

  v_saved := public.st_save_group_strength_workout(
    v_team, 'One day', v_monday, array[v_member], 'stage3-one',
    null, false, 'none', '{}', null,
    jsonb_build_array(jsonb_build_object(
      'name', 'Squat',
      'equipment', 'Smith machine',
      'sets', jsonb_build_array(jsonb_build_object('set_type', 'working', 'target_reps', '6'))
    ))
  );
  v_series := (v_saved ->> 'series_id')::uuid;
  v_workout := (v_saved ->> 'workout_id')::uuid;
  insert into public.st_set_logs (planned_set_id, user_id, log_date, actual_reps, completed, snapshot_equipment)
  select ps.id, v_member, v_monday, '6', true, 'Smith machine'
  from public.st_planned_sets ps
  join public.st_exercises e on e.id = ps.exercise_id
  where e.workout_id = v_workout;
  begin
    perform public.st_edit_group_activity_occurrence(
      v_series, v_member, v_monday, '2026-10-20', null, null, null, null, null, '{}'
    );
    raise exception 'FAIL a logged workout was moved';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%cannot be moved%' then
      raise exception 'FAIL move error %', sqlerrm;
    end if;
  end;

  perform public.st_complete_group_activity_occurrence(v_series, v_member, v_monday);
  begin
    perform public.st_edit_group_strength_occurrence(v_series, v_member, v_monday);
    raise exception 'FAIL completed occurrence was replaced';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%cannot be changed%' then
      raise exception 'FAIL completed edit error %', sqlerrm;
    end if;
  end;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_saved := public.st_save_group_strength_workout(
    v_team, 'Shared day', '2026-10-20', array[v_owner, v_member], 'stage3-shared',
    null, false, 'none', '{}', null,
    jsonb_build_array(jsonb_build_object(
      'name', 'Pull-up',
      'equipment', 'Bodyweight',
      'sets', jsonb_build_array(jsonb_build_object('set_type', 'working', 'target_reps', '8'))
    ))
  );
  v_series := (v_saved ->> 'series_id')::uuid;
  v_workout := (v_saved ->> 'workout_id')::uuid;
  insert into public.st_set_logs (planned_set_id, user_id, log_date, actual_reps, completed)
  select ps.id, v_owner, '2026-10-20', '8', true
  from public.st_planned_sets ps
  join public.st_exercises e on e.id = ps.exercise_id
  where e.workout_id = v_workout;
  v_saved := public.st_edit_group_strength_occurrence(v_series, v_member, '2026-10-20');
  v_clone := (v_saved ->> 'workout_id')::uuid;
  if (v_saved ->> 'cloned') <> 'true' or v_clone = v_workout then
    raise exception 'FAIL this occurrence did not copy the shared workout';
  end if;
  if (select workout_id from public.st_group_activity_series where id = v_series) <> v_workout then
    raise exception 'FAIL this occurrence changed the series';
  end if;
  v_saved := public.st_edit_group_strength_occurrence(v_series, v_owner, '2026-10-20');
  v_owner_clone := (v_saved ->> 'workout_id')::uuid;
  if (v_saved ->> 'cloned') <> 'true' or v_owner_clone = v_workout or v_owner_clone = v_clone then
    raise exception 'FAIL owner occurrence did not get a private copy';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
set local role authenticated;
do $$
declare
  v_shared uuid;
  v_clone uuid;
  v_owner_clone uuid;
  v_program uuid;
begin
  select s.workout_id, mine.workout_id, owner_row.workout_id, s.program_id
    into v_shared, v_clone, v_owner_clone, v_program
  from public.st_group_activity_series s
  join public.st_group_activity_occurrences mine
    on mine.series_id = s.id and mine.user_id = '00000000-0000-4000-8000-000000000003'
  join public.st_group_activity_occurrences owner_row
    on owner_row.series_id = s.id and owner_row.user_id = '00000000-0000-4000-8000-000000000001'
  where s.title = 'Shared day';
  if (select count(*) from public.st_workouts where id = v_shared) <> 1 then
    raise exception 'FAIL recipient could not read the assigned workout';
  end if;
  if (select count(*) from public.st_exercises where workout_id = v_shared) <> 1 then
    raise exception 'FAIL recipient could not read the assigned exercise';
  end if;
  if (select count(*) from public.st_planned_sets ps join public.st_exercises e on e.id = ps.exercise_id where e.workout_id = v_shared) <> 1 then
    raise exception 'FAIL recipient could not read the assigned sets';
  end if;
  if (select count(*) from public.st_workouts where id = v_clone) <> 1 then
    raise exception 'FAIL recipient could not read their own workout';
  end if;
  if (select count(*) from public.st_exercises where workout_id = v_clone) <> 1 then
    raise exception 'FAIL recipient could not read their own exercise';
  end if;
  if (select count(*) from public.st_planned_sets ps join public.st_exercises e on e.id = ps.exercise_id where e.workout_id = v_clone) <> 1 then
    raise exception 'FAIL recipient could not read their own sets';
  end if;
  if (select count(*) from public.st_workouts where id = v_owner_clone) <> 0
     or (select count(*) from public.st_exercises where workout_id = v_owner_clone) <> 0 then
    raise exception 'FAIL recipient read another member override';
  end if;
  if (select count(*) from public.st_programs where id = v_program) <> 0 then
    raise exception 'FAIL recipient read the shelf program';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
declare
  v_clone uuid;
begin
  select o.workout_id into v_clone
  from public.st_group_activity_occurrences o
  join public.st_group_activity_series s on s.id = o.series_id
  where s.title = 'Shared day' and o.user_id = '00000000-0000-4000-8000-000000000003';
  if v_clone is null or (select count(*) from public.st_workouts where id = v_clone) <> 1 then
    raise exception 'FAIL owner could not read the occurrence workout';
  end if;
end $$;
reset role;

do $$
declare
  v_program uuid;
  v_saved jsonb;
  v_member uuid := '00000000-0000-4000-8000-000000000003';
  v_team uuid := '10000000-0000-4000-8000-000000000001';
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  begin
    perform public.st_save_group_strength_workout(
      '10000000-0000-4000-8000-000000000001', 'Not mine', '2026-10-21',
      array['00000000-0000-4000-8000-000000000001']::uuid[], 'stage3-denied',
      null, false, 'none', '{}', null,
      jsonb_build_array(jsonb_build_object('name', 'Curl', 'sets', jsonb_build_array(jsonb_build_object('set_type', 'working'))))
    );
    raise exception 'FAIL member assigned another person';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%not authorized%' then
      raise exception 'FAIL member assign error %', sqlerrm;
    end if;
  end;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  select id into v_program from public.st_programs where program_use = 'group_strength_shelf' limit 1;
  begin
    insert into public.st_training_enrollments (user_id, program_id, source_key)
    values ('00000000-0000-4000-8000-000000000001', v_program, 'personal');
    raise exception 'FAIL shelf enrollment was accepted';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%not a training program%' then
      raise exception 'FAIL enrollment error %', sqlerrm;
    end if;
  end;
  begin
    insert into public.st_training_expectations (user_id, program_id, scheduled_date)
    values ('00000000-0000-4000-8000-000000000001', v_program, '2026-10-19');
    raise exception 'FAIL shelf expectation was accepted';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%not a training program%' then
      raise exception 'FAIL expectation error %', sqlerrm;
    end if;
  end;

  begin
    perform public.st_save_group_activity(
      '10000000-0000-4000-8000-000000000001', 'strength', 'Duplicate', '2026-10-20',
      array['00000000-0000-4000-8000-000000000003']::uuid[], 'stage3-duplicate',
      null, null, '{}'::jsonb,
      (select o.workout_id
         from public.st_group_activity_occurrences o
         join public.st_group_activity_series s on s.id = o.series_id
        where s.title = 'Shared day' and o.user_id = v_member),
      null, false, 'none', '{}', null
    );
    raise exception 'FAIL duplicate workout on the same date was accepted';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%already on this date%' then
      raise exception 'FAIL duplicate error %', sqlerrm;
    end if;
  end;

  v_saved := public.st_save_group_strength_workout(
    v_team, 'Move clear', '2026-10-22', array[v_member], 'stage3-move-clear',
    null, false, 'none', '{}', null,
    jsonb_build_array(jsonb_build_object(
      'name', 'Lunge',
      'sets', jsonb_build_array(jsonb_build_object('set_type', 'working'))
    ))
  );
  perform public.st_edit_group_activity_occurrence(
    (v_saved ->> 'series_id')::uuid, v_member, '2026-10-22', '2026-10-23',
    null, null, null, null, null, '{}'
  );
  begin
    perform public.st_save_group_activity(
      v_team, 'strength', 'Moved duplicate', '2026-10-23',
      array[v_member], 'stage3-moved-dup',
      null, null, '{}'::jsonb, (v_saved ->> 'workout_id')::uuid, null, false,
      'none', '{}', null
    );
    raise exception 'FAIL rescheduled workout was duplicated';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%already on this date%' then
      raise exception 'FAIL reschedule collision error %', sqlerrm;
    end if;
  end;
end $$;
