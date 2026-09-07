import type { CatalogExercise, ExercisePrescription, PrimaryGoal, TrainingProfile } from './types';
import type { MovementPatternId } from './taxonomy';
import { findByName } from './exerciseSelection';
import { prescribeExercise } from './prescription';

type PrimerPick = { name: string; sets: number; reps: string; minExp?: TrainingProfile['experienceLevel'] };

const PRIMER_BY_PATTERN: Record<string, PrimerPick[]> = {
  horizontal_push: [{ name: 'Medicine-Ball Chest Pass', sets: 2, reps: '4' }],
  vertical_push: [{ name: 'Medicine-Ball Chest Pass', sets: 2, reps: '3' }],
  squat: [{ name: 'Vertical Jump', sets: 2, reps: '3', minExp: 'novice' }, { name: 'Goblet Squat', sets: 2, reps: '5' }],
  hinge: [{ name: 'Broad Jump', sets: 2, reps: '3', minExp: 'novice' }, { name: 'Kettlebell Swing', sets: 2, reps: '5' }],
  jump: [{ name: 'Vertical Jump', sets: 2, reps: '3' }],
};

const BEGINNER_SAFE = ['Medicine-Ball Chest Pass', 'Kettlebell Swing', 'Goblet Squat'];

export function generatePotentiation(opts: {
  profile: TrainingProfile;
  primary?: CatalogExercise | null;
  catalog: CatalogExercise[];
}): { items: ExercisePrescription[]; fatigueScore: number } {
  if (opts.profile.potentiationPreference === 'off') return { items: [], fatigueScore: 1 };

  const pattern: MovementPatternId | undefined = opts.primary?.movementPattern;
  const options = (pattern && PRIMER_BY_PATTERN[pattern]) || PRIMER_BY_PATTERN.horizontal_push;
  const allowed = options.filter((opt) => canUsePrimer(opt, opts.profile));
  const picks = opts.profile.potentiationPreference === 'athletic' || opts.profile.primaryGoal === 'athletic_performance'
    ? allowed.slice(0, 2)
    : allowed.slice(0, 1);

  const conservative = opts.profile.primaryGoal === 'hypertrophy';
  const items = picks
    .map((pick) => {
      const ex = findByName(opts.catalog, pick.name) || {
        ...(opts.catalog[0] || opts.primary),
        name: pick.name,
        programRoles: ['power'],
        movementPattern: pattern || 'throw',
        primaryMuscles: opts.primary?.primaryMuscles || [],
        secondaryMuscles: [],
        exerciseType: 'compound',
        equipment: [],
        stabilityRequirement: 'medium',
        fatigueCost: 'low',
        skillRequirement: 'low',
        suitableForBeginner: true,
        unilateral: false,
        defaultRepMin: 2,
        defaultRepMax: 5,
        warmupSuitable: false,
        planes: ['sagittal'],
        warmupFatigue: 'very_low',
        impactLevel: 'low',
      } as CatalogExercise;
      const prescribed = prescribeExercise({
        exercise: ex,
        role: 'power',
        profile: opts.profile,
        sets: conservative ? Math.min(2, pick.sets) : pick.sets,
        why: 'Short explosive Power Primer to raise neural readiness without fatigue.',
      });
      const [repMin, repMax] = parseReps(pick.reps);
      prescribed.repMin = repMin;
      prescribed.repMax = repMax;
      prescribed.sets = conservative ? Math.min(2, pick.sets) : pick.sets;
      return prescribed;
    })
    .filter(Boolean);

  const fatigueScore = conservative ? 1 : opts.profile.primaryGoal === 'athletic_performance' ? 3 : 2;
  return { items, fatigueScore };
}

function canUsePrimer(pick: PrimerPick, profile: TrainingProfile): boolean {
  if (profile.experienceLevel === 'beginner' && !BEGINNER_SAFE.includes(pick.name) && pick.minExp) return false;
  if (profile.painAreas.some((p) => /knee|ankle|achilles/.test(p) && /jump/.test(pick.name.toLowerCase()))) return false;
  return true;
}

function parseReps(reps: string): [number, number] {
  const n = Number(String(reps).split(/[-/]/)[0]);
  return [n || 3, n || 4];
}

export function matchPrimerToLift(primaryName: string): PrimerPick {
  const n = primaryName.toLowerCase();
  if (/bench|chest press/.test(n)) return { name: 'Medicine-Ball Chest Pass', sets: 2, reps: '4' };
  if (/squat/.test(n)) return { name: 'Vertical Jump', sets: 2, reps: '3' };
  if (/deadlift/.test(n)) return { name: 'Broad Jump', sets: 2, reps: '3' };
  if (/overhead|shoulder press/.test(n)) return { name: 'Medicine-Ball Chest Pass', sets: 2, reps: '3' };
  return { name: 'Medicine-Ball Chest Pass', sets: 2, reps: '4' };
}
