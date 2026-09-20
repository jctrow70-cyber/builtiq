import type { SupabaseClient } from '@supabase/supabase-js';
import { householdCatalogIdUseCount, householdRowsToRemap } from './householdExerciseMap';
import {
  expectedMasterCatalogCount,
  loadMasterLibraryRecords,
  MASTER_CATALOG_SOURCE,
  masterRecordToCatalogRow,
} from './masterCatalog';

const BATCH = 40;

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

  for (const { id, row } of toUpdate) {
    const { error } = await supabase
      .from('st_exercise_catalog')
      .update(row)
      .eq('id', id)
      .eq('is_system', true)
      .is('user_id', null);
    if (error) {
      stats.errors++;
      stats.errorMessages.push(`${row.name}: ${error.message}`);
    } else stats.updated++;
  }
}

async function remapLinkedRows(supabase: SupabaseClient, stats: MasterImportStats, dryRun: boolean) {
  const byExternal = await loadMasterByExternal(supabase);
  const rows = householdRowsToRemap();
  const oldIdCounts = householdCatalogIdUseCount();

  for (const row of rows) {
    const newId = byExternal.get(row.new_exercise_id);
    if (!newId) {
      stats.errors++;
      stats.errorMessages.push(`No master row ${row.new_exercise_id} for ${row.logged_name}`);
      continue;
    }
    if (dryRun) {
      stats.remappedExercises++;
      stats.remappedLogs++;
      continue;
    }

    if (row.logged_name) {
      const { data: exRows, error: exErr } = await supabase
        .from('st_exercises')
        .update({ catalog_exercise_id: newId })
        .ilike('name', row.logged_name)
        .select('id');
      if (exErr) {
        stats.errors++;
        stats.errorMessages.push(`Remap exercises ${row.logged_name}: ${exErr.message}`);
      } else stats.remappedExercises += exRows?.length || 0;

      const { data: logRows, error: logErr } = await supabase
        .from('st_set_logs')
        .update({ snapshot_catalog_exercise_id: newId })
        .ilike('snapshot_exercise_name', row.logged_name)
        .select('id');
      if (logErr) {
        stats.errors++;
        stats.errorMessages.push(`Remap logs ${row.logged_name}: ${logErr.message}`);
      } else stats.remappedLogs += logRows?.length || 0;
    }

    const uniqueOld = row.current_catalog_id && oldIdCounts.get(row.current_catalog_id) === 1;
    if (uniqueOld) {
      const { error: leftoverEx } = await supabase
        .from('st_exercises')
        .update({ catalog_exercise_id: newId })
        .eq('catalog_exercise_id', row.current_catalog_id);
      if (leftoverEx) stats.errorMessages.push(`Leftover exercise remap ${row.logged_name}: ${leftoverEx.message}`);

      const { error: leftoverLog } = await supabase
        .from('st_set_logs')
        .update({ snapshot_catalog_exercise_id: newId })
        .eq('snapshot_catalog_exercise_id', row.current_catalog_id);
      if (leftoverLog) stats.errorMessages.push(`Leftover log remap ${row.logged_name}: ${leftoverLog.message}`);
    }
  }
}

async function archiveOldSystemCatalog(supabase: SupabaseClient, stats: MasterImportStats, dryRun: boolean) {
  if (dryRun) {
    const { count, error } = await supabase
      .from('st_exercise_catalog')
      .select('id', { count: 'exact', head: true })
      .eq('is_system', true)
      .is('user_id', null)
      .eq('is_archived', false)
      .or(`external_source.is.null,external_source.neq.${MASTER_CATALOG_SOURCE}`);
    if (error) throw new Error(error.message);
    stats.archivedOld = count || 0;
    return;
  }

  const { data, error } = await supabase
    .from('st_exercise_catalog')
    .update({ is_archived: true })
    .eq('is_system', true)
    .is('user_id', null)
    .eq('is_archived', false)
    .or(`external_source.is.null,external_source.neq.${MASTER_CATALOG_SOURCE}`)
    .select('id');
  if (error) {
    stats.errors++;
    stats.errorMessages.push(`Archive old catalog: ${error.message}`);
    return;
  }
  stats.archivedOld = data?.length || 0;
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
