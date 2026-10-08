-- BIQ-0254 Phase 2B.1 — workout-level adaptation run lock and summary.
-- Completion stays on st_workout_sessions. This table records whether
-- adaptation ran after that completion so retries stay idempotent.
-- DO NOT apply until reviewed.

create table if not exists public.st_adaptation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.st_workouts(id) on delete cascade,
  program_id uuid references public.st_programs(id) on delete set null,
  log_date date not null,
  workout_session_id uuid references public.st_workout_sessions(id) on delete set null,
  status text not null default 'pending',
  skipped_reason text,
  evaluated_count int not null default 0,
  updated_count int not null default 0,
  held_count int not null default 0,
  review_count int not null default 0,
  failed_count int not null default 0,
  summary_text text,
  error_text text,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint st_adaptation_runs_status_check
    check (status in ('pending', 'completed', 'failed', 'skipped')),
  constraint st_adaptation_runs_unique unique (user_id, workout_id, log_date)
);

comment on table public.st_adaptation_runs is
  'Phase 2B.1 one adaptation pass per user + workout + log date. Completion is stored on st_workout_sessions even if this row is failed.';

create index if not exists st_adaptation_runs_user_date_idx
  on public.st_adaptation_runs (user_id, log_date desc);

alter table public.st_adaptation_runs enable row level security;

drop policy if exists "adaptation_runs_select_own" on public.st_adaptation_runs;
create policy "adaptation_runs_select_own" on public.st_adaptation_runs
  for select using (user_id = auth.uid());

drop policy if exists "adaptation_runs_insert_own" on public.st_adaptation_runs;
create policy "adaptation_runs_insert_own" on public.st_adaptation_runs
  for insert with check (user_id = auth.uid());

drop policy if exists "adaptation_runs_update_own" on public.st_adaptation_runs;
create policy "adaptation_runs_update_own" on public.st_adaptation_runs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
