import type { WeekStatus } from './types';

export function weekStatusForNewWorkout(week: number | null | undefined): WeekStatus {
  const n = Number(week);
  if (Number.isFinite(n) && n > 1) return 'template';
  return 'activated';
}

export function isHistoricalWeekLocked(status: WeekStatus | null | undefined): boolean {
  return status === 'locked' || status === 'completed';
}

/** Existing programs keep week 1 activated. Copied later weeks become templates. Never rewrite status from logs. */
export function backfillWeekStatus(week: number | null | undefined, existing?: WeekStatus | null): WeekStatus {
  if (existing && ['template', 'activated', 'in_progress', 'completed', 'locked'].includes(existing)) {
    return existing;
  }
  return weekStatusForNewWorkout(week);
}
