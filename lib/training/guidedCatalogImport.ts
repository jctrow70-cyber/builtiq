import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExternalExerciseRecord } from './catalogImportTypes';
import { EXERCISE_DB_IMPORT_BLOCKED } from './contentRights';
import {
  convertExerciseDatasetBulkRows,
  EXERCISE_DB_SOURCE,
  type ExerciseDatasetBulkRow,
} from './exerciseDbImport';

/** Historical mirror. Downloads are refused until commercial rights are verified. */
export const GUIDED_CATALOG_BULK_URL =
  'https://raw.githubusercontent.com/AbdelrahmanElghoul/exercises-dataset/main/data/exercises.json';

export async function fetchGuidedExerciseBulk(): Promise<ExerciseDatasetBulkRow[]> {
  throw new Error(EXERCISE_DB_IMPORT_BLOCKED);
}

export function recordsFromGuidedBulk(rows: ExerciseDatasetBulkRow[]): ExternalExerciseRecord[] {
  return convertExerciseDatasetBulkRows(rows);
}

export async function countGuidedCatalogRows(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('st_exercise_catalog')
    .select('id', { count: 'exact', head: true })
    .eq('external_source', EXERCISE_DB_SOURCE)
    .eq('is_system', true);
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function importGuidedCatalogToSupabase(
  _supabase: SupabaseClient,
  _opts?: { dryRun?: boolean }
): Promise<never> {
  throw new Error(EXERCISE_DB_IMPORT_BLOCKED);
}

export function hasGuidedImportServerConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export { createServiceRoleSupabase } from '../supabaseServer';
