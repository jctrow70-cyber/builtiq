import { contributionsForExercise } from '../scienceEngine/contributions';
import { normalizeMovementPattern, normalizeMuscleId, type MuscleId } from '../scienceEngine/taxonomy';
import type { CatalogExercise } from '../scienceEngine/types';
import { type SnapshotProvenance } from '../progress/provenance';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(value: any): string | null {
  const s = String(value || '').trim();
  return UUID_RE.test(s) ? s : null;
}

function intOrNull(value: any): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const PHASE2A1_SNAPSHOT_KEYS = [
  'snapshot_target_rir',
  'snapshot_rep_min',
  'snapshot_rep_max',
  'snapshot_program_role',
  'snapshot_rest_seconds',
] as const;

export function snapshotForLog(
  ex: any,
  set: any,
  workoutRef: any,
  catItem?: any,
  extras?: { equipment?: string; exerciseType?: string; section?: string }
) {
  const equipment = String(extras?.equipment || '').trim();
  const movementPattern = movementPatternSnapshot(catItem);
  const muscleCredits = muscleCreditSnapshot(ex, catItem);
  const variant = meaningfulVariant(ex, catItem);
  const provenance: SnapshotProvenance = {
    equipment: equipment ? 'snapshotted' : 'unknown',
    equipmentDetail: equipment ? 'existing' : 'unspecified',
    movementPattern: movementPattern ? 'snapshotted' : 'unknown',
    muscleCredits: muscleCredits?.length ? 'snapshotted' : 'unknown',
    variant: variant ? 'snapshotted' : 'unknown',
  };
  return {
    snapshot_exercise_name: ex?.name || '',
    snapshot_catalog_exercise_id: uuidOrNull(ex?.catalog_exercise_id),
    snapshot_superset_group_id: uuidOrNull(ex?.superset_group_id),
    snapshot_muscle_group: ex?.muscle_group || '',
    snapshot_equipment: equipment,
    snapshot_movement_pattern: movementPattern,
    snapshot_muscle_credits: muscleCredits,
    snapshot_variant: variant,
    snapshot_provenance: provenance,
    snapshot_section: extras?.section || ex?.section || 'strength',
    snapshot_exercise_type: extras?.exerciseType || ex?.exercise_type || 'strength',
    snapshot_set_type: set?.set_type || 'working',
    snapshot_set_number: set?.set_number || 1,
    snapshot_target_weight: set?.target_weight || '',
    snapshot_target_reps: set?.target_reps || '',
    snapshot_target_rpe: set?.target_rpe || '',
    snapshot_day_label: workoutRef?.day_label || '',
    snapshot_workout_type: workoutRef?.workout_type || '',
    snapshot_week: workoutRef?.week ?? null,
    snapshot_day_order: workoutRef?.day_order ?? null,
    snapshot_target_rir: intOrNull(set?.target_rir),
    snapshot_rep_min: intOrNull(set?.rep_min),
    snapshot_rep_max: intOrNull(set?.rep_max),
    snapshot_program_role: ex?.program_role || null,
    snapshot_rest_seconds: intOrNull(set?.rest_seconds),
  };
}

export const OPTIONAL_LOG_COLUMNS = [
  'actual_rir',
  'pain_score',
  'snapshot_equipment',
  'snapshot_movement_pattern',
  'snapshot_muscle_credits',
  'snapshot_variant',
  'snapshot_provenance',
  ...PHASE2A1_SNAPSHOT_KEYS,
] as const;

/** Drop columns the database does not have yet so logging still saves. */
export function stripUnavailableLogColumns(payload: Record<string, unknown>, errorMessage?: string) {
  const next = stripMissingSnapshotColumns(payload, errorMessage);
  if (!errorMessage) return next;
  OPTIONAL_LOG_COLUMNS.forEach((key) => {
    if (new RegExp(key, 'i').test(errorMessage)) delete next[key];
  });
  return next;
}

export function withoutSnapshotIdentity<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload };
  Object.keys(next).forEach((key) => {
    if (key.startsWith('snapshot_')) delete next[key];
  });
  return next;
}

function movementPatternSnapshot(catItem?: any): string | null {
  const raw = String(catItem?.movement_pattern || '').trim();
  if (!raw) return null;
  return normalizeMovementPattern(raw);
}

function meaningfulVariant(ex?: any, catItem?: any): string | null {
  const laterality = String(ex?.laterality || catItem?.coaching_metadata?.laterality || '')
    .trim()
    .toLowerCase();
  if (laterality === 'unilateral' || laterality === 'alternating') return laterality;
  const variant = String(ex?.variant || catItem?.coaching_metadata?.variant || '').trim();
  return variant || null;
}

function muscleCreditSnapshot(ex?: any, catItem?: any): { muscle: string; contribution: number }[] | null {
  const coaching = catItem?.coaching_metadata || {};
  const exercise = {
    name: String(ex?.name || catItem?.name || ''),
    primaryMuscles: muscleIds(coaching.primary_muscles),
    secondaryMuscles: muscleIds(coaching.secondary_muscles),
    raw: catItem,
  } as Pick<CatalogExercise, 'name' | 'primaryMuscles' | 'secondaryMuscles'> & { raw?: any };
  const credits = contributionsForExercise(exercise);
  return credits.length ? credits.map((credit) => ({ muscle: credit.muscle, contribution: credit.contribution })) : null;
}

function muscleIds(raw: unknown): MuscleId[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return normalizeMuscleId(item);
      if (item && typeof item === 'object' && 'muscle' in item) {
        return normalizeMuscleId(String((item as { muscle?: string }).muscle || ''));
      }
      return null;
    })
    .filter((muscle): muscle is MuscleId => !!muscle);
}

export function stripMissingSnapshotColumns(payload: Record<string, unknown>, errorMessage?: string) {
  const next = { ...payload };
  if (!errorMessage) return next;
  PHASE2A1_SNAPSHOT_KEYS.forEach((key) => {
    if (new RegExp(key, 'i').test(errorMessage)) delete next[key];
  });
  return next;
}

/** Historical logs may omit 2A.1 snapshot fields. Render must tolerate null. */
export function plannedRepRangeFromLog(row: any, plannedSet?: any): { min: number | null; max: number | null; raw: string } {
  const min = row?.snapshot_rep_min ?? plannedSet?.rep_min ?? null;
  const max = row?.snapshot_rep_max ?? plannedSet?.rep_max ?? null;
  const raw = String(row?.snapshot_target_reps || plannedSet?.target_reps || '').trim();
  return {
    min: min == null ? null : Number(min),
    max: max == null ? null : Number(max),
    raw,
  };
}
