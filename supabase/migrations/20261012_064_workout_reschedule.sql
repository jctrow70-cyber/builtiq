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
