export type ExtraSetLog = {
  id?: string;
  user_id?: string;
  planned_set_id?: string | null;
  exercise_id: string;
  catalog_exercise_id?: string | null;
  log_date: string;
  extra_set_number: number;
  is_extra_set?: boolean;
  set_type?: string;
  actual_weight?: string;
  actual_reps?: string;
  actual_rir?: number | null;
  actual_rpe?: string;
  actual_duration?: string;
  actual_distance?: string;
  completed?: boolean;
  log_notes?: string;
  snapshot_exercise_name?: string;
  snapshot_program_role?: string | null;
  snapshot_catalog_exercise_id?: string | null;
  snapshot_set_type?: string;
  snapshot_set_number?: number;
  snapshot_week?: number | null;
  snapshot_day_label?: string;
  snapshot_workout_type?: string;
};

export function nextExtraSetNumber(existing: ExtraSetLog[]): number {
  const nums = (existing || []).map((row) => Number(row.extra_set_number) || 0);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

export function extraSetsForExercise(rows: ExtraSetLog[], exerciseId: string, logDate: string): ExtraSetLog[] {
  return (rows || [])
    .filter((row) => row.exercise_id === exerciseId && String(row.log_date).slice(0, 10) === logDate)
    .sort((a, b) => (a.extra_set_number || 0) - (b.extra_set_number || 0));
}

export function extraLogsFromSetLogs(rows: Array<Record<string, unknown> | ExtraSetLog> | null | undefined): ExtraSetLog[] {
  return (rows || [])
    .filter((row) => row && (row as ExtraSetLog).is_extra_set === true)
    .map((row) => row as ExtraSetLog);
}

/** Insert path for extras on st_set_logs. Never uses planned_set_id conflict upsert. */
export function extraSetInsertPayload(row: ExtraSetLog): Record<string, unknown> {
  return {
    user_id: row.user_id,
    planned_set_id: null,
    exercise_id: row.exercise_id,
    log_date: row.log_date,
    is_extra_set: true,
    extra_set_number: row.extra_set_number,
    actual_weight: row.actual_weight || '',
    actual_reps: row.actual_reps || '',
    actual_rir: row.actual_rir ?? null,
    actual_rpe: row.actual_rpe || '',
    actual_duration: row.actual_duration || '',
    actual_distance: row.actual_distance || '',
    completed: !!row.completed,
    log_notes: row.log_notes || '',
    snapshot_exercise_name: row.snapshot_exercise_name || '',
    snapshot_program_role: row.snapshot_program_role || null,
    snapshot_catalog_exercise_id: row.snapshot_catalog_exercise_id || row.catalog_exercise_id || null,
    snapshot_set_type: row.set_type || 'working',
    snapshot_set_number: row.extra_set_number,
    snapshot_week: row.snapshot_week ?? null,
    snapshot_day_label: row.snapshot_day_label || '',
    snapshot_workout_type: row.snapshot_workout_type || '',
  };
}

export function extraSetsAreNotPlanned(row: ExtraSetLog | Record<string, unknown>): boolean {
  return (
    (row as ExtraSetLog).is_extra_set === true &&
    !(row as ExtraSetLog).planned_set_id &&
    !!(row as ExtraSetLog).exercise_id &&
    Number((row as ExtraSetLog).extra_set_number) >= 1
  );
}

/** Extra sets may appear in history/PRs/volume but do not qualify 2A progression. */
export function countsTowardProgression(row: { is_extra_set?: boolean | null; set_origin?: string | null } | null | undefined): boolean {
  if (!row) return false;
  return row.is_extra_set !== true && String(row.set_origin || 'planned') !== 'extra';
}

export function extraSetsDoNotCompleteWorkout(opts: {
  plannedSetIds: string[];
  logs: Array<{ planned_set_id?: string | null; completed?: boolean; is_extra_set?: boolean }>;
}): boolean {
  if (!opts.plannedSetIds.length) return false;
  return opts.plannedSetIds.every((id) =>
    opts.logs.some((row) => row.planned_set_id === id && row.completed === true && row.is_extra_set !== true)
  );
}
