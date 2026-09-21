import type { SupabaseClient } from '@supabase/supabase-js';
import { householdCatalogIdUseCount, householdRowsToRemap } from './householdExerciseMap';
import {
  expectedMasterCatalogCount,
  loadMasterLibraryRecords,
  MASTER_CATALOG_SOURCE,
  masterRecordToCatalogRow,
} from './masterCatalog';
import type { MappedCatalogRow } from './catalogImportTypes';

const BATCH = 40;
const UPDATE_CONCURRENCY = 12;

export type MasterImportStats = {
  totalFound: number;
  inserted: number;
  updated: number;
  remappedExercises: number;
  remappedLogs: number;
  archivedOld: number;
  errors: number;
  errorMessages: string[];
};

function emptyStats(): MasterImportStats {
  return {
    totalFound: 0,
    inserted: 0,
    updated: 0,
    remappedExercises: 0,
    remappedLogs: 0,
    archivedOld: 0,
    errors: 0,
    errorMessages: [],
  };
}

function pushError(stats: MasterImportStats, message: string) {
  stats.errors++;
  if (stats.errorMessages.length < 12) stats.errorMessages.push(message);
}

export async function countMasterCatalogRows(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('st_exercise_catalog')
    .select('id', { count: 'exact', head: true })
    .eq('external_source', MASTER_CATALOG_SOURCE)
    .eq('is_system', true)
    .eq('is_archived', false);
  if (error) throw new Error(error.message);
  return count || 0;
}

async function loadMasterByExternal(supabase: SupabaseClient): Promise<Map<string, string>> {
  const byExternal = new Map<string, string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('st_exercise_catalog')
      .select('id, external_id')
      .eq('external_source', MASTER_CATALOG_SOURCE)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const chunk = data || [];
    chunk.forEach((row: any) => byExternal.set(String(row.external_id), row.id));
    if (chunk.length < 1000) break;
    from += 1000;
  }
  return byExternal;
}

/** Re-import must not wipe Veo posters/videos already stored on the card. */
function catalogUpdatePayload(row: MappedCatalogRow) {
  const { media_url: _media, image_url: _image, gif_url: _gif, ...rest } = row;
  return rest;
}

async function countUpdate(
  supabase: SupabaseClient,
  table: 'st_exercises' | 'st_set_logs',
  values: Record<string, unknown>,
  apply: (query: any) => any
) {
  const query = apply(supabase.from(table).update(values));
  const { count, error } = await query.select('id', { count: 'exact', head: true });
  return { count: count || 0, error };
}

async function upsertMasterRows(supabase: SupabaseClient, stats: MasterImportStats, dryRun: boolean) {
  const records = loadMasterLibraryRecords().map(masterRecordToCatalogRow);
  stats.totalFound = records.length;
  const existing = await loadMasterByExternal(supabase);
  const toInsert = records.filter((row) => !existing.get(row.external_id));
  const toUpdate = records
    .map((row) => {
      const id = existing.get(row.external_id);
      return id ? { id, row } : null;
    })
    .filter(Boolean) as { id: string; row: (typeof records)[number] }[];

  if (dryRun) {
    stats.inserted = toInsert.length;
    stats.updated = toUpdate.length;
    return;
  }

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const { error } = await supabase.from('st_exercise_catalog').insert(chunk);
    if (error) {
      stats.errors += chunk.length;
      stats.errorMessages.push(`Insert batch: ${error.message}`);
    } else stats.inserted += chunk.length;
  }

  for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
    const chunk = toUpdate.slice(i, i + UPDATE_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(({ id, row }) =>
        supabase
          .from('st_exercise_catalog')
          .update(catalogUpdatePayload(row))
          .eq('id', id)
          .eq('is_system', true)
          .is('user_id', null)
      )
    );
    results.forEach((result, index) => {
      if (result.error) pushError(stats, `${chunk[index].row.name}: ${result.error.message}`);
      else stats.updated++;
    });
  }
}

async function remapLinkedRows(supabase: SupabaseClient, stats: MasterImportStats, dryRun: boolean) {
  const byExternal = await loadMasterByExternal(supabase);
  const rows = householdRowsToRemap();
  const oldIdCounts = householdCatalogIdUseCount();

  for (let i = 0; i < rows.length; i += UPDATE_CONCURRENCY) {
    const chunk = rows.slice(i, i + UPDATE_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (row) => {
        const newId = byExternal.get(row.new_exercise_id);
        if (!newId) return { row, newId: '', error: `No master row ${row.new_exercise_id} for ${row.logged_name}` };
        if (dryRun) return { row, newId, remappedExercises: 1, remappedLogs: 1 };
        let remappedExercises = 0;
        let remappedLogs = 0;
        if (row.logged_name) {
          const stillNeeds = `catalog_exercise_id.is.null,catalog_exercise_id.neq.${newId}`;
          const ex = await countUpdate(
            supabase,
            'st_exercises',
            { catalog_exercise_id: newId },
            (query) => query.ilike('name', row.logged_name).or(stillNeeds)
          );
          if (ex.error) return { row, newId, error: `Remap exercises ${row.logged_name}: ${ex.error.message}` };
          remappedExercises += ex.count;

          const logNeeds = `snapshot_catalog_exercise_id.is.null,snapshot_catalog_exercise_id.neq.${newId}`;
          const logs = await countUpdate(
            supabase,
            'st_set_logs',
            { snapshot_catalog_exercise_id: newId },
            (query) => query.ilike('snapshot_exercise_name', row.logged_name).or(logNeeds)
          );
          if (logs.error) return { row, newId, error: `Remap logs ${row.logged_name}: ${logs.error.message}` };
          remappedLogs += logs.count;
        }
        return { row, newId, remappedExercises, remappedLogs };
      })
    );

    for (const result of results) {
      if (result.error) {
        pushError(stats, result.error);
        continue;
      }
      stats.remappedExercises += result.remappedExercises || 0;
      stats.remappedLogs += result.remappedLogs || 0;
      const uniqueOld = result.row.current_catalog_id && oldIdCounts.get(result.row.current_catalog_id) === 1;
      if (!uniqueOld || dryRun || !result.newId) continue;

      const leftoverEx = await countUpdate(
        supabase,
        'st_exercises',
        { catalog_exercise_id: result.newId },
        (query) => query.eq('catalog_exercise_id', result.row.current_catalog_id)
      );
      if (leftoverEx.error) stats.errorMessages.push(`Leftover exercise remap ${result.row.logged_name}: ${leftoverEx.error.message}`);
      else stats.remappedExercises += leftoverEx.count;

      const leftoverLog = await countUpdate(
        supabase,
        'st_set_logs',
        { snapshot_catalog_exercise_id: result.newId },
        (query) => query.eq('snapshot_catalog_exercise_id', result.row.current_catalog_id)
      );
      if (leftoverLog.error) stats.errorMessages.push(`Leftover log remap ${result.row.logged_name}: ${leftoverLog.error.message}`);
      else stats.remappedLogs += leftoverLog.count;
    }
  }
}

async function archiveOldSystemCatalog(supabase: SupabaseClient, stats: MasterImportStats, dryRun: boolean) {
  const filter = (query: any) =>
    query
      .eq('is_system', true)
      .is('user_id', null)
      .eq('is_archived', false)
      .or(`external_source.is.null,external_source.neq.${MASTER_CATALOG_SOURCE}`);

  if (dryRun) {
    const { count, error } = await filter(
      supabase.from('st_exercise_catalog').select('id', { count: 'exact', head: true })
    );
    if (error) throw new Error(error.message);
    stats.archivedOld = count || 0;
    return;
  }

  const { count, error } = await filter(
    supabase.from('st_exercise_catalog').update({ is_archived: true })
  ).select('id', { count: 'exact', head: true });
  if (error) {
    pushError(stats, `Archive old catalog: ${error.message}`);
    return;
  }
  stats.archivedOld = count || 0;
}

export async function importMasterCatalogToSupabase(
  supabase: SupabaseClient,
  opts?: { dryRun?: boolean }
): Promise<MasterImportStats> {
  const stats = emptyStats();
  const dryRun = !!opts?.dryRun;
  await upsertMasterRows(supabase, stats, dryRun);
  await remapLinkedRows(supabase, stats, dryRun);
  await archiveOldSystemCatalog(supabase, stats, dryRun);
  return stats;
}

export function masterImportExpectedCount() {
  return expectedMasterCatalogCount();
}
