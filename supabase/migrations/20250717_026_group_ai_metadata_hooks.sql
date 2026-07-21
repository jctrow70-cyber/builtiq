-- BIQ-0043-P8: AI readiness metadata hooks on group assignments (no AI UI)

alter table public.st_workout_assignments
  add column if not exists coaching_metadata jsonb not null default '{}'::jsonb;

comment on column public.st_workout_assignments.coaching_metadata is
  'AI hooks: intent, progression_rules, readiness_modifiers, target_rpe, notes_for_coach';

alter table public.st_program_assignments
  add column if not exists coaching_metadata jsonb not null default '{}'::jsonb;

comment on column public.st_program_assignments.coaching_metadata is
  'AI hooks for assigned member programs';

alter table public.st_teams
  add column if not exists coaching_metadata jsonb not null default '{}'::jsonb;

comment on column public.st_teams.coaching_metadata is
  'Group AI context: sport, season_phase, group_goals, compliance_targets';

create or replace function public.st_assign_workout_to_targets(
  p_team_id uuid,
  p_workout_id uuid default null,
  p_program_id uuid default null,
  p_workout_date date default null,
  p_target_type text default 'individual',
  p_target_classification_id uuid default null,
  p_target_user_ids uuid[] default null,
  p_scheduled_date date default current_date,
  p_due_date date default null,
  p_title text default null,
  p_notes text default null,
  p_coaching_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_uid uuid;
  v_recipient uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not authorized';
  end if;

  if p_target_type not in ('group', 'classification', 'members', 'individual') then
    raise exception 'Invalid target type';
  end if;

  if p_workout_id is null and (p_program_id is null or p_workout_date is null) then
    raise exception 'Provide workout_id or program_id with workout_date';
  end if;

  if p_target_type = 'classification' and p_target_classification_id is null then
    raise exception 'Classification target requires target_classification_id';
  end if;

  if p_target_type in ('members', 'individual') and (p_target_user_ids is null or array_length(p_target_user_ids, 1) is null) then
    raise exception 'Member targets require target_user_ids';
  end if;

  insert into public.st_workout_assignments (
    team_id,
    assigned_by,
    workout_id,
    program_id,
    workout_date,
    target_type,
    target_classification_id,
    scheduled_date,
    due_date,
    title,
    notes,
    coaching_metadata
  ) values (
    p_team_id,
    auth.uid(),
    p_workout_id,
    p_program_id,
    p_workout_date,
    p_target_type,
    p_target_classification_id,
    coalesce(p_scheduled_date, current_date),
    p_due_date,
    p_title,
    p_notes,
    coalesce(p_coaching_metadata, '{}'::jsonb)
  )
  returning id into v_assignment_id;

  if p_target_type = 'group' then
    for v_recipient in
      select tm.user_id
      from public.st_team_members tm
      where tm.team_id = p_team_id
        and tm.status = 'active'
        and tm.is_active_participant = true
    loop
      insert into public.st_assignment_recipients (assignment_id, user_id)
      values (v_assignment_id, v_recipient)
      on conflict (assignment_id, user_id) do nothing;
    end loop;
  elsif p_target_type = 'classification' then
    for v_recipient in
      select distinct tm.user_id
      from public.st_team_members tm
      join public.st_group_member_classifications gmc on gmc.member_id = tm.id
      where tm.team_id = p_team_id
        and tm.status = 'active'
        and tm.is_active_participant = true
        and gmc.classification_id = p_target_classification_id
    loop
      insert into public.st_assignment_recipients (assignment_id, user_id)
      values (v_assignment_id, v_recipient)
      on conflict (assignment_id, user_id) do nothing;
    end loop;
  else
    foreach v_uid in array p_target_user_ids
    loop
      if exists (
        select 1 from public.st_team_members tm
        where tm.team_id = p_team_id and tm.user_id = v_uid and tm.status = 'active'
      ) then
        insert into public.st_assignment_recipients (assignment_id, user_id)
        values (v_assignment_id, v_uid)
        on conflict (assignment_id, user_id) do nothing;
      end if;
    end loop;
  end if;

  return v_assignment_id;
end;
$$;

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
begin
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = auth.uid()
      and status = 'active' and role in ('owner', 'manager')
  ) then
    raise exception 'Not authorized';
  end if;

  update public.st_program_assignments
  set is_active = false
  where user_id = p_member_user_id and team_id = p_team_id and is_active = true;

  insert into public.st_program_assignments (
    user_id, team_id, assigned_by, assignment_type, program_id, notes, is_active, target_type, coaching_metadata
  ) values (
    p_member_user_id, p_team_id, auth.uid(), p_assignment_type, p_program_id, p_notes, true, 'individual',
    coalesce(p_coaching_metadata, '{}'::jsonb)
  );

  if p_assignment_type = 'personal' then
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'personal');
  else
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'team');
  end if;
end;
$$;

grant execute on function public.st_assign_workout_to_targets(
  uuid, uuid, uuid, date, text, uuid, uuid[], date, date, text, text, jsonb
) to authenticated;

grant execute on function public.st_assign_member_program(
  uuid, uuid, text, uuid, text, jsonb
) to authenticated;
