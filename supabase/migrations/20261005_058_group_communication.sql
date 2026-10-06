-- BIQ-0244 Group communication.
-- Apply after 20261005_057_notification_foundation.sql.
-- Do not apply from the app. Run this manually in Supabase.
--
-- conversation_type is group or direct in this phase.
-- A later migration can add classification without a new message table.
-- Future workout, program, exercise, or progress references can be added as
-- columns. Do not copy that data into the message body.
-- Chat is human communication. It is not the notification bell and not group activity.

alter table public.st_teams
  add column if not exists members_can_use_group_chat boolean not null default true,
  add column if not exists members_can_message_managers boolean not null default true,
  add column if not exists members_can_message_members boolean not null default false;

comment on column public.st_teams.members_can_use_group_chat is
  'When false, members cannot read or send in the primary group chat. Owners and managers still can. History is kept.';
comment on column public.st_teams.members_can_message_managers is
  'When false, members cannot send new direct messages to owners or managers. They can still read existing direct history while they remain in the group.';
comment on column public.st_teams.members_can_message_members is
  'When false, members cannot direct-message other members. Default off.';

create table if not exists public.st_conversations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  conversation_type text not null,
  participant_key text not null,
  created_by uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint st_conversations_type_check check (conversation_type in ('group', 'direct')),
  constraint st_conversations_team_participant_key unique (team_id, participant_key)
);

create unique index if not exists st_conversations_one_primary_group_chat
  on public.st_conversations (team_id)
  where conversation_type = 'group';

comment on table public.st_conversations is
  'One human conversation. group is the single primary group chat. direct is one pair inside one group. classification can be added later.';

create table if not exists public.st_conversation_members (
  conversation_id uuid not null references public.st_conversations(id) on delete cascade,
  user_id uuid not null,
  joined_at timestamptz not null default clock_timestamp(),
  left_at timestamptz,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

comment on table public.st_conversation_members is
  'Per-user read cursor (last_read_at). A row here does not grant access after the person leaves the group.';

create index if not exists st_conversation_members_user_idx
  on public.st_conversation_members (user_id);

create table if not exists public.st_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.st_conversations(id) on delete cascade,
  sender_user_id uuid not null,
  body text not null default '',
  created_at timestamptz not null default clock_timestamp(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint st_messages_body_check check (
    char_length(body) <= 2000
    and (
      (deleted_at is not null and body = '')
      or (deleted_at is null and char_length(btrim(body)) > 0)
    )
  )
);

comment on table public.st_messages is
  'Text messages only. Soft delete clears body. Authorization is current group membership, not this table.';

create index if not exists st_messages_conversation_created_idx
  on public.st_messages (conversation_id, created_at desc, id desc);

alter table public.st_messages replica identity full;

-- ---------------------------------------------------------------------------
-- Authorization. Active group membership is required every time.
-- A leftover st_conversation_members row is not enough.
-- ---------------------------------------------------------------------------

create or replace function public.st_chat_member_role(p_team_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when lower(m.role) in ('editor', 'manager') then 'manager'
    when lower(m.role) = 'owner' then 'owner'
    when lower(m.role) = 'member' then 'member'
    else null
  end
  from public.st_team_members m
  join public.st_teams t on t.id = m.team_id
  where m.team_id = p_team_id
    and m.user_id = p_user_id
    and m.status = 'active'
    and coalesce(t.is_archived, false) = false
  limit 1;
$$;

create or replace function public.st_chat_user_can_read(p_user_id uuid, p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_type text;
  v_role text;
  v_group_chat boolean;
begin
  if p_user_id is null or p_conversation_id is null then
    return false;
  end if;

  select c.team_id, c.conversation_type
    into v_team, v_type
  from public.st_conversations c
  where c.id = p_conversation_id;

  if v_team is null then
    return false;
  end if;

  v_role := public.st_chat_member_role(v_team, p_user_id);
  if v_role is null then
    return false;
  end if;

  if v_type = 'group' then
    if v_role in ('owner', 'manager') then
      return true;
    end if;
    select t.members_can_use_group_chat into v_group_chat
    from public.st_teams t
    where t.id = v_team;
    return coalesce(v_group_chat, false);
  end if;

  if v_type = 'direct' then
    return exists (
      select 1
      from public.st_conversation_members cm
      where cm.conversation_id = p_conversation_id
        and cm.user_id = p_user_id
        and cm.left_at is null
    );
  end if;

  return false;
end;
$$;

create or replace function public.st_chat_user_can_send(p_user_id uuid, p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_type text;
  v_role text;
  v_other uuid;
  v_other_role text;
  v_managers boolean;
  v_members boolean;
begin
  if not public.st_chat_user_can_read(p_user_id, p_conversation_id) then
    return false;
  end if;

  select c.team_id, c.conversation_type
    into v_team, v_type
  from public.st_conversations c
  where c.id = p_conversation_id;

  v_role := public.st_chat_member_role(v_team, p_user_id);

  if v_type = 'group' then
    return true;
  end if;

  if v_type <> 'direct' then
    return false;
  end if;

  select cm.user_id into v_other
  from public.st_conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id <> p_user_id
    and cm.left_at is null
  limit 1;

  v_other_role := public.st_chat_member_role(v_team, v_other);
  if v_other_role is null then
    return false;
  end if;

  if v_role in ('owner', 'manager') then
    return true;
  end if;

  select t.members_can_message_managers, t.members_can_message_members
    into v_managers, v_members
  from public.st_teams t
  where t.id = v_team;

  if v_other_role in ('owner', 'manager') then
    return coalesce(v_managers, false);
  end if;

  if v_other_role = 'member' then
    return coalesce(v_members, false);
  end if;

  return false;
end;
$$;

create or replace function public.st_chat_can_start_direct(p_team_id uuid, p_caller uuid, p_other uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller text;
  v_other text;
  v_managers boolean;
  v_members boolean;
begin
  if p_caller is null or p_other is null or p_caller = p_other then
    return false;
  end if;

  v_caller := public.st_chat_member_role(p_team_id, p_caller);
  v_other := public.st_chat_member_role(p_team_id, p_other);
  if v_caller is null or v_other is null then
    return false;
  end if;

  if v_caller in ('owner', 'manager') then
    return true;
  end if;

  if v_caller <> 'member' then
    return false;
  end if;

  select t.members_can_message_managers, t.members_can_message_members
    into v_managers, v_members
  from public.st_teams t
  where t.id = p_team_id;

  if v_other in ('owner', 'manager') then
    return coalesce(v_managers, false);
  end if;

  if v_other = 'member' then
    return coalesce(v_members, false);
  end if;

  return false;
end;
$$;

create or replace function public.st_user_can_read_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.st_chat_user_can_read(auth.uid(), p_conversation_id);
$$;

-- ---------------------------------------------------------------------------
-- One bell row per unread conversation. Does not change st_publish_notification.
-- ---------------------------------------------------------------------------

create or replace function public.st_upsert_conversation_notification(
  p_user_id uuid,
  p_event_type text,
  p_conversation_id uuid,
  p_team_id uuid,
  p_actor_user_id uuid,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_dedupe text;
  v_id uuid;
begin
  if p_user_id is null or p_user_id = p_actor_user_id or coalesce(trim(p_title), '') = '' then
    return null;
  end if;
  if p_event_type not in ('group_message', 'direct_message') then
    return null;
  end if;

  v_category := public.st_notification_category(p_event_type);
  if v_category is null then
    return null;
  end if;
  if not public.st_notification_in_app_enabled(p_user_id, v_category) then
    return null;
  end if;

  v_dedupe := p_event_type || ':' || p_conversation_id::text || ':' || p_user_id::text;

  insert into public.st_notifications (
    user_id, event_type, category, title, body,
    destination_kind, destination_id, team_id, actor_user_id, dedupe_key
  ) values (
    p_user_id,
    p_event_type,
    v_category,
    left(trim(p_title), 180),
    left(coalesce(p_body, ''), 400),
    'conversation',
    p_conversation_id,
    p_team_id,
    p_actor_user_id,
    v_dedupe
  )
  on conflict (user_id, dedupe_key) do update
  set title = excluded.title,
      body = excluded.body,
      event_type = excluded.event_type,
      category = excluded.category,
      destination_kind = excluded.destination_kind,
      destination_id = excluded.destination_id,
      team_id = excluded.team_id,
      actor_user_id = excluded.actor_user_id,
      created_at = clock_timestamp(),
      read_at = null
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.st_notify_conversation_message(p_conversation_id uuid, p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_type text;
  v_sender uuid := auth.uid();
  v_name text;
  v_team_name text;
  v_event text;
  v_preview text;
  v_recipient uuid;
  v_count integer;
  v_title text;
  v_body text;
begin
  if v_sender is null then
    return;
  end if;

  select c.team_id, c.conversation_type
    into v_team, v_type
  from public.st_conversations c
  where c.id = p_conversation_id;

  if v_team is null then
    return;
  end if;

  v_event := case when v_type = 'direct' then 'direct_message' else 'group_message' end;
  v_name := public.st_notification_display_name(v_sender, v_team);
  select t.name into v_team_name from public.st_teams t where t.id = v_team;
  select left(m.body, 120) into v_preview
  from public.st_messages m
  where m.id = p_message_id and m.deleted_at is null;

  for v_recipient in
    select m.user_id
    from public.st_team_members m
    where m.team_id = v_team
      and m.status = 'active'
      and m.user_id <> v_sender
  loop
    if v_type = 'direct' and not exists (
      select 1
      from public.st_conversation_members cm
      where cm.conversation_id = p_conversation_id
        and cm.user_id = v_recipient
        and cm.left_at is null
    ) then
      continue;
    end if;

    if not public.st_chat_user_can_read(v_recipient, p_conversation_id) then
      continue;
    end if;

    select count(*)::integer into v_count
    from public.st_messages msg
    left join public.st_conversation_members mine
      on mine.conversation_id = msg.conversation_id
     and mine.user_id = v_recipient
    where msg.conversation_id = p_conversation_id
      and msg.deleted_at is null
      and msg.sender_user_id is distinct from v_recipient
      and msg.created_at > coalesce(mine.last_read_at, '-infinity'::timestamptz);

    if v_type = 'direct' then
      v_title := v_name;
      v_body := case
        when v_count > 1 then v_name || ' sent you ' || v_count || ' new messages.'
        else coalesce(v_preview, 'New message')
      end;
    else
      v_title := coalesce(nullif(trim(v_team_name), ''), 'Group');
      v_body := case
        when v_count > 1 then v_count || ' new messages'
        else v_name || ': ' || coalesce(v_preview, 'New message')
      end;
    end if;

    perform public.st_upsert_conversation_notification(
      v_recipient, v_event, p_conversation_id, v_team, v_sender, v_title, v_body
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------

create or replace function public.st_ensure_group_conversation(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_role := public.st_chat_member_role(p_team_id, auth.uid());
  if v_role is null then
    raise exception 'Not authorized';
  end if;

  if v_role = 'member' and not exists (
    select 1
    from public.st_teams t
    where t.id = p_team_id
      and t.members_can_use_group_chat
  ) then
    raise exception 'Not authorized';
  end if;

  begin
    insert into public.st_conversations (team_id, conversation_type, participant_key, created_by)
    values (p_team_id, 'group', 'group', auth.uid())
    on conflict on constraint st_conversations_team_participant_key do nothing;
  exception
    when unique_violation then
      null;
  end;

  select c.id into v_id
  from public.st_conversations c
  where c.team_id = p_team_id
    and c.conversation_type = 'group'
  limit 1;

  if v_id is null then
    raise exception 'Not authorized';
  end if;

  insert into public.st_conversation_members (conversation_id, user_id)
  values (v_id, auth.uid())
  on conflict (conversation_id, user_id) do update
    set left_at = null;

  return v_id;
end;
$$;

create or replace function public.st_open_direct_conversation(p_team_id uuid, p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_id uuid;
  v_low text;
  v_high text;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if p_other_user_id is null or p_other_user_id = auth.uid() then
    raise exception 'Not authorized';
  end if;
  if public.st_chat_member_role(p_team_id, auth.uid()) is null
     or public.st_chat_member_role(p_team_id, p_other_user_id) is null then
    raise exception 'Not authorized';
  end if;

  if auth.uid()::text < p_other_user_id::text then
    v_low := auth.uid()::text;
    v_high := p_other_user_id::text;
  else
    v_low := p_other_user_id::text;
    v_high := auth.uid()::text;
  end if;
  v_key := v_low || ':' || v_high;

  select c.id into v_id
  from public.st_conversations c
  where c.team_id = p_team_id
    and c.conversation_type = 'direct'
    and c.participant_key = v_key;

  if v_id is null then
    if not public.st_chat_can_start_direct(p_team_id, auth.uid(), p_other_user_id) then
      raise exception 'Not authorized';
    end if;
    begin
      insert into public.st_conversations (team_id, conversation_type, participant_key, created_by)
      values (p_team_id, 'direct', v_key, auth.uid())
      on conflict on constraint st_conversations_team_participant_key do nothing;
    exception
      when unique_violation then
        null;
    end;
    select c.id into v_id
    from public.st_conversations c
    where c.team_id = p_team_id
      and c.participant_key = v_key;
  end if;

  if v_id is null or not public.st_chat_user_can_read(auth.uid(), v_id) then
    -- The caller is not a participant yet on a brand-new row. Membership is added next
    -- only for this authorized pair. Re-check after the membership write.
    if v_id is null then
      raise exception 'Not authorized';
    end if;
  end if;

  insert into public.st_conversation_members (conversation_id, user_id)
  values (v_id, auth.uid()), (v_id, p_other_user_id)
  on conflict (conversation_id, user_id) do update
    set left_at = null;

  if not public.st_chat_user_can_read(auth.uid(), v_id) then
    raise exception 'Not authorized';
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Messages. sender_user_id is always auth.uid().
-- ---------------------------------------------------------------------------

create or replace function public.st_send_message(p_conversation_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
  v_id uuid;
  v_created timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.st_chat_user_can_send(auth.uid(), p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'Message is empty';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Message is too long';
  end if;

  insert into public.st_messages (conversation_id, sender_user_id, body)
  values (p_conversation_id, auth.uid(), v_body)
  returning id, created_at into v_id, v_created;

  insert into public.st_conversation_members (conversation_id, user_id, last_read_at)
  values (p_conversation_id, auth.uid(), clock_timestamp())
  on conflict (conversation_id, user_id) do update
    set last_read_at = clock_timestamp(),
        left_at = null;

  begin
    perform public.st_notify_conversation_message(p_conversation_id, v_id);
  exception
    when others then
      null;
  end;

  return jsonb_build_object(
    'id', v_id,
    'conversation_id', p_conversation_id,
    'sender_user_id', auth.uid(),
    'body', v_body,
    'created_at', v_created,
    'edited_at', null,
    'deleted_at', null
  );
end;
$$;

create or replace function public.st_edit_message(p_message_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
  v_conversation uuid;
  v_sender uuid;
  v_row public.st_messages;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'Message is empty';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Message is too long';
  end if;

  select m.conversation_id, m.sender_user_id
    into v_conversation, v_sender
  from public.st_messages m
  where m.id = p_message_id
    and m.deleted_at is null;

  if v_conversation is null
     or v_sender is distinct from auth.uid()
     or not public.st_chat_user_can_read(auth.uid(), v_conversation) then
    raise exception 'Not authorized';
  end if;

  update public.st_messages
  set body = v_body,
      edited_at = clock_timestamp()
  where id = p_message_id
    and sender_user_id = auth.uid()
    and deleted_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Not authorized';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'conversation_id', v_row.conversation_id,
    'sender_user_id', v_row.sender_user_id,
    'body', v_row.body,
    'created_at', v_row.created_at,
    'edited_at', v_row.edited_at,
    'deleted_at', v_row.deleted_at
  );
end;
$$;

create or replace function public.st_delete_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation uuid;
  v_sender uuid;
  v_row public.st_messages;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  select m.conversation_id, m.sender_user_id
    into v_conversation, v_sender
  from public.st_messages m
  where m.id = p_message_id;

  if v_conversation is null
     or v_sender is distinct from auth.uid()
     or not public.st_chat_user_can_read(auth.uid(), v_conversation) then
    raise exception 'Not authorized';
  end if;

  update public.st_messages
  set body = '',
      deleted_at = coalesce(deleted_at, clock_timestamp())
  where id = p_message_id
    and sender_user_id = auth.uid()
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Not authorized';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'conversation_id', v_row.conversation_id,
    'sender_user_id', v_row.sender_user_id,
    'body', '',
    'created_at', v_row.created_at,
    'edited_at', v_row.edited_at,
    'deleted_at', v_row.deleted_at
  );
end;
$$;

create or replace function public.st_list_messages(
  p_conversation_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.st_chat_user_can_read(auth.uid(), p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 50);

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb)
    into v_rows
  from (
    select m.id, m.conversation_id, m.sender_user_id, m.body, m.created_at, m.edited_at, m.deleted_at
    from public.st_messages m
    where m.conversation_id = p_conversation_id
      and (
        p_before_created_at is null
        or (
          p_before_id is not null
          and (m.created_at, m.id) < (p_before_created_at, p_before_id)
        )
        or (
          p_before_id is null
          and m.created_at < p_before_created_at
        )
      )
    order by m.created_at desc, m.id desc
    limit v_limit
  ) q;

  return v_rows;
end;
$$;

create or replace function public.st_mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if not public.st_chat_user_can_read(auth.uid(), p_conversation_id) then
    raise exception 'Not authorized';
  end if;

  insert into public.st_conversation_members (conversation_id, user_id, last_read_at)
  values (p_conversation_id, auth.uid(), clock_timestamp())
  on conflict (conversation_id, user_id) do update
    set last_read_at = clock_timestamp(),
        left_at = null;

  update public.st_notifications n
  set read_at = clock_timestamp()
  where n.user_id = auth.uid()
    and n.read_at is null
    and n.destination_kind = 'conversation'
    and n.destination_id = p_conversation_id
    and n.event_type in ('group_message', 'direct_message');
end;
$$;

create or replace function public.st_conversation_unread_count(p_conversation_id uuid, p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.st_messages msg
  left join public.st_conversation_members mine
    on mine.conversation_id = msg.conversation_id
   and mine.user_id = p_user_id
  where msg.conversation_id = p_conversation_id
    and msg.deleted_at is null
    and msg.sender_user_id is distinct from p_user_id
    and msg.created_at > coalesce(mine.last_read_at, '-infinity'::timestamptz);
$$;

create or replace function public.st_list_group_conversations(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  v_role := public.st_chat_member_role(p_team_id, auth.uid());
  if v_role is null then
    raise exception 'Not authorized';
  end if;

  if v_role in ('owner', 'manager') or exists (
    select 1
    from public.st_teams t
    where t.id = p_team_id
      and t.members_can_use_group_chat
  ) then
    perform public.st_ensure_group_conversation(p_team_id);
  end if;

  select coalesce(
    jsonb_agg(listed.item order by listed.sort_group, listed.last_message_at desc nulls last),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      jsonb_build_object(
        'id', c.id,
        'conversation_type', c.conversation_type,
        'other_user_id', other_m.user_id,
        'other_name', case
          when c.conversation_type = 'group' then t.name
          else public.st_notification_display_name(other_m.user_id, c.team_id)
        end,
        'preview', case
          when last_msg.id is null then ''
          when last_msg.deleted_at is not null then 'Message deleted'
          else left(coalesce(last_msg.body, ''), 120)
        end,
        'last_message_at', last_msg.created_at,
        'unread_count', public.st_conversation_unread_count(c.id, auth.uid()),
        'can_send', public.st_chat_user_can_send(auth.uid(), c.id)
      ) as item,
      case when c.conversation_type = 'group' then 0 else 1 end as sort_group,
      last_msg.created_at as last_message_at
    from public.st_conversations c
    join public.st_teams t on t.id = c.team_id
    left join lateral (
      select cm.user_id
      from public.st_conversation_members cm
      where cm.conversation_id = c.id
        and cm.user_id <> auth.uid()
        and cm.left_at is null
      limit 1
    ) other_m on true
    left join lateral (
      select m.id, m.body, m.created_at, m.deleted_at
      from public.st_messages m
      where m.conversation_id = c.id
      order by m.created_at desc, m.id desc
      limit 1
    ) last_msg on true
    where c.team_id = p_team_id
      and public.st_chat_user_can_read(auth.uid(), c.id)
  ) listed;

  return v_rows;
end;
$$;

create or replace function public.st_group_unread_conversation_count(p_team_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or public.st_chat_member_role(p_team_id, auth.uid()) is null then
    return 0;
  end if;

  select count(*)::integer into v_count
  from public.st_conversations c
  where c.team_id = p_team_id
    and public.st_chat_user_can_read(auth.uid(), c.id)
    and public.st_conversation_unread_count(c.id, auth.uid()) > 0;

  return coalesce(v_count, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS. Clients can read authorized rows for Realtime. Writes go through RPCs.
-- ---------------------------------------------------------------------------

alter table public.st_conversations enable row level security;
alter table public.st_conversation_members enable row level security;
alter table public.st_messages enable row level security;

drop policy if exists conversations_select_authorized on public.st_conversations;
create policy conversations_select_authorized on public.st_conversations
  for select to authenticated
  using (public.st_user_can_read_conversation(id));

drop policy if exists conversation_members_select_own on public.st_conversation_members;
create policy conversation_members_select_own on public.st_conversation_members
  for select to authenticated
  using (
    user_id = auth.uid()
    and public.st_user_can_read_conversation(conversation_id)
  );

drop policy if exists messages_select_authorized on public.st_messages;
create policy messages_select_authorized on public.st_messages
  for select to authenticated
  using (public.st_user_can_read_conversation(conversation_id));

revoke all on table public.st_conversations from public, anon, authenticated;
revoke all on table public.st_conversation_members from public, anon, authenticated;
revoke all on table public.st_messages from public, anon, authenticated;
grant select on table public.st_conversations to authenticated;
grant select on table public.st_conversation_members to authenticated;
grant select on table public.st_messages to authenticated;

revoke all on function public.st_chat_member_role(uuid, uuid) from public, anon, authenticated;
revoke all on function public.st_chat_user_can_read(uuid, uuid) from public, anon, authenticated;
revoke all on function public.st_chat_user_can_send(uuid, uuid) from public, anon, authenticated;
revoke all on function public.st_chat_can_start_direct(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.st_user_can_read_conversation(uuid) from public, anon;
grant execute on function public.st_user_can_read_conversation(uuid) to authenticated;
revoke all on function public.st_upsert_conversation_notification(uuid, text, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.st_notify_conversation_message(uuid, uuid) from public, anon, authenticated;
revoke all on function public.st_conversation_unread_count(uuid, uuid) from public, anon, authenticated;

grant execute on function public.st_ensure_group_conversation(uuid) to authenticated;
grant execute on function public.st_open_direct_conversation(uuid, uuid) to authenticated;
grant execute on function public.st_send_message(uuid, text) to authenticated;
grant execute on function public.st_edit_message(uuid, text) to authenticated;
grant execute on function public.st_delete_message(uuid) to authenticated;
grant execute on function public.st_list_messages(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.st_mark_conversation_read(uuid) to authenticated;
grant execute on function public.st_list_group_conversations(uuid) to authenticated;
grant execute on function public.st_group_unread_conversation_count(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.st_messages;
exception
  when duplicate_object then
    null;
  when undefined_object then
    null;
end $$;
