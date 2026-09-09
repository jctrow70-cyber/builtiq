import { FALLBACK_CATALOG } from './catalogAdapter';
import { findByName } from './exerciseSelection';
import type { CatalogExercise, TrainingProfile } from './types';

const PROVEN_NAMES = [
  'Back Squat',
  'Front Squat',
  'Goblet Squat',
  'Bulgarian Split Squat',
  'Walking Lunge',
  'Leg Press',
  'Conventional Deadlift',
  'Trap Bar Deadlift',
  'Romanian Deadlift',
  'Dumbbell RDL',
  'Hip Thrust',
  'Leg Curl',
  'Calf Raise',
  'Barbell Bench Press',
  'Incline Dumbbell Press',
  'Dumbbell Bench Press',
  'Cable Chest Fly',
  'Dumbbell Fly',
  'Push-Up',
  'Overhead Press',
  'Dumbbell Shoulder Press',
  'Lateral Raise',
  'Front Raise',
  'Rear Delt Fly',
  'Face Pull',
  'Barbell Row',
  'Dumbbell Row',
  'Seated Cable Row',
  'Lat Pulldown',
  'Pull-Up',
  'Dumbbell Curl',
  'Hammer Curl',
  'Triceps Pushdown',
  'Overhead Triceps Extension',
  'Pallof Press',
  'Plank',
  'Farmer Carry',
  'Dumbbell Shoulder Press',
  'Dumbbell Bench Press',
  'Kettlebell Swing',
  'Medicine-Ball Chest Pass',
  'Vertical Jump',
  'Broad Jump',
];

export type DesignerCatalogItem = {
  name: string;
  id?: string;
  pattern: string;
  muscles: string[];
  equipment: string[];
  role: string[];
  fatigue: string;
  skill: string;
  unilateral: boolean;
  warmup: boolean;
  power: boolean;
};

export function designerExercisePool(catalog: CatalogExercise[], profile: TrainingProfile): DesignerCatalogItem[] {
  const pool: DesignerCatalogItem[] = [];
  const seen = new Set<string>();
  for (const name of PROVEN_NAMES) {
    const hit = findByName(catalog, name) || findByName(FALLBACK_CATALOG, name);
    if (!hit) continue;
    const key = hit.name.toLowerCase();
    if (seen.has(key)) continue;
    if (profile.excludedExercises.some((n) => n.toLowerCase() === key)) continue;
    seen.add(key);
    pool.push({
      name: hit.name,
      id: hit.id,
      pattern: hit.movementPattern,
      muscles: hit.primaryMuscles,
      equipment: hit.equipment,
      role: hit.programRoles,
      fatigue: hit.fatigueCost,
      skill: hit.skillRequirement,
      unilateral: !!hit.unilateral,
      warmup: !!hit.warmupSuitable,
      power: hit.programRoles.includes('power'),
    });
  }
  return pool;
}
