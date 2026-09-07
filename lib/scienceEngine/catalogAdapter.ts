import { parseCoachingMetadata, parseMuscleTargets } from '../training/exerciseIntelligence';
import { normalizeEquipmentList } from '../training/equipmentFilter';
import { normalizeMovementPattern, normalizeMuscleId, type MuscleId } from './taxonomy';
import type { CatalogExercise, ExerciseTypeKind, ProgramRole } from './types';

function inferKind(name: string, raw?: any): ExerciseTypeKind {
  const mechanic = String(raw?.coaching_metadata?.mechanic || raw?.category || '').toLowerCase();
  if (mechanic === 'isolation' || /curl|raise|fly|extension|pushdown|kickback|shrug/.test(name)) return 'isolation';
  return 'compound';
}

function inferRoles(name: string, kind: ExerciseTypeKind, warmupSuitable: boolean): ProgramRole[] {
  const n = name.toLowerCase();
  const roles: ProgramRole[] = [];
  if (warmupSuitable) roles.push('warmup');
  if (/jump|throw|slam|bound|plyo|chest pass|swing/.test(n)) roles.push('power');
  if (kind === 'isolation') roles.push('isolation', 'accessory');
  else if (/bench|squat|deadlift|overhead press|barbell row|pull-?up/.test(n)) roles.push('primary', 'secondary');
  else roles.push('secondary', 'accessory');
  return roles.filter((r, i, arr) => arr.indexOf(r) === i);
}

function musclesFromRaw(raw: any): { primary: MuscleId[]; secondary: MuscleId[] } {
  const targets = parseMuscleTargets(raw?.muscle_targets);
  const primary = targets.filter((t) => t.role === 'primary').map((t) => normalizeMuscleId(t.muscle)).filter((m): m is MuscleId => !!m);
  const secondary = targets.filter((t) => t.role === 'secondary').map((t) => normalizeMuscleId(t.muscle)).filter((m): m is MuscleId => !!m);
  const fallback = normalizeMuscleId(raw?.muscle_group);
  if (!primary.length && fallback) primary.push(fallback);
  return { primary, secondary };
}

export function catalogExerciseFromRow(row: any): CatalogExercise | null {
  if (!row || row.is_archived) return null;
  const name = String(row.name || '').trim();
  if (!name) return null;
  const coaching = parseCoachingMetadata(row.coaching_metadata);
  const kind = inferKind(name, row);
  const { primary, secondary } = musclesFromRaw(row);
  const warmupSuitable = Boolean(row.warmup_suitable || coaching.programming_role === 'warmup' || /warmup|mobility|stretch/.test(String(row.category || '')));
  return {
    id: row.id ? String(row.id) : undefined,
    name,
    movementPattern: normalizeMovementPattern(row.movement_pattern),
    exerciseType: kind,
    programRoles: inferRoles(name, kind, warmupSuitable),
    equipment: normalizeEquipmentList(row.equipment ? [row.equipment] : []),
    primaryMuscles: primary,
    secondaryMuscles: secondary,
    stabilityRequirement: (row.stability_requirement || 'medium') as CatalogExercise['stabilityRequirement'],
    fatigueCost: (coaching.fatigue_cost === 'moderate' ? 'medium' : coaching.fatigue_cost) || 'medium',
    skillRequirement: (coaching.skill_demand === 'moderate' ? 'medium' : coaching.skill_demand) || 'medium',
    suitableForBeginner: row.suitable_for_beginner !== false && String(row.training_goal || '') !== 'power',
    unilateral: /single|one-arm|split|lunge|bulgarian/.test(name.toLowerCase()),
    defaultRepMin: Number(row.default_rep_min) || (kind === 'isolation' ? 8 : 5),
    defaultRepMax: Number(row.default_rep_max) || (kind === 'isolation' ? 15 : 10),
    videoUrl: row.video_url || row.gif_url || row.media_url || null,
    warmupSuitable,
    warmupCategory: row.warmup_category || null,
    planes: Array.isArray(row.planes) ? row.planes : ['sagittal'],
    warmupFatigue: row.warmup_fatigue || 'low',
    impactLevel: row.impact_level || 'low',
    raw: row,
  };
}

export const FALLBACK_CATALOG: CatalogExercise[] = [
  fallback('Barbell Bench Press', 'horizontal_push', 'compound', ['primary'], ['chest'], ['triceps', 'front_delts'], ['barbell']),
  fallback('Incline Dumbbell Press', 'horizontal_push', 'compound', ['secondary'], ['chest'], ['front_delts', 'triceps'], ['dumbbell']),
  fallback('Cable Chest Fly', 'horizontal_push', 'isolation', ['isolation'], ['chest'], ['front_delts'], ['cable']),
  fallback('Overhead Press', 'vertical_push', 'compound', ['primary'], ['front_delts'], ['triceps', 'side_delts'], ['barbell']),
  fallback('Barbell Row', 'horizontal_pull', 'compound', ['primary'], ['upper_back'], ['lats', 'biceps'], ['barbell']),
  fallback('Dumbbell Row', 'horizontal_pull', 'compound', ['secondary'], ['upper_back'], ['lats', 'biceps'], ['dumbbell']),
  fallback('Lat Pulldown', 'vertical_pull', 'compound', ['primary'], ['lats'], ['biceps', 'upper_back'], ['cable']),
  fallback('Pull-Up', 'vertical_pull', 'compound', ['primary'], ['lats'], ['biceps', 'upper_back'], ['bodyweight']),
  fallback('Back Squat', 'squat', 'compound', ['primary'], ['quads'], ['glutes'], ['barbell']),
  fallback('Goblet Squat', 'squat', 'compound', ['secondary', 'warmup'], ['quads'], ['glutes'], ['dumbbell']),
  fallback('Romanian Deadlift', 'hinge', 'compound', ['primary'], ['hamstrings'], ['glutes', 'spinal_erectors'], ['barbell']),
  fallback('Dumbbell RDL', 'hinge', 'compound', ['secondary', 'warmup'], ['hamstrings'], ['glutes'], ['dumbbell']),
  fallback('Walking Lunge', 'lunge', 'compound', ['secondary'], ['quads'], ['glutes'], ['dumbbell']),
  fallback('Leg Curl', 'knee_flexion', 'isolation', ['isolation'], ['hamstrings'], [], ['machine']),
  fallback('Leg Extension', 'squat', 'isolation', ['isolation'], ['quads'], [], ['machine']),
  fallback('Hip Thrust', 'hinge', 'compound', ['secondary'], ['glutes'], ['hamstrings'], ['barbell']),
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
  fallback('Glute Bridge', 'hinge', 'isolation', ['warmup'], ['glutes'], ['hamstrings'], ['bodyweight']),
  fallback('Lateral Lunge', 'lunge', 'compound', ['warmup'], ['adductors'], ['quads'], ['bodyweight']),
  fallback('Ankle Rocker', 'other', 'isolation', ['warmup'], ['calves'], [], ['bodyweight']),
];

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
    name,
    movementPattern,
    exerciseType,
    programRoles,
    equipment,
    primaryMuscles,
    secondaryMuscles,
    stabilityRequirement: 'medium',
    fatigueCost: programRoles.includes('power') ? 'low' : exerciseType === 'compound' ? 'high' : 'low',
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

export function adaptCatalog(rows: any[] | null | undefined): CatalogExercise[] {
  const adapted = (rows || []).map(catalogExerciseFromRow).filter((row): row is CatalogExercise => !!row);
  if (adapted.length >= 12) return adapted;
  const names = new Set(adapted.map((e) => e.name.toLowerCase()));
  FALLBACK_CATALOG.forEach((item) => {
    if (!names.has(item.name.toLowerCase())) adapted.push(item);
  });
  return adapted;
}
