export type ExtraSetLog = {
  id?: string;
  user_id?: string;
  exercise_id: string;
  workout_id?: string | null;
  catalog_exercise_id?: string | null;
  log_date: string;
  extra_set_number: number;
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

export function extraSetInsertPayload(row: ExtraSetLog): Record<string, unknown> {
  return {
    user_id: row.user_id,
    exercise_id: row.exercise_id,
    workout_id: row.workout_id || null,
    catalog_exercise_id: row.catalog_exercise_id || null,
    log_date: row.log_date,
    extra_set_number: row.extra_set_number,
    set_type: row.set_type || 'working',
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
  };
}

export function extraSetsAreNotPlanned(row: ExtraSetLog): boolean {
  return !!(row.exercise_id && row.extra_set_number >= 1 && !(row as { planned_set_id?: string }).planned_set_id);
}
