import { inferFallbackFatigue } from './generation/qualityRules';
import { catalogExerciseFromRow, inferExerciseKind, inferPatternFromName, resolveMovementPattern } from './catalogExerciseFromRow';
import type { MuscleId } from './taxonomy';
import type { CatalogExercise, ExerciseTypeKind, ProgramRole } from './types';

export { catalogExerciseFromRow, inferExerciseKind, inferPatternFromName, resolveMovementPattern };

export const FALLBACK_CATALOG: CatalogExercise[] = [
  fallback('Barbell Bench Press', 'horizontal_push', 'compound', ['primary'], ['chest'], ['triceps', 'front_delts'], ['barbell']),
  fallback('Incline Dumbbell Press', 'horizontal_push', 'compound', ['secondary'], ['chest'], ['front_delts', 'triceps'], ['dumbbell']),
  fallback('Dumbbell Bench Press', 'horizontal_push', 'compound', ['secondary'], ['chest'], ['triceps', 'front_delts'], ['dumbbell']),
  fallback('Chest Dip', 'horizontal_push', 'compound', ['secondary'], ['chest'], ['triceps', 'front_delts'], ['bodyweight']),
  fallback('Push-Up', 'horizontal_push', 'compound', ['secondary', 'accessory'], ['chest'], ['triceps', 'front_delts'], ['bodyweight']),
  fallback('Dumbbell Pullover', 'horizontal_push', 'isolation', ['isolation', 'accessory'], ['chest'], ['lats'], ['dumbbell']),
  fallback('Cable Chest Fly', 'horizontal_push', 'isolation', ['isolation'], ['chest'], ['front_delts'], ['cable']),
  fallback('Dumbbell Fly', 'horizontal_push', 'isolation', ['isolation'], ['chest'], ['front_delts'], ['dumbbell']),
  fallback('Hammer Curl', 'elbow_flexion', 'isolation', ['isolation'], ['biceps'], ['forearms'], ['dumbbell']),
  fallback('Overhead Triceps Extension', 'elbow_extension', 'isolation', ['isolation'], ['triceps'], [], ['dumbbell']),
  fallback('Front Raise', 'shoulder_abduction', 'isolation', ['isolation'], ['front_delts'], [], ['dumbbell']),
  fallback('Rear Delt Fly', 'horizontal_pull', 'isolation', ['isolation'], ['rear_delts'], [], ['dumbbell']),
  fallback('Overhead Press', 'vertical_push', 'compound', ['primary'], ['front_delts'], ['triceps', 'side_delts'], ['barbell']),
  fallback('Barbell Row', 'horizontal_pull', 'compound', ['primary'], ['upper_back'], ['lats', 'biceps'], ['barbell']),
  fallback('Dumbbell Row', 'horizontal_pull', 'compound', ['secondary'], ['upper_back'], ['lats', 'biceps'], ['dumbbell']),
  fallback('Lat Pulldown', 'vertical_pull', 'compound', ['primary'], ['lats'], ['biceps', 'upper_back'], ['cable']),
  fallback('Pull-Up', 'vertical_pull', 'compound', ['primary'], ['lats'], ['biceps', 'upper_back'], ['bodyweight']),
  fallback('Back Squat', 'squat', 'compound', ['primary'], ['quads'], ['glutes'], ['barbell']),
  fallback('Goblet Squat', 'squat', 'compound', ['secondary', 'warmup'], ['quads'], ['glutes'], ['dumbbell']),
  fallback('Front Squat', 'squat', 'compound', ['primary'], ['quads'], ['glutes', 'abs'], ['barbell']),
  fallback('Bulgarian Split Squat', 'lunge', 'compound', ['primary', 'secondary'], ['quads'], ['glutes'], ['dumbbell']),
  fallback('Conventional Deadlift', 'hinge', 'compound', ['primary'], ['hamstrings'], ['glutes', 'spinal_erectors'], ['barbell']),
  fallback('Trap Bar Deadlift', 'hinge', 'compound', ['primary'], ['hamstrings'], ['quads', 'glutes'], ['barbell']),
  fallback('Romanian Deadlift', 'hinge', 'compound', ['primary'], ['hamstrings'], ['glutes', 'spinal_erectors'], ['barbell']),
  fallback('Dumbbell RDL', 'hinge', 'compound', ['secondary', 'warmup'], ['hamstrings'], ['glutes'], ['dumbbell']),
  fallback('Walking Lunge', 'lunge', 'compound', ['secondary'], ['quads'], ['glutes'], ['dumbbell']),
  fallback('Seated Cable Row', 'horizontal_pull', 'compound', ['secondary'], ['upper_back'], ['lats', 'biceps'], ['cable']),
  fallback('Leg Curl', 'knee_flexion', 'isolation', ['isolation'], ['hamstrings'], [], ['machine']),
  fallback('Leg Extension', 'squat', 'isolation', ['isolation'], ['quads'], [], ['machine']),
  fallback('Hip Thrust', 'hinge', 'compound', ['primary', 'secondary'], ['glutes'], ['hamstrings'], ['barbell']),
  fallback('Single-Leg Hip Thrust', 'hinge', 'compound', ['primary', 'secondary'], ['glutes'], ['hamstrings'], ['bodyweight']),
  fallback('Cable Kickback', 'hinge', 'isolation', ['isolation'], ['glutes'], ['hamstrings'], ['cable']),
  fallback('Hip Abduction', 'other', 'isolation', ['isolation'], ['glutes'], [], ['machine']),
  fallback('Step-Up', 'lunge', 'compound', ['secondary'], ['glutes'], ['quads'], ['dumbbell']),
  fallback('Lateral Raise', 'shoulder_abduction', 'isolation', ['isolation'], ['side_delts'], [], ['dumbbell']),
  fallback('Face Pull', 'horizontal_pull', 'isolation', ['isolation', 'warmup'], ['rear_delts'], ['upper_back'], ['cable']),
  fallback('Dumbbell Curl', 'elbow_flexion', 'isolation', ['isolation'], ['biceps'], [], ['dumbbell']),
  fallback('Triceps Pushdown', 'elbow_extension', 'isolation', ['isolation'], ['triceps'], [], ['cable']),
  fallback('Calf Raise', 'calf_raise', 'isolation', ['isolation'], ['calves'], [], ['machine']),
  fallback('Pallof Press', 'core_anti_rotation', 'isolation', ['accessory'], ['obliques'], ['abs'], ['cable']),
  fallback('Plank', 'core_anti_extension', 'isolation', ['accessory'], ['abs'], [], ['bodyweight']),
  fallback('Medicine-Ball Chest Pass', 'throw', 'compound', ['power'], ['chest'], ['front_delts', 'triceps'], ['medicine ball']),
  fallback('Vertical Jump', 'jump', 'compound', ['power'], ['quads'], ['glutes'], ['bodyweight']),
  fallback('Broad Jump', 'jump', 'compound', ['power'], ['glutes'], ['hamstrings'], ['bodyweight']),
  fallback('Kettlebell Swing', 'hinge', 'compound', ['power', 'warmup'], ['glutes'], ['hamstrings'], ['kettlebell']),
  fallback('Push-Up to Toe Touch', 'horizontal_push', 'compound', ['warmup'], ['chest'], ['abs'], ['bodyweight']),
  fallback('Band Row', 'horizontal_pull', 'compound', ['warmup'], ['upper_back'], ['biceps'], ['band']),
  fallback('Reverse Lunge + Rotation', 'lunge', 'compound', ['warmup'], ['quads'], ['obliques'], ['bodyweight']),
  fallback('Scapular Push-Up', 'horizontal_push', 'isolation', ['warmup'], ['upper_back'], ['chest'], ['bodyweight']),
  fallback('Inchworm', 'other', 'compound', ['warmup'], ['abs'], ['hamstrings'], ['bodyweight']),
  fallback('Glute Bridge', 'hinge', 'isolation', ['isolation', 'secondary', 'warmup'], ['glutes'], ['hamstrings'], ['bodyweight']),
  fallback('Lateral Lunge', 'lunge', 'compound', ['warmup'], ['adductors'], ['quads'], ['bodyweight']),
  fallback('Ankle Rocker', 'other', 'isolation', ['warmup'], ['calves'], [], ['bodyweight']),
  fallback('Doorway Pec Stretch', 'other', 'isolation', ['warmup'], ['chest'], ['front_delts'], ['bodyweight']),
  fallback('Hamstring Stretch', 'other', 'isolation', ['warmup'], ['hamstrings'], [], ['bodyweight']),
  fallback('Hip Flexor Stretch', 'other', 'isolation', ['warmup'], ['hip_flexors'], [], ['bodyweight']),
  fallback('Lat Stretch', 'other', 'isolation', ['warmup'], ['lats'], [], ['bodyweight']),
  fallback("Child's Pose", 'other', 'isolation', ['warmup'], ['lats'], ['abs'], ['bodyweight']),
];

export function stableFallbackId(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  const a = (h >>> 0).toString(16).padStart(8, '0');
  let h2 = 2166136261;
  const extra = `${name}#2`;
  for (let i = 0; i < extra.length; i += 1) h2 = Math.imul(h2 ^ extra.charCodeAt(i), 16777619);
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${a}-${b.slice(0, 4)}-4${b.slice(4, 7)}-8${a.slice(0, 3)}-${b}${a.slice(0, 4)}`.slice(0, 36);
}

function fallback(
  name: string,
  movementPattern: CatalogExercise['movementPattern'],
  exerciseType: ExerciseTypeKind,
  programRoles: ProgramRole[],
  primaryMuscles: MuscleId[],
  secondaryMuscles: MuscleId[],
  equipment: string[]
): CatalogExercise {
  return {
    id: stableFallbackId(name),
    name,
    movementPattern,
    exerciseType,
    programRoles,
    equipment,
    primaryMuscles,
    secondaryMuscles,
    stabilityRequirement: 'medium',
    fatigueCost: inferFallbackFatigue(name, exerciseType, programRoles),
    skillRequirement: 'medium',
    suitableForBeginner: true,
    unilateral: /lunge|row/.test(name.toLowerCase()) && !/barbell row/.test(name.toLowerCase()),
    defaultRepMin: exerciseType === 'isolation' ? 8 : 5,
    defaultRepMax: exerciseType === 'isolation' ? 15 : 10,
    warmupSuitable: programRoles.includes('warmup'),
    warmupCategory: programRoles.includes('warmup') ? 'activation' : null,
    planes: /lateral|rotation/.test(name.toLowerCase()) ? ['frontal'] : ['sagittal'],
    warmupFatigue: 'low',
    impactLevel: /jump|bound/.test(name.toLowerCase()) ? 'moderate' : 'low',
  };
}

function isAdaptedExercise(row: any): row is CatalogExercise {
  return Boolean(
    row &&
      typeof row.name === 'string' &&
      Array.isArray(row.primaryMuscles) &&
      typeof row.movementPattern === 'string' &&
      Array.isArray(row.programRoles)
  );
}

export function adaptCatalog(rows: any[] | null | undefined, opts?: { allowFallback?: boolean }): CatalogExercise[] {
  const adapted = (rows || [])
    .map((row) => {
      if (isAdaptedExercise(row)) {
        return row.id ? row : { ...row, id: stableFallbackId(row.name) };
      }
      return catalogExerciseFromRow(row);
    })
    .filter((row): row is CatalogExercise => !!row);
  if (opts?.allowFallback === false) return adapted;
  if (adapted.length >= 12) return adapted;
  const names = new Set(adapted.map((e) => e.name.toLowerCase()));
  FALLBACK_CATALOG.forEach((item) => {
    if (!names.has(item.name.toLowerCase())) adapted.push(item);
  });
  return adapted;
}
