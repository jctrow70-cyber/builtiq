-- BIQ-0263 Phase 1: align group adherence with the expectation session match
-- Apply this file in the Supabase SQL Editor after 20261016_066_group_assigned_program_read.sql
-- and before 20261016_067_group_expectation_status.sql.
-- It replaces one function. It does not update or delete training rows.
-- It does not apply migration 065.
--
-- A linked session fulfills only that expectation. An unlinked session matches
-- a workout and date only when that member has exactly one expectation for the pair.
-- Completed, partial, skipped, excused, and missed totals use the same filters as before.
-- Past misses are not relabeled from a current pause.
--
-- Rollback: re-apply the st_group_schedule_adherence body from
-- 20261007_059_unified_training_schedule.sql.

create or replace function public.st_group_schedule_adherence(
  p_team_id uuid,
  p_from_date date,
  p_to_date date,
  p_local_today date
)
returns table (
  user_id uuid,
  expected_past integer,
  completed_past integer,
  partial_past integer,
  skipped_past integer,
  missed integer,
  due_today integer,
  completed_today integer,
  future integer,
  completion_rate numeric
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
  if p_team_id is null then
    raise exception 'Group is required';
  end if;
  if not exists (
    select 1 from public.st_team_members m
    where m.team_id = p_team_id and m.user_id = auth.uid() and m.status = 'active'
  ) and not public.st_user_can_edit_team(p_team_id) then
    raise exception 'Not authorized';
  end if;

  v_see_all := public.st_user_can_view_group_progress(p_team_id) or public.st_user_can_edit_team(p_team_id);

  return query
  with classified as (
    select
      e.user_id as member_id,
      e.scheduled_date,
      e.excused,
      sess.status as session_status,
      rec.status as recipient_status
    from public.st_training_expectations e
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
    where e.scheduled_date between p_from_date and p_to_date
      and (
        e.source_key = ('group:' || p_team_id::text)
        or (e.origin = 'assignment' and e.team_id = p_team_id)
      )
  )
  select
    tm.user_id,
    (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false))::integer,
    (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false and c.session_status = 'completed'))::integer,
    (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false and c.session_status = 'partial'))::integer,
    (count(*) filter (
      where c.scheduled_date < p_local_today and c.excused = false
        and (c.session_status = 'skipped' or (c.session_status is null and c.recipient_status = 'skipped'))
    ))::integer,
    (count(*) filter (
      where c.scheduled_date < p_local_today and c.excused = false
        and c.session_status is distinct from 'completed'
        and c.session_status is distinct from 'partial'
        and c.session_status is distinct from 'skipped'
        and coalesce(c.recipient_status, '') is distinct from 'skipped'
    ))::integer,
    (count(*) filter (
      where c.scheduled_date = p_local_today and c.excused = false and c.session_status is distinct from 'completed'
    ))::integer,
    (count(*) filter (where c.scheduled_date = p_local_today and c.excused = false and c.session_status = 'completed'))::integer,
    (count(*) filter (where c.scheduled_date > p_local_today and c.excused = false))::integer,
    case
      when (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false)) = 0 then null
      else round(
        (
          (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false and c.session_status = 'completed'))::numeric
          / (count(*) filter (where c.scheduled_date < p_local_today and c.excused = false))::numeric
        ) * 100,
        1
      )
    end
  from public.st_team_members tm
  left join classified c on c.member_id = tm.user_id
  where tm.team_id = p_team_id
    and tm.status = 'active'
    and (v_see_all or tm.user_id = auth.uid())
  group by tm.user_id;
end;
$$;

comment on function public.st_group_schedule_adherence(uuid, date, date, date) is
  'Group adherence totals. A linked session fulfills only its expectation. An unlinked session matches one workout and date.';

revoke all on function public.st_group_schedule_adherence(uuid, date, date, date) from public, anon;
grant execute on function public.st_group_schedule_adherence(uuid, date, date, date) to authenticated;
