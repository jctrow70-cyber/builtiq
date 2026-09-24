export type PerformanceLike = {
  planned_set_id?: string | null;
  exercise_id?: string | null;
  completed?: boolean | null;
  actual_weight?: unknown;
  actual_reps?: unknown;
  actual_duration?: unknown;
  actual_distance?: unknown;
  log_notes?: unknown;
  is_extra_set?: boolean | null;
  set_origin?: string | null;
};

export type PlannedSetLike = {
  id?: string;
  is_deleted?: boolean;
};

export type WorkoutLike = {
  id?: string;
  st_exercises?: Array<{
    id?: string;
    st_planned_sets?: PlannedSetLike[];
  }>;
};

export const LOGGED_PRESCRIPTION_FIELDS = [
  'target_weight',
  'target_reps',
  'target_rpe',
  'target_rir',
  'rep_min',
  'rep_max',
  'rest_seconds',
  'set_type',
  'set_number',
] as const;

export function logHasPerformance(row: PerformanceLike | null | undefined): boolean {
  return !!(
    row &&
    (String(row.actual_weight || '').trim() ||
      String(row.actual_reps || '').trim() ||
      String(row.actual_duration || '').trim() ||
      String(row.actual_distance || '').trim() ||
      String(row.log_notes || '').trim() ||
      row.completed === true)
  );
}

export function isExtraSetLog(row: PerformanceLike | null | undefined): boolean {
  return !!(row && (row.is_extra_set === true || row.set_origin === 'extra'));
}

export function plannedSetIdsForWorkout(workout: WorkoutLike | null | undefined): string[] {
  const ids: string[] = [];
  (workout?.st_exercises || []).forEach((ex) => {
    (ex.st_planned_sets || []).forEach((set) => {
      if (set?.id) ids.push(String(set.id));
    });
  });
  return ids;
}

export function plannedSetHasPerformance(plannedSetId: string | null | undefined, logs: PerformanceLike[] = []): boolean {
  if (!plannedSetId) return false;
  return (logs || []).some(
    (row) => String(row.planned_set_id || '') === String(plannedSetId) && !isExtraSetLog(row) && logHasPerformance(row)
  );
}

/** Block rewriting prescription fields of a set that already has performance. Insert/delete remain allowed. */
export function canRewritePlannedSetPrescription(opts: {
  plannedSetId?: string | null;
  logs?: PerformanceLike[];
}): { ok: boolean; reason: string } {
  if (plannedSetHasPerformance(opts.plannedSetId, opts.logs || [])) {
    return {
      ok: false,
      reason: 'This planned set already has a logged performance. Its prescription stays as it was when logged.',
    };
  }
  return { ok: true, reason: '' };
}

export function canAddPlannedSetAfterSiblingLogs(): { ok: boolean; reason: string } {
  return { ok: true, reason: '' };
}

export function workoutHasPerformanceLogs(
  workout: WorkoutLike | null | undefined,
  logs: PerformanceLike[] = []
): boolean {
  const ids = new Set(plannedSetIdsForWorkout(workout));
  return (logs || []).some((row) => {
    if (!logHasPerformance(row)) return false;
    if (isExtraSetLog(row)) {
      const exerciseIds = new Set((workout?.st_exercises || []).map((ex) => String(ex.id || '')).filter(Boolean));
      return !row.exercise_id || exerciseIds.has(String(row.exercise_id));
    }
    return !!(row.planned_set_id && ids.has(String(row.planned_set_id)));
  });
}

/** Wholesale replace/import/generate-over-existing-workout only. Not mid-session editing. */
export function canReplaceWorkout(opts: {
  workout?: WorkoutLike | null;
  logs?: PerformanceLike[];
}): { ok: boolean; reason: string } {
  if (workoutHasPerformanceLogs(opts.workout, opts.logs || [])) {
    return {
      ok: false,
      reason: 'This workout already has performance logs. History was not replaced.',
    };
  }
  return { ok: true, reason: '' };
}

/** @deprecated Use canReplaceWorkout for wholesale replace, canRewritePlannedSetPrescription for one set. */
export function canMutatePlannedSets(opts: {
  workout?: WorkoutLike | null;
  logs?: PerformanceLike[];
  extraSetCount?: number;
}): { ok: boolean; reason: string } {
  return canReplaceWorkout({ workout: opts.workout, logs: opts.logs });
}

export function prescriptionSetsOnly<T extends { set_origin?: string | null; is_extra_set?: boolean | null }>(
  sets: T[] | null | undefined
): T[] {
  return (sets || []).filter((set) => set.is_extra_set !== true && String(set.set_origin || 'planned') !== 'extra');
}

export async function fetchWorkoutHasPerformance(supabase: any, workoutId: string): Promise<boolean> {
  const { data: exercises } = await supabase.from('st_exercises').select('id').eq('workout_id', workoutId);
  const exerciseIds = (exercises || []).map((row: { id: string }) => row.id);
  if (!exerciseIds.length) return false;
  const { data: planned } = await supabase.from('st_planned_sets').select('id').in('exercise_id', exerciseIds);
  const plannedIds = (planned || []).map((row: { id: string }) => row.id);
  if (plannedIds.length) {
    const { data: plannedLogs } = await supabase
      .from('st_set_logs')
      .select('id, completed, actual_weight, actual_reps, actual_duration, actual_distance, log_notes')
      .in('planned_set_id', plannedIds)
      .limit(40);
    if ((plannedLogs || []).some((row: PerformanceLike) => logHasPerformance(row))) return true;
  }
  const { data: extraLogs, error: extraErr } = await supabase
    .from('st_set_logs')
    .select('id, completed, actual_weight, actual_reps, actual_duration, actual_distance, log_notes, is_extra_set')
    .in('exercise_id', exerciseIds)
    .eq('is_extra_set', true)
    .limit(40);
  if (extraErr && /is_extra_set|does not exist/i.test(extraErr.message || '')) return false;
  return (extraLogs || []).some((row: PerformanceLike) => logHasPerformance(row));
}
