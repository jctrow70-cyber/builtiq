import { generateRampSets } from '../rampUp';
import type { TrainingProfile } from '../types';
import { isRampEligible } from './qualityRules';
import type { AiRampSet, DesignerExercise, StrengthRole } from './types';

export function isRampEligiblePrimary(
  ex: DesignerExercise,
  role: StrengthRole = 'primary',
  repMax?: number
): boolean {
  return isRampEligible(ex, role, repMax);
}

export function standardRampSets(profile: TrainingProfile, workingRepMax: number): AiRampSet[] {
  return generateRampSets({ workingRepMax, profile }).map((row) => ({
    percent_of_working: row.percent,
    reps: row.reps,
  }));
}
