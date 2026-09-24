import type { PlannedSetTarget } from './types';

const NON_WORKING = new Set(['warmup', 'warm-up', 'ramp', 'ramp_up', 'specific_ramp', 'cooldown', 'cool-down', 'mobility']);

export function isWorkingPlannedSet(set: PlannedSetTarget): boolean {
  if (set.is_deleted) return false;
  return !NON_WORKING.has(String(set.set_type || 'working').toLowerCase());
}

export function workingSetsOf(sets: PlannedSetTarget[]): PlannedSetTarget[] {
  return (sets || []).filter(isWorkingPlannedSet).sort((a, b) => (a.set_number || 0) - (b.set_number || 0));
}

export function loadLabel(value: string | number | null | undefined): string {
  if (value == null || String(value).trim() === '') return '';
  return String(value).trim();
}

/** Deterministic BEFORE-prescription fingerprint. Used to abort stale applies. */
export function prescriptionFingerprint(sets: PlannedSetTarget[]): string {
  return workingSetsOf(sets)
    .map((s) =>
      [s.id, s.set_number ?? '', loadLabel(s.target_weight), s.target_reps ?? '', s.rep_min ?? '', s.rep_max ?? '', s.target_rir ?? ''].join(':')
    )
    .join('|');
}

/** Durable adaptation identity. Engine/science versions are ledger metadata only. */
export function applicationKey(parts: {
  user_id: string;
  source_workout_id: string;
  source_exercise_id: string;
  target_workout_id: string;
  target_exercise_id: string;
  catalog_exercise_id: string;
  decision: string;
}): string {
  return [
    parts.user_id,
    parts.source_workout_id,
    parts.source_exercise_id,
    parts.target_workout_id,
    parts.target_exercise_id,
    parts.catalog_exercise_id,
    parts.decision,
  ].join('|');
}

export function successfulEvent(event: { application_status?: string | null }): boolean {
  return event.application_status === 'mutated' || event.application_status === 'recorded_no_change';
}
