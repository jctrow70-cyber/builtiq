-- BIQ-0263 Stage 1. Apply in the Supabase SQL Editor. The app does not run this.
-- One-time group extras. They are not personal calendar rows and not program expectations.
-- Weekly repeat is stored as a column for a later stage. This function rejects it.

create table if not exists public.st_group_activity_series (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  activity_type text not null,
  title text not null default '',
  duration_minutes int,
  notes text,
  details jsonb not null default '{}'::jsonb,
  workout_id uuid references public.st_workouts(id) on delete set null,
  program_id uuid references public.st_programs(id) on delete set null,
  start_date date not null,
  recurrence text not null default 'none',
  recurrence_until date,
  required boolean not null default false,
  created_at timestamptz not null default now(),
  constraint st_group_activity_series_type_check
    check (activity_type in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest')),
  constraint st_group_activity_series_recurrence_check
    check (recurrence in ('none', 'weekly'))
);

create table if not exists public.st_group_activity_recipients (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.st_group_activity_series(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unique (series_id, user_id)
);

create table if not exists public.st_group_activity_occurrences (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.st_group_activity_series(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurrence_date date not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (series_id, user_id, occurrence_date)
);

create table if not exists public.st_group_activity_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.st_teams(id) on delete cascade,
  request_key text not null,
  requested_by uuid not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (team_id, request_key)
);

comment on table public.st_group_activity_series is
  'Additional group activities. Optional by default. Not a program expectation and not a personal calendar row.';

alter table public.st_group_activity_series enable row level security;
alter table public.st_group_activity_recipients enable row level security;
alter table public.st_group_activity_occurrences enable row level security;
alter table public.st_group_activity_requests enable row level security;

revoke all on public.st_group_activity_series from public, anon, authenticated;
revoke all on public.st_group_activity_recipients from public, anon, authenticated;
revoke all on public.st_group_activity_occurrences from public, anon, authenticated;
revoke all on public.st_group_activity_requests from public, anon, authenticated;

create or replace function public.st_user_can_read_group_activity(p_series_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.st_group_activity_series s
    join public.st_team_members tm
      on tm.team_id = s.team_id
     and tm.user_id = auth.uid()
     and tm.status = 'active'
    where s.id = p_series_id
      and (
        s.created_by = auth.uid()
        or public.st_user_can_assign_in_group(s.team_id)
        or public.st_user_can_view_group_progress(s.team_id)
        or exists (
          select 1
          from public.st_group_activity_recipients r
          where r.series_id = s.id
            and r.user_id = auth.uid()
        )
      )
  );
$$;

grant execute on function public.st_user_can_read_group_activity(uuid) to authenticated;

create policy st_group_activity_series_select
  on public.st_group_activity_series
  for select to authenticated
  using (public.st_user_can_read_group_activity(id));

create policy st_group_activity_recipients_select
  on public.st_group_activity_recipients
  for select to authenticated
  using (public.st_user_can_read_group_activity(series_id));

create policy st_group_activity_occurrences_select
  on public.st_group_activity_occurrences
  for select to authenticated
  using (public.st_user_can_read_group_activity(series_id));

grant select on public.st_group_activity_series to authenticated;
grant select on public.st_group_activity_recipients to authenticated;
grant select on public.st_group_activity_occurrences to authenticated;

create or replace function public.st_save_group_activity(
  p_team_id uuid,
  p_activity_type text,
  p_title text,
  p_occurrence_date date,
  p_recipient_user_ids uuid[],
  p_request_key text,
  p_duration_minutes int default null,
  p_notes text default null,
  p_details jsonb default '{}'::jsonb,
  p_workout_id uuid default null,
  p_program_id uuid default null,
  p_required boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_prior jsonb;
  v_series uuid;
  v_ids uuid[];
  v_uid uuid;
  v_occurrence uuid;
  v_occurrences uuid[] := '{}';
  v_title text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_team_id is null or p_occurrence_date is null then
    raise exception 'Choose a group and a date';
  end if;
  if p_activity_type not in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest') then
    raise exception 'Choose an activity type';
  end if;
  if p_activity_type = 'strength' and p_workout_id is null then
    raise exception 'Choose a program workout for strength. A custom group workout is not available yet.';
  end if;
  if not exists (
    select 1 from public.st_team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.status = 'active'
  ) then
    raise exception 'Not authorized';
  end if;

  select coalesce(array_agg(distinct uid), '{}')
    into v_ids
  from unnest(coalesce(p_recipient_user_ids, '{}'::uuid[])) as uid
  where uid is not null;
  if cardinality(v_ids) = 0 then
    v_ids := array[auth.uid()];
  end if;
  if exists (
    select 1 from unnest(v_ids) as uid
    where not exists (
      select 1 from public.st_team_members tm
      where tm.team_id = p_team_id and tm.user_id = uid and tm.status = 'active'
    )
  ) then
    raise exception 'Member not found';
  end if;
  if v_ids <> array[auth.uid()] and not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Not authorized';
  end if;
  if coalesce(p_required, false) and not public.st_user_can_assign_in_group(p_team_id) then
    raise exception 'Only a manager can mark an extra required';
  end if;
  if p_workout_id is not null and not exists (
    select 1
    from public.st_workouts w
    join public.st_programs p on p.id = w.program_id
    where w.id = p_workout_id
      and p.team_id = p_team_id
      and p.visibility = 'team'
  ) then
    raise exception 'Publish a group program before assigning it';
  end if;

  v_key := nullif(btrim(coalesce(p_request_key, '')), '');
  if v_key is not null then
    perform pg_advisory_xact_lock(hashtext(p_team_id::text || ':activity:' || v_key)::bigint);
    select r.result into v_prior
    from public.st_group_activity_requests r
    where r.team_id = p_team_id and r.request_key = v_key;
    if found then
      return v_prior;
    end if;
  end if;

  if p_workout_id is not null and exists (
    select 1
    from public.st_group_activity_occurrences o
    join public.st_group_activity_series s on s.id = o.series_id
    where s.team_id = p_team_id
      and s.workout_id = p_workout_id
      and o.occurrence_date = p_occurrence_date
      and o.user_id = any(v_ids)
  ) then
    raise exception 'That workout is already on this date';
  end if;

  v_title := coalesce(nullif(btrim(p_title), ''), 'Activity');
  insert into public.st_group_activity_series (
    team_id, created_by, activity_type, title, duration_minutes, notes, details,
    workout_id, program_id, start_date, recurrence, recurrence_until, required
  ) values (
    p_team_id, auth.uid(), p_activity_type, v_title, p_duration_minutes, nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_details, '{}'::jsonb), p_workout_id, p_program_id, p_occurrence_date, 'none', null, coalesce(p_required, false)
  )
  returning id into v_series;

  foreach v_uid in array v_ids loop
    insert into public.st_group_activity_recipients (series_id, user_id)
    values (v_series, v_uid);
    insert into public.st_group_activity_occurrences (series_id, user_id, occurrence_date)
    values (v_series, v_uid, p_occurrence_date)
    returning id into v_occurrence;
    v_occurrences := v_occurrences || v_occurrence;
  end loop;

  v_prior := jsonb_build_object('series_id', v_series, 'occurrence_ids', to_jsonb(v_occurrences), 'request_key', v_key);
  if v_key is not null then
    insert into public.st_group_activity_requests (team_id, request_key, requested_by, result)
    values (p_team_id, v_key, auth.uid(), v_prior);
  end if;
  return v_prior;
end;
$$;

revoke all on function public.st_save_group_activity(uuid, text, text, date, uuid[], text, int, text, jsonb, uuid, uuid, boolean) from public, anon;
grant execute on function public.st_save_group_activity(uuid, text, text, date, uuid[], text, int, text, jsonb, uuid, uuid, boolean) to authenticated;
