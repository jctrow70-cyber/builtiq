-- BIQ-0262 Phase 2 Assign Training wizard
-- Apply manually after 20261007_059_unified_training_schedule.sql. Do not run this from the app.
-- One transaction assigns every selected member, or nobody. Personal enrollments are not updated.
-- A future start keeps the current group program until that date. Custom weekdays and schedule overrides are later phases.

create table if not exists public.st_group_assignment_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  request_key text not null,
  requested_by uuid not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (team_id, request_key)
);

comment on table public.st_group_assignment_requests is
  'Idempotency keys for group assignment. A retried key returns the first committed result and does not insert again.';

alter table public.st_group_assignment_requests enable row level security;
revoke all on table public.st_group_assignment_requests from public, anon, authenticated;

create or replace function public.st_training_enrollment_schedule_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective date;
begin
  if current_setting('app.skip_enrollment_schedule', true) = '1' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.program_id is not distinct from old.program_id
     and new.expectation_enabled is not distinct from old.expectation_enabled
     and new.status is not distinct from old.status then
    return new;
  end if;
  v_effective := coalesce(nullif(current_setting('app.expectation_effective_on', true), '')::date, current_date);
  perform public.st_sync_enrollment_schedule(new.id, v_effective);
  return new;
end;
$$;

create or replace function public.st_refresh_enrollment_expectations(
  p_enrollment_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enroll public.st_training_enrollments%rowtype;
  v_program public.st_programs%rowtype;
  v_segment record;
  v_segment_id uuid;
  v_anchor date;
  v_weeks integer;
  v_end date;
  v_from date;
  v_limit date;
  v_floor date;
  v_date date;
  v_week integer;
  v_today_frozen boolean;
  v_workout record;
  v_has_segment boolean := false;
begin
  select * into v_enroll from public.st_training_enrollments where id = p_enrollment_id;
  if not found or v_enroll.program_id is null then
    return;
  end if;

  perform set_config('app.expectation_effective_on', p_effective_on::text, true);
  v_today_frozen := exists (
    select 1
    from public.st_training_expectations e
    where e.enrollment_id = v_enroll.id
      and e.origin = 'program'
      and e.scheduled_date = p_effective_on
      and public.st_expectation_has_session(e.id)
  );

  delete from public.st_training_expectations e
  where e.enrollment_id = v_enroll.id
    and e.origin = 'program'
    and e.scheduled_date > p_effective_on;

  if not v_today_frozen then
    delete from public.st_training_expectations e
    where e.enrollment_id = v_enroll.id
      and e.origin = 'program'
      and e.scheduled_date = p_effective_on
      and not public.st_expectation_has_session(e.id);
  end if;

  if v_enroll.status <> 'active' or not v_enroll.expectation_enabled then
    return;
  end if;

  for v_segment in
    select s.id, s.program_id, s.starts_on, s.ends_on
    from public.st_training_program_segments s
    where s.enrollment_id = v_enroll.id
      and (s.ends_on is null or s.ends_on >= p_effective_on)
    order by s.starts_on
  loop
    v_has_segment := true;
    select * into v_program from public.st_programs where id = v_segment.program_id;
    if not found then
      continue;
    end if;
    v_segment_id := v_segment.id;
    v_weeks := public.st_program_cycle_weeks(v_program.weeks::numeric, v_program.cycle_length_weeks::numeric);
    v_anchor := public.st_schedule_monday(
      case
        when v_enroll.source_kind = 'personal' then coalesce(v_enroll.starts_on, v_program.start_date, p_effective_on)
        else coalesce(v_program.start_date, v_segment.starts_on, p_effective_on)
      end
    );
    v_end := v_anchor + (v_weeks * 7 - 1);
    v_floor := v_segment.starts_on;
    if v_segment.program_id = v_enroll.program_id then
      v_floor := greatest(v_floor, coalesce(v_enroll.starts_on, v_floor));
    end if;
    v_from := greatest(p_effective_on, v_floor);
    v_limit := v_end;
    if v_segment.ends_on is not null and v_segment.ends_on < v_limit then
      v_limit := v_segment.ends_on;
    end if;
    if v_from > v_limit then
      continue;
    end if;

    v_date := v_from;
    while v_date <= v_limit loop
      if v_today_frozen and v_date = p_effective_on then
        v_date := v_date + 1;
        continue;
      end if;
      v_week := ((v_date - v_anchor) / 7) + 1;
      if v_week >= 1 and v_week <= v_weeks then
        for v_workout in
          select w.id, w.day_label, w.workout_type
          from public.st_workouts w
          where w.program_id = v_segment.program_id
            and w.week = v_week
            and w.day_label = public.st_schedule_day_label(v_date)
        loop
          insert into public.st_training_expectations (
            user_id, source_key, team_id, enrollment_id, program_id, segment_id, workout_id,
            scheduled_date, title, day_label, origin, excused
          ) values (
            v_enroll.user_id,
            v_enroll.source_key,
            v_enroll.team_id,
            v_enroll.id,
            v_segment.program_id,
            v_segment_id,
            v_workout.id,
            v_date,
            coalesce(nullif(trim(v_workout.workout_type), ''), nullif(trim(v_workout.day_label), ''), 'Workout'),
            v_workout.day_label,
            'program',
            false
          )
          on conflict (user_id, source_key, workout_id, scheduled_date)
            where origin = 'program' and workout_id is not null
            do nothing;
        end loop;
      end if;
      v_date := v_date + 1;
    end loop;
  end loop;

  if v_has_segment then
    return;
  end if;

  select * into v_program from public.st_programs where id = v_enroll.program_id;
  if not found then
    return;
  end if;
  v_weeks := public.st_program_cycle_weeks(v_program.weeks::numeric, v_program.cycle_length_weeks::numeric);
  v_anchor := public.st_schedule_monday(
    case
      when v_enroll.source_kind = 'personal' then coalesce(v_enroll.starts_on, v_program.start_date, p_effective_on)
      else coalesce(v_program.start_date, v_enroll.starts_on, p_effective_on)
    end
  );
  v_end := v_anchor + (v_weeks * 7 - 1);
  v_from := greatest(p_effective_on, coalesce(v_enroll.starts_on, p_effective_on));
  if v_from > v_end then
    return;
  end if;
  v_date := v_from;
  while v_date <= v_end loop
    if v_today_frozen and v_date = p_effective_on then
      v_date := v_date + 1;
      continue;
    end if;
    v_week := ((v_date - v_anchor) / 7) + 1;
    if v_week >= 1 and v_week <= v_weeks then
      for v_workout in
        select w.id, w.day_label, w.workout_type
        from public.st_workouts w
        where w.program_id = v_enroll.program_id
          and w.week = v_week
          and w.day_label = public.st_schedule_day_label(v_date)
      loop
        insert into public.st_training_expectations (
          user_id, source_key, team_id, enrollment_id, program_id, segment_id, workout_id,
          scheduled_date, title, day_label, origin, excused
        ) values (
          v_enroll.user_id,
          v_enroll.source_key,
          v_enroll.team_id,
          v_enroll.id,
          v_enroll.program_id,
          null,
          v_workout.id,
          v_date,
          coalesce(nullif(trim(v_workout.workout_type), ''), nullif(trim(v_workout.day_label), ''), 'Workout'),
          v_workout.day_label,
          'program',
          false
        )
        on conflict (user_id, source_key, workout_id, scheduled_date)
          where origin = 'program' and workout_id is not null
          do nothing;
      end loop;
    end if;
    v_date := v_date + 1;
  end loop;
end;
$$;

create or replace function public.st_sync_enrollment_schedule(
  p_enrollment_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enroll public.st_training_enrollments%rowtype;
  v_segment_id uuid;
  v_segment_program uuid;
  v_segment_start date;
  v_due_program uuid;
  v_due_start date;
begin
  select * into v_enroll from public.st_training_enrollments where id = p_enrollment_id;
  if not found then
    return;
  end if;

  perform set_config('app.expectation_effective_on', p_effective_on::text, true);

  select s.program_id, s.starts_on
    into v_due_program, v_due_start
  from public.st_training_program_segments s
  where s.enrollment_id = v_enroll.id
    and s.ends_on is null
    and s.starts_on <= p_effective_on
  order by s.starts_on desc
  limit 1;

  if v_due_program is not null
     and v_due_program is distinct from v_enroll.program_id
     and v_enroll.source_key <> 'personal' then
    perform set_config('app.skip_enrollment_schedule', '1', true);
    update public.st_training_enrollments
    set program_id = v_due_program,
        starts_on = v_due_start,
        updated_at = now()
    where id = v_enroll.id
      and source_key <> 'personal';
    perform set_config('app.skip_enrollment_schedule', '', true);
    select * into v_enroll from public.st_training_enrollments where id = p_enrollment_id;
  end if;

  if v_enroll.program_id is not null and v_enroll.status = 'active' then
    select s.id, s.program_id, s.starts_on
      into v_segment_id, v_segment_program, v_segment_start
    from public.st_training_program_segments s
    where s.enrollment_id = v_enroll.id and s.ends_on is null
    order by s.starts_on desc
    limit 1;

    if v_segment_id is not null
       and v_segment_start > p_effective_on
       and v_segment_program is distinct from v_enroll.program_id then
      -- A future segment stays in place. Refresh writes both the current and the upcoming program.
      v_segment_id := v_segment_id;
    elsif v_segment_id is null then
      insert into public.st_training_program_segments (enrollment_id, program_id, starts_on)
      values (v_enroll.id, v_enroll.program_id, coalesce(v_enroll.starts_on, p_effective_on));
    elsif v_segment_program is distinct from v_enroll.program_id then
      if v_segment_start >= p_effective_on then
        update public.st_training_program_segments
        set program_id = v_enroll.program_id
        where id = v_segment_id;
      else
        update public.st_training_program_segments
        set ends_on = p_effective_on - 1
        where id = v_segment_id and ends_on is null;
        insert into public.st_training_program_segments (enrollment_id, program_id, starts_on)
        values (v_enroll.id, v_enroll.program_id, p_effective_on);
      end if;
    end if;
  end if;

  if v_enroll.status = 'active' and v_enroll.expectation_enabled and v_enroll.program_id is not null then
    perform public.st_refresh_enrollment_expectations(v_enroll.id, p_effective_on);
  else
    perform public.st_withdraw_future_program_expectations(v_enroll.id, p_effective_on);
  end if;
end;
$$;

create or replace function public.st_place_group_program(
  p_team_id uuid,
  p_member_user_id uuid,
  p_program_id uuid,
  p_starts_on date,
  p_today date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_id uuid;
  v_current uuid;
begin
  v_key := 'group:' || p_team_id::text;
  if p_team_id is null or v_key = 'personal' then
    raise exception 'Refusing to change personal training';
  end if;

  select e.id, e.program_id
    into v_id, v_current
  from public.st_training_enrollments e
  where e.user_id = p_member_user_id
    and e.source_key = v_key
    and e.source_kind = 'group';

  if v_id is null then
    perform set_config('app.expectation_effective_on', p_today::text, true);
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      p_member_user_id, 'group', v_key, p_team_id, p_program_id, 'active', true, true, p_starts_on
    );
    return;
  end if;

  if p_starts_on > p_today and v_current is not null and v_current = p_program_id then
    return;
  end if;

  if p_starts_on > p_today and v_current is not null and v_current is distinct from p_program_id then
    update public.st_training_program_segments
    set ends_on = p_starts_on - 1
    where enrollment_id = v_id
      and ends_on is null
      and starts_on < p_starts_on;

    update public.st_training_program_segments
    set program_id = p_program_id,
        starts_on = p_starts_on
    where enrollment_id = v_id
      and ends_on is null;

    if not found then
      insert into public.st_training_program_segments (enrollment_id, program_id, starts_on)
      values (v_id, p_program_id, p_starts_on);
    end if;

    perform set_config('app.expectation_effective_on', p_today::text, true);
    perform public.st_refresh_enrollment_expectations(v_id, p_today);
    return;
  end if;

  delete from public.st_training_program_segments
  where enrollment_id = v_id
    and ends_on is null
    and starts_on > p_today;

  perform set_config('app.expectation_effective_on', p_today::text, true);
  update public.st_training_enrollments
  set program_id = p_program_id,
      starts_on = p_starts_on,
      status = 'active',
      schedule_visible = true,
      expectation_enabled = true,
      ended_on = null,
      updated_at = now()
  where id = v_id
    and source_kind = 'group'
    and source_key <> 'personal';

  perform public.st_sync_enrollment_schedule(v_id, p_today);
end;
$$;

revoke all on function public.st_place_group_program(uuid, uuid, uuid, date, date) from public, anon, authenticated;

create or replace function public.st_assign_member_program(
  p_team_id uuid,
  p_member_user_id uuid,
  p_assignment_type text,
  p_program_id uuid default null,
  p_notes text default null,
  p_coaching_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_starts date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if p_assignment_type not in ('personal', 'team', 'individual_team', 'manual') then
    raise exception 'Invalid assignment type';
  end if;
  if p_assignment_type in ('individual_team', 'manual') and p_program_id is null then
    raise exception 'Select a program for this assignment type';
  end if;
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = p_member_user_id and status = 'active'
  ) then
    raise exception 'Member not found';
  end if;

  v_starts := coalesce(nullif(p_coaching_metadata->>'starts_on', '')::date, current_date);

  update public.st_program_assignments
  set is_active = false
  where user_id = p_member_user_id and team_id = p_team_id and is_active = true;

  insert into public.st_program_assignments (
    user_id, team_id, assigned_by, assignment_type, program_id, notes, is_active, target_type, coaching_metadata
  ) values (
    p_member_user_id,
    p_team_id,
    auth.uid(),
    p_assignment_type,
    p_program_id,
    nullif(trim(p_notes), ''),
    true,
    'individual',
    coalesce(p_coaching_metadata, '{}'::jsonb)
  )
  returning id into v_assignment_id;

  update public.st_team_members
  set training_source = case when p_assignment_type = 'personal' then 'personal' else 'team' end
  where team_id = p_team_id and user_id = p_member_user_id and status = 'active';

  if p_program_id is not null and p_assignment_type <> 'personal' then
    perform public.st_place_group_program(
      p_team_id, p_member_user_id, p_program_id, v_starts, current_date
    );
  end if;

  perform public.st_notify_program_assignment(
    v_assignment_id, p_team_id, p_member_user_id, p_program_id, p_assignment_type
  );
end;
$$;

create or replace function public.st_assign_group_programs(
  p_team_id uuid,
  p_member_user_ids uuid[],
  p_program_id uuid,
  p_starts_on date,
  p_notes text default null,
  p_request_key text default null,
  p_assignment_type text default 'individual_team',
  p_set_as_group_default boolean default false,
  p_local_today date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_ids uuid[];
  v_uid uuid;
  v_assignment_id uuid;
  v_key text;
  v_prior jsonb;
  v_result jsonb;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if p_assignment_type not in ('individual_team', 'manual') then
    raise exception 'Invalid assignment type';
  end if;
  if p_program_id is null or p_starts_on is null then
    raise exception 'Select a program and a start date';
  end if;
  if not exists (
    select 1
    from public.st_programs p
    where p.id = p_program_id
      and p.team_id = p_team_id
      and p.visibility = 'team'
      and coalesce(p.status, 'published') not in ('draft', 'archived')
  ) then
    raise exception 'Publish a group program before assigning it';
  end if;

  select coalesce(array_agg(distinct uid), '{}')
    into v_ids
  from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) as uid
  where uid is not null;

  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'Select at least one member';
  end if;

  -- Validate every recipient before any assignment write so one bad member rolls the whole request back.
  if exists (
    select 1
    from unnest(v_ids) as uid
    where not exists (
      select 1
      from public.st_team_members tm
      where tm.team_id = p_team_id
        and tm.user_id = uid
        and tm.status = 'active'
    )
  ) then
    raise exception 'Member not found';
  end if;

  v_today := coalesce(p_local_today, current_date);
  if v_today < current_date - 1 or v_today > current_date + 1 then
    v_today := current_date;
  end if;

  v_key := nullif(btrim(coalesce(p_request_key, '')), '');
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext(p_team_id::text || ':' || v_key)::bigint);
    select r.result
      into v_prior
    from public.st_group_assignment_requests r
    where r.team_id = p_team_id
      and r.request_key = v_key;
    if found then
      return v_prior;
    end if;
  end if;

  foreach v_uid in array v_ids loop
    update public.st_program_assignments
    set is_active = false
    where user_id = v_uid and team_id = p_team_id and is_active = true;

    insert into public.st_program_assignments (
      user_id, team_id, assigned_by, assignment_type, program_id, notes, is_active, target_type, coaching_metadata
    ) values (
      v_uid,
      p_team_id,
      auth.uid(),
      p_assignment_type,
      p_program_id,
      nullif(btrim(coalesce(p_notes, '')), ''),
      true,
      'individual',
      jsonb_build_object('starts_on', p_starts_on, 'request_key', v_key)
    )
    returning id into v_assignment_id;

    update public.st_team_members
    set training_source = 'team'
    where team_id = p_team_id and user_id = v_uid and status = 'active';

    perform public.st_place_group_program(p_team_id, v_uid, p_program_id, p_starts_on, v_today);
    perform public.st_notify_program_assignment(
      v_assignment_id, p_team_id, v_uid, p_program_id, p_assignment_type
    );
    v_count := v_count + 1;
  end loop;

  if p_set_as_group_default then
    perform public.st_set_group_default_program(p_team_id, p_program_id, p_starts_on);
  end if;

  v_result := jsonb_build_object(
    'member_count', v_count,
    'program_id', p_program_id,
    'starts_on', p_starts_on,
    'request_key', v_key
  );

  if v_key is not null then
    insert into public.st_group_assignment_requests (team_id, request_key, requested_by, result)
    values (p_team_id, v_key, auth.uid(), v_result);
  end if;

  return v_result;
end;
$$;

drop function if exists public.st_set_group_default_program(uuid, uuid);

create or replace function public.st_set_group_default_program(
  p_team_id uuid,
  p_program_id uuid,
  p_starts_on date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
  v_starts date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;

  if p_program_id is not null and not exists (
    select 1
    from public.st_programs p
    where p.id = p_program_id
      and p.team_id = p_team_id
      and p.visibility = 'team'
      and coalesce(p.status, 'published') <> 'draft'
      and coalesce(p.status, 'published') <> 'archived'
  ) then
    raise exception 'Publish a group program before setting it as the group default';
  end if;

  update public.st_teams
  set default_program_id = p_program_id
  where id = p_team_id;

  if p_program_id is null then
    return;
  end if;

  v_starts := coalesce(p_starts_on, current_date);

  for v_member in
    select tm.user_id
    from public.st_team_members tm
    where tm.team_id = p_team_id
      and tm.status = 'active'
      and tm.is_active_participant = true
      and not exists (
        select 1
        from public.st_program_assignments a
        where a.team_id = tm.team_id
          and a.user_id = tm.user_id
          and a.is_active = true
          and a.assignment_type in ('personal', 'individual_team', 'manual')
      )
      and not (
        coalesce(tm.training_source, 'team') = 'personal'
        and not exists (
          select 1
          from public.st_program_assignments a
          where a.team_id = tm.team_id
            and a.user_id = tm.user_id
            and a.is_active = true
            and a.assignment_type in ('individual_team', 'manual')
        )
      )
  loop
    perform public.st_place_group_program(
      p_team_id, v_member.user_id, p_program_id, v_starts, current_date
    );
    update public.st_program_assignments
    set program_id = p_program_id
    where user_id = v_member.user_id
      and team_id = p_team_id
      and is_active = true
      and assignment_type = 'team';
  end loop;
end;
$$;

revoke all on function public.st_set_group_default_program(uuid, uuid, date) from public, anon;
grant execute on function public.st_set_group_default_program(uuid, uuid, date) to authenticated;

create or replace function public.st_apply_group_due_segments(
  p_team_id uuid,
  p_today date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_today date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1
    from public.st_team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  v_today := coalesce(p_today, current_date);
  if v_today < current_date - 1 or v_today > current_date + 1 then
    v_today := current_date;
  end if;

  for v_id in
    select e.id
    from public.st_training_enrollments e
    join public.st_training_program_segments s
      on s.enrollment_id = e.id
     and s.ends_on is null
     and s.starts_on <= v_today
    where e.team_id = p_team_id
      and e.source_kind = 'group'
      and e.source_key = 'group:' || p_team_id::text
      and e.source_key <> 'personal'
      and s.program_id is distinct from e.program_id
  loop
    perform public.st_sync_enrollment_schedule(v_id, v_today);
  end loop;
end;
$$;

create or replace function public.st_assign_group_workout(
  p_team_id uuid,
  p_workout_id uuid,
  p_program_id uuid,
  p_target_type text,
  p_target_classification_id uuid default null,
  p_target_user_ids uuid[] default null,
  p_scheduled_date date default current_date,
  p_due_date date default null,
  p_notes text default null,
  p_request_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_prior jsonb;
  v_assignment uuid;
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if p_workout_id is null or p_scheduled_date is null then
    raise exception 'Select a workout and date';
  end if;
  if p_target_type not in ('group', 'classification', 'members', 'individual') then
    raise exception 'Invalid target type';
  end if;
  if not exists (
    select 1
    from public.st_workouts w
    join public.st_programs p on p.id = w.program_id
    where w.id = p_workout_id
      and p.team_id = p_team_id
      and p.visibility = 'team'
  ) then
    raise exception 'Publish a group program before assigning it';
  end if;

  if p_target_type in ('members', 'individual') then
    select coalesce(array_agg(distinct uid), '{}')
      into v_ids
    from unnest(coalesce(p_target_user_ids, '{}'::uuid[])) as uid
    where uid is not null;
    if cardinality(v_ids) = 0 then
      raise exception 'Select at least one member';
    end if;
    if exists (
      select 1
      from unnest(v_ids) as uid
      where not exists (
        select 1 from public.st_team_members tm
        where tm.team_id = p_team_id and tm.user_id = uid and tm.status = 'active'
      )
    ) then
      raise exception 'Member not found';
    end if;
  elsif p_target_type = 'classification' then
    if p_target_classification_id is null then
      raise exception 'Classification target requires target_classification_id';
    end if;
    if not exists (
      select 1
      from public.st_team_members tm
      join public.st_group_member_classifications gmc on gmc.member_id = tm.id
      where tm.team_id = p_team_id
        and tm.status = 'active'
        and tm.is_active_participant = true
        and gmc.classification_id = p_target_classification_id
    ) then
      raise exception 'Member not found';
    end if;
  end if;

  v_key := nullif(btrim(coalesce(p_request_key, '')), '');
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext(p_team_id::text || ':workout:' || v_key)::bigint);
    select r.result into v_prior
    from public.st_group_assignment_requests r
    where r.team_id = p_team_id and r.request_key = 'workout:' || v_key;
    if found then
      return v_prior;
    end if;
  end if;

  v_assignment := public.st_assign_workout_to_targets(
    p_team_id,
    p_workout_id,
    p_program_id,
    null,
    p_target_type,
    p_target_classification_id,
    case when p_target_type in ('members', 'individual') then v_ids else p_target_user_ids end,
    p_scheduled_date,
    p_due_date,
    null,
    p_notes,
    jsonb_build_object('request_key', v_key)
  );

  v_prior := jsonb_build_object('assignment_id', v_assignment, 'request_key', v_key);
  if v_key is not null then
    insert into public.st_group_assignment_requests (team_id, request_key, requested_by, result)
    values (p_team_id, 'workout:' || v_key, auth.uid(), v_prior);
  end if;
  return v_prior;
end;
$$;

revoke all on function public.st_assign_group_programs(uuid, uuid[], uuid, date, text, text, text, boolean, date) from public, anon;
revoke all on function public.st_assign_group_workout(uuid, uuid, uuid, text, uuid, uuid[], date, date, text, text) from public, anon;
revoke all on function public.st_apply_group_due_segments(uuid, date) from public, anon;

grant execute on function public.st_assign_group_programs(uuid, uuid[], uuid, date, text, text, text, boolean, date) to authenticated;
grant execute on function public.st_assign_group_workout(uuid, uuid, uuid, text, uuid, uuid[], date, date, text, text) to authenticated;
grant execute on function public.st_apply_group_due_segments(uuid, date) to authenticated;
