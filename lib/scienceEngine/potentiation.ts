import type { CatalogExercise, ExercisePrescription, TrainingProfile } from './types';
import type { MovementPatternId } from './taxonomy';
import { findByName } from './exerciseSelection';
import { isExplosivePrimer } from './powerPrescription';
import { prescribeExercise } from './prescription';
import { primerPolicyFromProfile, shouldGeneratePowerPrimer } from './primerPolicy';

type PrimerPick = { names: string[]; sets: number; reps: string; minExp?: TrainingProfile['experienceLevel'] };

const PRIMER_BY_PATTERN: Record<string, PrimerPick[]> = {
  horizontal_push: [{ names: ['Medicine Ball Chest Pass', 'Medicine-Ball Chest Pass'], sets: 2, reps: '4' }],
  vertical_push: [{ names: ['Medicine Ball Chest Pass', 'Medicine-Ball Chest Pass'], sets: 2, reps: '3' }],
  squat: [
    { names: ['Box Jump', 'Vertical Jump', 'Squat Jump'], sets: 2, reps: '3', minExp: 'novice' },
    { names: ['Medicine Ball Chest Pass', 'Medicine-Ball Chest Pass'], sets: 2, reps: '4' },
  ],
  lunge: [
    { names: ['Box Jump', 'Vertical Jump', 'Squat Jump'], sets: 2, reps: '3', minExp: 'novice' },
    { names: ['Medicine Ball Chest Pass', 'Medicine-Ball Chest Pass'], sets: 2, reps: '4' },
  ],
  hinge: [
    { names: ['Broad Jump'], sets: 2, reps: '3', minExp: 'novice' },
    { names: ['Kettlebell Swing'], sets: 2, reps: '5' },
  ],
  jump: [{ names: ['Box Jump', 'Vertical Jump', 'Squat Jump'], sets: 2, reps: '3' }],
};

const BEGINNER_SAFE = ['Medicine Ball Chest Pass', 'Medicine-Ball Chest Pass', 'Kettlebell Swing'];

export function generatePotentiation(opts: {
  profile: TrainingProfile;
  primary?: CatalogExercise | null;
  catalog: CatalogExercise[];
}): { items: ExercisePrescription[]; fatigueScore: number } {
  if (!shouldGeneratePowerPrimer(primerPolicyFromProfile(opts.profile))) return { items: [], fatigueScore: 1 };

  const pattern: MovementPatternId | undefined = opts.primary?.movementPattern;
  const options = [
    ...((pattern && PRIMER_BY_PATTERN[pattern]) || PRIMER_BY_PATTERN.horizontal_push),
    // Last-resort beginner-safe ballistic if jump/throw rows are missing from the live catalog.
    { names: ['Kettlebell Swing'], sets: 2, reps: '5' },
  ];
  const allowed = options.filter((opt) => canUsePrimer(opt, opts.profile));
  const want =
    opts.profile.potentiationPreference === 'athletic' || opts.profile.primaryGoal === 'athletic_performance' ? 2 : 1;

  const conservative = opts.profile.primaryGoal === 'hypertrophy';
  const items: ExercisePrescription[] = [];
  for (const pick of allowed) {
    if (items.length >= want) break;
    const ex = pick.names.map((name) => findByName(opts.catalog, name)).find((hit) => hit && isExplosivePrimer(hit));
    if (!ex || !isExplosivePrimer(ex)) continue;
    if (items.some((item) => item.name.toLowerCase() === ex.name.toLowerCase())) continue;
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
    items.push(prescribed);
  }

  const fatigueScore = conservative ? 1 : opts.profile.primaryGoal === 'athletic_performance' ? 3 : 2;
  return { items, fatigueScore };
}

function canUsePrimer(pick: PrimerPick, profile: TrainingProfile): boolean {
  const label = pick.names[0] || '';
  if (profile.experienceLevel === 'beginner' && !BEGINNER_SAFE.some((safe) => normalize(safe) === normalize(label)) && pick.minExp) {
    return false;
  }
  if (profile.painAreas.some((p) => /knee|ankle|achilles/.test(p) && /jump/.test(label.toLowerCase()))) return false;
  return true;
}

function normalize(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[-–—_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseReps(reps: string): [number, number] {
  const n = Number(String(reps).split(/[-/]/)[0]);
  return [n || 3, n || 4];
}

export function matchPrimerToLift(primaryName: string): { name: string; sets: number; reps: string } {
  const n = primaryName.toLowerCase();
  if (/bench|chest press/.test(n)) return { name: 'Medicine Ball Chest Pass', sets: 2, reps: '4' };
  if (/squat|lunge/.test(n)) return { name: 'Box Jump', sets: 2, reps: '3' };
  if (/deadlift/.test(n)) return { name: 'Broad Jump', sets: 2, reps: '3' };
  if (/overhead|shoulder press/.test(n)) return { name: 'Medicine Ball Chest Pass', sets: 2, reps: '3' };
  return { name: 'Medicine Ball Chest Pass', sets: 2, reps: '4' };
}
