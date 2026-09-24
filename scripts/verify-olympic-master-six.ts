/**
 * Verify master IDs 255–260 and the 260-row active catalog. No writes.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { MASTER_CATALOG_SOURCE, loadMasterLibraryRecords, masterRecordToCatalogRow } from '../lib/training/masterCatalog';
import { ENRICHMENT_VERSION } from '../lib/scienceEngine/catalogEnrichment/storage';

const TARGET_IDS = ['255', '256', '257', '258', '259', '260'];
const OUT = path.join(process.cwd(), 'docs/catalog-overhaul/missing-olympic-verify-report.json');

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

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase URL or SUPABASE_SERVICE_ROLE_KEY is not set.');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const records = loadMasterLibraryRecords();
  const expected = new Map(records.map((row) => [String(row.id), masterRecordToCatalogRow(row)]));
  const rows = await fetchAll(supabase);
  const activeMaster = rows.filter(
    (row) => row.is_archived !== true && row.external_source === MASTER_CATALOG_SOURCE && !row.user_id
  );
  const masterIds = new Set(activeMaster.map((row) => String(row.external_id)));
  const missingIds = Array.from({ length: 260 }, (_, i) => String(i + 1)).filter((id) => !masterIds.has(id));
  const extraIds = [...masterIds].filter((id) => Number(id) < 1 || Number(id) > 260);
  const nameCounts = new Map<string, string[]>();
  activeMaster.forEach((row) => {
    const key = norm(row.name);
    nameCounts.set(key, [...(nameCounts.get(key) || []), `${row.name}:${row.external_id}`]);
  });
  const duplicateNames = [...nameCounts.entries()].filter(([, list]) => list.length > 1);

  const six = TARGET_IDS.map((id) => {
    const live = activeMaster.find((row) => String(row.external_id) === id);
    const source = expected.get(id);
    const archivedSameName = rows.filter(
      (row) => row.is_archived === true && norm(row.name) === norm(source?.name || '')
    );
    const otherActiveSameName = rows.filter(
      (row) =>
        row.is_archived !== true &&
        norm(row.name) === norm(source?.name || '') &&
        !(row.external_source === MASTER_CATALOG_SOURCE && String(row.external_id) === id)
    );
    return {
      external_id: id,
      expected_name: source?.name || null,
      live_id: live?.id || null,
      live_name: live?.name || null,
      live_source: live?.external_source || null,
      live_archived: live?.is_archived ?? null,
      matches_name: Boolean(live && source && live.name === source.name),
      matches_pattern: Boolean(live && source && live.movement_pattern === source.movement_pattern),
      matches_equipment: Boolean(live && source && live.equipment === source.equipment),
      enrichment_version: live?.coaching_metadata?.enrichment_version || null,
      archived_same_name: archivedSameName.map((row) => ({ id: row.id, source: row.external_source, external_id: row.external_id })),
      other_active_same_name: otherActiveSameName.map((row) => ({
        id: row.id,
        name: row.name,
        source: row.external_source,
        external_id: row.external_id,
      })),
    };
  });

  const enriched = activeMaster.filter((row) => row.coaching_metadata?.enrichment_version === ENRICHMENT_VERSION);
  const archived = rows.filter((row) => row.is_archived === true);
  const userRows = rows.filter((row) => row.user_id || row.is_system === false);
  const activeNonMasterSystem = rows.filter(
    (row) => row.is_archived !== true && !row.user_id && row.external_source !== MASTER_CATALOG_SOURCE
  );

  const errors: string[] = [];
  if (activeMaster.length !== 260) errors.push(`active master ${activeMaster.length}, expected 260`);
  if (missingIds.length) errors.push(`missing IDs: ${missingIds.join(', ')}`);
  if (extraIds.length) errors.push(`unexpected master IDs: ${extraIds.join(', ')}`);
  if (duplicateNames.length) errors.push(`duplicate names: ${duplicateNames.map(([name]) => name).join(', ')}`);
  six.forEach((row) => {
    if (!row.live_id) errors.push(`missing live card ${row.external_id} ${row.expected_name}`);
    if (row.live_id && !row.matches_name) errors.push(`${row.external_id} name mismatch`);
    if (row.other_active_same_name.length) errors.push(`${row.expected_name} has other active same-name cards`);
  });

  const report = {
    generated_at: new Date().toISOString(),
    status: errors.length ? 'failed' : 'ok',
    supabase_host: new URL(url).host,
    totals: {
      all_rows: rows.length,
      archived: archived.length,
      user_or_custom: userRows.length,
      active_master: activeMaster.length,
      active_non_master_system: activeNonMasterSystem.length,
      enriched_biq0213: enriched.length,
    },
    missing_ids: missingIds,
    extra_ids: extraIds,
    duplicate_active_master_names: duplicateNames.map(([name, list]) => ({ name, list })),
    six,
    archived_same_name_count: six.reduce((n, row) => n + row.archived_same_name.length, 0),
    errors,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
