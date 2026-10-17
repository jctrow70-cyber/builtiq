-- BIQ-0263 proposal. Do not run this in the SQL Editor during the frontend stage.
-- Not applied. Requires a separate approval.
--
-- The live st_read_group_assigned_program returns exercises without superset
-- fields and planned sets without ids. Direct program reads already include
-- those columns. This replacement adds only those fields. Authorization,
-- enrollment matching, and row filters stay the same.
--
-- Rollback is the previously applied function body in
-- supabase/migrations/20261016_066_group_assigned_program_read.sql.

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
                'superset_group_id', ex.superset_group_id,
                'superset_label', ex.superset_label,
                'superset_order', ex.superset_order,
                'st_planned_sets', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', s.id,
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
  'Owner or manager read of the program on one active group enrollment, including superset fields and planned-set ids. Does not expose other personal programs or training history.';

revoke all on function public.st_read_group_assigned_program(uuid, uuid, uuid) from public, anon;
grant execute on function public.st_read_group_assigned_program(uuid, uuid, uuid) to authenticated;
