-- BIQ-0264 Phase 2B.2 behavioral tests for disposable Postgres.
-- Not a migration. Do not run this against hosted Supabase.
-- The runner applies the fixture, production functions, triggers, and migration 072 first.
-- Session TimeZone starts at UTC. Seeded groups use timezone UTC, so the group date matches biq072_today().
-- The batch requires that group date. It does not accept a caller-controlled one-day window.

set timezone to 'UTC';

create or replace function biq072_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'UTC')::date;
$$;

create or replace function biq072_check(p_cond boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if coalesce(p_cond, false) is distinct from true then
    raise exception 'FAIL: %', p_message;
  end if;
end;
$$;

create or replace function biq072_user(p_email text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_id, p_email || '-' || v_id::text);
  return v_id;
end;
$$;

create or replace function biq072_snapshot(p_enrollment uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'date', e.scheduled_date,
    'origin', e.origin,
    'title', e.title,
    'workout', e.workout_id
  ) order by e.scheduled_date, e.title, e.id), '[]'::jsonb)
  from public.st_training_expectations e
  where e.enrollment_id = p_enrollment;
$$;

create or replace function biq072_seed(p_label text)
returns jsonb
language plpgsql
as $$
declare
  v_today date := biq072_today();
  v_owner uuid;
  v_manager uuid;
  v_assigner uuid;
  v_ordinary uuid;
  v_amy uuid;
  v_ben uuid;
  v_cara uuid;
  v_team uuid;
  v_program uuid;
  v_logged uuid;
  v_week integer;
  v_amy_enroll uuid;
  v_ben_enroll uuid;
  v_cara_enroll uuid;
  v_personal uuid;
  v_assignment uuid;
  v_recipient uuid;
  v_past uuid;
  v_today_row uuid;
  v_session uuid;
  v_set_log uuid;
  v_program_assignment uuid;
begin
  v_owner := biq072_user(p_label || '-owner');
  v_manager := biq072_user(p_label || '-manager');
  v_assigner := biq072_user(p_label || '-assigner');
  v_ordinary := biq072_user(p_label || '-member');
  v_amy := biq072_user(p_label || '-amy');
  v_ben := biq072_user(p_label || '-ben');
  v_cara := biq072_user(p_label || '-cara');

  insert into public.st_teams (name, invite_code, owner_user_id, members_can_assign_workouts, timezone)
  values (p_label, p_label || '-' || v_owner::text, v_owner, false, 'UTC')
  returning id into v_team;

  insert into public.st_team_members (team_id, user_id, role, display_name) values
    (v_team, v_owner, 'owner', 'Owner'),
    (v_team, v_manager, 'manager', 'Manager'),
    (v_team, v_assigner, 'member', 'Assigner'),
    (v_team, v_ordinary, 'member', 'Member'),
    (v_team, v_amy, 'member', 'Amy'),
    (v_team, v_ben, 'member', 'Ben'),
    (v_team, v_cara, 'member', 'Cara');

  insert into public.st_programs (owner_user_id, team_id, visibility, name, weeks, start_date, status)
  values (v_owner, v_team, 'team', 'Full Body', 2, public.st_schedule_monday(v_today), 'published')
  returning id into v_program;

  update public.st_teams set default_program_id = v_program where id = v_team;

  for v_week in 1..2 loop
    insert into public.st_workouts (program_id, week, day_order, day_label, workout_type) values
      (v_program, v_week, 0, 'Mon', 'Workout A'),
      (v_program, v_week, 1, 'Wed', 'Workout B'),
      (v_program, v_week, 2, 'Fri', 'Workout C');
  end loop;

  insert into public.st_workouts (program_id, week, day_order, day_label, workout_type)
  values (v_program, 0, 0, 'Mon', 'Logged marker')
  returning id into v_logged;

  insert into public.st_training_enrollments (
    user_id, source_kind, source_key, team_id, program_id, status,
    schedule_visible, expectation_enabled, starts_on
  ) values
    (v_amy, 'group', 'group:' || v_team::text, v_team, v_program, 'active', true, true, v_today - 30),
    (v_ben, 'group', 'group:' || v_team::text, v_team, v_program, 'active', true, true, v_today - 30),
    (v_cara, 'group', 'group:' || v_team::text, v_team, v_program, 'active', true, true, v_today - 30);

  select id into v_amy_enroll from public.st_training_enrollments
  where user_id = v_amy and source_key = 'group:' || v_team::text;
  select id into v_ben_enroll from public.st_training_enrollments
  where user_id = v_ben and source_key = 'group:' || v_team::text;
  select id into v_cara_enroll from public.st_training_enrollments
  where user_id = v_cara and source_key = 'group:' || v_team::text;

  insert into public.st_training_expectations (
    user_id, source_key, team_id, enrollment_id, program_id, workout_id,
    scheduled_date, title, day_label, origin
  ) values (
    v_amy, 'group:' || v_team::text, v_team, v_amy_enroll, v_program, v_logged,
    v_today - 10, 'PAST-KEEP', 'Mon', 'program'
  ) returning id into v_past;

  insert into public.st_training_expectations (
    user_id, source_key, team_id, enrollment_id, program_id, workout_id,
    scheduled_date, title, day_label, origin
  ) values (
    v_amy, 'group:' || v_team::text, v_team, v_amy_enroll, v_program, v_logged,
    v_today, 'TODAY-LOGGED', 'Mon', 'program'
  ) returning id into v_today_row;

  insert into public.st_workout_sessions (
    user_id, workout_id, log_date, expectation_id, source_key, scheduled_date, status
  ) values (
    v_amy, v_logged, v_today, v_today_row, 'group:' || v_team::text, v_today, 'completed'
  ) returning id into v_session;

  insert into public.st_workout_assignments default values returning id into v_assignment;
  insert into public.st_assignment_recipients (assignment_id) values (v_assignment) returning id into v_recipient;
  insert into public.st_training_expectations (
    user_id, source_key, team_id, enrollment_id, program_id, workout_id,
    assignment_id, assignment_recipient_id, scheduled_date, title, day_label, origin
  ) values (
    v_amy, 'group:' || v_team::text, v_team, v_amy_enroll, v_program, v_logged,
    v_assignment, v_recipient, v_today + 3, 'ASSIGN-KEEP', 'Thu', 'assignment'
  );

  insert into public.st_training_enrollments (
    user_id, source_kind, source_key, team_id, program_id, status,
    schedule_visible, expectation_enabled, starts_on
  ) values (
    v_amy, 'personal', 'personal', null, v_program, 'active', true, true, v_today - 30
  ) returning id into v_personal;

  insert into public.st_training_expectations (
    user_id, source_key, team_id, enrollment_id, program_id, workout_id,
    scheduled_date, title, day_label, origin
  ) values (
    v_amy, 'personal', null, v_personal, v_program, v_logged,
    v_today - 20, 'PERSONAL-KEEP', 'Mon', 'program'
  );

  insert into public.st_set_logs (user_id, team_id, log_date, actual_reps)
  values (v_amy, v_team, v_today, '5')
  returning id into v_set_log;

  insert into public.st_program_assignments (user_id, team_id, program_id, is_active, assignment_type, notes)
  values (v_amy, v_team, v_program, true, 'individual_team', 'keep')
  returning id into v_program_assignment;

  return jsonb_build_object(
    'team_id', v_team,
    'owner_id', v_owner,
    'manager_id', v_manager,
    'assigner_id', v_assigner,
    'ordinary_id', v_ordinary,
    'amy_id', v_amy,
    'ben_id', v_ben,
    'cara_id', v_cara,
    'program_id', v_program,
    'logged_workout_id', v_logged,
    'amy_enrollment_id', v_amy_enroll,
    'ben_enrollment_id', v_ben_enroll,
    'cara_enrollment_id', v_cara_enroll,
    'personal_enrollment_id', v_personal,
    'past_expectation_id', v_past,
    'today_expectation_id', v_today_row,
    'session_id', v_session,
    'set_log_id', v_set_log,
    'program_assignment_id', v_program_assignment
  );
end;
$$;

create or replace function biq072_apply(
  p_actor uuid,
  p_team uuid,
  p_action text,
  p_ids uuid[],
  p_mode text,
  p_days text[],
  p_key text,
  p_effective date default null,
  p_local date default null
)
returns jsonb
language plpgsql
as $$
declare
  v_effective date := coalesce(p_effective, biq072_today());
  v_local date := coalesce(p_local, v_effective);
  v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  v_result := public.st_apply_group_member_schedules(
    p_team, p_action, p_ids, p_mode, p_days, v_effective, v_local, p_key
  );
  execute 'set constraints all immediate';
  return v_result;
end;
$$;

create or replace function biq072_apply_error(
  p_actor uuid,
  p_team uuid,
  p_action text,
  p_ids uuid[],
  p_mode text,
  p_days text[],
  p_key text,
  p_effective date default null,
  p_local date default null
)
returns text
language plpgsql
as $$
declare
  v_effective date := coalesce(p_effective, biq072_today());
  v_local date := coalesce(p_local, v_effective);
begin
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform public.st_apply_group_member_schedules(
    p_team, p_action, p_ids, p_mode, p_days, v_effective, v_local, p_key
  );
  return null;
exception
  when others then
    return sqlerrm;
end;
$$;

create or replace function biq072_assign(
  p_actor uuid,
  p_team uuid,
  p_ids uuid[],
  p_program uuid,
  p_key text
)
returns jsonb
language plpgsql
as $$
declare
  v_today date;
begin
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  select (timezone(t.timezone, now()))::date into v_today
  from public.st_teams t
  where t.id = p_team;
  return public.st_assign_group_programs(
    p_team, p_ids, p_program, v_today, null, p_key, 'individual_team', false, v_today, '[]'::jsonb
  );
end;
$$;

create or replace function biq072_seed_many(p_count integer)
returns jsonb
language plpgsql
as $$
declare
  v_today date := biq072_today();
  v_owner uuid;
  v_team uuid;
  v_program uuid;
  v_week integer;
  v_i integer;
  v_user uuid;
  v_ids uuid[] := '{}'::uuid[];
begin
  v_owner := biq072_user('many-owner');
  insert into public.st_teams (name, invite_code, owner_user_id, timezone)
  values ('many', 'many-' || v_owner::text, v_owner, 'UTC')
  returning id into v_team;
  insert into public.st_team_members (team_id, user_id, role) values (v_team, v_owner, 'owner');
  insert into public.st_programs (owner_user_id, team_id, visibility, name, weeks, start_date, status)
  values (v_owner, v_team, 'team', 'Six Week', 6, public.st_schedule_monday(v_today), 'published')
  returning id into v_program;
  for v_week in 1..6 loop
    insert into public.st_workouts (program_id, week, day_order, day_label, workout_type) values
      (v_program, v_week, 0, 'Mon', 'A'),
      (v_program, v_week, 1, 'Wed', 'B'),
      (v_program, v_week, 2, 'Fri', 'C');
  end loop;
  for v_i in 1..p_count loop
    v_user := biq072_user('many-' || v_i::text);
    insert into public.st_team_members (team_id, user_id, role, display_name)
    values (v_team, v_user, 'member', 'M' || v_i::text);
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      v_user, 'group', 'group:' || v_team::text, v_team, v_program, 'active',
      true, true, v_today - 14
    );
    v_ids := v_ids || v_user;
  end loop;
  return jsonb_build_object(
    'team_id', v_team,
    'owner_id', v_owner,
    'program_id', v_program,
    'member_ids', to_jsonb(v_ids)
  );
end;
$$;

-- edit_days custom weekdays
do $$
declare
  s jsonb;
  result jsonb;
  future_bad integer;
  future_count integer;
begin
  s := biq072_seed('edit-custom');
  perform biq072_check(public.st_expectation_has_session((s->>'today_expectation_id')::uuid), 'logged today is visible to has_session');
  result := biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'amy_id')::uuid], 'custom_weekdays', array['tue', 'Thu', 'Sat'], 'edit-custom-1'
  );
  perform biq072_check((result->>'member_count')::int = 1, 'edit member_count');
  perform biq072_check((result->>'unchanged_count')::int = 0, 'edit unchanged');
  perform biq072_check(result->>'action' = 'edit_days', 'edit action');
  perform biq072_check(result->>'replay' = 'false', 'edit replay false');
  perform biq072_check(result->>'request_key' = 'edit-custom-1', 'edit key');
  perform biq072_check(result->>'effective_on' = biq072_today()::text, 'edit effective');
  perform biq072_check(exists (
    select 1 from public.st_training_schedule_profiles p
    where p.enrollment_id = (s->>'amy_enrollment_id')::uuid
      and p.mode = 'custom_weekdays'
      and p.weekdays = array['Tue', 'Thu', 'Sat']::text[]
  ), 'custom profile stored normalized');
  select count(*) into future_count
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'amy_enrollment_id')::uuid
    and e.origin = 'program'
    and e.scheduled_date > biq072_today();
  select count(*) into future_bad
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'amy_enrollment_id')::uuid
    and e.origin = 'program'
    and e.scheduled_date > biq072_today()
    and e.day_label not in ('Tue', 'Thu', 'Sat');
  perform biq072_check(future_count > 0, 'custom future rows exist');
  perform biq072_check(future_bad = 0, 'custom future rows use the member days');
  perform biq072_check(exists (
    select 1 from public.st_training_expectations e
    where e.id = (s->>'past_expectation_id')::uuid and e.title = 'PAST-KEEP'
  ), 'edit keeps past');
  perform biq072_check(exists (
    select 1 from public.st_workout_sessions ws
    where ws.id = (s->>'session_id')::uuid
      and ws.expectation_id = (s->>'today_expectation_id')::uuid
  ), 'edit keeps logged today linked');
  perform biq072_check(exists (
    select 1 from public.st_training_expectations e
    where e.enrollment_id = (s->>'personal_enrollment_id')::uuid and e.title = 'PERSONAL-KEEP'
  ), 'edit leaves personal enrollment rows');
end $$;

-- edit_days program days
do $$
declare
  s jsonb;
  result jsonb;
  bad integer;
begin
  s := biq072_seed('edit-program');
  result := biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'ben_id')::uuid, (s->>'amy_id')::uuid], 'program_days', array['Fri'], 'edit-program-1'
  );
  perform biq072_check((result->>'member_count')::int = 2, 'program days count');
  perform biq072_check((result->>'unchanged_count')::int = 0, 'program days unchanged');
  perform biq072_check(exists (
    select 1 from public.st_group_schedule_requests r
    where r.team_id = (s->>'team_id')::uuid
      and r.request_key = 'edit-program-1'
      and r.payload->'member_user_ids' = to_jsonb((
        select array_agg(u order by u) from unnest(array[(s->>'ben_id')::uuid, (s->>'amy_id')::uuid]) u
      ))
      and r.payload->'weekdays' = '[]'::jsonb
      and r.result->>'replay' = 'false'
  ), 'canonical payload sorts ids and drops program_days weekdays');
  select count(*) into bad
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'amy_enrollment_id')::uuid
    and e.origin = 'program'
    and e.scheduled_date > biq072_today()
    and e.day_label not in ('Mon', 'Wed', 'Fri');
  perform biq072_check(bad = 0, 'program days stay on Mon Wed Fri');
end $$;

-- pause preserves history, then resume does not insert before today
do $$
declare
  s jsonb;
  result jsonb;
  activity uuid;
  past_before integer;
  past_after integer;
  future_before integer;
begin
  s := biq072_seed('pause-resume');
  insert into public.st_group_activity_series (team_id, workout_id, activity_type, title, start_date, recurrence)
  values ((s->>'team_id')::uuid, (s->>'logged_workout_id')::uuid, 'mobility', 'Extra', biq072_today() + 9, 'none')
  returning id into activity;
  insert into public.st_group_activity_recipients (series_id, user_id)
  values (activity, (s->>'amy_id')::uuid);
  insert into public.st_group_activity_occurrences (series_id, user_id, occurrence_date, original_date, workout_id)
  values (activity, (s->>'amy_id')::uuid, biq072_today() + 9, biq072_today() + 9, (s->>'logged_workout_id')::uuid);

  select count(*) into past_before
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'amy_enrollment_id')::uuid
    and e.origin = 'program'
    and e.scheduled_date < biq072_today();
  select count(*) into future_before
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'amy_enrollment_id')::uuid
    and e.origin = 'program'
    and e.scheduled_date > biq072_today();
  perform biq072_check(future_before > 0, 'pause starts with future program rows');

  result := biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'amy_id')::uuid], null, null, 'pause-1'
  );
  perform biq072_check(result->>'action' = 'pause', 'pause action');
  perform biq072_check((result->>'unchanged_count')::int = 0, 'pause changes a live schedule');
  perform biq072_check(exists (
    select 1 from public.st_training_enrollments e
    where e.id = (s->>'amy_enrollment_id')::uuid and e.expectation_enabled = false
  ), 'pause turns expectation off');
  perform biq072_check(not exists (
    select 1 from public.st_training_expectations e
    where e.enrollment_id = (s->>'amy_enrollment_id')::uuid
      and e.origin = 'program'
      and e.scheduled_date > biq072_today()
  ), 'pause removes future program rows');
  perform biq072_check(exists (
    select 1 from public.st_training_expectations e
    where e.id = (s->>'past_expectation_id')::uuid
  ), 'pause keeps past');
  perform biq072_check(exists (
    select 1 from public.st_workout_sessions ws
    where ws.id = (s->>'session_id')::uuid
      and ws.expectation_id = (s->>'today_expectation_id')::uuid
  ), 'pause keeps logged today expectation_id');
  perform biq072_check(exists (
    select 1 from public.st_training_expectations e
    where e.title = 'ASSIGN-KEEP' and e.origin = 'assignment'
      and e.enrollment_id = (s->>'amy_enrollment_id')::uuid
  ), 'pause keeps assignment origin');
  perform biq072_check(exists (
    select 1 from public.st_training_expectations e
    where e.title = 'PERSONAL-KEEP' and e.enrollment_id = (s->>'personal_enrollment_id')::uuid
  ), 'pause keeps personal');
  perform biq072_check(exists (
    select 1 from public.st_set_logs where id = (s->>'set_log_id')::uuid and actual_reps = '5'
  ), 'pause keeps set logs');
  perform biq072_check(exists (
    select 1 from public.st_group_activity_occurrences where series_id = activity
  ), 'pause keeps group extras');
  perform biq072_check(exists (
    select 1 from public.st_teams where id = (s->>'team_id')::uuid and default_program_id = (s->>'program_id')::uuid
  ), 'pause keeps group default program');
  perform biq072_check(exists (
    select 1 from public.st_program_assignments
    where id = (s->>'program_assignment_id')::uuid and notes = 'keep' and is_active = true
  ), 'pause keeps program assignments');

  result := biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'resume',
    array[(s->>'amy_id')::uuid], null, null, 'resume-1'
  );
  perform biq072_check(result->>'action' = 'resume', 'resume action');
  perform biq072_check((result->>'unchanged_count')::int = 0, 'resume changes a paused schedule');
  perform biq072_check(exists (
    select 1 from public.st_training_enrollments e
    where e.id = (s->>'amy_enrollment_id')::uuid and e.expectation_enabled = true
  ), 'resume turns expectation on');
  select count(*) into past_after
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'amy_enrollment_id')::uuid
    and e.origin = 'program'
    and e.scheduled_date < biq072_today();
  perform biq072_check(past_after = past_before, 'resume does not insert dates before today');
  perform biq072_check(exists (
    select 1 from public.st_training_expectations e
    where e.id = (s->>'past_expectation_id')::uuid
  ), 'resume keeps the past row');
  perform biq072_check(exists (
    select 1 from public.st_training_expectations e
    where e.enrollment_id = (s->>'amy_enrollment_id')::uuid
      and e.origin = 'program'
      and e.scheduled_date >= biq072_today()
  ), 'resume writes today or later');
  perform biq072_check(exists (
    select 1 from public.st_workout_sessions ws
    where ws.expectation_id = (s->>'today_expectation_id')::uuid
  ), 'resume keeps logged today linked');
end $$;

-- already paused and already resumed
do $$
declare
  s jsonb;
  first jsonb;
  second jsonb;
  resumed jsonb;
  future_ids jsonb;
  future_after jsonb;
  paused_at timestamptz;
begin
  s := biq072_seed('unchanged');
  first := biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'amy_id')::uuid], null, null, 'unchanged-pause'
  );
  perform biq072_check((first->>'unchanged_count')::int = 0, 'first pause is a change');
  select e.updated_at into paused_at
  from public.st_training_enrollments e
  where e.id = (s->>'amy_enrollment_id')::uuid;
  second := biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'amy_id')::uuid], 'program_days', array['Mon'], 'unchanged-pause-again'
  );
  perform biq072_check((second->>'member_count')::int = 1, 'second pause still counts the member');
  perform biq072_check((second->>'unchanged_count')::int = 1, 'already paused is unchanged');
  perform biq072_check((
    select e.updated_at from public.st_training_enrollments e where e.id = (s->>'amy_enrollment_id')::uuid
  ) = paused_at, 'already paused does not write the enrollment again');
  perform biq072_check(not exists (
    select 1 from public.st_training_expectations e
    where e.enrollment_id = (s->>'amy_enrollment_id')::uuid
      and e.origin = 'program' and e.scheduled_date > biq072_today()
  ), 'second pause does not need future rows');

  select coalesce(jsonb_agg(e.id order by e.id), '[]'::jsonb) into future_ids
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'ben_enrollment_id')::uuid and e.origin = 'program';
  resumed := biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'resume',
    array[(s->>'ben_id')::uuid], null, null, 'unchanged-resume'
  );
  perform biq072_check((resumed->>'unchanged_count')::int = 1, 'already resumed is unchanged');
  select coalesce(jsonb_agg(e.id order by e.id), '[]'::jsonb) into future_after
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'ben_enrollment_id')::uuid and e.origin = 'program';
  perform biq072_check(future_ids = future_after, 'already resumed does not rewrite rows');
end $$;

-- rollback: inactive, missing, personal-only, paused enrollment, training source, participation
do $$
declare
  s jsonb;
  before jsonb;
  personal_before jsonb;
  err text;
  dana uuid;
  dana_personal uuid;
begin
  s := biq072_seed('rollback');
  before := biq072_snapshot((s->>'amy_enrollment_id')::uuid);
  update public.st_team_members set status = 'removed'
  where team_id = (s->>'team_id')::uuid and user_id = (s->>'ben_id')::uuid;
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'amy_id')::uuid, (s->>'ben_id')::uuid], 'program_days', null, 'rollback-inactive'
  );
  perform biq072_check(err = 'Member not found', 'inactive member: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'amy_enrollment_id')::uuid) = before, 'inactive rolls back amy');
  perform biq072_check(not exists (
    select 1 from public.st_group_schedule_requests where request_key = 'rollback-inactive'
  ), 'inactive writes no request');

  before := biq072_snapshot((s->>'amy_enrollment_id')::uuid);
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'amy_id')::uuid, gen_random_uuid()], null, null, 'rollback-missing'
  );
  perform biq072_check(err = 'Member not found', 'missing member: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'amy_enrollment_id')::uuid) = before, 'missing rolls back amy');

  dana := biq072_user('rollback-dana');
  insert into public.st_team_members (team_id, user_id, role) values ((s->>'team_id')::uuid, dana, 'member');
  insert into public.st_training_enrollments (
    user_id, source_kind, source_key, team_id, program_id, status, schedule_visible, expectation_enabled, starts_on
  ) values (
    dana, 'personal', 'personal', null, (s->>'program_id')::uuid, 'active', true, true, biq072_today() - 5
  ) returning id into dana_personal;
  personal_before := biq072_snapshot(dana_personal);
  before := biq072_snapshot((s->>'amy_enrollment_id')::uuid);
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'amy_id')::uuid, dana], null, null, 'rollback-personal'
  );
  perform biq072_check(err = 'Assign a group plan before changing the schedule', 'personal-only: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'amy_enrollment_id')::uuid) = before, 'personal-only rolls back amy');
  perform biq072_check(biq072_snapshot(dana_personal) = personal_before, 'personal-only does not touch personal rows');

  before := biq072_snapshot((s->>'cara_enrollment_id')::uuid);
  alter table public.st_training_enrollments disable trigger st_training_enrollments_schedule;
  update public.st_training_enrollments set status = 'paused' where id = (s->>'cara_enrollment_id')::uuid;
  alter table public.st_training_enrollments enable trigger st_training_enrollments_schedule;
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'cara_id')::uuid], null, null, 'rollback-paused-enrollment'
  );
  perform biq072_check(err = 'Group enrollment is not active', 'paused enrollment: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'cara_enrollment_id')::uuid) = before, 'paused enrollment keeps future rows');

  update public.st_team_members set status = 'active'
  where team_id = (s->>'team_id')::uuid and user_id = (s->>'ben_id')::uuid;
  before := biq072_snapshot((s->>'ben_enrollment_id')::uuid);
  alter table public.st_training_enrollments disable trigger st_training_enrollments_schedule;
  update public.st_training_enrollments set status = 'ended' where id = (s->>'ben_enrollment_id')::uuid;
  alter table public.st_training_enrollments enable trigger st_training_enrollments_schedule;
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'resume',
    array[(s->>'ben_id')::uuid], null, null, 'rollback-ended-enrollment'
  );
  perform biq072_check(err = 'Group enrollment is not active', 'ended enrollment: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'ben_enrollment_id')::uuid) = before, 'ended enrollment keeps future rows');

  before := biq072_snapshot((s->>'amy_enrollment_id')::uuid);
  update public.st_team_members set training_source = 'personal'
  where team_id = (s->>'team_id')::uuid and user_id = (s->>'amy_id')::uuid;
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'amy_id')::uuid], 'program_days', null, 'rollback-source'
  );
  perform biq072_check(err = 'Personal training cannot be changed here', 'training source: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'amy_enrollment_id')::uuid) = before, 'training source rolls back');

  update public.st_team_members set training_source = 'team', is_active_participant = false
  where team_id = (s->>'team_id')::uuid and user_id = (s->>'amy_id')::uuid;
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'resume',
    array[(s->>'amy_id')::uuid], null, null, 'rollback-participation'
  );
  perform biq072_check(err = 'Member is not an active participant', 'participation: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'amy_enrollment_id')::uuid) = before, 'participation rolls back');
end $$;

-- edit_days while expectation is off does not delete future rows
do $$
declare
  s jsonb;
  before jsonb;
  err text;
  future_count integer;
begin
  s := biq072_seed('edit-disabled');
  alter table public.st_training_enrollments disable trigger st_training_enrollments_schedule;
  update public.st_training_enrollments set expectation_enabled = false
  where id = (s->>'amy_enrollment_id')::uuid;
  alter table public.st_training_enrollments enable trigger st_training_enrollments_schedule;
  select count(*) into future_count
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'amy_enrollment_id')::uuid
    and e.origin = 'program' and e.scheduled_date > biq072_today();
  perform biq072_check(future_count > 0, 'disabled edit still has future rows');
  before := biq072_snapshot((s->>'amy_enrollment_id')::uuid);
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'amy_id')::uuid], 'program_days', null, 'edit-disabled'
  );
  perform biq072_check(err = 'Turn expected training on before editing days', 'disabled edit: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'amy_enrollment_id')::uuid) = before, 'disabled edit deletes nothing');
end $$;

-- future logged program expectation blocks pause and keeps expectation_id
do $$
declare
  s jsonb;
  future_id uuid;
  before jsonb;
  ben_before jsonb;
  err text;
  linked uuid;
begin
  s := biq072_seed('future-session');
  select e.id into future_id
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'amy_enrollment_id')::uuid
    and e.origin = 'program'
    and e.scheduled_date > biq072_today()
  order by e.scheduled_date
  limit 1;
  perform biq072_check(future_id is not null, 'future program row exists');
  insert into public.st_workout_sessions (user_id, workout_id, log_date, expectation_id, source_key, scheduled_date, status)
  select e.user_id, e.workout_id, e.scheduled_date, e.id, e.source_key, e.scheduled_date, 'completed'
  from public.st_training_expectations e
  where e.id = future_id;
  before := biq072_snapshot((s->>'amy_enrollment_id')::uuid);
  ben_before := biq072_snapshot((s->>'ben_enrollment_id')::uuid);
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'ben_id')::uuid, (s->>'amy_id')::uuid], null, null, 'future-session'
  );
  perform biq072_check(err = 'A logged workout is still scheduled after today', 'future session: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'amy_enrollment_id')::uuid) = before, 'future session rolls back amy');
  perform biq072_check(biq072_snapshot((s->>'ben_enrollment_id')::uuid) = ben_before, 'future session rolls back ben');
  select ws.expectation_id into linked from public.st_workout_sessions ws where ws.expectation_id = future_id;
  perform biq072_check(linked = future_id, 'future session keeps expectation_id');
  perform biq072_check(exists (
    select 1 from public.st_training_enrollments e
    where e.id = (s->>'ben_enrollment_id')::uuid and e.expectation_enabled = true
  ), 'failed pause leaves the other member active');
end $$;

-- permissions
do $$
declare
  s jsonb;
  other jsonb;
  other_before jsonb;
  err text;
  result jsonb;
begin
  s := biq072_seed('permissions');
  other := biq072_seed('permissions-other');
  other_before := biq072_snapshot((other->>'amy_enrollment_id')::uuid);

  result := biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'amy_id')::uuid], 'program_days', null, 'perm-owner'
  );
  perform biq072_check((result->>'member_count')::int = 1, 'owner can edit days');

  err := biq072_apply_error(
    (s->>'ordinary_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'amy_id')::uuid], null, null, 'perm-member'
  );
  perform biq072_check(err = 'Not authorized', 'ordinary member: ' || coalesce(err, 'no error'));

  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (other->>'team_id')::uuid, 'pause',
    array[(other->>'amy_id')::uuid], null, null, 'perm-other'
  );
  perform biq072_check(err = 'Not authorized', 'other group: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((other->>'amy_enrollment_id')::uuid) = other_before, 'other group unchanged');

  result := biq072_apply(
    (s->>'manager_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'ben_id')::uuid], null, null, 'perm-manager'
  );
  perform biq072_check((result->>'member_count')::int = 1, 'manager can pause');

  update public.st_teams set members_can_assign_workouts = true where id = (s->>'team_id')::uuid;
  result := biq072_apply(
    (s->>'assigner_id')::uuid, (s->>'team_id')::uuid, 'resume',
    array[(s->>'ben_id')::uuid], null, null, 'perm-assign'
  );
  perform biq072_check((result->>'action') = 'resume', 'assign flag can resume');
  perform biq072_check((result->>'unchanged_count')::int = 0, 'assign-flag resume changes the paused member');
  perform biq072_check(exists (
    select 1 from public.st_training_enrollments e
    where e.id = (s->>'ben_enrollment_id')::uuid and e.expectation_enabled = true
  ), 'assign-flag resume turns expectation on');
end $$;

-- anon cannot execute; authenticated with no user cannot; table is closed
do $$
declare
  s jsonb;
  err text;
begin
  s := biq072_seed('grants');
  perform biq072_check(
    has_function_privilege('anon', 'public.st_apply_group_member_schedules(uuid,text,uuid[],text,text[],date,date,text)', 'EXECUTE') = false,
    'anon execute revoked'
  );
  perform biq072_check(
    has_function_privilege('authenticated', 'public.st_apply_group_member_schedules(uuid,text,uuid[],text,text[],date,date,text)', 'EXECUTE') = true,
    'authenticated can execute'
  );
  perform biq072_check(
    has_function_privilege('public', 'public.st_apply_group_member_schedules(uuid,text,uuid[],text,text[],date,date,text)', 'EXECUTE') = false,
    'public execute revoked'
  );
  perform biq072_check(
    has_table_privilege('authenticated', 'public.st_group_schedule_requests', 'SELECT') = false
    and has_table_privilege('anon', 'public.st_group_schedule_requests', 'INSERT') = false
    and has_table_privilege('public', 'public.st_group_schedule_requests', 'SELECT') = false,
    'request table has no client grants'
  );
  perform biq072_check(
    (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'st_group_schedule_requests'),
    'request table RLS enabled'
  );
  perform biq072_check(
    has_function_privilege('anon', 'public.st_refresh_enrollment_expectations(uuid,date)', 'EXECUTE') = false
    and has_function_privilege('authenticated', 'public.st_refresh_enrollment_expectations(uuid,date)', 'EXECUTE') = false
    and has_function_privilege('public', 'public.st_sync_enrollment_schedule(uuid,date)', 'EXECUTE') = false
    and has_function_privilege('anon', 'public.st_withdraw_future_program_expectations(uuid,date)', 'EXECUTE') = false
    and has_function_privilege('authenticated', 'public.st_withdraw_future_program_expectations(uuid,date)', 'EXECUTE') = false
    and has_function_privilege('service_role', 'public.st_withdraw_future_program_expectations(uuid,date)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.st_refresh_enrollment_expectations(uuid,date)', 'EXECUTE') = false
    and has_function_privilege('service_role', 'public.st_sync_enrollment_schedule(uuid,date)', 'EXECUTE') = false,
    'internal schedule functions are closed except service_role withdraw'
  );

  begin
    execute 'set local role anon';
    perform public.st_withdraw_future_program_expectations((s->>'amy_enrollment_id')::uuid, biq072_today());
    execute 'reset role';
    raise exception 'FAIL: anon withdraw succeeded';
  exception
    when insufficient_privilege then
      execute 'reset role';
    when others then
      execute 'reset role';
      raise;
  end;

  begin
    execute 'set local role service_role';
    perform public.st_withdraw_future_program_expectations((s->>'amy_enrollment_id')::uuid, biq072_today());
    execute 'reset role';
    raise exception 'rollback service withdraw probe';
  exception
    when others then
      execute 'reset role';
      if sqlerrm is distinct from 'rollback service withdraw probe' then
        raise;
      end if;
  end;

  perform set_config('request.jwt.claim.sub', s->>'owner_id', true);
  begin
    execute 'set local role authenticated';
    perform public.st_set_member_training_schedule(
      (s->>'team_id')::uuid, (s->>'amy_id')::uuid, 'program_days', null, biq072_today(), biq072_today()
    );
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  begin
    execute 'set local role anon';
    begin
      perform public.st_apply_group_member_schedules(
        (s->>'team_id')::uuid, 'pause', array[(s->>'amy_id')::uuid], null, null,
        biq072_today(), biq072_today(), 'anon-key'
      );
      raise exception 'FAIL: anon executed the batch';
    exception
      when insufficient_privilege then
        null;
    end;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  perform set_config('request.jwt.claim.sub', '', false);
  begin
    execute 'set local role authenticated';
    begin
      perform public.st_apply_group_member_schedules(
        (s->>'team_id')::uuid, 'pause', array[(s->>'amy_id')::uuid], null, null,
        biq072_today(), biq072_today(), 'no-user'
      );
      raise exception 'FAIL: missing user executed the batch';
    exception
      when others then
        if sqlerrm <> 'Not authenticated' then
          raise exception 'FAIL: unauthenticated got %', sqlerrm;
        end if;
    end;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;
end $$;

-- idempotency, dates, duplicates, size, and custom mismatch
do $$
declare
  s jsonb;
  first jsonb;
  replay jsonb;
  err text;
  before jsonb;
  profile_at timestamptz;
  created_at timestamptz;
  ids uuid[];
  future_program uuid;
  open_segment uuid;
  action text;
begin
  s := biq072_seed('idem');
  first := biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'ben_id')::uuid, (s->>'amy_id')::uuid],
    'custom_weekdays', array['tue', 'thu', 'sat'], 'idem-1'
  );
  select p.updated_at into profile_at
  from public.st_training_schedule_profiles p
  where p.enrollment_id = (s->>'amy_enrollment_id')::uuid;
  select r.created_at into created_at
  from public.st_group_schedule_requests r
  where r.request_key = 'idem-1';
  replay := biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'amy_id')::uuid, (s->>'ben_id')::uuid],
    'custom_weekdays', array['Tue', 'Thu', 'Sat'], 'idem-1'
  );
  perform biq072_check(replay->>'replay' = 'true', 'replay flag');
  perform biq072_check(replay->>'member_count' = first->>'member_count', 'replay returns the first counts');
  perform biq072_check((select count(*) from public.st_group_schedule_requests where request_key = 'idem-1') = 1, 'replay does not insert');
  perform biq072_check((select r.created_at from public.st_group_schedule_requests r where r.request_key = 'idem-1') = created_at, 'replay does not rewrite the request');
  perform biq072_check((select r.result->>'replay' from public.st_group_schedule_requests r where r.request_key = 'idem-1') = 'false', 'stored result stays the first apply');
  perform biq072_check((select p.updated_at from public.st_training_schedule_profiles p where p.enrollment_id = (s->>'amy_enrollment_id')::uuid) = profile_at, 'replay does not write the profile again');

  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'amy_id')::uuid], 'custom_weekdays', array['Sat', 'Tue', 'Thu'], 'idem-1'
  );
  perform biq072_check(err = 'Request key was already used with a different schedule change', 'different weekday order: ' || coalesce(err, 'no error'));

  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'cara_id')::uuid], 'custom_weekdays', array['Tue', 'Thu', 'Sat'], 'idem-1'
  );
  perform biq072_check(err = 'Request key was already used with a different schedule change', 'different members: ' || coalesce(err, 'no error'));

  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'amy_id')::uuid], null, null, 'idem-1'
  );
  perform biq072_check(err = 'Request key was already used with a different schedule change', 'different action: ' || coalesce(err, 'no error'));
  perform biq072_check(exists (
    select 1 from public.st_training_enrollments e
    where e.id = (s->>'amy_enrollment_id')::uuid and e.expectation_enabled = true
  ), 'rejected replay does not pause');

  update public.st_group_schedule_requests
  set payload = jsonb_set(jsonb_set(payload, '{effective_on}', to_jsonb(biq072_today() - 3)), '{local_today}', to_jsonb(biq072_today() - 3))
  where request_key = 'idem-1';
  replay := biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'amy_id')::uuid, (s->>'ben_id')::uuid],
    'custom_weekdays', array['Tue', 'Thu', 'Sat'], 'idem-1',
    biq072_today() - 3, biq072_today() - 3
  );
  perform biq072_check(replay->>'replay' = 'true', 'matching stale payload replays before the date check');

  foreach action in array array['pause', 'resume', 'edit_days'] loop
    err := biq072_apply_error(
      (s->>'owner_id')::uuid, (s->>'team_id')::uuid, action,
      array[(s->>'amy_id')::uuid],
      case when action = 'edit_days' then 'program_days' else null end,
      null,
      'after-today-' || action,
      biq072_today() + 1,
      biq072_today()
    );
    perform biq072_check(err = 'Schedule changes apply on the group date', action || ' after today: ' || coalesce(err, 'no error'));
    perform biq072_check(
      not exists (select 1 from public.st_group_schedule_requests where request_key = 'after-today-' || action),
      action || ' after today writes nothing'
    );
  end loop;

  before := biq072_snapshot((s->>'amy_enrollment_id')::uuid);
  foreach action in array array['pause', 'resume', 'edit_days'] loop
    err := biq072_apply_error(
      (s->>'owner_id')::uuid, (s->>'team_id')::uuid, action,
      array[(s->>'amy_id')::uuid],
      case when action = 'edit_days' then 'program_days' else null end,
      null,
      'outside-window-' || action,
      biq072_today() + 2,
      biq072_today() + 2
    );
    perform biq072_check(err = 'Schedule changes apply on the group date', action || ' outside window: ' || coalesce(err, 'no error'));
    perform biq072_check(
      not exists (select 1 from public.st_group_schedule_requests where request_key = 'outside-window-' || action),
      action || ' outside window writes nothing'
    );
  end loop;
  perform biq072_check(biq072_snapshot((s->>'amy_enrollment_id')::uuid) = before, 'outside window does not clamp');
  perform biq072_check(exists (
    select 1 from public.st_training_enrollments e
    where e.id = (s->>'amy_enrollment_id')::uuid and e.expectation_enabled = true
  ), 'outside window does not pause');

  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'amy_id')::uuid], null, null, 'local-mismatch', biq072_today(), biq072_today() - 1
  );
  perform biq072_check(err = 'Schedule changes apply on the group date', 'local mismatch: ' || coalesce(err, 'no error'));

  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'amy_id')::uuid], null, null, '   '
  );
  perform biq072_check(err = 'Request key is required', 'blank key: ' || coalesce(err, 'no error'));

  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    '{}'::uuid[], null, null, 'empty-ids'
  );
  perform biq072_check(err = 'Select at least one member', 'empty array: ' || coalesce(err, 'no error'));

  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'amy_id')::uuid, null]::uuid[], null, null, 'null-id'
  );
  perform biq072_check(err = 'Member not found', 'null id: ' || coalesce(err, 'no error'));

  before := biq072_snapshot((s->>'amy_enrollment_id')::uuid);
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'amy_id')::uuid, (s->>'amy_id')::uuid], null, null, 'dup-id'
  );
  perform biq072_check(err = 'Duplicate member', 'duplicate: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'amy_enrollment_id')::uuid) = before, 'duplicate changes nobody');

  select array_agg(gen_random_uuid()) into ids from generate_series(1, 501);
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause', ids, null, null, 'too-many'
  );
  perform biq072_check(err = 'Select at most 500 members', 'over 500: ' || coalesce(err, 'no error'));

  before := biq072_snapshot((s->>'cara_enrollment_id')::uuid);
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'cara_id')::uuid], 'custom_weekdays', array['Mon', 'Tue'], 'bad-days'
  );
  perform biq072_check(err like '%workouts each week%', 'custom mismatch: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'cara_enrollment_id')::uuid) = before, 'custom mismatch changes nobody');
  perform biq072_check(not exists (
    select 1 from public.st_training_schedule_profiles p
    where p.enrollment_id = (s->>'cara_enrollment_id')::uuid and p.mode = 'custom_weekdays'
  ), 'custom mismatch does not save a profile');

  insert into public.st_programs (owner_user_id, team_id, visibility, name, weeks, start_date, status)
  values ((s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'team', 'Short', 1, biq072_today(), 'published')
  returning id into future_program;
  insert into public.st_workouts (program_id, week, day_order, day_label, workout_type) values
    (future_program, 1, 0, 'Mon', 'Short A'),
    (future_program, 1, 1, 'Wed', 'Short B');
  select id into open_segment from public.st_training_program_segments
  where enrollment_id = (s->>'cara_enrollment_id')::uuid and ends_on is null;
  update public.st_training_program_segments set ends_on = biq072_today() + 20 where id = open_segment;
  insert into public.st_training_program_segments (enrollment_id, program_id, starts_on)
  values ((s->>'cara_enrollment_id')::uuid, future_program, biq072_today() + 21);
  before := biq072_snapshot((s->>'cara_enrollment_id')::uuid);
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'cara_id')::uuid], 'custom_weekdays', array['Tue', 'Thu', 'Sat'], 'future-segment'
  );
  perform biq072_check(err like '%workouts each week%', 'future segment mismatch: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'cara_enrollment_id')::uuid) = before, 'future segment mismatch changes nobody');
end $$;

-- group activity collision and schedule override reapply
do $$
declare
  s jsonb;
  err text;
  before jsonb;
  monday_workout uuid;
  monday_date date;
  series uuid;
  moved date;
begin
  s := biq072_seed('collision');
  select e.workout_id, e.scheduled_date into monday_workout, monday_date
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'amy_enrollment_id')::uuid
    and e.origin = 'program'
    and e.day_label = 'Mon'
    and e.scheduled_date > biq072_today()
  order by e.scheduled_date
  limit 1;
  perform biq072_check(monday_workout is not null, 'collision has a future Monday');
  insert into public.st_group_activity_series (team_id, workout_id, activity_type, title, start_date, recurrence)
  values ((s->>'team_id')::uuid, monday_workout, 'strength', 'Collision', monday_date, 'none')
  returning id into series;
  insert into public.st_group_activity_recipients (series_id, user_id) values (series, (s->>'amy_id')::uuid);
  insert into public.st_group_activity_occurrences (series_id, user_id, occurrence_date, original_date, workout_id)
  values (series, (s->>'amy_id')::uuid, monday_date, monday_date, monday_workout);
  before := biq072_snapshot((s->>'amy_enrollment_id')::uuid);
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'ben_id')::uuid, (s->>'amy_id')::uuid], 'program_days', null, 'collision'
  );
  perform biq072_check(err = 'That workout is already on this date as a group activity', 'collision: ' || coalesce(err, 'no error'));
  perform biq072_check(biq072_snapshot((s->>'amy_enrollment_id')::uuid) = before, 'collision rolls back amy');
  perform biq072_check(exists (
    select 1 from public.st_group_activity_occurrences where series_id = series
  ), 'collision does not delete the activity');
  perform biq072_check(not exists (
    select 1 from public.st_training_schedule_profiles p
    where p.enrollment_id = (s->>'ben_enrollment_id')::uuid
  ), 'collision does not save the other member');

  select e.scheduled_date into moved
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'ben_enrollment_id')::uuid
    and e.origin = 'program'
    and e.day_label = 'Mon'
    and e.scheduled_date > biq072_today()
    and not public.st_expectation_has_session(e.id)
  order by e.scheduled_date
  limit 1;
  perform biq072_check(moved is not null, 'override has a future Monday');
  insert into public.st_training_schedule_overrides (
    enrollment_id, workout_id, original_scheduled_date, action, new_scheduled_date, created_by
  )
  select e.enrollment_id, e.workout_id, e.scheduled_date, 'move', e.scheduled_date + 1, (s->>'owner_id')::uuid
  from public.st_training_expectations e
  where e.enrollment_id = (s->>'ben_enrollment_id')::uuid
    and e.scheduled_date = moved
    and e.origin = 'program'
  limit 1;
  perform biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'edit_days',
    array[(s->>'ben_id')::uuid], 'program_days', null, 'override-refresh'
  );
  perform biq072_check(exists (
    select 1 from public.st_training_schedule_overrides o
    where o.enrollment_id = (s->>'ben_enrollment_id')::uuid
      and o.original_scheduled_date = moved
      and o.action = 'move'
  ), 'refresh keeps the override row');
  perform biq072_check(exists (
    select 1 from public.st_training_expectations e
    join public.st_training_schedule_overrides o
      on o.enrollment_id = e.enrollment_id
     and o.workout_id = e.workout_id
     and o.original_scheduled_date = moved
     and o.action = 'move'
    where e.enrollment_id = (s->>'ben_enrollment_id')::uuid
      and e.scheduled_date = o.new_scheduled_date
  ), 'refresh reapplies the override');
end $$;

-- The group date is the only accepted effective date. A neighboring caller date does not pause anyone.
do $$
declare
  s jsonb;
  err text;
  enabled boolean;
  group_date date;
  other_date date;
begin
  s := biq072_seed('group-date');
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'ben_id')::uuid], null, null, 'not-group-date',
    biq072_today() + 1, biq072_today() + 1
  );
  perform biq072_check(err = 'Schedule changes apply on the group date', 'neighbor date rejected: ' || coalesce(err, 'no error'));
  select e.expectation_enabled into enabled
  from public.st_training_enrollments e
  where e.id = (s->>'ben_enrollment_id')::uuid;
  perform biq072_check(enabled, 'rejected neighbor date does not pause');

  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'ben_id')::uuid], null, null, 'mismatched-local',
    biq072_today(), biq072_today() + 1
  );
  perform biq072_check(err = 'Schedule changes apply on the group date', 'mismatched local today rejected: ' || coalesce(err, 'no error'));

  update public.st_teams set timezone = null where id = (s->>'team_id')::uuid;
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'amy_id')::uuid], null, null, 'null-zone',
    biq072_today(), biq072_today()
  );
  perform biq072_check(err = 'Set a group timezone before changing schedules', 'null timezone rejected: ' || coalesce(err, 'no error'));

  perform set_config('request.jwt.claim.sub', s->>'owner_id', true);
  perform public.st_set_member_training_schedule(
    (s->>'team_id')::uuid, (s->>'amy_id')::uuid, 'program_days', null, biq072_today(), biq072_today()
  );

  begin
    update public.st_teams set timezone = 'EST' where id = (s->>'team_id')::uuid;
    raise exception 'FAIL: abbreviation was stored';
  exception
    when others then
      if sqlerrm = 'FAIL: abbreviation was stored' then
        raise;
      end if;
      perform biq072_check(sqlerrm = 'Invalid group timezone', 'abbreviation rejected: ' || sqlerrm);
  end;

  update public.st_teams set timezone = 'Pacific/Kiritimati' where id = (s->>'team_id')::uuid;
  group_date := (timezone('Pacific/Kiritimati', now()))::date;
  other_date := (timezone('Pacific/Pago_Pago', now()))::date;
  perform biq072_check(group_date is distinct from other_date, 'zone dates differ');
  err := biq072_apply_error(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'cara_id')::uuid], null, null, 'other-zone-date',
    other_date, other_date
  );
  perform biq072_check(err = 'Schedule changes apply on the group date', 'other zone date rejected: ' || coalesce(err, 'no error'));
  perform biq072_apply(
    (s->>'owner_id')::uuid, (s->>'team_id')::uuid, 'pause',
    array[(s->>'cara_id')::uuid], null, null, 'group-zone-date',
    group_date, group_date
  );
  perform biq072_check(exists (
    select 1 from public.st_training_enrollments e
    where e.id = (s->>'cara_enrollment_id')::uuid and e.expectation_enabled = false
  ), 'group zone date pauses');
  perform set_config('TimeZone', 'UTC', true);
end $$;

do $$
begin
  raise notice 'biq072 sql tests passed';
end $$;
