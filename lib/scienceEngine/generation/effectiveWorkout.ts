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
} from '../durationConstants';
import { prepItemSeconds } from '../prescriptionTime';
import { assignSessionRamps } from './ramps';
import type { AiPrepItem, AiStrengthExercise, AiWorkoutPlan, DesignerExercise } from './types';

export type EffectivePrep = {
  exercise_id: string;
  name: string;
  sets: number;
  prescription: string;
  measurement_type?: string;
  laterality?: string;
  executionSeconds: number;
};

export type EffectiveStrength = {
  exercise_id: string;
  name: string;
  role: AiStrengthExercise['role'];
  working_sets: number;
  rest_seconds: number;
  unilateral: boolean;
  supersetGroupId?: string;
  ramp_sets: Array<{ percent_of_working: number; reps: number }>;
  laterality?: string;
  measurement_type?: string;
};

export type EffectiveWorkout = {
  day_label: string;
  warmup: EffectivePrep[];
  potentiation: EffectivePrep[];
  strength: EffectiveStrength[];
  cooldown: EffectivePrep[];
};

export type EffectiveEstimateOpts = {
  experienceLevel?: string;
};

function mapPrep(item: AiPrepItem, library: Map<string, DesignerExercise>): EffectivePrep {
  const meta = library.get(item.exercise_id);
  const prescription = item.prescription || '';
  return {
    exercise_id: item.exercise_id,
    name: meta?.name || item.exercise_id,
    sets: Math.max(1, Number(item.sets) || 1),
    prescription,
    measurement_type: meta?.measurement_type,
    laterality: meta?.laterality,
    executionSeconds: prepItemSeconds({
      prescription,
      sets: item.sets,
      measurementType: meta?.measurement_type,
      laterality: meta?.laterality,
    }),
  };
}

export function buildEffectiveWorkout(
  workout: AiWorkoutPlan,
  library: Map<string, DesignerExercise>,
  opts?: EffectiveEstimateOpts
): EffectiveWorkout {
  const flat = (workout.strength || []).flatMap((block, blockIndex) =>
    (block.exercises || []).map((ex) => ({
      ...ex,
      _blockIndex: blockIndex,
      _grouped: block.type !== 'straight_sets' && (block.exercises || []).length >= 2,
    }))
  );
  const ramped = assignSessionRamps(flat, library, opts?.experienceLevel);
  const strength: EffectiveStrength[] = ramped.map(({ exercise, ramp_sets }) => {
    const meta = library.get(exercise.exercise_id);
    const grouped = Boolean((exercise as { _grouped?: boolean })._grouped);
    const blockIndex = (exercise as { _blockIndex?: number })._blockIndex;
    return {
      exercise_id: exercise.exercise_id,
      name: meta?.name || exercise.exercise_id,
      role: exercise.role,
      working_sets: Math.max(1, Number(exercise.working_sets) || 1),
      rest_seconds: Number(exercise.rest_seconds) || 90,
      unilateral: meta?.laterality === 'unilateral' || meta?.laterality === 'alternating' || !!exercise.reps_per_side,
      supersetGroupId: grouped ? `block-${blockIndex}` : undefined,
      ramp_sets,
      laterality: meta?.laterality,
      measurement_type: meta?.measurement_type,
    };
  });

  return {
    day_label: workout.day_label,
    warmup: (workout.warmup || []).map((item) => mapPrep(item, library)),
    potentiation: (workout.potentiation || []).map((item) => mapPrep(item, library)),
    strength,
    cooldown: (workout.cooldown || []).map((item) => mapPrep(item, library)),
  };
}

function setWorkSeconds(name: string, unilateral?: boolean) {
  if (unilateral || /single|one-arm|one arm|split squat|lunge|bulgarian|unilateral/.test(name.toLowerCase())) {
    return UNILATERAL_SET_SECONDS;
  }
  return BILATERAL_SET_SECONDS;
}

export function estimateEffectiveBreakdown(workout: EffectiveWorkout): WorkoutDurationBreakdown {
  const warmupSeconds =
    SESSION_OVERHEAD_SECONDS +
    workout.warmup.reduce((sum, item) => sum + item.executionSeconds + PREP_TRANSITION_SECONDS, 0);
  const potentiationSeconds = workout.potentiation.reduce((sum, item) => {
    const work = setWorkSeconds(item.name, item.laterality === 'unilateral');
    return sum + item.sets * (work + POWER_REST_SECONDS);
  }, workout.potentiation.length ? 40 : 0);
  const rampCount = workout.strength.reduce((sum, ex) => sum + (ex.ramp_sets?.length || 0), 0);
  const rampSeconds = rampCount * (RAMP_SET_SECONDS + RAMP_REST_SECONDS);

  const groups = new Map<string, EffectiveStrength[]>();
  workout.strength.forEach((ex, i) => {
    const key = ex.supersetGroupId || `solo-${i}`;
    const list = groups.get(key) || [];
    list.push(ex);
    groups.set(key, list);
  });
  let workingSeconds = 0;
  groups.forEach((members) => {
    const grouped = members.length > 1 && members[0].supersetGroupId;
    if (grouped) {
      const rounds = Math.max(...members.map((ex) => ex.working_sets || 1));
      const pairWork = members.reduce((sum, ex) => sum + setWorkSeconds(ex.name, ex.unilateral), 0);
      const pairRest = Math.max(...members.map((ex) => ex.rest_seconds || 90));
      workingSeconds += rounds * (pairWork + SUPERSET_SWAP_SECONDS * (members.length - 1) + pairRest) + EXERCISE_TRANSITION_SECONDS;
    } else {
      const ex = members[0];
      workingSeconds +=
        (ex.working_sets || 1) * (setWorkSeconds(ex.name, ex.unilateral) + (ex.rest_seconds || 90)) + EXERCISE_TRANSITION_SECONDS;
    }
  });
  const cooldownSeconds = workout.cooldown.reduce((sum, item) => {
    const exec = item.executionSeconds > 0 ? item.executionSeconds : (item.sets || 1) * COOLDOWN_ITEM_SECONDS;
    return sum + exec;
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
    rampCount,
  };
}

export function estimateEffectiveMinutes(workout: EffectiveWorkout): number {
  return estimateEffectiveBreakdown(workout).minutes;
}
