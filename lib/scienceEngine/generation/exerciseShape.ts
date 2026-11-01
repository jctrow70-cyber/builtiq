import type { CatalogExercise } from '../types';
import type { Laterality, MeasurementType } from './types';

/** Laterality from stored coaching metadata, then the exercise name. */
export function lateralityOf(ex: CatalogExercise): Laterality {
  const stored = String(ex.raw?.coaching_metadata?.laterality || '').toLowerCase();
  if (stored === 'bilateral' || stored === 'unilateral' || stored === 'alternating') return stored;
  const n = ex.name.toLowerCase();
  if (ex.unilateral || /single|one-arm|one arm|split squat|lunge|bulgarian|alternating/.test(n)) {
    if (/alternating/.test(n)) return 'alternating';
    return 'unilateral';
  }
  return 'bilateral';
}

/** What the logger records: reps, time, or distance. */
export function measurementTypeOf(ex: CatalogExercise): MeasurementType {
  const stored = String(ex.raw?.coaching_metadata?.measurement_type || '').toLowerCase();
  if (stored === 'reps' || stored === 'time' || stored === 'distance') return stored;
  const rawType = String(ex.raw?.exercise_type || ex.raw?.progression_type || '').toLowerCase();
  const n = ex.name.toLowerCase();
  if (rawType === 'distance') return 'distance';
  if (rawType === 'timed' || rawType === 'duration' || rawType === 'cardio') return 'time';
  if (/plank|dead hang|wall sit/.test(n) || (/\bstretch\b/.test(n) && !/band/.test(n))) return 'time';
  if (/\bfarmer.?s? walk\b|\bsuitcase walk\b/.test(n)) return 'time';
  return 'reps';
}
