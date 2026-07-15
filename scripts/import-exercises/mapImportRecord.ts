import { inferExerciseType, EXERCISE_TYPES, type ExerciseType } from '../../lib/training/exerciseTypes';
import { normalizeMovementPattern } from '../../lib/training/exerciseIntelligence';
import type { ExternalExerciseRecord, MappedCatalogRow } from './types';

const TRAINING_GOALS = new Set(['strength', 'hypertrophy', 'endurance', 'power', 'mobility']);
const PROGRESSION_TYPES = new Set(['weight', 'reps', 'duration', 'distance', 'intensity']);

function parseSecondaryMuscles(raw: string[] | string | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return String(raw)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeExerciseType(raw: string | undefined, name: string, muscle: string, category: string): ExerciseType {
  const t = String(raw || '').toLowerCase().trim();
  if (EXERCISE_TYPES.includes(t as ExerciseType)) return t as ExerciseType;
  return inferExerciseType(name, muscle, category, t || undefined);
}

function inferCategory(exerciseType: ExerciseType, raw?: string): string {
  const c = String(raw || '').toLowerCase().trim();
  if (['warmup', 'strength', 'mobility', 'plyometric', 'other'].includes(c)) return c;
  if (exerciseType === 'cardio' || exerciseType === 'mobility') return 'warmup';
  if (exerciseType === 'bodyweight') return 'strength';
  return 'strength';
}

function buildMuscleTargets(primary: string, secondaries: string[]) {
  if (!primary && !secondaries.length) return { targets: null, primaryPct: null, secondaryPct: null };
  const targets: MappedCatalogRow['muscle_targets'] = [];
  const primaryPct = primary ? 60 : null;
  const secondaryPct = secondaries.length ? 40 : null;
  if (primary) targets.push({ muscle: primary, percentage: primaryPct || 100, role: 'primary' });
  if (secondaries.length) {
    const each = Math.floor((secondaryPct || 0) / secondaries.length);
    let remainder = (secondaryPct || 0) - each * secondaries.length;
    secondaries.forEach((muscle, i) => {
      const pct = each + (i === 0 ? remainder : 0);
      targets!.push({ muscle, percentage: pct, role: 'secondary' });
    });
  }
  return { targets, primaryPct, secondaryPct };
}

export function validateImportRecord(record: ExternalExerciseRecord, index: number): string | null {
  if (!record || typeof record !== 'object') return `row ${index}: not an object`;
  if (!String(record.external_source || '').trim()) return `row ${index}: missing external_source`;
  if (!String(record.external_id || '').trim()) return `row ${index}: missing external_id`;
  if (!String(record.name || '').trim()) return `row ${index}: missing name`;
  return null;
}

export function mapImportRecord(record: ExternalExerciseRecord): MappedCatalogRow | { error: string } {
  const name = String(record.name).trim();
  const external_source = String(record.external_source).trim().toLowerCase();
  const external_id = String(record.external_id).trim();
  const primary_muscle = String(record.primary_muscle || '').trim();
  const secondaries = parseSecondaryMuscles(record.secondary_muscles);
  const equipment = String(record.equipment || '').trim();
  const exercise_type = normalizeExerciseType(record.exercise_type, name, primary_muscle, record.category || '');
  const category = inferCategory(exercise_type, record.category);
  const movement_pattern = normalizeMovementPattern(record.movement_pattern);
  const training_goal = TRAINING_GOALS.has(String(record.training_goal || '').toLowerCase())
    ? String(record.training_goal).toLowerCase()
    : null;
  const progression_type = PROGRESSION_TYPES.has(String(record.progression_type || '').toLowerCase())
    ? String(record.progression_type).toLowerCase()
    : exercise_type === 'cardio'
      ? 'duration'
      : 'weight';

  const { targets, primaryPct, secondaryPct } = buildMuscleTargets(primary_muscle, secondaries);

  if (record.movement_pattern && !movement_pattern) {
    return { error: `invalid movement_pattern "${record.movement_pattern}" for ${name}` };
  }

  return {
    name,
    category,
    muscle_group: primary_muscle || secondaries[0] || '',
    equipment,
    movement_pattern,
    exercise_type,
    instructions: String(record.instructions || '').trim() || null,
    media_url: String(record.media_url || '').trim() || null,
    image_url: String(record.thumbnail_url || '').trim() || null,
    gif_url: String(record.gif_url || record.media_url || '').trim() || null,
    external_source,
    external_id,
    training_goal,
    progression_type,
    primary_muscle_percentage: primaryPct,
    secondary_muscle_percentage: secondaryPct,
    muscle_targets: targets,
    coaching_metadata: record.coaching_metadata && typeof record.coaching_metadata === 'object' ? record.coaching_metadata : {},
    is_system: true,
    user_id: null,
    is_archived: false,
  };
}
