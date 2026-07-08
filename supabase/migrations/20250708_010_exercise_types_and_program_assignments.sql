-- BIQ-0012: exercise types, cardio log fields, superset labels, program assignments

alter table public.st_exercise_catalog
  add column if not exists exercise_type text not null default 'strength';

alter table public.st_exercises
  add column if not exists exercise_type text not null default 'strength',
  add column if not exists superset_label text,
  add column if not exists superset_order smallint;

create index if not exists st_exercises_superset_label_idx
  on public.st_exercises (workout_id, section, superset_group_id);

alter table public.st_set_logs
  add column if not exists snapshot_exercise_type text,
  add column if not exists actual_rpe text,
  add column if not exists actual_duration text,
  add column if not exists actual_distance text,
  add column if not exists actual_pace text,
  add column if not exists actual_hr text,
  add column if not exists actual_calories text,
  add column if not exists log_notes text,
  add column if not exists logged_by_user_id uuid references auth.users(id) on delete set null;

-- Backfill catalog cardio examples
update public.st_exercise_catalog
set exercise_type = 'cardio'
where lower(name) similar to '%(walk|run|bike|row|elliptical|swim|assault bike)%'
  and exercise_type = 'strength';

create table if not exists public.st_program_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.st_teams(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assignment_type text not null check (assignment_type in ('personal','team','individual_team','manual')),
  program_id uuid references public.st_programs(id) on delete set null,
  start_date date not null default current_date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists st_program_assignments_user_team_idx
  on public.st_program_assignments (user_id, team_id, is_active);

alter table public.st_program_assignments enable row level security;

create policy "program_assignments_select" on public.st_program_assignments
  for select using (
    user_id = auth.uid()
    or public.st_user_can_read_program(program_id)
    or exists (
      select 1 from public.st_team_members tm
      where tm.team_id = st_program_assignments.team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner','editor')
    )
  );

create policy "program_assignments_insert" on public.st_program_assignments
  for insert with check (
    exists (
      select 1 from public.st_team_members tm
      where tm.team_id = st_program_assignments.team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner','editor')
    )
  );

create policy "program_assignments_update" on public.st_program_assignments
  for update using (
    exists (
      select 1 from public.st_team_members tm
      where tm.team_id = st_program_assignments.team_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
        and tm.role in ('owner','editor')
    )
  );

-- Coaches may insert/update logs for team members on team programs
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
        and coach.role in ('owner','editor')
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
        and coach.role in ('owner','editor')
        and p.visibility = 'team'
    )
  );

create or replace function public.st_assign_member_program(
  p_team_id uuid,
  p_member_user_id uuid,
  p_assignment_type text,
  p_program_id uuid default null,
  p_notes text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.st_team_members
    where team_id = p_team_id and user_id = auth.uid()
      and status = 'active' and role in ('owner','editor')
  ) then
    raise exception 'Not authorized';
  end if;

  update public.st_program_assignments
  set is_active = false
  where user_id = p_member_user_id and team_id = p_team_id and is_active = true;

  insert into public.st_program_assignments (
    user_id, team_id, assigned_by, assignment_type, program_id, notes, is_active
  ) values (
    p_member_user_id, p_team_id, auth.uid(), p_assignment_type, p_program_id, p_notes, true
  );

  if p_assignment_type = 'personal' then
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'personal');
  else
    perform public.st_set_member_training_source(p_team_id, p_member_user_id, 'team');
  end if;
end;
$$;
