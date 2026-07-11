-- BIQ-0018: Coaching notes on programs + in-app bug reports

alter table public.st_programs
  add column if not exists coaching_notes text;

comment on column public.st_programs.coaching_notes is 'AI-generated coaching guidance shown after program generation';

create table if not exists public.st_bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  description text not null,
  page_context text,
  app_nav text,
  user_agent text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists st_bug_reports_user_id_idx on public.st_bug_reports (user_id);
create index if not exists st_bug_reports_created_at_idx on public.st_bug_reports (created_at desc);

alter table public.st_bug_reports enable row level security;

drop policy if exists st_bug_reports_insert_own on public.st_bug_reports;
create policy st_bug_reports_insert_own
  on public.st_bug_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists st_bug_reports_select_own on public.st_bug_reports;
create policy st_bug_reports_select_own
  on public.st_bug_reports
  for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.st_bug_reports is 'In-app bug / feedback reports from signed-in users (BIQ-0018)';
