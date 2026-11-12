-- BIQ-0316 / BIQ-0309 Phase 2 personal schedule start clamp.
-- Apply to LIVE only after explicit approval. Does not rewrite set logs or sessions.

-- BIQ-0316 / BIQ-0309 Phase 2 — personal schedule clock
-- Align expectation week numbering with program.start_date (Training UI).
-- Do not apply to LIVE until separately approved. No historical row rewrites here.

create or replace function public.st_personal_schedule_clock(
  p_starts_on date,
  p_program_start date,
  p_effective_on date
)
returns date
language sql
immutable
as $$
  select coalesce(p_program_start, p_starts_on, p_effective_on);
$$;

comment on function public.st_personal_schedule_clock(date, date, date) is
  'BIQ-0316. Personal Week 1 clock. Prefer program.start_date; never let an earlier starts_on win.';

create or replace function public.st_personal_expectation_floor(
  p_starts_on date,
  p_program_start date,
  p_effective_on date
)
returns date
language sql
immutable
as $$
  select greatest(
    coalesce(p_effective_on, p_program_start, p_starts_on),
    case
      when p_program_start is not null and p_starts_on is not null and p_starts_on < p_program_start
        then p_program_start
      else coalesce(p_starts_on, p_program_start, p_effective_on)
    end
  );
$$;

comment on function public.st_personal_expectation_floor(date, date, date) is
  'BIQ-0316. First date personal expectations may generate. Clamps starts_on up to program.start_date.';

create or replace function public.st_normalize_personal_enrollment_starts_on(
  p_starts_on date,
  p_program_start date,
  p_fallback date
)
returns date
language sql
immutable
as $$
  select case
    when p_program_start is not null and p_starts_on is not null and p_starts_on < p_program_start
      then p_program_start
    when p_starts_on is not null then p_starts_on
    when p_program_start is not null then p_program_start
    else p_fallback
  end;
$$;

comment on function public.st_normalize_personal_enrollment_starts_on(date, date, date) is
  'BIQ-0316. Default/clamp personal enrollment starts_on to program.start_date when earlier.';

revoke all on function public.st_personal_schedule_clock(date, date, date) from public, anon;
revoke all on function public.st_personal_expectation_floor(date, date, date) from public, anon;
revoke all on function public.st_normalize_personal_enrollment_starts_on(date, date, date) from public, anon;
grant execute on function public.st_personal_schedule_clock(date, date, date) to authenticated;
grant execute on function public.st_personal_expectation_floor(date, date, date) to authenticated;
grant execute on function public.st_normalize_personal_enrollment_starts_on(date, date, date) to authenticated;

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
  select * into v_enroll
  from public.st_training_enrollments
  where id = p_enrollment_id
  for update;
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
          when v_enroll.source_kind = 'personal' then public.st_personal_schedule_clock(v_enroll.starts_on, v_program.start_date, p_effective_on)
          else coalesce(v_program.start_date, v_segment.starts_on, p_effective_on)
        end
      )
    end;
    v_end := v_anchor + (v_weeks * 7 - 1);
    v_floor := v_segment.starts_on;
    if v_segment.program_id = v_enroll.program_id then
      if v_enroll.source_kind = 'personal' then
        v_floor := greatest(v_floor, public.st_personal_expectation_floor(v_enroll.starts_on, v_program.start_date, p_effective_on));
      else
        v_floor := greatest(v_floor, coalesce(v_enroll.starts_on, v_floor));
      end if;
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
        when v_enroll.source_kind = 'personal' then public.st_personal_schedule_clock(v_enroll.starts_on, v_program.start_date, p_effective_on)
        else coalesce(v_program.start_date, v_enroll.starts_on, p_effective_on)
      end
    )
  end;
  v_end := v_anchor + (v_weeks * 7 - 1);
  v_from := greatest(
    p_effective_on,
    case
      when v_enroll.source_kind = 'personal' then public.st_personal_expectation_floor(v_enroll.starts_on, v_program.start_date, p_effective_on)
      else coalesce(v_enroll.starts_on, p_effective_on)
    end
  );
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

-- New personal enrollments default starts_on to program.start_date.
-- Existing non-null starts_on is left unchanged here (repair is opt-in).
create or replace function public.st_activate_followed_program(
  p_program_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program public.st_programs%rowtype;
  v_team uuid;
  v_just_me boolean;
  v_key text;
  v_personal_starts date;
begin
  if auth.uid() is null or p_program_id is null then
    return;
  end if;
  select * into v_program from public.st_programs where id = p_program_id;
  if not found then
    return;
  end if;

  v_just_me := v_program.visibility = 'personal'
    and v_program.owner_user_id = auth.uid()
    and v_program.source_program_id is not null
    and lower(coalesce(v_program.status, '')) <> 'archived'
    and v_program.name ilike '%(just me)%';

  perform set_config('app.expectation_effective_on', p_effective_on::text, true);

  if v_just_me then
    select p.team_id into v_team
    from public.st_programs p
    where p.id = v_program.source_program_id;
    if v_team is null then
      return;
    end if;
    if not exists (
      select 1 from public.st_team_members m
      where m.team_id = v_team and m.user_id = auth.uid() and m.status = 'active'
    ) then
      return;
    end if;
    v_key := 'group:' || v_team::text;
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      auth.uid(), 'group', v_key, v_team, v_program.id, 'active', true, true, p_effective_on
    )
    on conflict (user_id, source_key) do update
      set program_id = excluded.program_id,
          status = 'active',
          schedule_visible = true,
          expectation_enabled = true,
          ended_on = null,
          starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
          updated_at = now()
      where public.st_training_enrollments.source_kind = 'group';
    return;
  end if;

  if v_program.visibility = 'team' and v_program.team_id is not null then
    if not exists (
      select 1 from public.st_team_members m
      where m.team_id = v_program.team_id and m.user_id = auth.uid() and m.status = 'active'
    ) then
      return;
    end if;
    v_key := 'group:' || v_program.team_id::text;
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      auth.uid(), 'group', v_key, v_program.team_id, v_program.id, 'active', true, true, p_effective_on
    )
    on conflict (user_id, source_key) do update
      set program_id = excluded.program_id,
          status = 'active',
          schedule_visible = true,
          expectation_enabled = true,
          ended_on = null,
          starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
          updated_at = now()
      where public.st_training_enrollments.source_kind = 'group';
    return;
  end if;

  if v_program.visibility = 'personal' and v_program.owner_user_id = auth.uid() then
    v_personal_starts := public.st_normalize_personal_enrollment_starts_on(
      null,
      v_program.start_date,
      p_effective_on
    );
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      auth.uid(), 'personal', 'personal', null, v_program.id, 'active', true, true, v_personal_starts
    )
    on conflict (user_id, source_key) do update
      set program_id = excluded.program_id,
          status = 'active',
          schedule_visible = true,
          expectation_enabled = true,
          ended_on = null,
          starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
          updated_at = now()
      where public.st_training_enrollments.source_kind = 'personal'
        and public.st_training_enrollments.source_key = 'personal';
  end if;
end;
$$;
