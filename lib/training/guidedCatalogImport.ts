import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mapImportRecord, validateImportRecord } from './catalogImportMap';
import type { ExternalExerciseRecord, GuidedImportStats, MappedCatalogRow } from './catalogImportTypes';
import {
  convertExerciseDatasetBulkRows,
  EXERCISE_DB_SOURCE,
  type ExerciseDatasetBulkRow,
} from './exerciseDbImport';

export const GUIDED_CATALOG_BULK_URL =
  'https://raw.githubusercontent.com/AbdelrahmanElghoul/exercises-dataset/main/data/exercises.json';

const BATCH_SIZE = 40;

function emptyStats(): GuidedImportStats {
  return {
    totalFound: 0,
    imported: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    errorMessages: [],
  };
}

export async function fetchGuidedExerciseBulk(): Promise<ExerciseDatasetBulkRow[]> {
  const res = await fetch(GUIDED_CATALOG_BULK_URL, { next: { revalidate: 0 } } as RequestInit);
  if (!res.ok) throw new Error(`Failed to download guided exercise dataset (${res.status})`);
  const rows = (await res.json()) as ExerciseDatasetBulkRow[];
  if (!Array.isArray(rows)) throw new Error('Guided exercise dataset must be a JSON array');
  return rows;
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

async function loadExistingByExternal(
  supabase: SupabaseClient,
  records: ExternalExerciseRecord[]
): Promise<Map<string, string>> {
  const byExternal = new Map<string, string>();
  const ids = Array.from(new Set(records.map((r) => String(r.external_id).trim()).filter(Boolean)));
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('st_exercise_catalog')
      .select('id, external_id')
      .eq('external_source', EXERCISE_DB_SOURCE)
      .in('external_id', chunk);
    if (error) throw new Error(error.message);
    (data || []).forEach((row: any) => {
      byExternal.set(String(row.external_id), row.id);
    });
  }
  return byExternal;
}

export async function importGuidedCatalogToSupabase(
  supabase: SupabaseClient,
  opts?: { dryRun?: boolean }
): Promise<GuidedImportStats> {
  const stats = emptyStats();
  const bulk = await fetchGuidedExerciseBulk();
  const records = recordsFromGuidedBulk(bulk);
  stats.totalFound = records.length;

  const existing = await loadExistingByExternal(supabase, records);
  const toInsert: MappedCatalogRow[] = [];
  const toUpdate: { id: string; row: MappedCatalogRow }[] = [];

  records.forEach((record, index) => {
    const validationError = validateImportRecord(record, index);
    if (validationError) {
      stats.errors++;
      stats.errorMessages.push(validationError);
      return;
    }
    const mapped = mapImportRecord(record);
    if ('error' in mapped) {
      stats.errors++;
      stats.errorMessages.push(mapped.error);
      return;
    }
    const extId = String(record.external_id).trim();
    const existingId = existing.get(extId);
    if (existingId) toUpdate.push({ id: existingId, row: mapped });
    else toInsert.push(mapped);
  });

  if (opts?.dryRun) {
    stats.inserted = toInsert.length;
    stats.updated = toUpdate.length;
    stats.imported = toInsert.length + toUpdate.length;
    return stats;
  }

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const chunk = toInsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('st_exercise_catalog').insert(chunk);
    if (error) {
      stats.errors += chunk.length;
      stats.errorMessages.push(`Insert batch ${i / BATCH_SIZE + 1}: ${error.message}`);
    } else {
      stats.inserted += chunk.length;
      stats.imported += chunk.length;
    }
  }

  for (const { id, row } of toUpdate) {
    const { error } = await supabase
      .from('st_exercise_catalog')
      .update(row)
      .eq('id', id)
      .is('user_id', null)
      .eq('is_system', true);
    if (error) {
      stats.errors++;
      stats.errorMessages.push(`${row.name}: ${error.message}`);
    } else {
      stats.updated++;
      stats.imported++;
    }
  }

  return stats;
}

export function hasGuidedImportServerConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createServiceRoleSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Server missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
