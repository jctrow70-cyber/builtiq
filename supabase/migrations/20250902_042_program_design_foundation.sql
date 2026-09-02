-- BIQ-0136 Program Design foundation
-- Additive only. Does not drop tables or delete workout history.

-- ---------------------------------------------------------------------------
-- 1. Program cycle + template/instance columns
-- ---------------------------------------------------------------------------

alter table public.st_programs
  add column if not exists end_date date;

alter table public.st_programs
  add column if not exists cycle_length_weeks int;

alter table public.st_programs
  add column if not exists record_kind text not null default 'instance';

comment on column public.st_programs.end_date is
  'Sunday at the end of the selected Monday–Sunday cycle.';
comment on column public.st_programs.cycle_length_weeks is
  'Number of complete Mon–Sun weeks in this program cycle.';
comment on column public.st_programs.record_kind is
  'template = reusable definition; instance = a person''s assigned copy.';

update public.st_programs
set cycle_length_weeks = coalesce(cycle_length_weeks, weeks, 6)
where cycle_length_weeks is null;

update public.st_programs
set record_kind = 'instance'
where record_kind is null or record_kind = '';

update public.st_programs
set end_date = (
  (start_date - ((extract(dow from start_date)::int + 6) % 7))
  + (greatest(coalesce(cycle_length_weeks, weeks, 6), 1) * 7 - 1)
)
where end_date is null
  and start_date is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'st_programs_record_kind_check'
      and conrelid = 'public.st_programs'::regclass
  ) then
    alter table public.st_programs
      add constraint st_programs_record_kind_check
      check (record_kind in ('template', 'instance'));
  end if;
end $$;

-- Expand status without dropping legacy `published`.
do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.st_programs'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
      and pg_get_constraintdef(c.oid) ilike '%draft%'
  loop
    execute format('alter table public.st_programs drop constraint if exists %I', rec.conname);
  end loop;
end $$;

alter table public.st_programs
  drop constraint if exists st_programs_status_check;

alter table public.st_programs
  add constraint st_programs_status_check
  check (status in ('draft', 'published', 'scheduled', 'active', 'completed', 'archived'));

-- ---------------------------------------------------------------------------
-- 2. Health calendar activities (multiple per day)
-- ---------------------------------------------------------------------------

create table if not exists public.st_program_activities (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.st_programs(id) on delete cascade,
  week_number int not null check (week_number >= 1),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  sort_order int not null default 0,
  activity_type text not null,
  title text not null default '',
  duration_minutes int,
  notes text,
  details jsonb not null default '{}'::jsonb,
  workout_id uuid references public.st_workouts(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.st_program_activities is
  'Planned health-calendar activities for a program week. Multiple rows per day are allowed.';
comment on column public.st_program_activities.day_of_week is
  '0=Monday … 6=Sunday.';
comment on column public.st_program_activities.details is
  'Type-specific planned fields (cardio zone, mobility movements, etc.).';
comment on column public.st_program_activities.workout_id is
  'Optional link to an st_workouts strength definition. Null until Phase 2.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'st_program_activities_type_check'
      and conrelid = 'public.st_program_activities'::regclass
  ) then
    alter table public.st_program_activities
      add constraint st_program_activities_type_check
      check (activity_type in (
        'strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest'
      ));
  end if;
end $$;

create index if not exists st_program_activities_program_week_idx
  on public.st_program_activities (program_id, week_number, day_of_week, sort_order);

create index if not exists st_program_activities_workout_idx
  on public.st_program_activities (workout_id)
  where workout_id is not null;

alter table public.st_program_activities enable row level security;

drop policy if exists "program_activities_select" on public.st_program_activities;
create policy "program_activities_select" on public.st_program_activities
  for select using (public.st_user_can_read_program(program_id));

drop policy if exists "program_activities_insert" on public.st_program_activities;
create policy "program_activities_insert" on public.st_program_activities
  for insert with check (
    exists (
      select 1 from public.st_programs p
      where p.id = program_id
        and (
          p.owner_user_id = auth.uid()
          or public.st_user_can_edit_team(p.team_id)
        )
    )
  );

drop policy if exists "program_activities_update" on public.st_program_activities;
create policy "program_activities_update" on public.st_program_activities
  for update using (
    exists (
      select 1 from public.st_programs p
      where p.id = program_id
        and (
          p.owner_user_id = auth.uid()
          or public.st_user_can_edit_team(p.team_id)
        )
    )
  );

drop policy if exists "program_activities_delete" on public.st_program_activities;
create policy "program_activities_delete" on public.st_program_activities
  for delete using (
    exists (
      select 1 from public.st_programs p
      where p.id = program_id
        and (
          p.owner_user_id = auth.uid()
          or public.st_user_can_edit_team(p.team_id)
        )
    )
  );
