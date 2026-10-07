/**
 * Read-only live catalog environment check. Does not write.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { MASTER_CATALOG_SOURCE } from '../lib/training/masterCatalog';
import { searchCatalog } from '../lib/training/catalogSearch';
import { compatibleEquipmentOptions } from '../lib/training/exerciseEquipment';
import { workoutSearchCatalogItems } from '../lib/training/catalogSearch';
import { runCatalogCleanupChecks } from '../lib/training/catalogCleanupCheck';

const REPORT = path.join(process.cwd(), 'docs/catalog-overhaul/env-live-verify.json');

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

async function fetchAll(supabase: any) {
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('st_exercise_catalog').select('*').order('name').range(from, from + 999);
    if (error) return { rows, error: error.message };
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
    from += 1000;
  }
  return { rows, error: null as string | null };
}

function summarize(row: any) {
  if (!row) return null;
  const meta = row.coaching_metadata || {};
  return {
    id: row.id,
    name: row.name,
    external_id: row.external_id,
    exercise_type: row.exercise_type,
    category: row.category,
    progression_type: row.progression_type,
    measurement_type: meta.measurement_type || null,
    master_category: meta.master_category || null,
    exercise_kind: meta.exercise_kind || null,
    movement_pattern: meta.movement_pattern || row.movement_pattern,
    aliases: meta.aliases || [],
    compatible_equipment: compatibleEquipmentOptions(row),
    is_archived: row.is_archived,
    user_id: row.user_id,
    external_source: row.external_source,
  };
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const host = url ? new URL(url).host : null;
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    wrote_supabase: false,
    supabase_host: host,
  };
  if (!url || !key) {
    report.error = 'missing supabase env';
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const live = await fetchAll(supabase);
  if (live.error) {
    report.error = live.error;
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }
  const masters = live.rows.filter((row) => row.external_source === MASTER_CATALOG_SOURCE && !row.user_id);
  const active = masters.filter((row) => row.is_archived !== true);
  const byExternal = new Map(active.map((row) => [String(row.external_id), row]));
  const ids = ['13', '15', '142', '14', '216', '242', '261', '262', '263', '264', '63'];
  const requested: Record<string, unknown> = {};
  ids.forEach((id) => {
    requested[id] = summarize(byExternal.get(id));
  });
  const pickerPool = workoutSearchCatalogItems(active);
  const strengthRow = searchCatalog(pickerPool, { query: 'row', section: 'strength', limit: 10 });
  const reverse = byExternal.get('63');
  report.active_master_count = active.length;
  report.archived_master_count = masters.length - active.length;
  report.requested = requested;
  report.strength_row_top10 = strengthRow.map((row, i) => ({
    rank: i + 1,
    name: row.name,
    external_id: row.external_id,
    exercise_type: row.exercise_type,
    category: row.category,
    progression_type: row.progression_type,
    measurement_type: row.coaching_metadata?.measurement_type || null,
    aliases: row.coaching_metadata?.aliases || [],
  }));
  report.reverse_lunge_equipment = compatibleEquipmentOptions(reverse);
  report.reverse_lunge_aliases = reverse?.coaching_metadata?.aliases || [];
  report.has_261 = !!byExternal.get('261');
  report.has_262 = !!byExternal.get('262');
  report.has_263 = !!byExternal.get('263');
  report.has_264 = !!byExternal.get('264');
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  let cleanup = 'not_run';
  try {
    runCatalogCleanupChecks();
    cleanup = 'passed';
  } catch (error: any) {
    cleanup = String(error?.message || error);
  }
  report.catalog_cleanup_check = cleanup;
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    host,
    active: active.length,
    has_261: report.has_261,
    has_262: report.has_262,
    has_263: report.has_263,
    has_264: report.has_264,
    cleanup,
    top: report.strength_row_top10,
    reverse_eq: report.reverse_lunge_equipment,
  }, null, 2));
}

main().catch((error) => {
  fs.writeFileSync(REPORT, JSON.stringify({ error: String(error?.message || error) }, null, 2));
  process.exit(1);
});
