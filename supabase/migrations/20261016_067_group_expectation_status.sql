-- BIQ-0263 Phase 1: per-workout group expectation status
-- Apply this file in the Supabase SQL Editor after 20261016_066_group_assigned_program_read.sql.
-- It adds one index, replaces the adherence session match, and adds one read function.
-- It does not update or delete training rows. It does not apply migration 065.
--
-- Session match, used by both functions below:
--   an expectation link fulfills only that expectation;
--   an unlinked session matches workout and date only when that member has one such expectation.
--
-- While an enrollment is paused, today and future unfinished workouts are paused
-- on the row-status function. Past unfinished workouts stay missed. Adherence
-- totals keep the existing missed definition, so this file does not invent a
-- historical pause date and does not recalculate past misses.
--
-- Rollback:
--   Re-apply the previous st_group_schedule_adherence body from
--   20261007_059_unified_training_schedule.sql before dropping the new objects.
--   drop function if exists public.st_group_expectation_status(uuid, date, date, date, uuid);
--   drop index if exists public.st_workout_sessions_expectation_idx;

create index if not exists st_workout_sessions_expectation_idx
  on public.st_workout_sessions (expectation_id)
  where expectation_id is not null;

create or replace function public.st_group_expectation_status(
  p_team_id uuid,
  p_from_date date,
  p_to_date date,
  p_local_today date,
  p_member_user_id uuid default null
)
returns table (
  expectation_id uuid,
  user_id uuid,
  workout_id uuid,
  scheduled_date date,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_see_all boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null or p_from_date is null or p_to_date is null or p_local_today is null then
    raise exception 'Not authorized';
  end if;
  if p_to_date < p_from_date or p_to_date - p_from_date > 83 then
    raise exception 'Date range is too large';
  end if;
  if not exists (
    select 1
    from public.st_team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) and not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not authorized';
  end if;

  v_see_all := public.st_user_can_view_group_progress(p_team_id) or public.st_user_can_edit_team(p_team_id);
  if p_member_user_id is not null and not v_see_all and p_member_user_id is distinct from auth.uid() then
    raise exception 'Not authorized';
  end if;

  return query
  select
    e.id,
    e.user_id,
    e.workout_id,
    e.scheduled_date,
    case
      when e.excused then 'excused'
      when sess.status = 'completed' then 'completed'
      when sess.status = 'partial' then 'partial'
      when sess.status = 'skipped' or coalesce(rec.status, '') = 'skipped' then 'skipped'
      when enr.status = 'paused' and e.scheduled_date >= p_local_today then 'paused'
      when e.scheduled_date < p_local_today then 'missed'
      when e.scheduled_date = p_local_today then 'due_today'
      else 'upcoming'
    end
  from public.st_training_expectations e
  join public.st_team_members tm
    on tm.team_id = p_team_id
   and tm.user_id = e.user_id
   and tm.status = 'active'
  left join lateral (
    select s.status
    from public.st_workout_sessions s
    where s.user_id = e.user_id
      and (
        s.expectation_id = e.id
        or (
          s.expectation_id is null
          and e.workout_id is not null
          and s.workout_id = e.workout_id
          and s.log_date = e.scheduled_date
          and not exists (
            select 1
            from public.st_training_expectations other
            where other.user_id = e.user_id
              and other.workout_id = e.workout_id
              and other.scheduled_date = e.scheduled_date
              and other.id <> e.id
          )
        )
      )
    order by case when s.expectation_id = e.id then 0 else 1 end, s.completed_at desc nulls last
    limit 1
  ) sess on true
  left join public.st_assignment_recipients rec on rec.id = e.assignment_recipient_id
  left join lateral (
    select en.status
    from public.st_training_enrollments en
    where en.user_id = e.user_id
      and en.team_id = p_team_id
      and en.source_kind = 'group'
      and en.source_key = 'group:' || p_team_id::text
    order by en.starts_on desc nulls last, en.id
    limit 1
  ) enr on true
  where e.scheduled_date between p_from_date and p_to_date
    and (
      e.source_key = ('group:' || p_team_id::text)
      or (e.origin = 'assignment' and e.team_id = p_team_id)
    )
    and (p_member_user_id is null or e.user_id = p_member_user_id)
    and (v_see_all or e.user_id = auth.uid());
end;
$$;

comment on function public.st_group_expectation_status(uuid, date, date, date, uuid) is
  'Read-only status for saved group expectations. Uses the adherence session match and does not return set logs or personal session fields.';

revoke all on function public.st_group_expectation_status(uuid, date, date, date, uuid) from public, anon;
grant execute on function public.st_group_expectation_status(uuid, date, date, date, uuid) to authenticated;
