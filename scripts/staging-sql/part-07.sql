-- BuildIQ Staging schema replay part 7

-- ===== 20261012_062_group_assignment_wizard.sql =====

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


-- ===== 20261012_063_member_training_schedules.sql =====

-- BIQ-0262 Phase 3 per-member Group training schedules
-- Apply manually after 20261012_062_group_assignment_wizard.sql. Do not run this from the app.
-- A schedule profile belongs to the group enrollment. The shared program is not copied.
-- program_days keeps the existing day-label placement. custom_weekdays maps session order onto that member's days.
-- A custom profile whose weekday count no longer matches the program is left in place: future expectations are not rewritten.

create table if not exists public.st_training_schedule_profiles (
  enrollment_id uuid primary key references public.st_training_enrollments(id) on delete cascade,
  mode text not null default 'program_days' check (mode in ('program_days', 'custom_weekdays')),
  weekdays text[] not null default '{}'::text[],
  cycle_anchor date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.st_training_schedule_profiles is
  'When a group member trains. program_days follows the shared program. custom_weekdays keeps the same workouts on that member''s days.';

alter table public.st_training_schedule_profiles enable row level security;

drop policy if exists "training_schedule_profiles_select" on public.st_training_schedule_profiles;
create policy "training_schedule_profiles_select" on public.st_training_schedule_profiles
  for select using (
    exists (
      select 1
      from public.st_training_enrollments e
      where e.id = enrollment_id
        and (
          e.user_id = auth.uid()
          or (e.team_id is not null and public.st_user_can_edit_team(e.team_id))
          or (e.team_id is not null and public.st_user_can_assign_in_group(e.team_id))
        )
    )
  );

revoke insert, update, delete on public.st_training_schedule_profiles from public, anon, authenticated;
grant select on public.st_training_schedule_profiles to authenticated;

insert into public.st_training_schedule_profiles (enrollment_id, mode, weekdays)
select e.id, 'program_days', '{}'::text[]
from public.st_training_enrollments e
where e.source_kind = 'group'
  and e.source_key <> 'personal'
on conflict (enrollment_id) do nothing;

create or replace function public.st_normalize_program_day(p_label text)
returns text
language sql
immutable
as $$
  select case lower(btrim(coalesce(p_label, '')))
    when 'mon' then 'Mon' when 'monday' then 'Mon'
    when 'tue' then 'Tue' when 'tues' then 'Tue' when 'tuesday' then 'Tue'
    when 'wed' then 'Wed' when 'wednesday' then 'Wed'
    when 'thu' then 'Thu' when 'thur' then 'Thu' when 'thurs' then 'Thu' when 'thursday' then 'Thu'
    when 'fri' then 'Fri' when 'friday' then 'Fri'
    when 'sat' then 'Sat' when 'saturday' then 'Sat'
    when 'sun' then 'Sun' when 'sunday' then 'Sun'
    else ''
  end;
$$;

create or replace function public.st_program_day_index(p_label text)
returns integer
language sql
immutable
as $$
  select case public.st_normalize_program_day(p_label)
    when 'Mon' then 0 when 'Tue' then 1 when 'Wed' then 2 when 'Thu' then 3
    when 'Fri' then 4 when 'Sat' then 5 when 'Sun' then 6
    else 99
  end;
$$;

create or replace function public.st_normalize_weekday_list(p_days text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(public.st_normalize_program_day(day) order by ord), '{}'::text[])
  from unnest(coalesce(p_days, '{}'::text[])) with ordinality as item(day, ord)
  where public.st_normalize_program_day(day) <> '';
$$;

create or replace function public.st_program_custom_schedule_error(
  p_program_id uuid,
  p_weekdays text[]
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days text[];
  v_count integer;
  v_distinct integer;
begin
  if exists (
    select 1
    from (
      select w.week, count(*) as sessions
      from public.st_workouts w
      where w.program_id = p_program_id and coalesce(w.week, 0) >= 1
      group by w.week
      having count(*) > 0
    ) weeks
    having count(distinct weeks.sessions) > 1
  ) then
    return 'This program’s weeks do not have the same number of workouts, so custom days cannot be applied.';
  end if;

  if exists (
    select 1
    from public.st_workouts w
    where w.program_id = p_program_id
      and coalesce(w.week, 0) >= 1
    group by w.week
    having count(*) > count(distinct (coalesce(w.day_order, 2147483647), public.st_program_day_index(w.day_label)))
  ) then
    return 'Two workouts in the same week do not have a clear order. Set their order in Program Design before choosing custom days.';
  end if;

  select count(*) into v_count
  from public.st_workouts w
  where w.program_id = p_program_id
    and w.week = (
      select min(week) from public.st_workouts where program_id = p_program_id and coalesce(week, 0) >= 1
    );

  if coalesce(v_count, 0) = 0 then
    return 'This program has no workouts to schedule.';
  end if;

  v_days := public.st_normalize_weekday_list(p_weekdays);
  if cardinality(v_days) <> cardinality(coalesce(p_weekdays, '{}'::text[])) then
    return 'Choose a weekday for each workout.';
  end if;
  select count(distinct day) into v_distinct from unnest(v_days) as day;
  if v_distinct <> cardinality(v_days) then
    return 'Choose each training day once.';
  end if;
  if cardinality(v_days) <> v_count then
    return format('This program has %s workouts each week. Select %s training days.', v_count, v_count);
  end if;
  return null;
end;
$$;

revoke all on function public.st_program_custom_schedule_error(uuid, text[]) from public, anon, authenticated;

create or replace function public.st_save_group_schedule_profile(
  p_enrollment_id uuid,
  p_mode text,
  p_weekdays text[],
  p_cycle_anchor date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  select e.source_key into v_key
  from public.st_training_enrollments e
  where e.id = p_enrollment_id;
  if v_key is null or v_key = 'personal' then
    raise exception 'Refusing to change personal training';
  end if;
  if p_mode not in ('program_days', 'custom_weekdays') then
    raise exception 'Invalid schedule';
  end if;
  insert into public.st_training_schedule_profiles (enrollment_id, mode, weekdays, cycle_anchor)
  values (
    p_enrollment_id,
    p_mode,
    case when p_mode = 'custom_weekdays' then public.st_normalize_weekday_list(p_weekdays) else '{}'::text[] end,
    case when p_mode = 'custom_weekdays' then p_cycle_anchor else null end
  )
  on conflict (enrollment_id) do update
  set mode = excluded.mode,
      weekdays = excluded.weekdays,
      cycle_anchor = excluded.cycle_anchor,
      updated_at = now();
end;
$$;

revoke all on function public.st_save_group_schedule_profile(uuid, text, text[], date) from public, anon, authenticated;

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
  v_mode text := 'program_days';
  v_weekdays text[] := '{}'::text[];
  v_cycle_anchor date;
  v_custom_program uuid;
  v_future_program uuid;
  v_future_start date;
  v_hold_from date;
  v_apply_custom boolean;
begin
  select * into v_enroll from public.st_training_enrollments where id = p_enrollment_id;
  if not found or v_enroll.program_id is null then
    return;
  end if;

  select p.mode, p.weekdays, p.cycle_anchor
    into v_mode, v_weekdays, v_cycle_anchor
  from public.st_training_schedule_profiles p
  where p.enrollment_id = v_enroll.id;
  v_mode := coalesce(v_mode, 'program_days');
  v_weekdays := coalesce(v_weekdays, '{}'::text[]);
  if v_enroll.source_key = 'personal' then
    v_mode := 'program_days';
  end if;

  v_custom_program := v_enroll.program_id;
  v_hold_from := null;
  if v_mode = 'custom_weekdays'
     and v_enroll.status = 'active'
     and v_enroll.expectation_enabled then
    select s.program_id, s.starts_on
      into v_future_program, v_future_start
    from public.st_training_program_segments s
    where s.enrollment_id = v_enroll.id
      and s.ends_on is null
      and s.starts_on > p_effective_on
      and s.program_id is distinct from v_enroll.program_id
    order by s.starts_on
    limit 1;

    if v_future_program is not null then
      v_custom_program := v_future_program;
      if public.st_program_custom_schedule_error(v_future_program, v_weekdays) is not null then
        v_hold_from := v_future_start;
        v_mode := 'program_days';
      end if;
    elsif public.st_program_custom_schedule_error(v_enroll.program_id, v_weekdays) is not null then
      return;
    end if;
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
    and e.scheduled_date > p_effective_on
    and not public.st_expectation_has_session(e.id)
    and (v_hold_from is null or e.scheduled_date < v_hold_from);

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
    v_apply_custom := v_mode = 'custom_weekdays' and v_segment.program_id = v_custom_program;
    v_anchor := case
      when v_apply_custom then coalesce(v_cycle_anchor, public.st_schedule_monday(coalesce(v_program.start_date, v_segment.starts_on, p_effective_on)))
      else public.st_schedule_monday(
        case
          when v_enroll.source_kind = 'personal' then coalesce(v_enroll.starts_on, v_program.start_date, p_effective_on)
          else coalesce(v_program.start_date, v_segment.starts_on, p_effective_on)
        end
      )
    end;
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
    if v_hold_from is not null and v_hold_from - 1 < v_limit then
      v_limit := v_hold_from - 1;
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
        if v_apply_custom then
          for v_workout in
            select ranked.id, public.st_schedule_day_label(v_date) as day_label, ranked.workout_type
            from (
              select w.id, w.workout_type,
                     row_number() over (
                       order by coalesce(w.day_order, 2147483647), public.st_program_day_index(w.day_label), w.id::text
                     ) as session_index
              from public.st_workouts w
              where w.program_id = v_segment.program_id
                and w.week = v_week
            ) ranked
            where ranked.session_index = array_position(v_weekdays, public.st_schedule_day_label(v_date))
          loop
            insert into public.st_training_expectations (
              user_id, source_key, team_id, enrollment_id, program_id, segment_id, workout_id,
              scheduled_date, title, day_label, origin, excused
            ) values (
              v_enroll.user_id, v_enroll.source_key, v_enroll.team_id, v_enroll.id,
              v_segment.program_id, v_segment_id, v_workout.id, v_date,
              coalesce(nullif(trim(v_workout.workout_type), ''), nullif(trim(v_workout.day_label), ''), 'Workout'),
              v_workout.day_label, 'program', false
            )
            on conflict (user_id, source_key, workout_id, scheduled_date)
              where origin = 'program' and workout_id is not null
              do nothing;
          end loop;
        else
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
              v_enroll.user_id, v_enroll.source_key, v_enroll.team_id, v_enroll.id,
              v_segment.program_id, v_segment_id, v_workout.id, v_date,
              coalesce(nullif(trim(v_workout.workout_type), ''), nullif(trim(v_workout.day_label), ''), 'Workout'),
              v_workout.day_label, 'program', false
            )
            on conflict (user_id, source_key, workout_id, scheduled_date)
              where origin = 'program' and workout_id is not null
              do nothing;
          end loop;
        end if;
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
  v_apply_custom := v_mode = 'custom_weekdays' and v_program.id = v_custom_program;
  v_anchor := case
    when v_apply_custom then coalesce(v_cycle_anchor, public.st_schedule_monday(coalesce(v_program.start_date, v_enroll.starts_on, p_effective_on)))
    else public.st_schedule_monday(
      case
        when v_enroll.source_kind = 'personal' then coalesce(v_enroll.starts_on, v_program.start_date, p_effective_on)
        else coalesce(v_program.start_date, v_enroll.starts_on, p_effective_on)
      end
    )
  end;
  v_end := v_anchor + (v_weeks * 7 - 1);
  v_from := greatest(p_effective_on, coalesce(v_enroll.starts_on, p_effective_on));
  v_limit := v_end;
  if v_hold_from is not null and v_hold_from - 1 < v_limit then
    v_limit := v_hold_from - 1;
  end if;
  if v_from > v_limit then
    return;
  end if;
  v_date := v_from;
  while v_date <= v_limit loop
    if v_today_frozen and v_date = p_effective_on then
      v_date := v_date + 1;
      continue;
    end if;
    v_week := ((v_date - v_anchor) / 7) + 1;
    if v_week >= 1 and v_week <= v_weeks then
      if v_apply_custom then
        for v_workout in
          select ranked.id, public.st_schedule_day_label(v_date) as day_label, ranked.workout_type
          from (
            select w.id, w.workout_type,
                   row_number() over (
                     order by coalesce(w.day_order, 2147483647), public.st_program_day_index(w.day_label), w.id::text
                   ) as session_index
            from public.st_workouts w
            where w.program_id = v_enroll.program_id and w.week = v_week
          ) ranked
          where ranked.session_index = array_position(v_weekdays, public.st_schedule_day_label(v_date))
        loop
          insert into public.st_training_expectations (
            user_id, source_key, team_id, enrollment_id, program_id, segment_id, workout_id,
            scheduled_date, title, day_label, origin, excused
          ) values (
            v_enroll.user_id, v_enroll.source_key, v_enroll.team_id, v_enroll.id,
            v_enroll.program_id, null, v_workout.id, v_date,
            coalesce(nullif(trim(v_workout.workout_type), ''), nullif(trim(v_workout.day_label), ''), 'Workout'),
            v_workout.day_label, 'program', false
          )
          on conflict (user_id, source_key, workout_id, scheduled_date)
            where origin = 'program' and workout_id is not null
            do nothing;
        end loop;
      else
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
            v_enroll.user_id, v_enroll.source_key, v_enroll.team_id, v_enroll.id,
            v_enroll.program_id, null, v_workout.id, v_date,
            coalesce(nullif(trim(v_workout.workout_type), ''), nullif(trim(v_workout.day_label), ''), 'Workout'),
            v_workout.day_label, 'program', false
          )
          on conflict (user_id, source_key, workout_id, scheduled_date)
            where origin = 'program' and workout_id is not null
            do nothing;
        end loop;
      end if;
    end if;
    v_date := v_date + 1;
  end loop;
end;
$$;

create or replace function public.st_apply_member_schedule(
  p_team_id uuid,
  p_member_user_id uuid,
  p_program_id uuid,
  p_mode text,
  p_weekdays text[],
  p_starts_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enroll uuid;
  v_anchor date;
  v_error text;
  v_mode text;
begin
  v_mode := coalesce(nullif(p_mode, ''), 'program_days');
  select e.id into v_enroll
  from public.st_training_enrollments e
  where e.user_id = p_member_user_id
    and e.team_id = p_team_id
    and e.source_kind = 'group'
    and e.source_key = 'group:' || p_team_id::text
    and e.source_key <> 'personal';
  if v_enroll is null then
    return;
  end if;
  if v_mode = 'custom_weekdays' then
    v_error := public.st_program_custom_schedule_error(p_program_id, p_weekdays);
    if v_error is not null then
      raise exception '%', v_error;
    end if;
    select public.st_schedule_monday(coalesce(p.start_date, p_starts_on))
      into v_anchor
    from public.st_programs p
    where p.id = p_program_id;
  else
    v_mode := 'program_days';
    v_anchor := null;
  end if;
  perform public.st_save_group_schedule_profile(v_enroll, v_mode, p_weekdays, v_anchor);
  perform public.st_refresh_enrollment_expectations(v_enroll, current_date);
end;
$$;

revoke all on function public.st_apply_member_schedule(uuid, uuid, uuid, text, text[], date) from public, anon, authenticated;

drop function if exists public.st_assign_group_programs(uuid, uuid[], uuid, date, text, text, text, boolean, date);

create or replace function public.st_assign_group_programs(
  p_team_id uuid,
  p_member_user_ids uuid[],
  p_program_id uuid,
  p_starts_on date,
  p_notes text default null,
  p_request_key text default null,
  p_assignment_type text default 'individual_team',
  p_set_as_group_default boolean default false,
  p_local_today date default null,
  p_schedules jsonb default '[]'::jsonb
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
  v_schedule jsonb;
  v_mode text;
  v_days text[];
  v_error text;
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
    select item
      into v_schedule
    from jsonb_array_elements(coalesce(p_schedules, '[]'::jsonb)) as item
    where item->>'user_id' = v_uid::text
    limit 1;
    v_mode := coalesce(v_schedule->>'mode', 'program_days');
    if v_mode = 'custom_weekdays' then
      select coalesce(array_agg(value order by ord), '{}')
        into v_days
      from jsonb_array_elements_text(coalesce(v_schedule->'weekdays', '[]'::jsonb)) with ordinality as item(value, ord);
      v_error := public.st_program_custom_schedule_error(p_program_id, v_days);
      if v_error is not null then
        raise exception '%', v_error;
      end if;
    elsif v_mode <> 'program_days' then
      raise exception 'Invalid schedule';
    end if;
  end loop;

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

    select item
      into v_schedule
    from jsonb_array_elements(coalesce(p_schedules, '[]'::jsonb)) as item
    where item->>'user_id' = v_uid::text
    limit 1;
    v_mode := coalesce(v_schedule->>'mode', 'program_days');
    select coalesce(array_agg(value order by ord), '{}')
      into v_days
    from jsonb_array_elements_text(coalesce(v_schedule->'weekdays', '[]'::jsonb)) with ordinality as item(value, ord);
    perform public.st_apply_member_schedule(p_team_id, v_uid, p_program_id, v_mode, v_days, p_starts_on);

    perform public.st_notify_program_assignment(
      v_assignment_id, p_team_id, v_uid, p_program_id, p_assignment_type
    );
    v_count := v_count + 1;
  end loop;

  if p_set_as_group_default then
    perform public.st_set_group_default_program(p_team_id, p_program_id, p_starts_on, p_schedules);
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

drop function if exists public.st_set_group_default_program(uuid, uuid, date);

create or replace function public.st_set_group_default_program(
  p_team_id uuid,
  p_program_id uuid,
  p_starts_on date default null,
  p_schedules jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
  v_starts date;
  v_schedule jsonb;
  v_mode text;
  v_days text[];
  v_error text;
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

  if p_program_id is not null and p_schedules is not null then
    for v_schedule in
      select item
      from jsonb_array_elements(p_schedules) as item
      where coalesce(item->>'mode', 'program_days') = 'custom_weekdays'
    loop
      select coalesce(array_agg(value order by ord), '{}')
        into v_days
      from jsonb_array_elements_text(coalesce(v_schedule->'weekdays', '[]'::jsonb)) with ordinality as item(value, ord);
      v_error := public.st_program_custom_schedule_error(p_program_id, v_days);
      if v_error is not null then
        raise exception '%', v_error;
      end if;
    end loop;
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

    if p_schedules is not null then
      select item
        into v_schedule
      from jsonb_array_elements(p_schedules) as item
      where item->>'user_id' = v_member.user_id::text
      limit 1;
      if v_schedule is not null then
        v_mode := coalesce(v_schedule->>'mode', 'program_days');
        select coalesce(array_agg(value order by ord), '{}')
          into v_days
        from jsonb_array_elements_text(coalesce(v_schedule->'weekdays', '[]'::jsonb)) with ordinality as item(value, ord);
        perform public.st_apply_member_schedule(
          p_team_id, v_member.user_id, p_program_id, v_mode, v_days, v_starts
        );
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.st_set_group_default_program(uuid, uuid, date, jsonb) from public, anon;
grant execute on function public.st_set_group_default_program(uuid, uuid, date, jsonb) to authenticated;

create or replace function public.st_set_member_training_schedule(
  p_team_id uuid,
  p_member_user_id uuid,
  p_mode text,
  p_weekdays text[],
  p_effective_on date,
  p_local_today date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_effective date;
  v_enroll uuid;
  v_program uuid;
  v_future uuid;
  v_anchor date;
  v_error text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = p_member_user_id and status = 'active'
  ) then
    raise exception 'Member not found';
  end if;

  v_today := coalesce(p_local_today, current_date);
  if v_today < current_date - 1 or v_today > current_date + 1 then
    v_today := current_date;
  end if;
  v_effective := coalesce(p_effective_on, v_today);

  select e.id, e.program_id
    into v_enroll, v_program
  from public.st_training_enrollments e
  where e.user_id = p_member_user_id
    and e.team_id = p_team_id
    and e.source_kind = 'group'
    and e.source_key = 'group:' || p_team_id::text
    and e.source_key <> 'personal';
  if v_enroll is null or v_program is null then
    raise exception 'Assign a group plan before changing the schedule';
  end if;

  if p_mode = 'custom_weekdays' then
    v_error := public.st_program_custom_schedule_error(v_program, p_weekdays);
    if v_error is not null then
      raise exception '%', v_error;
    end if;
    select s.program_id into v_future
    from public.st_training_program_segments s
    where s.enrollment_id = v_enroll
      and s.ends_on is null
      and s.starts_on > v_effective
      and s.program_id is distinct from v_program
    limit 1;
    if v_future is not null then
      v_error := public.st_program_custom_schedule_error(v_future, p_weekdays);
      if v_error is not null then
        raise exception '%', v_error;
      end if;
    end if;
    select public.st_schedule_monday(coalesce(p.start_date, v_effective))
      into v_anchor
    from public.st_programs p
    where p.id = v_program;
  elsif p_mode = 'program_days' then
    v_anchor := null;
  else
    raise exception 'Invalid schedule';
  end if;

  perform public.st_save_group_schedule_profile(v_enroll, p_mode, p_weekdays, v_anchor);
  perform public.st_refresh_enrollment_expectations(v_enroll, v_effective);
end;
$$;

revoke all on function public.st_set_member_training_schedule(uuid, uuid, text, text[], date, date) from public, anon;
grant execute on function public.st_set_member_training_schedule(uuid, uuid, text, text[], date, date) to authenticated;

revoke all on function public.st_assign_group_programs(uuid, uuid[], uuid, date, text, text, text, boolean, date, jsonb) from public, anon;
grant execute on function public.st_assign_group_programs(uuid, uuid[], uuid, date, text, text, text, boolean, date, jsonb) to authenticated;


-- ===== 20261012_064_workout_reschedule.sql =====

-- BIQ-0262 Phase 4 individual workout rescheduling
-- Apply manually after 20261012_063_member_training_schedules.sql. Do not run this from the app.
-- A move or excuse is stored on the group enrollment. Expectation refresh rebuilds program dates, then reapplies these overrides.
-- Past expectations and logged sessions are not changed. Personal enrollments are not updated.

create table if not exists public.st_training_schedule_overrides (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.st_training_enrollments(id) on delete cascade,
  workout_id uuid not null,
  original_scheduled_date date not null,
  action text not null check (action in ('move', 'excuse')),
  new_scheduled_date date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (action <> 'move' or new_scheduled_date is not null),
  unique (enrollment_id, workout_id, original_scheduled_date, action)
);

comment on table public.st_training_schedule_overrides is
  'One member change to one group workout. move changes the date. excuse removes it from adherence. Refresh puts these back after rebuilding the program schedule.';

alter table public.st_training_schedule_overrides enable row level security;

drop policy if exists "training_schedule_overrides_select" on public.st_training_schedule_overrides;
create policy "training_schedule_overrides_select" on public.st_training_schedule_overrides
  for select using (
    exists (
      select 1
      from public.st_training_enrollments e
      where e.id = enrollment_id
        and (
          e.user_id = auth.uid()
          or (e.team_id is not null and public.st_user_can_edit_team(e.team_id))
          or (e.team_id is not null and public.st_user_can_assign_in_group(e.team_id))
        )
    )
  );

revoke insert, update, delete on public.st_training_schedule_overrides from public, anon, authenticated;
grant select on public.st_training_schedule_overrides to authenticated;

create or replace function public.st_apply_saved_overrides(
  p_enrollment_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_move record;
  v_excuse record;
  v_row uuid;
  v_current date;
begin
  if p_enrollment_id is null then
    return;
  end if;
  perform set_config('app.expectation_effective_on', p_effective_on::text, true);

  for v_move in
    select o.workout_id, o.original_scheduled_date, o.new_scheduled_date
    from public.st_training_schedule_overrides o
    where o.enrollment_id = p_enrollment_id
      and o.action = 'move'
      and o.new_scheduled_date is not null
  loop
    select e.id into v_row
    from public.st_training_expectations e
    where e.enrollment_id = p_enrollment_id
      and e.origin = 'program'
      and e.workout_id = v_move.workout_id
      and e.scheduled_date = v_move.original_scheduled_date
      and e.scheduled_date >= p_effective_on
      and not public.st_expectation_has_session(e.id);
    if v_row is null then
      continue;
    end if;
    if exists (
      select 1
      from public.st_training_expectations e
      where e.enrollment_id = p_enrollment_id
        and e.origin = 'program'
        and e.workout_id = v_move.workout_id
        and e.scheduled_date = v_move.new_scheduled_date
        and e.id <> v_row
    ) then
      delete from public.st_training_expectations where id = v_row;
      continue;
    end if;
    update public.st_training_expectations
    set scheduled_date = v_move.new_scheduled_date,
        day_label = public.st_schedule_day_label(v_move.new_scheduled_date)
    where id = v_row;
  end loop;

  for v_excuse in
    select o.workout_id, o.original_scheduled_date
    from public.st_training_schedule_overrides o
    where o.enrollment_id = p_enrollment_id
      and o.action = 'excuse'
  loop
    select o.new_scheduled_date into v_current
    from public.st_training_schedule_overrides o
    where o.enrollment_id = p_enrollment_id
      and o.workout_id = v_excuse.workout_id
      and o.original_scheduled_date = v_excuse.original_scheduled_date
      and o.action = 'move';
    v_current := coalesce(v_current, v_excuse.original_scheduled_date);
    if v_current < p_effective_on then
      continue;
    end if;
    update public.st_training_expectations e
    set excused = true
    where e.enrollment_id = p_enrollment_id
      and e.origin = 'program'
      and e.workout_id = v_excuse.workout_id
      and e.scheduled_date = v_current
      and e.scheduled_date >= p_effective_on
      and not public.st_expectation_has_session(e.id);
  end loop;
end;
$$;

revoke all on function public.st_apply_saved_overrides(uuid, date) from public, anon, authenticated;

create or replace function public.st_training_expectation_apply_override()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective date;
begin
  if new.origin <> 'program' or new.enrollment_id is null or new.workout_id is null then
    return new;
  end if;
  v_effective := coalesce(nullif(current_setting('app.expectation_effective_on', true), '')::date, current_date);
  perform public.st_apply_saved_overrides(new.enrollment_id, v_effective);
  return new;
end;
$$;

drop trigger if exists st_training_expectations_apply_override on public.st_training_expectations;
create constraint trigger st_training_expectations_apply_override
  after insert on public.st_training_expectations
  deferrable initially deferred
  for each row
  execute function public.st_training_expectation_apply_override();

create or replace function public.st_group_enrollment_for_schedule(
  p_team_id uuid,
  p_member_user_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = p_member_user_id and status = 'active'
  ) then
    raise exception 'Member not found';
  end if;
  select e.id into v_id
  from public.st_training_enrollments e
  where e.user_id = p_member_user_id
    and e.team_id = p_team_id
    and e.source_kind = 'group'
    and e.source_key = 'group:' || p_team_id::text
    and e.source_key <> 'personal';
  if v_id is null then
    raise exception 'Assign a group plan before changing the schedule';
  end if;
  return v_id;
end;
$$;

revoke all on function public.st_group_enrollment_for_schedule(uuid, uuid) from public, anon, authenticated;

create or replace function public.st_move_member_workout(
  p_team_id uuid,
  p_member_user_id uuid,
  p_workout_id uuid,
  p_original_date date,
  p_new_date date,
  p_local_today date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_enroll uuid;
  v_has_session boolean;
begin
  v_enroll := public.st_group_enrollment_for_schedule(p_team_id, p_member_user_id);
  if p_workout_id is null or p_original_date is null or p_new_date is null then
    raise exception 'Choose a workout and a date';
  end if;
  v_today := coalesce(p_local_today, current_date);
  if v_today < current_date - 1 or v_today > current_date + 1 then
    v_today := current_date;
  end if;
  if p_original_date < v_today or p_new_date < v_today then
    raise exception 'Past workouts stay in history';
  end if;
  select public.st_expectation_has_session(e.id)
    into v_has_session
  from public.st_training_expectations e
  where e.enrollment_id = v_enroll
    and e.origin = 'program'
    and e.workout_id = p_workout_id
    and (e.scheduled_date = p_original_date or e.scheduled_date = p_new_date)
  limit 1;
  if coalesce(v_has_session, false) then
    raise exception 'A logged workout stays on its date';
  end if;

  update public.st_training_schedule_overrides
  set new_scheduled_date = p_new_date, updated_at = now(), created_by = auth.uid()
  where enrollment_id = v_enroll
    and workout_id = p_workout_id
    and action = 'move'
    and new_scheduled_date = p_original_date;
  if not found then
    insert into public.st_training_schedule_overrides (
      enrollment_id, workout_id, original_scheduled_date, action, new_scheduled_date, created_by
    ) values (
      v_enroll, p_workout_id, p_original_date, 'move', p_new_date, auth.uid()
    )
    on conflict (enrollment_id, workout_id, original_scheduled_date, action)
    do update set new_scheduled_date = excluded.new_scheduled_date, updated_at = now(), created_by = excluded.created_by;
  end if;

  perform set_config('app.expectation_effective_on', v_today::text, true);
  perform public.st_refresh_enrollment_expectations(v_enroll, v_today);
  perform public.st_apply_saved_overrides(v_enroll, v_today);
end;
$$;

create or replace function public.st_excuse_member_workout(
  p_team_id uuid,
  p_member_user_id uuid,
  p_workout_id uuid,
  p_original_date date,
  p_local_today date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_enroll uuid;
  v_has_session boolean;
  v_origin date;
begin
  v_enroll := public.st_group_enrollment_for_schedule(p_team_id, p_member_user_id);
  if p_workout_id is null or p_original_date is null then
    raise exception 'Choose a workout';
  end if;
  v_today := coalesce(p_local_today, current_date);
  if v_today < current_date - 1 or v_today > current_date + 1 then
    v_today := current_date;
  end if;
  if p_original_date < v_today then
    raise exception 'Past workouts stay in history';
  end if;
  select public.st_expectation_has_session(e.id)
    into v_has_session
  from public.st_training_expectations e
  where e.enrollment_id = v_enroll
    and e.origin = 'program'
    and e.workout_id = p_workout_id
    and e.scheduled_date = p_original_date
  limit 1;
  if coalesce(v_has_session, false) then
    raise exception 'A logged workout stays on its date';
  end if;

  select o.original_scheduled_date into v_origin
  from public.st_training_schedule_overrides o
  where o.enrollment_id = v_enroll
    and o.workout_id = p_workout_id
    and o.action = 'move'
    and o.new_scheduled_date = p_original_date;
  v_origin := coalesce(v_origin, p_original_date);

  insert into public.st_training_schedule_overrides (
    enrollment_id, workout_id, original_scheduled_date, action, new_scheduled_date, created_by
  ) values (
    v_enroll, p_workout_id, v_origin, 'excuse', null, auth.uid()
  )
  on conflict (enrollment_id, workout_id, original_scheduled_date, action)
  do update set updated_at = now(), created_by = excluded.created_by;

  perform set_config('app.expectation_effective_on', v_today::text, true);
  perform public.st_refresh_enrollment_expectations(v_enroll, v_today);
  perform public.st_apply_saved_overrides(v_enroll, v_today);
end;
$$;

create or replace function public.st_restore_member_workout(
  p_team_id uuid,
  p_member_user_id uuid,
  p_workout_id uuid,
  p_original_date date,
  p_local_today date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_enroll uuid;
  v_origin date;
begin
  v_enroll := public.st_group_enrollment_for_schedule(p_team_id, p_member_user_id);
  v_today := coalesce(p_local_today, current_date);
  if v_today < current_date - 1 or v_today > current_date + 1 then
    v_today := current_date;
  end if;
  if p_original_date < v_today then
    raise exception 'Past workouts stay in history';
  end if;
  select o.original_scheduled_date into v_origin
  from public.st_training_schedule_overrides o
  where o.enrollment_id = v_enroll
    and o.workout_id = p_workout_id
    and o.action = 'move'
    and o.new_scheduled_date = p_original_date;
  v_origin := coalesce(v_origin, p_original_date);
  delete from public.st_training_schedule_overrides
  where enrollment_id = v_enroll
    and workout_id = p_workout_id
    and original_scheduled_date = v_origin
    and action = 'excuse';
  update public.st_training_expectations
  set excused = false
  where enrollment_id = v_enroll
    and origin = 'program'
    and workout_id = p_workout_id
    and scheduled_date >= v_today
    and not public.st_expectation_has_session(id);
  perform set_config('app.expectation_effective_on', v_today::text, true);
  perform public.st_refresh_enrollment_expectations(v_enroll, v_today);
  perform public.st_apply_saved_overrides(v_enroll, v_today);
end;
$$;

create or replace function public.st_set_member_group_expectation(
  p_team_id uuid,
  p_member_user_id uuid,
  p_enabled boolean,
  p_effective_on date,
  p_local_today date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_effective date;
  v_enroll uuid;
begin
  v_enroll := public.st_group_enrollment_for_schedule(p_team_id, p_member_user_id);
  v_today := coalesce(p_local_today, current_date);
  if v_today < current_date - 1 or v_today > current_date + 1 then
    v_today := current_date;
  end if;
  v_effective := coalesce(p_effective_on, v_today);
  perform set_config('app.expectation_effective_on', v_effective::text, true);
  update public.st_training_enrollments
  set expectation_enabled = p_enabled,
      updated_at = now()
  where id = v_enroll
    and source_key <> 'personal';
end;
$$;

revoke all on function public.st_move_member_workout(uuid, uuid, uuid, date, date, date) from public, anon;
revoke all on function public.st_excuse_member_workout(uuid, uuid, uuid, date, date) from public, anon;
revoke all on function public.st_restore_member_workout(uuid, uuid, uuid, date, date) from public, anon;
revoke all on function public.st_set_member_group_expectation(uuid, uuid, boolean, date, date) from public, anon;
grant execute on function public.st_move_member_workout(uuid, uuid, uuid, date, date, date) to authenticated;
grant execute on function public.st_excuse_member_workout(uuid, uuid, uuid, date, date) to authenticated;
grant execute on function public.st_restore_member_workout(uuid, uuid, uuid, date, date) to authenticated;
grant execute on function public.st_set_member_group_expectation(uuid, uuid, boolean, date, date) to authenticated;


-- ===== 20261012_065_assigner_schedule_read.sql =====

-- BIQ-0262 Phase 6 assigner visibility
-- Apply manually after 20261012_064_workout_reschedule.sql. Do not run this from the app.
-- An authorized assigner can already change another member's group schedule.
-- This lets that person read the group enrollment and group expectations needed to see the calendar.
-- Personal enrollments and personal expectations stay private.

drop policy if exists "training_enrollments_select" on public.st_training_enrollments;
create policy "training_enrollments_select" on public.st_training_enrollments
  for select using (
    user_id = auth.uid()
    or (team_id is not null and public.st_user_can_edit_team(team_id))
    or (
      source_kind = 'group'
      and source_key <> 'personal'
      and team_id is not null
      and public.st_user_can_assign_in_group(team_id)
    )
  );

drop policy if exists "training_expectations_select" on public.st_training_expectations;
create policy "training_expectations_select" on public.st_training_expectations
  for select using (
    user_id = auth.uid()
    or (team_id is not null and public.st_user_can_edit_team(team_id))
    or (
      source_key like 'group:%'
      and source_key <> 'personal'
      and public.st_user_can_edit_team(substring(source_key from 7)::uuid)
    )
    or (
      source_key like 'group:%'
      and source_key <> 'personal'
      and team_id is not null
      and public.st_user_can_assign_in_group(team_id)
    )
  );


-- ===== 20261016_066_group_assigned_program_read.sql =====

-- BIQ-0263 Phase 1: read one assigned group program
-- DO NOT APPLY until reviewed. This file is the proposal, not a deployed change.
-- It does not change programs_read, workout policies, or any training rows.
-- SECURITY DEFINER runs as the role that applies this file. Do not alter the
-- owner to an end-user role. search_path is pinned to public. EXECUTE is
-- revoked from public and anon, then granted only to authenticated.
--
-- Rollback:
--   drop function if exists public.st_read_group_assigned_program(uuid, uuid, uuid);

create or replace function public.st_read_group_assigned_program(
  p_team_id uuid,
  p_member_user_id uuid,
  p_program_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_program jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null or p_member_user_id is null or p_program_id is null then
    raise exception 'Not authorized';
  end if;
  if not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if not exists (
    select 1
    from public.st_team_members m
    where m.team_id = p_team_id
      and m.user_id = p_member_user_id
      and m.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;
  if not exists (
    select 1
    from public.st_training_enrollments e
    where e.team_id = p_team_id
      and e.user_id = p_member_user_id
      and e.source_kind = 'group'
      and e.source_key = 'group:' || p_team_id::text
      and e.program_id = p_program_id
      and e.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'visibility', p.visibility,
    'status', p.status,
    'weeks', p.weeks,
    'cycle_length_weeks', p.cycle_length_weeks,
    'start_date', p.start_date,
    'st_workouts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', w.id,
          'week', w.week,
          'day_label', w.day_label,
          'day_order', w.day_order,
          'workout_type', w.workout_type,
          'st_exercises', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', ex.id,
                'name', ex.name,
                'sort_order', ex.sort_order,
                'st_planned_sets', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'set_number', s.set_number,
                      'set_type', s.set_type,
                      'target_reps', s.target_reps,
                      'target_weight', s.target_weight,
                      'target_rir', s.target_rir,
                      'rest_seconds', s.rest_seconds
                    )
                    order by s.set_number nulls last, s.id
                  )
                  from public.st_planned_sets s
                  where s.exercise_id = ex.id
                    and coalesce(s.is_deleted, false) = false
                ), '[]'::jsonb)
              )
              order by ex.sort_order nulls last, ex.id
            )
            from public.st_exercises ex
            where ex.workout_id = w.id
          ), '[]'::jsonb)
        )
        order by w.week nulls last, w.day_order nulls last, w.id
      )
      from public.st_workouts w
      where w.program_id = p.id
    ), '[]'::jsonb)
  )
  into v_program
  from public.st_programs p
  where p.id = p_program_id;

  return v_program;
end;
$$;

comment on function public.st_read_group_assigned_program(uuid, uuid, uuid) is
  'Owner or manager read of the program on one active group enrollment. Does not expose other personal programs or training history.';

revoke all on function public.st_read_group_assigned_program(uuid, uuid, uuid) from public, anon;
grant execute on function public.st_read_group_assigned_program(uuid, uuid, uuid) to authenticated;


-- ===== 20261016_067_adherence_session_match.sql =====

-- BIQ-0263 Phase 1: align group adherence with the expectation session match
-- Apply this file in the Supabase SQL Editor after 20261016_066_group_assigned_program_read.sql
-- and before 20261016_067_group_expectation_status.sql.
-- It replaces one function. It does not update or delete training rows.
-- It does not apply migration 065.
--
-- A linked session fulfills only that expectation. An unlinked session matches
-- a workout and date only when that member has exactly one expectation for the pair.
-- Completed, partial, skipped, excused, and missed totals use the same filters as before.
-- Past misses are not relabeled from a current pause.
--
-- Rollback: re-apply the st_group_schedule_adherence body from
-- 20261007_059_unified_training_schedule.sql.

create or replace function public.st_group_schedule_adherence(
  p_team_id uuid,
  p_from_date date,
  p_to_date date,
  p_local_today date
)
returns table (
  user_id uuid,
  expected_past integer,
  completed_past integer,
  partial_past integer,
  skipped_past integer,
  missed integer,
  due_today integer,
  completed_today integer,
  future integer,
  completion_rate numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_see_all boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null then
    raise exception 'Group is required';
  end if;
  if not exists (
    select 1 from public.st_team_members m
    where m.team_id = p_team_id and m.user_id = auth.uid() and m.status = 'active'
  ) and not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not authorized';
  end if;

  v_see_all := public.st_user_can_view_group_progress(p_team_id) or public.st_user_can_edit_team(p_team_id);

  return query
  with classified as (
    select
      e.user_id as member_id,
      e.scheduled_date,
      e.excused,
      sess.status as session_status,
      rec.status as recipient_status
    from public.st_training_expectations e
    left join lateral (
      select s.status
      from public.st_workout_sessions s
      where s.user_id = e.user_id
        and (
          s.expectation_id = e.id
          or (
            s.expectation_id is null
            and e.workout_id is not null
            and s.workout_id = e.workout_id
            and s.log_date = e.scheduled_date
            and not exists (
              select 1
              from public.st_training_expectations other
              where other.user_id = e.user_id
                and other.workout_id = e.workout_id
                and other.scheduled_date = e.scheduled_date
                and other.id <> e.id
            )
          )
        )
      order by case when s.expectation_id = e.id then 0 else 1 end, s.completed_at desc nulls last
      limit 1
    ) sess on true
    left join public.st_assignment_recipients rec on rec.id = e.assignment_recipient_id
    where e.scheduled_date between p_from_date and p_to_date
      and (
        e.source_key = ('group:' || p_team_id::text)
        or (e.origin = 'assignment' and e.team_id = p_team_id)
      )
  )
  select
    tm.user_id,
    (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false))::integer,
    (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false and c.session_status = 'completed'))::integer,
    (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false and c.session_status = 'partial'))::integer,
    (count(*) filter (
      where c.scheduled_date < p_local_today and c.excused = false
        and (c.session_status = 'skipped' or (c.session_status is null and c.recipient_status = 'skipped'))
    ))::integer,
    (count(*) filter (
      where c.scheduled_date < p_local_today and c.excused = false
        and c.session_status is distinct from 'completed'
        and c.session_status is distinct from 'partial'
        and c.session_status is distinct from 'skipped'
        and coalesce(c.recipient_status, '') is distinct from 'skipped'
    ))::integer,
    (count(*) filter (
      where c.scheduled_date = p_local_today and c.excused = false and c.session_status is distinct from 'completed'
    ))::integer,
    (count(*) filter (where c.scheduled_date = p_local_today and c.excused = false and c.session_status = 'completed'))::integer,
    (count(*) filter (where c.scheduled_date > p_local_today and c.excused = false))::integer,
    case
      when (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false)) = 0 then null
      else round(
        (
          (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false and c.session_status = 'completed'))::numeric
          / (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false))::numeric
        ) * 100,
        1
      )
    end
  from public.st_team_members tm
  left join classified c on c.member_id = tm.user_id
  where tm.team_id = p_team_id
    and tm.status = 'active'
    and (v_see_all or tm.user_id = auth.uid())
  group by tm.user_id;
end;
$$;

comment on function public.st_group_schedule_adherence(uuid, date, date, date) is
  'Group adherence totals. A linked session fulfills only its expectation. An unlinked session matches one workout and date.';

revoke all on function public.st_group_schedule_adherence(uuid, date, date, date) from public, anon;
grant execute on function public.st_group_schedule_adherence(uuid, date, date, date) to authenticated;


-- ===== 20261016_067_group_expectation_status.sql =====

-- BIQ-0263 Phase 1: per-workout group expectation status
-- Apply this file in the Supabase SQL Editor after 20261016_066_group_assigned_program_read.sql.
-- It adds one index, replaces the adherence session match, and adds one read function.
-- It does not update or delete training rows. It does not apply migration 065.
--
-- Session match, used by both functions below:
--   an expectation link fulfills only that expectation;
--   an unlinked session matches workout and date only when that member has one such expectation.
--
-- While an enrollment is paused, today and future unfinished workouts are paused
-- on the row-status function. Past unfinished workouts stay missed. Adherence
-- totals keep the existing missed definition, so this file does not invent a
-- historical pause date and does not recalculate past misses.
--
-- Rollback:
--   Re-apply the previous st_group_schedule_adherence body from
--   20261007_059_unified_training_schedule.sql before dropping the new objects.
--   drop function if exists public.st_group_expectation_status(uuid, date, date, date, uuid);
--   drop index if exists public.st_workout_sessions_expectation_idx;

create index if not exists st_workout_sessions_expectation_idx
  on public.st_workout_sessions (expectation_id)
  where expectation_id is not null;

create or replace function public.st_group_expectation_status(
  p_team_id uuid,
  p_from_date date,
  p_to_date date,
  p_local_today date,
  p_member_user_id uuid default null
)
returns table (
  expectation_id uuid,
  user_id uuid,
  workout_id uuid,
  scheduled_date date,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_see_all boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null or p_from_date is null or p_to_date is null or p_local_today is null then
    raise exception 'Not authorized';
  end if;
  if p_to_date < p_from_date or p_to_date - p_from_date > 83 then
    raise exception 'Date range is too large';
  end if;
  if not exists (
    select 1
    from public.st_team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) and not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not authorized';
  end if;

  v_see_all := public.st_user_can_view_group_progress(p_team_id) or public.st_user_can_edit_team(p_team_id);
  if p_member_user_id is not null and not v_see_all and p_member_user_id is distinct from auth.uid() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    e.id,
    e.user_id,
    e.workout_id,
    e.scheduled_date,
    case
      when e.excused then 'excused'
      when sess.status = 'completed' then 'completed'
      when sess.status = 'partial' then 'partial'
      when sess.status = 'skipped' or coalesce(rec.status, '') = 'skipped' then 'skipped'
      when enr.status = 'paused' and e.scheduled_date >= p_local_today then 'paused'
      when e.scheduled_date < p_local_today then 'missed'
      when e.scheduled_date = p_local_today then 'due_today'
      else 'upcoming'
    end
  from public.st_training_expectations e
  join public.st_team_members tm
    on tm.team_id = p_team_id
   and tm.user_id = e.user_id
   and tm.status = 'active'
  left join lateral (
    select s.status
    from public.st_workout_sessions s
    where s.user_id = e.user_id
      and (
        s.expectation_id = e.id
        or (
          s.expectation_id is null
          and e.workout_id is not null
          and s.workout_id = e.workout_id
          and s.log_date = e.scheduled_date
          and not exists (
            select 1
            from public.st_training_expectations other
            where other.user_id = e.user_id
              and other.workout_id = e.workout_id
              and other.scheduled_date = e.scheduled_date
              and other.id <> e.id
          )
        )
      )
    order by case when s.expectation_id = e.id then 0 else 1 end, s.completed_at desc nulls last
    limit 1
  ) sess on true
  left join public.st_assignment_recipients rec on rec.id = e.assignment_recipient_id
  left join lateral (
    select en.status
    from public.st_training_enrollments en
    where en.user_id = e.user_id
      and en.team_id = p_team_id
      and en.source_kind = 'group'
      and en.source_key = 'group:' || p_team_id::text
    order by en.starts_on desc nulls last, en.id
    limit 1
  ) enr on true
  where e.scheduled_date between p_from_date and p_to_date
    and (
      e.source_key = ('group:' || p_team_id::text)
      or (e.origin = 'assignment' and e.team_id = p_team_id)
    )
    and (p_member_user_id is null or e.user_id = p_member_user_id)
    and (v_see_all or e.user_id = auth.uid());
end;
$$;

comment on function public.st_group_expectation_status(uuid, date, date, date, uuid) is
  'Read-only status for saved group expectations. Uses the adherence session match and does not return set logs or personal session fields.';

revoke all on function public.st_group_expectation_status(uuid, date, date, date, uuid) from public, anon;
grant execute on function public.st_group_expectation_status(uuid, date, date, date, uuid) to authenticated;


-- ===== 20261018_068_group_activity_series.sql =====

-- BIQ-0263 Stage 1. Apply in the Supabase SQL Editor. The app does not run this.
-- One-time group extras. They are not personal calendar rows and not program expectations.
-- Weekly repeat is stored as a column for a later stage. This function rejects it.

create table if not exists public.st_group_activity_series (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  activity_type text not null,
  title text not null default '',
  duration_minutes int,
  notes text,
  details jsonb not null default '{}'::jsonb,
  workout_id uuid references public.st_workouts(id) on delete set null,
  program_id uuid references public.st_programs(id) on delete set null,
  start_date date not null,
  recurrence text not null default 'none',
  recurrence_until date,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  constraint st_group_activity_series_type_check
    check (activity_type in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest')),
  constraint st_group_activity_series_recurrence_check
    check (recurrence in ('none', 'weekly'))
);

create table if not exists public.st_group_activity_recipients (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.st_group_activity_series(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unique (series_id, user_id)
);

create table if not exists public.st_group_activity_occurrences (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.st_group_activity_series(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurrence_date date not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (series_id, user_id, occurrence_date)
);

create table if not exists public.st_group_activity_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  request_key text not null,
  requested_by uuid not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (team_id, request_key)
);

comment on table public.st_group_activity_series is
  'Additional group activities. Optional by default. Not a program expectation and not a personal calendar row.';

alter table public.st_group_activity_series enable row level security;
alter table public.st_group_activity_recipients enable row level security;
alter table public.st_group_activity_occurrences enable row level security;
alter table public.st_group_activity_requests enable row level security;

revoke all on public.st_group_activity_series from public, anon, authenticated;
revoke all on public.st_group_activity_recipients from public, anon, authenticated;
revoke all on public.st_group_activity_occurrences from public, anon, authenticated;
revoke all on public.st_group_activity_requests from public, anon, authenticated;

create or replace function public.st_user_can_read_group_activity(p_series_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_group_activity_series s
    join public.st_team_members tm
      on tm.team_id = s.team_id
     and tm.user_id = auth.uid()
     and tm.status = 'active'
    where s.id = p_series_id
      and (
        s.created_by = auth.uid()
        or public.st_user_can_assign_in_group(s.team_id)
        or public.st_user_can_view_group_progress(s.team_id)
        or exists (
          select 1
          from public.st_group_activity_recipients r
          where r.series_id = s.id
            and r.user_id = auth.uid()
        )
      )
  );
$$;

grant execute on function public.st_user_can_read_group_activity(uuid) to authenticated;

create policy st_group_activity_series_select
  on public.st_group_activity_series
  for select to authenticated
  using (public.st_user_can_read_group_activity(id));

create policy st_group_activity_recipients_select
  on public.st_group_activity_recipients
  for select to authenticated
  using (public.st_user_can_read_group_activity(series_id));

create policy st_group_activity_occurrences_select
  on public.st_group_activity_occurrences
  for select to authenticated
  using (public.st_user_can_read_group_activity(series_id));

grant select on public.st_group_activity_series to authenticated;
grant select on public.st_group_activity_recipients to authenticated;
grant select on public.st_group_activity_occurrences to authenticated;

create or replace function public.st_save_group_activity(
  p_team_id uuid,
  p_activity_type text,
  p_title text,
  p_occurrence_date date,
  p_recipient_user_ids uuid[],
  p_request_key text,
  p_duration_minutes int default null,
  p_notes text default null,
  p_details jsonb default '{}'::jsonb,
  p_workout_id uuid default null,
  p_program_id uuid default null,
  p_required boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_prior jsonb;
  v_series uuid;
  v_ids uuid[];
  v_uid uuid;
  v_occurrence uuid;
  v_occurrences uuid[] := '{}';
  v_title text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null or p_occurrence_date is null then
    raise exception 'Choose a group and a date';
  end if;
  if p_activity_type not in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest') then
    raise exception 'Choose an activity type';
  end if;
  if p_activity_type = 'strength' and p_workout_id is null then
    raise exception 'Choose a program workout for strength. A custom group workout is not available yet.';
  end if;
  if not exists (
    select 1 from public.st_team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  select coalesce(array_agg(distinct uid), '{}')
    into v_ids
  from unnest(coalesce(p_recipient_user_ids, '{}'::uuid[])) as uid
  where uid is not null;
  if cardinality(v_ids) = 0 then
    v_ids := array[auth.uid()];
  end if;
  if exists (
    select 1 from unnest(v_ids) as uid
    where not exists (
      select 1 from public.st_team_members tm
      where tm.team_id = p_team_id and tm.user_id = uid and tm.status = 'active'
    )
  ) then
    raise exception 'Member not found';
  end if;
  if v_ids <> array[auth.uid()] and not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if coalesce(p_required, false) and not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Only a manager can mark an extra required';
  end if;
  if p_workout_id is not null and not exists (
    select 1
    from public.st_workouts w
    join public.st_programs p on p.id = w.program_id
    where w.id = p_workout_id
      and p.team_id = p_team_id
      and p.visibility = 'team'
  ) then
    raise exception 'Publish a group program before assigning it';
  end if;

  v_key := nullif(btrim(coalesce(p_request_key, '')), '');
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext(p_team_id::text || ':activity:' || v_key)::bigint);
    select r.result into v_prior
    from public.st_group_activity_requests r
    where r.team_id = p_team_id and r.request_key = v_key;
    if found then
      return v_prior;
    end if;
  end if;

  if p_workout_id is not null and exists (
    select 1
    from public.st_group_activity_occurrences o
    join public.st_group_activity_series s on s.id = o.series_id
    where s.team_id = p_team_id
      and s.workout_id = p_workout_id
      and o.occurrence_date = p_occurrence_date
      and o.user_id = any(v_ids)
  ) then
    raise exception 'That workout is already on this date';
  end if;

  v_title := coalesce(nullif(btrim(p_title), ''), 'Activity');
  insert into public.st_group_activity_series (
    team_id, created_by, activity_type, title, duration_minutes, notes, details,
    workout_id, program_id, start_date, recurrence, recurrence_until, required
  ) values (
    p_team_id, auth.uid(), p_activity_type, v_title, p_duration_minutes, nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_details, '{}'::jsonb), p_workout_id, p_program_id, p_occurrence_date, 'none', null, coalesce(p_required, false)
  )
  returning id into v_series;

  foreach v_uid in array v_ids loop
    insert into public.st_group_activity_recipients (series_id, user_id)
    values (v_series, v_uid);
    insert into public.st_group_activity_occurrences (series_id, user_id, occurrence_date)
    values (v_series, v_uid, p_occurrence_date)
    returning id into v_occurrence;
    v_occurrences := v_occurrences || v_occurrence;
  end loop;

  v_prior := jsonb_build_object('series_id', v_series, 'occurrence_ids', to_jsonb(v_occurrences), 'request_key', v_key);
  if v_key is not null then
    insert into public.st_group_activity_requests (team_id, request_key, requested_by, result)
    values (p_team_id, v_key, auth.uid(), v_prior);
  end if;
  return v_prior;
end;
$$;

revoke all on function public.st_save_group_activity(uuid, text, text, date, uuid[], text, int, text, jsonb, uuid, uuid, boolean) from public, anon;
grant execute on function public.st_save_group_activity(uuid, text, text, date, uuid[], text, int, text, jsonb, uuid, uuid, boolean) to authenticated;


-- ===== 20261021_069_group_activity_recurrence.sql =====

-- BIQ-0263 Stage 2. Do not apply this to production until it is approved.
-- Do not edit migration 068. This script replaces st_save_group_activity in one transaction
-- so PostgREST never sees two copies of that function.
--
-- Run this file as its own script. The client must not already be inside a transaction.
-- Weekly dates are generated by st_list_group_activities. A stored row suppresses its
-- original date everywhere, and the calendar shows occurrence_date.
-- Stage 1 completed rows are snapshotted from the series values that exist today.
-- Stage 1 stored no per-occurrence overrides, so those series values are the historical
-- record. Null duration and null notes stay null. Missing title, type, or details are
-- not replaced with a placeholder.

begin;

create or replace function public.st_group_weekdays_valid(p_days smallint[])
returns boolean
language plpgsql
immutable
as $$
declare
  v_seen boolean[] := array[false, false, false, false, false, false, false];
  v_day smallint;
begin
  if p_days is null then
    return false;
  end if;
  foreach v_day in array p_days loop
    if v_day is null or v_day < 0 or v_day > 6 or v_seen[v_day + 1] then
      return false;
    end if;
    v_seen[v_day + 1] := true;
  end loop;
  return true;
end;
$$;

revoke all on function public.st_group_weekdays_valid(smallint[]) from public, anon, authenticated;

create or replace function public.st_group_weekday_index(p_date date)
returns int
language sql
immutable
as $$
  select (extract(dow from p_date)::int + 6) % 7;
$$;

revoke all on function public.st_group_weekday_index(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from public.st_group_activity_series where recurrence = 'weekly') then
    raise exception 'Migration 069 found a weekly group activity before weekday rules exist. Resolve it before continuing.';
  end if;
  if exists (
    select 1 from public.st_group_activity_series
    where recurrence = 'none' and recurrence_until is not null
  ) then
    raise exception 'Migration 069 found a one-time group activity with an end date. Clear recurrence_until before continuing.';
  end if;
end $$;

alter table public.st_group_activity_series
  add column if not exists recurrence_weekdays smallint[] not null default '{}',
  add column if not exists ended_on date,
  add column if not exists split_from_series_id uuid references public.st_group_activity_series(id) on delete set null;

alter table public.st_group_activity_series
  drop constraint if exists st_group_activity_series_weekdays_check;

alter table public.st_group_activity_series
  add constraint st_group_activity_series_weekdays_check
  check (
    public.st_group_weekdays_valid(recurrence_weekdays)
    and (
      (recurrence = 'none' and cardinality(recurrence_weekdays) = 0 and recurrence_until is null)
      or (recurrence = 'weekly' and cardinality(recurrence_weekdays) > 0)
    )
    and (recurrence_until is null or recurrence_until >= start_date)
  );

comment on column public.st_group_activity_series.recurrence_weekdays is
  'Monday is 0 and Sunday is 6. Empty for a one-time activity.';
comment on column public.st_group_activity_series.ended_on is
  'Inclusive last generated date. A date before start_date generates nothing and keeps stored history.';
comment on column public.st_group_activity_series.recurrence_until is
  'Inclusive last date of an ongoing weekly rule. Null means the rule has no end date.';
comment on column public.st_group_activity_series.split_from_series_id is
  'The earlier series when this row was created by a this-and-future edit.';

alter table public.st_group_activity_occurrences
  add column if not exists original_date date,
  add column if not exists status text not null default 'scheduled',
  add column if not exists activity_type text,
  add column if not exists title text,
  add column if not exists duration_minutes int,
  add column if not exists notes text,
  add column if not exists details jsonb,
  add column if not exists detached boolean not null default false,
  add column if not exists snapshotted boolean not null default false;

update public.st_group_activity_occurrences
set original_date = occurrence_date
where original_date is null;

update public.st_group_activity_occurrences o
set
  activity_type = s.activity_type,
  title = s.title,
  duration_minutes = s.duration_minutes,
  notes = s.notes,
  details = s.details,
  snapshotted = (s.activity_type is not null and s.title is not null and s.details is not null)
from public.st_group_activity_series s
where o.series_id = s.id
  and o.completed = true
  and o.snapshotted = false
  and o.activity_type is null
  and o.title is null
  and o.details is null;

do $$
declare
  v_open int;
begin
  select count(*) into v_open
  from public.st_group_activity_occurrences
  where completed = true and snapshotted = false;
  if v_open > 0 then
    raise notice 'BIQ-0263 left % completed group activities without a snapshot because title, type, or details were missing.', v_open;
  end if;
end $$;

alter table public.st_group_activity_occurrences
  alter column original_date set not null;

alter table public.st_group_activity_occurrences
  drop constraint if exists st_group_activity_occurrences_status_check;
alter table public.st_group_activity_occurrences
  add constraint st_group_activity_occurrences_status_check
  check (status in ('scheduled', 'skipped'));

alter table public.st_group_activity_occurrences
  drop constraint if exists st_group_activity_occurrences_activity_type_check;
alter table public.st_group_activity_occurrences
  add constraint st_group_activity_occurrences_activity_type_check
  check (
    activity_type is null
    or activity_type in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest')
  );

create unique index if not exists st_group_activity_occurrences_slot_key
  on public.st_group_activity_occurrences (series_id, user_id, original_date);

create index if not exists st_group_activity_series_weekly_idx
  on public.st_group_activity_series (team_id, start_date)
  where recurrence = 'weekly';

create index if not exists st_group_activity_occurrences_user_date_idx
  on public.st_group_activity_occurrences (user_id, occurrence_date);

comment on column public.st_group_activity_occurrences.original_date is
  'The slot created by the series rule. A move does not change this date.';
comment on column public.st_group_activity_occurrences.occurrence_date is
  'The date the calendar shows.';
comment on column public.st_group_activity_occurrences.snapshotted is
  'True when the activity columns are the historical record captured at completion.';
comment on column public.st_group_activity_occurrences.detached is
  'True when the row remains visible but its slot is no longer generated.';

create or replace function public.st_group_activity_freeze_completed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.original_date is distinct from old.original_date then
    raise exception 'The original occurrence date cannot be changed';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'The activity recipient cannot be changed';
  end if;
  if tg_op = 'UPDATE' and new.series_id is distinct from old.series_id then
    if not exists (
      select 1
      from public.st_group_activity_series old_series
      join public.st_group_activity_series new_series on new_series.id = new.series_id
      where old_series.id = old.series_id
        and old_series.team_id = new_series.team_id
    ) then
      raise exception 'The activity cannot move to another group';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.completed then
    if new.completed is distinct from old.completed
      or new.occurrence_date is distinct from old.occurrence_date
      or new.status is distinct from old.status
      or new.activity_type is distinct from old.activity_type
      or new.title is distinct from old.title
      or new.duration_minutes is distinct from old.duration_minutes
      or new.notes is distinct from old.notes
      or new.details is distinct from old.details
      or new.snapshotted is distinct from old.snapshotted
      or new.created_at is distinct from old.created_at
      or new.id is distinct from old.id
      or (new.detached is distinct from old.detached and not (old.detached = false and new.detached = true))
    then
      raise exception 'Completed group activity history cannot be changed';
    end if;
  end if;
  if tg_op = 'INSERT' and new.completed
    and (not new.snapshotted or new.activity_type is null or new.title is null or new.details is null)
  then
    raise exception 'Completed group activity is missing its snapshot';
  end if;
  if tg_op = 'UPDATE' and new.completed and not old.completed
    and (not new.snapshotted or new.activity_type is null or new.title is null or new.details is null)
  then
    raise exception 'Completed group activity is missing its snapshot';
  end if;
  return new;
end;
$$;

revoke all on function public.st_group_activity_freeze_completed() from public, anon, authenticated;

drop trigger if exists st_group_activity_freeze_completed on public.st_group_activity_occurrences;
create trigger st_group_activity_freeze_completed
  before insert or update on public.st_group_activity_occurrences
  for each row execute function public.st_group_activity_freeze_completed();

create or replace function public.st_group_activity_slot_open(
  p_series public.st_group_activity_series,
  p_date date
)
returns boolean
language sql
stable
as $$
  select p_date is not null
    and p_date >= p_series.start_date
    and (p_series.ended_on is null or p_date <= p_series.ended_on)
    and (p_series.recurrence_until is null or p_date <= p_series.recurrence_until)
    and (
      (p_series.recurrence = 'none' and p_date = p_series.start_date)
      or (
        p_series.recurrence = 'weekly'
        and public.st_group_weekday_index(p_date) = any (p_series.recurrence_weekdays)
      )
    );
$$;

revoke all on function public.st_group_activity_slot_open(public.st_group_activity_series, date) from public, anon, authenticated;

create or replace function public.st_group_activity_lock(
  p_team_id uuid,
  p_workout_id uuid,
  p_series_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_workout_id is not null then
    perform pg_advisory_xact_lock(hashtext(p_team_id::text || ':workout:' || p_workout_id::text)::bigint);
  end if;
  if p_series_id is not null then
    perform pg_advisory_xact_lock(hashtext('series:' || p_series_id::text)::bigint);
  end if;
end;
$$;

revoke all on function public.st_group_activity_lock(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.st_group_activity_date_taken(
  p_team_id uuid,
  p_workout_id uuid,
  p_user_id uuid,
  p_date date,
  p_ignore_series uuid[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_workout_id is not null and p_date is not null and (
    exists (
      select 1
      from public.st_group_activity_occurrences o
      join public.st_group_activity_series s on s.id = o.series_id
      where s.team_id = p_team_id
        and s.workout_id = p_workout_id
        and o.user_id = p_user_id
        and o.occurrence_date = p_date
        and (p_ignore_series is null or not (s.id = any (p_ignore_series)))
    )
    or exists (
      select 1
      from public.st_group_activity_series s
      join public.st_group_activity_recipients r
        on r.series_id = s.id and r.user_id = p_user_id
      where s.team_id = p_team_id
        and s.workout_id = p_workout_id
        and s.recurrence = 'weekly'
        and (p_ignore_series is null or not (s.id = any (p_ignore_series)))
        and p_date >= s.start_date
        and (s.ended_on is null or p_date <= s.ended_on)
        and (s.recurrence_until is null or p_date <= s.recurrence_until)
        and public.st_group_weekday_index(p_date) = any (s.recurrence_weekdays)
        and not exists (
          select 1
          from public.st_group_activity_occurrences o
          where o.series_id = s.id
            and o.user_id = p_user_id
            and o.original_date = p_date
        )
    )
  );
$$;

revoke all on function public.st_group_activity_date_taken(uuid, uuid, uuid, date, uuid[]) from public, anon, authenticated;

create or replace function public.st_group_activity_rule_overlaps(
  p_team_id uuid,
  p_workout_id uuid,
  p_user_id uuid,
  p_start date,
  p_until date,
  p_weekdays smallint[],
  p_ignore_series uuid[] default null,
  p_suppress_series uuid[] default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_old_end date;
  v_overlap_start date;
  v_overlap_end date;
  v_day smallint;
  v_first date;
  v_open int;
begin
  if p_workout_id is null or p_start is null or cardinality(coalesce(p_weekdays, '{}')) = 0 then
    return false;
  end if;

  if exists (
    select 1
    from public.st_group_activity_occurrences o
    join public.st_group_activity_series s on s.id = o.series_id
    where s.team_id = p_team_id
      and s.workout_id = p_workout_id
      and o.user_id = p_user_id
      and (p_ignore_series is null or not (s.id = any (p_ignore_series)))
      and o.occurrence_date >= p_start
      and (p_until is null or o.occurrence_date <= p_until)
      and public.st_group_weekday_index(o.occurrence_date) = any (p_weekdays)
      and not exists (
        select 1
        from public.st_group_activity_occurrences mine
        where p_suppress_series is not null
          and mine.series_id = any (p_suppress_series)
          and mine.user_id = p_user_id
          and mine.original_date = o.occurrence_date
      )
  ) then
    return true;
  end if;

  for v_series in
    select s.*
    from public.st_group_activity_series s
    join public.st_group_activity_recipients r
      on r.series_id = s.id and r.user_id = p_user_id
    where s.team_id = p_team_id
      and s.workout_id = p_workout_id
      and s.recurrence = 'weekly'
      and (p_ignore_series is null or not (s.id = any (p_ignore_series)))
  loop
    v_old_end := least(v_series.ended_on, v_series.recurrence_until);
    v_overlap_start := greatest(p_start, v_series.start_date);
    if p_until is null and v_old_end is null then
      v_overlap_end := null;
    elsif p_until is null then
      v_overlap_end := v_old_end;
    elsif v_old_end is null then
      v_overlap_end := p_until;
    else
      v_overlap_end := least(p_until, v_old_end);
    end if;
    if v_overlap_end is not null and v_overlap_end < v_overlap_start then
      continue;
    end if;

    foreach v_day in array v_series.recurrence_weekdays loop
      if not (v_day = any (p_weekdays)) then
        continue;
      end if;
      if v_overlap_end is null then
        return true;
      end if;
      v_first := v_overlap_start + ((v_day - public.st_group_weekday_index(v_overlap_start) + 7) % 7);
      if v_first > v_overlap_end then
        continue;
      end if;
      select count(*) into v_open
      from generate_series(0, ((v_overlap_end - v_first) / 7)) as g(n)
      where not exists (
        select 1
        from public.st_group_activity_occurrences o
        where o.series_id = v_series.id
          and o.user_id = p_user_id
          and o.original_date = v_first + (g.n * 7)
      )
      and not exists (
        select 1
        from public.st_group_activity_occurrences mine
        where p_suppress_series is not null
          and mine.series_id = any (p_suppress_series)
          and mine.user_id = p_user_id
          and mine.original_date = v_first + (g.n * 7)
      );
      if v_open > 0 then
        return true;
      end if;
    end loop;
  end loop;
  return false;
end;
$$;

revoke all on function public.st_group_activity_rule_overlaps(uuid, uuid, uuid, date, date, smallint[], uuid[], uuid[]) from public, anon, authenticated;

create or replace function public.st_group_activity_assert_clear(p_series_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_series public.st_group_activity_series;
begin
  if p_series_ids is null or cardinality(p_series_ids) = 0 then
    return;
  end if;
  if exists (
    select 1
    from public.st_group_activity_occurrences o
    where o.series_id = any (p_series_ids)
    group by o.user_id, o.occurrence_date
    having count(*) > 1
  ) then
    raise exception 'Those dates would show more than one activity';
  end if;

  for v_row in
    select o.user_id, o.occurrence_date, o.original_date, o.series_id
    from public.st_group_activity_occurrences o
    where o.series_id = any (p_series_ids)
  loop
    for v_series in
      select s.*
      from public.st_group_activity_series s
      where s.id = any (p_series_ids)
        and s.recurrence = 'weekly'
    loop
      if v_row.occurrence_date >= v_series.start_date
        and (v_series.ended_on is null or v_row.occurrence_date <= v_series.ended_on)
        and (v_series.recurrence_until is null or v_row.occurrence_date <= v_series.recurrence_until)
        and public.st_group_weekday_index(v_row.occurrence_date) = any (v_series.recurrence_weekdays)
        and exists (
          select 1
          from public.st_group_activity_recipients r
          where r.series_id = v_series.id
            and r.user_id = v_row.user_id
        )
        and not exists (
          select 1
          from public.st_group_activity_occurrences owner_row
          where owner_row.series_id = v_series.id
            and owner_row.user_id = v_row.user_id
            and owner_row.original_date = v_row.occurrence_date
        )
      then
        raise exception 'Those dates would show more than one activity';
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.st_group_activity_assert_clear(uuid[]) from public, anon, authenticated;

create or replace function public.st_group_activity_ensure_occurrence(
  p_series_id uuid,
  p_user_id uuid,
  p_original_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_id uuid;
begin
  select * into v_series from public.st_group_activity_series where id = p_series_id;
  if not found then
    raise exception 'Activity not found';
  end if;
  if not exists (
    select 1 from public.st_group_activity_recipients r
    where r.series_id = p_series_id and r.user_id = p_user_id
  ) then
    raise exception 'Member not found';
  end if;
  select o.id into v_id
  from public.st_group_activity_occurrences o
  where o.series_id = p_series_id
    and o.user_id = p_user_id
    and o.original_date = p_original_date;
  if found then
    return v_id;
  end if;
  if not public.st_group_activity_slot_open(v_series, p_original_date) then
    raise exception 'That date is not on this series';
  end if;
  insert into public.st_group_activity_occurrences (
    series_id, user_id, original_date, occurrence_date
  ) values (
    p_series_id, p_user_id, p_original_date, p_original_date
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.st_group_activity_ensure_occurrence(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.st_user_can_change_group_activity(p_series_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_group_activity_series s
    join public.st_team_members tm
      on tm.team_id = s.team_id
     and tm.user_id = auth.uid()
     and tm.status = 'active'
    where s.id = p_series_id
      and (
        public.st_user_can_assign_in_group(s.team_id)
        or (
          not s.required
          and (select count(*) from public.st_group_activity_recipients r where r.series_id = s.id) = 1
          and exists (
            select 1 from public.st_group_activity_recipients r
            where r.series_id = s.id and r.user_id = auth.uid()
          )
        )
      )
  );
$$;

revoke all on function public.st_user_can_change_group_activity(uuid) from public, anon;
grant execute on function public.st_user_can_change_group_activity(uuid) to authenticated;

create or replace function public.st_group_activity_require_change(p_series_id uuid)
returns public.st_group_activity_series
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_series from public.st_group_activity_series where id = p_series_id;
  if not found then
    raise exception 'Activity not found';
  end if;
  if not public.st_user_can_change_group_activity(p_series_id) then
    raise exception 'Not authorized';
  end if;
  return v_series;
end;
$$;

revoke all on function public.st_group_activity_require_change(uuid) from public, anon, authenticated;

-- The 11-argument Stage 1 function is removed only after its replacement is ready
-- to be created in this same transaction. A second overload would make PostgREST
-- reject the existing calls.
do $$
declare
  v_args text;
begin
  for v_args in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'st_save_group_activity'
  loop
    if v_args = 'p_team_id uuid, p_activity_type text, p_title text, p_occurrence_date date, p_recipient_user_ids uuid[], p_request_key text, p_duration_minutes integer, p_notes text, p_details jsonb, p_workout_id uuid, p_program_id uuid, p_required boolean' then
      drop function public.st_save_group_activity(uuid, text, text, date, uuid[], text, int, text, jsonb, uuid, uuid, boolean);
    elsif position('p_recurrence text' in v_args) = 0 then
      raise exception 'Unexpected st_save_group_activity signature: %', v_args;
    end if;
  end loop;
end $$;

create or replace function public.st_save_group_activity(
  p_team_id uuid,
  p_activity_type text,
  p_title text,
  p_occurrence_date date,
  p_recipient_user_ids uuid[],
  p_request_key text,
  p_duration_minutes int default null,
  p_notes text default null,
  p_details jsonb default '{}'::jsonb,
  p_workout_id uuid default null,
  p_program_id uuid default null,
  p_required boolean default false,
  p_recurrence text default 'none',
  p_recurrence_weekdays smallint[] default '{}',
  p_recurrence_until date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_prior jsonb;
  v_series uuid;
  v_ids uuid[];
  v_uid uuid;
  v_occurrence uuid;
  v_occurrences uuid[] := '{}';
  v_title text;
  v_recurrence text := coalesce(p_recurrence, 'none');
  v_days smallint[] := coalesce(p_recurrence_weekdays, '{}');
  v_until date := p_recurrence_until;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null or p_occurrence_date is null then
    raise exception 'Choose a group and a date';
  end if;
  if p_activity_type not in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest') then
    raise exception 'Choose an activity type';
  end if;
  if p_activity_type = 'strength' and p_workout_id is null then
    raise exception 'Choose a program workout for strength. A custom group workout is not available yet.';
  end if;
  if p_duration_minutes is not null and p_duration_minutes < 0 then
    raise exception 'Choose a duration of zero minutes or more';
  end if;
  if not exists (
    select 1 from public.st_team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  select coalesce(array_agg(distinct uid), '{}')
    into v_ids
  from unnest(coalesce(p_recipient_user_ids, '{}'::uuid[])) as uid
  where uid is not null;
  if cardinality(v_ids) = 0 then
    v_ids := array[auth.uid()];
  end if;
  if exists (
    select 1 from unnest(v_ids) as uid
    where not exists (
      select 1 from public.st_team_members tm
      where tm.team_id = p_team_id and tm.user_id = uid and tm.status = 'active'
    )
  ) then
    raise exception 'Member not found';
  end if;
  if v_ids <> array[auth.uid()] and not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if coalesce(p_required, false) and not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Only a manager can mark an extra required';
  end if;
  if p_workout_id is not null and not exists (
    select 1
    from public.st_workouts w
    join public.st_programs p on p.id = w.program_id
    where w.id = p_workout_id
      and p.team_id = p_team_id
      and p.visibility = 'team'
  ) then
    raise exception 'Publish a group program before assigning it';
  end if;
  if v_recurrence not in ('none', 'weekly') then
    raise exception 'Choose how this activity repeats';
  end if;
  if v_recurrence = 'none' then
    v_days := '{}';
    v_until := null;
  elsif cardinality(v_days) = 0 or not public.st_group_weekdays_valid(v_days) then
    raise exception 'Choose at least one weekday';
  elsif not (public.st_group_weekday_index(p_occurrence_date) = any (v_days)) then
    raise exception 'Choose a start date on one of the selected weekdays';
  elsif v_until is not null and v_until < p_occurrence_date then
    raise exception 'The end date is before the start date';
  end if;

  v_key := nullif(btrim(coalesce(p_request_key, '')), '');
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext(p_team_id::text || ':activity:' || v_key)::bigint);
    select r.result into v_prior
    from public.st_group_activity_requests r
    where r.team_id = p_team_id and r.request_key = v_key;
    if found then
      return v_prior;
    end if;
  end if;

  perform public.st_group_activity_lock(p_team_id, p_workout_id, null);
  if p_workout_id is not null then
    foreach v_uid in array v_ids loop
      if v_recurrence = 'none' and public.st_group_activity_date_taken(
        p_team_id, p_workout_id, v_uid, p_occurrence_date, null
      ) then
        raise exception 'That workout is already on this date';
      end if;
      if v_recurrence = 'weekly' and public.st_group_activity_rule_overlaps(
        p_team_id, p_workout_id, v_uid, p_occurrence_date, v_until, v_days, null
      ) then
        raise exception 'That workout is already on this date';
      end if;
    end loop;
  end if;

  v_title := coalesce(nullif(btrim(p_title), ''), 'Activity');
  insert into public.st_group_activity_series (
    team_id, created_by, activity_type, title, duration_minutes, notes, details,
    workout_id, program_id, start_date, recurrence, recurrence_weekdays, recurrence_until, required
  ) values (
    p_team_id, auth.uid(), p_activity_type, v_title, p_duration_minutes,
    nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_details, '{}'::jsonb), p_workout_id, p_program_id, p_occurrence_date,
    v_recurrence, v_days, v_until, coalesce(p_required, false)
  )
  returning id into v_series;

  foreach v_uid in array v_ids loop
    insert into public.st_group_activity_recipients (series_id, user_id)
    values (v_series, v_uid);
    if v_recurrence = 'none' then
      insert into public.st_group_activity_occurrences (
        series_id, user_id, original_date, occurrence_date
      ) values (
        v_series, v_uid, p_occurrence_date, p_occurrence_date
      )
      returning id into v_occurrence;
      v_occurrences := v_occurrences || v_occurrence;
    end if;
  end loop;

  v_prior := jsonb_build_object(
    'series_id', v_series,
    'occurrence_ids', to_jsonb(v_occurrences),
    'request_key', v_key
  );
  if v_key is not null then
    insert into public.st_group_activity_requests (team_id, request_key, requested_by, result)
    values (p_team_id, v_key, auth.uid(), v_prior);
  end if;
  return v_prior;
end;
$$;

revoke all on function public.st_save_group_activity(uuid, text, text, date, uuid[], text, int, text, jsonb, uuid, uuid, boolean, text, smallint[], date) from public, anon;
grant execute on function public.st_save_group_activity(uuid, text, text, date, uuid[], text, int, text, jsonb, uuid, uuid, boolean, text, smallint[], date) to authenticated;

create or replace function public.st_list_group_activities(
  p_team_id uuid,
  p_from date,
  p_to date,
  p_user_id uuid default null
)
returns table (
  series_id uuid,
  occurrence_id uuid,
  user_id uuid,
  original_date date,
  occurrence_date date,
  status text,
  completed boolean,
  detached boolean,
  activity_type text,
  title text,
  duration_minutes int,
  notes text,
  details jsonb,
  required boolean,
  virtual boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null or p_from is null or p_to is null or p_to < p_from or p_to > p_from + 111 then
    raise exception 'Choose a date range of 16 weeks or less';
  end if;
  if not exists (
    select 1 from public.st_team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    s.id,
    o.id,
    o.user_id,
    o.original_date,
    o.occurrence_date,
    o.status,
    o.completed,
    o.detached,
    case when o.completed then o.activity_type else coalesce(o.activity_type, s.activity_type) end,
    case when o.completed then coalesce(o.title, 'Completed activity') else coalesce(o.title, s.title) end,
    case when o.completed then o.duration_minutes else coalesce(o.duration_minutes, s.duration_minutes) end,
    case when o.completed then o.notes else coalesce(o.notes, s.notes) end,
    case when o.completed then o.details else coalesce(o.details, s.details) end,
    s.required,
    false
  from public.st_group_activity_occurrences o
  join public.st_group_activity_series s on s.id = o.series_id
  where s.team_id = p_team_id
    and o.occurrence_date between p_from and p_to
    and (p_user_id is null or o.user_id = p_user_id)
    and public.st_user_can_read_group_activity(s.id);

  return query
  select
    s.id,
    null::uuid,
    r.user_id,
    d.occurrence_date,
    d.occurrence_date,
    'scheduled'::text,
    false,
    false,
    s.activity_type,
    s.title,
    s.duration_minutes,
    s.notes,
    s.details,
    s.required,
    true
  from public.st_group_activity_series s
  join public.st_group_activity_recipients r on r.series_id = s.id
  join lateral (
    select (greatest(s.start_date, p_from) + g.n)::date as occurrence_date
    from generate_series(
      0,
      least(p_to, coalesce(s.ended_on, p_to), coalesce(s.recurrence_until, p_to))
        - greatest(s.start_date, p_from)
    ) as g(n)
  ) as d on true
  where s.team_id = p_team_id
    and s.recurrence = 'weekly'
    and (p_user_id is null or r.user_id = p_user_id)
    and d.occurrence_date between p_from and p_to
    and public.st_group_weekday_index(d.occurrence_date) = any (s.recurrence_weekdays)
    and public.st_user_can_read_group_activity(s.id)
    and not exists (
      select 1
      from public.st_group_activity_occurrences o
      where o.series_id = s.id
        and o.user_id = r.user_id
        and o.original_date = d.occurrence_date
    );
end;
$$;

revoke all on function public.st_list_group_activities(uuid, date, date, uuid) from public, anon;
grant execute on function public.st_list_group_activities(uuid, date, date, uuid) to authenticated;

create or replace function public.st_complete_group_activity_occurrence(
  p_series_id uuid,
  p_user_id uuid,
  p_original_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_id uuid;
  v_row public.st_group_activity_occurrences;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_series from public.st_group_activity_series where id = p_series_id;
  if not found then
    raise exception 'Activity not found';
  end if;
  if not exists (
    select 1 from public.st_team_members tm
    where tm.team_id = v_series.team_id and tm.user_id = auth.uid() and tm.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;
  if p_user_id is distinct from auth.uid() and not public.st_user_can_assign_in_group(v_series.team_id) then
    raise exception 'Not authorized';
  end if;
  if not exists (
    select 1 from public.st_group_activity_recipients r
    where r.series_id = p_series_id and r.user_id = p_user_id
  ) then
    raise exception 'Member not found';
  end if;

  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  perform pg_advisory_xact_lock(hashtext(p_series_id::text || ':' || p_user_id::text || ':' || p_original_date::text)::bigint);
  v_id := public.st_group_activity_ensure_occurrence(p_series_id, p_user_id, p_original_date);
  select * into v_row from public.st_group_activity_occurrences where id = v_id;
  if v_row.completed then
    return jsonb_build_object(
      'occurrence_id', v_row.id,
      'series_id', v_row.series_id,
      'user_id', v_row.user_id,
      'original_date', v_row.original_date,
      'occurrence_date', v_row.occurrence_date,
      'activity_type', v_row.activity_type,
      'title', v_row.title,
      'duration_minutes', v_row.duration_minutes,
      'notes', v_row.notes,
      'details', v_row.details,
      'already_completed', true
    );
  end if;

  update public.st_group_activity_occurrences o
  set
    completed = true,
    snapshotted = true,
    status = 'scheduled',
    activity_type = coalesce(o.activity_type, s.activity_type),
    title = coalesce(o.title, s.title),
    duration_minutes = coalesce(o.duration_minutes, s.duration_minutes),
    notes = coalesce(o.notes, s.notes),
    details = coalesce(o.details, s.details)
  from public.st_group_activity_series s
  where o.id = v_id
    and s.id = o.series_id
    and o.completed = false
  returning o.* into v_row;
  if v_row.id is null then
    raise exception 'Activity not found';
  end if;

  return jsonb_build_object(
    'occurrence_id', v_row.id,
    'series_id', v_row.series_id,
    'user_id', v_row.user_id,
    'original_date', v_row.original_date,
    'occurrence_date', v_row.occurrence_date,
    'activity_type', v_row.activity_type,
    'title', v_row.title,
    'duration_minutes', v_row.duration_minutes,
    'notes', v_row.notes,
    'details', v_row.details,
    'already_completed', false
  );
end;
$$;

revoke all on function public.st_complete_group_activity_occurrence(uuid, uuid, date) from public, anon;
grant execute on function public.st_complete_group_activity_occurrence(uuid, uuid, date) to authenticated;

create or replace function public.st_edit_group_activity_occurrence(
  p_series_id uuid,
  p_user_id uuid,
  p_original_date date,
  p_occurrence_date date,
  p_activity_type text default null,
  p_title text default null,
  p_duration_minutes int default null,
  p_notes text default null,
  p_details jsonb default null,
  p_override_fields text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_id uuid;
  v_row public.st_group_activity_occurrences;
  v_activity text;
  v_title text;
  v_duration int;
  v_notes text;
  v_details jsonb;
  v_display date;
begin
  v_series := public.st_group_activity_require_change(p_series_id);
  if p_original_date is null or p_occurrence_date is null then
    raise exception 'Choose a date';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_override_fields, '{}')) as field
    where field not in ('activity_type', 'title', 'duration_minutes', 'notes', 'details')
  ) then
    raise exception 'Choose which details to change';
  end if;
  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  v_id := public.st_group_activity_ensure_occurrence(p_series_id, p_user_id, p_original_date);
  select * into v_row from public.st_group_activity_occurrences where id = v_id;
  if v_row.completed then
    raise exception 'Completed group activity history cannot be changed';
  end if;

  v_display := p_occurrence_date;
  v_activity := case when 'activity_type' = any (p_override_fields) then p_activity_type else v_row.activity_type end;
  v_title := case
    when 'title' = any (p_override_fields) then nullif(btrim(coalesce(p_title, '')), '')
    else v_row.title
  end;
  v_duration := case when 'duration_minutes' = any (p_override_fields) then p_duration_minutes else v_row.duration_minutes end;
  v_notes := case
    when 'notes' = any (p_override_fields) then nullif(btrim(coalesce(p_notes, '')), '')
    else v_row.notes
  end;
  v_details := case when 'details' = any (p_override_fields) then p_details else v_row.details end;

  if v_activity is not null and v_activity not in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest') then
    raise exception 'Choose an activity type';
  end if;
  if v_duration is not null and v_duration < 0 then
    raise exception 'Choose a duration of zero minutes or more';
  end if;
  if exists (
    select 1 from public.st_group_activity_occurrences o
    where o.series_id = p_series_id
      and o.user_id = p_user_id
      and o.occurrence_date = v_display
      and o.original_date <> p_original_date
  ) then
    raise exception 'That date already has this activity';
  end if;

  update public.st_group_activity_occurrences
  set
    occurrence_date = v_display,
    activity_type = v_activity,
    title = v_title,
    duration_minutes = v_duration,
    notes = v_notes,
    details = v_details
  where id = v_id
  returning * into v_row;

  perform public.st_group_activity_assert_clear(array[p_series_id]);
  if public.st_group_activity_date_taken(
    v_series.team_id, v_series.workout_id, p_user_id, v_display, array[p_series_id]
  ) then
    raise exception 'That workout is already on this date';
  end if;

  return jsonb_build_object(
    'occurrence_id', v_row.id,
    'series_id', v_row.series_id,
    'user_id', v_row.user_id,
    'original_date', v_row.original_date,
    'occurrence_date', v_row.occurrence_date,
    'status', v_row.status,
    'activity_type', v_row.activity_type,
    'title', v_row.title,
    'duration_minutes', v_row.duration_minutes,
    'notes', v_row.notes,
    'details', v_row.details
  );
end;
$$;

revoke all on function public.st_edit_group_activity_occurrence(uuid, uuid, date, date, text, text, int, text, jsonb, text[]) from public, anon;
grant execute on function public.st_edit_group_activity_occurrence(uuid, uuid, date, date, text, text, int, text, jsonb, text[]) to authenticated;

create or replace function public.st_group_activity_assert_outside(
  p_team_id uuid,
  p_workout_id uuid,
  p_series_ids uuid[],
  p_start date,
  p_until date,
  p_weekdays smallint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_date date;
begin
  if p_workout_id is null then
    return;
  end if;
  for v_user in
    select distinct r.user_id
    from public.st_group_activity_recipients r
    where r.series_id = any (p_series_ids)
  loop
    if public.st_group_activity_rule_overlaps(
      p_team_id, p_workout_id, v_user, p_start, p_until, p_weekdays, p_series_ids, p_series_ids
    ) then
      raise exception 'That workout is already on this date';
    end if;
  end loop;
  for v_user, v_date in
    select o.user_id, o.occurrence_date
    from public.st_group_activity_occurrences o
    where o.series_id = any (p_series_ids)
  loop
    if public.st_group_activity_date_taken(p_team_id, p_workout_id, v_user, v_date, p_series_ids) then
      raise exception 'That workout is already on this date';
    end if;
  end loop;
end;
$$;

revoke all on function public.st_group_activity_assert_outside(uuid, uuid, uuid[], date, date, smallint[]) from public, anon, authenticated;

create or replace function public.st_edit_group_activity_future(
  p_series_id uuid,
  p_original_date date,
  p_activity_type text,
  p_title text,
  p_duration_minutes int,
  p_notes text,
  p_details jsonb,
  p_recurrence_weekdays smallint[],
  p_recurrence_until date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.st_group_activity_series;
  v_new uuid;
  v_days smallint[] := coalesce(p_recurrence_weekdays, '{}');
  v_title text;
  v_notes text;
  v_details jsonb;
begin
  v_old := public.st_group_activity_require_change(p_series_id);
  if v_old.recurrence <> 'weekly' then
    raise exception 'This activity does not repeat';
  end if;
  if p_original_date is null then
    raise exception 'Choose a date';
  end if;
  if p_activity_type not in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest') then
    raise exception 'Choose an activity type';
  end if;
  if p_duration_minutes is not null and p_duration_minutes < 0 then
    raise exception 'Choose a duration of zero minutes or more';
  end if;
  if cardinality(v_days) = 0 or not public.st_group_weekdays_valid(v_days) then
    raise exception 'Choose at least one weekday';
  end if;
  if p_recurrence_until is not null and p_recurrence_until < p_original_date then
    raise exception 'The end date is before the start date';
  end if;
  if not public.st_group_activity_slot_open(v_old, p_original_date)
    and not exists (
      select 1 from public.st_group_activity_occurrences o
      where o.series_id = p_series_id and o.original_date = p_original_date
    )
  then
    raise exception 'That date is not on this series';
  end if;

  perform public.st_group_activity_lock(v_old.team_id, v_old.workout_id, p_series_id);
  v_title := coalesce(nullif(btrim(p_title), ''), 'Activity');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  v_details := coalesce(p_details, '{}'::jsonb);

  insert into public.st_group_activity_series (
    team_id, created_by, activity_type, title, duration_minutes, notes, details,
    workout_id, program_id, start_date, recurrence, recurrence_weekdays, recurrence_until,
    required, split_from_series_id
  ) values (
    v_old.team_id, auth.uid(), p_activity_type, v_title, p_duration_minutes, v_notes, v_details,
    v_old.workout_id, v_old.program_id, p_original_date, 'weekly', v_days, p_recurrence_until,
    v_old.required, p_series_id
  )
  returning id into v_new;

  insert into public.st_group_activity_recipients (series_id, user_id)
  select v_new, r.user_id
  from public.st_group_activity_recipients r
  where r.series_id = p_series_id;

  -- Completed snapshots stay on the row. Only the series link and the detached
  -- flag may change, which the completion trigger allows.
  update public.st_group_activity_occurrences
  set
    series_id = v_new,
    detached = case
      when public.st_group_weekday_index(original_date) = any (v_days)
        and (p_recurrence_until is null or original_date <= p_recurrence_until)
        then detached
      else true
    end
  where series_id = p_series_id
    and original_date >= p_original_date;

  update public.st_group_activity_series
  set ended_on = p_original_date - 1
  where id = p_series_id;

  perform public.st_group_activity_assert_clear(array[p_series_id, v_new]);
  perform public.st_group_activity_assert_outside(
    v_old.team_id, v_old.workout_id, array[p_series_id, v_new], p_original_date, p_recurrence_until, v_days
  );

  return jsonb_build_object(
    'series_id', p_series_id,
    'new_series_id', v_new,
    'split_original_date', p_original_date
  );
end;
$$;

revoke all on function public.st_edit_group_activity_future(uuid, date, text, text, int, text, jsonb, smallint[], date) from public, anon;
grant execute on function public.st_edit_group_activity_future(uuid, date, text, text, int, text, jsonb, smallint[], date) to authenticated;

create or replace function public.st_edit_group_activity_series(
  p_series_id uuid,
  p_activity_type text,
  p_title text,
  p_duration_minutes int,
  p_notes text,
  p_details jsonb,
  p_recurrence_weekdays smallint[],
  p_recurrence_until date,
  p_update_until boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_days smallint[];
  v_until date;
  v_title text;
  v_notes text;
begin
  v_series := public.st_group_activity_require_change(p_series_id);
  if p_activity_type not in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest') then
    raise exception 'Choose an activity type';
  end if;
  if p_duration_minutes is not null and p_duration_minutes < 0 then
    raise exception 'Choose a duration of zero minutes or more';
  end if;
  if v_series.recurrence = 'weekly' then
    v_days := coalesce(p_recurrence_weekdays, '{}');
    if cardinality(v_days) = 0 or not public.st_group_weekdays_valid(v_days) then
      raise exception 'Choose at least one weekday';
    end if;
  else
    if cardinality(coalesce(p_recurrence_weekdays, '{}')) > 0 or coalesce(p_update_until, false) then
      raise exception 'This activity does not repeat';
    end if;
    v_days := '{}';
  end if;
  if coalesce(p_update_until, false) then
    if p_recurrence_until is not null and p_recurrence_until < v_series.start_date then
      raise exception 'The end date is before the start date';
    end if;
    v_until := p_recurrence_until;
  else
    v_until := v_series.recurrence_until;
  end if;

  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  v_title := coalesce(nullif(btrim(p_title), ''), 'Activity');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  update public.st_group_activity_series
  set
    activity_type = p_activity_type,
    title = v_title,
    duration_minutes = p_duration_minutes,
    notes = v_notes,
    details = coalesce(p_details, '{}'::jsonb),
    recurrence_weekdays = v_days,
    recurrence_until = v_until
  where id = p_series_id
  returning * into v_series;

  update public.st_group_activity_occurrences o
  set detached = true
  where o.series_id = p_series_id
    and o.detached = false
    and (
      (v_series.recurrence = 'weekly' and not (public.st_group_weekday_index(o.original_date) = any (v_days)))
      or (v_until is not null and o.original_date > v_until)
      or (v_series.ended_on is not null and o.original_date > v_series.ended_on)
    );

  if v_series.recurrence = 'weekly' then
    perform public.st_group_activity_assert_clear(array[p_series_id]);
    perform public.st_group_activity_assert_outside(
      v_series.team_id,
      v_series.workout_id,
      array[p_series_id],
      v_series.start_date,
      least(v_until, v_series.ended_on),
      v_days
    );
  end if;

  return jsonb_build_object(
    'series_id', p_series_id,
    'recurrence', v_series.recurrence,
    'recurrence_weekdays', to_jsonb(v_days),
    'recurrence_until', v_until
  );
end;
$$;

revoke all on function public.st_edit_group_activity_series(uuid, text, text, int, text, jsonb, smallint[], date, boolean) from public, anon;
grant execute on function public.st_edit_group_activity_series(uuid, text, text, int, text, jsonb, smallint[], date, boolean) to authenticated;

create or replace function public.st_skip_group_activity_occurrence(
  p_series_id uuid,
  p_user_id uuid,
  p_original_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_id uuid;
  v_row public.st_group_activity_occurrences;
begin
  v_series := public.st_group_activity_require_change(p_series_id);
  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  v_id := public.st_group_activity_ensure_occurrence(p_series_id, p_user_id, p_original_date);
  select * into v_row from public.st_group_activity_occurrences where id = v_id;
  if v_row.completed then
    raise exception 'Completed group activity history cannot be changed';
  end if;
  if v_row.status <> 'skipped' then
    update public.st_group_activity_occurrences
    set status = 'skipped'
    where id = v_id
    returning * into v_row;
  end if;
  return jsonb_build_object(
    'occurrence_id', v_row.id,
    'series_id', v_row.series_id,
    'original_date', v_row.original_date,
    'occurrence_date', v_row.occurrence_date,
    'status', v_row.status,
    'detached', v_row.detached
  );
end;
$$;

revoke all on function public.st_skip_group_activity_occurrence(uuid, uuid, date) from public, anon;
grant execute on function public.st_skip_group_activity_occurrence(uuid, uuid, date) to authenticated;

create or replace function public.st_restore_group_activity_occurrence(
  p_series_id uuid,
  p_user_id uuid,
  p_original_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_row public.st_group_activity_occurrences;
begin
  v_series := public.st_group_activity_require_change(p_series_id);
  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  select * into v_row
  from public.st_group_activity_occurrences
  where series_id = p_series_id
    and user_id = p_user_id
    and original_date = p_original_date;
  if not found then
    raise exception 'That date is not on this series';
  end if;
  if v_row.completed then
    raise exception 'Completed group activity history cannot be changed';
  end if;
  if v_row.status <> 'skipped' then
    raise exception 'That activity is not skipped';
  end if;
  if public.st_group_activity_slot_open(v_series, p_original_date) then
    update public.st_group_activity_occurrences
    set status = 'scheduled', detached = false
    where id = v_row.id
    returning * into v_row;
    return jsonb_build_object(
      'occurrence_id', v_row.id,
      'restored', true,
      'detached', v_row.detached,
      'status', v_row.status
    );
  end if;

  update public.st_group_activity_occurrences
  set detached = true
  where id = v_row.id
  returning * into v_row;
  return jsonb_build_object(
    'occurrence_id', v_row.id,
    'restored', false,
    'detached', true,
    'status', v_row.status,
    'message', 'That weekday is no longer on this series'
  );
end;
$$;

revoke all on function public.st_restore_group_activity_occurrence(uuid, uuid, date) from public, anon;
grant execute on function public.st_restore_group_activity_occurrence(uuid, uuid, date) to authenticated;

create or replace function public.st_end_group_activity_series(
  p_series_id uuid,
  p_last_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_deleted boolean := false;
begin
  v_series := public.st_group_activity_require_change(p_series_id);
  if p_last_date is null then
    raise exception 'Choose the last day';
  end if;
  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  update public.st_group_activity_series
  set ended_on = p_last_date
  where id = p_series_id
  returning * into v_series;

  update public.st_group_activity_occurrences
  set detached = true
  where series_id = p_series_id
    and detached = false
    and original_date > p_last_date;

  if not exists (
    select 1 from public.st_group_activity_occurrences where series_id = p_series_id
  ) then
    delete from public.st_group_activity_series where id = p_series_id;
    v_deleted := true;
  end if;

  return jsonb_build_object(
    'series_id', p_series_id,
    'ended_on', p_last_date,
    'deleted', v_deleted
  );
end;
$$;

revoke all on function public.st_end_group_activity_series(uuid, date) from public, anon;
grant execute on function public.st_end_group_activity_series(uuid, date) to authenticated;

revoke all on function public.st_user_can_read_group_activity(uuid) from public, anon;
grant execute on function public.st_user_can_read_group_activity(uuid) to authenticated;

do $$
declare
  v_count int;
  v_args text;
begin
  select count(*), min(pg_get_function_identity_arguments(p.oid))
    into v_count, v_args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'st_save_group_activity';
  if v_count <> 1 then
    raise exception 'st_save_group_activity overload count is %, expected 1', v_count;
  end if;
  if v_args <> 'p_team_id uuid, p_activity_type text, p_title text, p_occurrence_date date, p_recipient_user_ids uuid[], p_request_key text, p_duration_minutes integer, p_notes text, p_details jsonb, p_workout_id uuid, p_program_id uuid, p_required boolean, p_recurrence text, p_recurrence_weekdays smallint[], p_recurrence_until date' then
    raise exception 'st_save_group_activity signature changed: %', v_args;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;


-- ===== 20261021_070_group_strength_shelf.sql =====

-- BIQ-0263 Phase 3A. Apply manually in the Supabase SQL Editor. The app does not run this.
-- Standalone group strength workouts live on a shelf program so st_workouts.program_id
-- can stay required. The shelf is not a training program, an enrollment, or an expectation.
-- Migrations 068 and 069 are not modified.

begin;

alter table public.st_programs
  add column if not exists program_use text not null default 'training';

alter table public.st_programs
  drop constraint if exists st_programs_program_use_check;
alter table public.st_programs
  add constraint st_programs_program_use_check
  check (program_use in ('training', 'group_strength_shelf'));

create unique index if not exists st_programs_one_group_strength_shelf
  on public.st_programs (team_id)
  where program_use = 'group_strength_shelf';

comment on column public.st_programs.program_use is
  'training is a normal personal or group program. group_strength_shelf only holds standalone group workouts.';

alter table public.st_group_activity_occurrences
  add column if not exists workout_id uuid references public.st_workouts(id) on delete restrict;

comment on column public.st_group_activity_occurrences.workout_id is
  'Prescription for this date when it differs from the series. Null follows the series workout.';

create index if not exists st_group_activity_occurrences_workout_idx
  on public.st_group_activity_occurrences (workout_id)
  where workout_id is not null;

alter table public.st_group_activity_recipients
  add column if not exists removed_on date;

comment on column public.st_group_activity_recipients.removed_on is
  'First date this person no longer receives future occurrences. Stored history stays.';

-- A completed row may receive its workout id once. After that, the prescription link stays.
create or replace function public.st_group_activity_freeze_completed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.original_date is distinct from old.original_date then
    raise exception 'The original occurrence date cannot be changed';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'The activity recipient cannot be changed';
  end if;
  if tg_op = 'UPDATE' and new.series_id is distinct from old.series_id then
    if not exists (
      select 1
      from public.st_group_activity_series old_series
      join public.st_group_activity_series new_series on new_series.id = new.series_id
      where old_series.id = old.series_id
        and old_series.team_id = new_series.team_id
    ) then
      raise exception 'The activity cannot move to another group';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.completed then
    if new.completed is distinct from old.completed
      or new.occurrence_date is distinct from old.occurrence_date
      or new.status is distinct from old.status
      or new.activity_type is distinct from old.activity_type
      or new.title is distinct from old.title
      or new.duration_minutes is distinct from old.duration_minutes
      or new.notes is distinct from old.notes
      or new.details is distinct from old.details
      or new.snapshotted is distinct from old.snapshotted
      or new.created_at is distinct from old.created_at
      or new.id is distinct from old.id
      or (new.detached is distinct from old.detached and not (old.detached = false and new.detached = true))
      or (old.workout_id is not null and new.workout_id is distinct from old.workout_id)
    then
      raise exception 'Completed group activity history cannot be changed';
    end if;
  end if;
  if tg_op = 'INSERT' and new.completed
    and (not new.snapshotted or new.activity_type is null or new.title is null or new.details is null)
  then
    raise exception 'Completed group activity is missing its snapshot';
  end if;
  if tg_op = 'UPDATE' and new.completed and not old.completed
    and (not new.snapshotted or new.activity_type is null or new.title is null or new.details is null)
  then
    raise exception 'Completed group activity is missing its snapshot';
  end if;
  return new;
end;
$$;

revoke all on function public.st_group_activity_freeze_completed() from public, anon, authenticated;

create or replace function public.st_group_activity_effective_workout(
  p_occurrence_workout uuid,
  p_series_workout uuid
)
returns uuid
language sql
immutable
as $$
  select coalesce(p_occurrence_workout, p_series_workout);
$$;

revoke all on function public.st_group_activity_effective_workout(uuid, uuid) from public, anon, authenticated;

create or replace function public.st_group_activity_date_taken(
  p_team_id uuid,
  p_workout_id uuid,
  p_user_id uuid,
  p_date date,
  p_ignore_series uuid[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_workout_id is not null and p_date is not null and (
    exists (
      select 1
      from public.st_group_activity_occurrences o
      join public.st_group_activity_series s on s.id = o.series_id
      where s.team_id = p_team_id
        and public.st_group_activity_effective_workout(o.workout_id, s.workout_id) = p_workout_id
        and o.user_id = p_user_id
        and o.occurrence_date = p_date
        and (p_ignore_series is null or not (s.id = any (p_ignore_series)))
    )
    or exists (
      select 1
      from public.st_group_activity_series s
      join public.st_group_activity_recipients r
        on r.series_id = s.id and r.user_id = p_user_id
      where s.team_id = p_team_id
        and s.workout_id = p_workout_id
        and s.recurrence = 'weekly'
        and (r.removed_on is null or p_date < r.removed_on)
        and (p_ignore_series is null or not (s.id = any (p_ignore_series)))
        and p_date >= s.start_date
        and (s.ended_on is null or p_date <= s.ended_on)
        and (s.recurrence_until is null or p_date <= s.recurrence_until)
        and public.st_group_weekday_index(p_date) = any (s.recurrence_weekdays)
        and not exists (
          select 1
          from public.st_group_activity_occurrences o
          where o.series_id = s.id
            and o.user_id = p_user_id
            and o.original_date = p_date
        )
    )
  );
$$;

revoke all on function public.st_group_activity_date_taken(uuid, uuid, uuid, date, uuid[]) from public, anon, authenticated;

create or replace function public.st_group_activity_rule_overlaps(
  p_team_id uuid,
  p_workout_id uuid,
  p_user_id uuid,
  p_start date,
  p_until date,
  p_weekdays smallint[],
  p_ignore_series uuid[] default null,
  p_suppress_series uuid[] default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_removed date;
  v_old_end date;
  v_overlap_start date;
  v_overlap_end date;
  v_day smallint;
  v_first date;
  v_open int;
begin
  if p_workout_id is null or p_start is null or cardinality(coalesce(p_weekdays, '{}')) = 0 then
    return false;
  end if;

  if exists (
    select 1
    from public.st_group_activity_occurrences o
    join public.st_group_activity_series s on s.id = o.series_id
    where s.team_id = p_team_id
      and public.st_group_activity_effective_workout(o.workout_id, s.workout_id) = p_workout_id
      and o.user_id = p_user_id
      and (p_ignore_series is null or not (s.id = any (p_ignore_series)))
      and o.occurrence_date >= p_start
      and (p_until is null or o.occurrence_date <= p_until)
      and public.st_group_weekday_index(o.occurrence_date) = any (p_weekdays)
      and not exists (
        select 1
        from public.st_group_activity_occurrences mine
        where p_suppress_series is not null
          and mine.series_id = any (p_suppress_series)
          and mine.user_id = p_user_id
          and mine.original_date = o.occurrence_date
      )
  ) then
    return true;
  end if;

  for v_series in
    select s.*
    from public.st_group_activity_series s
    join public.st_group_activity_recipients r
      on r.series_id = s.id and r.user_id = p_user_id
    where s.team_id = p_team_id
      and s.workout_id = p_workout_id
      and s.recurrence = 'weekly'
      and (r.removed_on is null or r.removed_on > p_start)
      and (p_ignore_series is null or not (s.id = any (p_ignore_series)))
  loop
    select r.removed_on into v_removed
    from public.st_group_activity_recipients r
    where r.series_id = v_series.id and r.user_id = p_user_id;
    v_old_end := least(v_series.ended_on, v_series.recurrence_until);
    if v_removed is not null then
      v_old_end := least(v_old_end, v_removed - 1);
    end if;
    v_overlap_start := greatest(p_start, v_series.start_date);
    if p_until is null and v_old_end is null then
      v_overlap_end := null;
    elsif p_until is null then
      v_overlap_end := v_old_end;
    elsif v_old_end is null then
      v_overlap_end := p_until;
    else
      v_overlap_end := least(p_until, v_old_end);
    end if;
    if v_overlap_end is not null and v_overlap_end < v_overlap_start then
      continue;
    end if;

    foreach v_day in array v_series.recurrence_weekdays loop
      if not (v_day = any (p_weekdays)) then
        continue;
      end if;
      if v_overlap_end is null then
        return true;
      end if;
      v_first := v_overlap_start + ((v_day - public.st_group_weekday_index(v_overlap_start) + 7) % 7);
      if v_first > v_overlap_end then
        continue;
      end if;
      select count(*) into v_open
      from generate_series(0, ((v_overlap_end - v_first) / 7)) as g(n)
      where not exists (
        select 1
        from public.st_group_activity_occurrences o
        where o.series_id = v_series.id
          and o.user_id = p_user_id
          and o.original_date = v_first + (g.n * 7)
      )
      and not exists (
        select 1
        from public.st_group_activity_occurrences mine
        where p_suppress_series is not null
          and mine.series_id = any (p_suppress_series)
          and mine.user_id = p_user_id
          and mine.original_date = v_first + (g.n * 7)
      );
      if v_open > 0 then
        return true;
      end if;
    end loop;
  end loop;
  return false;
end;
$$;

revoke all on function public.st_group_activity_rule_overlaps(uuid, uuid, uuid, date, date, smallint[], uuid[], uuid[]) from public, anon, authenticated;

create or replace function public.st_group_activity_assert_clear(p_series_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_series public.st_group_activity_series;
begin
  if p_series_ids is null or cardinality(p_series_ids) = 0 then
    return;
  end if;
  if exists (
    select 1
    from public.st_group_activity_occurrences o
    where o.series_id = any (p_series_ids)
    group by o.user_id, o.occurrence_date
    having count(*) > 1
  ) then
    raise exception 'Those dates would show more than one activity';
  end if;

  for v_row in
    select o.user_id, o.occurrence_date, o.original_date, o.series_id
    from public.st_group_activity_occurrences o
    where o.series_id = any (p_series_ids)
  loop
    for v_series in
      select s.*
      from public.st_group_activity_series s
      where s.id = any (p_series_ids)
        and s.recurrence = 'weekly'
    loop
      if v_row.occurrence_date >= v_series.start_date
        and (v_series.ended_on is null or v_row.occurrence_date <= v_series.ended_on)
        and (v_series.recurrence_until is null or v_row.occurrence_date <= v_series.recurrence_until)
        and public.st_group_weekday_index(v_row.occurrence_date) = any (v_series.recurrence_weekdays)
        and exists (
          select 1
          from public.st_group_activity_recipients r
          where r.series_id = v_series.id
            and r.user_id = v_row.user_id
            and (r.removed_on is null or v_row.occurrence_date < r.removed_on)
        )
        and not exists (
          select 1
          from public.st_group_activity_occurrences owner_row
          where owner_row.series_id = v_series.id
            and owner_row.user_id = v_row.user_id
            and owner_row.original_date = v_row.occurrence_date
        )
      then
        raise exception 'Those dates would show more than one activity';
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.st_group_activity_assert_clear(uuid[]) from public, anon, authenticated;

create or replace function public.st_save_group_activity(
  p_team_id uuid,
  p_activity_type text,
  p_title text,
  p_occurrence_date date,
  p_recipient_user_ids uuid[],
  p_request_key text,
  p_duration_minutes int default null,
  p_notes text default null,
  p_details jsonb default '{}'::jsonb,
  p_workout_id uuid default null,
  p_program_id uuid default null,
  p_required boolean default false,
  p_recurrence text default 'none',
  p_recurrence_weekdays smallint[] default '{}',
  p_recurrence_until date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_prior jsonb;
  v_series uuid;
  v_ids uuid[];
  v_uid uuid;
  v_occurrence uuid;
  v_occurrences uuid[] := '{}';
  v_title text;
  v_recurrence text := coalesce(p_recurrence, 'none');
  v_days smallint[] := coalesce(p_recurrence_weekdays, '{}');
  v_until date := p_recurrence_until;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null or p_occurrence_date is null then
    raise exception 'Choose a group and a date';
  end if;
  if p_activity_type not in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest') then
    raise exception 'Choose an activity type';
  end if;
  if p_activity_type = 'strength' and p_workout_id is null then
    raise exception 'Choose a program workout for strength. A custom group workout is not available yet.';
  end if;
  if p_duration_minutes is not null and p_duration_minutes < 0 then
    raise exception 'Choose a duration of zero minutes or more';
  end if;
  if not exists (
    select 1 from public.st_team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  select coalesce(array_agg(distinct uid), '{}')
    into v_ids
  from unnest(coalesce(p_recipient_user_ids, '{}'::uuid[])) as uid
  where uid is not null;
  if cardinality(v_ids) = 0 then
    v_ids := array[auth.uid()];
  end if;
  if exists (
    select 1 from unnest(v_ids) as uid
    where not exists (
      select 1 from public.st_team_members tm
      where tm.team_id = p_team_id and tm.user_id = uid and tm.status = 'active'
    )
  ) then
    raise exception 'Member not found';
  end if;
  if v_ids <> array[auth.uid()] and not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if coalesce(p_required, false) and not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Only a manager can mark an extra required';
  end if;
  if p_workout_id is not null and not exists (
    select 1
    from public.st_workouts w
    join public.st_programs p on p.id = w.program_id
    where w.id = p_workout_id
      and p.team_id = p_team_id
      and (
        p.visibility = 'team'
        or p.program_use = 'group_strength_shelf'
      )
  ) then
    raise exception 'Publish a group program before assigning it';
  end if;
  if v_recurrence not in ('none', 'weekly') then
    raise exception 'Choose how this activity repeats';
  end if;
  if v_recurrence = 'none' then
    v_days := '{}';
    v_until := null;
  elsif cardinality(v_days) = 0 or not public.st_group_weekdays_valid(v_days) then
    raise exception 'Choose at least one weekday';
  elsif not (public.st_group_weekday_index(p_occurrence_date) = any (v_days)) then
    raise exception 'Choose a start date on one of the selected weekdays';
  elsif v_until is not null and v_until < p_occurrence_date then
    raise exception 'The end date is before the start date';
  end if;

  v_key := nullif(btrim(coalesce(p_request_key, '')), '');
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext(p_team_id::text || ':activity:' || v_key)::bigint);
    select r.result into v_prior
    from public.st_group_activity_requests r
    where r.team_id = p_team_id and r.request_key = v_key;
    if found then
      return v_prior;
    end if;
  end if;

  perform public.st_group_activity_lock(p_team_id, p_workout_id, null);
  if p_workout_id is not null then
    foreach v_uid in array v_ids loop
      if v_recurrence = 'none' and public.st_group_activity_date_taken(
        p_team_id, p_workout_id, v_uid, p_occurrence_date, null
      ) then
        raise exception 'That workout is already on this date';
      end if;
      if v_recurrence = 'weekly' and public.st_group_activity_rule_overlaps(
        p_team_id, p_workout_id, v_uid, p_occurrence_date, v_until, v_days, null
      ) then
        raise exception 'That workout is already on this date';
      end if;
    end loop;
  end if;

  v_title := coalesce(nullif(btrim(p_title), ''), 'Activity');
  insert into public.st_group_activity_series (
    team_id, created_by, activity_type, title, duration_minutes, notes, details,
    workout_id, program_id, start_date, recurrence, recurrence_weekdays, recurrence_until, required
  ) values (
    p_team_id, auth.uid(), p_activity_type, v_title, p_duration_minutes,
    nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_details, '{}'::jsonb), p_workout_id, p_program_id, p_occurrence_date,
    v_recurrence, v_days, v_until, coalesce(p_required, false)
  )
  returning id into v_series;

  foreach v_uid in array v_ids loop
    insert into public.st_group_activity_recipients (series_id, user_id)
    values (v_series, v_uid);
    if v_recurrence = 'none' then
      insert into public.st_group_activity_occurrences (
        series_id, user_id, original_date, occurrence_date
      ) values (
        v_series, v_uid, p_occurrence_date, p_occurrence_date
      )
      returning id into v_occurrence;
      v_occurrences := v_occurrences || v_occurrence;
    end if;
  end loop;

  v_prior := jsonb_build_object(
    'series_id', v_series,
    'occurrence_ids', to_jsonb(v_occurrences),
    'request_key', v_key
  );
  if v_key is not null then
    insert into public.st_group_activity_requests (team_id, request_key, requested_by, result)
    values (p_team_id, v_key, auth.uid(), v_prior);
  end if;
  return v_prior;
end;
$$;

revoke all on function public.st_save_group_activity(uuid, text, text, date, uuid[], text, int, text, jsonb, uuid, uuid, boolean, text, smallint[], date) from public, anon;
grant execute on function public.st_save_group_activity(uuid, text, text, date, uuid[], text, int, text, jsonb, uuid, uuid, boolean, text, smallint[], date) to authenticated;

create or replace function public.st_group_strength_date_has_performance(
  p_workout_id uuid,
  p_user_id uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_workout_id is not null and p_user_id is not null and p_date is not null and exists (
    select 1
    from public.st_set_logs sl
    left join public.st_planned_sets ps on ps.id = sl.planned_set_id
    left join public.st_exercises e on e.id = coalesce(ps.exercise_id, sl.exercise_id)
    where e.workout_id = p_workout_id
      and sl.user_id = p_user_id
      and sl.log_date = p_date
      and (
        coalesce(sl.completed, false)
        or coalesce(length(trim(sl.actual_weight)), 0) > 0
        or coalesce(length(trim(sl.actual_reps)), 0) > 0
        or coalesce(length(trim(sl.actual_duration)), 0) > 0
        or coalesce(length(trim(sl.actual_distance)), 0) > 0
      )
  );
$$;

revoke all on function public.st_group_strength_date_has_performance(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.st_edit_group_activity_occurrence(
  p_series_id uuid,
  p_user_id uuid,
  p_original_date date,
  p_occurrence_date date,
  p_activity_type text default null,
  p_title text default null,
  p_duration_minutes int default null,
  p_notes text default null,
  p_details jsonb default null,
  p_override_fields text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_id uuid;
  v_row public.st_group_activity_occurrences;
  v_activity text;
  v_title text;
  v_duration int;
  v_notes text;
  v_details jsonb;
  v_display date;
  v_workout uuid;
begin
  v_series := public.st_group_activity_require_change(p_series_id);
  if p_original_date is null or p_occurrence_date is null then
    raise exception 'Choose a date';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_override_fields, '{}')) as field
    where field not in ('activity_type', 'title', 'duration_minutes', 'notes', 'details')
  ) then
    raise exception 'Choose which details to change';
  end if;
  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  v_id := public.st_group_activity_ensure_occurrence(p_series_id, p_user_id, p_original_date);
  select * into v_row from public.st_group_activity_occurrences where id = v_id;
  if v_row.completed then
    raise exception 'Completed group activity history cannot be changed';
  end if;
  v_workout := public.st_group_activity_effective_workout(v_row.workout_id, v_series.workout_id);
  perform public.st_group_activity_lock(v_series.team_id, v_workout, null);

  v_display := p_occurrence_date;
  if v_display is distinct from v_row.occurrence_date
    and public.st_group_strength_date_has_performance(v_workout, p_user_id, v_row.occurrence_date)
  then
    raise exception 'A logged workout cannot be moved';
  end if;
  v_activity := case when 'activity_type' = any (p_override_fields) then p_activity_type else v_row.activity_type end;
  v_title := case
    when 'title' = any (p_override_fields) then nullif(btrim(coalesce(p_title, '')), '')
    else v_row.title
  end;
  v_duration := case when 'duration_minutes' = any (p_override_fields) then p_duration_minutes else v_row.duration_minutes end;
  v_notes := case
    when 'notes' = any (p_override_fields) then nullif(btrim(coalesce(p_notes, '')), '')
    else v_row.notes
  end;
  v_details := case when 'details' = any (p_override_fields) then p_details else v_row.details end;

  if v_activity is not null and v_activity not in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest') then
    raise exception 'Choose an activity type';
  end if;
  if v_duration is not null and v_duration < 0 then
    raise exception 'Choose a duration of zero minutes or more';
  end if;
  if exists (
    select 1 from public.st_group_activity_occurrences o
    where o.series_id = p_series_id
      and o.user_id = p_user_id
      and o.occurrence_date = v_display
      and o.original_date <> p_original_date
  ) then
    raise exception 'That date already has this activity';
  end if;

  update public.st_group_activity_occurrences
  set
    occurrence_date = v_display,
    activity_type = v_activity,
    title = v_title,
    duration_minutes = v_duration,
    notes = v_notes,
    details = v_details
  where id = v_id
  returning * into v_row;

  perform public.st_group_activity_assert_clear(array[p_series_id]);
  if public.st_group_activity_date_taken(
    v_series.team_id, v_workout, p_user_id, v_display, array[p_series_id]
  ) then
    raise exception 'That workout is already on this date';
  end if;

  return jsonb_build_object(
    'occurrence_id', v_row.id,
    'series_id', v_row.series_id,
    'user_id', v_row.user_id,
    'original_date', v_row.original_date,
    'occurrence_date', v_row.occurrence_date,
    'status', v_row.status,
    'activity_type', v_row.activity_type,
    'title', v_row.title,
    'duration_minutes', v_row.duration_minutes,
    'notes', v_row.notes,
    'details', v_row.details
  );
end;
$$;

-- The performance helper is created below. PostgreSQL allows the call because
-- the function body is planned at execution. The helper must exist before tests run.

create or replace function public.st_edit_group_activity_future(
  p_series_id uuid,
  p_original_date date,
  p_activity_type text,
  p_title text,
  p_duration_minutes int,
  p_notes text,
  p_details jsonb,
  p_recurrence_weekdays smallint[],
  p_recurrence_until date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.st_group_activity_series;
  v_new uuid;
  v_days smallint[] := coalesce(p_recurrence_weekdays, '{}');
  v_title text;
  v_notes text;
  v_details jsonb;
begin
  v_old := public.st_group_activity_require_change(p_series_id);
  if v_old.recurrence <> 'weekly' then
    raise exception 'This activity does not repeat';
  end if;
  if p_original_date is null then
    raise exception 'Choose a date';
  end if;
  if p_activity_type not in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest') then
    raise exception 'Choose an activity type';
  end if;
  if p_duration_minutes is not null and p_duration_minutes < 0 then
    raise exception 'Choose a duration of zero minutes or more';
  end if;
  if cardinality(v_days) = 0 or not public.st_group_weekdays_valid(v_days) then
    raise exception 'Choose at least one weekday';
  end if;
  if p_recurrence_until is not null and p_recurrence_until < p_original_date then
    raise exception 'The end date is before the start date';
  end if;
  if not public.st_group_activity_slot_open(v_old, p_original_date)
    and not exists (
      select 1 from public.st_group_activity_occurrences o
      where o.series_id = p_series_id and o.original_date = p_original_date
    )
  then
    raise exception 'That date is not on this series';
  end if;

  perform public.st_group_activity_lock(v_old.team_id, v_old.workout_id, p_series_id);
  v_title := coalesce(nullif(btrim(p_title), ''), 'Activity');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  v_details := coalesce(p_details, '{}'::jsonb);

  insert into public.st_group_activity_series (
    team_id, created_by, activity_type, title, duration_minutes, notes, details,
    workout_id, program_id, start_date, recurrence, recurrence_weekdays, recurrence_until,
    required, split_from_series_id
  ) values (
    v_old.team_id, auth.uid(), p_activity_type, v_title, p_duration_minutes, v_notes, v_details,
    v_old.workout_id, v_old.program_id, p_original_date, 'weekly', v_days, p_recurrence_until,
    v_old.required, p_series_id
  )
  returning id into v_new;

  insert into public.st_group_activity_recipients (series_id, user_id, removed_on)
  select v_new, r.user_id, r.removed_on
  from public.st_group_activity_recipients r
  where r.series_id = p_series_id;

  update public.st_group_activity_occurrences
  set
    series_id = v_new,
    detached = case
      when public.st_group_weekday_index(original_date) = any (v_days)
        and (p_recurrence_until is null or original_date <= p_recurrence_until)
        then detached
      else true
    end
  where series_id = p_series_id
    and original_date >= p_original_date;

  update public.st_group_activity_series
  set ended_on = p_original_date - 1
  where id = p_series_id;

  perform public.st_group_activity_assert_clear(array[p_series_id, v_new]);
  perform public.st_group_activity_assert_outside(
    v_old.team_id, v_old.workout_id, array[p_series_id, v_new], p_original_date, p_recurrence_until, v_days
  );

  return jsonb_build_object(
    'series_id', p_series_id,
    'new_series_id', v_new,
    'split_original_date', p_original_date
  );
end;
$$;

revoke all on function public.st_edit_group_activity_future(uuid, date, text, text, int, text, jsonb, smallint[], date) from public, anon;
grant execute on function public.st_edit_group_activity_future(uuid, date, text, text, int, text, jsonb, smallint[], date) to authenticated;

drop function public.st_list_group_activities(uuid, date, date, uuid);

create function public.st_list_group_activities(
  p_team_id uuid,
  p_from date,
  p_to date,
  p_user_id uuid default null
)
returns table (
  series_id uuid,
  occurrence_id uuid,
  user_id uuid,
  original_date date,
  occurrence_date date,
  status text,
  completed boolean,
  detached boolean,
  activity_type text,
  title text,
  duration_minutes int,
  notes text,
  details jsonb,
  required boolean,
  virtual boolean,
  workout_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null or p_from is null or p_to is null or p_to < p_from or p_to > p_from + 111 then
    raise exception 'Choose a date range of 16 weeks or less';
  end if;
  if not exists (
    select 1 from public.st_team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    s.id,
    o.id,
    o.user_id,
    o.original_date,
    o.occurrence_date,
    o.status,
    o.completed,
    o.detached,
    case when o.completed then o.activity_type else coalesce(o.activity_type, s.activity_type) end,
    case when o.completed then coalesce(o.title, 'Completed activity') else coalesce(o.title, s.title) end,
    case when o.completed then o.duration_minutes else coalesce(o.duration_minutes, s.duration_minutes) end,
    case when o.completed then o.notes else coalesce(o.notes, s.notes) end,
    case when o.completed then o.details else coalesce(o.details, s.details) end,
    s.required,
    false,
    public.st_group_activity_effective_workout(o.workout_id, s.workout_id)
  from public.st_group_activity_occurrences o
  join public.st_group_activity_series s on s.id = o.series_id
  where s.team_id = p_team_id
    and o.occurrence_date between p_from and p_to
    and (p_user_id is null or o.user_id = p_user_id)
    and public.st_user_can_read_group_activity(s.id);

  return query
  select
    s.id,
    null::uuid,
    r.user_id,
    d.occurrence_date,
    d.occurrence_date,
    'scheduled'::text,
    false,
    false,
    s.activity_type,
    s.title,
    s.duration_minutes,
    s.notes,
    s.details,
    s.required,
    true,
    s.workout_id
  from public.st_group_activity_series s
  join public.st_group_activity_recipients r on r.series_id = s.id
  join lateral (
    select (greatest(s.start_date, p_from) + g.n)::date as occurrence_date
    from generate_series(
      0,
      least(p_to, coalesce(s.ended_on, p_to), coalesce(s.recurrence_until, p_to))
        - greatest(s.start_date, p_from)
    ) as g(n)
  ) as d on true
  where s.team_id = p_team_id
    and s.recurrence = 'weekly'
    and (r.removed_on is null or d.occurrence_date < r.removed_on)
    and (p_user_id is null or r.user_id = p_user_id)
    and d.occurrence_date between p_from and p_to
    and public.st_group_weekday_index(d.occurrence_date) = any (s.recurrence_weekdays)
    and public.st_user_can_read_group_activity(s.id)
    and not exists (
      select 1
      from public.st_group_activity_occurrences o
      where o.series_id = s.id
        and o.user_id = r.user_id
        and o.original_date = d.occurrence_date
    );
end;
$$;

revoke all on function public.st_list_group_activities(uuid, date, date, uuid) from public, anon;
grant execute on function public.st_list_group_activities(uuid, date, date, uuid) to authenticated;

create or replace function public.st_group_strength_date_has_performance(
  p_workout_id uuid,
  p_user_id uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_workout_id is not null and p_user_id is not null and p_date is not null and exists (
    select 1
    from public.st_set_logs sl
    left join public.st_planned_sets ps on ps.id = sl.planned_set_id
    left join public.st_exercises e on e.id = coalesce(ps.exercise_id, sl.exercise_id)
    where e.workout_id = p_workout_id
      and sl.user_id = p_user_id
      and sl.log_date = p_date
      and (
        coalesce(sl.completed, false)
        or coalesce(length(trim(sl.actual_weight)), 0) > 0
        or coalesce(length(trim(sl.actual_reps)), 0) > 0
        or coalesce(length(trim(sl.actual_duration)), 0) > 0
        or coalesce(length(trim(sl.actual_distance)), 0) > 0
      )
  );
$$;

revoke all on function public.st_group_strength_date_has_performance(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.st_group_strength_workout_has_performance(p_workout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_set_logs sl
    left join public.st_planned_sets ps on ps.id = sl.planned_set_id
    left join public.st_exercises e on e.id = coalesce(ps.exercise_id, sl.exercise_id)
    where e.workout_id = p_workout_id
      and (
        coalesce(sl.completed, false)
        or coalesce(length(trim(sl.actual_weight)), 0) > 0
        or coalesce(length(trim(sl.actual_reps)), 0) > 0
        or coalesce(length(trim(sl.actual_duration)), 0) > 0
        or coalesce(length(trim(sl.actual_distance)), 0) > 0
      )
  );
$$;

revoke all on function public.st_group_strength_workout_has_performance(uuid) from public, anon, authenticated;

create or replace function public.st_user_can_read_group_strength_workout(p_workout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_workouts w
    join public.st_programs p on p.id = w.program_id
    join public.st_team_members tm
      on tm.team_id = p.team_id
     and tm.user_id = auth.uid()
     and tm.status = 'active'
    where w.id = p_workout_id
      and p.program_use = 'group_strength_shelf'
      and (
        public.st_user_can_assign_in_group(p.team_id)
        or public.st_user_can_view_group_progress(p.team_id)
        or exists (
          select 1
          from public.st_group_activity_recipients r
          join public.st_group_activity_series s on s.id = r.series_id
          where r.user_id = auth.uid()
            and s.team_id = p.team_id
            and (
              s.workout_id = w.id
              or exists (
                select 1
                from public.st_group_activity_occurrences o
                where o.series_id = s.id
                  and o.user_id = auth.uid()
                  and o.workout_id = w.id
              )
            )
        )
      )
  );
$$;

revoke all on function public.st_user_can_read_group_strength_workout(uuid) from public, anon;
grant execute on function public.st_user_can_read_group_strength_workout(uuid) to authenticated;

alter table public.st_programs enable row level security;
alter table public.st_workouts enable row level security;
alter table public.st_exercises enable row level security;
alter table public.st_planned_sets enable row level security;

drop policy if exists st_programs_select_group_strength_shelf on public.st_programs;
create policy st_programs_select_group_strength_shelf
  on public.st_programs
  for select
  to authenticated
  using (
    program_use = 'group_strength_shelf'
    and (
      public.st_user_can_assign_in_group(team_id)
      or public.st_user_can_view_group_progress(team_id)
    )
  );

drop policy if exists st_workouts_select_group_strength_shelf on public.st_workouts;
create policy st_workouts_select_group_strength_shelf
  on public.st_workouts
  for select
  to authenticated
  using (public.st_user_can_read_group_strength_workout(id));

drop policy if exists st_exercises_select_group_strength_shelf on public.st_exercises;
create policy st_exercises_select_group_strength_shelf
  on public.st_exercises
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.st_workouts w
      where w.id = st_exercises.workout_id
        and public.st_user_can_read_group_strength_workout(w.id)
    )
  );

drop policy if exists st_planned_sets_select_group_strength_shelf on public.st_planned_sets;
create policy st_planned_sets_select_group_strength_shelf
  on public.st_planned_sets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.st_exercises e
      join public.st_workouts w on w.id = e.workout_id
      where e.id = st_planned_sets.exercise_id
        and public.st_user_can_read_group_strength_workout(w.id)
    )
  );

grant select on public.st_programs to authenticated;
grant select on public.st_workouts to authenticated;
grant select on public.st_exercises to authenticated;
grant select on public.st_planned_sets to authenticated;

create or replace function public.st_reject_group_strength_shelf_program()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.program_id is not null and exists (
    select 1
    from public.st_programs p
    where p.id = new.program_id
      and p.program_use = 'group_strength_shelf'
  ) then
    raise exception 'A group strength workout is not a training program';
  end if;
  return new;
end;
$$;

revoke all on function public.st_reject_group_strength_shelf_program() from public, anon, authenticated;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'st_training_enrollments' and column_name = 'program_id'
  ) then
    drop trigger if exists st_training_enrollments_reject_strength_shelf on public.st_training_enrollments;
    create trigger st_training_enrollments_reject_strength_shelf
      before insert or update of program_id on public.st_training_enrollments
      for each row execute function public.st_reject_group_strength_shelf_program();
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'st_training_program_segments' and column_name = 'program_id'
  ) then
    drop trigger if exists st_training_program_segments_reject_strength_shelf on public.st_training_program_segments;
    create trigger st_training_program_segments_reject_strength_shelf
      before insert or update of program_id on public.st_training_program_segments
      for each row execute function public.st_reject_group_strength_shelf_program();
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'st_training_expectations' and column_name = 'program_id'
  ) then
    drop trigger if exists st_training_expectations_reject_strength_shelf on public.st_training_expectations;
    create trigger st_training_expectations_reject_strength_shelf
      before insert or update of program_id on public.st_training_expectations
      for each row execute function public.st_reject_group_strength_shelf_program();
  end if;
end $$;

create or replace function public.st_ensure_group_strength_shelf(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from public.st_team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;
  perform pg_advisory_xact_lock(hashtext('shelf:' || p_team_id::text)::bigint);
  select p.id into v_id
  from public.st_programs p
  where p.team_id = p_team_id
    and p.program_use = 'group_strength_shelf';
  if found then
    return v_id;
  end if;
  insert into public.st_programs (
    id, team_id, visibility, owner_user_id, name, status, program_use
  ) values (
    gen_random_uuid(), p_team_id, 'group_shelf', auth.uid(), 'Group strength workouts', 'draft', 'group_strength_shelf'
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.st_ensure_group_strength_shelf(uuid) from public, anon, authenticated;

create or replace function public.st_clone_group_strength_workout(p_workout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program uuid;
  v_use text;
  v_new uuid;
  v_ex public.st_exercises%rowtype;
  v_new_ex uuid;
  v_group uuid;
  v_map jsonb := '{}'::jsonb;
begin
  select w.program_id, p.program_use
    into v_program, v_use
  from public.st_workouts w
  join public.st_programs p on p.id = w.program_id
  where w.id = p_workout_id;
  if v_program is null or v_use is distinct from 'group_strength_shelf' then
    raise exception 'Only a group strength workout can be copied';
  end if;
  insert into public.st_workouts (
    id, program_id, week, day_order, day_label, workout_type, week_status
  )
  select gen_random_uuid(), v_program, week, day_order, day_label, workout_type, week_status
  from public.st_workouts
  where id = p_workout_id
  returning id into v_new;

  for v_ex in
    select * from public.st_exercises where workout_id = p_workout_id order by sort_order, created_at
  loop
    v_group := null;
    if v_ex.superset_group_id is not null then
      if v_map ? v_ex.superset_group_id::text then
        v_group := (v_map ->> v_ex.superset_group_id::text)::uuid;
      else
        v_group := gen_random_uuid();
        v_map := v_map || jsonb_build_object(v_ex.superset_group_id::text, v_group);
      end if;
    end if;
    insert into public.st_exercises (
      workout_id, sort_order, name, muscle_group, notes, section, superset_group_id,
      catalog_exercise_id, equipment, exercise_type, superset_label, superset_order,
      program_role, measurement_type, laterality
    ) values (
      v_new, v_ex.sort_order, v_ex.name, v_ex.muscle_group, v_ex.notes, v_ex.section, v_group,
      v_ex.catalog_exercise_id, v_ex.equipment, v_ex.exercise_type, v_ex.superset_label, v_ex.superset_order,
      v_ex.program_role, v_ex.measurement_type, v_ex.laterality
    )
    returning id into v_new_ex;
    insert into public.st_planned_sets (
      exercise_id, sort_order, set_number, set_type, target_weight, target_reps, target_rpe,
      is_deleted, target_rir, rest_seconds, rep_min, rep_max
    )
    select
      v_new_ex, sort_order, set_number, set_type, target_weight, target_reps, target_rpe,
      is_deleted, target_rir, rest_seconds, rep_min, rep_max
    from public.st_planned_sets
    where exercise_id = v_ex.id;
  end loop;
  return v_new;
end;
$$;

revoke all on function public.st_clone_group_strength_workout(uuid) from public, anon, authenticated;

create or replace function public.st_pin_group_strength_history(
  p_series_id uuid,
  p_from date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_user uuid;
  v_date date;
begin
  select * into v_series from public.st_group_activity_series where id = p_series_id;
  if not found or v_series.workout_id is null then
    return;
  end if;
  for v_user, v_date in
    select distinct sl.user_id, sl.log_date
    from public.st_set_logs sl
    left join public.st_planned_sets ps on ps.id = sl.planned_set_id
    left join public.st_exercises e on e.id = coalesce(ps.exercise_id, sl.exercise_id)
    where e.workout_id = v_series.workout_id
      and (
        coalesce(sl.completed, false)
        or coalesce(length(trim(sl.actual_weight)), 0) > 0
        or coalesce(length(trim(sl.actual_reps)), 0) > 0
      )
      and (p_from is null or sl.log_date >= p_from)
  loop
    if exists (
      select 1 from public.st_group_activity_occurrences o
      where o.series_id = p_series_id
        and o.user_id = v_user
        and o.occurrence_date = v_date
    ) then
      continue;
    end if;
    if public.st_group_activity_slot_open(v_series, v_date)
      and exists (
        select 1 from public.st_group_activity_recipients r
        where r.series_id = p_series_id and r.user_id = v_user
      )
      and (p_from is null or v_date >= p_from)
    then
      perform public.st_group_activity_ensure_occurrence(p_series_id, v_user, v_date);
    end if;
  end loop;

  update public.st_group_activity_occurrences o
  set workout_id = v_series.workout_id
  where o.series_id = p_series_id
    and o.workout_id is null
    and (p_from is null or o.original_date >= p_from)
    and (
      o.completed
      or public.st_group_strength_date_has_performance(v_series.workout_id, o.user_id, o.occurrence_date)
    );
end;
$$;

revoke all on function public.st_pin_group_strength_history(uuid, date) from public, anon, authenticated;

create or replace function public.st_save_group_strength_workout(
  p_team_id uuid,
  p_title text,
  p_occurrence_date date,
  p_recipient_user_ids uuid[],
  p_request_key text,
  p_notes text default null,
  p_required boolean default false,
  p_recurrence text default 'none',
  p_recurrence_weekdays smallint[] default '{}',
  p_recurrence_until date default null,
  p_exercises jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program uuid;
  v_workout uuid;
  v_exercise jsonb;
  v_set jsonb;
  v_exercise_id uuid;
  v_group uuid;
  v_groups jsonb := '{}'::jsonb;
  v_key text;
  v_sort int := 0;
  v_set_sort int;
  v_saved jsonb;
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from public.st_team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;
  select coalesce(array_agg(distinct uid), '{}')
    into v_ids
  from unnest(coalesce(p_recipient_user_ids, '{}'::uuid[])) as uid
  where uid is not null;
  if cardinality(v_ids) = 0 then
    v_ids := array[auth.uid()];
  end if;
  if v_ids <> array[auth.uid()] and not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if coalesce(p_required, false) and not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Only a manager can mark an extra required';
  end if;
  if jsonb_typeof(coalesce(p_exercises, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_exercises, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one exercise';
  end if;

  v_program := public.st_ensure_group_strength_shelf(p_team_id);
  insert into public.st_workouts (
    id, program_id, week, day_order, day_label, workout_type, week_status
  ) values (
    gen_random_uuid(), v_program, 0, 0, coalesce(nullif(btrim(p_title), ''), 'Workout'), 'strength', 'template'
  )
  returning id into v_workout;

  for v_exercise in select value from jsonb_array_elements(p_exercises)
  loop
    if nullif(btrim(coalesce(v_exercise ->> 'name', '')), '') is null then
      raise exception 'Name each exercise';
    end if;
    v_key := nullif(btrim(coalesce(v_exercise ->> 'superset_key', '')), '');
    v_group := null;
    if v_key is not null then
      if v_groups ? v_key then
        v_group := (v_groups ->> v_key)::uuid;
      else
        v_group := gen_random_uuid();
        v_groups := v_groups || jsonb_build_object(v_key, v_group);
      end if;
    end if;
    insert into public.st_exercises (
      workout_id, sort_order, name, muscle_group, notes, section, superset_group_id,
      catalog_exercise_id, equipment, exercise_type
    ) values (
      v_workout,
      coalesce((v_exercise ->> 'sort_order')::int, v_sort),
      btrim(v_exercise ->> 'name'),
      nullif(btrim(coalesce(v_exercise ->> 'muscle_group', '')), ''),
      nullif(btrim(coalesce(v_exercise ->> 'notes', '')), ''),
      coalesce(nullif(btrim(coalesce(v_exercise ->> 'section', '')), ''), 'strength'),
      v_group,
      nullif(v_exercise ->> 'catalog_exercise_id', '')::uuid,
      nullif(btrim(coalesce(v_exercise ->> 'equipment', '')), ''),
      coalesce(nullif(btrim(coalesce(v_exercise ->> 'exercise_type', '')), ''), 'strength')
    )
    returning id into v_exercise_id;
    v_sort := v_sort + 1;
    v_set_sort := 0;
    for v_set in select value from jsonb_array_elements(coalesce(v_exercise -> 'sets', '[]'::jsonb))
    loop
      if coalesce(v_set ->> 'set_type', 'working') not in ('warmup', 'working', 'backoff', 'dropset', 'amrap') then
        raise exception 'Choose a set type';
      end if;
      insert into public.st_planned_sets (
        exercise_id, sort_order, set_number, set_type, target_weight, target_reps,
        target_rir, rest_seconds, is_deleted
      ) values (
        v_exercise_id,
        coalesce((v_set ->> 'sort_order')::int, v_set_sort),
        coalesce((v_set ->> 'set_number')::int, v_set_sort + 1),
        coalesce(v_set ->> 'set_type', 'working'),
        nullif(btrim(coalesce(v_set ->> 'target_weight', '')), ''),
        nullif(btrim(coalesce(v_set ->> 'target_reps', '')), ''),
        nullif(v_set ->> 'target_rir', '')::smallint,
        nullif(v_set ->> 'rest_seconds', '')::int,
        false
      );
      v_set_sort := v_set_sort + 1;
    end loop;
  end loop;

  v_saved := public.st_save_group_activity(
    p_team_id,
    'strength',
    p_title,
    p_occurrence_date,
    p_recipient_user_ids,
    p_request_key,
    null,
    p_notes,
    '{}'::jsonb,
    v_workout,
    v_program,
    coalesce(p_required, false),
    coalesce(p_recurrence, 'none'),
    coalesce(p_recurrence_weekdays, '{}'),
    p_recurrence_until
  );
  return v_saved || jsonb_build_object('workout_id', v_workout, 'program_id', v_program);
end;
$$;

revoke all on function public.st_save_group_strength_workout(uuid, text, date, uuid[], text, text, boolean, text, smallint[], date, jsonb) from public, anon;
grant execute on function public.st_save_group_strength_workout(uuid, text, date, uuid[], text, text, boolean, text, smallint[], date, jsonb) to authenticated;

create or replace function public.st_edit_group_strength_occurrence(
  p_series_id uuid,
  p_user_id uuid,
  p_original_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_id uuid;
  v_row public.st_group_activity_occurrences;
  v_workout uuid;
  v_clone uuid;
begin
  v_series := public.st_group_activity_require_change(p_series_id);
  if v_series.activity_type <> 'strength' or v_series.workout_id is null then
    raise exception 'This activity is not a group strength workout';
  end if;
  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  v_id := public.st_group_activity_ensure_occurrence(p_series_id, p_user_id, p_original_date);
  select * into v_row from public.st_group_activity_occurrences where id = v_id;
  if v_row.completed then
    raise exception 'Completed group activity history cannot be changed';
  end if;
  v_workout := public.st_group_activity_effective_workout(v_row.workout_id, v_series.workout_id);
  if v_row.workout_id is not null and not public.st_group_strength_workout_has_performance(v_row.workout_id) then
    return jsonb_build_object('workout_id', v_row.workout_id, 'cloned', false);
  end if;
  if not public.st_group_strength_workout_has_performance(v_workout) then
    return jsonb_build_object('workout_id', v_workout, 'cloned', false);
  end if;
  v_clone := public.st_clone_group_strength_workout(v_series.workout_id);
  update public.st_group_activity_occurrences
  set workout_id = v_clone
  where id = v_id;
  return jsonb_build_object('workout_id', v_clone, 'cloned', true);
end;
$$;

revoke all on function public.st_edit_group_strength_occurrence(uuid, uuid, date) from public, anon;
grant execute on function public.st_edit_group_strength_occurrence(uuid, uuid, date) to authenticated;

create or replace function public.st_edit_group_strength_future(
  p_series_id uuid,
  p_original_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_split jsonb;
  v_clone uuid;
  v_new uuid;
begin
  v_series := public.st_group_activity_require_change(p_series_id);
  if v_series.activity_type <> 'strength' or v_series.workout_id is null then
    raise exception 'This activity is not a group strength workout';
  end if;
  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  perform public.st_pin_group_strength_history(p_series_id, p_original_date);
  v_split := public.st_edit_group_activity_future(
    p_series_id,
    p_original_date,
    v_series.activity_type,
    v_series.title,
    v_series.duration_minutes,
    v_series.notes,
    v_series.details,
    v_series.recurrence_weekdays,
    v_series.recurrence_until
  );
  v_new := (v_split ->> 'new_series_id')::uuid;
  v_clone := public.st_clone_group_strength_workout(v_series.workout_id);
  update public.st_group_activity_series
  set workout_id = v_clone
  where id = v_new;
  return v_split || jsonb_build_object('workout_id', v_clone);
end;
$$;

revoke all on function public.st_edit_group_strength_future(uuid, date) from public, anon;
grant execute on function public.st_edit_group_strength_future(uuid, date) to authenticated;

create or replace function public.st_edit_group_strength_series(p_series_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_clone uuid;
begin
  v_series := public.st_group_activity_require_change(p_series_id);
  if v_series.activity_type <> 'strength' or v_series.workout_id is null then
    raise exception 'This activity is not a group strength workout';
  end if;
  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  if not public.st_group_strength_workout_has_performance(v_series.workout_id) then
    return jsonb_build_object('series_id', p_series_id, 'workout_id', v_series.workout_id, 'cloned', false);
  end if;
  perform public.st_pin_group_strength_history(p_series_id, null);
  v_clone := public.st_clone_group_strength_workout(v_series.workout_id);
  update public.st_group_activity_series
  set workout_id = v_clone
  where id = p_series_id;
  return jsonb_build_object('series_id', p_series_id, 'workout_id', v_clone, 'cloned', true);
end;
$$;

revoke all on function public.st_edit_group_strength_series(uuid) from public, anon;
grant execute on function public.st_edit_group_strength_series(uuid) to authenticated;

create or replace function public.st_remove_group_activity_recipient(
  p_series_id uuid,
  p_user_id uuid,
  p_removed_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
begin
  v_series := public.st_group_activity_require_change(p_series_id);
  if p_removed_on is null then
    raise exception 'Choose the first date to stop';
  end if;
  update public.st_group_activity_recipients
  set removed_on = p_removed_on
  where series_id = p_series_id
    and user_id = p_user_id
    and (removed_on is null or removed_on > p_removed_on);
  if not found then
    raise exception 'Member not found';
  end if;
end;
$$;

revoke all on function public.st_remove_group_activity_recipient(uuid, uuid, date) from public, anon;
grant execute on function public.st_remove_group_activity_recipient(uuid, uuid, date) to authenticated;

commit;


-- ===== 20261022_071_group_strength_logging.sql =====

-- BIQ-0263 Phase 3C. Apply in the Supabase SQL Editor after 070.
-- Do not edit or reapply migrations 068, 069, or 070.
-- One transaction. It does not insert expectations or rewrite logged planned sets.

begin;

alter table public.st_workout_sessions
  add column if not exists user_id uuid,
  add column if not exists workout_id uuid,
  add column if not exists log_date date,
  add column if not exists status text,
  add column if not exists completed_at timestamptz,
  add column if not exists expectation_id uuid,
  add column if not exists source_key text,
  add column if not exists scheduled_date date;

create table if not exists public.st_exercise_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  exercise_id uuid not null,
  workout_session_id uuid,
  log_date date not null,
  status text not null default 'not_started',
  skip_reason text,
  attempt_outcome text,
  created_at timestamptz not null default now()
);

alter table public.st_training_expectations
  add column if not exists excused boolean not null default false;

-- A live extra occupies a date. Skipped, moved-away, ended, and removed dates do not.
create or replace function public.st_group_extra_occupies_date(
  p_user_id uuid,
  p_workout_id uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and p_workout_id is not null and p_date is not null and (
    exists (
      select 1
      from public.st_group_activity_occurrences o
      join public.st_group_activity_series s on s.id = o.series_id
      join public.st_group_activity_recipients r
        on r.series_id = s.id and r.user_id = o.user_id
      where o.user_id = p_user_id
        and o.occurrence_date = p_date
        and coalesce(o.status, 'scheduled') <> 'skipped'
        and public.st_group_activity_effective_workout(o.workout_id, s.workout_id) = p_workout_id
        and (r.removed_on is null or p_date < r.removed_on)
        and (s.ended_on is null or p_date <= s.ended_on)
    )
    or exists (
      select 1
      from public.st_group_activity_series s
      join public.st_group_activity_recipients r
        on r.series_id = s.id and r.user_id = p_user_id
      where s.workout_id = p_workout_id
        and s.recurrence = 'weekly'
        and p_date >= s.start_date
        and (s.ended_on is null or p_date <= s.ended_on)
        and (s.recurrence_until is null or p_date <= s.recurrence_until)
        and (r.removed_on is null or p_date < r.removed_on)
        and public.st_group_weekday_index(p_date) = any (s.recurrence_weekdays)
        and not exists (
          select 1
          from public.st_group_activity_occurrences o
          where o.series_id = s.id
            and o.user_id = p_user_id
            and o.original_date = p_date
        )
    )
  );
$$;

revoke all on function public.st_group_extra_occupies_date(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.st_program_expectation_occupies_date(
  p_user_id uuid,
  p_workout_id uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and p_workout_id is not null and p_date is not null and exists (
    select 1
    from public.st_training_expectations e
    where e.user_id = p_user_id
      and e.workout_id = p_workout_id
      and e.scheduled_date = p_date
      and coalesce(e.excused, false) = false
  );
$$;

revoke all on function public.st_program_expectation_occupies_date(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.st_group_series_conflicts_with_program(p_series_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_group_activity_series s
    join public.st_group_activity_recipients r on r.series_id = s.id
    join public.st_training_expectations e
      on e.user_id = r.user_id
     and e.workout_id = s.workout_id
     and coalesce(e.excused, false) = false
    where s.id = p_series_id
      and s.workout_id is not null
      and e.scheduled_date >= s.start_date
      and (s.ended_on is null or e.scheduled_date <= s.ended_on)
      and (s.recurrence_until is null or e.scheduled_date <= s.recurrence_until)
      and (r.removed_on is null or e.scheduled_date < r.removed_on)
      and (
        (s.recurrence <> 'weekly' and e.scheduled_date = s.start_date)
        or (
          s.recurrence = 'weekly'
          and public.st_group_weekday_index(e.scheduled_date) = any (s.recurrence_weekdays)
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
  );
$$;

revoke all on function public.st_group_series_conflicts_with_program(uuid) from public, anon, authenticated;

create or replace function public.st_reject_group_program_extra_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_workout uuid;
begin
  if tg_table_name = 'st_training_expectations' then
    if coalesce(new.excused, false) or new.user_id is null or new.workout_id is null or new.scheduled_date is null then
      return new;
    end if;
    if public.st_group_extra_occupies_date(new.user_id, new.workout_id, new.scheduled_date) then
      raise exception 'That workout is already on this date as a group activity';
    end if;
    return new;
  end if;

  if tg_table_name = 'st_group_activity_recipients' then
    if public.st_group_series_conflicts_with_program(new.series_id) then
      raise exception 'That workout is already on the group program for this date';
    end if;
    return new;
  end if;

  if tg_table_name = 'st_group_activity_series' then
    if public.st_group_series_conflicts_with_program(new.id) then
      raise exception 'That workout is already on the group program for this date';
    end if;
    return new;
  end if;

  if coalesce(new.status, 'scheduled') = 'skipped' then
    return new;
  end if;
  select * into v_series from public.st_group_activity_series where id = new.series_id;
  if not found then
    return new;
  end if;
  if v_series.ended_on is not null and new.occurrence_date > v_series.ended_on then
    return new;
  end if;
  if exists (
    select 1
    from public.st_group_activity_recipients r
    where r.series_id = new.series_id
      and r.user_id = new.user_id
      and r.removed_on is not null
      and new.occurrence_date >= r.removed_on
  ) then
    return new;
  end if;
  v_workout := public.st_group_activity_effective_workout(new.workout_id, v_series.workout_id);
  if v_workout is not null and public.st_program_expectation_occupies_date(new.user_id, v_workout, new.occurrence_date) then
    raise exception 'That workout is already on the group program for this date';
  end if;
  return new;
end;
$$;

revoke all on function public.st_reject_group_program_extra_overlap() from public, anon;
grant execute on function public.st_reject_group_program_extra_overlap() to authenticated;

drop trigger if exists st_training_expectations_reject_group_extra on public.st_training_expectations;
create trigger st_training_expectations_reject_group_extra
  before insert or update of user_id, workout_id, scheduled_date, excused
  on public.st_training_expectations
  for each row execute function public.st_reject_group_program_extra_overlap();

drop trigger if exists st_group_activity_recipients_reject_program on public.st_group_activity_recipients;
create trigger st_group_activity_recipients_reject_program
  after insert on public.st_group_activity_recipients
  for each row execute function public.st_reject_group_program_extra_overlap();

drop trigger if exists st_group_activity_series_reject_program on public.st_group_activity_series;
create trigger st_group_activity_series_reject_program
  after update of workout_id, start_date, recurrence, recurrence_weekdays, recurrence_until, ended_on
  on public.st_group_activity_series
  for each row execute function public.st_reject_group_program_extra_overlap();

drop trigger if exists st_group_activity_occurrences_reject_program on public.st_group_activity_occurrences;
create trigger st_group_activity_occurrences_reject_program
  before insert or update of occurrence_date, workout_id, status, user_id
  on public.st_group_activity_occurrences
  for each row execute function public.st_reject_group_program_extra_overlap();

create or replace function public.st_guard_workout_session_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.expectation_id is not null and coalesce(new.source_key, '') like 'group-activity:%' then
      raise exception 'This workout is already logged on the group program for this date';
    end if;
    if coalesce(old.source_key, '') like 'group-activity:%'
      and (
        new.expectation_id is not null
        or coalesce(new.source_key, '') not like 'group-activity:%'
      )
    then
      raise exception 'This workout is already logged as a group activity on this date';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.st_guard_workout_session_context() from public, anon;
grant execute on function public.st_guard_workout_session_context() to authenticated;

drop trigger if exists st_workout_sessions_guard_context on public.st_workout_sessions;
create trigger st_workout_sessions_guard_context
  before update on public.st_workout_sessions
  for each row execute function public.st_guard_workout_session_context();

create or replace function public.st_expectation_has_session(p_expectation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_training_expectations e
    join public.st_workout_sessions s
      on s.user_id = e.user_id
     and (
       s.expectation_id = e.id
       or (
         e.workout_id is not null
         and s.expectation_id is null
         and s.workout_id = e.workout_id
         and s.log_date = e.scheduled_date
         and coalesce(s.source_key, '') not like 'group-activity:%'
       )
     )
    where e.id = p_expectation_id
  );
$$;

revoke all on function public.st_expectation_has_session(uuid) from public, anon;
grant execute on function public.st_expectation_has_session(uuid) to authenticated;

create or replace function public.st_group_schedule_adherence(
  p_team_id uuid,
  p_from_date date,
  p_to_date date,
  p_local_today date
)
returns table (
  user_id uuid,
  expected_past integer,
  completed_past integer,
  partial_past integer,
  skipped_past integer,
  missed integer,
  due_today integer,
  completed_today integer,
  future integer,
  completion_rate numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_see_all boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null then
    raise exception 'Group is required';
  end if;
  if not exists (
    select 1 from public.st_team_members m
    where m.team_id = p_team_id and m.user_id = auth.uid() and m.status = 'active'
  ) and not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not authorized';
  end if;

  v_see_all := public.st_user_can_view_group_progress(p_team_id) or public.st_user_can_edit_team(p_team_id);

  return query
  with classified as (
    select
      e.user_id as member_id,
      e.scheduled_date,
      e.excused,
      sess.status as session_status,
      rec.status as recipient_status
    from public.st_training_expectations e
    left join lateral (
      select s.status
      from public.st_workout_sessions s
      where s.user_id = e.user_id
        and (
          s.expectation_id = e.id
          or (
            s.expectation_id is null
            and e.workout_id is not null
            and s.workout_id = e.workout_id
            and s.log_date = e.scheduled_date
            and coalesce(s.source_key, '') not like 'group-activity:%'
            and not exists (
              select 1
              from public.st_training_expectations other
              where other.user_id = e.user_id
                and other.workout_id = e.workout_id
                and other.scheduled_date = e.scheduled_date
                and other.id <> e.id
            )
          )
        )
      order by case when s.expectation_id = e.id then 0 else 1 end, s.completed_at desc nulls last
      limit 1
    ) sess on true
    left join public.st_assignment_recipients rec on rec.id = e.assignment_recipient_id
    where e.scheduled_date between p_from_date and p_to_date
      and (
        e.source_key = ('group:' || p_team_id::text)
        or (e.origin = 'assignment' and e.team_id = p_team_id)
      )
  )
  select
    tm.user_id,
    (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false))::integer,
    (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false and c.session_status = 'completed'))::integer,
    (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false and c.session_status = 'partial'))::integer,
    (count(*) filter (
      where c.scheduled_date < p_local_today and c.excused = false
        and (c.session_status = 'skipped' or (c.session_status is null and c.recipient_status = 'skipped'))
    ))::integer,
    (count(*) filter (
      where c.scheduled_date < p_local_today and c.excused = false
        and c.session_status is distinct from 'completed'
        and c.session_status is distinct from 'partial'
        and c.session_status is distinct from 'skipped'
        and coalesce(c.recipient_status, '') is distinct from 'skipped'
    ))::integer,
    (count(*) filter (
      where c.scheduled_date = p_local_today and c.excused = false and c.session_status is distinct from 'completed'
    ))::integer,
    (count(*) filter (where c.scheduled_date = p_local_today and c.excused = false and c.session_status = 'completed'))::integer,
    (count(*) filter (where c.scheduled_date > p_local_today and c.excused = false))::integer,
    case
      when (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false)) = 0 then null
      else round(
        (
          (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false and c.session_status = 'completed'))::numeric
          / (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false))::numeric
        ) * 100,
        1
      )
    end
  from public.st_team_members tm
  left join classified c on c.member_id = tm.user_id
  where tm.team_id = p_team_id
    and tm.status = 'active'
    and (v_see_all or tm.user_id = auth.uid())
  group by tm.user_id;
end;
$$;

revoke all on function public.st_group_schedule_adherence(uuid, date, date, date) from public, anon;
grant execute on function public.st_group_schedule_adherence(uuid, date, date, date) to authenticated;

create or replace function public.st_group_expectation_status(
  p_team_id uuid,
  p_from_date date,
  p_to_date date,
  p_local_today date,
  p_member_user_id uuid default null
)
returns table (
  expectation_id uuid,
  user_id uuid,
  workout_id uuid,
  scheduled_date date,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_see_all boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null or p_from_date is null or p_to_date is null or p_local_today is null then
    raise exception 'Not authorized';
  end if;
  if p_to_date < p_from_date or p_to_date - p_from_date > 83 then
    raise exception 'Date range is too large';
  end if;
  if not exists (
    select 1
    from public.st_team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) and not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not authorized';
  end if;

  v_see_all := public.st_user_can_view_group_progress(p_team_id) or public.st_user_can_edit_team(p_team_id);
  if p_member_user_id is not null and not v_see_all and p_member_user_id is distinct from auth.uid() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    e.id,
    e.user_id,
    e.workout_id,
    e.scheduled_date,
    case
      when e.excused then 'excused'
      when sess.status = 'completed' then 'completed'
      when sess.status = 'partial' then 'partial'
      when sess.status = 'skipped' or coalesce(rec.status, '') = 'skipped' then 'skipped'
      when enr.status = 'paused' and e.scheduled_date >= p_local_today then 'paused'
      when e.scheduled_date < p_local_today then 'missed'
      when e.scheduled_date = p_local_today then 'due_today'
      else 'upcoming'
    end
  from public.st_training_expectations e
  join public.st_team_members tm
    on tm.team_id = p_team_id
   and tm.user_id = e.user_id
   and tm.status = 'active'
  left join lateral (
    select s.status
    from public.st_workout_sessions s
    where s.user_id = e.user_id
      and (
        s.expectation_id = e.id
        or (
          s.expectation_id is null
          and e.workout_id is not null
          and s.workout_id = e.workout_id
          and s.log_date = e.scheduled_date
          and coalesce(s.source_key, '') not like 'group-activity:%'
          and not exists (
            select 1
            from public.st_training_expectations other
            where other.user_id = e.user_id
              and other.workout_id = e.workout_id
              and other.scheduled_date = e.scheduled_date
              and other.id <> e.id
          )
        )
      )
    order by case when s.expectation_id = e.id then 0 else 1 end, s.completed_at desc nulls last
    limit 1
  ) sess on true
  left join public.st_assignment_recipients rec on rec.id = e.assignment_recipient_id
  left join lateral (
    select en.status
    from public.st_training_enrollments en
    where en.user_id = e.user_id
      and en.team_id = p_team_id
      and en.source_kind = 'group'
      and en.source_key = 'group:' || p_team_id::text
    order by en.starts_on desc nulls last, en.id
    limit 1
  ) enr on true
  where e.scheduled_date between p_from_date and p_to_date
    and (
      e.source_key = ('group:' || p_team_id::text)
      or (e.origin = 'assignment' and e.team_id = p_team_id)
    )
    and (p_member_user_id is null or e.user_id = p_member_user_id)
    and (v_see_all or e.user_id = auth.uid());
end;
$$;

revoke all on function public.st_group_expectation_status(uuid, date, date, date, uuid) from public, anon;
grant execute on function public.st_group_expectation_status(uuid, date, date, date, uuid) to authenticated;

create or replace function public.st_user_can_log_group_strength_workout_date(
  p_workout_id uuid,
  p_log_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and p_workout_id is not null
    and p_log_date is not null
    and exists (
      select 1
      from public.st_workouts w
      join public.st_programs p on p.id = w.program_id
      join public.st_team_members tm
        on tm.team_id = p.team_id
       and tm.user_id = auth.uid()
       and tm.status = 'active'
      where w.id = p_workout_id
        and p.program_use = 'group_strength_shelf'
    )
    and public.st_group_extra_occupies_date(auth.uid(), p_workout_id, p_log_date);
$$;

revoke all on function public.st_user_can_log_group_strength_workout_date(uuid, date) from public, anon;
grant execute on function public.st_user_can_log_group_strength_workout_date(uuid, date) to authenticated;

create or replace function public.st_planned_set_on_strength_shelf(p_planned_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_planned_set_id is not null and exists (
    select 1
    from public.st_planned_sets ps
    join public.st_exercises e on e.id = ps.exercise_id
    join public.st_workouts w on w.id = e.workout_id
    join public.st_programs p on p.id = w.program_id
    where ps.id = p_planned_set_id
      and p.program_use = 'group_strength_shelf'
  );
$$;

revoke all on function public.st_planned_set_on_strength_shelf(uuid) from public, anon;
grant execute on function public.st_planned_set_on_strength_shelf(uuid) to authenticated;

create or replace function public.st_exercise_on_strength_shelf(p_exercise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_exercise_id is not null and exists (
    select 1
    from public.st_exercises e
    join public.st_workouts w on w.id = e.workout_id
    join public.st_programs p on p.id = w.program_id
    where e.id = p_exercise_id
      and p.program_use = 'group_strength_shelf'
  );
$$;

revoke all on function public.st_exercise_on_strength_shelf(uuid) from public, anon;
grant execute on function public.st_exercise_on_strength_shelf(uuid) to authenticated;

create or replace function public.st_user_can_log_group_strength_set(
  p_planned_set_id uuid,
  p_log_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_planned_sets ps
    join public.st_exercises e on e.id = ps.exercise_id
    where ps.id = p_planned_set_id
      and public.st_user_can_log_group_strength_workout_date(e.workout_id, p_log_date)
  );
$$;

revoke all on function public.st_user_can_log_group_strength_set(uuid, date) from public, anon;
grant execute on function public.st_user_can_log_group_strength_set(uuid, date) to authenticated;

alter table public.st_set_logs enable row level security;
alter table public.st_workout_sessions enable row level security;
alter table public.st_exercise_sessions enable row level security;

drop policy if exists st_set_logs_shelf_recipient_write on public.st_set_logs;
create policy st_set_logs_shelf_recipient_write
  on public.st_set_logs
  as restrictive
  for insert
  to authenticated
  with check (
    (
      planned_set_id is null
      or not public.st_planned_set_on_strength_shelf(planned_set_id)
      or (
        user_id = auth.uid()
        and public.st_user_can_log_group_strength_set(planned_set_id, log_date)
      )
    )
    and (
      exercise_id is null
      or planned_set_id is not null
      or not public.st_exercise_on_strength_shelf(exercise_id)
      or (
        user_id = auth.uid()
        and exists (
          select 1
          from public.st_exercises e
          where e.id = exercise_id
            and public.st_user_can_log_group_strength_workout_date(e.workout_id, log_date)
        )
      )
    )
  );

drop policy if exists st_set_logs_shelf_recipient_update on public.st_set_logs;
create policy st_set_logs_shelf_recipient_update
  on public.st_set_logs
  as restrictive
  for update
  to authenticated
  using (
    (
      planned_set_id is null
      or not public.st_planned_set_on_strength_shelf(planned_set_id)
      or user_id = auth.uid()
    )
    and (
      exercise_id is null
      or planned_set_id is not null
      or not public.st_exercise_on_strength_shelf(exercise_id)
      or user_id = auth.uid()
    )
  )
  with check (
    (
      planned_set_id is null
      or not public.st_planned_set_on_strength_shelf(planned_set_id)
      or (
        user_id = auth.uid()
        and public.st_user_can_log_group_strength_set(planned_set_id, log_date)
      )
    )
    and (
      exercise_id is null
      or planned_set_id is not null
      or not public.st_exercise_on_strength_shelf(exercise_id)
      or (
        user_id = auth.uid()
        and exists (
          select 1
          from public.st_exercises e
          where e.id = exercise_id
            and public.st_user_can_log_group_strength_workout_date(e.workout_id, log_date)
        )
      )
    )
  );

drop policy if exists st_workout_sessions_shelf_recipient_write on public.st_workout_sessions;
create policy st_workout_sessions_shelf_recipient_write
  on public.st_workout_sessions
  as restrictive
  for insert
  to authenticated
  with check (
    not exists (
      select 1
      from public.st_workouts w
      join public.st_programs p on p.id = w.program_id
      where w.id = workout_id
        and p.program_use = 'group_strength_shelf'
    )
    or (
      user_id = auth.uid()
      and public.st_user_can_log_group_strength_workout_date(workout_id, log_date)
    )
  );

drop policy if exists st_workout_sessions_shelf_recipient_update on public.st_workout_sessions;
create policy st_workout_sessions_shelf_recipient_update
  on public.st_workout_sessions
  as restrictive
  for update
  to authenticated
  using (
    not exists (
      select 1
      from public.st_workouts w
      join public.st_programs p on p.id = w.program_id
      where w.id = workout_id
        and p.program_use = 'group_strength_shelf'
    )
    or user_id = auth.uid()
  )
  with check (
    not exists (
      select 1
      from public.st_workouts w
      join public.st_programs p on p.id = w.program_id
      where w.id = workout_id
        and p.program_use = 'group_strength_shelf'
    )
    or (
      user_id = auth.uid()
      and public.st_user_can_log_group_strength_workout_date(workout_id, log_date)
    )
  );

drop policy if exists st_exercise_sessions_shelf_recipient_write on public.st_exercise_sessions;
create policy st_exercise_sessions_shelf_recipient_write
  on public.st_exercise_sessions
  as restrictive
  for insert
  to authenticated
  with check (
    not public.st_exercise_on_strength_shelf(exercise_id)
    or (
      user_id = auth.uid()
      and exists (
        select 1
        from public.st_exercises e
        where e.id = exercise_id
          and public.st_user_can_log_group_strength_workout_date(e.workout_id, log_date)
      )
    )
  );

drop policy if exists st_exercise_sessions_shelf_recipient_update on public.st_exercise_sessions;
create policy st_exercise_sessions_shelf_recipient_update
  on public.st_exercise_sessions
  as restrictive
  for update
  to authenticated
  using (
    not public.st_exercise_on_strength_shelf(exercise_id)
    or user_id = auth.uid()
  )
  with check (
    not public.st_exercise_on_strength_shelf(exercise_id)
    or (
      user_id = auth.uid()
      and exists (
        select 1
        from public.st_exercises e
        where e.id = exercise_id
          and public.st_user_can_log_group_strength_workout_date(e.workout_id, log_date)
      )
    )
  );

-- Pin every recorded performance, including duration and distance, before a series moves.
create or replace function public.st_pin_group_strength_history(
  p_series_id uuid,
  p_from date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_user uuid;
  v_date date;
begin
  select * into v_series from public.st_group_activity_series where id = p_series_id;
  if not found or v_series.workout_id is null then
    return;
  end if;
  for v_user, v_date in
    select distinct sl.user_id, sl.log_date
    from public.st_set_logs sl
    left join public.st_planned_sets ps on ps.id = sl.planned_set_id
    left join public.st_exercises e on e.id = coalesce(ps.exercise_id, sl.exercise_id)
    where e.workout_id = v_series.workout_id
      and public.st_group_strength_date_has_performance(v_series.workout_id, sl.user_id, sl.log_date)
      and (p_from is null or sl.log_date >= p_from)
  loop
    if exists (
      select 1 from public.st_group_activity_occurrences o
      where o.series_id = p_series_id
        and o.user_id = v_user
        and o.occurrence_date = v_date
    ) then
      continue;
    end if;
    if public.st_group_activity_slot_open(v_series, v_date)
      and exists (
        select 1 from public.st_group_activity_recipients r
        where r.series_id = p_series_id and r.user_id = v_user
      )
      and (p_from is null or v_date >= p_from)
    then
      perform public.st_group_activity_ensure_occurrence(p_series_id, v_user, v_date);
    end if;
  end loop;

  update public.st_group_activity_occurrences o
  set workout_id = v_series.workout_id
  where o.series_id = p_series_id
    and o.workout_id is null
    and (p_from is null or o.original_date >= p_from)
    and (
      o.completed
      or public.st_group_strength_date_has_performance(v_series.workout_id, o.user_id, o.occurrence_date)
    );
end;
$$;

revoke all on function public.st_pin_group_strength_history(uuid, date) from public, anon, authenticated;

-- A partial log keeps this occurrence on the workout that owns those planned sets.
create or replace function public.st_edit_group_strength_occurrence(
  p_series_id uuid,
  p_user_id uuid,
  p_original_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_id uuid;
  v_row public.st_group_activity_occurrences;
  v_workout uuid;
  v_clone uuid;
begin
  v_series := public.st_group_activity_require_change(p_series_id);
  if v_series.activity_type <> 'strength' or v_series.workout_id is null then
    raise exception 'This activity is not a group strength workout';
  end if;
  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  v_id := public.st_group_activity_ensure_occurrence(p_series_id, p_user_id, p_original_date);
  select * into v_row from public.st_group_activity_occurrences where id = v_id;
  if v_row.completed then
    raise exception 'Completed group activity history cannot be changed';
  end if;
  v_workout := public.st_group_activity_effective_workout(v_row.workout_id, v_series.workout_id);
  if public.st_group_strength_date_has_performance(v_workout, p_user_id, v_row.occurrence_date) then
    if v_row.workout_id is null then
      update public.st_group_activity_occurrences
      set workout_id = v_workout
      where id = v_id;
    end if;
    return jsonb_build_object(
      'workout_id', coalesce(v_row.workout_id, v_workout),
      'cloned', false
    );
  end if;
  if v_row.workout_id is not null and not public.st_group_strength_workout_has_performance(v_row.workout_id) then
    return jsonb_build_object('workout_id', v_row.workout_id, 'cloned', false);
  end if;
  if not public.st_group_strength_workout_has_performance(v_workout) then
    return jsonb_build_object('workout_id', v_workout, 'cloned', false);
  end if;
  v_clone := public.st_clone_group_strength_workout(v_series.workout_id);
  update public.st_group_activity_occurrences
  set workout_id = v_clone
  where id = v_id;
  return jsonb_build_object('workout_id', v_clone, 'cloned', true);
end;
$$;

revoke all on function public.st_edit_group_strength_occurrence(uuid, uuid, date) from public, anon;
grant execute on function public.st_edit_group_strength_occurrence(uuid, uuid, date) to authenticated;

create or replace function public.st_complete_group_activity_occurrence(
  p_series_id uuid,
  p_user_id uuid,
  p_original_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_id uuid;
  v_row public.st_group_activity_occurrences;
  v_removed date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_series from public.st_group_activity_series where id = p_series_id;
  if not found then
    raise exception 'Activity not found';
  end if;
  if not exists (
    select 1 from public.st_team_members tm
    where tm.team_id = v_series.team_id and tm.user_id = auth.uid() and tm.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;
  if p_user_id is distinct from auth.uid() and not public.st_user_can_assign_in_group(v_series.team_id) then
    raise exception 'Not authorized';
  end if;
  if not exists (
    select 1 from public.st_group_activity_recipients r
    where r.series_id = p_series_id and r.user_id = p_user_id
  ) then
    raise exception 'Member not found';
  end if;

  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  perform pg_advisory_xact_lock(hashtext(p_series_id::text || ':' || p_user_id::text || ':' || p_original_date::text)::bigint);
  v_id := public.st_group_activity_ensure_occurrence(p_series_id, p_user_id, p_original_date);
  select * into v_row from public.st_group_activity_occurrences where id = v_id;
  if v_row.completed then
    return jsonb_build_object(
      'occurrence_id', v_row.id,
      'series_id', v_row.series_id,
      'user_id', v_row.user_id,
      'original_date', v_row.original_date,
      'occurrence_date', v_row.occurrence_date,
      'activity_type', v_row.activity_type,
      'title', v_row.title,
      'duration_minutes', v_row.duration_minutes,
      'notes', v_row.notes,
      'details', v_row.details,
      'already_completed', true
    );
  end if;

  select r.removed_on into v_removed
  from public.st_group_activity_recipients r
  where r.series_id = p_series_id and r.user_id = p_user_id;
  if v_removed is not null and v_row.occurrence_date >= v_removed then
    raise exception 'That member is no longer assigned on this date';
  end if;
  if v_series.ended_on is not null and v_row.occurrence_date > v_series.ended_on then
    raise exception 'That date is not on this series';
  end if;

  update public.st_group_activity_occurrences o
  set
    completed = true,
    snapshotted = true,
    status = 'scheduled',
    activity_type = coalesce(o.activity_type, s.activity_type),
    title = coalesce(o.title, s.title),
    duration_minutes = coalesce(o.duration_minutes, s.duration_minutes),
    notes = coalesce(o.notes, s.notes),
    details = coalesce(o.details, s.details)
  from public.st_group_activity_series s
  where o.id = v_id
    and s.id = o.series_id
    and o.completed = false
  returning o.* into v_row;
  if v_row.id is null then
    raise exception 'Activity not found';
  end if;

  return jsonb_build_object(
    'occurrence_id', v_row.id,
    'series_id', v_row.series_id,
    'user_id', v_row.user_id,
    'original_date', v_row.original_date,
    'occurrence_date', v_row.occurrence_date,
    'activity_type', v_row.activity_type,
    'title', v_row.title,
    'duration_minutes', v_row.duration_minutes,
    'notes', v_row.notes,
    'details', v_row.details,
    'already_completed', false
  );
end;
$$;

revoke all on function public.st_complete_group_activity_occurrence(uuid, uuid, date) from public, anon;
grant execute on function public.st_complete_group_activity_occurrence(uuid, uuid, date) to authenticated;

commit;


-- ===== 20261024_072_group_member_schedule_batch.sql =====

-- BIQ-0264 Phase 2B.2 batch training days, pause, and resume.
-- Apply manually after 20261022_071_group_strength_logging.sql. Do not run this from the app.
-- Not applied to hosted Supabase by this change. Do not edit migrations 068, 069, 070, or 071.
-- One transaction. One invalid member rolls back the whole batch. Personal enrollments and other groups are not updated.
--
-- Timezone: st_teams.timezone is added by 20261024_073_group_timezone.sql. Apply that
-- migration before calling this function. Existing groups stay null. This batch requires
-- a configured group timezone and does not read the browser date. p_effective_on and
-- p_local_today must both equal (timezone(st_teams.timezone, now()))::date. The function
-- then sets the transaction time zone to that group zone so the single-member functions
-- see the same calendar date. A null timezone raises. Direct single-member calls are
-- unchanged and still accept a null group timezone. A stored request key still replays
-- before the timezone check.
--
-- Lock order: advisory lock on team + request key (same hashtext pattern as st_assign_group_programs),
-- then submitted st_team_members FOR UPDATE in user_id order, then this group's enrollments
-- FOR UPDATE in user_id order, then the existing single-member functions.
-- 20261024_074_schedule_lock_order.sql makes assignment, refresh, withdraw, and the
-- single-member functions take the enrollment lock before expectation rows, and makes
-- assignment walk members in user_id order. This function already locks members and
-- enrollments in that order before it calls them.
-- Already paused and already resumed members are counted in the result and are not sent
-- to the single-member function. The 062 trigger returns without sync when the flag does
-- not change. They stay in the submitted set.
-- Two calls of this function with different keys block on the first shared member row
-- because both lock team members in user_id order.
-- Group-activity overlap stays with the 071 before-insert trigger. Predicting the rows
-- st_refresh_enrollment_expectations will insert would copy segments, custom weekday
-- mapping, a frozen logged today, and the deferred override trigger. A wrong prediction
-- would reject a valid batch. If that trigger raises, this transaction rolls back and
-- does not delete activity rows.

begin;

create table if not exists public.st_group_schedule_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  request_key text not null,
  payload jsonb not null,
  requested_by uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint st_group_schedule_requests_team_key unique (team_id, request_key)
);

comment on table public.st_group_schedule_requests is
  'Idempotency keys for batch schedule changes. A matching payload returns the first result. A different payload for the same key raises. Clients cannot read or write this table.';

comment on column public.st_group_schedule_requests.payload is
  'Canonical jsonb: action, member ids sorted, mode, normalized weekdays, effective date, local today. program_days stores an empty weekday list. pause and resume store a null mode.';

comment on column public.st_group_schedule_requests.requested_by is
  'auth.uid() of the caller. No foreign key, matching st_group_assignment_requests.requested_by.';

alter table public.st_group_schedule_requests enable row level security;
revoke all on table public.st_group_schedule_requests from public, anon, authenticated;

create or replace function public.st_apply_group_member_schedules(
  p_team_id uuid,
  p_action text,
  p_member_user_ids uuid[],
  p_mode text,
  p_weekdays text[],
  p_effective_on date,
  p_local_today date,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_ids uuid[];
  v_mode text;
  v_weekdays text[];
  v_payload jsonb;
  v_stored_payload jsonb;
  v_prior jsonb;
  v_today date;
  v_zone text;
  v_apply uuid[] := '{}'::uuid[];
  v_uid uuid;
  v_member public.st_team_members%rowtype;
  v_enroll public.st_training_enrollments%rowtype;
  v_unchanged integer := 0;
  v_result jsonb;
  v_error text;
  v_future uuid;
  v_count integer;
  v_distinct integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;

  v_key := nullif(btrim(coalesce(p_request_key, '')), '');
  if v_key is null then
    raise exception 'Request key is required';
  end if;
  if p_action not in ('edit_days', 'pause', 'resume') then
    raise exception 'Invalid schedule action';
  end if;
  if p_member_user_ids is null or cardinality(p_member_user_ids) = 0 then
    raise exception 'Select at least one member';
  end if;
  if cardinality(p_member_user_ids) > 500 then
    raise exception 'Select at most 500 members';
  end if;
  if exists (
    select 1
    from unnest(p_member_user_ids) as t(member_id)
    where t.member_id is null
  ) then
    raise exception 'Member not found';
  end if;

  select count(*)::integer, count(distinct t.member_id)::integer
    into v_count, v_distinct
  from unnest(p_member_user_ids) as t(member_id);
  if v_count <> v_distinct then
    raise exception 'Duplicate member';
  end if;

  select coalesce(array_agg(t.member_id order by t.member_id), '{}'::uuid[])
    into v_ids
  from unnest(p_member_user_ids) as t(member_id);

  if p_action = 'edit_days' then
    if p_mode is null or p_mode not in ('program_days', 'custom_weekdays') then
      raise exception 'Invalid schedule';
    end if;
    v_mode := p_mode;
    if v_mode = 'custom_weekdays' then
      v_weekdays := public.st_normalize_weekday_list(p_weekdays);
    else
      v_weekdays := '{}'::text[];
    end if;
  else
    v_mode := null;
    v_weekdays := '{}'::text[];
  end if;

  v_payload := jsonb_build_object(
    'action', p_action,
    'member_user_ids', to_jsonb(v_ids),
    'mode', v_mode,
    'weekdays', to_jsonb(v_weekdays),
    'effective_on', p_effective_on,
    'local_today', p_local_today
  );

  perform pg_advisory_xact_lock(hashtext(p_team_id::text || ':' || v_key)::bigint);

  select r.payload, r.result
    into v_stored_payload, v_prior
  from public.st_group_schedule_requests r
  where r.team_id = p_team_id
    and r.request_key = v_key;
  if found then
    if v_stored_payload = v_payload then
      return v_prior || jsonb_build_object('replay', true);
    end if;
    raise exception 'Request key was already used with a different schedule change';
  end if;

  select t.timezone
    into v_zone
  from public.st_teams t
  where t.id = p_team_id;
  if not found then
    raise exception 'Not authorized';
  end if;
  if v_zone is null or btrim(v_zone) = '' then
    raise exception 'Set a group timezone before changing schedules';
  end if;
  if v_zone <> 'UTC' and (
    position('/' in v_zone) = 0
    or not exists (select 1 from pg_timezone_names n where n.name = v_zone)
  ) then
    raise exception 'Invalid group timezone';
  end if;
  v_today := (timezone(v_zone, now()))::date;
  if p_effective_on is distinct from v_today or p_local_today is distinct from v_today then
    raise exception 'Schedule changes apply on the group date';
  end if;
  -- One group date for the rest of this transaction, including the single-member calls.
  perform set_config('TimeZone', v_zone, true);

  foreach v_uid in array v_ids loop
    perform 1
    from public.st_team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = v_uid
    for update;
  end loop;

  foreach v_uid in array v_ids loop
    perform 1
    from public.st_training_enrollments e
    where e.team_id = p_team_id
      and e.user_id = v_uid
      and e.source_kind = 'group'
      and e.source_key = 'group:' || p_team_id::text
    for update;
  end loop;

  foreach v_uid in array v_ids loop
    select * into v_member
    from public.st_team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = v_uid;
    if not found or v_member.status is distinct from 'active' then
      raise exception 'Member not found';
    end if;
    if v_member.is_active_participant is distinct from true then
      raise exception 'Member is not an active participant';
    end if;
    if coalesce(v_member.training_source, 'team') = 'personal' then
      raise exception 'Personal training cannot be changed here';
    end if;

    select * into v_enroll
    from public.st_training_enrollments e
    where e.user_id = v_uid
      and e.team_id = p_team_id
      and e.source_kind = 'group'
      and e.source_key = 'group:' || p_team_id::text
      and e.source_key <> 'personal';
    if not found or v_enroll.program_id is null then
      raise exception 'Assign a group plan before changing the schedule';
    end if;
    if v_enroll.status is distinct from 'active' then
      raise exception 'Group enrollment is not active';
    end if;
    if p_action = 'edit_days' and v_enroll.expectation_enabled is distinct from true then
      raise exception 'Turn expected training on before editing days';
    end if;
    if p_action = 'pause' and exists (
      select 1
      from public.st_training_expectations ex
      where ex.enrollment_id = v_enroll.id
        and ex.origin = 'program'
        and ex.scheduled_date > v_today
        and public.st_expectation_has_session(ex.id)
    ) then
      raise exception 'A logged workout is still scheduled after today';
    end if;
    if p_action = 'edit_days' and v_mode = 'custom_weekdays' then
      v_error := public.st_program_custom_schedule_error(v_enroll.program_id, v_weekdays);
      if v_error is not null then
        raise exception '%', v_error;
      end if;
      select s.program_id into v_future
      from public.st_training_program_segments s
      where s.enrollment_id = v_enroll.id
        and s.ends_on is null
        and s.starts_on > v_today
        and s.program_id is distinct from v_enroll.program_id
      order by s.starts_on
      limit 1;
      if v_future is not null then
        v_error := public.st_program_custom_schedule_error(v_future, v_weekdays);
        if v_error is not null then
          raise exception '%', v_error;
        end if;
      end if;
    end if;

    if p_action = 'pause' and v_enroll.expectation_enabled is distinct from true then
      v_unchanged := v_unchanged + 1;
    elsif p_action = 'resume' and v_enroll.expectation_enabled is true then
      v_unchanged := v_unchanged + 1;
    else
      v_apply := array_append(v_apply, v_uid);
    end if;
  end loop;

  foreach v_uid in array v_apply loop
    if p_action = 'edit_days' then
      perform public.st_set_member_training_schedule(
        p_team_id, v_uid, v_mode, v_weekdays, v_today, v_today
      );
    else
      perform public.st_set_member_group_expectation(
        p_team_id, v_uid, p_action = 'resume', v_today, v_today
      );
    end if;
  end loop;

  v_result := jsonb_build_object(
    'member_count', cardinality(v_ids),
    'unchanged_count', v_unchanged,
    'action', p_action,
    'request_key', v_key,
    'effective_on', v_today,
    'replay', false
  );

  insert into public.st_group_schedule_requests (
    team_id, request_key, payload, requested_by, result
  ) values (
    p_team_id, v_key, v_payload, auth.uid(), v_result
  );

  return v_result;
end;
$$;

comment on function public.st_apply_group_member_schedules(uuid, text, uuid[], text, text[], date, date, text) is
  'Batch edit days, pause, or resume for one group. Requires st_teams.timezone. Effective date must equal the server group date. Replay returns the first result and does not write again.';

revoke all on function public.st_apply_group_member_schedules(uuid, text, uuid[], text, text[], date, date, text) from public, anon;
grant execute on function public.st_apply_group_member_schedules(uuid, text, uuid[], text, text[], date, date, text) to authenticated;

commit;
