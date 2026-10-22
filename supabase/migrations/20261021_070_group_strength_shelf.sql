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
