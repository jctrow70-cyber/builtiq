-- BIQ-0238: Group architecture phase 1
-- One authoritative owner, manager-capable group default, collaboration flags,
-- and participation enrollments beside followed_program_id.
-- Enrollments are not the Training calendar. Phase 2 chooses which group
-- slots become visible. Does not drop tables or delete workout history.

-- ---------------------------------------------------------------------------
-- 1. Collaboration flags. Default false keeps today's member behavior.
-- ---------------------------------------------------------------------------

alter table public.st_teams
  add column if not exists members_can_create_shared_workouts boolean not null default false,
  add column if not exists members_can_edit_shared_workouts boolean not null default false,
  add column if not exists members_can_assign_workouts boolean not null default false,
  add column if not exists members_can_view_member_progress boolean not null default false;

comment on column public.st_teams.default_program_id is
  'GROUP DEFAULT PROGRAM. What this group is generally training on. Does not replace a personal program or another group enrollment.';
comment on column public.st_teams.members_can_create_shared_workouts is
  'When true, members may create shared group programs. Default false.';
comment on column public.st_teams.members_can_edit_shared_workouts is
  'When true, members may edit the live shared template. Default false. Training edits still fork to a personal copy.';
comment on column public.st_teams.members_can_assign_workouts is
  'When true, members may assign programs and workouts, including the group default. Default false.';
comment on column public.st_teams.members_can_view_member_progress is
  'When true, members may read other members'' group-scoped training logs. Default false. Does not expose body measurements.';
comment on column public.st_teams.owner_user_id is
  'Authoritative group owner. Membership role owner must match this user. Change only through st_transfer_group_ownership.';

-- ---------------------------------------------------------------------------
-- 2. Exactly one owner membership, matching owner_user_id
-- ---------------------------------------------------------------------------

insert into public.st_team_members (team_id, user_id, role, status)
select t.id, t.owner_user_id, 'owner', 'active'
from public.st_teams t
where t.owner_user_id is not null
  and coalesce(t.is_archived, false) = false
  and not exists (
    select 1 from public.st_team_members m
    where m.team_id = t.id and m.user_id = t.owner_user_id
  );

update public.st_team_members m
set role = 'owner'
from public.st_teams t
where m.team_id = t.id
  and m.user_id = t.owner_user_id
  and m.status = 'active'
  and m.role is distinct from 'owner';

update public.st_team_members m
set role = 'manager'
from public.st_teams t
where m.team_id = t.id
  and m.role = 'owner'
  and t.owner_user_id is distinct from m.user_id;

-- Invites cannot create a second owner. Join still applies manager or member.
do $$
begin
  if to_regclass('public.st_group_invites') is not null then
    update public.st_group_invites set role = 'manager' where role = 'owner';
    alter table public.st_group_invites drop constraint if exists st_group_invites_role_check;
    alter table public.st_group_invites
      add constraint st_group_invites_role_check check (role in ('manager', 'member'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Guards. Normal role edits cannot mint a second owner.
--    Ownership transfer is the only path that changes owner_user_id.
-- ---------------------------------------------------------------------------

create or replace function public.st_guard_group_owner_user()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id
     and coalesce(current_setting('biq.group_owner_transfer', true), '') is distinct from '1' then
    raise exception 'Use st_transfer_group_ownership to change the group owner';
  end if;
  return new;
end;
$$;

drop trigger if exists st_teams_guard_owner on public.st_teams;
create trigger st_teams_guard_owner
  before update of owner_user_id on public.st_teams
  for each row execute function public.st_guard_group_owner_user();

create or replace function public.st_guard_group_membership_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if coalesce(current_setting('biq.group_owner_transfer', true), '') = '1' then
    return new;
  end if;

  select owner_user_id into v_owner
  from public.st_teams
  where id = new.team_id;

  if new.user_id is not distinct from v_owner then
    if new.role is distinct from 'owner' then
      raise exception 'The group owner role cannot be changed except by ownership transfer';
    end if;
  elsif new.role = 'owner' then
    raise exception 'Only the group owner can hold the owner role. Use ownership transfer';
  end if;

  return new;
end;
$$;

drop trigger if exists st_team_members_guard_owner on public.st_team_members;
create trigger st_team_members_guard_owner
  before insert or update of role on public.st_team_members
  for each row execute function public.st_guard_group_membership_owner();

create or replace function public.st_transfer_group_ownership(
  p_team_id uuid,
  p_new_owner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_is_team_owner(p_team_id) then
    raise exception 'Only the group owner can transfer ownership';
  end if;
  if p_new_owner_user_id is null or p_new_owner_user_id = auth.uid() then
    raise exception 'Choose another active member';
  end if;
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = p_new_owner_user_id and status = 'active'
  ) then
    raise exception 'New owner must be an active member';
  end if;

  select owner_user_id into v_previous from public.st_teams where id = p_team_id;
  perform set_config('biq.group_owner_transfer', '1', true);

  update public.st_teams
  set owner_user_id = p_new_owner_user_id
  where id = p_team_id;

  update public.st_team_members
  set role = 'manager'
  where team_id = p_team_id and user_id = v_previous and status = 'active';

  update public.st_team_members
  set role = 'owner'
  where team_id = p_team_id and user_id = p_new_owner_user_id and status = 'active';
end;
$$;

revoke all on function public.st_transfer_group_ownership(uuid, uuid) from public;
grant execute on function public.st_transfer_group_ownership(uuid, uuid) to authenticated;

comment on function public.st_transfer_group_ownership(uuid, uuid) is
  'Explicit ownership transfer. No Groups UI calls this in phase 1.';

create or replace function public.st_set_member_role(
  p_member_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.st_team_members%rowtype;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_member from public.st_team_members where id = p_member_id;
  if not found then
    raise exception 'Member not found';
  end if;
  if not public.st_user_is_team_owner(v_member.team_id) then
    raise exception 'Only the group owner can change roles';
  end if;

  v_role := case when lower(coalesce(p_role, '')) = 'editor' then 'manager' else lower(coalesce(p_role, '')) end;
  if v_role not in ('manager', 'member') then
    raise exception 'Role must be manager or member. Ownership changes use st_transfer_group_ownership';
  end if;
  if v_member.user_id = (select owner_user_id from public.st_teams where id = v_member.team_id) then
    raise exception 'The group owner role cannot be changed here';
  end if;

  update public.st_team_members
  set role = v_role
  where id = p_member_id;
end;
$$;

revoke all on function public.st_set_member_role(uuid, text) from public;
grant execute on function public.st_set_member_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Permission helpers
-- ---------------------------------------------------------------------------

create or replace function public.st_member_has_group_flag(
  p_team_id uuid,
  p_flag text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_team_members m
    join public.st_teams t on t.id = m.team_id
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'member'
      and (
        (p_flag = 'create' and coalesce(t.members_can_create_shared_workouts, false))
        or (p_flag = 'edit' and coalesce(t.members_can_edit_shared_workouts, false))
        or (p_flag = 'assign' and coalesce(t.members_can_assign_workouts, false))
        or (p_flag = 'progress' and coalesce(t.members_can_view_member_progress, false))
      )
  );
$$;

create or replace function public.st_user_can_edit_shared_program(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_team_id is not null
    and (
      public.st_user_can_edit_team(p_team_id)
      or public.st_member_has_group_flag(p_team_id, 'edit')
    );
$$;

create or replace function public.st_user_can_create_shared_program(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_team_id is not null
    and (
      public.st_user_can_edit_team(p_team_id)
      or public.st_member_has_group_flag(p_team_id, 'create')
    );
$$;

create or replace function public.st_user_can_assign_in_group(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_team_id is not null
    and (
      public.st_user_can_edit_team(p_team_id)
      or public.st_member_has_group_flag(p_team_id, 'assign')
    );
$$;

create or replace function public.st_user_can_view_group_progress(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_team_id is not null
    and (
      public.st_user_can_edit_team(p_team_id)
      or public.st_member_has_group_flag(p_team_id, 'progress')
    );
$$;

create or replace function public.st_user_can_edit_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_programs p
    where p.id = p_program_id
      and (
        (p.visibility = 'personal' and p.owner_user_id = auth.uid())
        or (p.visibility = 'team' and public.st_user_can_edit_shared_program(p.team_id))
      )
  );
$$;

comment on function public.st_user_can_edit_program(uuid) is
  'Edit Shared. Personal: owner. Group template: owner, manager, or a member whose group allows shared edits. Customize-for-me writes a new personal program instead.';

drop policy if exists "programs_insert" on public.st_programs;
create policy "programs_insert" on public.st_programs
  for insert
  with check (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_can_create_shared_program(team_id))
  );

drop policy if exists "programs_update_editor" on public.st_programs;
create policy "programs_update_editor" on public.st_programs
  for update
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_can_edit_shared_program(team_id))
  )
  with check (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_can_edit_shared_program(team_id))
  );

-- Managers (and members only when the assign flag is on) may set the group default.
-- This does not update followed_program_id or personal programs.
create or replace function public.st_set_group_default_program(
  p_team_id uuid,
  p_program_id uuid
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
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;

  if p_program_id is not null and not exists (
    select 1
    from public.st_programs p
    where p.id = p_program_id
      and p.team_id = p_team_id
      and p.visibility = 'team'
      and coalesce(p.status, 'published') <> 'draft'
      and coalesce(p.status, 'published') <> 'archived'
  ) then
    raise exception 'Publish a group program before setting it as the group default';
  end if;

  update public.st_teams
  set default_program_id = p_program_id
  where id = p_team_id;
end;
$$;

revoke all on function public.st_set_group_default_program(uuid, uuid) from public;
grant execute on function public.st_set_group_default_program(uuid, uuid) to authenticated;

-- Assign RPCs follow the same assign permission. Nested training_source updates
-- stay inside this function so they do not require a second owner/manager check.
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
  );

  update public.st_team_members
  set training_source = case when p_assignment_type = 'personal' then 'personal' else 'team' end
  where team_id = p_team_id and user_id = p_member_user_id and status = 'active';
end;
$$;

revoke all on function public.st_assign_member_program(uuid, uuid, text, uuid, text, jsonb) from public;
grant execute on function public.st_assign_member_program(uuid, uuid, text, uuid, text, jsonb) to authenticated;

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

  if p_target_type = 'group' then
    for v_recipient in
      select tm.user_id from public.st_team_members tm
      where tm.team_id = p_team_id and tm.status = 'active' and tm.is_active_participant = true
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
      where tm.team_id = p_team_id and tm.status = 'active' and tm.is_active_participant = true
        and gmc.classification_id = p_target_classification_id
    loop
      insert into public.st_assignment_recipients (assignment_id, user_id)
      values (v_assignment_id, v_recipient)
      on conflict (assignment_id, user_id) do nothing;
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
      end if;
    end loop;
  end if;

  return v_assignment_id;
end;
$$;

revoke all on function public.st_assign_workout_to_targets(
  uuid, uuid, uuid, date, text, uuid, uuid[], date, date, text, text, jsonb
) from public;
grant execute on function public.st_assign_workout_to_targets(
  uuid, uuid, uuid, date, text, uuid, uuid[], date, date, text, text, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Group progress scope. Personal metrics stay private.
-- ---------------------------------------------------------------------------

create or replace function public.st_set_log_in_group(
  p_log_team_id uuid,
  p_planned_set_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (p_log_team_id is not null and p_log_team_id = p_team_id)
    or exists (
      select 1
      from public.st_planned_sets ps
      join public.st_exercises e on e.id = ps.exercise_id
      join public.st_workouts w on w.id = e.workout_id
      join public.st_programs p on p.id = w.program_id
      where ps.id = p_planned_set_id
        and p.team_id = p_team_id
        and p.visibility = 'team'
    );
$$;

create or replace function public.st_group_progress_logs(
  p_team_id uuid,
  p_user_ids uuid[] default null,
  p_from date default null,
  p_to date default null,
  p_limit int default 400
)
returns setof public.st_set_logs
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_is_active_team_member(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if p_user_ids is not null and exists (
    select 1 from unnest(p_user_ids) uid where uid is distinct from auth.uid()
  ) and not public.st_user_can_view_group_progress(p_team_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select sl.*
  from public.st_set_logs sl
  where sl.completed = true
    and (p_user_ids is null or sl.user_id = any (p_user_ids))
    and (p_user_ids is not null or sl.user_id = auth.uid() or public.st_user_can_view_group_progress(p_team_id))
    and (p_from is null or sl.log_date >= p_from)
    and (p_to is null or sl.log_date <= p_to)
    and public.st_set_log_in_group(sl.team_id, sl.planned_set_id, p_team_id)
    and (sl.user_id = auth.uid() or public.st_user_can_view_group_progress(p_team_id))
  order by sl.log_date desc
  limit greatest(1, least(coalesce(p_limit, 400), 2000));
end;
$$;

revoke all on function public.st_group_progress_logs(uuid, uuid[], date, date, int) from public;
grant execute on function public.st_group_progress_logs(uuid, uuid[], date, date, int) to authenticated;

drop policy if exists "set_logs_select" on public.st_set_logs;
create policy "set_logs_select" on public.st_set_logs
  for select
  using (
    user_id = auth.uid()
    or (
      public.st_user_can_coach_read_member_log(user_id)
      and (
        public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
        or coalesce(length(trim(snapshot_exercise_name)), 0) > 0
        or completed = true
        or coalesce(length(trim(actual_weight::text)), 0) > 0
        or coalesce(length(trim(actual_reps::text)), 0) > 0
      )
    )
    or exists (
      select 1
      from public.st_team_members subject
      where subject.user_id = st_set_logs.user_id
        and subject.status = 'active'
        and public.st_user_can_view_group_progress(subject.team_id)
        and public.st_set_log_in_group(st_set_logs.team_id, st_set_logs.planned_set_id, subject.team_id)
    )
  );

comment on policy "set_logs_select" on public.st_set_logs is
  'Own logs; owner/manager teammate logs; group-scoped logs when members_can_view_member_progress is on. Body measurements stay private.';

-- ---------------------------------------------------------------------------
-- 6. Training participation. This is not the Training calendar.
--    The calendar stays on followed_program_id in Phase 1.
--    Phase 2 must choose which backfilled group slots become visible.
--    Provenance is derived: personal fork via source_program_id,
--    else active individual_team/manual assignment, else default_program_id.
-- ---------------------------------------------------------------------------

create table if not exists public.st_training_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null check (source_kind in ('personal', 'group')),
  source_key text not null,
  team_id uuid references public.st_teams(id) on delete cascade,
  program_id uuid references public.st_programs(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_key),
  check (
    (source_kind = 'personal' and team_id is null and source_key = 'personal')
    or (source_kind = 'group' and team_id is not null and source_key = ('group:' || team_id::text))
  )
);

alter table public.st_training_enrollments drop column if exists is_primary;
drop trigger if exists st_training_enrollments_primary on public.st_training_enrollments;
drop function if exists public.st_training_enrollments_one_primary();

comment on table public.st_training_enrollments is
  'Programs a user participates in. One personal slot and one slot per group. Not the Training calendar. Phase 2 decides which backfilled group slots are shown. followed_program_id remains the Phase 1 display pointer.';
comment on column public.st_training_enrollments.program_id is
  'Program this slot participates in. Why: personal fork when the program is a non-archived personal copy of this group; else the active individual assignment; else the group default.';

create index if not exists st_training_enrollments_user_idx
  on public.st_training_enrollments (user_id, status);

create index if not exists st_training_enrollments_team_idx
  on public.st_training_enrollments (team_id)
  where team_id is not null;

create or replace function public.st_training_enrollments_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists st_training_enrollments_touch on public.st_training_enrollments;
create trigger st_training_enrollments_touch
  before insert or update on public.st_training_enrollments
  for each row execute function public.st_training_enrollments_touch();

alter table public.st_training_enrollments enable row level security;

drop policy if exists "training_enrollments_select" on public.st_training_enrollments;
create policy "training_enrollments_select" on public.st_training_enrollments
  for select using (
    user_id = auth.uid()
    or (team_id is not null and public.st_user_can_edit_team(team_id))
  );

drop policy if exists "training_enrollments_insert" on public.st_training_enrollments;
create policy "training_enrollments_insert" on public.st_training_enrollments
  for insert with check (user_id = auth.uid());

drop policy if exists "training_enrollments_update" on public.st_training_enrollments;
create policy "training_enrollments_update" on public.st_training_enrollments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "training_enrollments_delete" on public.st_training_enrollments;
create policy "training_enrollments_delete" on public.st_training_enrollments
  for delete using (user_id = auth.uid());

-- Additive backfill. Does not update followed_program_id.
-- A pure personal follow becomes the personal slot.
-- A team follow becomes that group's slot.
-- A personal fork of a team program becomes that group's slot, not the personal slot.
-- Other memberships use an explicit individual assignment, otherwise the group default.
-- on conflict do nothing so a later group cannot replace the program Training already shows.
-- Phase 2 must decide visibility before rendering these extra group slots.

insert into public.st_training_enrollments (
  user_id, source_kind, source_key, team_id, program_id, status
)
select
  pr.user_id,
  'personal',
  'personal',
  null,
  pr.followed_program_id,
  'active'
from public.st_profiles pr
join public.st_programs prog on prog.id = pr.followed_program_id
where prog.visibility = 'personal'
  and prog.source_program_id is null
on conflict (user_id, source_key) do nothing;

insert into public.st_training_enrollments (
  user_id, source_kind, source_key, team_id, program_id, status
)
select
  pr.user_id,
  'group',
  'group:' || prog.team_id::text,
  prog.team_id,
  pr.followed_program_id,
  'active'
from public.st_profiles pr
join public.st_programs prog on prog.id = pr.followed_program_id
where prog.visibility = 'team'
  and prog.team_id is not null
on conflict (user_id, source_key) do nothing;

insert into public.st_training_enrollments (
  user_id, source_kind, source_key, team_id, program_id, status
)
select
  pr.user_id,
  'group',
  'group:' || src.team_id::text,
  src.team_id,
  pr.followed_program_id,
  'active'
from public.st_profiles pr
join public.st_programs fork on fork.id = pr.followed_program_id
join public.st_programs src on src.id = fork.source_program_id
where fork.visibility = 'personal'
  and fork.source_program_id is not null
  and lower(coalesce(fork.status, '')) <> 'archived'
  and src.visibility = 'team'
  and src.team_id is not null
on conflict (user_id, source_key) do nothing;

insert into public.st_training_enrollments (
  user_id, source_kind, source_key, team_id, program_id, status
)
select
  m.user_id,
  'group',
  'group:' || m.team_id::text,
  m.team_id,
  coalesce(asg.program_id, t.default_program_id),
  'active'
from public.st_team_members m
join public.st_teams t on t.id = m.team_id
left join lateral (
  select a.program_id
  from public.st_program_assignments a
  where a.user_id = m.user_id
    and a.team_id = m.team_id
    and a.is_active = true
    and a.assignment_type in ('individual_team', 'manual')
    and a.program_id is not null
  order by a.created_at desc
  limit 1
) asg on true
where m.status = 'active'
  and coalesce(t.is_archived, false) = false
  and coalesce(asg.program_id, t.default_program_id) is not null
on conflict (user_id, source_key) do nothing;

-- Leaving a group ends only that group's participation slot.
create or replace function public.st_leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role
  from public.st_team_members
  where team_id = p_team_id
    and user_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'You are not an active member of this group';
  end if;

  if v_role = 'owner' then
    raise exception 'Owners cannot leave — transfer ownership or delete the group';
  end if;

  update public.st_team_members
  set status = 'removed'
  where team_id = p_team_id
    and user_id = auth.uid()
    and status = 'active';

  update public.st_training_enrollments
  set status = 'ended',
      updated_at = now()
  where user_id = auth.uid()
    and source_key = 'group:' || p_team_id::text;
end;
$$;

revoke all on function public.st_leave_team(uuid) from public;
grant execute on function public.st_leave_team(uuid) to authenticated;

create or replace function public.st_delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.st_user_is_team_owner(p_team_id) then
    raise exception 'Only the group owner can delete the group';
  end if;

  update public.st_team_members
  set status = 'removed'
  where team_id = p_team_id
    and status = 'active';

  update public.st_training_enrollments
  set status = 'ended',
      updated_at = now()
  where team_id = p_team_id
    and status <> 'ended';

  update public.st_teams
  set is_archived = true,
      default_program_id = null
  where id = p_team_id;
end;
$$;

revoke all on function public.st_delete_team(uuid) from public;
grant execute on function public.st_delete_team(uuid) to authenticated;
