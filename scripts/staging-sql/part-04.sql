-- BuildIQ Staging schema replay part 4

-- ===== 20250728_020_profile_ui_theme.sql =====

-- BIQ-0060: User UI theme preference (optional — app falls back to localStorage until applied)
alter table public.st_profiles
  add column if not exists ui_theme text;

comment on column public.st_profiles.ui_theme is
  'Visual theme id: calm, performance, energy, nature, minimal';


-- ===== 20250803_030_team_workspace_program_tools.sql =====

-- BIQ-0071: Team workspace — program lineage, duplicate, leave/delete team

-- ---------------------------------------------------------------------------
-- 1. Program lineage (customized copies)
-- ---------------------------------------------------------------------------

alter table public.st_programs
  add column if not exists source_program_id uuid
    references public.st_programs(id) on delete set null;

create index if not exists st_programs_source_program_idx
  on public.st_programs (source_program_id)
  where source_program_id is not null;

comment on column public.st_programs.source_program_id is
  'When set, this program was duplicated from another (e.g. member-specific team plan copy).';

-- ---------------------------------------------------------------------------
-- 2. Soft-archive teams (preserve logs and history)
-- ---------------------------------------------------------------------------

alter table public.st_teams
  add column if not exists is_archived boolean not null default false;

create index if not exists st_teams_archived_idx
  on public.st_teams (is_archived)
  where is_archived = true;

-- Hide archived teams from member selects (owners still see via service if needed)
drop policy if exists "teams_select_member" on public.st_teams;

create policy "teams_select_member" on public.st_teams
  for select using (
    coalesce(is_archived, false) = false
    and public.st_user_is_active_team_member(id)
  );

-- ---------------------------------------------------------------------------
-- 3. Duplicate full program (workouts, exercises, planned sets)
-- ---------------------------------------------------------------------------

create or replace function public.st_duplicate_program(
  p_source_program_id uuid,
  p_name text default null,
  p_visibility text default null,
  p_team_id uuid default null,
  p_owner_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.st_programs%rowtype;
  v_new_program_id uuid;
  v_workout record;
  v_new_workout_id uuid;
  v_ex record;
  v_new_ex_id uuid;
  v_ps record;
  v_superset_map jsonb := '{}'::jsonb;
  v_new_group uuid;
  v_visibility text;
  v_owner uuid;
  v_team uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_source
  from public.st_programs
  where id = p_source_program_id;

  if not found then
    raise exception 'Source program not found';
  end if;

  if not public.st_user_can_read_program(p_source_program_id) then
    raise exception 'Not authorized to read source program';
  end if;

  v_visibility := coalesce(nullif(trim(p_visibility), ''), v_source.visibility);
  if v_visibility not in ('personal', 'team') then
    raise exception 'Invalid visibility';
  end if;

  v_owner := coalesce(p_owner_user_id, auth.uid());
  v_team := case when v_visibility = 'team' then coalesce(p_team_id, v_source.team_id) else null end;

  if v_visibility = 'team' then
    if v_team is null then
      raise exception 'Team id required for team programs';
    end if;
    if not public.st_user_can_edit_team(v_team) then
      raise exception 'Not authorized to create team programs';
    end if;
  elsif v_owner <> auth.uid() then
    if not (
      v_source.visibility = 'team'
      and v_source.team_id is not null
      and public.st_user_can_edit_team(v_source.team_id)
    ) then
      raise exception 'Not authorized to duplicate for another user';
    end if;
  end if;

  insert into public.st_programs (
    owner_user_id,
    team_id,
    visibility,
    name,
    weeks,
    start_date,
    generation_method,
    generation_prompt,
    program_summary,
    program_style,
    coaching_notes,
    focus_muscles,
    status,
    source_program_id
  ) values (
    v_owner,
    v_team,
    v_visibility,
    coalesce(nullif(trim(p_name), ''), v_source.name || ' (Copy)'),
    v_source.weeks,
    v_source.start_date,
    coalesce(v_source.generation_method, 'manual'),
    v_source.generation_prompt,
    v_source.program_summary,
    v_source.program_style,
    v_source.coaching_notes,
    v_source.focus_muscles,
    coalesce(v_source.status, 'draft'),
    p_source_program_id
  )
  returning id into v_new_program_id;

  for v_workout in
    select *
    from public.st_workouts
    where program_id = p_source_program_id
    order by week, day_order, created_at
  loop
    insert into public.st_workouts (
      program_id, week, day_order, day_label, workout_type
    ) values (
      v_new_program_id,
      v_workout.week,
      v_workout.day_order,
      v_workout.day_label,
      v_workout.workout_type
    )
    returning id into v_new_workout_id;

    v_superset_map := '{}'::jsonb;

    for v_ex in
      select *
      from public.st_exercises
      where workout_id = v_workout.id
      order by section, sort_order, created_at
    loop
      v_new_group := null;
      if v_ex.superset_group_id is not null then
        if v_superset_map ? v_ex.superset_group_id::text then
          v_new_group := (v_superset_map ->> v_ex.superset_group_id::text)::uuid;
        else
          v_new_group := gen_random_uuid();
          v_superset_map := v_superset_map || jsonb_build_object(v_ex.superset_group_id::text, v_new_group);
        end if;
      end if;

      insert into public.st_exercises (
        workout_id,
        sort_order,
        name,
        muscle_group,
        notes,
        section,
        catalog_exercise_id,
        exercise_type,
        superset_group_id,
        superset_label,
        superset_order
      ) values (
        v_new_workout_id,
        v_ex.sort_order,
        v_ex.name,
        v_ex.muscle_group,
        v_ex.notes,
        v_ex.section,
        v_ex.catalog_exercise_id,
        v_ex.exercise_type,
        v_new_group,
        v_ex.superset_label,
        v_ex.superset_order
      )
      returning id into v_new_ex_id;

      for v_ps in
        select *
        from public.st_planned_sets
        where exercise_id = v_ex.id
          and coalesce(is_deleted, false) = false
        order by sort_order, set_number
      loop
        insert into public.st_planned_sets (
          exercise_id,
          sort_order,
          set_number,
          set_type,
          target_weight,
          target_reps,
          target_rpe
        ) values (
          v_new_ex_id,
          v_ps.sort_order,
          v_ps.set_number,
          v_ps.set_type,
          v_ps.target_weight,
          v_ps.target_reps,
          v_ps.target_rpe
        );
      end loop;
    end loop;
  end loop;

  return v_new_program_id;
end;
$$;

revoke all on function public.st_duplicate_program(uuid, text, text, uuid, uuid) from public;
grant execute on function public.st_duplicate_program(uuid, text, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Leave team (member removes self)
-- ---------------------------------------------------------------------------

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
    raise exception 'You are not an active member of this team';
  end if;

  if v_role = 'owner' then
    raise exception 'Owners cannot leave — transfer ownership or delete the team';
  end if;

  update public.st_team_members
  set status = 'removed'
  where team_id = p_team_id
    and user_id = auth.uid()
    and status = 'active';
end;
$$;

revoke all on function public.st_leave_team(uuid) from public;
grant execute on function public.st_leave_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Delete team (owner only, soft archive)
-- ---------------------------------------------------------------------------

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
    raise exception 'Only the team owner can delete the team';
  end if;

  update public.st_team_members
  set status = 'removed'
  where team_id = p_team_id
    and status = 'active';

  update public.st_teams
  set is_archived = true,
      default_program_id = null
  where id = p_team_id;
end;
$$;

revoke all on function public.st_delete_team(uuid) from public;
grant execute on function public.st_delete_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Customize team program for one member (duplicate + assign)
-- ---------------------------------------------------------------------------

create or replace function public.st_customize_program_for_member(
  p_team_id uuid,
  p_member_user_id uuid,
  p_source_program_id uuid,
  p_name text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_program_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id
      and user_id = p_member_user_id
      and status = 'active'
  ) then
    raise exception 'Member not found';
  end if;

  v_new_program_id := public.st_duplicate_program(
    p_source_program_id,
    coalesce(nullif(trim(p_name), ''), 'Custom plan'),
    'personal',
    null,
    p_member_user_id
  );

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
    target_type
  ) values (
    p_member_user_id,
    p_team_id,
    auth.uid(),
    'individual_team',
    v_new_program_id,
    p_notes,
    true,
    'individual'
  );

  perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'personal');

  return v_new_program_id;
end;
$$;

revoke all on function public.st_customize_program_for_member(uuid, uuid, uuid, text, text) from public;
grant execute on function public.st_customize_program_for_member(uuid, uuid, uuid, text, text) to authenticated;


-- ===== 20250803_031_program_delete_policy.sql =====

-- BIQ-0076: Allow owners/editors to delete personal and team programs

drop policy if exists "programs_delete" on public.st_programs;

create policy "programs_delete" on public.st_programs
  for delete
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and team_id is not null and public.st_user_can_edit_team(team_id))
  );


-- ===== 20250803_032_program_delete_rpc.sql =====

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


-- ===== 20250803_033_fix_member_program_assign.sql =====

-- BIQ-0084: Fix member program assignment RPC compatibility and validation

alter table public.st_program_assignments
  add column if not exists coaching_metadata jsonb not null default '{}'::jsonb;

alter table public.st_program_assignments
  add column if not exists target_type text
    check (target_type is null or target_type in ('group', 'classification', 'members', 'individual'));

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


-- ===== 20250804_034_preserve_set_logs_on_program_delete.sql =====

-- BIQ-0085: Harden set-log survival when programs/templates are replaced
-- Safe additive migration. Does not delete data.
--
-- When a group program is regenerated and the old template is deleted,
-- planned sets cascade-delete. Logs must keep surviving via ON DELETE SET NULL
-- (BIQ-0003). This migration re-asserts that constraint in case a project
-- still has the older ON DELETE CASCADE from the original schema.

alter table public.st_set_logs drop constraint if exists st_set_logs_planned_set_id_fkey;
alter table public.st_set_logs alter column planned_set_id drop not null;
alter table public.st_set_logs
  add constraint st_set_logs_planned_set_id_fkey
  foreign key (planned_set_id) references public.st_planned_sets(id) on delete set null;

-- Helpful index for rematch / Progress queries on orphaned history
create index if not exists st_set_logs_user_date_completed_idx
  on public.st_set_logs (user_id, log_date desc)
  where completed = true;

comment on column public.st_set_logs.planned_set_id is
  'Nullable link to template set. Cleared (SET NULL) when the template is deleted so completed history survives.';


-- ===== 20250804_035_member_progress_coach_log_access.sql =====

-- BIQ-0086: Member Progress visibility after program redo
-- Safe additive migration. Does not delete data.
--
-- 1) Coach helpers accept both legacy `editor` and current `manager` roles
-- 2) Coaches can read/update teammate set logs even when planned_set_id is null
--    (orphaned after template delete / program replace)

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
      and coach.role in ('owner', 'manager', 'editor')
      and coach.status = 'active'
      and member.user_id = p_member_user_id
      and member.status = 'active'
  );
$$;

create or replace function public.st_user_can_coach_read_member_log(p_log_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_log_user_id is distinct from auth.uid()
    and public.st_user_can_coach_read_member_program(p_log_user_id);
$$;

-- Select: own logs OR coach teammate logs (snapshot rows survive template delete)
drop policy if exists "set_logs_select" on public.st_set_logs;

create policy "set_logs_select" on public.st_set_logs
  for select
  using (
    (
      user_id = auth.uid()
      and public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
    )
    or (
      public.st_user_can_coach_read_member_log(user_id)
      and (
        public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
        or coalesce(length(trim(snapshot_exercise_name)), 0) > 0
        or completed = true
      )
    )
  );

-- Update: owners may rematch their own logs; managers may rematch teammate logs
drop policy if exists "set_logs_update" on public.st_set_logs;

create policy "set_logs_update" on public.st_set_logs
  for update
  using (
    user_id = auth.uid()
    or public.st_user_can_coach_read_member_log(user_id)
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
        and coach.role in ('owner', 'manager', 'editor')
        and p.visibility = 'team'
    )
  )
  with check (
    user_id = auth.uid()
    or public.st_user_can_coach_read_member_log(user_id)
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
        and coach.role in ('owner', 'manager', 'editor')
        and p.visibility = 'team'
    )
  );


-- ===== 20250804_036_fix_assign_and_edit_team_roles.sql =====

-- BIQ-0087: Fix Apply assignment auth + ensure assign RPC exists
-- Safe additive migration. Does not delete data.
--
-- Common failure: st_user_can_edit_team only allowed `manager` while some
-- rows still have legacy `editor`, so Apply assignment returned Not authorized.

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
      and m.role in ('owner', 'manager', 'editor')
      and m.status = 'active'
  );
$$;

-- Normalize any remaining legacy editor roles
update public.st_team_members
set role = 'manager'
where role = 'editor';

alter table public.st_program_assignments
  add column if not exists coaching_metadata jsonb not null default '{}'::jsonb;

alter table public.st_program_assignments
  add column if not exists target_type text
    check (target_type is null or target_type in ('group', 'classification', 'members', 'individual'));

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


-- ===== 20250804_037_own_set_logs_always_visible.sql =====

-- BIQ-0089: Own set logs always visible on Progress
-- Safe additive migration. Does not delete data.
--
-- Progress loads st_set_logs for the signed-in user. The previous SELECT policy
-- also required st_user_can_access_set_log(planned_set_id, snapshot_exercise_name).
-- After a group program replace, planned_set_id can be NULL and some older rows
-- may lack snapshots — those logs disappeared from Progress even though they
-- still belonged to the user. UPDATE already allowed user_id = auth.uid();
-- SELECT now matches that ownership rule.

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
  );

comment on policy "set_logs_select" on public.st_set_logs is
  'Users always read their own set logs; coaches read teammate logs with snapshot/performance evidence.';


-- ===== 20250804_038_drop_assign_member_program_overload.sql =====

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


-- ===== 20250810_039_meal_entry_serving_unit.sql =====

-- BIQ-0108: Serving unit on meal entries (amount + unit of measure)

alter table public.st_meal_entries
  add column if not exists serving_unit text not null default 'serving';


-- ===== 20250812_040_meal_entry_serving_size.sql =====

-- BIQ-0110: Serving size number on meal entries (separate from amount eaten)

alter table public.st_meal_entries
  add column if not exists serving_size numeric not null default 1;
