-- BIQ-0242: Secure group invitations and Quick Join.
-- Extends st_group_invites. Does not create a second invitation table.
-- Does not apply remotely from the app. Run this in Supabase after 054 and 055.
--
-- Legacy pending rows were code-based (the permanent group code was emailed).
-- They are revoked here. They are not upgraded into secure invitations and
-- they cannot grant Manager. Accepted history is kept.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Invite row: hash only. The raw token exists only in the emailed URL.
-- classification_ids holds zero or more existing group classifications.
-- This phase's screen sends one. Acceptance applies every id that still
-- belongs to the group, so more than one can be stored later without a new table.
-- ---------------------------------------------------------------------------

alter table public.st_group_invites
  add column if not exists token_hash text,
  add column if not exists expires_at timestamptz,
  add column if not exists accepted_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists classification_ids uuid[] not null default '{}';

create unique index if not exists st_group_invites_token_hash_uidx
  on public.st_group_invites (token_hash)
  where token_hash is not null;

update public.st_group_invites
set email = lower(trim(email))
where email is distinct from lower(trim(email))
  and not exists (
    select 1
    from public.st_group_invites other
    where other.team_id = st_group_invites.team_id
      and other.id <> st_group_invites.id
      and lower(trim(other.email)) = lower(trim(st_group_invites.email))
  );

-- Code-based pending invites have no token. Revoke them so they cannot be accepted.
update public.st_group_invites
set status = 'revoked',
    token_hash = null,
    updated_at = now()
where status = 'pending'
  and token_hash is null;

comment on table public.st_group_invites is
  'Secure email invitations. token_hash is the only token material stored. Quick Join uses st_group_quick_join, not this table.';

comment on column public.st_group_invites.classification_ids is
  'Classifications to apply on acceptance. One or more. Ids that no longer belong to the group are ignored.';

-- Managers cannot invite Managers unless the owner turns this on.
alter table public.st_teams
  add column if not exists managers_can_invite_managers boolean not null default false;

-- ---------------------------------------------------------------------------
-- Quick Join code lives off the member-readable team row.
-- st_teams.invite_code stays NOT NULL UNIQUE but is no longer the join secret.
-- ---------------------------------------------------------------------------

create table if not exists public.st_group_quick_join (
  team_id uuid primary key references public.st_teams(id) on delete cascade,
  code text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint st_group_quick_join_code_unique unique (code)
);

insert into public.st_group_quick_join (team_id, code, enabled)
select id, upper(invite_code), true
from public.st_teams
on conflict (team_id) do nothing;

-- Replace the public column only while it still equals the live Quick Join code.
update public.st_teams t
set invite_code = 'DQ' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14))
where exists (
  select 1
  from public.st_group_quick_join q
  where q.team_id = t.id
    and q.code = upper(t.invite_code)
);

create or replace function public.st_teams_seal_quick_join_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_real text;
  v_decoy text;
begin
  v_real := upper(trim(new.invite_code));
  if v_real is null or v_real = '' then
    v_real := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  v_decoy := 'DQ' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14));
  insert into public.st_group_quick_join (team_id, code, enabled)
  values (new.id, v_real, true)
  on conflict (team_id) do nothing;
  new.invite_code := v_decoy;
  return new;
end;
$$;

drop trigger if exists st_teams_seal_quick_join_code on public.st_teams;
create trigger st_teams_seal_quick_join_code
  before insert on public.st_teams
  for each row execute function public.st_teams_seal_quick_join_code();

alter table public.st_group_quick_join enable row level security;

drop policy if exists "quick_join_select_managers" on public.st_group_quick_join;
create policy "quick_join_select_managers" on public.st_group_quick_join
  for select to authenticated
  using (public.st_user_can_edit_team(team_id));

revoke insert, update, delete on public.st_group_quick_join from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Token hash. Not granted to clients.
-- ---------------------------------------------------------------------------

create or replace function public.st_hash_invite_token(p_token text)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
begin
  if coalesce(trim(p_token), '') = '' then
    return null;
  end if;
  return encode(extensions.digest(convert_to(trim(p_token), 'UTF8'), 'sha256'), 'hex');
end;
$$;

revoke all on function public.st_hash_invite_token(text) from public, anon, authenticated;

create or replace function public.st_new_invite_token()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select encode(extensions.gen_random_bytes(32), 'hex');
$$;

revoke all on function public.st_new_invite_token() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who may invite which role. Owner is never an invitation role.
-- ---------------------------------------------------------------------------

create or replace function public.st_user_can_invite_role(p_team_id uuid, p_role text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_flag boolean;
begin
  if auth.uid() is null or p_role not in ('member', 'manager') then
    return false;
  end if;

  select m.role into v_role
  from public.st_team_members m
  where m.team_id = p_team_id
    and m.user_id = auth.uid()
    and m.status = 'active';

  if v_role = 'editor' then
    v_role := 'manager';
  end if;

  if v_role = 'owner' then
    return true;
  end if;

  if v_role = 'manager' and p_role = 'member' then
    return true;
  end if;

  if v_role = 'manager' and p_role = 'manager' then
    select coalesce(t.managers_can_invite_managers, false) into v_flag
    from public.st_teams t
    where t.id = p_team_id;
    return coalesce(v_flag, false);
  end if;

  return false;
end;
$$;

revoke all on function public.st_user_can_invite_role(uuid, text) from public;
grant execute on function public.st_user_can_invite_role(uuid, text) to authenticated;

-- Group participation slot only. Does not write the personal slot or followed_program_id.
create or replace function public.st_ensure_group_participation(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program uuid;
  v_key text;
begin
  if auth.uid() is null or p_team_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.st_team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) then
    return;
  end if;

  v_key := 'group:' || p_team_id::text;
  if v_key = 'personal' then
    raise exception 'Refusing to change personal training';
  end if;

  select t.default_program_id into v_program
  from public.st_teams t
  where t.id = p_team_id;

  insert into public.st_training_enrollments (user_id, source_kind, source_key, team_id, program_id, status)
  values (auth.uid(), 'group', v_key, p_team_id, v_program, 'active')
  on conflict (user_id, source_key) do update
    set status = 'active',
        updated_at = now(),
        program_id = coalesce(public.st_training_enrollments.program_id, excluded.program_id)
    where public.st_training_enrollments.source_kind = 'group'
      and public.st_training_enrollments.source_key <> 'personal';
exception
  when undefined_table then
    return;
end;
$$;

revoke all on function public.st_ensure_group_participation(uuid) from public, anon, authenticated;

create or replace function public.st_create_group_invite(
  p_team_id uuid,
  p_email text,
  p_display_name text,
  p_role text,
  p_classification_ids uuid[] default '{}'
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text;
  v_role text;
  v_token text;
  v_hash text;
  v_expires timestamptz;
  v_ids uuid[];
  v_row public.st_group_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;

  v_role := lower(trim(coalesce(p_role, 'member')));
  if v_role = 'owner' then
    raise exception 'Ownership is transferred separately. An invitation cannot create an Owner';
  end if;
  if v_role not in ('member', 'manager') then
    raise exception 'Role must be Member or Manager';
  end if;
  if not public.st_user_can_invite_role(p_team_id, v_role) then
    raise exception 'You cannot invite that role';
  end if;

  if exists (
    select 1 from public.st_teams t
    where t.id = p_team_id and coalesce(t.is_archived, false) = true
  ) then
    raise exception 'This group is archived';
  end if;

  if exists (
    select 1
    from public.st_team_members m
    join auth.users u on u.id = m.user_id
    where m.team_id = p_team_id
      and m.status = 'active'
      and lower(u.email) = v_email
  ) then
    raise exception 'This person is already in the group';
  end if;

  select coalesce(array_agg(c.id), '{}')
  into v_ids
  from public.st_group_classifications c
  where c.team_id = p_team_id
    and c.id = any(coalesce(p_classification_ids, '{}'));

  v_token := public.st_new_invite_token();
  v_hash := public.st_hash_invite_token(v_token);
  v_expires := now() + interval '7 days';

  insert into public.st_group_invites (
    team_id, email, display_name, role, invited_by, status,
    token_hash, expires_at, classification_ids, last_sent_at, accepted_at, accepted_by_user_id, updated_at
  )
  values (
    p_team_id, v_email, nullif(trim(coalesce(p_display_name, '')), ''), v_role, auth.uid(), 'pending',
    v_hash, v_expires, coalesce(v_ids, '{}'), now(), null, null, now()
  )
  on conflict (team_id, email) do update
    set display_name = excluded.display_name,
        role = excluded.role,
        invited_by = auth.uid(),
        status = 'pending',
        token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        classification_ids = excluded.classification_ids,
        last_sent_at = now(),
        accepted_at = null,
        accepted_by_user_id = null,
        updated_at = now()
  returning * into v_row;

  -- Notification hook: group_invitation. Delivery is a later phase.
  return json_build_object(
    'id', v_row.id,
    'token', v_token,
    'expires_at', v_row.expires_at,
    'email', v_row.email,
    'role', v_row.role
  );
end;
$$;

revoke all on function public.st_create_group_invite(uuid, text, text, text, uuid[]) from public;
grant execute on function public.st_create_group_invite(uuid, text, text, text, uuid[]) to authenticated;

create or replace function public.st_resend_group_invite(p_invite_id uuid)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.st_group_invites%rowtype;
  v_token text;
  v_hash text;
  v_expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_row
  from public.st_group_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if not public.st_user_can_invite_role(v_row.team_id, v_row.role) then
    raise exception 'You cannot resend this invitation';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Only a pending invitation can be resent';
  end if;

  v_token := public.st_new_invite_token();
  v_hash := public.st_hash_invite_token(v_token);
  v_expires := now() + interval '7 days';

  update public.st_group_invites
  set token_hash = v_hash,
      expires_at = v_expires,
      last_sent_at = now(),
      updated_at = now()
  where id = p_invite_id;

  -- Notification hook: group_invitation (resend). Delivery is a later phase.
  return json_build_object(
    'id', p_invite_id,
    'token', v_token,
    'expires_at', v_expires,
    'email', v_row.email,
    'role', v_row.role,
    'team_id', v_row.team_id
  );
end;
$$;

revoke all on function public.st_resend_group_invite(uuid) from public;
grant execute on function public.st_resend_group_invite(uuid) to authenticated;

create or replace function public.st_revoke_group_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.st_group_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_row
  from public.st_group_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;
  if not public.st_user_can_invite_role(v_row.team_id, 'member')
     and not public.st_user_is_team_owner(v_row.team_id) then
    raise exception 'You cannot cancel this invitation';
  end if;
  if v_row.role = 'manager' and not public.st_user_can_invite_role(v_row.team_id, 'manager') then
    raise exception 'You cannot cancel this invitation';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Only a pending invitation can be canceled';
  end if;

  update public.st_group_invites
  set status = 'revoked',
      updated_at = now()
  where id = p_invite_id;
end;
$$;

revoke all on function public.st_revoke_group_invite(uuid) from public;
grant execute on function public.st_revoke_group_invite(uuid) to authenticated;

create or replace function public.st_preview_group_invite(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_row public.st_group_invites%rowtype;
  v_email text;
  v_team public.st_teams%rowtype;
  v_inviter text;
begin
  if auth.uid() is null then
    return json_build_object('state', 'unauthenticated');
  end if;

  v_hash := public.st_hash_invite_token(p_token);
  if v_hash is null then
    return json_build_object('state', 'invalid');
  end if;

  select * into v_row
  from public.st_group_invites
  where token_hash = v_hash;

  if not found then
    return json_build_object('state', 'invalid');
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid();

  if v_email is null or v_email is distinct from v_row.email then
    return json_build_object('state', 'email_mismatch');
  end if;

  select * into v_team from public.st_teams where id = v_row.team_id;

  select coalesce(nullif(trim(m.display_name), ''), 'A group member')
  into v_inviter
  from public.st_team_members m
  where m.team_id = v_row.team_id
    and m.user_id = v_row.invited_by
  limit 1;

  if v_row.status = 'revoked' or v_row.token_hash is null then
    return json_build_object('state', 'revoked');
  end if;
  if v_row.status = 'accepted' then
    return json_build_object(
      'state', 'accepted',
      'group_name', v_team.name,
      'inviter_name', coalesce(v_inviter, 'A group member'),
      'role', v_row.role
    );
  end if;
  if v_row.status <> 'pending' or v_row.expires_at is null or v_row.expires_at < now() then
    return json_build_object(
      'state', 'expired',
      'group_name', v_team.name,
      'inviter_name', coalesce(v_inviter, 'A group member'),
      'role', v_row.role
    );
  end if;
  if coalesce(v_team.is_archived, false) then
    return json_build_object('state', 'archived', 'group_name', v_team.name);
  end if;

  return json_build_object(
    'state', 'ready',
    'group_name', v_team.name,
    'inviter_name', coalesce(v_inviter, 'A group member'),
    'role', v_row.role,
    'expires_at', v_row.expires_at
  );
end;
$$;

revoke all on function public.st_preview_group_invite(text) from public;
grant execute on function public.st_preview_group_invite(text) to authenticated;

create or replace function public.st_accept_group_invite(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_row public.st_group_invites%rowtype;
  v_email text;
  v_team public.st_teams%rowtype;
  v_member public.st_team_members%rowtype;
  v_member_id uuid;
  v_display text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_hash := public.st_hash_invite_token(p_token);
  if v_hash is null then
    raise exception 'This invitation link is not valid';
  end if;

  select * into v_row
  from public.st_group_invites
  where token_hash = v_hash
  for update;

  if not found or v_row.token_hash is null then
    raise exception 'This invitation link is not valid';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid();

  if v_email is null or v_email is distinct from v_row.email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  if v_row.status = 'accepted' and v_row.accepted_by_user_id = auth.uid() then
    return json_build_object('ok', true, 'already_accepted', true, 'team_id', v_row.team_id);
  end if;
  if v_row.status = 'accepted' then
    raise exception 'This invitation has already been used';
  end if;
  if v_row.status = 'revoked' then
    raise exception 'This invitation was canceled';
  end if;
  if v_row.status <> 'pending' or v_row.expires_at is null or v_row.expires_at < now() then
    raise exception 'This invitation has expired';
  end if;
  if v_row.role not in ('member', 'manager') then
    raise exception 'This invitation is not valid';
  end if;

  select * into v_team from public.st_teams where id = v_row.team_id;
  if not found or coalesce(v_team.is_archived, false) then
    raise exception 'This group is not accepting members';
  end if;

  select coalesce(nullif(trim(v_row.display_name), ''), nullif(trim(u.raw_user_meta_data->>'display_name'), ''))
  into v_display
  from auth.users u
  where u.id = auth.uid();

  perform set_config('app.st_join_team_id', v_row.team_id::text, true);
  perform set_config('app.st_secure_invite_approved', 'true', true);
  perform set_config('app.st_secure_invite_role', v_row.role, true);

  select * into v_member
  from public.st_team_members
  where team_id = v_row.team_id
    and user_id = auth.uid();

  if found and v_member.status = 'active' then
    v_member_id := v_member.id;
  else
    insert into public.st_team_members (team_id, user_id, display_name, role, status)
    values (v_row.team_id, auth.uid(), v_display, v_row.role, 'active')
    on conflict (team_id, user_id) do update
      set status = 'active',
          role = excluded.role,
          display_name = coalesce(excluded.display_name, public.st_team_members.display_name)
    returning id into v_member_id;
  end if;

  insert into public.st_group_member_classifications (member_id, classification_id)
  select v_member_id, c.id
  from public.st_group_classifications c
  where c.team_id = v_row.team_id
    and c.id = any(coalesce(v_row.classification_ids, '{}'))
  on conflict do nothing;

  perform public.st_ensure_group_participation(v_row.team_id);

  update public.st_group_invites
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      accepted_by_user_id = auth.uid(),
      updated_at = now()
  where id = v_row.id
    and status = 'pending';

  -- Notification hook: group_invitation_accepted. Delivery is a later phase.
  return json_build_object('ok', true, 'team_id', v_row.team_id, 'invite_id', v_row.id, 'role', v_row.role);
end;
$$;

revoke all on function public.st_accept_group_invite(text) from public;
grant execute on function public.st_accept_group_invite(text) to authenticated;

-- Joining by code must not apply an emailed invitation role.
create or replace function public.st_mark_group_invite_accepted(
  p_team_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Intentionally empty. BIQ-0242 acceptance is st_accept_group_invite.
  return;
end;
$$;

-- Quick Join: Member only. Archived and disabled codes are rejected.
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
  v_team_id uuid;
  v_name text;
  v_owner uuid;
  v_enabled boolean;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select q.team_id, q.enabled, t.name, t.owner_user_id
  into v_team_id, v_enabled, v_name, v_owner
  from public.st_group_quick_join q
  join public.st_teams t on t.id = q.team_id
  where q.code = upper(trim(p_invite_code))
    and coalesce(t.is_archived, false) = false
  limit 1;

  if not found then
    raise exception 'Group not found';
  end if;
  if coalesce(v_enabled, false) = false then
    raise exception 'Quick Join is turned off for this group';
  end if;

  perform set_config('app.st_join_team_id', v_team_id::text, true);
  perform set_config('app.st_join_team_approved', 'true', true);

  insert into public.st_team_members (team_id, user_id, display_name, role, status)
  values (v_team_id, v_uid, p_display_name, 'member', 'active')
  on conflict (team_id, user_id) do update
    set display_name = coalesce(excluded.display_name, public.st_team_members.display_name),
        status = 'active',
        role = case
          when public.st_team_members.status = 'active' then public.st_team_members.role
          else 'member'
        end;

  perform public.st_ensure_group_participation(v_team_id);

  return json_build_object(
    'id', v_team_id,
    'name', v_name,
    'owner_user_id', v_owner
  );
end;
$$;

alter function public.st_join_team_by_invite(text, text) owner to postgres;

create or replace function public.st_group_quick_join_info(p_team_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_enabled boolean;
  v_owner boolean;
begin
  if auth.uid() is null or not public.st_user_can_edit_team(p_team_id) then
    return json_build_object('enabled', false, 'code', null);
  end if;

  select q.code, q.enabled into v_code, v_enabled
  from public.st_group_quick_join q
  where q.team_id = p_team_id;

  v_owner := public.st_user_is_team_owner(p_team_id);
  if v_owner then
    return json_build_object('enabled', coalesce(v_enabled, false), 'code', v_code);
  end if;
  if coalesce(v_enabled, false) then
    return json_build_object('enabled', true, 'code', v_code);
  end if;
  return json_build_object('enabled', false, 'code', null);
end;
$$;

revoke all on function public.st_group_quick_join_info(uuid) from public;
grant execute on function public.st_group_quick_join_info(uuid) to authenticated;

create or replace function public.st_set_group_quick_join(p_team_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.st_user_is_team_owner(p_team_id) then
    raise exception 'Only the group owner can change Quick Join';
  end if;
  update public.st_group_quick_join
  set enabled = coalesce(p_enabled, false),
      updated_at = now()
  where team_id = p_team_id;
end;
$$;

revoke all on function public.st_set_group_quick_join(uuid, boolean) from public;
grant execute on function public.st_set_group_quick_join(uuid, boolean) to authenticated;

create or replace function public.st_regenerate_group_code(p_team_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
begin
  if not public.st_user_is_team_owner(p_team_id) then
    raise exception 'Only the group owner can regenerate the group code';
  end if;
  v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  update public.st_group_quick_join
  set code = v_code,
      updated_at = now()
  where team_id = p_team_id;
  if not found then
    raise exception 'Quick Join is not set up for this group';
  end if;
  return v_code;
end;
$$;

revoke all on function public.st_regenerate_group_code(uuid) from public;
grant execute on function public.st_regenerate_group_code(uuid) to authenticated;

-- Insert/update policies so acceptance works when RLS is enforced inside security definer.
drop policy if exists "team_members_insert_via_secure_invite" on public.st_team_members;
create policy "team_members_insert_via_secure_invite" on public.st_team_members
  for insert
  with check (
    user_id = auth.uid()
    and current_setting('app.st_secure_invite_approved', true) = 'true'
    and team_id::text = current_setting('app.st_join_team_id', true)
    and role = current_setting('app.st_secure_invite_role', true)
    and role in ('member', 'manager')
  );

drop policy if exists "team_members_update_via_join" on public.st_team_members;
create policy "team_members_update_via_join" on public.st_team_members
  for update
  using (
    user_id = auth.uid()
    and team_id::text = current_setting('app.st_join_team_id', true)
    and (
      current_setting('app.st_join_team_approved', true) = 'true'
      or current_setting('app.st_secure_invite_approved', true) = 'true'
    )
  )
  with check (
    user_id = auth.uid()
    and team_id::text = current_setting('app.st_join_team_id', true)
    and role in ('member', 'manager', 'owner')
    and (
      (current_setting('app.st_join_team_approved', true) = 'true' and role = 'member')
      or current_setting('app.st_join_team_approved', true) = 'true'
      or (
        current_setting('app.st_secure_invite_approved', true) = 'true'
        and role = current_setting('app.st_secure_invite_role', true)
      )
      or role = 'owner'
    )
  );

drop policy if exists "group_member_classifications_insert_via_invite" on public.st_group_member_classifications;
create policy "group_member_classifications_insert_via_invite" on public.st_group_member_classifications
  for insert
  with check (
    current_setting('app.st_secure_invite_approved', true) = 'true'
    and exists (
      select 1
      from public.st_team_members tm
      where tm.id = member_id
        and tm.user_id = auth.uid()
        and tm.team_id::text = current_setting('app.st_join_team_id', true)
    )
    and exists (
      select 1
      from public.st_group_classifications gc
      where gc.id = classification_id
        and gc.team_id::text = current_setting('app.st_join_team_id', true)
    )
  );

-- Clients can read invitation rows they manage, but not the token hash.
revoke select (token_hash) on public.st_group_invites from public, anon, authenticated;
revoke insert, update, delete on public.st_group_invites from public, anon, authenticated;
