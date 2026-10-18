-- BIQ-0263. Verified 2026-10-18. Not applied.
-- Run this in the Supabase SQL Editor. Do not run the rollback with it.
--
-- Matches st_program_assignments.coaching_metadata:
-- jsonb, not null, default '{}'::jsonb.
-- Existing workout assignment rows receive {}.
-- Sessions, set logs, and expectations are not updated.

alter table public.st_workout_assignments
  add column if not exists coaching_metadata jsonb not null default '{}'::jsonb;

comment on column public.st_workout_assignments.coaching_metadata is
  'Optional assignment context. Empty for workouts added before this column existed.';
