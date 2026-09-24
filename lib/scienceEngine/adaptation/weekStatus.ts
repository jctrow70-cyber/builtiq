import type { WeekStatus } from './types';
import { WEEK_STATUSES } from './types';

export type WeekBackfillEvidence = {
  week?: number | null;
  existing?: WeekStatus | null;
  hasPerformance?: boolean;
  fullyCompleted?: boolean;
  /** Current program week from start_date. Null = no schedule anchor. */
  currentProgramWeek?: number | null;
};

export function weekStatusForNewWorkout(week: number | null | undefined): WeekStatus {
  const n = Number(week);
  if (Number.isFinite(n) && n > 1) return 'template';
  return 'activated';
}

export function isHistoricalWeekLocked(status: WeekStatus | null | undefined): boolean {
  return status === 'locked' || status === 'completed';
}

function isValidStatus(value?: WeekStatus | null): value is WeekStatus {
  return !!value && WEEK_STATUSES.includes(value);
}

/**
 * Evidence-based backfill for existing workouts.
 * locked is never inferred. Valid explicit statuses are preserved.
 */
export function backfillWeekStatus(input: WeekBackfillEvidence | number | null | undefined, existing?: WeekStatus | null): WeekStatus {
  const evidence: WeekBackfillEvidence =
    input && typeof input === 'object'
      ? input
      : { week: input as number | null | undefined, existing };

  if (isValidStatus(evidence.existing)) return evidence.existing;

  if (evidence.fullyCompleted) return 'completed';
  if (evidence.hasPerformance) return 'in_progress';

  const week = Number(evidence.week);
  if (!Number.isFinite(week) || week <= 1) return 'activated';
  if (evidence.currentProgramWeek == null) return 'activated';
  if (week <= evidence.currentProgramWeek) return 'activated';
  return 'template';
}
