import { isWorkingSet } from './estimated1Rm';
import { seriesIdentityFromLog, seriesKey } from '../progress/identity';

export type WorkoutHistoryRow = {
  id?: string | null;
  log_date?: string | null;
  completed?: boolean | null;
  actual_weight?: unknown;
  actual_reps?: unknown;
  log_notes?: string | null;
  snapshot_set_type?: string | null;
  snapshot_set_number?: number | null;
  snapshot_exercise_name?: string | null;
  snapshot_catalog_exercise_id?: string | null;
  snapshot_equipment?: string | null;
  snapshot_variant?: string | null;
  snapshot_day_label?: string | null;
  snapshot_workout_type?: string | null;
  snapshot_provenance?: unknown;
  workout_id?: string | null;
};

export type WorkoutHistoryStatus = 'completed' | 'partial' | 'skipped' | 'in_progress' | 'unknown';

export type HistorySession = {
  id: string;
  date: string;
  workoutId: string;
  workoutName: string;
  dayLabel: string;
  workoutType: string;
  status: string;
};

export type WorkoutHistorySummary = {
  id: string;
  date: string;
  workoutName: string;
  exerciseCount: number;
  workingSets: number;
  status: WorkoutHistoryStatus;
  workoutId?: string;
  dayLabel?: string;
  workoutType?: string;
  /** session = st_workout_sessions. set_log = recorded sets with no matching session. */
  source?: 'session' | 'set_log';
};

export type StoredHistorySet = {
  id: string;
  exerciseName: string;
  equipment: string;
  variant: string | null;
  setType: string;
  setNumber: number | null;
  weight: string;
  reps: string;
  notes: string;
  completed: boolean;
};

export type WorkoutHistoryExercise = {
  key: string;
  catalogExerciseId: string | null;
  name: string;
  equipment: string;
  variant: string | null;
  sets: StoredHistorySet[];
};

export type WorkoutHistoryDetail = {
  summary: WorkoutHistorySummary;
  exercises: WorkoutHistoryExercise[];
};

/**
 * Sessions are the workout list. Set logs add a workout only when no session
 * has the same date and workout. A resolved workout id keeps same-day workouts
 * apart. Sets with no workout id stay one entry per date, because a day label
 * is not a session id. Their completion status stays unknown.
 */
export function assembleTrainingHistory(sessions: HistorySession[], rows: WorkoutHistoryRow[]): WorkoutHistorySummary[] {
  const listed = (sessions || []).filter((session) => session.date && session.id);
  const sessionKeys = new Set(listed.filter((session) => session.workoutId).map((session) => `${session.date}|${session.workoutId}`));
  const summaries = listed.map((session) => summarizeSession(session, rows));
  return summaries.concat(historicalSetLogs(rows, sessionKeys)).sort(byHistoryOrder);
}

/** Set-log workouts used when the account has no session rows. */
export function summarizeWorkoutHistory(rows: WorkoutHistoryRow[]): WorkoutHistorySummary[] {
  return assembleTrainingHistory([], rows);
}

/** Database page window. Page 2 starts after page 1 and does not overlap it. */
export function historyPageBounds(page: number, pageSize = 10): { page: number; pageSize: number; from: number; to: number } {
  const size = Math.max(1, pageSize);
  const current = Math.max(1, page);
  const from = (current - 1) * size;
  return { page: current, pageSize: size, from, to: from + size - 1 };
}

export function sessionHistoryStatus(status: string): WorkoutHistoryStatus {
  if (status === 'completed' || status === 'partial' || status === 'skipped') return status;
  return 'in_progress';
}

export function setsForSession(rows: WorkoutHistoryRow[], session: HistorySession): WorkoutHistoryRow[] {
  if (!session.workoutId) return [];
  return (rows || []).filter((row) => dateOf(row) === session.date && workoutIdOf(row) === session.workoutId);
}

export function setsForSummary(rows: WorkoutHistoryRow[], summary: WorkoutHistorySummary): WorkoutHistoryRow[] {
  if (summary.source === 'set_log' && !summary.workoutId) {
    return (rows || []).filter((row) => dateOf(row) === summary.date && !workoutIdOf(row));
  }
  return setsForSession(rows, {
    id: summary.id,
    date: summary.date,
    workoutId: summary.workoutId || '',
    workoutName: summary.workoutName,
    dayLabel: summary.dayLabel || '',
    workoutType: summary.workoutType || '',
    status: summary.status,
  });
}

/** The recorded session status wins. Empty logs do not turn a skipped workout into an in-progress one. */
export function summarizeSession(session: HistorySession, rows: WorkoutHistoryRow[]): WorkoutHistorySummary {
  const matched = setsForSession(rows, session);
  const counts = countLoggedWork(matched);
  return {
    id: session.id,
    date: session.date,
    workoutName: session.workoutName,
    exerciseCount: counts.exerciseCount,
    workingSets: counts.workingSets,
    status: sessionHistoryStatus(session.status),
    workoutId: session.workoutId,
    dayLabel: session.dayLabel,
    workoutType: session.workoutType,
    source: 'session',
  };
}

export function workoutHistoryPage<T>(items: T[], page: number, pageSize = 10): { page: number; pageCount: number; items: T[] } {
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * size;
  return { page: current, pageCount, items: items.slice(start, start + size) };
}

export function workoutHistoryDetail(rows: WorkoutHistoryRow[], summaryId: string, summaryHint?: WorkoutHistorySummary | null): WorkoutHistoryDetail | null {
  const hinted = summaryHint && summaryHint.id === summaryId ? summaryHint : null;
  const summary = hinted || summarizeWorkoutHistory(rows).find((item) => item.id === summaryId);
  if (!summary) return null;
  return { summary, exercises: exercisesFromRows(setsForSummary(rows, summary)) };
}

function exercisesFromRows(matched: WorkoutHistoryRow[]): WorkoutHistoryExercise[] {
  const groups = new Map<string, StoredHistorySet[]>();
  const labels = new Map<string, { name: string; equipment: string; variant: string | null; catalogExerciseId: string | null }>();
  matched.forEach((row) => {
    const identity = seriesIdentityFromLog(row);
    const key = seriesKey(identity);
    const set: StoredHistorySet = {
      id: String(row.id || ''),
      exerciseName: identity.exerciseName,
      equipment: identity.equipmentLabel,
      variant: identity.variant,
      setType: String(row.snapshot_set_type || 'working'),
      setNumber: row.snapshot_set_number == null ? null : Number(row.snapshot_set_number),
      weight: rawText(row.actual_weight),
      reps: rawText(row.actual_reps),
      notes: String(row.log_notes || ''),
      completed: row.completed === true,
    };
    const list = groups.get(key) || [];
    list.push(set);
    groups.set(key, list);
    labels.set(key, {
      name: identity.exerciseName,
      equipment: identity.equipmentLabel,
      variant: identity.variant,
      catalogExerciseId: identity.catalogExerciseId,
    });
  });
  const exercises = Array.from(groups.entries()).map(([key, sets]) => {
    const label = labels.get(key)!;
    return {
      key,
      catalogExerciseId: label.catalogExerciseId,
      name: label.name,
      equipment: label.equipment,
      variant: label.variant,
      sets: sets.sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0) || a.id.localeCompare(b.id)),
    };
  });
  return exercises;
}

function historicalSetLogs(rows: WorkoutHistoryRow[], sessionKeys: Set<string>): WorkoutHistorySummary[] {
  const reliable = new Map<string, WorkoutHistoryRow[]>();
  const ambiguous = new Map<string, WorkoutHistoryRow[]>();
  (rows || []).forEach((row) => {
    const date = dateOf(row);
    if (!date) return;
    const workoutId = workoutIdOf(row);
    if (workoutId) {
      if (sessionKeys.has(`${date}|${workoutId}`)) return;
      const id = `setlog:${date}:${workoutId}`;
      const list = reliable.get(id) || [];
      list.push(row);
      reliable.set(id, list);
      return;
    }
    const id = `setlog:${date}`;
    const list = ambiguous.get(id) || [];
    list.push(row);
    ambiguous.set(id, list);
  });
  return [
    ...Array.from(reliable.entries()).map(([id, group]) => historicalSummary(id, group, workoutIdOf(group[0]))),
    ...Array.from(ambiguous.entries()).map(([id, group]) => historicalSummary(id, group, '')),
  ];
}

function historicalSummary(id: string, rows: WorkoutHistoryRow[], workoutId: string): WorkoutHistorySummary {
  const counts = countLoggedWork(rows);
  const labels = unanimousLabel(rows);
  return {
    id,
    date: dateOf(rows[0]),
    workoutName: labels.name,
    exerciseCount: counts.exerciseCount,
    workingSets: counts.workingSets,
    status: 'unknown',
    workoutId: workoutId || undefined,
    dayLabel: labels.day || undefined,
    workoutType: labels.type || undefined,
    source: 'set_log',
  };
}

function unanimousLabel(rows: WorkoutHistoryRow[]): { name: string; day: string; type: string } {
  const days = new Set(rows.map((row) => String(row.snapshot_day_label || '').trim()).filter(Boolean));
  const types = new Set(rows.map((row) => String(row.snapshot_workout_type || '').trim()).filter(Boolean));
  const day = days.size === 1 ? Array.from(days)[0] : '';
  const type = types.size === 1 ? Array.from(types)[0] : '';
  if (days.size > 1 || types.size > 1) return { name: 'Recorded workout', day: '', type: '' };
  if (day && type) return { name: `${day} · ${type}`, day, type };
  return { name: day || type || 'Recorded workout', day, type };
}

function byHistoryOrder(a: WorkoutHistorySummary, b: WorkoutHistorySummary): number {
  return b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
}

function dateOf(row: WorkoutHistoryRow | undefined): string {
  return String(row?.log_date || '').slice(0, 10);
}

function workoutIdOf(row: WorkoutHistoryRow | undefined): string {
  return String(row?.workout_id || '').trim();
}

function countLoggedWork(rows: WorkoutHistoryRow[]): { exerciseCount: number; workingSets: number } {
  const names = new Set<string>();
  let working = 0;
  rows.forEach((row) => {
    const identity = seriesIdentityFromLog(row);
    if (identity.exerciseName) names.add(seriesKey(identity));
    const type = String(row.snapshot_set_type || 'working');
    if (!isWorkingSet(type)) return;
    working += 1;
  });
  return { exerciseCount: names.size, workingSets: working };
}

function rawText(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

export function historyStatusLabel(status: WorkoutHistoryStatus): string {
  if (status === 'completed') return 'Completed';
  if (status === 'partial') return 'Partial';
  if (status === 'skipped') return 'Skipped';
  if (status === 'unknown') return 'Completion unknown';
  return 'In progress';
}
