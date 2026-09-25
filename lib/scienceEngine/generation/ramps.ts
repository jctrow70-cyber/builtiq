import { generateRampSets } from '../rampUp';
import type { TrainingProfile } from '../types';
import { isRampEligible } from './qualityRules';
import type { AiRampSet, DesignerExercise, StrengthRole } from './types';

export type RampSlotInput = {
  exercise: DesignerExercise;
  role: StrengthRole;
  repMax: number;
  sessionIndex: number;
  isFirstRampEligible: boolean;
  experienceLevel?: string;
};

/**
 * Session ramp rules (science overlay; AI does not author ramps):
 * 1. Only ramp-eligible primaries get ramps (compound, skill/fatigue, working ≤12).
 * 2. The first ramp-eligible lift is the opener:
 *    - working ≤6 and not beginner → 4 stages (10 / 8 / 5 / 3)
 *    - otherwise → 3 stages (8 / 5 / 3)
 *    - beginner → never more than 3
 * 3. Later ramp-eligible lifts get an abbreviated specific warmup (2 stages).
 *    They still need pattern-specific ramps, but not a second full opener.
 * 4. Isolation, accessory, and warmup-only cards get 0 ramps.
 */
export function rampSetsForSlot(input: RampSlotInput, profile?: Pick<TrainingProfile, 'experienceLevel'> | TrainingProfile): AiRampSet[] {
  if (!isRampEligible(input.exercise, input.role, input.repMax)) return [];
  const experience = String(input.experienceLevel || profile?.experienceLevel || 'intermediate').toLowerCase();
  const beginner = experience === 'beginner';
  const heavy = input.repMax <= 6;

  if (input.isFirstRampEligible) {
    return standardRampSets({ experienceLevel: experience } as TrainingProfile, input.repMax);
  }

  if (heavy) {
    return beginner
      ? [{ percent_of_working: 0.6, reps: 5 }]
      : [
          { percent_of_working: 0.55, reps: 5 },
          { percent_of_working: 0.8, reps: 3 },
        ];
  }
  return beginner
    ? [{ percent_of_working: 0.6, reps: 5 }]
    : [
        { percent_of_working: 0.6, reps: 5 },
        { percent_of_working: 0.8, reps: 2 },
      ];
}

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

export function assignSessionRamps<T extends { exercise_id: string; role: StrengthRole; rep_max: number }>(
  exercises: T[],
  library: Map<string, DesignerExercise>,
  experienceLevel?: string
): Array<{ exercise: T; ramp_sets: AiRampSet[] }> {
  let firstAssigned = false;
  return exercises.map((exercise, sessionIndex) => {
    const meta = library.get(exercise.exercise_id);
    if (!meta) return { exercise, ramp_sets: [] };
    const eligible = isRampEligible(meta, exercise.role, exercise.rep_max);
    const ramp_sets = eligible
      ? rampSetsForSlot(
          {
            exercise: meta,
            role: exercise.role,
            repMax: exercise.rep_max,
            sessionIndex,
            isFirstRampEligible: !firstAssigned,
            experienceLevel,
          },
          { experienceLevel: (experienceLevel || 'intermediate') as TrainingProfile['experienceLevel'] }
        )
      : [];
    if (ramp_sets.length) firstAssigned = true;
    return { exercise, ramp_sets };
  });
}
