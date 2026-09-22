-- BIQ-0208 Phase 1 generation observability
-- Additive only. Does not change workout history.

create table if not exists public.st_generation_runs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.st_programs(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  generation_method text,
  model text,
  prompt_version text,
  science_version text,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  repair_attempt int not null default 0,
  ok boolean,
  input_json jsonb,
  output_json jsonb,
  validation_json jsonb,
  error_text text
);

create index if not exists st_generation_runs_user_idx on public.st_generation_runs (user_id, created_at desc);
create index if not exists st_generation_runs_program_idx on public.st_generation_runs (program_id);

alter table public.st_generation_runs enable row level security;

drop policy if exists "generation_runs_select_own" on public.st_generation_runs;
create policy "generation_runs_select_own" on public.st_generation_runs
  for select using (user_id = auth.uid());

drop policy if exists "generation_runs_insert_own" on public.st_generation_runs;
create policy "generation_runs_insert_own" on public.st_generation_runs
  for insert with check (user_id = auth.uid());

drop policy if exists "generation_runs_update_own" on public.st_generation_runs;
create policy "generation_runs_update_own" on public.st_generation_runs
  for update using (user_id = auth.uid());

alter table public.st_programs drop constraint if exists st_programs_generation_method_check;
alter table public.st_programs
  add constraint st_programs_generation_method_check check (
    generation_method is null
    or generation_method in (
      'ai',
      'template',
      'manual',
      'science',
      'science_ai',
      'ai_repaired',
      'science_fallback'
    )
  );
