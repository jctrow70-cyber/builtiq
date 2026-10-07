-- BIQ-0245 Unified Training Schedule
-- Apply manually after 054, 055, 056, 057, and 058. Do not run this from the app.
-- Expectations are written when training becomes effective. Opening Training does not create them.
-- A workout scheduled for the local today is due, not missed. Historical adherence uses scheduled_date < local today.
-- Hiding a source does not delete expectation rows. Stopping future expectation does not end membership.

alter table public.st_training_enrollments
  add column if not exists schedule_visible boolean not null default false,
  add column if not exists expectation_enabled boolean not null default false,
  add column if not exists starts_on date,
  add column if not exists ended_on date;

comment on column public.st_training_enrollments.schedule_visible is
  'Personal combined Training display only. Hiding a source does not delete expectations or change adherence.';
comment on column public.st_training_enrollments.expectation_enabled is
  'Whether future required training should generate expectations. Historical rows stay when this is turned off.';
comment on column public.st_training_enrollments.starts_on is
  'First local date this enrollment can expect training. Does not shift when participation is paused.';
comment on column public.st_training_enrollments.ended_on is
  'Local date participation ended. Distinct from schedule visibility and expectation.';

create table if not exists public.st_training_program_segments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.st_training_enrollments(id) on delete cascade,
  program_id uuid not null references public.st_programs(id) on delete cascade,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create unique index if not exists st_training_program_segments_one_open
  on public.st_training_program_segments (enrollment_id)
  where ends_on is null;

create index if not exists st_training_program_segments_program_idx
  on public.st_training_program_segments (program_id);

comment on table public.st_training_program_segments is
  'Which program applies to an enrollment over a period. One open segment per enrollment. Historical expectations keep their segment.';

create table if not exists public.st_training_expectations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  team_id uuid references public.st_teams(id) on delete cascade,
  enrollment_id uuid references public.st_training_enrollments(id) on delete cascade,
  program_id uuid references public.st_programs(id) on delete set null,
  segment_id uuid references public.st_training_program_segments(id) on delete set null,
  workout_id uuid references public.st_workouts(id) on delete set null,
  assignment_id uuid references public.st_workout_assignments(id) on delete cascade,
  assignment_recipient_id uuid references public.st_assignment_recipients(id) on delete cascade,
  scheduled_date date not null,
  title text not null default 'Workout',
  day_label text,
  origin text not null check (origin in ('program', 'assignment')),
  excused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (origin = 'program' and enrollment_id is not null and workout_id is not null and assignment_recipient_id is null)
    or (origin = 'assignment' and assignment_recipient_id is not null)
  )
);

create unique index if not exists st_training_expectations_program_identity
  on public.st_training_expectations (user_id, source_key, workout_id, scheduled_date)
  where origin = 'program' and workout_id is not null;

create unique index if not exists st_training_expectations_assignment_identity
  on public.st_training_expectations (assignment_recipient_id)
  where origin = 'assignment' and assignment_recipient_id is not null;

create index if not exists st_training_expectations_user_date_idx
  on public.st_training_expectations (user_id, scheduled_date);

create index if not exists st_training_expectations_source_date_idx
  on public.st_training_expectations (source_key, scheduled_date);

comment on table public.st_training_expectations is
  'This person was expected to perform this workout from this source on this local date. Does not copy exercises or sets.';

alter table public.st_workout_sessions
  add column if not exists expectation_id uuid references public.st_training_expectations(id) on delete set null,
  add column if not exists source_key text,
  add column if not exists scheduled_date date;

comment on column public.st_workout_sessions.expectation_id is
  'The scheduled expectation this performed workout fulfills. Completion is not "any workout that day".';

create or replace function public.st_schedule_day_label(p_date date)
returns text
language sql
immutable
as $$
  select (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from p_date)::int + 1];
$$;

create or replace function public.st_schedule_monday(p_date date)
returns date
language sql
immutable
as $$
  select (p_date - ((extract(dow from p_date)::int + 6) % 7))::date;
$$;

create or replace function public.st_program_cycle_weeks(p_weeks numeric, p_cycle numeric)
returns integer
language sql
immutable
as $$
  select case
    when p_weeks is not null and p_weeks >= 1 then least(52, floor(p_weeks)::int)
    when p_cycle is not null and p_cycle >= 1 then least(52, floor(p_cycle)::int)
    else 6
  end;
$$;

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
       or (e.workout_id is not null and s.workout_id = e.workout_id and s.log_date = e.scheduled_date)
     )
    where e.id = p_expectation_id
  );
$$;

create or replace function public.st_guard_training_expectation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cut text;
  v_cut_date date;
begin
  v_cut := nullif(current_setting('app.expectation_effective_on', true), '');
  v_cut_date := coalesce(v_cut::date, current_date);
  if tg_op = 'DELETE' then
    if old.scheduled_date < v_cut_date then
      raise exception 'Past training expectations cannot be removed by a schedule refresh';
    end if;
    if old.scheduled_date = v_cut_date and public.st_expectation_has_session(old.id) then
      raise exception 'Today''s expectation is frozen because a workout session exists';
    end if;
    return old;
  end if;
  if old.scheduled_date < v_cut_date and (
    new.scheduled_date is distinct from old.scheduled_date
    or new.workout_id is distinct from old.workout_id
    or new.program_id is distinct from old.program_id
    or new.segment_id is distinct from old.segment_id
    or new.title is distinct from old.title
    or new.day_label is distinct from old.day_label
    or new.origin is distinct from old.origin
    or new.user_id is distinct from old.user_id
    or new.source_key is distinct from old.source_key
  ) then
    raise exception 'Past training expectations are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists st_training_expectations_guard on public.st_training_expectations;
create trigger st_training_expectations_guard
  before update or delete on public.st_training_expectations
  for each row execute function public.st_guard_training_expectation();

create or replace function public.st_withdraw_future_program_expectations(
  p_enrollment_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.expectation_effective_on', p_effective_on::text, true);
  delete from public.st_training_expectations e
  where e.enrollment_id = p_enrollment_id
    and e.origin = 'program'
    and (
      e.scheduled_date > p_effective_on
      or (
        e.scheduled_date = p_effective_on
        and not public.st_expectation_has_session(e.id)
      )
    );
end;
$$;

create or replace function public.st_refresh_enrollment_expectations(
  p_enrollment_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enroll public.st_training_enrollments%rowtype;
  v_program public.st_programs%rowtype;
  v_segment_id uuid;
  v_anchor date;
  v_weeks integer;
  v_end date;
  v_from date;
  v_date date;
  v_week integer;
  v_today_frozen boolean;
  v_workout record;
begin
  select * into v_enroll from public.st_training_enrollments where id = p_enrollment_id;
  if not found or v_enroll.program_id is null then
    return;
  end if;

  select s.id into v_segment_id
  from public.st_training_program_segments s
  where s.enrollment_id = v_enroll.id and s.ends_on is null
  order by s.starts_on desc
  limit 1;

  select * into v_program from public.st_programs where id = v_enroll.program_id;
  if not found then
    return;
  end if;

  perform set_config('app.expectation_effective_on', p_effective_on::text, true);
  v_today_frozen := exists (
    select 1
    from public.st_training_expectations e
    where e.enrollment_id = v_enroll.id
      and e.origin = 'program'
      and e.scheduled_date = p_effective_on
      and public.st_expectation_has_session(e.id)
  );

  delete from public.st_training_expectations e
  where e.enrollment_id = v_enroll.id
    and e.origin = 'program'
    and e.scheduled_date > p_effective_on;

  if not v_today_frozen then
    delete from public.st_training_expectations e
    where e.enrollment_id = v_enroll.id
      and e.origin = 'program'
      and e.scheduled_date = p_effective_on
      and not public.st_expectation_has_session(e.id);
  end if;

  if v_enroll.status <> 'active' or not v_enroll.expectation_enabled then
    return;
  end if;

  v_weeks := public.st_program_cycle_weeks(v_program.weeks::numeric, v_program.cycle_length_weeks::numeric);
  v_anchor := public.st_schedule_monday(
    case
      when v_enroll.source_kind = 'personal' then coalesce(v_enroll.starts_on, v_program.start_date, p_effective_on)
      else coalesce(v_program.start_date, v_enroll.starts_on, p_effective_on)
    end
  );
  v_end := v_anchor + (v_weeks * 7 - 1);
  v_from := greatest(p_effective_on, coalesce(v_enroll.starts_on, p_effective_on));
  if v_from > v_end then
    return;
  end if;

  v_date := v_from;
  while v_date <= v_end loop
    if v_today_frozen and v_date = p_effective_on then
      v_date := v_date + 1;
      continue;
    end if;
    v_week := ((v_date - v_anchor) / 7) + 1;
    if v_week >= 1 and v_week <= v_weeks then
      for v_workout in
        select w.id, w.day_label, w.workout_type
        from public.st_workouts w
        where w.program_id = v_enroll.program_id
          and w.week = v_week
          and w.day_label = public.st_schedule_day_label(v_date)
      loop
        insert into public.st_training_expectations (
          user_id, source_key, team_id, enrollment_id, program_id, segment_id, workout_id,
          scheduled_date, title, day_label, origin, excused
        ) values (
          v_enroll.user_id,
          v_enroll.source_key,
          v_enroll.team_id,
          v_enroll.id,
          v_enroll.program_id,
          v_segment_id,
          v_workout.id,
          v_date,
          coalesce(nullif(trim(v_workout.workout_type), ''), nullif(trim(v_workout.day_label), ''), 'Workout'),
          v_workout.day_label,
          'program',
          false
        )
        on conflict (user_id, source_key, workout_id, scheduled_date)
          where origin = 'program' and workout_id is not null
          do nothing;
      end loop;
    end if;
    v_date := v_date + 1;
  end loop;
end;
$$;

create or replace function public.st_sync_enrollment_schedule(
  p_enrollment_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enroll public.st_training_enrollments%rowtype;
  v_segment_id uuid;
  v_segment_program uuid;
  v_segment_start date;
begin
  select * into v_enroll from public.st_training_enrollments where id = p_enrollment_id;
  if not found then
    return;
  end if;

  perform set_config('app.expectation_effective_on', p_effective_on::text, true);

  if v_enroll.program_id is not null and v_enroll.status = 'active' then
    select s.id, s.program_id, s.starts_on
      into v_segment_id, v_segment_program, v_segment_start
    from public.st_training_program_segments s
    where s.enrollment_id = v_enroll.id and s.ends_on is null
    order by s.starts_on desc
    limit 1;

    if v_segment_id is null then
      insert into public.st_training_program_segments (enrollment_id, program_id, starts_on)
      values (v_enroll.id, v_enroll.program_id, coalesce(v_enroll.starts_on, p_effective_on));
    elsif v_segment_program is distinct from v_enroll.program_id then
      if v_segment_start >= p_effective_on then
        update public.st_training_program_segments
        set program_id = v_enroll.program_id
        where id = v_segment_id;
      else
        update public.st_training_program_segments
        set ends_on = p_effective_on - 1
        where id = v_segment_id and ends_on is null;
        insert into public.st_training_program_segments (enrollment_id, program_id, starts_on)
        values (v_enroll.id, v_enroll.program_id, p_effective_on);
      end if;
    end if;
  end if;

  if v_enroll.status = 'active' and v_enroll.expectation_enabled and v_enroll.program_id is not null then
    perform public.st_refresh_enrollment_expectations(v_enroll.id, p_effective_on);
  else
    perform public.st_withdraw_future_program_expectations(v_enroll.id, p_effective_on);
  end if;
end;
$$;

create or replace function public.st_refresh_program_expectations(
  p_program_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_edit_program(p_program_id) then
    raise exception 'Not authorized';
  end if;
  perform set_config('app.expectation_effective_on', p_effective_on::text, true);
  for v_id in
    select e.id
    from public.st_training_enrollments e
    join public.st_training_program_segments s
      on s.enrollment_id = e.id and s.ends_on is null and s.program_id = p_program_id
    where e.status = 'active' and e.expectation_enabled
  loop
    perform public.st_refresh_enrollment_expectations(v_id, p_effective_on);
  end loop;
end;
$$;

create or replace function public.st_set_enrollment_schedule_visible(
  p_enrollment_id uuid,
  p_visible boolean
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
  update public.st_training_enrollments
  set schedule_visible = p_visible, updated_at = now()
  where id = p_enrollment_id and user_id = auth.uid();
  if not found then
    raise exception 'Not authorized';
  end if;
end;
$$;

create or replace function public.st_set_enrollment_expectation(
  p_enrollment_id uuid,
  p_enabled boolean,
  p_effective_on date
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
  if not exists (
    select 1 from public.st_training_enrollments
    where id = p_enrollment_id and user_id = auth.uid() and status <> 'ended'
  ) then
    raise exception 'Not authorized';
  end if;
  perform set_config('app.expectation_effective_on', p_effective_on::text, true);
  update public.st_training_enrollments
  set expectation_enabled = p_enabled, updated_at = now()
  where id = p_enrollment_id and user_id = auth.uid();
end;
$$;

create or replace function public.st_activate_followed_program(
  p_program_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program public.st_programs%rowtype;
  v_team uuid;
  v_just_me boolean;
  v_key text;
begin
  if auth.uid() is null or p_program_id is null then
    return;
  end if;
  select * into v_program from public.st_programs where id = p_program_id;
  if not found then
    return;
  end if;

  v_just_me := v_program.visibility = 'personal'
    and v_program.owner_user_id = auth.uid()
    and v_program.source_program_id is not null
    and lower(coalesce(v_program.status, '')) <> 'archived'
    and v_program.name ilike '%(just me)%';

  perform set_config('app.expectation_effective_on', p_effective_on::text, true);

  if v_just_me then
    select p.team_id into v_team
    from public.st_programs p
    where p.id = v_program.source_program_id;
    if v_team is null then
      return;
    end if;
    if not exists (
      select 1 from public.st_team_members m
      where m.team_id = v_team and m.user_id = auth.uid() and m.status = 'active'
    ) then
      return;
    end if;
    v_key := 'group:' || v_team::text;
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      auth.uid(), 'group', v_key, v_team, v_program.id, 'active', true, true, p_effective_on
    )
    on conflict (user_id, source_key) do update
      set program_id = excluded.program_id,
          status = 'active',
          schedule_visible = true,
          expectation_enabled = true,
          ended_on = null,
          starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
          updated_at = now()
      where public.st_training_enrollments.source_kind = 'group';
    return;
  end if;

  if v_program.visibility = 'team' and v_program.team_id is not null then
    if not exists (
      select 1 from public.st_team_members m
      where m.team_id = v_program.team_id and m.user_id = auth.uid() and m.status = 'active'
    ) then
      return;
    end if;
    v_key := 'group:' || v_program.team_id::text;
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      auth.uid(), 'group', v_key, v_program.team_id, v_program.id, 'active', true, true, p_effective_on
    )
    on conflict (user_id, source_key) do update
      set program_id = excluded.program_id,
          status = 'active',
          schedule_visible = true,
          expectation_enabled = true,
          ended_on = null,
          starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
          updated_at = now()
      where public.st_training_enrollments.source_kind = 'group';
    return;
  end if;

  if v_program.visibility = 'personal' and v_program.owner_user_id = auth.uid() then
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      auth.uid(), 'personal', 'personal', null, v_program.id, 'active', true, true, p_effective_on
    )
    on conflict (user_id, source_key) do update
      set program_id = excluded.program_id,
          status = 'active',
          schedule_visible = true,
          expectation_enabled = true,
          ended_on = null,
          starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
          updated_at = now()
      where public.st_training_enrollments.source_kind = 'personal'
        and public.st_training_enrollments.source_key = 'personal';
  end if;
end;
$$;

create or replace function public.st_repair_followed_training_schedule(p_local_today date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_followed uuid;
  v_enrollment uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select pr.followed_program_id into v_followed
  from public.st_profiles pr
  where pr.user_id = auth.uid();
  if v_followed is null then
    return;
  end if;

  if exists (
    select 1
    from public.st_training_enrollments e
    where e.user_id = auth.uid()
      and e.program_id = v_followed
      and e.schedule_visible = true
      and e.status = 'active'
  ) then
    select e.id into v_enrollment
    from public.st_training_enrollments e
    where e.user_id = auth.uid()
      and e.program_id = v_followed
      and e.schedule_visible = true
      and e.expectation_enabled = true
      and e.status = 'active'
    limit 1;
    if v_enrollment is not null and not exists (
      select 1
      from public.st_training_expectations x
      where x.enrollment_id = v_enrollment and x.origin = 'program'
    ) then
      perform public.st_sync_enrollment_schedule(v_enrollment, p_local_today);
    end if;
    return;
  end if;

  select e.id into v_enrollment
  from public.st_training_enrollments e
  where e.user_id = auth.uid()
    and e.program_id = v_followed
    and e.status <> 'ended'
  order by case when e.source_kind = 'group' then 0 else 1 end, e.created_at
  limit 1;

  if v_enrollment is null then
    perform public.st_activate_followed_program(v_followed, p_local_today);
    return;
  end if;

  perform set_config('app.expectation_effective_on', p_local_today::text, true);
  update public.st_training_enrollments
  set schedule_visible = true,
      expectation_enabled = true,
      status = 'active',
      starts_on = coalesce(starts_on, p_local_today),
      updated_at = now()
  where id = v_enrollment
    and user_id = auth.uid();
end;
$$;

create or replace function public.st_withdraw_assignment_expectation(
  p_recipient_id uuid,
  p_effective_on date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scheduled date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select a.scheduled_date into v_scheduled
  from public.st_assignment_recipients r
  join public.st_workout_assignments a on a.id = r.assignment_id
  where r.id = p_recipient_id and r.user_id = auth.uid();
  if v_scheduled is null or v_scheduled <= p_effective_on then
    return;
  end if;
  perform set_config('app.expectation_effective_on', p_effective_on::text, true);
  delete from public.st_training_expectations e
  where e.assignment_recipient_id = p_recipient_id
    and e.origin = 'assignment'
    and e.scheduled_date > p_effective_on;
end;
$$;

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
          or (e.workout_id is not null and s.workout_id = e.workout_id and s.log_date = e.scheduled_date)
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

create or replace function public.st_training_enrollment_schedule_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective date;
begin
  if tg_op = 'UPDATE'
     and new.program_id is not distinct from old.program_id
     and new.expectation_enabled is not distinct from old.expectation_enabled
     and new.status is not distinct from old.status then
    return new;
  end if;
  v_effective := coalesce(nullif(current_setting('app.expectation_effective_on', true), '')::date, current_date);
  perform public.st_sync_enrollment_schedule(new.id, v_effective);
  return new;
end;
$$;

create or replace function public.st_program_schedule_refresh_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective date;
begin
  if new.start_date is not distinct from old.start_date
     and new.weeks is not distinct from old.weeks
     and new.cycle_length_weeks is not distinct from old.cycle_length_weeks then
    return new;
  end if;
  if auth.uid() is not null and public.st_user_can_edit_program(new.id) then
    v_effective := coalesce(nullif(current_setting('app.expectation_effective_on', true), '')::date, current_date);
    perform public.st_refresh_program_expectations(new.id, v_effective);
  end if;
  return new;
end;
$$;

create or replace function public.st_workout_schedule_refresh_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program uuid;
  v_effective date;
begin
  v_program := coalesce(new.program_id, old.program_id);
  if v_program is null then
    return coalesce(new, old);
  end if;
  if auth.uid() is not null and public.st_user_can_edit_program(v_program) then
    v_effective := coalesce(nullif(current_setting('app.expectation_effective_on', true), '')::date, current_date);
    perform public.st_refresh_program_expectations(v_program, v_effective);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.st_assignment_recipient_expectation_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment public.st_workout_assignments%rowtype;
  v_day text;
  v_title text;
  v_scheduled date;
begin
  if tg_op = 'INSERT' then
    select * into v_assignment from public.st_workout_assignments where id = new.assignment_id;
    if not found or v_assignment.team_id is null then
      return new;
    end if;
    select w.day_label into v_day from public.st_workouts w where w.id = v_assignment.workout_id;
    v_title := coalesce(nullif(trim(v_assignment.title), ''), nullif(trim(v_day), ''), 'Workout');
    v_scheduled := coalesce(v_assignment.scheduled_date, current_date);
    insert into public.st_training_expectations (
      user_id, source_key, team_id, workout_id, assignment_id, assignment_recipient_id,
      scheduled_date, title, day_label, origin, excused
    ) values (
      new.user_id,
      'group:' || v_assignment.team_id::text,
      v_assignment.team_id,
      v_assignment.workout_id,
      v_assignment.id,
      new.id,
      v_scheduled,
      v_title,
      v_day,
      'assignment',
      false
    )
    on conflict (assignment_recipient_id) where origin = 'assignment' and assignment_recipient_id is not null
    do nothing;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('cancelled', 'skipped') then
    select a.scheduled_date into v_scheduled
    from public.st_workout_assignments a
    where a.id = new.assignment_id;
    if v_scheduled is not null and v_scheduled > current_date then
      perform set_config('app.expectation_effective_on', current_date::text, true);
      delete from public.st_training_expectations e
      where e.assignment_recipient_id = new.id
        and e.origin = 'assignment'
        and e.scheduled_date > current_date;
    end if;
  end if;
  return new;
end;
$$;

-- Existing rows default to hidden and not expected. Only the followed program is revealed.
update public.st_training_enrollments e
set schedule_visible = true,
    expectation_enabled = true,
    starts_on = coalesce(
      e.starts_on,
      public.st_schedule_monday(coalesce(p.start_date, current_date))
    )
from public.st_profiles pr
join public.st_programs p on p.id = pr.followed_program_id
where e.user_id = pr.user_id
  and e.program_id = pr.followed_program_id
  and e.status <> 'ended';

insert into public.st_training_program_segments (enrollment_id, program_id, starts_on)
select e.id, e.program_id, coalesce(e.starts_on, current_date)
from public.st_training_enrollments e
where e.program_id is not null
  and e.status <> 'ended'
  and not exists (
    select 1
    from public.st_training_program_segments s
    where s.enrollment_id = e.id and s.ends_on is null
  );

do $$
declare
  v_id uuid;
begin
  for v_id in
    select e.id
    from public.st_training_enrollments e
    where e.expectation_enabled = true
      and e.status = 'active'
      and e.program_id is not null
  loop
    perform public.st_sync_enrollment_schedule(v_id, current_date);
  end loop;
end $$;

drop trigger if exists st_training_enrollments_schedule on public.st_training_enrollments;
create trigger st_training_enrollments_schedule
  after insert or update of program_id, expectation_enabled, status
  on public.st_training_enrollments
  for each row execute function public.st_training_enrollment_schedule_trigger();

drop trigger if exists st_programs_schedule_refresh on public.st_programs;
create trigger st_programs_schedule_refresh
  after update of start_date, weeks, cycle_length_weeks
  on public.st_programs
  for each row execute function public.st_program_schedule_refresh_trigger();

drop trigger if exists st_workouts_schedule_refresh on public.st_workouts;
create trigger st_workouts_schedule_refresh
  after insert or update of week, day_label, workout_type, program_id or delete
  on public.st_workouts
  for each row execute function public.st_workout_schedule_refresh_trigger();

drop trigger if exists st_assignment_recipients_expectation on public.st_assignment_recipients;
create trigger st_assignment_recipients_expectation
  after insert or update of status
  on public.st_assignment_recipients
  for each row execute function public.st_assignment_recipient_expectation_trigger();

-- New joins turn the group source on and materialize in this same function's transaction.
create or replace function public.st_ensure_group_participation(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program uuid;
  v_key text;
begin
  if auth.uid() is null or p_team_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.st_team_members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  ) then
    return;
  end if;

  v_key := 'group:' || p_team_id::text;
  if v_key = 'personal' then
    raise exception 'Refusing to change personal training';
  end if;

  select t.default_program_id into v_program
  from public.st_teams t
  where t.id = p_team_id;

  perform set_config('app.expectation_effective_on', current_date::text, true);
  insert into public.st_training_enrollments (
    user_id, source_kind, source_key, team_id, program_id, status,
    schedule_visible, expectation_enabled, starts_on
  )
  values (auth.uid(), 'group', v_key, p_team_id, v_program, 'active', true, true, current_date)
  on conflict (user_id, source_key) do update
    set status = 'active',
        schedule_visible = true,
        expectation_enabled = true,
        ended_on = null,
        updated_at = now(),
        starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
        program_id = coalesce(public.st_training_enrollments.program_id, excluded.program_id)
    where public.st_training_enrollments.source_kind = 'group'
      and public.st_training_enrollments.source_key <> 'personal';
exception
  when undefined_table then
    return;
end;
$$;

revoke all on function public.st_ensure_group_participation(uuid) from public, anon, authenticated;

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
declare
  v_assignment_id uuid;
  v_key text;
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
  )
  returning id into v_assignment_id;

  update public.st_team_members
  set training_source = case when p_assignment_type = 'personal' then 'personal' else 'team' end
  where team_id = p_team_id and user_id = p_member_user_id and status = 'active';

  if p_program_id is not null and p_assignment_type <> 'personal' then
    v_key := 'group:' || p_team_id::text;
    perform set_config('app.expectation_effective_on', current_date::text, true);
    insert into public.st_training_enrollments (
      user_id, source_kind, source_key, team_id, program_id, status,
      schedule_visible, expectation_enabled, starts_on
    ) values (
      p_member_user_id, 'group', v_key, p_team_id, p_program_id, 'active', true, true, current_date
    )
    on conflict (user_id, source_key) do update
      set program_id = excluded.program_id,
          status = 'active',
          schedule_visible = true,
          expectation_enabled = true,
          ended_on = null,
          starts_on = coalesce(public.st_training_enrollments.starts_on, excluded.starts_on),
          updated_at = now();
  end if;

  perform public.st_notify_program_assignment(
    v_assignment_id, p_team_id, p_member_user_id, p_program_id, p_assignment_type
  );
end;
$$;

alter table public.st_training_program_segments enable row level security;
alter table public.st_training_expectations enable row level security;

drop policy if exists "training_segments_select" on public.st_training_program_segments;
create policy "training_segments_select" on public.st_training_program_segments
  for select using (
    exists (
      select 1
      from public.st_training_enrollments e
      where e.id = enrollment_id
        and (
          e.user_id = auth.uid()
          or (e.team_id is not null and public.st_user_can_edit_team(e.team_id))
        )
    )
  );

drop policy if exists "training_expectations_select" on public.st_training_expectations;
create policy "training_expectations_select" on public.st_training_expectations
  for select using (
    user_id = auth.uid()
    or (team_id is not null and public.st_user_can_edit_team(team_id))
    or (
      source_key like 'group:%'
      and public.st_user_can_edit_team(substring(source_key from 7)::uuid)
    )
  );

revoke insert, update, delete on public.st_training_program_segments from anon, authenticated;
revoke insert, update, delete on public.st_training_expectations from anon, authenticated;
grant select on public.st_training_program_segments to authenticated;
grant select on public.st_training_expectations to authenticated;

revoke all on function public.st_set_enrollment_schedule_visible(uuid, boolean) from public, anon;
revoke all on function public.st_set_enrollment_expectation(uuid, boolean, date) from public, anon;
revoke all on function public.st_activate_followed_program(uuid, date) from public, anon;
revoke all on function public.st_repair_followed_training_schedule(date) from public, anon;
revoke all on function public.st_withdraw_assignment_expectation(uuid, date) from public, anon;
revoke all on function public.st_group_schedule_adherence(uuid, date, date, date) from public, anon;
revoke all on function public.st_refresh_program_expectations(uuid, date) from public, anon;

grant execute on function public.st_set_enrollment_schedule_visible(uuid, boolean) to authenticated;
grant execute on function public.st_set_enrollment_expectation(uuid, boolean, date) to authenticated;
grant execute on function public.st_activate_followed_program(uuid, date) to authenticated;
grant execute on function public.st_repair_followed_training_schedule(date) to authenticated;
grant execute on function public.st_withdraw_assignment_expectation(uuid, date) to authenticated;
grant execute on function public.st_group_schedule_adherence(uuid, date, date, date) to authenticated;
grant execute on function public.st_refresh_program_expectations(uuid, date) to authenticated;
