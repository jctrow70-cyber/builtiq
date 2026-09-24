export type PerformanceLike = {
  planned_set_id?: string | null;
  completed?: boolean | null;
  actual_weight?: unknown;
  actual_reps?: unknown;
  actual_duration?: unknown;
  actual_distance?: unknown;
  log_notes?: unknown;
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

export function plannedSetIdsForWorkout(workout: WorkoutLike | null | undefined): string[] {
  const ids: string[] = [];
  (workout?.st_exercises || []).forEach((ex) => {
    (ex.st_planned_sets || []).forEach((set) => {
      if (set?.id) ids.push(String(set.id));
    });
  });
  return ids;
}

export function workoutHasPerformanceLogs(
  workout: WorkoutLike | null | undefined,
  logs: PerformanceLike[] = [],
  extraSetCount = 0
): boolean {
  if (extraSetCount > 0) return true;
  const ids = new Set(plannedSetIdsForWorkout(workout));
  return (logs || []).some((row) => {
    if (!logHasPerformance(row)) return false;
    if (row.set_origin === 'extra') return true;
    if (row.planned_set_id && ids.has(String(row.planned_set_id))) return true;
    return false;
  });
}

export function canMutatePlannedSets(opts: {
  workout?: WorkoutLike | null;
  logs?: PerformanceLike[];
  extraSetCount?: number;
}): { ok: boolean; reason: string } {
  if (workoutHasPerformanceLogs(opts.workout, opts.logs || [], opts.extraSetCount || 0)) {
    return {
      ok: false,
      reason: 'This workout already has performance logs. Planned sets stay frozen; log extra sets instead.',
    };
  }
  return { ok: true, reason: '' };
}

export function prescriptionSetsOnly<T extends { set_origin?: string | null }>(sets: T[] | null | undefined): T[] {
  return (sets || []).filter((set) => String(set.set_origin || 'planned') !== 'extra');
}
