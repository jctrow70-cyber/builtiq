-- BIQ-0249 Program criteria snapshot
-- Additive. Existing programs stay null. Workouts and set logs are not rewritten.

alter table public.st_programs
  add column if not exists generation_criteria jsonb;

comment on column public.st_programs.generation_criteria is
  'Intake and generation outcome for this program. Null before BIQ-0249. Does not store validation codes or set logs.';

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
        superset_order
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
        v_ex.superset_order
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

revoke all on function public.st_duplicate_program(uuid, text, text, uuid, uuid) from public;
grant execute on function public.st_duplicate_program(uuid, text, text, uuid, uuid) to authenticated;
