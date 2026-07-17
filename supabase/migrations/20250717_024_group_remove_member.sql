-- BIQ-0043-P3: Manager/owner remove group member (soft delete via status)

create or replace function public.st_remove_group_member(
  p_team_id uuid,
  p_member_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not authorized';
  end if;

  if p_member_user_id = auth.uid() then
    raise exception 'Use leave-group flow to remove yourself';
  end if;

  select role into v_target_role
  from public.st_team_members
  where team_id = p_team_id
    and user_id = p_member_user_id
    and status = 'active';

  if not found then
    raise exception 'Member not found';
  end if;

  if v_target_role = 'owner' then
    raise exception 'Cannot remove the group owner';
  end if;

  update public.st_team_members
  set status = 'removed'
  where team_id = p_team_id
    and user_id = p_member_user_id
    and status = 'active';
end;
$$;

revoke all on function public.st_remove_group_member(uuid, uuid) from public;
grant execute on function public.st_remove_group_member(uuid, uuid) to authenticated;
