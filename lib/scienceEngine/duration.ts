import {
  BILATERAL_SET_SECONDS,
  COOLDOWN_ITEM_SECONDS,
  EXERCISE_TRANSITION_SECONDS,
  POWER_REST_SECONDS,
  PREP_TRANSITION_SECONDS,
  RAMP_REST_SECONDS,
  RAMP_SET_SECONDS,
  SESSION_OVERHEAD_SECONDS,
  SUPERSET_SWAP_SECONDS,
  UNILATERAL_SET_SECONDS,
  type WorkoutDurationBreakdown,
} from './durationConstants';
import { buildEffectiveWorkout, estimateEffectiveBreakdown, estimateEffectiveMinutes } from './generation/effectiveWorkout';
import type { AiWorkoutPlan, DesignerExercise } from './generation/types';
import { powerRestSecondsFor } from './powerPrescription';
import { prepItemSeconds } from './prescriptionTime';
import type { ExercisePrescription, ScienceWorkout, TrainingProfile, WarmupItem } from './types';

export type { WorkoutDurationBreakdown } from './durationConstants';

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

/**
 * 60-minute requests use a practical target band: 55–65 on target, 66–69
 * repairable overage, 70+ hard error. Other lengths keep ~10% / ~15% with floors.
 */
export function sessionDurationTolerance(requestedMinutes: number): { warnDelta: number; errorDelta: number } {
  const minutes = Math.max(1, Number(requestedMinutes) || 60);
  if (minutes === 60) {
    return { warnDelta: 5, errorDelta: 9 };
  }
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

export function countPersistedRampSets(
  workout: AiWorkoutPlan,
  library: Map<string, DesignerExercise>,
  experienceLevel?: string
): number {
  return buildEffectiveWorkout(workout, library, { experienceLevel }).strength.reduce(
    (sum, ex) => sum + (ex.ramp_sets?.length || 0),
    0
  );
}

export function estimateWorkoutBreakdown(opts: {
  warmupItems: WarmupItem[];
  potentiation: ExercisePrescription[];
  rampCount: number;
  exercises: ExercisePrescription[];
  cooldownItems?: Array<{ sets?: number; reps?: string; measurementType?: string }>;
}): WorkoutDurationBreakdown {
  const warmupSeconds =
    SESSION_OVERHEAD_SECONDS +
    opts.warmupItems.reduce(
      (sum, item) =>
        sum +
        prepItemSeconds({
          prescription: item.reps,
          sets: item.sets,
          measurementType: item.measurementType,
          laterality: item.laterality,
        }) +
        PREP_TRANSITION_SECONDS,
      0
    );
  const potentiationSeconds = opts.potentiation.reduce(
    (sum, ex) =>
      sum +
      ex.sets *
        (setExecutionSeconds(ex.name, isUnilateralName(ex.name)) +
          (ex.restSeconds || powerRestSecondsFor({ name: ex.name, movementPattern: ex.movementPattern }))),
    opts.potentiation.length ? 40 : 0
  );
  const rampSeconds = opts.rampCount * (RAMP_SET_SECONDS + RAMP_REST_SECONDS);
  const groups = new Map<string, ExercisePrescription[]>();
  opts.exercises.forEach((ex, i) => {
    const key = ex.supersetGroupId || `solo-${i}`;
    const list = groups.get(key) || [];
    list.push(ex);
    groups.set(key, list);
  });
  let workingSeconds = 0;
  groups.forEach((members) => {
    const grouped = members.length > 1 && members[0].supersetGroupId;
    if (grouped) {
      const rounds = Math.max(...members.map((ex) => ex.sets || 1));
      const pairWork = members.reduce((sum, ex) => sum + setExecutionSeconds(ex.name, isUnilateralName(ex.name)), 0);
      const pairRest = Math.max(...members.map((ex) => ex.restSeconds || 90));
      workingSeconds += rounds * (pairWork + SUPERSET_SWAP_SECONDS * (members.length - 1) + pairRest) + EXERCISE_TRANSITION_SECONDS;
    } else {
      const ex = members[0];
      workingSeconds +=
        (ex.sets || 1) * (setExecutionSeconds(ex.name, isUnilateralName(ex.name)) + (ex.restSeconds || 90)) +
        EXERCISE_TRANSITION_SECONDS;
    }
  });
  const cooldownSeconds = (opts.cooldownItems || []).reduce((sum, item) => {
    if (item.reps) {
      return (
        sum +
        prepItemSeconds({
          prescription: item.reps,
          sets: item.sets,
          measurementType: item.measurementType,
        })
      );
    }
    return sum + (item.sets || 1) * COOLDOWN_ITEM_SECONDS;
  }, 0);
  const totalSeconds = warmupSeconds + potentiationSeconds + rampSeconds + workingSeconds + cooldownSeconds;
  return {
    warmupSeconds,
    potentiationSeconds,
    rampSeconds,
    workingSeconds,
    cooldownSeconds,
    totalSeconds,
    minutes: Math.max(1, Math.round(totalSeconds / 60)),
    rampCount: opts.rampCount,
  };
}

export function estimateWorkoutMinutes(opts: {
  warmupItems: WarmupItem[];
  potentiation: ExercisePrescription[];
  rampCount: number;
  exercises: ExercisePrescription[];
  cooldownItems?: Array<{ sets?: number; reps?: string; measurementType?: string }>;
}): number {
  return estimateWorkoutBreakdown(opts).minutes;
}

export function estimateSessionFromAi(
  workout: AiWorkoutPlan,
  library: Map<string, DesignerExercise>,
  opts?: { experienceLevel?: string }
): number {
  return estimateEffectiveMinutes(buildEffectiveWorkout(workout, library, opts));
}

export function estimateSessionBreakdownFromAi(
  workout: AiWorkoutPlan,
  library: Map<string, DesignerExercise>,
  opts?: { experienceLevel?: string }
): WorkoutDurationBreakdown {
  return estimateEffectiveBreakdown(buildEffectiveWorkout(workout, library, opts));
}

export function trimForDuration(workout: ScienceWorkout, profile: TrainingProfile): ScienceWorkout {
  const limit = profile.preferredSessionMinutes || 60;
  const minMoves = minStrengthMoves(limit);
  let next = { ...workout, exercises: workout.exercises.slice() };
  next.estimatedMinutes = estimateWorkoutMinutes({
    warmupItems: next.warmup,
    potentiation: next.potentiation,
    rampCount: next.exercises.reduce((sum, ex) => sum + (ex.setDetails || []).filter((s) => s.setType === 'warmup').length, 0),
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
      rampCount: next.exercises.reduce((sum, ex) => sum + (ex.setDetails || []).filter((s) => s.setType === 'warmup').length, 0),
      exercises: next.exercises,
      cooldownItems: next.cooldown,
    });
  }
  return next;
}
