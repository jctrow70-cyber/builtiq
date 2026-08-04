-- BIQ-0093: Remove duplicate st_assign_member_program overload
-- Migration 010 created a 5-arg version; 026/036 added a 6-arg version with
-- p_coaching_metadata. Both remained, so RPC calls with 5 named args fail with
-- "Could not choose the best candidate function".

drop function if exists public.st_assign_member_program(uuid, uuid, text, uuid, text);

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
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.st_user_can_edit_team(p_team_id) then
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
    where team_id = p_team_id
      and user_id = p_member_user_id
      and status = 'active'
  ) then
    raise exception 'Member not found';
  end if;

  update public.st_program_assignments
  set is_active = false
  where user_id = p_member_user_id
    and team_id = p_team_id
    and is_active = true;

  insert into public.st_program_assignments (
    user_id,
    team_id,
    assigned_by,
    assignment_type,
    program_id,
    notes,
    is_active,
    target_type,
    coaching_metadata
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
  );

  if p_assignment_type = 'personal' then
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'personal');
  else
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'team');
  end if;
end;
$$;

revoke all on function public.st_assign_member_program(uuid, uuid, text, uuid, text, jsonb) from public;
grant execute on function public.st_assign_member_program(uuid, uuid, text, uuid, text, jsonb) to authenticated;
