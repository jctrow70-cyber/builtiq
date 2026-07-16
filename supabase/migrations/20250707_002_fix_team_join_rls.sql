-- BuildIQ Phase 1 fix: allow invite-based team join through RLS
-- Supabase applies RLS even inside SECURITY DEFINER functions.
-- The join RPC validates the invite, sets a transaction-local flag, then inserts.

create or replace function public.st_join_team_by_invite(
  p_invite_code text,
  p_display_name text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.st_teams%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_team
  from public.st_teams
  where invite_code = upper(trim(p_invite_code))
  limit 1;

  if not found then
    raise exception 'Team not found';
  end if;

  -- Transaction-local flags consumed by the insert policy below.
  perform set_config('app.st_join_team_id', v_team.id::text, true);
  perform set_config('app.st_join_team_approved', 'true', true);

  insert into public.st_team_members (team_id, user_id, display_name, role, status)
  values (v_team.id, v_uid, p_display_name, 'member', 'active')
  on conflict (team_id, user_id) do update
    set display_name = coalesce(excluded.display_name, st_team_members.display_name),
        status = 'active';

  return json_build_object(
    'id', v_team.id,
    'name', v_team.name,
    'invite_code', v_team.invite_code,
    'owner_user_id', v_team.owner_user_id
  );
end;
$$;

alter function public.st_join_team_by_invite(text, text) owner to postgres;

revoke all on function public.st_join_team_by_invite(text, text) from public;
grant execute on function public.st_join_team_by_invite(text, text) to authenticated;

-- Allow member insert only when the join RPC has validated the invite this transaction.
create policy "team_members_insert_via_invite" on public.st_team_members
  for insert
  with check (
    user_id = auth.uid()
    and role = 'member'
    and current_setting('app.st_join_team_approved', true) = 'true'
    and team_id::text = current_setting('app.st_join_team_id', true)
  );
