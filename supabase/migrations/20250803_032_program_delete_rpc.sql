-- BIQ-0079: Reliable program delete via security-definer RPC

create or replace function public.st_delete_program(p_program_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prog public.st_programs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_prog from public.st_programs where id = p_program_id;
  if not found then
    raise exception 'Program not found';
  end if;

  if v_prog.visibility = 'personal' then
    if v_prog.owner_user_id <> auth.uid() then
      raise exception 'Not authorized to delete this program';
    end if;
  elsif v_prog.visibility = 'team' then
    if v_prog.team_id is null or not public.st_user_can_edit_team(v_prog.team_id) then
      raise exception 'Not authorized to delete this team program';
    end if;
    if exists (
      select 1
      from public.st_teams t
      where t.default_program_id = p_program_id
        and coalesce(t.is_archived, false) = false
    ) then
      raise exception 'Cannot delete the team active program. Assign a different default first.';
    end if;
  else
    raise exception 'Not authorized to delete this program';
  end if;

  delete from public.st_programs where id = p_program_id;
end;
$$;

revoke all on function public.st_delete_program(uuid) from public;
grant execute on function public.st_delete_program(uuid) to authenticated;
