/**
 * Insert only master IDs 255–260. Does not update existing master rows.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { MASTER_CATALOG_SOURCE, loadMasterLibraryRecords, masterRecordToCatalogRow } from '../lib/training/masterCatalog';

const MISSING_IDS = ['255', '256', '257', '258', '259', '260'];
const OUT = path.join(process.cwd(), 'docs/catalog-overhaul/missing-olympic-insert-report.json');

function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function norm(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function fetchAll(supabase: any) {
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('st_exercise_catalog').select('*').order('name').range(from, from + 999);
    if (error) throw new Error(error.message);
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
    from += 1000;
  }
  return rows;
}

function fail(report: Record<string, unknown>, message: string): never {
  report.status = 'aborted';
  report.error = message;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ status: 'aborted', error: message }, null, 2));
  process.exit(2);
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase URL or SUPABASE_SERVICE_ROLE_KEY is not set.');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    status: 'started',
    supabase_host: new URL(url).host,
  };

  const records = loadMasterLibraryRecords().filter((row) => MISSING_IDS.includes(String(row.id)));
  if (records.length !== 6) fail(report, `Expected 6 local master records, found ${records.length}`);
  const payloads = records.map(masterRecordToCatalogRow);

  const before = await fetchAll(supabase);
  const archivedBefore = before.filter((row) => row.is_archived === true).map((row) => ({ id: row.id, name: row.name }));
  const userBefore = before.filter((row) => row.user_id || row.is_system === false).map((row) => ({ id: row.id, name: row.name }));
  const activeMasterBefore = before.filter(
    (row) => row.is_archived !== true && row.external_source === MASTER_CATALOG_SOURCE && !row.user_id
  );
  report.before = {
    total: before.length,
    archived: archivedBefore.length,
    user_or_custom: userBefore.length,
    active_master: activeMasterBefore.length,
  };

  const conflicts: string[] = [];
  payloads.forEach((payload) => {
    const names = new Set([norm(payload.name), ...((payload.coaching_metadata?.aliases as string[]) || []).map(norm)]);
    before.forEach((row) => {
      const sameId = row.external_source === MASTER_CATALOG_SOURCE && String(row.external_id) === payload.external_id;
      const sameName = names.has(norm(row.name));
      if (sameId) conflicts.push(`${payload.name}: external_id ${payload.external_id} already exists as ${row.name} (${row.id}, archived=${row.is_archived})`);
      if (sameName && row.is_archived !== true) {
        conflicts.push(
          `${payload.name}: active name/alias collision with ${row.name} (${row.id}, source=${row.external_source || 'none'}, external_id=${row.external_id || 'none'})`
        );
      }
    });
  });
  if (conflicts.length) fail(report, `Pre-insert conflicts: ${conflicts.join('; ')}`);

  const { error } = await supabase.from('st_exercise_catalog').insert(payloads);
  if (error) fail(report, `Insert failed: ${error.message}`);

  const after = await fetchAll(supabase);
  const activeMaster = after.filter(
    (row) => row.is_archived !== true && row.external_source === MASTER_CATALOG_SOURCE && !row.user_id
  );
  const masterIds = new Set(activeMaster.map((row) => String(row.external_id)));
  const missingIds = Array.from({ length: 260 }, (_, i) => String(i + 1)).filter((id) => !masterIds.has(id));
  const nameCounts = new Map<string, number>();
  activeMaster.forEach((row) => nameCounts.set(norm(row.name), (nameCounts.get(norm(row.name)) || 0) + 1));
  const duplicateNames = [...nameCounts.entries()].filter(([, n]) => n > 1).map(([name]) => name);

  const archivedChanged = archivedBefore.filter((row) => {
    const now = after.find((r) => r.id === row.id);
    return !now || now.is_archived !== true;
  });
  const userChanged = userBefore.filter((row) => {
    const now = after.find((r) => r.id === row.id);
    return !now || now.name !== row.name || now.is_archived === true;
  });
  const existing254Touched = activeMasterBefore.filter((row) => {
    const now = after.find((r) => r.id === row.id);
    return !now || JSON.stringify(now.coaching_metadata) !== JSON.stringify(row.coaching_metadata) || now.movement_pattern !== row.movement_pattern;
  });

  const inserted = payloads.map((payload) => {
    const live = after.find((row) => row.external_source === MASTER_CATALOG_SOURCE && String(row.external_id) === payload.external_id);
    return { external_id: payload.external_id, name: payload.name, id: live?.id || null };
  });

  const errors: string[] = [];
  if (activeMaster.length !== 260) errors.push(`active master count ${activeMaster.length}, expected 260`);
  if (missingIds.length) errors.push(`missing master IDs: ${missingIds.join(', ')}`);
  if (duplicateNames.length) errors.push(`duplicate active master names: ${duplicateNames.join(', ')}`);
  if (archivedChanged.length) errors.push(`archived rows changed: ${archivedChanged.map((r) => r.name).join(', ')}`);
  if (userChanged.length) errors.push(`user/custom rows changed: ${userChanged.map((r) => r.name).join(', ')}`);
  if (existing254Touched.length) errors.push(`existing 254 rows were modified: ${existing254Touched.map((r) => r.name).join(', ')}`);
  if (inserted.some((row) => !row.id)) errors.push('one or more inserted IDs missing on re-read');

  report.inserted = inserted;
  report.after = {
    total: after.length,
    archived: after.filter((row) => row.is_archived === true).length,
    active_master: activeMaster.length,
    missing_ids: missingIds,
    duplicate_active_master_names: duplicateNames,
  };
  if (errors.length) fail(report, errors.join('; '));
  report.status = 'inserted';
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
