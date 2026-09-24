-- BIQ-0219 / BIQ-0220 Phase 2A.3 — additive ledger fields for safe application.
-- DO NOT apply until reviewed. Existing 2A.1 rows stay readable.
-- application_key is the source→target adaptation identity (no engine/science versions).

alter table public.st_adaptation_events
  add column if not exists source_workout_id uuid,
  add column if not exists source_exercise_id uuid,
  add column if not exists source_log_date date,
  add column if not exists target_workout_id uuid,
  add column if not exists target_exercise_id uuid,
  add column if not exists application_status text,
  add column if not exists application_key text,
  add column if not exists target_fingerprint text,
  add column if not exists confidence text,
  add column if not exists adaptation_engine_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'st_adaptation_events_application_status_check'
  ) then
    alter table public.st_adaptation_events
      add constraint st_adaptation_events_application_status_check
      check (
        application_status is null
        or application_status in ('mutated', 'recorded_no_change', 'not_applied')
      );
  end if;
end $$;

comment on column public.st_adaptation_events.application_key is
  'Durable adaptation identity: user + source workout/exercise + target workout/exercise + catalog + decision. Science and engine versions are metadata only and must not mint a new key.';
comment on column public.st_adaptation_events.target_fingerprint is
  'Fingerprint of the target working-set prescription at evaluation time. Mismatch aborts apply.';
comment on column public.st_adaptation_events.application_status is
  'mutated | recorded_no_change | not_applied. Only successful rows are unique on application_key, so a prior stale/not_applied row can be followed by one successful apply of the same identity.';
comment on column public.st_adaptation_events.science_version is
  'Metadata. Changing this value must not allow a second successful mutation of the same application_key.';
comment on column public.st_adaptation_events.adaptation_engine_version is
  'Metadata. Changing this value must not allow a second successful mutation of the same application_key.';

create unique index if not exists st_adaptation_events_application_key_success_idx
  on public.st_adaptation_events (application_key)
  where application_status in ('mutated', 'recorded_no_change')
    and application_key is not null;

create index if not exists st_adaptation_events_source_idx
  on public.st_adaptation_events (user_id, source_exercise_id, source_log_date);
