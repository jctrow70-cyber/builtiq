import { estimateWorkoutMinutes, sessionDurationTolerance } from './duration';
import { restBand } from './generation/qualityRules';
import { rampCountFor } from './rampUp';
import type { ExercisePrescription, PrimaryGoal, TrainingProfile, WarmupItem } from './types';

export type ProgrammingConflict = {
  code: 'INFEASIBLE_REQUIREMENTS';
  message: string;
  requestedMinutes: number;
  minimumMinutes: number;
  toleranceMinutes: number;
  hardRequirements: string[];
  preferredTargetsAdjusted: string[];
  safetyRequirements: string[];
};

export class ProgrammingConflictError extends Error {
  conflict: ProgrammingConflict;

  constructor(conflict: ProgrammingConflict) {
    super(conflict.message);
    this.name = 'ProgrammingConflictError';
    this.conflict = conflict;
  }
}

/**
 * Checks whether explicit movement, warm-up, and duration requirements can
 * share one session at quality rest. Preferred weekly volume may sit lower.
 * Returns null when the request can be programmed.
 */
export function assessProgrammingFeasibility(profile: TrainingProfile): ProgrammingConflict | null {
  const req = profile.hardRequirements;
  const requestedMinutes = Math.max(1, profile.preferredSessionMinutes || 60);
  const { errorDelta } = sessionDurationTolerance(requestedMinutes);
  const movements: string[] = [];
  if (req?.upperPush) movements.push('upper-body push');
  if (req?.lowerPull) movements.push('lower-body pull');
  if (!movements.length) return null;

  const minimumMinutes = minimumSessionMinutes(profile, movements.length);
  if (minimumMinutes <= requestedMinutes + errorDelta) return null;

  const hardRequirements = [
    ...movements.map((movement) => `Keep ${movement}`),
    `${requestedMinutes}-minute session`,
  ];
  if (req?.identicalDays) hardRequirements.push('Identical training days');
  if (req?.extendedWarmup) hardRequirements.push(`Warm-up of at least ${req.warmupMin} movements`);

  return {
    code: 'INFEASIBLE_REQUIREMENTS',
    message: `A ${requestedMinutes}-minute session cannot fit ${movements.join(' and ')} with the required preparation and quality rest. The minimum estimate is ${minimumMinutes} minutes, and the shared tolerance allows ${errorDelta} minutes over the request.`,
    requestedMinutes,
    minimumMinutes,
    toleranceMinutes: errorDelta,
    hardRequirements,
    preferredTargetsAdjusted: ['Weekly set targets can sit at the useful minimum for this goal and schedule.'],
    safetyRequirements: [
      'Required movement patterns stay in the session.',
      'Rest is kept long enough for the lift instead of being cut to hit the clock.',
    ],
  };
}

function minimumSessionMinutes(profile: TrainingProfile, movementCount: number): number {
  const goal = profile.primaryGoal;
  const repMax = primaryRepMax(goal);
  const rest = restBand({
    role: 'primary',
    kind: 'compound',
    fatigue: 'high',
    repMax,
    goal,
    inSuperset: false,
    experience: profile.experienceLevel,
  }).min;
  const exercises: ExercisePrescription[] = Array.from({ length: movementCount }, (_, index) =>
    workingLift(index === 0 ? 'Bench Press' : 'Romanian Deadlift', rest)
  );
  const rampCount = exercises.reduce(
    (sum, _exercise, index) =>
      sum +
      rampCountFor({
        workingRepMax: repMax,
        experienceLevel: profile.experienceLevel,
        opener: index === 0,
      }),
    0
  );
  const warmupCount = Math.max(2, profile.hardRequirements?.warmupMin || 2);
  const warmupItems: WarmupItem[] = Array.from({ length: warmupCount }, (_, index) => ({
    name: `Prep ${index + 1}`,
    category: 'raise',
    reps: '8',
    sets: 1,
  }));
  const includePrimer = profile.potentiationPreference !== 'off';
  return estimateWorkoutMinutes({
    warmupItems,
    potentiation: includePrimer ? [workingLift('Vertical Jump', 75, 2, 'power')] : [],
    rampCount,
    exercises,
    cooldownItems: [{ name: 'Easy stretch', sets: 1, reps: '30 sec' }],
  });
}

function primaryRepMax(goal: PrimaryGoal): number {
  if (goal === 'strength' || goal === 'strength_hypertrophy' || goal === 'athletic_performance') return 6;
  if (goal === 'hypertrophy' || goal === 'fat_loss_support') return 8;
  return 12;
}

function workingLift(name: string, restSeconds: number, sets = 2, role: ExercisePrescription['role'] = 'primary'): ExercisePrescription {
  return {
    name,
    exerciseId: name,
    muscleGroup: '',
    primaryMuscles: [],
    movementPattern: 'other',
    sets,
    repMin: 3,
    repMax: 6,
    targetRir: 2,
    restSeconds,
    loadIncrement: 0,
    role,
  };
}
