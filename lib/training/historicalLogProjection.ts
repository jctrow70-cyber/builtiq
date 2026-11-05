/**
 * BIQ-0308: Shared historical set-log recognition for Training, calendar, and dashboard.
 *
 * Exact planned_set_id wins. Otherwise snapshot metadata may project a log onto the
 * current workout's planned sets for display and completion — without writing the DB.
 *
 * Soft projection requires a strong match so a different followed program does not
 * paint unrelated historical sets onto the new prescription cards.
 */

import {
  collectProgramTargets,
  plannedSetIdSet,
  scoreLogTargetMatch,
  type ProgramLike,
} from './logTargetMatch';

/** Soft matches need calendar/day or week signal beyond bare exercise + set number. */
export const HISTORICAL_PROJECTION_MIN_SCORE = 18;

/**
 * When no exact IDs match, require this fraction of the day's completed working logs
 * to soft-match before painting any onto the current workout cards.
 */
export const HISTORICAL_PROJECTION_MIN_COVERAGE = 0.5;

export type HistoricalLogRow = {
  id?: string | null;
  planned_set_id?: string | null;
  log_date?: string | null;
  completed?: boolean | null;
  actual_weight?: unknown;
  actual_reps?: unknown;
  actual_duration?: unknown;
  actual_distance?: unknown;
  log_notes?: string | null;
  snapshot_exercise_name?: string | null;
  snapshot_catalog_exercise_id?: string | null;
  snapshot_set_number?: number | null;
  snapshot_set_type?: string | null;
  snapshot_week?: number | null;
  snapshot_day_label?: string | null;
  snapshot_day_order?: number | null;
  [key: string]: unknown;
};

export type WorkoutForProjection = {
  id?: string | null;
  st_exercises?: unknown[];
  [key: string]: unknown;
};

export type HistoricalProjectionResult = {
  /** Map keyed by current planned_set_id for logger cards and completion. */
  byPlannedSetId: Record<string, HistoricalLogRow>;
  exactCount: number;
  projectedCount: number;
  unmatched: HistoricalLogRow[];
  coverage: number;
  appliedSoftProjection: boolean;
};

function hasPerf(row: HistoricalLogRow | null | undefined): boolean {
  return !!(
    row &&
    (String(row.actual_weight || '').trim() ||
      String(row.actual_reps || '').trim() ||
      String(row.actual_duration || '').trim() ||
      String(row.actual_distance || '').trim() ||
      String(row.log_notes || '').trim())
  );
}

function isEligibleHistoricalLog(row: HistoricalLogRow | null | undefined): boolean {
  return !!(row && (row.completed === true || hasPerf(row)));
}

function isWorkingSnapshot(row: HistoricalLogRow): boolean {
  const t = String(row.snapshot_set_type || 'working').toLowerCase();
  return t !== 'warmup' && t !== 'ramp';
}

function dateLogsForDay(dateLogs: HistoricalLogRow[], dateYmd?: string | null): HistoricalLogRow[] {
  const day = String(dateYmd || '').slice(0, 10);
  if (!day) return (dateLogs || []).filter(Boolean);
  return (dateLogs || []).filter((row) => String(row?.log_date || '').slice(0, 10) === day);
}

/**
 * Project same-date set logs onto one workout's planned sets.
 * Does not mutate database rows. In-memory copies may use the target planned_set_id
 * as the map key so UI cards and completion checks align with the current template.
 */
export function projectDateLogsOntoWorkout(
  dateLogs: HistoricalLogRow[] | null | undefined,
  program: ProgramLike | null | undefined,
  workout: WorkoutForProjection | null | undefined,
  opts?: {
    minScore?: number;
    minCoverage?: number;
    logDate?: string | null;
  }
): HistoricalProjectionResult {
  const empty: HistoricalProjectionResult = {
    byPlannedSetId: {},
    exactCount: 0,
    projectedCount: 0,
    unmatched: [],
    coverage: 0,
    appliedSoftProjection: false,
  };
  if (!program || !workout?.id) return empty;

  const day = String(opts?.logDate || '').slice(0, 10);
  const rows = day ? dateLogsForDay(dateLogs || [], day) : (dateLogs || []).filter(Boolean);
  const currentIds = plannedSetIdSet(program);
  const targets = collectProgramTargets(program).filter((t) => t.workoutId === workout.id);
  const minScore = opts?.minScore ?? HISTORICAL_PROJECTION_MIN_SCORE;
  const minCoverage = opts?.minCoverage ?? HISTORICAL_PROJECTION_MIN_COVERAGE;

  const by: Record<string, HistoricalLogRow> = {};
  let exactCount = 0;
  const claimedLogIds = new Set<string>();

  rows.forEach((log) => {
    const pid = log?.planned_set_id ? String(log.planned_set_id) : '';
    if (!pid || !currentIds.has(pid)) return;
    // Exact hits must belong to this workout's planned sets.
    if (!targets.some((t) => t.plannedSetId === pid)) return;
    by[pid] = log;
    exactCount += 1;
    if (log.id) claimedLogIds.add(String(log.id));
  });

  const occupied = new Set(Object.keys(by));
  const softCandidates: { log: HistoricalLogRow; targetId: string; score: number }[] = [];

  rows.forEach((log) => {
    if (!log || !isEligibleHistoricalLog(log)) return;
    if (log.id && claimedLogIds.has(String(log.id))) return;
    const pid = log.planned_set_id ? String(log.planned_set_id) : '';
    if (pid && currentIds.has(pid) && targets.some((t) => t.plannedSetId === pid)) return;

    let best: { id: string; score: number } | null = null;
    targets.forEach((target) => {
      if (occupied.has(target.plannedSetId)) return;
      if (softCandidates.some((c) => c.targetId === target.plannedSetId)) return;
      const score = scoreLogTargetMatch(log, target, program);
      if (score < minScore) return;
      if (!best || score > best.score) best = { id: target.plannedSetId, score };
    });
    if (best) {
      softCandidates.push({ log, targetId: best.id, score: best.score });
      // Reserve slot while scoring remaining logs.
      occupied.add(best.id);
    }
  });

  const workingOnDay = rows.filter((log) => isEligibleHistoricalLog(log) && isWorkingSnapshot(log));
  const softWorking = softCandidates.filter((c) => isWorkingSnapshot(c.log));
  const exactWorking = workingOnDay.filter((log) => {
    const pid = log.planned_set_id ? String(log.planned_set_id) : '';
    return pid && by[pid];
  }).length;
  const matchedWorking = exactWorking + softWorking.length;
  const coverage = workingOnDay.length ? matchedWorking / workingOnDay.length : exactCount > 0 ? 1 : 0;

  const allowSoft =
    softCandidates.length > 0 &&
    (exactCount > 0 || workingOnDay.length === 0 || coverage + 1e-9 >= minCoverage);

  let projectedCount = 0;
  if (allowSoft) {
    softCandidates.forEach(({ log, targetId }) => {
      // Display key only — original planned_set_id remains on the source row fields we copy under.
      by[targetId] = { ...log, planned_set_id: targetId };
      projectedCount += 1;
      if (log.id) claimedLogIds.add(String(log.id));
    });
  }

  const unmatched = rows.filter((log) => {
    if (!log) return false;
    if (log.id && claimedLogIds.has(String(log.id))) return false;
    const pid = log.planned_set_id ? String(log.planned_set_id) : '';
    if (pid && by[pid] === log) return false;
    return isEligibleHistoricalLog(log);
  });

  return {
    byPlannedSetId: by,
    exactCount,
    projectedCount,
    unmatched,
    coverage,
    appliedSoftProjection: allowSoft && projectedCount > 0,
  };
}

/**
 * Build a planned_set_id → log map for completion checks on one calendar date.
 * Uses exact IDs, then shared historical projection onto the given workout.
 */
export function projectedLogMapForWorkoutDate(input: {
  dateYmd: string;
  dateLogs: HistoricalLogRow[];
  program?: ProgramLike | null;
  workout?: WorkoutForProjection | null;
  sessionLogs?: Record<string, HistoricalLogRow | undefined>;
  selectedDate?: string;
}): Record<string, HistoricalLogRow | undefined> {
  const dateYmd = String(input.dateYmd || '').slice(0, 10);
  const dayLogs = dateLogsForDay(input.dateLogs || [], dateYmd);
  const map: Record<string, HistoricalLogRow | undefined> = {};

  if (input.program && input.workout?.id) {
    const projected = projectDateLogsOntoWorkout(dayLogs, input.program, input.workout, {
      logDate: dateYmd,
    });
    Object.entries(projected.byPlannedSetId).forEach(([id, row]) => {
      map[id] = row;
    });
  } else {
    dayLogs.forEach((row) => {
      if (!row?.planned_set_id) return;
      map[String(row.planned_set_id)] = row;
    });
  }

  if (input.selectedDate && dateYmd === String(input.selectedDate).slice(0, 10)) {
    Object.entries(input.sessionLogs || {}).forEach(([id, row]) => {
      if (!row) return;
      if (row.log_date && String(row.log_date).slice(0, 10) !== dateYmd) return;
      map[id] = row;
    });
  }

  return map;
}
