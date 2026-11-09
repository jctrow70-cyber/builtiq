/**
 * Shared planned-set target collection and historical log ↔ target scoring.
 * Used by durable rematch (reattachLogs) and display projection (historicalLogProjection).
 */

import { dayLabelFromYmd, resolveProgramStartDate, weekForDate } from './programCalendar';

export type ProgramLike = {
  id?: string;
  start_date?: string | null;
  created_at?: string | null;
  weeks?: number | null;
  team_id?: string | null;
  st_workouts?: any[];
};

export type PlannedSetTarget = {
  plannedSetId: string;
  workoutId: string;
  week: number;
  dayOrder: number;
  dayLabel: string;
  exerciseId: string;
  exerciseName: string;
  catalogId: string | null;
  setNumber: number;
  setType: string;
};

function normName(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function collectProgramTargets(program: ProgramLike | null | undefined): PlannedSetTarget[] {
  const targets: PlannedSetTarget[] = [];
  (program?.st_workouts || []).forEach((w: any) => {
    (w.st_exercises || []).forEach((e: any) => {
      (e.st_planned_sets || [])
        .filter((s: any) => !s.is_deleted)
        .forEach((s: any) => {
          targets.push({
            plannedSetId: s.id,
            workoutId: w.id,
            week: Number(w.week) || 1,
            dayOrder: Number(w.day_order) || 0,
            dayLabel: String(w.day_label || ''),
            exerciseId: e.id,
            exerciseName: String(e.name || ''),
            catalogId: e.catalog_exercise_id || null,
            setNumber: Number(s.set_number) || 1,
            setType: String(s.set_type || 'working'),
          });
        });
    });
  });
  return targets;
}

export function plannedSetIdSet(program: ProgramLike | null | undefined): Set<string> {
  return new Set(collectProgramTargets(program).map((t) => t.plannedSetId));
}

function exerciseMatches(log: any, target: PlannedSetTarget): boolean {
  const logCatalog = log.snapshot_catalog_exercise_id || null;
  const logName = normName(log.snapshot_exercise_name);
  const targetName = normName(target.exerciseName);
  const catalogMatch = !!(logCatalog && target.catalogId && logCatalog === target.catalogId);
  if (catalogMatch) return true;
  // Personal-copy / catalog re-links change catalog ids while the exercise name stays the same.
  // Prefer catalog when scoring (below); name fallback keeps November-2-style orphans recognisable.
  if (logName && targetName && logName === targetName) return true;
  return false;
}

function setNumberOf(log: any): number {
  return Number(log.snapshot_set_number ?? 1) || 1;
}

/** Score a log → target pair. Higher is better; -1 means incompatible. */
export function scoreLogTargetMatch(
  log: any,
  target: PlannedSetTarget,
  program: ProgramLike,
): number {
  if (setNumberOf(log) !== target.setNumber) return -1;
  if (!exerciseMatches(log, target)) return -1;

  let score = 10; // base for exercise + set number
  const logCatalog = log.snapshot_catalog_exercise_id || null;
  if (logCatalog && target.catalogId && logCatalog === target.catalogId) {
    score += 20; // prefer the same catalog when two cards share a name
  }

  const logDate = String(log.log_date || '').slice(0, 10);
  if (logDate) {
    const start = resolveProgramStartDate(program);
    const weekOnDate = weekForDate(start, logDate, program.weeks || 6);
    const dayOnDate = dayLabelFromYmd(logDate);
    if (target.week === weekOnDate && normName(target.dayLabel) === normName(dayOnDate)) {
      score += 40; // strongest: belongs on this calendar day in the new program
    } else if (normName(target.dayLabel) === normName(dayOnDate)) {
      score += 8;
    }
  }

  if (log.snapshot_week != null && Number(log.snapshot_week) === target.week) score += 12;
  if (log.snapshot_day_order != null && Number(log.snapshot_day_order) === target.dayOrder) score += 10;
  else if (log.snapshot_day_label && normName(log.snapshot_day_label) === normName(target.dayLabel)) {
    score += 8;
  }

  if (log.snapshot_set_type && String(log.snapshot_set_type) === target.setType) score += 2;

  return score;
}
