import { isWorkingRole } from '../countedSets';
import { BLOCKED_WEEK_STATUSES, ELIGIBLE_WEEK_STATUSES, type CandidateExposure, type SourceExposureRef } from './types';

function laterThan(source: SourceExposureRef, row: CandidateExposure): boolean {
  if (Number(row.week) !== Number(source.week)) return Number(row.week) > Number(source.week);
  return Number(row.day_order) > Number(source.day_order);
}

function weekEligible(status?: string | null): boolean {
  if (!status) return true;
  if ((BLOCKED_WEEK_STATUSES as string[]).includes(status)) return false;
  return (ELIGIBLE_WEEK_STATUSES as string[]).includes(status);
}

export function isEligibleComparableTarget(source: SourceExposureRef, row: CandidateExposure): { ok: boolean; reason?: string } {
  if (row.user_id !== source.user_id) return { ok: false, reason: 'OWNERSHIP_MISMATCH' };
  if (row.program_id !== source.program_id) return { ok: false, reason: 'PROGRAM_MISMATCH' };
  if (row.catalog_exercise_id !== source.catalog_exercise_id) return { ok: false, reason: 'catalog' };
  if (row.workout_id === source.workout_id && row.exercise_id === source.exercise_id) return { ok: false, reason: 'source' };
  if (!laterThan(source, row)) return { ok: false, reason: 'not_future' };
  if (!weekEligible(row.week_status)) return { ok: false, reason: 'TARGET_NOT_ELIGIBLE' };
  if (row.has_performance) return { ok: false, reason: 'TARGET_HAS_PERFORMANCE' };
  if (!isWorkingRole(row.program_role)) return { ok: false, reason: 'role' };
  const meas = String(row.measurement_type || source.measurement_type || 'reps').toLowerCase();
  const srcMeas = String(source.measurement_type || 'reps').toLowerCase();
  if (meas !== srcMeas) return { ok: false, reason: 'measurement' };
  const srcLat = String(source.laterality || '').toLowerCase();
  const rowLat = String(row.laterality || '').toLowerCase();
  if (srcLat && rowLat && srcLat !== rowLat) return { ok: false, reason: 'laterality' };
  if (!(row.planned_sets || []).some((s) => !s.is_deleted)) return { ok: false, reason: 'no_sets' };
  return { ok: true };
}

/** First chronologically later eligible comparable exposure. May prepare a template prescription. Never activates the week. */
export function selectNextEligibleExposure(source: SourceExposureRef, candidates: CandidateExposure[]): CandidateExposure | null {
  const eligible = (candidates || [])
    .filter((row) => isEligibleComparableTarget(source, row).ok)
    .sort((a, b) => a.week - b.week || a.day_order - b.day_order || String(a.exercise_id).localeCompare(String(b.exercise_id)));
  return eligible[0] || null;
}
