-- BIQ-0264 Phase 2B.2 batch training days, pause, and resume.
-- Apply manually after 20261022_071_group_strength_logging.sql. Do not run this from the app.
-- Not applied to hosted Supabase by this change. Do not edit migrations 068, 069, 070, or 071.
-- One transaction. One invalid member rolls back the whole batch. Personal enrollments and other groups are not updated.
--
-- Timezone: st_teams.timezone is added by 20261024_073_group_timezone.sql. Apply that
-- migration before calling this function. Existing groups stay null. This batch requires
-- a configured group timezone and does not read the browser date. p_effective_on and
-- p_local_today must both equal (timezone(st_teams.timezone, now()))::date. The function
-- then sets the transaction time zone to that group zone so the single-member functions
-- see the same calendar date. A null timezone raises. Direct single-member calls are
-- unchanged and still accept a null group timezone. A stored request key still replays
-- before the timezone check.
--
-- Lock order: advisory lock on team + request key (same hashtext pattern as st_assign_group_programs),
-- then submitted st_team_members FOR UPDATE in user_id order, then this group's enrollments
-- FOR UPDATE in user_id order, then the existing single-member functions.
-- 20261024_074_schedule_lock_order.sql makes assignment, refresh, withdraw, and the
-- single-member functions take the enrollment lock before expectation rows, and makes
-- assignment walk members in user_id order. This function already locks members and
-- enrollments in that order before it calls them.
-- Already paused and already resumed members are counted in the result and are not sent
-- to the single-member function. The 062 trigger returns without sync when the flag does
-- not change. They stay in the submitted set.
-- Two calls of this function with different keys block on the first shared member row
-- because both lock team members in user_id order.
-- Group-activity overlap stays with the 071 before-insert trigger. Predicting the rows
-- st_refresh_enrollment_expectations will insert would copy segments, custom weekday
-- mapping, a frozen logged today, and the deferred override trigger. A wrong prediction
-- would reject a valid batch. If that trigger raises, this transaction rolls back and
-- does not delete activity rows.

begin;

create table if not exists public.st_group_schedule_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  request_key text not null,
  payload jsonb not null,
  requested_by uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint st_group_schedule_requests_team_key unique (team_id, request_key)
);

comment on table public.st_group_schedule_requests is
  'Idempotency keys for batch schedule changes. A matching payload returns the first result. A different payload for the same key raises. Clients cannot read or write this table.';

comment on column public.st_group_schedule_requests.payload is
  'Canonical jsonb: action, member ids sorted, mode, normalized weekdays, effective date, local today. program_days stores an empty weekday list. pause and resume store a null mode.';

comment on column public.st_group_schedule_requests.requested_by is
  'auth.uid() of the caller. No foreign key, matching st_group_assignment_requests.requested_by.';

alter table public.st_group_schedule_requests enable row level security;
revoke all on table public.st_group_schedule_requests from public, anon, authenticated;

create or replace function public.st_apply_group_member_schedules(
  p_team_id uuid,
  p_action text,
  p_member_user_ids uuid[],
  p_mode text,
  p_weekdays text[],
  p_effective_on date,
  p_local_today date,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_ids uuid[];
  v_mode text;
  v_weekdays text[];
  v_payload jsonb;
  v_stored_payload jsonb;
  v_prior jsonb;
  v_today date;
  v_zone text;
  v_apply uuid[] := '{}'::uuid[];
  v_uid uuid;
  v_member public.st_team_members%rowtype;
  v_enroll public.st_training_enrollments%rowtype;
  v_unchanged integer := 0;
  v_result jsonb;
  v_error text;
  v_future uuid;
  v_count integer;
  v_distinct integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;

  v_key := nullif(btrim(coalesce(p_request_key, '')), '');
  if v_key is null then
    raise exception 'Request key is required';
  end if;
  if p_action not in ('edit_days', 'pause', 'resume') then
    raise exception 'Invalid schedule action';
  end if;
  if p_member_user_ids is null or cardinality(p_member_user_ids) = 0 then
    raise exception 'Select at least one member';
  end if;
  if cardinality(p_member_user_ids) > 500 then
    raise exception 'Select at most 500 members';
  end if;
  if exists (
    select 1
    from unnest(p_member_user_ids) as t(member_id)
    where t.member_id is null
  ) then
    raise exception 'Member not found';
  end if;

  select count(*)::integer, count(distinct t.member_id)::integer
    into v_count, v_distinct
  from unnest(p_member_user_ids) as t(member_id);
  if v_count <> v_distinct then
    raise exception 'Duplicate member';
  end if;

  select coalesce(array_agg(t.member_id order by t.member_id), '{}'::uuid[])
    into v_ids
  from unnest(p_member_user_ids) as t(member_id);

  if p_action = 'edit_days' then
    if p_mode is null or p_mode not in ('program_days', 'custom_weekdays') then
      raise exception 'Invalid schedule';
    end if;
    v_mode := p_mode;
    if v_mode = 'custom_weekdays' then
      v_weekdays := public.st_normalize_weekday_list(p_weekdays);
    else
      v_weekdays := '{}'::text[];
    end if;
  else
    v_mode := null;
    v_weekdays := '{}'::text[];
  end if;

  v_payload := jsonb_build_object(
    'action', p_action,
    'member_user_ids', to_jsonb(v_ids),
    'mode', v_mode,
    'weekdays', to_jsonb(v_weekdays),
    'effective_on', p_effective_on,
    'local_today', p_local_today
  );

  perform pg_advisory_xact_lock(hashtext(p_team_id::text || ':' || v_key)::bigint);

  select r.payload, r.result
    into v_stored_payload, v_prior
  from public.st_group_schedule_requests r
  where r.team_id = p_team_id
    and r.request_key = v_key;
  if found then
    if v_stored_payload = v_payload then
      return v_prior || jsonb_build_object('replay', true);
    end if;
    raise exception 'Request key was already used with a different schedule change';
  end if;

  select t.timezone
    into v_zone
  from public.st_teams t
  where t.id = p_team_id;
  if not found then
    raise exception 'Not authorized';
  end if;
  if v_zone is null or btrim(v_zone) = '' then
    raise exception 'Set a group timezone before changing schedules';
  end if;
  if v_zone <> 'UTC' and (
    position('/' in v_zone) = 0
    or not exists (select 1 from pg_timezone_names n where n.name = v_zone)
  ) then
    raise exception 'Invalid group timezone';
  end if;
  v_today := (timezone(v_zone, now()))::date;
  if p_effective_on is distinct from v_today or p_local_today is distinct from v_today then
    raise exception 'Schedule changes apply on the group date';
  end if;
  -- One group date for the rest of this transaction, including the single-member calls.
  perform set_config('TimeZone', v_zone, true);

  foreach v_uid in array v_ids loop
    perform 1
    from public.st_team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = v_uid
    for update;
  end loop;

  foreach v_uid in array v_ids loop
    perform 1
    from public.st_training_enrollments e
    where e.team_id = p_team_id
      and e.user_id = v_uid
      and e.source_kind = 'group'
      and e.source_key = 'group:' || p_team_id::text
    for update;
  end loop;

  foreach v_uid in array v_ids loop
    select * into v_member
    from public.st_team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = v_uid;
    if not found or v_member.status is distinct from 'active' then
      raise exception 'Member not found';
    end if;
    if v_member.is_active_participant is distinct from true then
      raise exception 'Member is not an active participant';
    end if;
    if coalesce(v_member.training_source, 'team') = 'personal' then
      raise exception 'Personal training cannot be changed here';
    end if;

    select * into v_enroll
    from public.st_training_enrollments e
    where e.user_id = v_uid
      and e.team_id = p_team_id
      and e.source_kind = 'group'
      and e.source_key = 'group:' || p_team_id::text
      and e.source_key <> 'personal';
    if not found or v_enroll.program_id is null then
      raise exception 'Assign a group plan before changing the schedule';
    end if;
    if v_enroll.status is distinct from 'active' then
      raise exception 'Group enrollment is not active';
    end if;
    if p_action = 'edit_days' and v_enroll.expectation_enabled is distinct from true then
      raise exception 'Turn expected training on before editing days';
    end if;
    if p_action = 'pause' and exists (
      select 1
      from public.st_training_expectations ex
      where ex.enrollment_id = v_enroll.id
        and ex.origin = 'program'
        and ex.scheduled_date > v_today
        and public.st_expectation_has_session(ex.id)
    ) then
      raise exception 'A logged workout is still scheduled after today';
    end if;
    if p_action = 'edit_days' and v_mode = 'custom_weekdays' then
      v_error := public.st_program_custom_schedule_error(v_enroll.program_id, v_weekdays);
      if v_error is not null then
        raise exception '%', v_error;
      end if;
      select s.program_id into v_future
      from public.st_training_program_segments s
      where s.enrollment_id = v_enroll.id
        and s.ends_on is null
        and s.starts_on > v_today
        and s.program_id is distinct from v_enroll.program_id
      order by s.starts_on
      limit 1;
      if v_future is not null then
        v_error := public.st_program_custom_schedule_error(v_future, v_weekdays);
        if v_error is not null then
          raise exception '%', v_error;
        end if;
      end if;
    end if;

    if p_action = 'pause' and v_enroll.expectation_enabled is distinct from true then
      v_unchanged := v_unchanged + 1;
    elsif p_action = 'resume' and v_enroll.expectation_enabled is true then
      v_unchanged := v_unchanged + 1;
    else
      v_apply := array_append(v_apply, v_uid);
    end if;
  end loop;

  foreach v_uid in array v_apply loop
    if p_action = 'edit_days' then
      perform public.st_set_member_training_schedule(
        p_team_id, v_uid, v_mode, v_weekdays, v_today, v_today
      );
    else
      perform public.st_set_member_group_expectation(
        p_team_id, v_uid, p_action = 'resume', v_today, v_today
      );
    end if;
  end loop;

  v_result := jsonb_build_object(
    'member_count', cardinality(v_ids),
    'unchanged_count', v_unchanged,
    'action', p_action,
    'request_key', v_key,
    'effective_on', v_today,
    'replay', false
  );

  insert into public.st_group_schedule_requests (
    team_id, request_key, payload, requested_by, result
  ) values (
    p_team_id, v_key, v_payload, auth.uid(), v_result
  );

  return v_result;
end;
$$;

comment on function public.st_apply_group_member_schedules(uuid, text, uuid[], text, text[], date, date, text) is
  'Batch edit days, pause, or resume for one group. Requires st_teams.timezone. Effective date must equal the server group date. Replay returns the first result and does not write again.';

revoke all on function public.st_apply_group_member_schedules(uuid, text, uuid[], text, text[], date, date, text) from public, anon;
grant execute on function public.st_apply_group_member_schedules(uuid, text, uuid[], text, text[], date, date, text) to authenticated;

commit;
