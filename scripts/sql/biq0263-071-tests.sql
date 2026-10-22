-- Disposable checks for BIQ-0263 migration 071. Not production.
-- Runs after 070. Does not repeat the 070 owner-clone assertion.

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant select, insert, update on public.st_set_logs to authenticated;
grant select, insert, update on public.st_workout_sessions to authenticated;
grant select, insert, update on public.st_exercise_sessions to authenticated;

drop policy if exists biq071_set_logs_own on public.st_set_logs;
create policy biq071_set_logs_own
  on public.st_set_logs
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists biq071_sessions_own on public.st_workout_sessions;
create policy biq071_sessions_own
  on public.st_workout_sessions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists biq071_exercise_sessions_own on public.st_exercise_sessions;
create policy biq071_exercise_sessions_own
  on public.st_exercise_sessions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

do $$
declare
  v_saved jsonb;
  v_series uuid;
  v_workout uuid;
  v_new_series uuid;
  v_clone uuid;
  v_pinned uuid;
  v_set uuid;
  v_team_set uuid;
  v_exercise uuid;
  v_expectation uuid;
  v_monday date := '2026-10-19';
  v_next date := '2026-10-26';
  v_later date := '2026-11-02';
  v_owner uuid := '00000000-0000-4000-8000-000000000001';
  v_manager uuid := '00000000-0000-4000-8000-000000000002';
  v_member uuid := '00000000-0000-4000-8000-000000000003';
  v_outsider uuid := '00000000-0000-4000-8000-000000000005';
  v_team uuid := '10000000-0000-4000-8000-000000000001';
  v_program uuid := '30000000-0000-4000-8000-000000000001';
  v_published uuid := '20000000-0000-4000-8000-000000000001';
  v_expectations int;
  v_completed boolean;
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  insert into public.st_training_expectations (user_id, program_id, workout_id, scheduled_date, excused)
  values (v_member, v_program, v_published, v_monday, false);

  begin
    perform public.st_save_group_activity(
      v_team, 'strength', 'Program extra', v_monday, array[v_member], 'p071-collision',
      null, null, '{}'::jsonb, v_published, v_program, false, 'none', '{}', null
    );
    raise exception 'FAIL program extra was accepted on an expectation date';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%already on the group program for this date%' then
      raise exception 'FAIL program collision message %', sqlerrm;
    end if;
  end;

  update public.st_training_expectations
  set excused = true
  where user_id = v_member and workout_id = v_published and scheduled_date = v_monday;

  v_saved := public.st_save_group_activity(
    v_team, 'strength', 'Excused day', '2026-10-21', array[v_member], 'p071-excused',
    null, null, '{}'::jsonb, v_published, v_program, false, 'none', '{}', null
  );
  if v_saved ->> 'series_id' is null then
    raise exception 'FAIL excused expectation blocked a group activity';
  end if;

  v_saved := public.st_save_group_activity(
    v_team, 'strength', 'Weekly program', v_monday, array[v_member], 'p071-weekly',
    null, null, '{}'::jsonb, v_published, v_program, false, 'weekly', array[0]::smallint[], '2026-12-31'
  );
  v_series := (v_saved ->> 'series_id')::uuid;

  begin
    insert into public.st_training_expectations (user_id, program_id, workout_id, scheduled_date, excused)
    values (v_member, v_program, v_published, v_next, false);
    raise exception 'FAIL expectation was accepted on a live group activity';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%already on this date as a group activity%' then
      raise exception 'FAIL activity collision message %', sqlerrm;
    end if;
  end;

  perform public.st_skip_group_activity_occurrence(v_series, v_member, v_next);
  insert into public.st_training_expectations (user_id, program_id, workout_id, scheduled_date, excused)
  values (v_member, v_program, v_published, v_next, false);

  perform public.st_edit_group_activity_occurrence(v_series, v_member, v_later, '2026-11-03');
  insert into public.st_training_expectations (user_id, program_id, workout_id, scheduled_date, excused)
  values (v_member, v_program, v_published, v_later, false);
  begin
    insert into public.st_training_expectations (user_id, program_id, workout_id, scheduled_date, excused)
    values (v_member, v_program, v_published, '2026-11-03', false);
    raise exception 'FAIL expectation was accepted on a moved activity date';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%already on this date as a group activity%' then
      raise exception 'FAIL moved-date collision %', sqlerrm;
    end if;
  end;

  update public.st_group_activity_recipients
  set removed_on = '2026-11-16'
  where series_id = v_series and user_id = v_member;
  insert into public.st_training_expectations (user_id, program_id, workout_id, scheduled_date, excused)
  values (v_member, v_program, v_published, '2026-11-16', false);

  perform public.st_end_group_activity_series(v_series, '2026-11-09');
  insert into public.st_training_expectations (user_id, program_id, workout_id, scheduled_date, excused)
  values (v_member, v_program, v_published, '2026-11-23', false);

  v_saved := public.st_save_group_strength_workout(
    v_team, 'Partial press', '2026-10-20', array[v_owner, v_member], 'p071-partial',
    null, false, 'weekly', array[1]::smallint[], null,
    jsonb_build_array(jsonb_build_object(
      'name', 'Partial press',
      'equipment', 'Dumbbell',
      'catalog_exercise_id', '90000000-0000-4000-8000-000000000071',
      'sort_order', 0,
      'sets', jsonb_build_array(
        jsonb_build_object('set_type', 'working', 'set_number', 1, 'target_reps', '8', 'target_weight', '40')
      )
    ))
  );
  v_series := (v_saved ->> 'series_id')::uuid;
  v_workout := (v_saved ->> 'workout_id')::uuid;
  select ps.id into v_set
  from public.st_planned_sets ps
  join public.st_exercises e on e.id = ps.exercise_id
  where e.workout_id = v_workout
  limit 1;
  select e.id into v_exercise
  from public.st_exercises e
  where e.workout_id = v_workout
  limit 1;

  insert into public.st_set_logs (planned_set_id, user_id, log_date, actual_reps, completed, team_id, snapshot_equipment, snapshot_catalog_exercise_id)
  values (v_set, v_owner, '2026-10-20', '3', false, v_team, 'Dumbbell', '90000000-0000-4000-8000-000000000071');

  v_saved := public.st_edit_group_strength_occurrence(v_series, v_owner, '2026-10-20');
  if (v_saved ->> 'cloned') <> 'false' or (v_saved ->> 'workout_id')::uuid <> v_workout then
    raise exception 'FAIL partial occurrence was cloned';
  end if;
  v_saved := public.st_edit_group_strength_occurrence(v_series, v_member, '2026-10-20');
  if (v_saved ->> 'cloned') <> 'true' or (v_saved ->> 'workout_id')::uuid = v_workout then
    raise exception 'FAIL member without logs stayed on the shared workout';
  end if;
  if (select workout_id from public.st_group_activity_occurrences where series_id = v_series and user_id = v_owner and original_date = '2026-10-20') <> v_workout then
    raise exception 'FAIL owner partial log left the original workout';
  end if;

  begin
    perform public.st_edit_group_activity_occurrence(v_series, v_owner, '2026-10-20', '2026-10-21');
    raise exception 'FAIL a logged workout was moved';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%logged workout cannot be moved%' then
      raise exception 'FAIL move message %', sqlerrm;
    end if;
  end;

  insert into public.st_set_logs (planned_set_id, user_id, log_date, actual_duration, completed, team_id)
  values (v_set, v_owner, '2026-10-27', '12', false, v_team);
  v_saved := public.st_edit_group_strength_future(v_series, '2026-10-27');
  v_new_series := (v_saved ->> 'new_series_id')::uuid;
  v_clone := (v_saved ->> 'workout_id')::uuid;
  select workout_id into v_pinned
  from public.st_group_activity_occurrences
  where series_id = v_new_series and user_id = v_owner and original_date = '2026-10-27';
  if v_pinned is null or v_pinned <> v_workout or v_clone = v_workout then
    raise exception 'FAIL future split disconnected a duration log';
  end if;

  v_saved := public.st_save_group_strength_workout(
    v_team, 'Distance row', '2026-10-22', array[v_member], 'p071-distance',
    null, false, 'weekly', array[3]::smallint[], null,
    jsonb_build_array(jsonb_build_object(
      'name', 'Carry',
      'equipment', 'Kettlebell',
      'sets', jsonb_build_array(jsonb_build_object('set_type', 'working', 'set_number', 1, 'target_reps', '1'))
    ))
  );
  v_series := (v_saved ->> 'series_id')::uuid;
  v_workout := (v_saved ->> 'workout_id')::uuid;
  insert into public.st_set_logs (planned_set_id, user_id, log_date, actual_distance, completed, team_id)
  select ps.id, v_member, '2026-11-05', '40', false, v_team
  from public.st_planned_sets ps
  join public.st_exercises e on e.id = ps.exercise_id
  where e.workout_id = v_workout
  limit 1;
  perform public.st_edit_group_strength_series(v_series);
  if (select workout_id from public.st_group_activity_occurrences where series_id = v_series and user_id = v_member and original_date = '2026-11-05') <> v_workout then
    raise exception 'FAIL series edit disconnected a distance log';
  end if;
  if (select workout_id from public.st_group_activity_series where id = v_series) = v_workout then
    raise exception 'FAIL series edit did not copy the shared workout';
  end if;

  v_expectation := (
    select id from public.st_training_expectations
    where user_id = v_member and workout_id = v_published and scheduled_date = v_next
    limit 1
  );
  insert into public.st_workout_sessions (id, user_id, workout_id, log_date, expectation_id, source_key, status)
  values (71, v_member, v_published, v_next, v_expectation, 'group:' || v_team::text, 'partial');
  begin
    update public.st_workout_sessions
    set source_key = 'group-activity:' || v_series::text, expectation_id = null
    where id = 71;
    raise exception 'FAIL a program session was retargeted to a group activity';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%already logged on the group program%' then
      raise exception 'FAIL program retarget message %', sqlerrm;
    end if;
  end;
  if (select expectation_id from public.st_workout_sessions where id = 71) is null then
    raise exception 'FAIL a rejected retarget cleared the expectation';
  end if;

  insert into public.st_workout_sessions (id, user_id, workout_id, log_date, expectation_id, source_key, status)
  values (72, v_member, v_workout, '2026-10-22', null, 'group-activity:' || v_series::text, 'partial');
  begin
    update public.st_workout_sessions
    set expectation_id = v_expectation, source_key = 'group:' || v_team::text
    where id = 72;
    raise exception 'FAIL a group activity session was retargeted to a program';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%already logged as a group activity%' then
      raise exception 'FAIL activity retarget message %', sqlerrm;
    end if;
  end;
  update public.st_workout_sessions set status = 'completed' where id = 72;
  if (select source_key from public.st_workout_sessions where id = 72) not like 'group-activity:%' then
    raise exception 'FAIL a status update changed the activity session';
  end if;

  insert into public.st_training_expectations (id, user_id, program_id, workout_id, scheduled_date, excused)
  values ('71000000-0000-4000-8000-000000000071', v_member, v_program, v_published, '2026-12-07', false);
  insert into public.st_workout_sessions (id, user_id, workout_id, log_date, expectation_id, source_key, status)
  values (73, v_member, v_published, '2026-12-07', null, 'group-activity:' || v_series::text, 'completed');
  if public.st_expectation_has_session('71000000-0000-4000-8000-000000000071') then
    raise exception 'FAIL a group activity session fulfilled an expectation';
  end if;
  insert into public.st_workout_sessions (id, user_id, workout_id, log_date, expectation_id, source_key, status)
  values (75, v_member, v_published, '2026-12-07', null, null, 'completed');
  if not public.st_expectation_has_session('71000000-0000-4000-8000-000000000071') then
    raise exception 'FAIL an unlinked program session stopped fulfilling an expectation';
  end if;

  v_expectations := (select count(*) from public.st_training_expectations);
  v_saved := public.st_complete_group_activity_occurrence(v_series, v_member, '2026-10-22');
  if coalesce((v_saved ->> 'already_completed')::boolean, false) then
    raise exception 'FAIL the first completion was treated as a retry';
  end if;
  if (select count(*) from public.st_training_expectations) <> v_expectations then
    raise exception 'FAIL completion changed expectations';
  end if;
  v_saved := public.st_complete_group_activity_occurrence(v_series, v_member, '2026-10-22');
  if coalesce((v_saved ->> 'already_completed')::boolean, false) is not true then
    raise exception 'FAIL completion retry was not safe';
  end if;

  perform set_config('request.jwt.claim.sub', v_member::text, true);
  begin
    perform public.st_complete_group_activity_occurrence(v_series, v_owner, '2026-10-22');
    raise exception 'FAIL a member completed another person';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%not authorized%' then
      raise exception 'FAIL member completion guard %', sqlerrm;
    end if;
  end;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  update public.st_group_activity_recipients
  set removed_on = '2026-11-05'
  where series_id = v_series and user_id = v_member;
  begin
    perform public.st_complete_group_activity_occurrence(v_series, v_member, '2026-11-05');
    raise exception 'FAIL a removed date was completed';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
    if sqlerrm not ilike '%no longer assigned%' then
      raise exception 'FAIL removed completion message %', sqlerrm;
    end if;
  end;
  v_saved := public.st_complete_group_activity_occurrence(v_series, v_member, '2026-10-22');
  if coalesce((v_saved ->> 'already_completed')::boolean, false) is not true then
    raise exception 'FAIL a valid completion could not be retried after removal';
  end if;

  perform set_config('request.jwt.claim.sub', v_manager::text, true);
  perform public.st_skip_group_activity_occurrence(
    (select id from public.st_group_activity_series where title = 'Excused day' limit 1),
    v_member,
    '2026-10-21'
  );

  insert into public.st_exercises (workout_id, name)
  values (v_published, 'Team squat')
  returning id into v_exercise;
  insert into public.st_planned_sets (exercise_id, set_number, set_type)
  values (v_exercise, 1, 'working')
  returning id into v_team_set;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_saved := public.st_save_group_strength_workout(
    v_team, 'Recipient log', '2026-10-23', array[v_member], 'p071-recipient',
    null, false, 'none', '{}'::smallint[], null,
    jsonb_build_array(jsonb_build_object(
      'name', 'Recipient row',
      'equipment', 'Machine',
      'sets', jsonb_build_array(jsonb_build_object('set_type', 'working', 'set_number', 1, 'target_reps', '10'))
    ))
  );
  v_series := (v_saved ->> 'series_id')::uuid;
  v_workout := (v_saved ->> 'workout_id')::uuid;
  select ps.id, e.id into v_set, v_exercise
  from public.st_planned_sets ps
  join public.st_exercises e on e.id = ps.exercise_id
  where e.workout_id = v_workout
  limit 1;

  perform set_config('request.jwt.claim.sub', v_member::text, true);
  set local role authenticated;
  insert into public.st_set_logs (planned_set_id, user_id, log_date, actual_reps, completed, team_id, snapshot_equipment)
  values (v_set, v_member, '2026-10-23', '5', false, v_team, 'Machine');
  update public.st_set_logs
  set actual_reps = '6'
  where planned_set_id = v_set and user_id = v_member and log_date = '2026-10-23';
  insert into public.st_workout_sessions (id, user_id, workout_id, log_date, source_key, status)
  values (74, v_member, v_workout, '2026-10-23', 'group-activity:' || v_series::text, 'partial');
  update public.st_workout_sessions set status = 'completed' where id = 74;
  insert into public.st_exercise_sessions (user_id, exercise_id, log_date, status)
  values (v_member, v_exercise, '2026-10-23', 'in_progress');
  insert into public.st_set_logs (planned_set_id, user_id, log_date, actual_reps, completed)
  values (v_team_set, v_member, v_monday, '8', true);
  reset role;

  perform set_config('request.jwt.claim.sub', v_manager::text, true);
  set local role authenticated;
  begin
    insert into public.st_set_logs (planned_set_id, user_id, log_date, actual_reps, completed, team_id)
    values (v_set, v_manager, '2026-10-23', '1', false, v_team);
    raise exception 'FAIL an assigner logged another member shelf set';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', v_outsider::text, true);
  set local role authenticated;
  begin
    insert into public.st_set_logs (planned_set_id, user_id, log_date, actual_reps, completed)
    values (v_set, v_outsider, '2026-10-23', '1', false);
    raise exception 'FAIL an outsider logged a shelf set';
  exception when others then
    if sqlerrm ilike 'FAIL%' then raise; end if;
  end;
  reset role;

  select o.completed into v_completed
  from public.st_group_activity_occurrences o
  join public.st_group_activity_series s on s.id = o.series_id
  where s.title = 'Partial press' and o.user_id = v_owner and o.original_date = '2026-10-20';
  if coalesce(v_completed, false) then
    raise exception 'FAIL a partial log completed the activity';
  end if;
end $$;
