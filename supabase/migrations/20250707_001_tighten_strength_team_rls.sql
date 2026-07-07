-- BuiltIQ Phase 1: Tighten Strength/Team RLS
-- Safe to run on existing databases. Does not drop tables or delete data.
-- Replaces permissive st_* policies with program/team-scoped access.

-- ---------------------------------------------------------------------------
-- Helper functions
-- Membership helpers are SECURITY DEFINER to avoid RLS recursion on
-- st_team_members when policies reference the same table.
-- ---------------------------------------------------------------------------

create or replace function public.st_user_is_active_team_member(p_team_id uuid)
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
      and m.status = 'active'
  );
$$;

create or replace function public.st_user_is_team_owner(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_teams t
    where t.id = p_team_id
      and t.owner_user_id = auth.uid()
  );
$$;

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
      and m.role in ('owner', 'editor')
      and m.status = 'active'
  );
$$;

create or replace function public.st_user_can_read_program(p_program_id uuid)
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
        or (p.visibility = 'team' and public.st_user_is_active_team_member(p.team_id))
      )
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
        or (p.visibility = 'team' and public.st_user_can_edit_team(p.team_id))
      )
  );
$$;

create or replace function public.st_user_can_read_planned_set(p_planned_set_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.st_planned_sets ps
    join public.st_exercises e on e.id = ps.exercise_id
    join public.st_workouts w on w.id = e.workout_id
    where ps.id = p_planned_set_id
      and public.st_user_can_read_program(w.program_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Join flow (SECURITY DEFINER — controlled invite lookup + membership insert)
-- ---------------------------------------------------------------------------

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

revoke all on function public.st_join_team_by_invite(text, text) from public;
grant execute on function public.st_join_team_by_invite(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Drop old policies (by exact name from supabase-strength-team-schema.sql)
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_all" on public.st_profiles;
drop policy if exists "teams_read" on public.st_teams;
drop policy if exists "teams_insert" on public.st_teams;
drop policy if exists "teams_update_owner" on public.st_teams;
drop policy if exists "team_members_read" on public.st_team_members;
drop policy if exists "team_members_insert_self" on public.st_team_members;
drop policy if exists "team_members_update_owner" on public.st_team_members;
drop policy if exists "programs_read" on public.st_programs;
drop policy if exists "programs_insert" on public.st_programs;
drop policy if exists "programs_update_editor" on public.st_programs;
drop policy if exists "workouts_read" on public.st_workouts;
drop policy if exists "workouts_insert" on public.st_workouts;
drop policy if exists "workouts_update" on public.st_workouts;
drop policy if exists "workouts_delete" on public.st_workouts;
drop policy if exists "exercises_all" on public.st_exercises;
drop policy if exists "planned_sets_all" on public.st_planned_sets;
drop policy if exists "set_logs_all" on public.st_set_logs;

-- ---------------------------------------------------------------------------
-- st_profiles (unchanged semantics)
-- ---------------------------------------------------------------------------

create policy "profiles_all" on public.st_profiles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- st_teams — members/owners only (invite lookup goes through RPC)
-- ---------------------------------------------------------------------------

create policy "teams_select_member" on public.st_teams
  for select
  using (
    owner_user_id = auth.uid()
    or public.st_user_is_active_team_member(id)
  );

create policy "teams_insert" on public.st_teams
  for insert
  with check (owner_user_id = auth.uid());

create policy "teams_update_owner" on public.st_teams
  for update
  using (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- st_team_members
-- ---------------------------------------------------------------------------

create policy "team_members_select_same_team" on public.st_team_members
  for select
  using (public.st_user_is_active_team_member(team_id));

-- Owner bootstrap only; members join via st_join_team_by_invite()
create policy "team_members_insert_owner_bootstrap" on public.st_team_members
  for insert
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1
      from public.st_teams t
      where t.id = st_team_members.team_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "team_members_update_owner" on public.st_team_members
  for update
  using (public.st_user_is_team_owner(team_id));

-- ---------------------------------------------------------------------------
-- st_programs (unchanged semantics)
-- ---------------------------------------------------------------------------

create policy "programs_read" on public.st_programs
  for select
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_is_active_team_member(team_id))
  );

create policy "programs_insert" on public.st_programs
  for insert
  with check (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_can_edit_team(team_id))
  );

create policy "programs_update_editor" on public.st_programs
  for update
  using (
    owner_user_id = auth.uid()
    or public.st_user_can_edit_team(team_id)
  );

-- ---------------------------------------------------------------------------
-- st_workouts — read via program membership; edit via owner/editor
-- ---------------------------------------------------------------------------

create policy "workouts_select" on public.st_workouts
  for select
  using (public.st_user_can_read_program(program_id));

create policy "workouts_insert" on public.st_workouts
  for insert
  with check (public.st_user_can_edit_program(program_id));

create policy "workouts_update" on public.st_workouts
  for update
  using (public.st_user_can_edit_program(program_id))
  with check (public.st_user_can_edit_program(program_id));

create policy "workouts_delete" on public.st_workouts
  for delete
  using (public.st_user_can_edit_program(program_id));

-- ---------------------------------------------------------------------------
-- st_exercises
-- ---------------------------------------------------------------------------

create policy "exercises_select" on public.st_exercises
  for select
  using (
    exists (
      select 1
      from public.st_workouts w
      where w.id = st_exercises.workout_id
        and public.st_user_can_read_program(w.program_id)
    )
  );

create policy "exercises_insert" on public.st_exercises
  for insert
  with check (
    exists (
      select 1
      from public.st_workouts w
      where w.id = st_exercises.workout_id
        and public.st_user_can_edit_program(w.program_id)
    )
  );

create policy "exercises_update" on public.st_exercises
  for update
  using (
    exists (
      select 1
      from public.st_workouts w
      where w.id = st_exercises.workout_id
        and public.st_user_can_edit_program(w.program_id)
    )
  )
  with check (
    exists (
      select 1
      from public.st_workouts w
      where w.id = st_exercises.workout_id
        and public.st_user_can_edit_program(w.program_id)
    )
  );

create policy "exercises_delete" on public.st_exercises
  for delete
  using (
    exists (
      select 1
      from public.st_workouts w
      where w.id = st_exercises.workout_id
        and public.st_user_can_edit_program(w.program_id)
    )
  );

-- ---------------------------------------------------------------------------
-- st_planned_sets
-- ---------------------------------------------------------------------------

create policy "planned_sets_select" on public.st_planned_sets
  for select
  using (
    exists (
      select 1
      from public.st_exercises e
      join public.st_workouts w on w.id = e.workout_id
      where e.id = st_planned_sets.exercise_id
        and public.st_user_can_read_program(w.program_id)
    )
  );

create policy "planned_sets_insert" on public.st_planned_sets
  for insert
  with check (
    exists (
      select 1
      from public.st_exercises e
      join public.st_workouts w on w.id = e.workout_id
      where e.id = st_planned_sets.exercise_id
        and public.st_user_can_edit_program(w.program_id)
    )
  );

create policy "planned_sets_update" on public.st_planned_sets
  for update
  using (
    exists (
      select 1
      from public.st_exercises e
      join public.st_workouts w on w.id = e.workout_id
      where e.id = st_planned_sets.exercise_id
        and public.st_user_can_edit_program(w.program_id)
    )
  )
  with check (
    exists (
      select 1
      from public.st_exercises e
      join public.st_workouts w on w.id = e.workout_id
      where e.id = st_planned_sets.exercise_id
        and public.st_user_can_edit_program(w.program_id)
    )
  );

create policy "planned_sets_delete" on public.st_planned_sets
  for delete
  using (
    exists (
      select 1
      from public.st_exercises e
      join public.st_workouts w on w.id = e.workout_id
      where e.id = st_planned_sets.exercise_id
        and public.st_user_can_edit_program(w.program_id)
    )
  );

-- ---------------------------------------------------------------------------
-- st_set_logs — own rows only, and only for programs the user can access
-- ---------------------------------------------------------------------------

create policy "set_logs_select" on public.st_set_logs
  for select
  using (
    user_id = auth.uid()
    and public.st_user_can_read_planned_set(planned_set_id)
  );

create policy "set_logs_insert" on public.st_set_logs
  for insert
  with check (
    user_id = auth.uid()
    and public.st_user_can_read_planned_set(planned_set_id)
  );

create policy "set_logs_update" on public.st_set_logs
  for update
  using (
    user_id = auth.uid()
    and public.st_user_can_read_planned_set(planned_set_id)
  )
  with check (
    user_id = auth.uid()
    and public.st_user_can_read_planned_set(planned_set_id)
  );

create policy "set_logs_delete" on public.st_set_logs
  for delete
  using (
    user_id = auth.uid()
    and public.st_user_can_read_planned_set(planned_set_id)
  );
