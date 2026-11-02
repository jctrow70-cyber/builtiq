import { exerciseSection } from '../programDesign/workoutPreview';
import { SET_TYPES, type SetTypeValue } from './setTypes';

export const LOGGED_SET_REMOVAL_CONFIRMATION =
  'Remove this set from the plan? The numbers already logged stay in history.';

export type PlannedSetIdentity = {
  id?: string | null;
  sort_order?: number | null;
  set_number?: number | null;
  set_type?: string | null;
  is_deleted?: boolean | null;
};

export type PlannedExerciseIdentity = {
  id?: string | null;
  name?: string | null;
  section?: string | null;
  program_role?: string | null;
  catalog_exercise_id?: string | null;
  equipment?: string | null;
  variant?: string | null;
  sort_order?: number | null;
  st_planned_sets?: PlannedSetIdentity[] | null;
};

export type PlannedWorkoutIdentity = {
  id?: string | null;
  st_exercises?: PlannedExerciseIdentity[] | null;
};

export type PlannedProgramIdentity = {
  st_workouts?: PlannedWorkoutIdentity[] | null;
};

export type PlannedSetResolution =
  | { ok: true; ids: string[] }
  | { ok: false; reason: string };

const ALLOWED = new Set<string>(SET_TYPES.map((item) => item.value));

export function isCorrectableSetType(value: string): value is SetTypeValue {
  return ALLOWED.has(value);
}

function norm(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function plannedExerciseKey(exercise: PlannedExerciseIdentity) {
  const section = exerciseSection(exercise);
  const equipment = norm(exercise.equipment);
  const variant = norm(exercise.variant);
  const sort = exercise.sort_order ?? '';
  const catalog = String(exercise.catalog_exercise_id || '').trim();
  if (catalog) return `cat|${section}|${catalog}|${equipment}|${variant}|${sort}`;
  return `name|${section}|${norm(exercise.name)}|${equipment}|${variant}|${sort}`;
}

function plannedSetKey(set: PlannedSetIdentity) {
  return `${set.sort_order ?? ''}|${set.set_number ?? ''}|${set.set_type || 'working'}`;
}

function liveSets(exercise: PlannedExerciseIdentity) {
  return (exercise.st_planned_sets || []).filter((set) => set?.id && !set.is_deleted);
}

/**
 * Resolve the clicked set onto each target workout.
 * The same id wins. Otherwise exactly one exercise and one live set must match.
 * A soft-deleted row is never a stand-in for a visible set.
 */
export function resolvePlannedSetTargets(input: {
  sourceExercise: PlannedExerciseIdentity | null | undefined;
  sourceSet: PlannedSetIdentity | null | undefined;
  targetWorkouts: PlannedWorkoutIdentity[] | null | undefined;
}): PlannedSetResolution {
  const sourceSet = input.sourceSet;
  const sourceExercise = input.sourceExercise;
  const workouts = input.targetWorkouts || [];
  if (!sourceExercise || !sourceSet?.id) return { ok: false, reason: 'Could not find this set. Nothing was changed.' };
  if (!workouts.length) return { ok: false, reason: 'Could not find this workout. Nothing was changed.' };
  const ids: string[] = [];
  const sourceKey = plannedExerciseKey(sourceExercise);
  const wantedSet = plannedSetKey(sourceSet);
  for (const workout of workouts) {
    const exercises = workout?.st_exercises || [];
    const byId = exercises
      .flatMap((exercise) => liveSets(exercise))
      .filter((set) => set.id === sourceSet.id);
    if (byId.length === 1) {
      ids.push(String(byId[0].id));
      continue;
    }
    if (byId.length > 1) return { ok: false, reason: 'Two sets match this one. Nothing was changed.' };
    const exerciseMatches = exercises.filter((exercise) => plannedExerciseKey(exercise) === sourceKey);
    if (exerciseMatches.length !== 1) {
      return {
        ok: false,
        reason: exerciseMatches.length
          ? 'Two exercises match this one. Nothing was changed.'
          : 'Could not find this exercise on that plan. Nothing was changed.',
      };
    }
    const setMatches = liveSets(exerciseMatches[0]).filter((set) => plannedSetKey(set) === wantedSet);
    if (setMatches.length !== 1) {
      return {
        ok: false,
        reason: setMatches.length
          ? 'Two sets match this one. Nothing was changed.'
          : 'Could not find this set on that week. Nothing was changed.',
      };
    }
    ids.push(String(setMatches[0].id));
  }
  return { ok: true, ids: Array.from(new Set(ids)) };
}

function mapWorkoutSets<T extends PlannedWorkoutIdentity>(
  workout: T,
  ids: Set<string>,
  mapSet: (set: PlannedSetIdentity) => PlannedSetIdentity
): T {
  let changed = false;
  const exercises = (workout?.st_exercises || []).map((exercise) => {
    let exerciseChanged = false;
    const sets = (exercise.st_planned_sets || []).map((set) => {
      if (!set?.id || !ids.has(String(set.id))) return set;
      const next = mapSet(set);
      if (next !== set) exerciseChanged = true;
      return next;
    });
    if (!exerciseChanged) return exercise;
    changed = true;
    return { ...exercise, st_planned_sets: sets };
  });
  if (!changed) return workout;
  return { ...workout, st_exercises: exercises };
}

export function applyWorkoutSetType<T extends PlannedWorkoutIdentity>(workout: T, ids: readonly string[], setType: string): T {
  const idSet = new Set(ids);
  return mapWorkoutSets(workout, idSet, (set) => (set.set_type === setType ? set : { ...set, set_type: setType }));
}

export function applyWorkoutSetDeleted<T extends PlannedWorkoutIdentity>(workout: T, ids: readonly string[]): T {
  const idSet = new Set(ids);
  return mapWorkoutSets(workout, idSet, (set) => (set.is_deleted ? set : { ...set, is_deleted: true }));
}

export function applyProgramSetType<T extends PlannedProgramIdentity>(program: T, ids: readonly string[], setType: string): T {
  if (!program) return program;
  let changed = false;
  const workouts = (program.st_workouts || []).map((workout) => {
    const next = applyWorkoutSetType(workout, ids, setType);
    if (next !== workout) changed = true;
    return next;
  });
  if (!changed) return program;
  return { ...program, st_workouts: workouts };
}

export function applyProgramSetDeleted<T extends PlannedProgramIdentity>(program: T, ids: readonly string[]): T {
  if (!program) return program;
  let changed = false;
  const workouts = (program.st_workouts || []).map((workout) => {
    const next = applyWorkoutSetDeleted(workout, ids);
    if (next !== workout) changed = true;
    return next;
  });
  if (!changed) return program;
  return { ...program, st_workouts: workouts };
}

export function applyLogSnapshotType<T extends Record<string, { snapshot_set_type?: string | null }>>(
  logs: T,
  ids: readonly string[],
  setType: string
): T {
  let changed = false;
  const next = { ...logs };
  const writable = next as Record<string, { snapshot_set_type?: string | null }>;
  ids.forEach((id) => {
    const row = writable[id];
    if (!row || row.snapshot_set_type === setType) return;
    writable[id] = { ...row, snapshot_set_type: setType };
    changed = true;
  });
  return (changed ? next : logs) as T;
}

/** Mirrors the database rule: only the signed-in user's log on the requested date can change. */
export function sessionLogMayChange(input: {
  callerId: string | null;
  logUserId: string | null;
  logDate: string | null;
  requestedDate: string | null;
  plannedSetAuthorized: boolean;
}) {
  return !!(
    input.callerId &&
    input.logUserId &&
    input.callerId === input.logUserId &&
    input.logDate &&
    input.requestedDate &&
    input.logDate === input.requestedDate &&
    input.plannedSetAuthorized
  );
}

export function createPlannedSetEditQueue() {
  const tails = new Map<string, Promise<void>>();
  return function enqueue<T>(ids: readonly string[], work: () => Promise<T>): Promise<T> {
    const waitFor = Promise.all(ids.map((id) => tails.get(id) || Promise.resolve())).then(
      () => undefined,
      () => undefined
    );
    const run = waitFor.then(work);
    const settled = run.then(
      () => undefined,
      () => undefined
    );
    ids.forEach((id) => tails.set(id, settled));
    return run;
  };
}

export const plannedSetEditQueue = createPlannedSetEditQueue();

type RpcError = { message?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ error: RpcError | null }>;
};

export async function correctPlannedSetType(
  client: RpcClient,
  ids: readonly string[],
  setType: string,
  logDate: string | null
) {
  if (!isCorrectableSetType(setType)) return { ok: false as const, error: 'Choose a set type.' };
  const { error } = await client.rpc('st_correct_planned_set_type', {
    p_planned_set_ids: ids,
    p_set_type: setType,
    p_log_date: logDate,
  });
  if (error) return { ok: false as const, error: error.message || 'Could not change that set.' };
  return { ok: true as const };
}

export async function softDeletePlannedSets(client: RpcClient, ids: readonly string[]) {
  const { error } = await client.rpc('st_soft_delete_planned_sets', { p_planned_set_ids: ids });
  if (error) return { ok: false as const, error: error.message || 'Could not remove that set.' };
  return { ok: true as const };
}
