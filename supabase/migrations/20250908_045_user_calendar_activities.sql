-- BIQ-0155: Personal health calendar activities (independent of followed programs)

create table if not exists public.st_user_calendar_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_date date not null,
  activity_type text not null,
  title text not null default '',
  duration_minutes int,
  notes text,
  details jsonb not null default '{}'::jsonb,
  recurrence text not null default 'none',
  recurrence_until date,
  workout_id uuid references public.st_workouts (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint st_user_calendar_activities_type_check
    check (activity_type in ('strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest')),
  constraint st_user_calendar_activities_recurrence_check
    check (recurrence in ('none', 'weekly'))
);

comment on table public.st_user_calendar_activities is
  'Personal calendar activities. These show on Training day/week/month even when no program is followed.';
comment on column public.st_user_calendar_activities.recurrence is
  'none = one date only. weekly = same weekday from activity_date through recurrence_until (open-ended if null).';

create index if not exists st_user_calendar_activities_user_date_idx
  on public.st_user_calendar_activities (user_id, activity_date);

create index if not exists st_user_calendar_activities_user_recurrence_idx
  on public.st_user_calendar_activities (user_id, recurrence, activity_date);

alter table public.st_user_calendar_activities enable row level security;

drop policy if exists "user_calendar_select" on public.st_user_calendar_activities;
create policy "user_calendar_select" on public.st_user_calendar_activities
  for select using (auth.uid() = user_id);

drop policy if exists "user_calendar_insert" on public.st_user_calendar_activities;
create policy "user_calendar_insert" on public.st_user_calendar_activities
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_calendar_update" on public.st_user_calendar_activities;
create policy "user_calendar_update" on public.st_user_calendar_activities
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_calendar_delete" on public.st_user_calendar_activities;
create policy "user_calendar_delete" on public.st_user_calendar_activities
  for delete using (auth.uid() = user_id);
