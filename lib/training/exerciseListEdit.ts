export const PENDING_EXERCISE_PREFIX = 'pending-exercise:';

export function isPendingExerciseId(id: string | null | undefined) {
  return String(id || '').startsWith(PENDING_EXERCISE_PREFIX);
}

export function isPendingExercise(exercise: { id?: string | null; client_pending?: boolean } | null | undefined) {
  return !!exercise && (exercise.client_pending === true || isPendingExerciseId(exercise.id));
}

/** A temporary add has no confirmed exercise id or planned-set rows, so it cannot be logged. */
export function exerciseIsLoggable(exercise: { id?: string | null; client_pending?: boolean } | null | undefined) {
  return !!exercise && !isPendingExercise(exercise);
}

export function createPendingExerciseId() {
  return `${PENDING_EXERCISE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type WorkoutLike = { id?: string; st_exercises?: any[] };
type ProgramLike = { id?: string; st_workouts?: WorkoutLike[] } | null | undefined;

export type RemovedExercise = {
  workoutId: string;
  index: number;
  exercise: any;
};

function clone<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function plannedSetIdsOf(exercises: Array<{ st_planned_sets?: Array<{ id?: string | null; is_deleted?: boolean }> }>) {
  const ids: string[] = [];
  exercises.forEach((exercise) => {
    (exercise.st_planned_sets || []).forEach((set) => {
      if (set?.id && !set.is_deleted && !isPendingExerciseId(set.id)) ids.push(set.id);
    });
  });
  return ids;
}

export function removeExercisesFromProgram(
  program: ProgramLike,
  removals: Array<{ workoutId: string; exerciseId: string }>
) {
  const next = clone(program);
  const removed: RemovedExercise[] = [];
  if (!next?.st_workouts) return { program: next, removed };
  const wanted = new Map<string, Set<string>>();
  removals.forEach((row) => {
    const ids = wanted.get(row.workoutId) || new Set<string>();
    ids.add(row.exerciseId);
    wanted.set(row.workoutId, ids);
  });
  next.st_workouts.forEach((workout) => {
    const ids = workout.id ? wanted.get(workout.id) : undefined;
    if (!ids || !workout.st_exercises) return;
    const kept: any[] = [];
    workout.st_exercises.forEach((exercise, index) => {
      if (exercise?.id && ids.has(exercise.id)) {
        removed.push({ workoutId: String(workout.id), index, exercise: clone(exercise) });
        return;
      }
      kept.push(exercise);
    });
    workout.st_exercises = kept;
  });
  return { program: next, removed };
}

export function removeExercisesFromWorkoutList(
  workouts: WorkoutLike[],
  removals: Array<{ workoutId: string; exerciseId: string }>
) {
  const result = removeExercisesFromProgram({ st_workouts: workouts || [] }, removals);
  return { workouts: result.program?.st_workouts || [], removed: result.removed };
}

/** Put back only the exercises from this operation. Other edits on the tree stay. */
export function restoreRemovedExercises(program: ProgramLike, removed: RemovedExercise[]) {
  const next = clone(program);
  if (!next?.st_workouts) return next;
  removed.forEach((row) => {
    const workout = next.st_workouts!.find((item) => item.id === row.workoutId);
    if (!workout) return;
    const list = workout.st_exercises || [];
    if (list.some((exercise) => exercise?.id === row.exercise?.id)) return;
    const copy = list.slice();
    const index = Math.max(0, Math.min(row.index, copy.length));
    copy.splice(index, 0, clone(row.exercise));
    workout.st_exercises = copy;
  });
  return next;
}

export function restoreRemovedWorkoutList(workouts: WorkoutLike[], removed: RemovedExercise[]) {
  const restored = restoreRemovedExercises({ st_workouts: workouts || [] }, removed);
  return restored?.st_workouts || [];
}

export function insertExercisesIntoProgram(
  program: ProgramLike,
  additions: Array<{ workoutId: string; exercise: any }>
) {
  const next = clone(program);
  if (!next?.st_workouts) return next;
  additions.forEach((row) => {
    const workout = next.st_workouts!.find((item) => item.id === row.workoutId);
    if (!workout || !row.exercise?.id) return;
    const list = workout.st_exercises || [];
    if (list.some((exercise) => exercise?.id === row.exercise.id)) return;
    workout.st_exercises = list.concat([clone(row.exercise)]);
  });
  return next;
}

export function insertExercisesIntoWorkoutList(
  workouts: WorkoutLike[],
  additions: Array<{ workoutId: string; exercise: any }>
) {
  const next = insertExercisesIntoProgram({ st_workouts: workouts || [] }, additions);
  return next?.st_workouts || [];
}

export function replaceExerciseInProgram(
  program: ProgramLike,
  workoutId: string,
  exerciseId: string,
  nextExercise: any
) {
  const next = clone(program);
  const workout = next?.st_workouts?.find((item) => item.id === workoutId);
  if (!workout?.st_exercises) return next;
  let found = false;
  workout.st_exercises = workout.st_exercises.map((exercise) => {
    if (exercise?.id !== exerciseId) return exercise;
    found = true;
    return clone(nextExercise);
  });
  if (!found) return next;
  return next;
}

export function dropExercisesFromProgram(
  program: ProgramLike,
  removals: Array<{ workoutId: string; exerciseId: string }>
) {
  return removeExercisesFromProgram(program, removals).program;
}

export type ExerciseRemovalStep = 'remove' | 'wait' | 'blocked';

/** Hide only when this exercise has no set edit still waiting or failed. */
export function exerciseRemovalAfterSetEdits(input: {
  pendingSetIds: readonly string[];
  failedSetIds: readonly string[];
}): ExerciseRemovalStep {
  if (input.failedSetIds.length) return 'blocked';
  if (input.pendingSetIds.length) return 'wait';
  return 'remove';
}

export function setIdsInPendingFieldKeys(setIds: readonly string[], fieldKeys: readonly string[]) {
  const pending: string[] = [];
  setIds.forEach((setId) => {
    const touched = fieldKeys.some((key) => key === setId || key.startsWith(`${setId}:`) || key.endsWith(`:${setId}`));
    if (touched) pending.push(setId);
  });
  return pending;
}

export function workoutsInEditScope<T extends { id: string; week?: number | null; day_order?: number | null }>(
  workouts: T[],
  active: { id: string; week?: number | null; day_order?: number | null },
  scope: 'current' | 'future',
  sessionForcesCurrent: boolean
): T[] {
  if (sessionForcesCurrent || scope !== 'future') {
    const exact = workouts.find((workout) => workout.id === active.id);
    return exact ? [exact] : [];
  }
  return workouts
    .filter((workout) => workout.day_order === active.day_order && (workout.week || 0) >= (active.week || 0))
    .slice()
    .sort((a, b) => (a.week || 0) - (b.week || 0));
}
