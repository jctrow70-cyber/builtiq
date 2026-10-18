-- BIQ-0263 proposal. Not applied.
-- Do not run this until it is approved.
--
-- Add Activity calls st_assign_group_workout, which passes a null title into
-- st_assign_workout_to_targets. The expectation trigger then stores the
-- program day_label, such as Mon, as the expectation title. The calendar date
-- stays on scheduled_date, and day_label stays the program day.
--
-- The app now shows the program workout name when that saved title is only a
-- weekday. This statement is for future saves and notification text. It does
-- not update existing assignments, expectations, sessions, or set logs.

create or replace function public.st_assignment_recipient_expectation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.st_workout_assignments%rowtype;
  v_day text;
  v_workout_name text;
  v_title text;
  v_scheduled date;
begin
  if tg_op = 'INSERT' then
    select * into v_assignment from public.st_workout_assignments where id = new.assignment_id;
    if not found or v_assignment.team_id is null then
      return new;
    end if;
    select w.day_label, nullif(trim(w.workout_type), '')
      into v_day, v_workout_name
    from public.st_workouts w
    where w.id = v_assignment.workout_id;
    v_title := coalesce(nullif(trim(v_assignment.title), ''), v_workout_name, nullif(trim(v_day), ''), 'Workout');
    v_scheduled := coalesce(v_assignment.scheduled_date, current_date);
    insert into public.st_training_expectations (
      user_id, source_key, team_id, workout_id, assignment_id, assignment_recipient_id,
      scheduled_date, title, day_label, origin, excused
    ) values (
      new.user_id,
      'group:' || v_assignment.team_id::text,
      v_assignment.team_id,
      v_assignment.workout_id,
      v_assignment.id,
      new.id,
      v_scheduled,
      v_title,
      v_day,
      'assignment',
      false
    )
    on conflict (assignment_recipient_id) where origin = 'assignment' and assignment_recipient_id is not null
    do nothing;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('cancelled', 'skipped') then
    select a.scheduled_date into v_scheduled
    from public.st_workout_assignments a
    where a.id = new.assignment_id;
    if v_scheduled is not null and v_scheduled > current_date then
      perform set_config('app.expectation_effective_on', current_date::text, true);
      delete from public.st_training_expectations e
      where e.assignment_recipient_id = new.id
        and e.origin = 'assignment'
        and e.scheduled_date > current_date;
    end if;
  end if;
  return new;
end;
$$;
