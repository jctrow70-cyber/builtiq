-- BIQ-0263 Phase 3C. Apply in the Supabase SQL Editor after 070.
-- Do not edit or reapply migrations 068, 069, or 070.
-- One transaction. It does not insert expectations or rewrite logged planned sets.

begin;

alter table public.st_workout_sessions
  add column if not exists user_id uuid,
  add column if not exists workout_id uuid,
  add column if not exists log_date date,
  add column if not exists status text,
  add column if not exists completed_at timestamptz,
  add column if not exists expectation_id uuid,
  add column if not exists source_key text,
  add column if not exists scheduled_date date;

create table if not exists public.st_exercise_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  exercise_id uuid not null,
  workout_session_id uuid,
  log_date date not null,
  status text not null default 'not_started',
  skip_reason text,
  attempt_outcome text,
  created_at timestamptz not null default now()
);

alter table public.st_training_expectations
  add column if not exists excused boolean not null default false;

-- A live extra occupies a date. Skipped, moved-away, ended, and removed dates do not.
create or replace function public.st_group_extra_occupies_date(
  p_user_id uuid,
  p_workout_id uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and p_workout_id is not null and p_date is not null and (
    exists (
      select 1
      from public.st_group_activity_occurrences o
      join public.st_group_activity_series s on s.id = o.series_id
      join public.st_group_activity_recipients r
        on r.series_id = s.id and r.user_id = o.user_id
      where o.user_id = p_user_id
        and o.occurrence_date = p_date
        and coalesce(o.status, 'scheduled') <> 'skipped'
        and public.st_group_activity_effective_workout(o.workout_id, s.workout_id) = p_workout_id
        and (r.removed_on is null or p_date < r.removed_on)
        and (s.ended_on is null or p_date <= s.ended_on)
    )
    or exists (
      select 1
      from public.st_group_activity_series s
      join public.st_group_activity_recipients r
        on r.series_id = s.id and r.user_id = p_user_id
      where s.workout_id = p_workout_id
        and s.recurrence = 'weekly'
        and p_date >= s.start_date
        and (s.ended_on is null or p_date <= s.ended_on)
        and (s.recurrence_until is null or p_date <= s.recurrence_until)
        and (r.removed_on is null or p_date < r.removed_on)
        and public.st_group_weekday_index(p_date) = any (s.recurrence_weekdays)
        and not exists (
          select 1
          from public.st_group_activity_occurrences o
          where o.series_id = s.id
            and o.user_id = p_user_id
            and o.original_date = p_date
        )
    )
  );
$$;

revoke all on function public.st_group_extra_occupies_date(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.st_program_expectation_occupies_date(
  p_user_id uuid,
  p_workout_id uuid,
  p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null and p_workout_id is not null and p_date is not null and exists (
    select 1
    from public.st_training_expectations e
    where e.user_id = p_user_id
      and e.workout_id = p_workout_id
      and e.scheduled_date = p_date
      and coalesce(e.excused, false) = false
  );
$$;

revoke all on function public.st_program_expectation_occupies_date(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.st_group_series_conflicts_with_program(p_series_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_group_activity_series s
    join public.st_group_activity_recipients r on r.series_id = s.id
    join public.st_training_expectations e
      on e.user_id = r.user_id
     and e.workout_id = s.workout_id
     and coalesce(e.excused, false) = false
    where s.id = p_series_id
      and s.workout_id is not null
      and e.scheduled_date >= s.start_date
      and (s.ended_on is null or e.scheduled_date <= s.ended_on)
      and (s.recurrence_until is null or e.scheduled_date <= s.recurrence_until)
      and (r.removed_on is null or e.scheduled_date < r.removed_on)
      and (
        (s.recurrence <> 'weekly' and e.scheduled_date = s.start_date)
        or (
          s.recurrence = 'weekly'
          and public.st_group_weekday_index(e.scheduled_date) = any (s.recurrence_weekdays)
          and not exists (
            select 1
            from public.st_group_activity_occurrences o
            where o.series_id = s.id
              and o.user_id = r.user_id
              and o.original_date = e.scheduled_date
              and (
                o.occurrence_date is distinct from e.scheduled_date
                or coalesce(o.status, 'scheduled') = 'skipped'
              )
          )
        )
      )
  );
$$;

revoke all on function public.st_group_series_conflicts_with_program(uuid) from public, anon, authenticated;

create or replace function public.st_reject_group_program_extra_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_workout uuid;
begin
  if tg_table_name = 'st_training_expectations' then
    if coalesce(new.excused, false) or new.user_id is null or new.workout_id is null or new.scheduled_date is null then
      return new;
    end if;
    if public.st_group_extra_occupies_date(new.user_id, new.workout_id, new.scheduled_date) then
      raise exception 'That workout is already on this date as a group activity';
    end if;
    return new;
  end if;

  if tg_table_name = 'st_group_activity_recipients' then
    if public.st_group_series_conflicts_with_program(new.series_id) then
      raise exception 'That workout is already on the group program for this date';
    end if;
    return new;
  end if;

  if tg_table_name = 'st_group_activity_series' then
    if public.st_group_series_conflicts_with_program(new.id) then
      raise exception 'That workout is already on the group program for this date';
    end if;
    return new;
  end if;

  if coalesce(new.status, 'scheduled') = 'skipped' then
    return new;
  end if;
  select * into v_series from public.st_group_activity_series where id = new.series_id;
  if not found then
    return new;
  end if;
  if v_series.ended_on is not null and new.occurrence_date > v_series.ended_on then
    return new;
  end if;
  if exists (
    select 1
    from public.st_group_activity_recipients r
    where r.series_id = new.series_id
      and r.user_id = new.user_id
      and r.removed_on is not null
      and new.occurrence_date >= r.removed_on
  ) then
    return new;
  end if;
  v_workout := public.st_group_activity_effective_workout(new.workout_id, v_series.workout_id);
  if v_workout is not null and public.st_program_expectation_occupies_date(new.user_id, v_workout, new.occurrence_date) then
    raise exception 'That workout is already on the group program for this date';
  end if;
  return new;
end;
$$;

revoke all on function public.st_reject_group_program_extra_overlap() from public, anon;
grant execute on function public.st_reject_group_program_extra_overlap() to authenticated;

drop trigger if exists st_training_expectations_reject_group_extra on public.st_training_expectations;
create trigger st_training_expectations_reject_group_extra
  before insert or update of user_id, workout_id, scheduled_date, excused
  on public.st_training_expectations
  for each row execute function public.st_reject_group_program_extra_overlap();

drop trigger if exists st_group_activity_recipients_reject_program on public.st_group_activity_recipients;
create trigger st_group_activity_recipients_reject_program
  after insert on public.st_group_activity_recipients
  for each row execute function public.st_reject_group_program_extra_overlap();

drop trigger if exists st_group_activity_series_reject_program on public.st_group_activity_series;
create trigger st_group_activity_series_reject_program
  after update of workout_id, start_date, recurrence, recurrence_weekdays, recurrence_until, ended_on
  on public.st_group_activity_series
  for each row execute function public.st_reject_group_program_extra_overlap();

drop trigger if exists st_group_activity_occurrences_reject_program on public.st_group_activity_occurrences;
create trigger st_group_activity_occurrences_reject_program
  before insert or update of occurrence_date, workout_id, status, user_id
  on public.st_group_activity_occurrences
  for each row execute function public.st_reject_group_program_extra_overlap();

create or replace function public.st_guard_workout_session_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.expectation_id is not null and coalesce(new.source_key, '') like 'group-activity:%' then
      raise exception 'This workout is already logged on the group program for this date';
    end if;
    if coalesce(old.source_key, '') like 'group-activity:%'
      and (
        new.expectation_id is not null
        or coalesce(new.source_key, '') not like 'group-activity:%'
      )
    then
      raise exception 'This workout is already logged as a group activity on this date';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.st_guard_workout_session_context() from public, anon;
grant execute on function public.st_guard_workout_session_context() to authenticated;

drop trigger if exists st_workout_sessions_guard_context on public.st_workout_sessions;
create trigger st_workout_sessions_guard_context
  before update on public.st_workout_sessions
  for each row execute function public.st_guard_workout_session_context();

create or replace function public.st_expectation_has_session(p_expectation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_training_expectations e
    join public.st_workout_sessions s
      on s.user_id = e.user_id
     and (
       s.expectation_id = e.id
       or (
         e.workout_id is not null
         and s.expectation_id is null
         and s.workout_id = e.workout_id
         and s.log_date = e.scheduled_date
         and coalesce(s.source_key, '') not like 'group-activity:%'
       )
     )
    where e.id = p_expectation_id
  );
$$;

revoke all on function public.st_expectation_has_session(uuid) from public, anon;
grant execute on function public.st_expectation_has_session(uuid) to authenticated;

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
            and coalesce(s.source_key, '') not like 'group-activity:%'
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

revoke all on function public.st_group_schedule_adherence(uuid, date, date, date) from public, anon;
grant execute on function public.st_group_schedule_adherence(uuid, date, date, date) to authenticated;

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
          and coalesce(s.source_key, '') not like 'group-activity:%'
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

revoke all on function public.st_group_expectation_status(uuid, date, date, date, uuid) from public, anon;
grant execute on function public.st_group_expectation_status(uuid, date, date, date, uuid) to authenticated;

create or replace function public.st_user_can_log_group_strength_workout_date(
  p_workout_id uuid,
  p_log_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and p_workout_id is not null
    and p_log_date is not null
    and exists (
      select 1
      from public.st_workouts w
      join public.st_programs p on p.id = w.program_id
      join public.st_team_members tm
        on tm.team_id = p.team_id
       and tm.user_id = auth.uid()
       and tm.status = 'active'
      where w.id = p_workout_id
        and p.program_use = 'group_strength_shelf'
    )
    and public.st_group_extra_occupies_date(auth.uid(), p_workout_id, p_log_date);
$$;

revoke all on function public.st_user_can_log_group_strength_workout_date(uuid, date) from public, anon;
grant execute on function public.st_user_can_log_group_strength_workout_date(uuid, date) to authenticated;

create or replace function public.st_planned_set_on_strength_shelf(p_planned_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_planned_set_id is not null and exists (
    select 1
    from public.st_planned_sets ps
    join public.st_exercises e on e.id = ps.exercise_id
    join public.st_workouts w on w.id = e.workout_id
    join public.st_programs p on p.id = w.program_id
    where ps.id = p_planned_set_id
      and p.program_use = 'group_strength_shelf'
  );
$$;

revoke all on function public.st_planned_set_on_strength_shelf(uuid) from public, anon;
grant execute on function public.st_planned_set_on_strength_shelf(uuid) to authenticated;

create or replace function public.st_exercise_on_strength_shelf(p_exercise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_exercise_id is not null and exists (
    select 1
    from public.st_exercises e
    join public.st_workouts w on w.id = e.workout_id
    join public.st_programs p on p.id = w.program_id
    where e.id = p_exercise_id
      and p.program_use = 'group_strength_shelf'
  );
$$;

revoke all on function public.st_exercise_on_strength_shelf(uuid) from public, anon;
grant execute on function public.st_exercise_on_strength_shelf(uuid) to authenticated;

create or replace function public.st_user_can_log_group_strength_set(
  p_planned_set_id uuid,
  p_log_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_planned_sets ps
    join public.st_exercises e on e.id = ps.exercise_id
    where ps.id = p_planned_set_id
      and public.st_user_can_log_group_strength_workout_date(e.workout_id, p_log_date)
  );
$$;

revoke all on function public.st_user_can_log_group_strength_set(uuid, date) from public, anon;
grant execute on function public.st_user_can_log_group_strength_set(uuid, date) to authenticated;

alter table public.st_set_logs enable row level security;
alter table public.st_workout_sessions enable row level security;
alter table public.st_exercise_sessions enable row level security;

drop policy if exists st_set_logs_shelf_recipient_write on public.st_set_logs;
create policy st_set_logs_shelf_recipient_write
  on public.st_set_logs
  as restrictive
  for insert
  to authenticated
  with check (
    (
      planned_set_id is null
      or not public.st_planned_set_on_strength_shelf(planned_set_id)
      or (
        user_id = auth.uid()
        and public.st_user_can_log_group_strength_set(planned_set_id, log_date)
      )
    )
    and (
      exercise_id is null
      or planned_set_id is not null
      or not public.st_exercise_on_strength_shelf(exercise_id)
      or (
        user_id = auth.uid()
        and exists (
          select 1
          from public.st_exercises e
          where e.id = exercise_id
            and public.st_user_can_log_group_strength_workout_date(e.workout_id, log_date)
        )
      )
    )
  );

drop policy if exists st_set_logs_shelf_recipient_update on public.st_set_logs;
create policy st_set_logs_shelf_recipient_update
  on public.st_set_logs
  as restrictive
  for update
  to authenticated
  using (
    (
      planned_set_id is null
      or not public.st_planned_set_on_strength_shelf(planned_set_id)
      or user_id = auth.uid()
    )
    and (
      exercise_id is null
      or planned_set_id is not null
      or not public.st_exercise_on_strength_shelf(exercise_id)
      or user_id = auth.uid()
    )
  )
  with check (
    (
      planned_set_id is null
      or not public.st_planned_set_on_strength_shelf(planned_set_id)
      or (
        user_id = auth.uid()
        and public.st_user_can_log_group_strength_set(planned_set_id, log_date)
      )
    )
    and (
      exercise_id is null
      or planned_set_id is not null
      or not public.st_exercise_on_strength_shelf(exercise_id)
      or (
        user_id = auth.uid()
        and exists (
          select 1
          from public.st_exercises e
          where e.id = exercise_id
            and public.st_user_can_log_group_strength_workout_date(e.workout_id, log_date)
        )
      )
    )
  );

drop policy if exists st_workout_sessions_shelf_recipient_write on public.st_workout_sessions;
create policy st_workout_sessions_shelf_recipient_write
  on public.st_workout_sessions
  as restrictive
  for insert
  to authenticated
  with check (
    not exists (
      select 1
      from public.st_workouts w
      join public.st_programs p on p.id = w.program_id
      where w.id = workout_id
        and p.program_use = 'group_strength_shelf'
    )
    or (
      user_id = auth.uid()
      and public.st_user_can_log_group_strength_workout_date(workout_id, log_date)
    )
  );

drop policy if exists st_workout_sessions_shelf_recipient_update on public.st_workout_sessions;
create policy st_workout_sessions_shelf_recipient_update
  on public.st_workout_sessions
  as restrictive
  for update
  to authenticated
  using (
    not exists (
      select 1
      from public.st_workouts w
      join public.st_programs p on p.id = w.program_id
      where w.id = workout_id
        and p.program_use = 'group_strength_shelf'
    )
    or user_id = auth.uid()
  )
  with check (
    not exists (
      select 1
      from public.st_workouts w
      join public.st_programs p on p.id = w.program_id
      where w.id = workout_id
        and p.program_use = 'group_strength_shelf'
    )
    or (
      user_id = auth.uid()
      and public.st_user_can_log_group_strength_workout_date(workout_id, log_date)
    )
  );

drop policy if exists st_exercise_sessions_shelf_recipient_write on public.st_exercise_sessions;
create policy st_exercise_sessions_shelf_recipient_write
  on public.st_exercise_sessions
  as restrictive
  for insert
  to authenticated
  with check (
    not public.st_exercise_on_strength_shelf(exercise_id)
    or (
      user_id = auth.uid()
      and exists (
        select 1
        from public.st_exercises e
        where e.id = exercise_id
          and public.st_user_can_log_group_strength_workout_date(e.workout_id, log_date)
      )
    )
  );

drop policy if exists st_exercise_sessions_shelf_recipient_update on public.st_exercise_sessions;
create policy st_exercise_sessions_shelf_recipient_update
  on public.st_exercise_sessions
  as restrictive
  for update
  to authenticated
  using (
    not public.st_exercise_on_strength_shelf(exercise_id)
    or user_id = auth.uid()
  )
  with check (
    not public.st_exercise_on_strength_shelf(exercise_id)
    or (
      user_id = auth.uid()
      and exists (
        select 1
        from public.st_exercises e
        where e.id = exercise_id
          and public.st_user_can_log_group_strength_workout_date(e.workout_id, log_date)
      )
    )
  );

-- Pin every recorded performance, including duration and distance, before a series moves.
create or replace function public.st_pin_group_strength_history(
  p_series_id uuid,
  p_from date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_user uuid;
  v_date date;
begin
  select * into v_series from public.st_group_activity_series where id = p_series_id;
  if not found or v_series.workout_id is null then
    return;
  end if;
  for v_user, v_date in
    select distinct sl.user_id, sl.log_date
    from public.st_set_logs sl
    left join public.st_planned_sets ps on ps.id = sl.planned_set_id
    left join public.st_exercises e on e.id = coalesce(ps.exercise_id, sl.exercise_id)
    where e.workout_id = v_series.workout_id
      and public.st_group_strength_date_has_performance(v_series.workout_id, sl.user_id, sl.log_date)
      and (p_from is null or sl.log_date >= p_from)
  loop
    if exists (
      select 1 from public.st_group_activity_occurrences o
      where o.series_id = p_series_id
        and o.user_id = v_user
        and o.occurrence_date = v_date
    ) then
      continue;
    end if;
    if public.st_group_activity_slot_open(v_series, v_date)
      and exists (
        select 1 from public.st_group_activity_recipients r
        where r.series_id = p_series_id and r.user_id = v_user
      )
      and (p_from is null or v_date >= p_from)
    then
      perform public.st_group_activity_ensure_occurrence(p_series_id, v_user, v_date);
    end if;
  end loop;

  update public.st_group_activity_occurrences o
  set workout_id = v_series.workout_id
  where o.series_id = p_series_id
    and o.workout_id is null
    and (p_from is null or o.original_date >= p_from)
    and (
      o.completed
      or public.st_group_strength_date_has_performance(v_series.workout_id, o.user_id, o.occurrence_date)
    );
end;
$$;

revoke all on function public.st_pin_group_strength_history(uuid, date) from public, anon, authenticated;

-- A partial log keeps this occurrence on the workout that owns those planned sets.
create or replace function public.st_edit_group_strength_occurrence(
  p_series_id uuid,
  p_user_id uuid,
  p_original_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_id uuid;
  v_row public.st_group_activity_occurrences;
  v_workout uuid;
  v_clone uuid;
begin
  v_series := public.st_group_activity_require_change(p_series_id);
  if v_series.activity_type <> 'strength' or v_series.workout_id is null then
    raise exception 'This activity is not a group strength workout';
  end if;
  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  v_id := public.st_group_activity_ensure_occurrence(p_series_id, p_user_id, p_original_date);
  select * into v_row from public.st_group_activity_occurrences where id = v_id;
  if v_row.completed then
    raise exception 'Completed group activity history cannot be changed';
  end if;
  v_workout := public.st_group_activity_effective_workout(v_row.workout_id, v_series.workout_id);
  if public.st_group_strength_date_has_performance(v_workout, p_user_id, v_row.occurrence_date) then
    if v_row.workout_id is null then
      update public.st_group_activity_occurrences
      set workout_id = v_workout
      where id = v_id;
    end if;
    return jsonb_build_object(
      'workout_id', coalesce(v_row.workout_id, v_workout),
      'cloned', false
    );
  end if;
  if v_row.workout_id is not null and not public.st_group_strength_workout_has_performance(v_row.workout_id) then
    return jsonb_build_object('workout_id', v_row.workout_id, 'cloned', false);
  end if;
  if not public.st_group_strength_workout_has_performance(v_workout) then
    return jsonb_build_object('workout_id', v_workout, 'cloned', false);
  end if;
  v_clone := public.st_clone_group_strength_workout(v_series.workout_id);
  update public.st_group_activity_occurrences
  set workout_id = v_clone
  where id = v_id;
  return jsonb_build_object('workout_id', v_clone, 'cloned', true);
end;
$$;

revoke all on function public.st_edit_group_strength_occurrence(uuid, uuid, date) from public, anon;
grant execute on function public.st_edit_group_strength_occurrence(uuid, uuid, date) to authenticated;

create or replace function public.st_complete_group_activity_occurrence(
  p_series_id uuid,
  p_user_id uuid,
  p_original_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.st_group_activity_series;
  v_id uuid;
  v_row public.st_group_activity_occurrences;
  v_removed date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_series from public.st_group_activity_series where id = p_series_id;
  if not found then
    raise exception 'Activity not found';
  end if;
  if not exists (
    select 1 from public.st_team_members tm
    where tm.team_id = v_series.team_id and tm.user_id = auth.uid() and tm.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;
  if p_user_id is distinct from auth.uid() and not public.st_user_can_assign_in_group(v_series.team_id) then
    raise exception 'Not authorized';
  end if;
  if not exists (
    select 1 from public.st_group_activity_recipients r
    where r.series_id = p_series_id and r.user_id = p_user_id
  ) then
    raise exception 'Member not found';
  end if;

  perform public.st_group_activity_lock(v_series.team_id, v_series.workout_id, p_series_id);
  perform pg_advisory_xact_lock(hashtext(p_series_id::text || ':' || p_user_id::text || ':' || p_original_date::text)::bigint);
  v_id := public.st_group_activity_ensure_occurrence(p_series_id, p_user_id, p_original_date);
  select * into v_row from public.st_group_activity_occurrences where id = v_id;
  if v_row.completed then
    return jsonb_build_object(
      'occurrence_id', v_row.id,
      'series_id', v_row.series_id,
      'user_id', v_row.user_id,
      'original_date', v_row.original_date,
      'occurrence_date', v_row.occurrence_date,
      'activity_type', v_row.activity_type,
      'title', v_row.title,
      'duration_minutes', v_row.duration_minutes,
      'notes', v_row.notes,
      'details', v_row.details,
      'already_completed', true
    );
  end if;

  select r.removed_on into v_removed
  from public.st_group_activity_recipients r
  where r.series_id = p_series_id and r.user_id = p_user_id;
  if v_removed is not null and v_row.occurrence_date >= v_removed then
    raise exception 'That member is no longer assigned on this date';
  end if;
  if v_series.ended_on is not null and v_row.occurrence_date > v_series.ended_on then
    raise exception 'That date is not on this series';
  end if;

  update public.st_group_activity_occurrences o
  set
    completed = true,
    snapshotted = true,
    status = 'scheduled',
    activity_type = coalesce(o.activity_type, s.activity_type),
    title = coalesce(o.title, s.title),
    duration_minutes = coalesce(o.duration_minutes, s.duration_minutes),
    notes = coalesce(o.notes, s.notes),
    details = coalesce(o.details, s.details)
  from public.st_group_activity_series s
  where o.id = v_id
    and s.id = o.series_id
    and o.completed = false
  returning o.* into v_row;
  if v_row.id is null then
    raise exception 'Activity not found';
  end if;

  return jsonb_build_object(
    'occurrence_id', v_row.id,
    'series_id', v_row.series_id,
    'user_id', v_row.user_id,
    'original_date', v_row.original_date,
    'occurrence_date', v_row.occurrence_date,
    'activity_type', v_row.activity_type,
    'title', v_row.title,
    'duration_minutes', v_row.duration_minutes,
    'notes', v_row.notes,
    'details', v_row.details,
    'already_completed', false
  );
end;
$$;

revoke all on function public.st_complete_group_activity_occurrence(uuid, uuid, date) from public, anon;
grant execute on function public.st_complete_group_activity_occurrence(uuid, uuid, date) to authenticated;

commit;
