-- BIQ-0314
-- Keep the implement stored on a planned exercise when a program or assignment is copied.
-- Does not read or rewrite completed set history.

create or replace function public.st_duplicate_program(
  p_source_program_id uuid,
  p_name text default null,
  p_visibility text default null,
  p_team_id uuid default null,
  p_owner_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.st_programs%rowtype;
  v_new_program_id uuid;
  v_workout record;
  v_new_workout_id uuid;
  v_ex record;
  v_new_ex_id uuid;
  v_ps record;
  v_superset_map jsonb := '{}'::jsonb;
  v_new_group uuid;
  v_visibility text;
  v_owner uuid;
  v_team uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_source
  from public.st_programs
  where id = p_source_program_id;

  if not found then
    raise exception 'Source program not found';
  end if;

  if not public.st_user_can_read_program(p_source_program_id) then
    raise exception 'Not authorized to read source program';
  end if;

  v_visibility := coalesce(nullif(trim(p_visibility), ''), v_source.visibility);
  if v_visibility not in ('personal', 'team') then
    raise exception 'Invalid visibility';
  end if;

  v_owner := coalesce(p_owner_user_id, auth.uid());
  v_team := case when v_visibility = 'team' then coalesce(p_team_id, v_source.team_id) else null end;

  if v_visibility = 'team' then
    if v_team is null then
      raise exception 'Team id required for team programs';
    end if;
    if not public.st_user_can_edit_team(v_team) then
      raise exception 'Not authorized to create team programs';
    end if;
  elsif v_owner <> auth.uid() then
    if not (
      v_source.visibility = 'team'
      and v_source.team_id is not null
      and public.st_user_can_edit_team(v_source.team_id)
    ) then
      raise exception 'Not authorized to duplicate for another user';
    end if;
  end if;

  insert into public.st_programs (
    owner_user_id,
    team_id,
    visibility,
    name,
    weeks,
    start_date,
    generation_method,
    generation_prompt,
    program_summary,
    program_style,
    coaching_notes,
    focus_muscles,
    status,
    source_program_id,
    generation_criteria
  ) values (
    v_owner,
    v_team,
    v_visibility,
    coalesce(nullif(trim(p_name), ''), v_source.name || ' (Copy)'),
    v_source.weeks,
    v_source.start_date,
    coalesce(v_source.generation_method, 'manual'),
    v_source.generation_prompt,
    v_source.program_summary,
    v_source.program_style,
    v_source.coaching_notes,
    v_source.focus_muscles,
    coalesce(v_source.status, 'draft'),
    p_source_program_id,
    v_source.generation_criteria
  )
  returning id into v_new_program_id;

  for v_workout in
    select *
    from public.st_workouts
    where program_id = p_source_program_id
    order by week, day_order, created_at
  loop
    insert into public.st_workouts (
      program_id, week, day_order, day_label, workout_type
    ) values (
      v_new_program_id,
      v_workout.week,
      v_workout.day_order,
      v_workout.day_label,
      v_workout.workout_type
    )
    returning id into v_new_workout_id;

    v_superset_map := '{}'::jsonb;

    for v_ex in
      select *
      from public.st_exercises
      where workout_id = v_workout.id
      order by section, sort_order, created_at
    loop
      v_new_group := null;
      if v_ex.superset_group_id is not null then
        if v_superset_map ? v_ex.superset_group_id::text then
          v_new_group := (v_superset_map ->> v_ex.superset_group_id::text)::uuid;
        else
          v_new_group := gen_random_uuid();
          v_superset_map := v_superset_map || jsonb_build_object(v_ex.superset_group_id::text, v_new_group);
        end if;
      end if;

      insert into public.st_exercises (
        workout_id,
        sort_order,
        name,
        muscle_group,
        notes,
        section,
        catalog_exercise_id,
        exercise_type,
        superset_group_id,
        superset_label,
        superset_order,
        equipment
      ) values (
        v_new_workout_id,
        v_ex.sort_order,
        v_ex.name,
        v_ex.muscle_group,
        v_ex.notes,
        v_ex.section,
        v_ex.catalog_exercise_id,
        v_ex.exercise_type,
        v_new_group,
        v_ex.superset_label,
        v_ex.superset_order,
        v_ex.equipment
      )
      returning id into v_new_ex_id;

      for v_ps in
        select *
        from public.st_planned_sets
        where exercise_id = v_ex.id
          and coalesce(is_deleted, false) = false
        order by sort_order, set_number
      loop
        insert into public.st_planned_sets (
          exercise_id,
          sort_order,
          set_number,
          set_type,
          target_weight,
          target_reps,
          target_rpe
        ) values (
          v_new_ex_id,
          v_ps.sort_order,
          v_ps.set_number,
          v_ps.set_type,
          v_ps.target_weight,
          v_ps.target_reps,
          v_ps.target_rpe
        );
      end loop;
    end loop;
  end loop;

  return v_new_program_id;
end;
$$;

create or replace function public.st_copy_assignment_to_personal(p_recipient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient public.st_assignment_recipients%rowtype;
  v_wa public.st_workout_assignments%rowtype;
  v_program public.st_programs%rowtype;
  v_workout public.st_workouts%rowtype;
  v_source_workout_id uuid;
  v_new_program_id uuid;
  v_new_workout_id uuid;
  v_ex record;
  v_new_ex_id uuid;
  v_ps record;
  v_superset_map jsonb := '{}'::jsonb;
  v_new_group uuid;
  v_title text;
  v_start date;
  v_day_label text;
  v_week int;
  v_weeks int;
  v_anchor date;
  v_diff int;
  v_dow int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_recipient
  from public.st_assignment_recipients
  where id = p_recipient_id and user_id = auth.uid();

  if not found then
    raise exception 'Assignment not found';
  end if;

  if v_recipient.personal_copy_program_id is not null then
    return v_recipient.personal_copy_program_id;
  end if;

  select * into v_wa
  from public.st_workout_assignments
  where id = v_recipient.assignment_id;

  if not found then
    raise exception 'Workout assignment not found';
  end if;

  v_source_workout_id := v_wa.workout_id;

  if v_source_workout_id is null and v_wa.program_id is not null and v_wa.workout_date is not null then
    select * into v_program
    from public.st_programs
    where id = v_wa.program_id;

    if not found then
      raise exception 'Source program not found';
    end if;

    v_start := coalesce(v_program.start_date, v_program.created_at::date);
    v_weeks := greatest(coalesce(v_program.weeks, 6), 1);
    v_day_label := trim(to_char(v_wa.workout_date, 'Dy'));

    v_dow := extract(dow from v_start)::int;
    v_anchor := v_start - case when v_dow = 0 then 6 else v_dow - 1 end;
    v_diff := v_wa.workout_date - v_anchor;

    if v_diff < 0 then
      v_week := 1;
    else
      v_week := least(greatest((v_diff / 7) + 1, 1), v_weeks);
    end if;

    select w.id into v_source_workout_id
    from public.st_workouts w
    where w.program_id = v_wa.program_id
      and w.week = v_week
      and w.day_label = v_day_label
    limit 1;

    if v_source_workout_id is null then
      select w.id into v_source_workout_id
      from public.st_workouts w
      where w.program_id = v_wa.program_id
        and w.week = 1
        and w.day_label = v_day_label
      limit 1;
    end if;
  end if;

  if v_source_workout_id is null then
    raise exception 'Could not resolve workout for this assignment';
  end if;

  select * into v_workout
  from public.st_workouts
  where id = v_source_workout_id;

  if not found then
    raise exception 'Source workout not found';
  end if;

  v_title := coalesce(nullif(trim(v_wa.title), ''), v_workout.day_label || ' · ' || v_workout.workout_type);

  insert into public.st_programs (
    owner_user_id,
    team_id,
    visibility,
    name,
    weeks,
    start_date,
    generation_method
  ) values (
    auth.uid(),
    null,
    'personal',
    'Assigned: ' || v_title,
    1,
    coalesce(v_wa.scheduled_date, current_date),
    'manual'
  )
  returning id into v_new_program_id;

  insert into public.st_workouts (
    program_id,
    week,
    day_order,
    day_label,
    workout_type
  ) values (
    v_new_program_id,
    1,
    v_workout.day_order,
    v_workout.day_label,
    v_workout.workout_type
  )
  returning id into v_new_workout_id;

  for v_ex in
    select *
    from public.st_exercises
    where workout_id = v_source_workout_id
    order by section, sort_order, created_at
  loop
    v_new_group := null;
    if v_ex.superset_group_id is not null then
      if v_superset_map ? v_ex.superset_group_id::text then
        v_new_group := (v_superset_map ->> v_ex.superset_group_id::text)::uuid;
      else
        v_new_group := gen_random_uuid();
        v_superset_map := v_superset_map || jsonb_build_object(v_ex.superset_group_id::text, v_new_group);
      end if;
    end if;

    insert into public.st_exercises (
      workout_id,
      sort_order,
      name,
      muscle_group,
      notes,
      section,
      catalog_exercise_id,
      exercise_type,
      superset_group_id,
      superset_label,
      superset_order,
      equipment
    ) values (
      v_new_workout_id,
      v_ex.sort_order,
      v_ex.name,
      v_ex.muscle_group,
      v_ex.notes,
      v_ex.section,
      v_ex.catalog_exercise_id,
      v_ex.exercise_type,
      v_new_group,
      v_ex.superset_label,
      v_ex.superset_order,
      v_ex.equipment
    )
    returning id into v_new_ex_id;

    for v_ps in
      select *
      from public.st_planned_sets
      where exercise_id = v_ex.id
        and coalesce(is_deleted, false) = false
      order by sort_order, set_number
    loop
      insert into public.st_planned_sets (
        exercise_id,
        sort_order,
        set_number,
        set_type,
        target_weight,
        target_reps,
        target_rpe,
        is_deleted
      ) values (
        v_new_ex_id,
        v_ps.sort_order,
        v_ps.set_number,
        v_ps.set_type,
        v_ps.target_weight,
        v_ps.target_reps,
        v_ps.target_rpe,
        false
      );
    end loop;
  end loop;

  update public.st_assignment_recipients
  set personal_copy_program_id = v_new_program_id
  where id = p_recipient_id;

  return v_new_program_id;
end;
$$;


revoke all on function public.st_duplicate_program(uuid, text, text, uuid, uuid) from public;
grant execute on function public.st_duplicate_program(uuid, text, text, uuid, uuid) to authenticated;

revoke all on function public.st_copy_assignment_to_personal(uuid) from public, anon;
grant execute on function public.st_copy_assignment_to_personal(uuid) to authenticated;
