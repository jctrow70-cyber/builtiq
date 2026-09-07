-- BIQ-0149: Pending group member invites (email + role) for create/share flow
-- Safe additive migration. Does not drop tables or delete data.

create table if not exists public.st_group_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'member'
    check (role in ('owner', 'manager', 'member')),
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  last_sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, email)
);

create index if not exists st_group_invites_team_idx
  on public.st_group_invites (team_id);

create index if not exists st_group_invites_email_idx
  on public.st_group_invites (lower(email));

comment on table public.st_group_invites is
  'Pending/accepted invites to join a group. Recipients join with the team invite code.';

alter table public.st_group_invites enable row level security;

drop policy if exists "group_invites_select_managers" on public.st_group_invites;
create policy "group_invites_select_managers" on public.st_group_invites
  for select to authenticated
  using (public.st_user_can_edit_team(team_id));

drop policy if exists "group_invites_insert_managers" on public.st_group_invites;
create policy "group_invites_insert_managers" on public.st_group_invites
  for insert to authenticated
  with check (
    public.st_user_can_edit_team(team_id)
    and invited_by = auth.uid()
  );

drop policy if exists "group_invites_update_managers" on public.st_group_invites;
create policy "group_invites_update_managers" on public.st_group_invites
  for update to authenticated
  using (public.st_user_can_edit_team(team_id))
  with check (public.st_user_can_edit_team(team_id));

drop policy if exists "group_invites_delete_managers" on public.st_group_invites;
create policy "group_invites_delete_managers" on public.st_group_invites
  for delete to authenticated
  using (public.st_user_can_edit_team(team_id));

-- Mark matching pending invites accepted when a user joins via invite code.
-- Also applies the invited role (Member / Editor) to the new membership.
create or replace function public.st_mark_group_invite_accepted(
  p_team_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_team_id is null or coalesce(trim(p_email), '') = '' then
    return;
  end if;

  update public.st_group_invites
  set status = 'accepted',
      accepted_at = now()
  where team_id = p_team_id
    and lower(email) = lower(trim(p_email))
    and status = 'pending'
  returning role into v_role;

  if v_role in ('manager', 'member') and auth.uid() is not null then
    update public.st_team_members
    set role = v_role
    where team_id = p_team_id
      and user_id = auth.uid()
      and role is distinct from 'owner';
  end if;
end;
$$;

revoke all on function public.st_mark_group_invite_accepted(uuid, text) from public;
grant execute on function public.st_mark_group_invite_accepted(uuid, text) to authenticated;
