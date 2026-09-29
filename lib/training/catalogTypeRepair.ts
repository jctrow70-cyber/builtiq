import {
  inferExerciseType,
  isAuthoritativeCardioCategory,
  isCardioActivityName,
} from './exerciseTypes';
import { mapCatalogCategory } from './masterCatalog';

export function masterCategoryOf(row: any) {
  return String(row?.coaching_metadata?.master_category || '').trim();
}

export function isTrueCardioMaster(row: any) {
  const masterCat = masterCategoryOf(row);
  const masterMove = String(row?.coaching_metadata?.master_movement || '');
  if (isAuthoritativeCardioCategory(masterCat) || /cardio|conditioning/i.test(masterMove)) return true;
  if (isCardioActivityName(row?.name)) return true;
  return false;
}

export function needsCardioInferenceRepair(row: any) {
  if (!row || row.is_archived === true || row.user_id) return false;
  if (String(row.external_source || '') !== 'builtiq_master') return false;
  if (isTrueCardioMaster(row)) return false;
  const typeWrong = String(row.exercise_type || '').toLowerCase() === 'cardio';
  const categoryWrong = String(row.category || '').toLowerCase() === 'cardio';
  const measurement = String(row.coaching_metadata?.measurement_type || '').toLowerCase();
  const progressWrong = String(row.progression_type || '') === 'duration' && (measurement === 'reps' || !measurement);
  return typeWrong || categoryWrong || progressWrong;
}

export function repairedFirstClassFields(row: any) {
  const masterCat = masterCategoryOf(row) || String(row.category || '');
  const exercise_type = inferExerciseType(row.name, row.muscle_group, masterCat, '');
  const category = mapCatalogCategory(masterCat, exercise_type);
  const measurement = String(row.coaching_metadata?.measurement_type || '').toLowerCase();
  const progression_type =
    measurement === 'time' ? 'duration' : measurement === 'distance' ? 'distance' : exercise_type === 'cardio' || exercise_type === 'timed' ? 'duration' : 'weight';
  return { exercise_type, category, progression_type };
}
