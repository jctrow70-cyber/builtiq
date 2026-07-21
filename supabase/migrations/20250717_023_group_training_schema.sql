-- BIQ-0043-P2: Group classifications, workout assignments, participation flag
-- Safe additive migration. Does not drop tables or delete data.

-- ---------------------------------------------------------------------------
-- 1. Team members: participation flag + manager role backfill
-- ---------------------------------------------------------------------------

alter table public.st_team_members
  add column if not exists is_active_participant boolean not null default true;

update public.st_team_members
set role = 'manager'
where role = 'editor';

update public.st_team_members
set is_active_participant = true
where status = 'active' and is_active_participant is distinct from true;

alter table public.st_team_members
  drop constraint if exists st_team_members_role_check;

alter table public.st_team_members
  add constraint st_team_members_role_check
  check (role in ('owner', 'manager', 'member'));

-- ---------------------------------------------------------------------------
-- 2. Helpers — accept manager (legacy editor already backfilled)
-- ---------------------------------------------------------------------------

create or replace function public.st_user_can_edit_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'manager')
      and m.status = 'active'
  );
$$;

create or replace function public.st_user_can_coach_read_member_program(p_member_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_team_members coach
    join public.st_team_members member on member.team_id = coach.team_id
    where coach.user_id = auth.uid()
      and coach.role in ('owner', 'manager')
      and coach.status = 'active'
      and member.user_id = p_member_user_id
      and member.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Classifications
-- ---------------------------------------------------------------------------

create table if not exists public.st_group_classifications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (team_id, slug)
);

create index if not exists st_group_classifications_team_idx
  on public.st_group_classifications (team_id);

create table if not exists public.st_group_member_classifications (
  member_id uuid not null references public.st_team_members(id) on delete cascade,
  classification_id uuid not null references public.st_group_classifications(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, classification_id)
);

create index if not exists st_group_member_classifications_classification_idx
  on public.st_group_member_classifications (classification_id);

-- ---------------------------------------------------------------------------
-- 4. Workout assignments + recipients
-- ---------------------------------------------------------------------------

create table if not exists public.st_workout_assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  workout_id uuid references public.st_workouts(id) on delete set null,
  program_id uuid references public.st_programs(id) on delete set null,
  workout_date date,
  target_type text not null
    check (target_type in ('group', 'classification', 'members', 'individual')),
  target_classification_id uuid references public.st_group_classifications(id) on delete set null,
  scheduled_date date not null default current_date,
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'started', 'completed', 'cancelled')),
  template_snapshot_version int not null default 1,
  is_active boolean not null default true,
  title text,
  notes text,
  created_at timestamptz not null default now(),
  check (
    workout_id is not null
    or (program_id is not null and workout_date is not null)
  )
);

create index if not exists st_workout_assignments_team_active_idx
  on public.st_workout_assignments (team_id, is_active, scheduled_date desc);

create table if not exists public.st_assignment_recipients (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.st_workout_assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'started', 'completed', 'skipped', 'cancelled')),
  personal_copy_program_id uuid references public.st_programs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (assignment_id, user_id)
);

create index if not exists st_assignment_recipients_user_idx
  on public.st_assignment_recipients (user_id, status);

-- ---------------------------------------------------------------------------
-- 5. Program assignments — multi-target columns
-- ---------------------------------------------------------------------------

alter table public.st_program_assignments
  add column if not exists target_type text
    check (target_type is null or target_type in ('group', 'classification', 'members', 'individual'));

alter table public.st_program_assignments
  add column if not exists target_classification_id uuid
    references public.st_group_classifications(id) on delete set null;

update public.st_program_assignments
set target_type = 'individual'
where target_type is null and is_active = true;

-- ---------------------------------------------------------------------------
-- 6. RLS — classifications
-- ---------------------------------------------------------------------------

alter table public.st_group_classifications enable row level security;
alter table public.st_group_member_classifications enable row level security;
alter table public.st_workout_assignments enable row level security;
alter table public.st_assignment_recipients enable row level security;

create policy "group_classifications_select" on public.st_group_classifications
  for select using (public.st_user_is_active_team_member(team_id));

create policy "group_classifications_write" on public.st_group_classifications
  for all using (public.st_user_can_edit_team(team_id))
  with check (public.st_user_can_edit_team(team_id));

create policy "group_member_classifications_select" on public.st_group_member_classifications
  for select using (
    exists (
      select 1
      from public.st_team_members tm
      join public.st_group_classifications gc on gc.id = st_group_member_classifications.classification_id
      where tm.id = st_group_member_classifications.member_id
        and public.st_user_is_active_team_member(gc.team_id)
    )
  );

create policy "group_member_classifications_write" on public.st_group_member_classifications
  for all using (
    exists (
      select 1
      from public.st_group_classifications gc
      where gc.id = st_group_member_classifications.classification_id
        and public.st_user_can_edit_team(gc.team_id)
    )
  )
  with check (
    exists (
      select 1
      from public.st_group_classifications gc
      where gc.id = st_group_member_classifications.classification_id
        and public.st_user_can_edit_team(gc.team_id)
    )
  );

-- Members see only their own assignment rows; managers see all team assignments.
create policy "workout_assignments_select" on public.st_workout_assignments
  for select using (
    public.st_user_can_edit_team(team_id)
    or exists (
      select 1
      from public.st_assignment_recipients ar
      where ar.assignment_id = st_workout_assignments.id
        and ar.user_id = auth.uid()
    )
  );

create policy "workout_assignments_insert" on public.st_workout_assignments
  for insert with check (public.st_user_can_edit_team(team_id));

create policy "workout_assignments_update" on public.st_workout_assignments
  for update using (public.st_user_can_edit_team(team_id));

create policy "assignment_recipients_select" on public.st_assignment_recipients
  for select using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.st_workout_assignments wa
      where wa.id = st_assignment_recipients.assignment_id
        and public.st_user_can_edit_team(wa.team_id)
    )
  );

create policy "assignment_recipients_update" on public.st_assignment_recipients
  for update using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.st_workout_assignments wa
      where wa.id = st_assignment_recipients.assignment_id
        and public.st_user_can_edit_team(wa.team_id)
    )
  );

-- Refresh program assignment policies for manager role
drop policy if exists "program_assignments_select" on public.st_program_assignments;
drop policy if exists "program_assignments_insert" on public.st_program_assignments;
drop policy if exists "program_assignments_update" on public.st_program_assignments;

create policy "program_assignments_select" on public.st_program_assignments
  for select using (
    user_id = auth.uid()
    or public.st_user_can_read_program(program_id)
    or exists (
      select 1 from public.st_team_members tm
      where tm.team_id = st_program_assignments.team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner', 'manager')
    )
  );

create policy "program_assignments_insert" on public.st_program_assignments
  for insert with check (
    exists (
      select 1 from public.st_team_members tm
      where tm.team_id = st_program_assignments.team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner', 'manager')
    )
  );

create policy "program_assignments_update" on public.st_program_assignments
  for update using (
    exists (
      select 1 from public.st_team_members tm
      where tm.team_id = st_program_assignments.team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner', 'manager')
    )
  );

-- Coach co-logging policies (manager role)
drop policy if exists "set_logs_insert" on public.st_set_logs;
drop policy if exists "set_logs_update" on public.st_set_logs;

create policy "set_logs_insert" on public.st_set_logs
  for insert with check (
    user_id = auth.uid()
    or exists (
      select 1
      from public.st_planned_sets ps
      join public.st_exercises e on e.id = ps.exercise_id
      join public.st_workouts w on w.id = e.workout_id
      join public.st_programs p on p.id = w.program_id
      join public.st_team_members coach on coach.team_id = p.team_id
      where ps.id = st_set_logs.planned_set_id
        and coach.user_id = auth.uid()
        and coach.status = 'active'
        and coach.role in ('owner', 'manager')
        and p.visibility = 'team'
    )
  );

create policy "set_logs_update" on public.st_set_logs
  for update using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.st_planned_sets ps
      join public.st_exercises e on e.id = ps.exercise_id
      join public.st_workouts w on w.id = e.workout_id
      join public.st_programs p on p.id = w.program_id
      join public.st_team_members coach on coach.team_id = p.team_id
      where ps.id = st_set_logs.planned_set_id
        and coach.user_id = auth.uid()
        and coach.status = 'active'
        and coach.role in ('owner', 'manager')
        and p.visibility = 'team'
    )
  );

-- ---------------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------------

create or replace function public.st_set_member_participation(
  p_team_id uuid,
  p_member_user_id uuid,
  p_is_active_participant boolean
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

  update public.st_team_members
  set is_active_participant = coalesce(p_is_active_participant, true)
  where team_id = p_team_id
    and user_id = p_member_user_id
    and status = 'active';

  if not found then
    raise exception 'Member not found';
  end if;
end;
$$;

revoke all on function public.st_set_member_participation(uuid, uuid, boolean) from public;
grant execute on function public.st_set_member_participation(uuid, uuid, boolean) to authenticated;

create or replace function public.st_promote_member_to_manager(
  p_team_id uuid,
  p_member_user_id uuid
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

  if not public.st_user_is_team_owner(p_team_id) then
    raise exception 'Only owner can promote managers';
  end if;

  if p_member_user_id = auth.uid() then
    raise exception 'Owner role is unchanged';
  end if;

  update public.st_team_members
  set role = 'manager'
  where team_id = p_team_id
    and user_id = p_member_user_id
    and status = 'active'
    and role = 'member';

  if not found then
    raise exception 'Member not found or not eligible for promotion';
  end if;
end;
$$;

revoke all on function public.st_promote_member_to_manager(uuid, uuid) from public;
grant execute on function public.st_promote_member_to_manager(uuid, uuid) to authenticated;

create or replace function public.st_assign_member_program(
  p_team_id uuid,
  p_member_user_id uuid,
  p_assignment_type text,
  p_program_id uuid default null,
  p_notes text default null
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
    user_id, team_id, assigned_by, assignment_type, program_id, notes, is_active, target_type
  ) values (
    p_member_user_id, p_team_id, auth.uid(), p_assignment_type, p_program_id, p_notes, true, 'individual'
  );

  if p_assignment_type = 'personal' then
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'personal');
  else
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'team');
  end if;
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
  p_notes text default null
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
    notes
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
    p_notes
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
  uuid, uuid, uuid, date, text, uuid, uuid[], date, date, text, text
) from public;
grant execute on function public.st_assign_workout_to_targets(
  uuid, uuid, uuid, date, text, uuid, uuid[], date, date, text, text
) to authenticated;
