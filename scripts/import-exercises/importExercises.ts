#!/usr/bin/env node
/**
 * BIQ-0013: Bulk import external exercises into st_exercise_catalog.
 * Uses service role — never touches user custom exercises (user_id IS NOT NULL).
 *
 * Usage:
 *   npm run import:exercises:dry -- --file scripts/import-exercises/sample-dataset.json
 *   npm run import:exercises -- --file path/to/dataset.json
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { mapImportRecord, validateImportRecord } from './mapImportRecord';
import type { ExternalExerciseRecord, ImportAction, ImportStats } from './types';

const BATCH_SIZE = 50;

function loadEnvFiles() {
  const root = process.cwd();
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function parseArgs(argv: string[]) {
  let file = '';
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') dryRun = true;
    else if ((a === '--file' || a === '-f') && argv[i + 1]) file = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(`BuiltIQ exercise import (BIQ-0013)

Options:
  --file, -f <path>   JSON array or JSONL file (required)
  --dry-run, -n       Validate and log actions without writing
  --help, -h          Show this help

Env:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`);
      process.exit(0);
    }
  }
  return { file, dryRun };
}

function loadRecords(filePath: string): ExternalExerciseRecord[] {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const raw = fs.readFileSync(abs, 'utf8').trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('JSON file must be an array of exercise records');
    return parsed;
  }
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line) as ExternalExerciseRecord;
      } catch {
        throw new Error(`Invalid JSONL on line ${i + 1}`);
      }
    });
}

function emptyStats(): ImportStats {
  return {
    totalFound: 0,
    imported: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    duplicatesInFile: 0,
    errors: 0,
    skipReasons: {},
    errorMessages: [],
  };
}

function bumpSkip(stats: ImportStats, reason: string) {
  stats.skipped++;
  stats.skipReasons[reason] = (stats.skipReasons[reason] || 0) + 1;
}

function externalKey(source: string, id: string) {
  return `${source}::${id}`;
}

async function fetchExistingForRecords(
  supabase: ReturnType<typeof createClient>,
  records: ExternalExerciseRecord[]
) {
  const byExternal = new Map<string, { id: string; user_id: string | null; is_system: boolean; name: string }>();
  const bySourceIds = new Map<string, Set<string>>();

  records.forEach((r) => {
    const source = String(r.external_source || '').trim().toLowerCase();
    const id = String(r.external_id || '').trim();
    if (!source || !id) return;
    if (!bySourceIds.has(source)) bySourceIds.set(source, new Set());
    bySourceIds.get(source)!.add(id);
  });

  for (const [source, idSet] of bySourceIds) {
    const ids = [...idSet];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase
        .from('st_exercise_catalog')
        .select('id, external_source, external_id, user_id, is_system, name')
        .eq('external_source', source)
        .in('external_id', chunk);
      if (error) throw new Error(`Failed to load existing (${source}): ${error.message}`);
      (data || []).forEach((row: any) => {
        byExternal.set(externalKey(row.external_source, row.external_id), row);
      });
    }
  }

  const { data: legacy, error: legacyErr } = await supabase
    .from('st_exercise_catalog')
    .select('id, user_id, is_system, name, external_source, external_id')
    .is('external_source', null)
    .eq('is_system', true);
  if (legacyErr) throw new Error(`Failed to load legacy system exercises: ${legacyErr.message}`);
  const legacyNames = new Map<string, { id: string; user_id: string | null }>();
  (legacy || []).forEach((row: any) => {
    legacyNames.set(String(row.name).toLowerCase().trim(), row);
  });

  return { byExternal, legacyNames };
}

function planActions(
  records: ExternalExerciseRecord[],
  existing: Awaited<ReturnType<typeof fetchExistingForRecords>>
): { actions: ImportAction[]; stats: ImportStats } {
  const stats = emptyStats();
  stats.totalFound = records.length;
  const seenInFile = new Set<string>();
  const actions: ImportAction[] = [];

  records.forEach((record, index) => {
    const validationError = validateImportRecord(record, index);
    if (validationError) {
      stats.errors++;
      stats.errorMessages.push(validationError);
      return;
    }

    const source = String(record.external_source).trim().toLowerCase();
    const extId = String(record.external_id).trim();
    const key = externalKey(source, extId);

    if (seenInFile.has(key)) {
      stats.duplicatesInFile++;
      bumpSkip(stats, 'duplicate_in_file');
      actions.push({ kind: 'skip', reason: 'duplicate_in_file', name: record.name, externalKey: key });
      return;
    }
    seenInFile.add(key);

    const mapped = mapImportRecord(record);
    if ('error' in mapped) {
      stats.errors++;
      stats.errorMessages.push(mapped.error);
      return;
    }

    const existingRow = existing.byExternal.get(key);
    if (existingRow) {
      if (existingRow.user_id) {
        bumpSkip(stats, 'user_owned_external_collision');
        actions.push({
          kind: 'skip',
          reason: 'user_owned_external_collision',
          name: mapped.name,
          externalKey: key,
        });
        return;
      }
      actions.push({ kind: 'update', id: existingRow.id, row: mapped });
      return;
    }

    const legacy = existing.legacyNames.get(mapped.name.toLowerCase());
    if (legacy && !legacy.user_id) {
      bumpSkip(stats, 'legacy_system_name_preserved');
      actions.push({
        kind: 'skip',
        reason: 'legacy_system_name_preserved',
        name: mapped.name,
        externalKey: key,
      });
      return;
    }

    actions.push({ kind: 'insert', row: mapped });
  });

  return { actions, stats };
}

async function applyActions(
  supabase: ReturnType<typeof createClient>,
  actions: ImportAction[],
  stats: ImportStats,
  dryRun: boolean
) {
  for (const action of actions) {
    if (action.kind === 'skip') continue;

    if (dryRun) {
      stats.imported++;
      if (action.kind === 'insert') stats.inserted++;
      else stats.updated++;
      continue;
    }

    try {
      if (action.kind === 'insert') {
        const { error } = await supabase.from('st_exercise_catalog').insert(action.row);
        if (error) throw error;
        stats.inserted++;
        stats.imported++;
      } else {
        const { id, row } = action;
        const { error } = await supabase
          .from('st_exercise_catalog')
          .update(row)
          .eq('id', id)
          .is('user_id', null)
          .eq('is_system', true);
        if (error) throw error;
        stats.updated++;
        stats.imported++;
      }
    } catch (e: any) {
      stats.errors++;
      const msg = `${action.row.name} (${action.row.external_source}/${action.row.external_id}): ${e?.message || e}`;
      stats.errorMessages.push(msg);
    }
  }
}

function printReport(stats: ImportStats, dryRun: boolean) {
  console.log('\n--- BuiltIQ Exercise Import Report ---');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`Total records found:     ${stats.totalFound}`);
  console.log(`Records imported:        ${stats.imported} (${stats.inserted} inserted, ${stats.updated} updated)`);
  console.log(`Records skipped:         ${stats.skipped}`);
  console.log(`Duplicates in file:      ${stats.duplicatesInFile}`);
  console.log(`Errors:                  ${stats.errors}`);
  if (Object.keys(stats.skipReasons).length) {
    console.log('Skip reasons:');
    Object.entries(stats.skipReasons).forEach(([k, v]) => console.log(`  - ${k}: ${v}`));
  }
  if (stats.errorMessages.length) {
    console.log('Errors:');
    stats.errorMessages.slice(0, 20).forEach((m) => console.log(`  - ${m}`));
    if (stats.errorMessages.length > 20) {
      console.log(`  ... and ${stats.errorMessages.length - 20} more`);
    }
  }
  console.log('--------------------------------------\n');
}

async function main() {
  loadEnvFiles();
  const { file, dryRun } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error('Error: --file <path> is required. Use --help for usage.');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!url || !serviceKey)) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for live import.');
    process.exit(1);
  }

  const records = loadRecords(file);
  const sourceSet = new Set(
    records.map((r) => String(r.external_source || '').trim().toLowerCase()).filter(Boolean)
  );
  if (sourceSet.size > 1) {
    console.warn(`Warning: multiple external_source values in file: ${[...sourceSet].join(', ')}`);
  }

  const supabase =
    url && serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;

  const existing = supabase
    ? await fetchExistingForRecords(supabase, records)
    : { byExternal: new Map(), legacyNames: new Map() };

  const { actions, stats } = planActions(records, existing);

  if (supabase) {
    await applyActions(supabase, actions, stats, dryRun);
  } else if (dryRun) {
    actions.forEach((a) => {
      if (a.kind === 'insert') {
        stats.imported++;
        stats.inserted++;
      } else if (a.kind === 'update') {
        stats.imported++;
        stats.updated++;
      }
    });
  }

  printReport(stats, dryRun);
  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err?.message || err);
  process.exit(1);
});
