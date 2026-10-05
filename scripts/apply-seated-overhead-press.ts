/**
 * BIQ-0237: Insert Seated Overhead Press (263) with Overhead Press (29) equipment.
 * Does not rewrite history, planned workouts, or archived/custom rows.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { MASTER_CATALOG_SOURCE, expectedMasterCatalogCount, loadMasterLibraryRecords, masterRecordToCatalogRow } from '../lib/training/masterCatalog';
import { NEW_MASTER_CLASSIFICATIONS } from '../lib/training/masterCatalogEnrichment';
import { buildCatalogPatch } from '../lib/scienceEngine/catalogEnrichment/storage';
import { isAiGenerationEligibleRow, selectAiGenerationCatalogRows } from '../lib/scienceEngine/generation/catalogEligibility';
import { compatibleEquipmentOptions } from '../lib/training/exerciseEquipment';

const ROLLBACK = path.join(process.cwd(), 'docs/catalog-overhaul/seated-ohp-rollback.json');
const REPORT = path.join(process.cwd(), 'docs/catalog-overhaul/seated-ohp-apply-report.json');

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

function cloneMeta(raw: any) {
  return raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : {};
}

function normalizeEq(values: unknown[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((value) => {
    const item = String(value || '').trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
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

async function main() {
  loadEnvLocal();
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    change: 'BIQ-0237',
    status: 'started',
    schema_migration: false,
    phase_2b: 'not_started',
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    report.status = 'aborted';
    report.error = 'Supabase URL or SUPABASE_SERVICE_ROLE_KEY is not set.';
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const live = await fetchAll(supabase);
  if (live.error) {
    report.status = 'aborted';
    report.error = live.error;
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const masters = live.rows.filter((row) => row.external_source === MASTER_CATALOG_SOURCE && !row.user_id);
  const activeMasters = masters.filter((row) => row.is_archived !== true);
  const ohp = activeMasters.find((row) => String(row.external_id) === '29');
  const existing = activeMasters.find((row) => String(row.external_id) === '263');
  if (!ohp) {
    report.status = 'aborted';
    report.error = 'Active Overhead Press (29) not found.';
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  fs.mkdirSync(path.dirname(ROLLBACK), { recursive: true });
  fs.writeFileSync(
    ROLLBACK,
    JSON.stringify({ generated_at: report.generated_at, overhead_press: ohp, seated_existing: existing || null }, null, 2)
  );
  report.rollback_path = ROLLBACK;
  report.live_active_master_before = activeMasters.length;

  const ohpEq = normalizeEq([
    ...compatibleEquipmentOptions(ohp),
    'Dumbbell',
    'Barbell',
    'Machine',
    'Kettlebell',
    'Smith Machine',
  ]);

  const record = loadMasterLibraryRecords().find((row) => row.id === '263');
  if (!record) {
    report.status = 'aborted';
    report.error = 'Local master 263 missing';
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }
  const mapped = masterRecordToCatalogRow(record);
  const built = buildCatalogPatch({
    name: record.name,
    category: record.category,
    proposed: NEW_MASTER_CLASSIFICATIONS['263'],
    existingMetadata: mapped.coaching_metadata,
    existingMovementPattern: mapped.movement_pattern,
  });
  if (built.errors.length) {
    report.status = 'aborted';
    report.error = built.errors.join('; ');
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const meta = cloneMeta(built.patch.coaching_metadata);
  meta.compatible_equipment = ohpEq;
  meta.default_equipment = ohp.coaching_metadata?.default_equipment || ohp.equipment || 'Dumbbell';
  meta.aliases = ['Seated Shoulder Press', 'Seated Military Press', 'Seated Dumbbell Overhead Press', 'Seated Barbell Overhead Press'];

  const payload = {
    ...mapped,
    equipment: meta.default_equipment,
    movement_pattern: built.patch.movement_pattern,
    progression_type: built.patch.progression_type,
    coaching_metadata: meta,
  };

  if (existing) {
    const { error } = await supabase
      .from('st_exercise_catalog')
      .update({
        name: payload.name,
        equipment: payload.equipment,
        movement_pattern: payload.movement_pattern,
        progression_type: payload.progression_type,
        coaching_metadata: payload.coaching_metadata,
        instructions: payload.instructions,
        is_archived: false,
      })
      .eq('id', existing.id)
      .eq('external_source', MASTER_CATALOG_SOURCE)
      .eq('external_id', '263');
    if (error) {
      report.status = 'aborted';
      report.error = error.message;
      fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
      process.exit(2);
    }
  } else {
    const { error } = await supabase.from('st_exercise_catalog').insert(payload);
    if (error) {
      report.status = 'aborted';
      report.error = error.message;
      fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
      process.exit(2);
    }
  }

  const after = await fetchAll(supabase);
  if (after.error) {
    report.status = 'aborted';
    report.error = after.error;
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }
  const afterMasters = after.rows.filter((row) => row.external_source === MASTER_CATALOG_SOURCE && !row.user_id && row.is_archived !== true);
  const seated = afterMasters.find((row) => String(row.external_id) === '263');
  const afterOhp = afterMasters.find((row) => String(row.external_id) === '29');
  if (!seated) {
    report.status = 'aborted';
    report.error = '263 missing after write';
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const archivedModified = after.rows.filter((row) => row.is_archived === true && String(row.external_id) === '263').length;
  const customModified = after.rows.filter((row) => row.user_id && String(row.external_id) === '263').length;
  const candidates = selectAiGenerationCatalogRows(afterMasters);

  report.status = 'applied';
  report.live_active_master_after = afterMasters.length;
  report.expected_local_count = expectedMasterCatalogCount();
  report.ai_candidates = candidates.length;
  report.seated_overhead_press = {
    id: seated.id,
    name: seated.name,
    external_id: seated.external_id,
    exercise_type: seated.exercise_type,
    equipment: seated.equipment,
    compatible_equipment: compatibleEquipmentOptions(seated),
    aliases: seated.coaching_metadata?.aliases || [],
    movement_pattern: seated.coaching_metadata?.movement_pattern,
    hypertrophy_volume_credits: seated.coaching_metadata?.hypertrophy_volume_credits,
    generation_eligible: isAiGenerationEligibleRow(seated),
  };
  report.overhead_press_equipment = compatibleEquipmentOptions(afterOhp);
  report.archived_modified = archivedModified;
  report.custom_modified = customModified;
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    status: 'applied',
    active_masters: afterMasters.length,
    ai_candidates: candidates.length,
    seated: report.seated_overhead_press,
    ohp_equipment: report.overhead_press_equipment,
  }, null, 2));
}

main().catch((error) => {
  fs.writeFileSync(REPORT, JSON.stringify({ status: 'aborted', error: String(error?.message || error) }, null, 2));
  process.exit(1);
});
