import { generateRampSets } from '../rampUp';
import type { TrainingProfile } from '../types';
import type { AiRampSet, DesignerExercise } from './types';

const PRIMARY_RAMP_NAMES = [
  'back squat',
  'front squat',
  'barbell bench press',
  'bench press',
  'conventional deadlift',
  'trap bar deadlift',
  'overhead press',
  'barbell row',
];

export function isRampEligiblePrimary(ex: DesignerExercise | { name: string; role?: string }): boolean {
  const name = String(ex.name || '').toLowerCase();
  return PRIMARY_RAMP_NAMES.some((allowed) => name === allowed || name.startsWith(`${allowed} `));
}

export function standardRampSets(profile: TrainingProfile, workingRepMax: number): AiRampSet[] {
  return generateRampSets({ workingRepMax, profile }).map((row) => ({
    percent_of_working: row.percent,
    reps: row.reps,
  }));
}
