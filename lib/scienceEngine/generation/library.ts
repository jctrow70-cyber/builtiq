import { filterEligibleExercises } from '../exerciseSelection';
import { stableFallbackId } from '../catalogAdapter';
import type { CatalogExercise, TrainingProfile } from '../types';
import type { DesignerExercise, Laterality, MeasurementType } from './types';

const STRENGTH_CAP = 140;
const WARMUP_CAP = 36;

export function lateralityOf(ex: CatalogExercise): Laterality {
  const n = ex.name.toLowerCase();
  if (ex.unilateral || /single|one-arm|one arm|split squat|lunge|bulgarian|alternating/.test(n)) {
    if (/alternating/.test(n)) return 'alternating';
    return 'unilateral';
  }
  return 'bilateral';
}

export function measurementTypeOf(ex: CatalogExercise): MeasurementType {
  const rawType = String(ex.raw?.exercise_type || ex.raw?.progression_type || '').toLowerCase();
  const n = ex.name.toLowerCase();
  if (rawType === 'distance') return 'distance';
  if (rawType === 'timed' || rawType === 'duration' || rawType === 'cardio') return 'time';
  if (/plank|dead hang|wall sit/.test(n) || (/\bstretch\b/.test(n) && !/band/.test(n))) return 'time';
  if (/\bfarmer.?s? walk\b|\bsuitcase walk\b/.test(n)) return 'time';
  return 'reps';
}

export function withLibraryId(ex: CatalogExercise): CatalogExercise {
  return ex.id ? ex : { ...ex, id: stableFallbackId(ex.name) };
}

export function toDesignerExercise(ex: CatalogExercise): DesignerExercise {
  const row = withLibraryId(ex);
  const contraindications = Array.isArray(row.raw?.coaching_metadata?.contraindications)
    ? row.raw.coaching_metadata.contraindications.map(String)
    : [];
  return {
    exercise_id: String(row.id),
    name: row.name,
    movement_pattern: row.movementPattern,
    primary_muscles: row.primaryMuscles,
    secondary_muscles: row.secondaryMuscles,
    equipment: row.equipment,
    laterality: lateralityOf(row),
    measurement_type: measurementTypeOf(row),
    exercise_kind: row.exerciseType,
    program_roles: row.programRoles,
    fatigue_cost: row.fatigueCost,
    skill_level: row.skillRequirement,
    warmup_eligible: !!row.warmupSuitable,
    power_eligible: row.programRoles.includes('power'),
    default_rep_min: row.defaultRepMin,
    default_rep_max: row.defaultRepMax,
    contraindications,
  };
}

function scoreCandidate(ex: CatalogExercise, profile: TrainingProfile): number {
  let score = 0;
  if (ex.videoUrl) score += 8;
  if (ex.programRoles.includes('primary')) score += 10;
  if (ex.exerciseType === 'compound') score += 6;
  if (profile.preferredExercises.some((n) => ex.name.toLowerCase().includes(n.toLowerCase()))) score += 24;
  if (ex.primaryMuscles.some((m) => profile.priorityMuscles.includes(m))) score += 12;
  if (ex.warmupSuitable) score += 2;
  if (ex.fatigueCost === 'high') score += 3;
  if (profile.experienceLevel === 'beginner' && ex.skillRequirement === 'high') score -= 20;
  return score;
}

export function buildDesignerLibraries(catalog: CatalogExercise[], profile: TrainingProfile) {
  const eligible = filterEligibleExercises(catalog.map(withLibraryId), profile).filter((ex) => ex.id);
  const ranked = eligible
    .map((ex) => ({ ex, score: scoreCandidate(ex, profile) }))
    .sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name));

  const strength: CatalogExercise[] = [];
  const warmup: CatalogExercise[] = [];
  const seen = new Set<string>();

  for (const { ex } of ranked) {
    const id = String(ex.id);
    if (seen.has(id)) continue;
    const warmupOnly = ex.warmupSuitable && !ex.programRoles.some((r) => r !== 'warmup' && r !== 'power');
    if (ex.warmupSuitable && warmup.length < WARMUP_CAP) {
      warmup.push(ex);
    }
    if (!warmupOnly && strength.length < STRENGTH_CAP) {
      strength.push(ex);
      seen.add(id);
    } else if (warmupOnly) {
      seen.add(id);
    }
  }

  return {
    catalogById: new Map(eligible.map((ex) => [String(ex.id), ex])),
    candidate_library: strength.map(toDesignerExercise),
    warmup_library: warmup.map(toDesignerExercise),
  };
}

export function libraryById(libraries: { candidate_library: DesignerExercise[]; warmup_library: DesignerExercise[] }) {
  const map = new Map<string, DesignerExercise>();
  [...libraries.candidate_library, ...libraries.warmup_library].forEach((ex) => map.set(ex.exercise_id, ex));
  return map;
}
