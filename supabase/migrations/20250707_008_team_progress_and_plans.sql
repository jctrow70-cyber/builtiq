-- BIQ-0009: Team progress, member plan choice, coach visibility
-- Safe additive migration. Does not drop tables or delete data.

alter table public.st_team_members
  add column if not exists training_source text not null default 'team'
    check (training_source in ('team', 'personal'));

alter table public.st_teams
  add column if not exists default_program_id uuid
    references public.st_programs(id) on delete set null;

alter table public.st_set_logs
  add column if not exists team_id uuid
    references public.st_teams(id) on delete set null;

create index if not exists st_set_logs_team_user_date_idx
  on public.st_set_logs (team_id, user_id, log_date desc)
  where team_id is not null;

-- Backfill team_id on logs tied to team programs
update public.st_set_logs sl
set team_id = p.team_id
from public.st_planned_sets ps
join public.st_exercises e on e.id = ps.exercise_id
join public.st_workouts w on w.id = e.workout_id
join public.st_programs p on p.id = w.program_id
where sl.planned_set_id = ps.id
  and p.visibility = 'team'
  and p.team_id is not null
  and sl.team_id is null;

-- Coach can read a teammate's personal program template
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
      and coach.role in ('owner', 'editor')
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

-- Member sets own team vs personal training source
create or replace function public.st_set_my_training_source(
  p_team_id uuid,
  p_training_source text
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

  if p_training_source not in ('team', 'personal') then
    raise exception 'Invalid training source';
  end if;

  update public.st_team_members
  set training_source = p_training_source
  where team_id = p_team_id
    and user_id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Not an active team member';
  end if;
end;
$$;

revoke all on function public.st_set_my_training_source(uuid, text) from public;
grant execute on function public.st_set_my_training_source(uuid, text) to authenticated;

-- Owner/editor sets a member's training source
create or replace function public.st_set_member_training_source(
  p_team_id uuid,
  p_member_user_id uuid,
  p_training_source text
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
    raise exception 'Not allowed';
  end if;

  if p_training_source not in ('team', 'personal') then
    raise exception 'Invalid training source';
  end if;

  update public.st_team_members
  set training_source = p_training_source
  where team_id = p_team_id
    and user_id = p_member_user_id
    and status = 'active';

  if not found then
    raise exception 'Member not found';
  end if;
end;
$$;

revoke all on function public.st_set_member_training_source(uuid, uuid, text) from public;
grant execute on function public.st_set_member_training_source(uuid, uuid, text) to authenticated;

-- Programs: coaches may read teammates' personal programs
drop policy if exists "programs_read" on public.st_programs;

create policy "programs_read" on public.st_programs
  for select
  using (
    (visibility = 'personal' and owner_user_id = auth.uid())
    or (visibility = 'team' and public.st_user_is_active_team_member(team_id))
    or (
      visibility = 'personal'
      and public.st_user_can_coach_read_member_program(owner_user_id)
    )
  );

-- Set logs: own rows OR coach read of teammate logs
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
      and public.st_user_can_access_set_log(planned_set_id, snapshot_exercise_name)
    )
  );
