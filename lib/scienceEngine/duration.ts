import type { ExercisePrescription, ScienceWorkout, TrainingProfile, WarmupItem } from './types';
import type { AiWorkoutPlan, DesignerExercise } from './generation/types';

const BILATERAL_SET_SECONDS = 48;
const UNILATERAL_SET_SECONDS = 78;
const RAMP_SET_SECONDS = 32;
const RAMP_REST_SECONDS = 45;
const PREP_ITEM_SECONDS = 42;
const PREP_TRANSITION_SECONDS = 12;
const EXERCISE_TRANSITION_SECONDS = 40;
const SESSION_OVERHEAD_SECONDS = 90;
const COOLDOWN_ITEM_SECONDS = 50;
const SUPERSET_SWAP_SECONDS = 18;

export function maxStrengthMoves(minutes: number): number {
  if (minutes <= 30) return 4;
  if (minutes <= 45) return 5;
  if (minutes <= 60) return 8;
  if (minutes <= 75) return 9;
  return 10;
}

export function minStrengthMoves(minutes: number): number {
  if (minutes <= 30) return 3;
  if (minutes <= 45) return 4;
  if (minutes <= 60) return 5;
  if (minutes <= 75) return 6;
  return 7;
}

/** Floors keep 20–30 minute sessions from getting 2–3 minute error bands. */
export function sessionDurationTolerance(requestedMinutes: number): { warnDelta: number; errorDelta: number } {
  const minutes = Math.max(1, Number(requestedMinutes) || 60);
  return {
    warnDelta: Math.max(5, Math.round(minutes * 0.1)),
    errorDelta: Math.max(8, Math.round(minutes * 0.15)),
  };
}

export function classifySessionDuration(
  estimatedMinutes: number,
  requestedMinutes: number
): { over: 'ok' | 'warning' | 'error'; under: 'ok' | 'warning' } {
  const { warnDelta, errorDelta } = sessionDurationTolerance(requestedMinutes);
  const overBy = estimatedMinutes - requestedMinutes;
  const underBy = requestedMinutes - estimatedMinutes;
  return {
    over: overBy > errorDelta ? 'error' : overBy > warnDelta ? 'warning' : 'ok',
    under: underBy > errorDelta ? 'warning' : underBy > warnDelta ? 'warning' : 'ok',
  };
}

function isUnilateralName(name: string): boolean {
  return /single|one-arm|one arm|split squat|lunge|bulgarian|unilateral/.test(String(name || '').toLowerCase());
}

function setExecutionSeconds(name: string, unilateral?: boolean): number {
  return unilateral || isUnilateralName(name) ? UNILATERAL_SET_SECONDS : BILATERAL_SET_SECONDS;
}

export function estimateWorkoutMinutes(opts: {
  warmupItems: WarmupItem[];
  potentiation: ExercisePrescription[];
  rampCount: number;
  exercises: ExercisePrescription[];
  cooldownItems?: Array<{ sets?: number }>;
}): number {
  const warmup =
    SESSION_OVERHEAD_SECONDS +
    opts.warmupItems.reduce((sum, item) => sum + (item.sets || 1) * PREP_ITEM_SECONDS + PREP_TRANSITION_SECONDS, 0);
  const primer = opts.potentiation.reduce(
    (sum, ex) => sum + ex.sets * (setExecutionSeconds(ex.name, isUnilateralName(ex.name)) + (ex.restSeconds || 45)),
    opts.potentiation.length ? 40 : 0
  );
  const ramp = opts.rampCount * (RAMP_SET_SECONDS + RAMP_REST_SECONDS);
  const groups = new Map<string, ExercisePrescription[]>();
  opts.exercises.forEach((ex, i) => {
    const key = ex.supersetGroupId || `solo-${i}`;
    const list = groups.get(key) || [];
    list.push(ex);
    groups.set(key, list);
  });
  let work = 0;
  groups.forEach((members) => {
    const grouped = members.length > 1 && members[0].supersetGroupId;
    if (grouped) {
      const rounds = Math.max(...members.map((ex) => ex.sets || 1));
      const pairWork = members.reduce((sum, ex) => sum + setExecutionSeconds(ex.name, isUnilateralName(ex.name)), 0);
      const pairRest = Math.max(...members.map((ex) => ex.restSeconds || 90));
      work += rounds * (pairWork + SUPERSET_SWAP_SECONDS * (members.length - 1) + pairRest) + EXERCISE_TRANSITION_SECONDS;
    } else {
      const ex = members[0];
      work +=
        (ex.sets || 1) * (setExecutionSeconds(ex.name, isUnilateralName(ex.name)) + (ex.restSeconds || 90)) +
        EXERCISE_TRANSITION_SECONDS;
    }
  });
  const cooldown = (opts.cooldownItems || []).reduce((sum, item) => sum + (item.sets || 1) * COOLDOWN_ITEM_SECONDS, 0);
  return Math.max(1, Math.round((warmup + primer + ramp + work + cooldown) / 60));
}

export function estimateSessionFromAi(
  workout: AiWorkoutPlan,
  library: Map<string, DesignerExercise>
): number {
  const exercises = (workout.strength || []).flatMap((block, blockIndex) =>
    (block.exercises || []).map((ex, i) => {
      const meta = library.get(ex.exercise_id);
      const grouped = block.type !== 'straight_sets' && (block.exercises || []).length >= 2;
      return {
        name: meta?.name || ex.exercise_id,
        sets: ex.working_sets,
        restSeconds: ex.rest_seconds || 90,
        role: ex.role,
        muscleGroup: '',
        primaryMuscles: [],
        movementPattern: meta?.movement_pattern || 'other',
        repMin: ex.rep_min,
        repMax: ex.rep_max,
        targetRir: ex.target_rir,
        loadIncrement: 5,
        supersetGroupId: grouped ? `block-${blockIndex}` : undefined,
        unilateral: meta?.laterality === 'unilateral' || ex.reps_per_side,
      } as ExercisePrescription & { unilateral?: boolean };
    })
  );
  return estimateWorkoutMinutes({
    warmupItems: (workout.warmup || []).map((item) => ({
      name: item.exercise_id,
      category: 'activation',
      reps: item.prescription,
      sets: item.sets || 1,
    })),
    potentiation: (workout.potentiation || []).map((item) => ({
      name: item.exercise_id,
      sets: item.sets || 1,
      restSeconds: 45,
      role: 'power',
      muscleGroup: '',
      primaryMuscles: [],
      movementPattern: 'other',
      repMin: 3,
      repMax: 5,
      targetRir: 5,
      loadIncrement: 0,
    })),
    rampCount: (workout.strength || []).flatMap((block) => block.exercises || []).reduce((sum, ex) => sum + (ex.ramp_sets?.length || 0), 0),
    exercises,
    cooldownItems: workout.cooldown || [],
  });
}

export function trimForDuration(workout: ScienceWorkout, profile: TrainingProfile): ScienceWorkout {
  const limit = profile.preferredSessionMinutes || 60;
  const minMoves = minStrengthMoves(limit);
  let next = { ...workout, exercises: workout.exercises.slice() };
  next.estimatedMinutes = estimateWorkoutMinutes({
    warmupItems: next.warmup,
    potentiation: next.potentiation,
    rampCount: next.rampSets.length,
    exercises: next.exercises,
    cooldownItems: next.cooldown,
  });

  while (next.estimatedMinutes > limit + 8 && next.exercises.length > minMoves) {
    const idx = next.exercises.map((ex, i) => ({ ex, i })).reverse().find((row) => row.ex.role === 'isolation' || row.ex.role === 'accessory')?.i;
    if (idx == null) break;
    next.exercises.splice(idx, 1);
    next.estimatedMinutes = estimateWorkoutMinutes({
      warmupItems: next.warmup,
      potentiation: next.potentiation,
      rampCount: next.rampSets.length,
      exercises: next.exercises,
      cooldownItems: next.cooldown,
    });
  }
  return next;
}
