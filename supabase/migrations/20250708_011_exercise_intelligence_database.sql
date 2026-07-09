-- BIQ-0013: Exercise Intelligence Database
-- Schema for large external imports + BuiltIQ programming intelligence.
-- Does NOT seed exercises. Existing BIQ-0005 seed rows remain; future bulk import replaces expansion strategy.

-- ---------------------------------------------------------------------------
-- External reference + rich media (import-ready)
-- ---------------------------------------------------------------------------
alter table public.st_exercise_catalog
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists media_url text,
  add column if not exists image_url text,
  add column if not exists video_url text,
  add column if not exists gif_url text,
  add column if not exists instructions text;

comment on column public.st_exercise_catalog.external_source is 'Import origin, e.g. wger, exercisedb, builtiq_curated';
comment on column public.st_exercise_catalog.external_id is 'Stable id from external_source for idempotent re-import';
comment on column public.st_exercise_catalog.media_url is 'Primary media asset (image, gif, or video URL)';
comment on column public.st_exercise_catalog.instructions is 'Step-by-step execution instructions (plain text or markdown)';

create unique index if not exists st_exercise_catalog_external_uidx
  on public.st_exercise_catalog (external_source, external_id)
  where external_source is not null and external_id is not null;

-- ---------------------------------------------------------------------------
-- BuiltIQ intelligence fields
-- ---------------------------------------------------------------------------
alter table public.st_exercise_catalog
  add column if not exists training_goal text,
  add column if not exists progression_type text,
  add column if not exists primary_muscle_percentage smallint,
  add column if not exists secondary_muscle_percentage smallint,
  add column if not exists muscle_targets jsonb,
  add column if not exists coaching_metadata jsonb not null default '{}'::jsonb;

comment on column public.st_exercise_catalog.movement_pattern is 'BIQ-0013: squat|hinge|push_horizontal|push_vertical|pull_horizontal|pull_vertical|carry|rotation|isolation|cardio';
comment on column public.st_exercise_catalog.training_goal is 'strength|hypertrophy|endurance|power|mobility';
comment on column public.st_exercise_catalog.progression_type is 'weight|reps|duration|distance|intensity';
comment on column public.st_exercise_catalog.muscle_targets is 'Optional fine-grained volume: [{muscle, percentage, role}]';
comment on column public.st_exercise_catalog.coaching_metadata is 'AI programming hints: fatigue, skill, cues, pairing, substitution triggers';

alter table public.st_exercise_catalog
  drop constraint if exists st_exercise_catalog_movement_pattern_check;

alter table public.st_exercise_catalog
  add constraint st_exercise_catalog_movement_pattern_check check (
    movement_pattern is null
    or movement_pattern in (
      'squat', 'hinge', 'push_horizontal', 'push_vertical', 'pull_horizontal',
      'pull_vertical', 'carry', 'rotation', 'isolation', 'cardio',
      -- legacy BIQ-0005 values until import normalizes rows
      'push', 'pull', 'lunge', 'mobility', 'activation', 'stability', 'power'
    )
  );

alter table public.st_exercise_catalog
  drop constraint if exists st_exercise_catalog_training_goal_check;

alter table public.st_exercise_catalog
  add constraint st_exercise_catalog_training_goal_check check (
    training_goal is null
    or training_goal in ('strength', 'hypertrophy', 'endurance', 'power', 'mobility')
  );

alter table public.st_exercise_catalog
  drop constraint if exists st_exercise_catalog_progression_type_check;

alter table public.st_exercise_catalog
  add constraint st_exercise_catalog_progression_type_check check (
    progression_type is null
    or progression_type in ('weight', 'reps', 'duration', 'distance', 'intensity')
  );

alter table public.st_exercise_catalog
  drop constraint if exists st_exercise_catalog_primary_muscle_pct_check;

alter table public.st_exercise_catalog
  add constraint st_exercise_catalog_primary_muscle_pct_check check (
    primary_muscle_percentage is null
    or (primary_muscle_percentage >= 0 and primary_muscle_percentage <= 100)
  );

alter table public.st_exercise_catalog
  drop constraint if exists st_exercise_catalog_secondary_muscle_pct_check;

alter table public.st_exercise_catalog
  add constraint st_exercise_catalog_secondary_muscle_pct_check check (
    secondary_muscle_percentage is null
    or (secondary_muscle_percentage >= 0 and secondary_muscle_percentage <= 100)
  );

-- Search index for 1000+ exercises
create index if not exists st_exercise_catalog_search_idx
  on public.st_exercise_catalog using gin (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' || coalesce(muscle_group, '') || ' ' ||
      coalesce(equipment, '') || ' ' || coalesce(instructions, '')
    )
  );

create index if not exists st_exercise_catalog_movement_idx
  on public.st_exercise_catalog (movement_pattern)
  where is_archived = false;

create index if not exists st_exercise_catalog_training_goal_idx
  on public.st_exercise_catalog (training_goal)
  where is_archived = false;

-- ---------------------------------------------------------------------------
-- Exercise alternatives (substitutions)
-- ---------------------------------------------------------------------------
create table if not exists public.st_exercise_alternatives (
  id uuid primary key default uuid_generate_v4(),
  exercise_id uuid not null references public.st_exercise_catalog(id) on delete cascade,
  alternative_id uuid not null references public.st_exercise_catalog(id) on delete cascade,
  reason text not null default 'similar_stimulus',
  priority smallint not null default 1,
  notes text,
  is_system boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint st_exercise_alternatives_distinct check (exercise_id <> alternative_id),
  constraint st_exercise_alternatives_reason_check check (
    reason in ('equipment_unavailable', 'injury', 'skill_level', 'preference', 'similar_stimulus')
  ),
  constraint st_exercise_alternatives_unique unique (exercise_id, alternative_id, reason)
);

create index if not exists st_exercise_alternatives_exercise_idx
  on public.st_exercise_alternatives (exercise_id, priority);

create index if not exists st_exercise_alternatives_alt_idx
  on public.st_exercise_alternatives (alternative_id);

alter table public.st_exercise_alternatives enable row level security;

drop policy if exists "exercise_alternatives_select" on public.st_exercise_alternatives;
drop policy if exists "exercise_alternatives_insert" on public.st_exercise_alternatives;
drop policy if exists "exercise_alternatives_update" on public.st_exercise_alternatives;
drop policy if exists "exercise_alternatives_delete" on public.st_exercise_alternatives;

-- User can read alternatives when both exercises are visible (system or own custom)
create policy "exercise_alternatives_select" on public.st_exercise_alternatives
  for select
  using (
    exists (
      select 1 from public.st_exercise_catalog e
      where e.id = exercise_id
        and (e.is_system = true or e.user_id = auth.uid())
    )
    and exists (
      select 1 from public.st_exercise_catalog a
      where a.id = alternative_id
        and (a.is_system = true or a.user_id = auth.uid())
    )
  );

-- Users may define alternatives between their own custom exercises
create policy "exercise_alternatives_insert" on public.st_exercise_alternatives
  for insert
  with check (
    is_system = false
    and created_by = auth.uid()
    and exists (
      select 1 from public.st_exercise_catalog e
      where e.id = exercise_id and e.is_system = false and e.user_id = auth.uid()
    )
    and exists (
      select 1 from public.st_exercise_catalog a
      where a.id = alternative_id and a.is_system = false and a.user_id = auth.uid()
    )
  );

create policy "exercise_alternatives_update" on public.st_exercise_alternatives
  for update
  using (is_system = false and created_by = auth.uid())
  with check (is_system = false and created_by = auth.uid());

create policy "exercise_alternatives_delete" on public.st_exercise_alternatives
  for delete
  using (is_system = false and created_by = auth.uid());

-- Example system alternative (only if both catalog rows exist after import)
-- Bench Press -> Dumbbell Bench Press
insert into public.st_exercise_alternatives (exercise_id, alternative_id, reason, priority, notes, is_system)
select bp.id, dbp.id, 'equipment_unavailable', 1, 'No barbell or rack available', true
from public.st_exercise_catalog bp
join public.st_exercise_catalog dbp on lower(dbp.name) = lower('Dumbbell Bench Press')
where lower(bp.name) = lower('Bench Press')
  and bp.is_system = true
  and dbp.is_system = true
  and not exists (
    select 1 from public.st_exercise_alternatives x
    where x.exercise_id = bp.id and x.alternative_id = dbp.id and x.reason = 'equipment_unavailable'
  );
