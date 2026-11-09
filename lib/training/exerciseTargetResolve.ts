/**
 * Resolve an exercise row inside a workout after plan copy / reload.
 * Never returns a stale source object that is not in the target workout.
 */

export type ExerciseTargetLike = {
  id?: string | null;
  name?: string | null;
  catalog_exercise_id?: string | null;
  sort_order?: number | null;
  section?: string | null;
  workout_section?: string | null;
  superset_group_id?: string | null;
  superset_order?: number | null;
  equipment?: string | null;
};

export type WorkoutTargetLike = {
  id?: string | null;
  st_exercises?: ExerciseTargetLike[] | null;
};

function sameId(a: unknown, b: unknown) {
  const left = String(a || '');
  const right = String(b || '');
  return !!left && left === right;
}

function uniqueHit(hits: ExerciseTargetLike[]): ExerciseTargetLike | null {
  if (hits.length === 1) return hits[0];
  return null;
}

/**
 * Find the exercise in targetWorkout that corresponds to sourceExercise.
 * Prefers id, then catalog + sort, then unique catalog, then sort + name, then unique name.
 * Returns null when zero or multiple candidates remain (fail safe).
 */
export function resolveExerciseInWorkout(
  targetWorkout: WorkoutTargetLike | null | undefined,
  sourceExercise: ExerciseTargetLike | null | undefined,
  sectionOf: (exercise: ExerciseTargetLike) => string
): ExerciseTargetLike | null {
  if (!targetWorkout || !sourceExercise) return null;
  const all = targetWorkout.st_exercises || [];
  if (!all.length) return null;

  if (sourceExercise.id) {
    const byId = all.find((exercise) => sameId(exercise.id, sourceExercise.id));
    if (byId) return byId;
  }

  const section = sectionOf(sourceExercise);
  const pool = all.filter((exercise) => sectionOf(exercise) === section);
  if (!pool.length) return null;

  const catalogId = String(sourceExercise.catalog_exercise_id || '').trim();
  const sortOrder = sourceExercise.sort_order;
  const name = String(sourceExercise.name || '').trim();
  const hasSort = sortOrder !== null && sortOrder !== undefined && String(sortOrder) !== '';

  if (catalogId && hasSort) {
    const hits = pool.filter(
      (exercise) =>
        String(exercise.catalog_exercise_id || '').trim() === catalogId
        && Number(exercise.sort_order) === Number(sortOrder)
    );
    const unique = uniqueHit(hits);
    if (unique) return unique;
    if (hits.length > 1) return null;
  }

  if (catalogId) {
    const hits = pool.filter((exercise) => String(exercise.catalog_exercise_id || '').trim() === catalogId);
    const unique = uniqueHit(hits);
    if (unique) return unique;
    if (hits.length > 1) return null;
  }

  if (name && hasSort) {
    const hits = pool.filter(
      (exercise) =>
        String(exercise.name || '').trim() === name
        && Number(exercise.sort_order) === Number(sortOrder)
    );
    const unique = uniqueHit(hits);
    if (unique) return unique;
    if (hits.length > 1) return null;
  }

  if (name) {
    const hits = pool.filter((exercise) => String(exercise.name || '').trim() === name);
    return uniqueHit(hits);
  }

  return null;
}

/** Resolve across current or future-week workouts. Never falls back to the source row. */
export function resolveExerciseTarget(
  targetWorkout: WorkoutTargetLike | null | undefined,
  sourceExercise: ExerciseTargetLike | null | undefined,
  _currentWorkout: WorkoutTargetLike | null | undefined,
  sectionOf: (exercise: ExerciseTargetLike) => string
): ExerciseTargetLike | null {
  return resolveExerciseInWorkout(targetWorkout, sourceExercise, sectionOf);
}

/** True when a PostgREST update payload returned at least one row. */
export function exerciseUpdateTouchedRow(data: unknown): boolean {
  return Array.isArray(data) && data.length > 0;
}

export function remapPendingByExerciseId(
  pending: Record<string, string>,
  fromId: string | null | undefined,
  toId: string | null | undefined
): Record<string, string> {
  const from = String(fromId || '');
  const to = String(toId || '');
  if (!from || !to || from === to) return pending;
  if (!Object.prototype.hasOwnProperty.call(pending, from)) return pending;
  const next = { ...pending };
  const value = next[from];
  delete next[from];
  next[to] = value;
  return next;
}

export function clearPendingEquipmentIds(
  pending: Record<string, string>,
  ids: Array<string | null | undefined>,
  selected: string,
  sameEquipment: (a: string, b: string) => boolean
): Record<string, string> {
  const next = { ...pending };
  ids.forEach((id) => {
    const key = String(id || '');
    if (!key || !Object.prototype.hasOwnProperty.call(next, key)) return;
    if (sameEquipment(next[key], selected)) delete next[key];
  });
  return next;
}
