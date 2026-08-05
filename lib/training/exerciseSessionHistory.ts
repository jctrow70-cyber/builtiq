import type { ExerciseType } from './exerciseTypes';
import { formatLogSummary } from './logFields';
import { buildLastPerformance } from './progression';

export type ExerciseSessionSet = {
  setNumber: number;
  setType: string;
  summary: string;
  completed: boolean;
};

export type ExerciseSessionEntry = {
  sessionKey: string;
  week: number | null;
  date: string;
  dayLabel: string;
  workoutType: string;
  sets: ExerciseSessionSet[];
  sessionSummary: string;
};

function rowHasPerformance(row: any): boolean {
  return !!(
    row &&
    (String(row.actual_weight || '').trim() ||
      String(row.actual_reps || '').trim() ||
      String(row.actual_duration || '').trim() ||
      String(row.actual_distance || '').trim() ||
      String(row.log_notes || '').trim())
  );
}

function logSetNumber(row: any): number {
  const joinPs = row.st_planned_sets;
  return Number(row.snapshot_set_number ?? joinPs?.set_number ?? 1);
}

function logSetType(row: any): string {
  const joinPs = row.st_planned_sets;
  return String(row.snapshot_set_type || joinPs?.set_type || 'working');
}

function sessionSortKey(entry: ExerciseSessionEntry): number {
  const weekPart = entry.week != null ? entry.week * 1_000_000 : 0;
  const datePart = Date.parse(`${entry.date}T12:00:00`) || 0;
  return weekPart + datePart / 1_000_000;
}

/** Group logged sets into prior workout sessions for one exercise. */
export function buildExerciseSessionHistory(
  rows: any[],
  exType: ExerciseType,
  opts?: { dayLabel?: string; matchDayLabel?: boolean }
): ExerciseSessionEntry[] {
  const dayLabel = String(opts?.dayLabel || '').trim();
  const matchDayLabel = opts?.matchDayLabel !== false && !!dayLabel;

  const perfRows = (rows || []).filter((row) => rowHasPerformance(row) || row?.completed === true);
  const filtered = perfRows.filter((row) => {
    if (!matchDayLabel) return true;
    const snapDay = String(row.snapshot_day_label || '').trim();
    return !snapDay || snapDay === dayLabel;
  });

  const groups = new Map<string, any[]>();
  filtered.forEach((row) => {
    const date = String(row.log_date || '').trim();
    if (!date) return;
    const week = row.snapshot_week != null ? Number(row.snapshot_week) : null;
    const snapDay = String(row.snapshot_day_label || dayLabel || '').trim();
    const key = week != null ? `w${week}|${snapDay}|${date}` : `${snapDay}|${date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  });

  const sessions: ExerciseSessionEntry[] = [];
  groups.forEach((groupRows, sessionKey) => {
    const sorted = [...groupRows].sort((a, b) => {
      const typeOrder = (t: string) => (t === 'warmup' ? 0 : t === 'working' ? 1 : 2);
      const ta = typeOrder(logSetType(a));
      const tb = typeOrder(logSetType(b));
      if (ta !== tb) return ta - tb;
      return logSetNumber(a) - logSetNumber(b);
    });

    const first = sorted[0];
    const week = first.snapshot_week != null ? Number(first.snapshot_week) : null;
    const date = String(first.log_date || '');
    const snapDay = String(first.snapshot_day_label || dayLabel || '');
    const workoutType = String(first.snapshot_workout_type || '');

    const sets: ExerciseSessionSet[] = sorted.map((row) => ({
      setNumber: logSetNumber(row),
      setType: logSetType(row),
      summary: formatLogSummary(row, exType),
      completed: row.completed === true,
    }));

    const perf = buildLastPerformance(sorted);
    sessions.push({
      sessionKey,
      week,
      date,
      dayLabel: snapDay,
      workoutType,
      sets,
      sessionSummary: perf?.summary || sets.map((s) => s.summary).join(' · '),
    });
  });

  return sessions.sort((a, b) => sessionSortKey(b) - sessionSortKey(a));
}

export function formatExerciseSessionTitle(entry: ExerciseSessionEntry): string {
  const parts: string[] = [];
  if (entry.week != null) parts.push(`Week ${entry.week}`);
  if (entry.dayLabel) parts.push(entry.dayLabel);
  if (entry.date) parts.push(entry.date);
  return parts.join(' · ') || entry.date || 'Session';
}
