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
