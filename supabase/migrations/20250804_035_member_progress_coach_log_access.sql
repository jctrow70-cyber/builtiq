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
