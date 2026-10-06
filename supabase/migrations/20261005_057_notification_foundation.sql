-- BIQ-0243: Notification foundation.
-- One private notification per user. This is not a group activity feed and not chat.
-- Chat unread state stays on future conversation membership, not on st_notifications.
-- Apply manually after 056. Do not apply from the app.

-- ---------------------------------------------------------------------------
-- Preferences. Categories, not raw event names.
-- In-app defaults on. Email defaults off. Push is not a column yet.
-- ---------------------------------------------------------------------------

create table if not exists public.st_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages_in_app boolean not null default true,
  training_assignments_in_app boolean not null default true,
  program_updates_in_app boolean not null default true,
  group_activity_in_app boolean not null default true,
  reminders_in_app boolean not null default true,
  messages_email boolean not null default false,
  training_assignments_email boolean not null default false,
  program_updates_email boolean not null default false,
  group_activity_email boolean not null default false,
  reminders_email boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.st_notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_own" on public.st_notification_preferences;
create policy "notification_preferences_select_own" on public.st_notification_preferences
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_preferences_insert_own" on public.st_notification_preferences;
create policy "notification_preferences_insert_own" on public.st_notification_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_preferences_update_own" on public.st_notification_preferences;
create policy "notification_preferences_update_own" on public.st_notification_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notifications. Title and body are the short message.
-- destination_* points at the entity. Workout and program bodies are not copied here.
-- ---------------------------------------------------------------------------

create table if not exists public.st_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'group_invitation',
    'group_invitation_accepted',
    'program_assigned',
    'program_updated',
    'workout_assigned',
    'group_message',
    'direct_message'
  )),
  category text not null check (category in (
    'messages',
    'training_assignments',
    'program_updates',
    'group_activity',
    'reminders'
  )),
  title text not null,
  body text not null,
  destination_kind text check (destination_kind is null or destination_kind in (
    'group', 'member', 'conversation', 'program', 'workout', 'progress', 'invitation'
  )),
  destination_id uuid,
  team_id uuid references public.st_teams(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create unique index if not exists st_notifications_dedupe_uidx
  on public.st_notifications (user_id, dedupe_key);

create index if not exists st_notifications_user_created_idx
  on public.st_notifications (user_id, created_at desc);

create index if not exists st_notifications_unread_user_idx
  on public.st_notifications (user_id, created_at desc)
  where read_at is null;

comment on table public.st_notifications is
  'Private per-user alerts. Not the group activity feed and not chat unread state.';

alter table public.st_notifications enable row level security;

drop policy if exists "notifications_select_own" on public.st_notifications;
create policy "notifications_select_own" on public.st_notifications
  for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.st_notifications from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Publish. Server-side only. Honors the in-app preference. Email is not sent here.
-- ---------------------------------------------------------------------------

create or replace function public.st_notification_category(p_event_type text)
returns text
language sql
immutable
as $$
  select case p_event_type
    when 'group_message' then 'messages'
    when 'direct_message' then 'messages'
    when 'workout_assigned' then 'training_assignments'
    when 'program_assigned' then 'training_assignments'
    when 'program_updated' then 'program_updates'
    when 'group_invitation' then 'group_activity'
    when 'group_invitation_accepted' then 'group_activity'
    else null
  end;
$$;

revoke all on function public.st_notification_category(text) from public, anon, authenticated;

create or replace function public.st_notification_in_app_enabled(p_user_id uuid, p_category text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pref public.st_notification_preferences%rowtype;
begin
  if p_user_id is null or p_category is null then
    return false;
  end if;
  select * into v_pref from public.st_notification_preferences where user_id = p_user_id;
  if not found then
    return true;
  end if;
  if p_category = 'messages' then return v_pref.messages_in_app; end if;
  if p_category = 'training_assignments' then return v_pref.training_assignments_in_app; end if;
  if p_category = 'program_updates' then return v_pref.program_updates_in_app; end if;
  if p_category = 'group_activity' then return v_pref.group_activity_in_app; end if;
  if p_category = 'reminders' then return v_pref.reminders_in_app; end if;
  return false;
end;
$$;

revoke all on function public.st_notification_in_app_enabled(uuid, text) from public, anon, authenticated;

create or replace function public.st_notification_display_name(p_user_id uuid, p_team_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if p_user_id is null then
    return 'Someone';
  end if;
  select nullif(trim(m.display_name), '') into v_name
  from public.st_team_members m
  where m.user_id = p_user_id and m.team_id = p_team_id
  limit 1;
  if v_name is not null then
    return v_name;
  end if;
  select nullif(trim(p.display_name), '') into v_name
  from public.st_profiles p
  where p.user_id = p_user_id;
  return coalesce(v_name, 'Someone');
end;
$$;

revoke all on function public.st_notification_display_name(uuid, uuid) from public, anon, authenticated;

create or replace function public.st_publish_notification(
  p_user_id uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_destination_kind text,
  p_destination_id uuid,
  p_team_id uuid,
  p_dedupe_key text,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_id uuid;
begin
  if p_user_id is null or coalesce(trim(p_title), '') = '' then
    return null;
  end if;
  v_category := public.st_notification_category(p_event_type);
  if v_category is null then
    return null;
  end if;
  if not public.st_notification_in_app_enabled(p_user_id, v_category) then
    return null;
  end if;

  insert into public.st_notifications (
    user_id, event_type, category, title, body,
    destination_kind, destination_id, team_id, actor_user_id, dedupe_key
  ) values (
    p_user_id, p_event_type, v_category, left(trim(p_title), 180), left(coalesce(p_body, ''), 400),
    p_destination_kind, p_destination_id, p_team_id, p_actor_user_id, nullif(trim(p_dedupe_key), '')
  )
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.st_publish_notification(uuid, text, text, text, text, uuid, uuid, text, uuid) from public, anon, authenticated;

create or replace function public.st_mark_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_id is null then
    return;
  end if;
  update public.st_notifications
  set read_at = coalesce(read_at, now())
  where id = p_id
    and user_id = auth.uid();
end;
$$;

revoke all on function public.st_mark_notification_read(uuid) from public;
grant execute on function public.st_mark_notification_read(uuid) to authenticated;

create or replace function public.st_mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.st_notifications
  set read_at = coalesce(read_at, now())
  where user_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.st_mark_all_notifications_read() from public;
grant execute on function public.st_mark_all_notifications_read() to authenticated;

-- ---------------------------------------------------------------------------
-- Group invitations. No account means no in-app row. The invitation email stays separate.
-- ---------------------------------------------------------------------------

create or replace function public.st_notify_group_invite_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_team_name text;
  v_actor text;
  v_role text;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.token_hash is not distinct from old.token_hash then
    return new;
  end if;

  select t.name into v_team_name from public.st_teams t where t.id = new.team_id;

  if new.status = 'pending' and new.token_hash is not null then
    select u.id into v_user
    from auth.users u
    where lower(u.email) = new.email
    limit 1;
    if v_user is null or v_user = new.invited_by then
      return new;
    end if;
    v_actor := public.st_notification_display_name(new.invited_by, new.team_id);
    v_role := case when new.role = 'manager' then 'Manager' else 'Member' end;
    perform public.st_publish_notification(
      v_user,
      'group_invitation',
      v_actor || ' invited you to ' || coalesce(v_team_name, 'a group'),
      'You would join as a ' || v_role || '.',
      'invitation',
      new.id,
      new.team_id,
      'group_invitation:' || new.id::text || ':' || new.token_hash,
      new.invited_by
    );
  elsif new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    if new.invited_by is null or new.invited_by = new.accepted_by_user_id then
      return new;
    end if;
    v_actor := public.st_notification_display_name(new.accepted_by_user_id, new.team_id);
    perform public.st_publish_notification(
      new.invited_by,
      'group_invitation_accepted',
      v_actor || ' joined ' || coalesce(v_team_name, 'your group'),
      'They accepted your invitation.',
      'group',
      new.team_id,
      new.team_id,
      'group_invitation_accepted:' || new.id::text,
      new.accepted_by_user_id
    );
  end if;
  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists st_notify_group_invite_change on public.st_group_invites;
create trigger st_notify_group_invite_change
  after insert or update on public.st_group_invites
  for each row execute function public.st_notify_group_invite_change();

-- ---------------------------------------------------------------------------
-- One notification per program assignment, and one per workout recipient.
-- Not one per exercise or set.
-- ---------------------------------------------------------------------------

create or replace function public.st_notify_program_assignment(
  p_assignment_id uuid,
  p_team_id uuid,
  p_member_user_id uuid,
  p_program_id uuid,
  p_assignment_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program text;
  v_team text;
  v_actor text;
begin
  if p_assignment_id is null or p_program_id is null then
    return;
  end if;
  if p_assignment_type not in ('team', 'individual_team', 'manual') then
    return;
  end if;
  if p_member_user_id is null or p_member_user_id = auth.uid() then
    return;
  end if;
  select pr.name into v_program from public.st_programs pr where pr.id = p_program_id;
  select t.name into v_team from public.st_teams t where t.id = p_team_id;
  v_actor := public.st_notification_display_name(auth.uid(), p_team_id);
  perform public.st_publish_notification(
    p_member_user_id,
    'program_assigned',
    coalesce(v_program, 'A program') || ' was assigned to you',
    v_actor || ' assigned this program in ' || coalesce(v_team, 'your group') || '.',
    'program',
    p_program_id,
    p_team_id,
    'program_assigned:' || p_assignment_id::text,
    auth.uid()
  );
exception
  when others then
    return;
end;
$$;

revoke all on function public.st_notify_program_assignment(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

create or replace function public.st_notify_workout_recipient(
  p_assignment_id uuid,
  p_team_id uuid,
  p_recipient uuid,
  p_label text,
  p_workout_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_label text;
begin
  if p_assignment_id is null or p_recipient is null or p_recipient = auth.uid() then
    return;
  end if;
  v_label := coalesce(nullif(trim(p_label), ''), 'A workout');
  v_actor := public.st_notification_display_name(auth.uid(), p_team_id);
  perform public.st_publish_notification(
    p_recipient,
    'workout_assigned',
    v_label,
    v_actor || ' assigned you ' || v_label || '.',
    'workout',
    coalesce(p_workout_id, p_assignment_id),
    p_team_id,
    'workout_assigned:' || p_assignment_id::text || ':' || p_recipient::text,
    auth.uid()
  );
exception
  when others then
    return;
end;
$$;

revoke all on function public.st_notify_workout_recipient(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;

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
declare
  v_assignment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
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
    where team_id = p_team_id and user_id = p_member_user_id and status = 'active'
  ) then
    raise exception 'Member not found';
  end if;

  update public.st_program_assignments
  set is_active = false
  where user_id = p_member_user_id and team_id = p_team_id and is_active = true;

  insert into public.st_program_assignments (
    user_id, team_id, assigned_by, assignment_type, program_id, notes, is_active, target_type, coaching_metadata
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
  )
  returning id into v_assignment_id;

  update public.st_team_members
  set training_source = case when p_assignment_type = 'personal' then 'personal' else 'team' end
  where team_id = p_team_id and user_id = p_member_user_id and status = 'active';

  perform public.st_notify_program_assignment(
    v_assignment_id, p_team_id, p_member_user_id, p_program_id, p_assignment_type
  );
end;
$$;

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
  v_label text;
  v_day text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
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
    team_id, assigned_by, workout_id, program_id, workout_date, target_type,
    target_classification_id, scheduled_date, due_date, title, notes, coaching_metadata
  ) values (
    p_team_id, auth.uid(), p_workout_id, p_program_id, p_workout_date, p_target_type,
    p_target_classification_id, coalesce(p_scheduled_date, current_date), p_due_date,
    p_title, p_notes, coalesce(p_coaching_metadata, '{}'::jsonb)
  )
  returning id into v_assignment_id;

  select w.day_label into v_day from public.st_workouts w where w.id = p_workout_id;
  v_label := coalesce(nullif(trim(p_title), ''), nullif(trim(v_day), ''), 'A workout');

  if p_target_type = 'group' then
    for v_recipient in
      select tm.user_id from public.st_team_members tm
      where tm.team_id = p_team_id and tm.status = 'active' and tm.is_active_participant = true
    loop
      insert into public.st_assignment_recipients (assignment_id, user_id)
      values (v_assignment_id, v_recipient)
      on conflict (assignment_id, user_id) do nothing;
      perform public.st_notify_workout_recipient(v_assignment_id, p_team_id, v_recipient, v_label, p_workout_id);
    end loop;
  elsif p_target_type = 'classification' then
    for v_recipient in
      select distinct tm.user_id
      from public.st_team_members tm
      join public.st_group_member_classifications gmc on gmc.member_id = tm.id
      where tm.team_id = p_team_id and tm.status = 'active' and tm.is_active_participant = true
        and gmc.classification_id = p_target_classification_id
    loop
      insert into public.st_assignment_recipients (assignment_id, user_id)
      values (v_assignment_id, v_recipient)
      on conflict (assignment_id, user_id) do nothing;
      perform public.st_notify_workout_recipient(v_assignment_id, p_team_id, v_recipient, v_label, p_workout_id);
    end loop;
  else
    foreach v_uid in array p_target_user_ids loop
      if exists (
        select 1 from public.st_team_members tm
        where tm.team_id = p_team_id and tm.user_id = v_uid and tm.status = 'active'
      ) then
        insert into public.st_assignment_recipients (assignment_id, user_id)
        values (v_assignment_id, v_uid)
        on conflict (assignment_id, user_id) do nothing;
        perform public.st_notify_workout_recipient(v_assignment_id, p_team_id, v_uid, v_label, p_workout_id);
      end if;
    end loop;
  end if;

  return v_assignment_id;
end;
$$;
