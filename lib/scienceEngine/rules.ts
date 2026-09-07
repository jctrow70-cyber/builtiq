import { SCIENCE_ENGINE_VERSION } from './version';
import type { ExperienceLevel, PrimaryGoal } from './types';
import { MAJOR_MUSCLES, type MuscleId } from './taxonomy';

export type VolumeBand = { min: number; max: number; start: number };

export type ScienceRules = {
  version: string;
  primaryContribution: number;
  secondaryContribution: number;
  priorityMultiplier: Record<'high_priority' | 'normal' | 'maintenance', number>;
  volumeBands: Record<ExperienceLevel, { major: VolumeBand; smaller: VolumeBand }>;
  sessionMuscleSets: { min: number; max: number };
  compoundSets: { min: number; max: number };
  isolationSets: { min: number; max: number };
  rirByExperience: Record<ExperienceLevel, { compound: number; isolation: number; strengthCompound: number }>;
  restSeconds: { heavyCompound: [number, number]; moderateCompound: [number, number]; isolation: [number, number] };
  loadIncrement: { upperCompound: number; lowerCompound: number; percent: number };
  warmupMinutes: Record<'quick' | 'standard' | 'extended', [number, number]>;
  warmupRounds: number;
  warmupRir: [number, number];
  blockWeeksDefault: number;
  volumeIncreaseSets: [number, number];
  volumeReducePercent: [number, number];
  deloadSetReducePercent: [number, number];
  deloadRirIncrease: number;
  exercisePersistenceWeeks: { primary: [number, number]; accessory: [number, number] };
};

export const SCIENCE_RULES_V1: ScienceRules = {
  version: SCIENCE_ENGINE_VERSION,
  primaryContribution: 1,
  secondaryContribution: 0.5,
  priorityMultiplier: {
    high_priority: 1.2,
    normal: 1,
    maintenance: 0.6,
  },
  volumeBands: {
    beginner: { major: { min: 6, max: 8, start: 6 }, smaller: { min: 4, max: 6, start: 4 } },
    novice: { major: { min: 8, max: 10, start: 8 }, smaller: { min: 6, max: 8, start: 6 } },
    intermediate: { major: { min: 10, max: 14, start: 10 }, smaller: { min: 6, max: 10, start: 6 } },
    advanced: { major: { min: 10, max: 14, start: 12 }, smaller: { min: 6, max: 10, start: 8 } },
  },
  sessionMuscleSets: { min: 3, max: 8 },
  compoundSets: { min: 2, max: 4 },
  isolationSets: { min: 2, max: 4 },
  rirByExperience: {
    beginner: { compound: 3, isolation: 3, strengthCompound: 3 },
    novice: { compound: 3, isolation: 2, strengthCompound: 3 },
    intermediate: { compound: 2, isolation: 2, strengthCompound: 2 },
    advanced: { compound: 2, isolation: 1, strengthCompound: 2 },
  },
  restSeconds: {
    heavyCompound: [180, 300],
    moderateCompound: [120, 180],
    isolation: [60, 120],
  },
  loadIncrement: { upperCompound: 5, lowerCompound: 5, percent: 0.025 },
  warmupMinutes: {
    quick: [5, 6],
    standard: [8, 10],
    extended: [10, 15],
  },
  warmupRounds: 2,
  warmupRir: [4, 6],
  blockWeeksDefault: 6,
  volumeIncreaseSets: [1, 2],
  volumeReducePercent: [0.2, 0.4],
  deloadSetReducePercent: [0.3, 0.5],
  deloadRirIncrease: 2,
  exercisePersistenceWeeks: { primary: [6, 10], accessory: [4, 8] },
};

export function isMajorMuscle(muscle: MuscleId): boolean {
  return MAJOR_MUSCLES.includes(muscle);
}

export function goalUsesStrengthBias(goal: PrimaryGoal): boolean {
  return goal === 'strength' || goal === 'strength_hypertrophy' || goal === 'athletic_performance';
}

export function goalUsesHypertrophyBias(goal: PrimaryGoal): boolean {
  return goal === 'hypertrophy' || goal === 'strength_hypertrophy' || goal === 'fat_loss_support';
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function getScienceRules(version = SCIENCE_ENGINE_VERSION): ScienceRules {
  return { ...SCIENCE_RULES_V1, version };
}
