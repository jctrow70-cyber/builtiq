import { isStrengthLike, type ExerciseType } from './exerciseTypes';

/** One formula id so a later change does not fork the math again. */
export type E1rmFormulaId = 'epley';

export type E1rmConfig = {
  formula: E1rmFormulaId;
  minReps: number;
  maxReps: number;
};

export const DEFAULT_E1RM_CONFIG: E1rmConfig = {
  formula: 'epley',
  minReps: 1,
  maxReps: 10,
};

export type E1rmInput = {
  weight: number | null;
  reps: number | null;
  setType?: string | null;
  exerciseType?: string | null;
};

const EXCLUDED_SET_TYPES = new Set(['warmup', 'warm-up', 'warm_up', 'ramp', 'ramp_up', 'ramp-up']);

export function isWorkingSet(setType?: string | null): boolean {
  const key = String(setType || 'working').toLowerCase().trim().replace(/\s+/g, '_');
  if (key === 'warm-up') return false;
  return !EXCLUDED_SET_TYPES.has(key) && !EXCLUDED_SET_TYPES.has(String(setType || '').toLowerCase().trim());
}

function allowsExternalLoad(exerciseType?: string | null): boolean {
  const type = String(exerciseType || 'strength').toLowerCase();
  if (type === 'cardio' || type === 'mobility' || type === 'timed') return false;
  return isStrengthLike(type as ExerciseType);
}

/**
 * Epley estimated 1RM.
 * Null means the set does not qualify. It is not a zero and it is not the raw weight.
 */
export function estimateE1rm(input: E1rmInput, config: E1rmConfig = DEFAULT_E1RM_CONFIG): number | null {
  if (!isWorkingSet(input.setType)) return null;
  if (!allowsExternalLoad(input.exerciseType)) return null;
  const weight = input.weight;
  const reps = input.reps;
  if (weight == null || !Number.isFinite(weight) || weight <= 0) return null;
  if (reps == null || !Number.isFinite(reps) || reps < config.minReps || reps > config.maxReps) return null;

  if (config.formula === 'epley') {
    return weight * (1 + reps / 30);
  }
  return null;
}
