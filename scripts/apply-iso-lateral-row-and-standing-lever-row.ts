/**
 * BIQ-0297: Rename master 261 Diverging Row → Iso-Lateral Row, and insert Standing Lever Row (267).
 * Idempotent. Does not rewrite history, planned workouts, or archived/custom rows.
 * Does not modify T-Bar Row (17), Landmine Row (16), Chest-Supported Row (15), or Machine Row (142).
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  MASTER_CATALOG_SOURCE,
  expectedMasterCatalogCount,
  loadMasterLibraryRecords,
  masterRecordToCatalogRow,
} from '../lib/training/masterCatalog';
import { isAiGenerationEligibleRow, selectAiGenerationCatalogRows } from '../lib/scienceEngine/generation/catalogEligibility';
import { compatibleEquipmentOptions } from '../lib/training/exerciseEquipment';
import { catalogExerciseFromRow } from '../lib/scienceEngine/catalogAdapter';
import { searchCatalog, workoutSearchCatalogItems } from '../lib/training/catalogSearch';

const ROLLBACK = path.join(process.cwd(), 'docs/catalog-overhaul/iso-lateral-row-standing-lever-row-rollback.json');
const REPORT = path.join(process.cwd(), 'docs/catalog-overhaul/iso-lateral-row-standing-lever-row-apply-report.json');

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

function fail(report: Record<string, unknown>, message: string) {
  report.status = 'aborted';
  report.error = message;
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  process.exit(2);
}

function snapshot(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    external_id: row.external_id,
    equipment: row.equipment,
    movement_pattern: row.movement_pattern,
    instructions: row.instructions,
    media_url: row.media_url ?? null,
    image_url: row.image_url ?? null,
    gif_url: row.gif_url ?? null,
    coaching_metadata: row.coaching_metadata || null,
    is_archived: row.is_archived,
  };
}

function catalogUpdateFields(payload: ReturnType<typeof masterRecordToCatalogRow>) {
  return {
    name: payload.name,
    category: payload.category,
    muscle_group: payload.muscle_group,
    equipment: payload.equipment,
    movement_pattern: payload.movement_pattern,
    exercise_type: payload.exercise_type,
    instructions: payload.instructions,
    training_goal: payload.training_goal,
    progression_type: payload.progression_type,
    primary_muscle_percentage: payload.primary_muscle_percentage,
    secondary_muscle_percentage: payload.secondary_muscle_percentage,
    muscle_targets: payload.muscle_targets,
    coaching_metadata: payload.coaching_metadata,
    media_url: null,
    image_url: null,
    gif_url: null,
    is_archived: false,
  };
}

async function upsertMaster(
  supabase: any,
  externalId: string,
  payload: ReturnType<typeof masterRecordToCatalogRow>,
  existing: any | undefined
) {
  if (existing) {
    const { error } = await supabase
      .from('st_exercise_catalog')
      .update(catalogUpdateFields(payload))
      .eq('id', existing.id)
      .eq('external_source', MASTER_CATALOG_SOURCE)
      .eq('external_id', externalId)
      .is('user_id', null);
    return error?.message || null;
  }
  const { error } = await supabase.from('st_exercise_catalog').insert(payload);
  return error?.message || null;
}

async function main() {
  loadEnvLocal();
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    change: 'BIQ-0297',
    status: 'started',
    schema_migration: false,
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail(report, 'Supabase URL or SUPABASE_SERVICE_ROLE_KEY is not set.');

  const supabase = createClient(url!, key!, { auth: { persistSession: false } });
  const live = await fetchAll(supabase);
  if (live.error) fail(report, live.error);

  const masters = live.rows.filter((row) => row.external_source === MASTER_CATALOG_SOURCE && !row.user_id);
  const activeMasters = masters.filter((row) => row.is_archived !== true);
  const existing261 = activeMasters.find((row) => String(row.external_id) === '261');
  const existing267 = activeMasters.find((row) => String(row.external_id) === '267');
  const tBar = activeMasters.find((row) => String(row.external_id) === '17');
  const landmine = activeMasters.find((row) => String(row.external_id) === '16');
  const chestSupported = activeMasters.find((row) => String(row.external_id) === '15');
  const machineRow = activeMasters.find((row) => String(row.external_id) === '142');

  const duplicateIso = activeMasters.find(
    (row) => String(row.name || '').trim().toLowerCase() === 'iso-lateral row' && String(row.external_id) !== '261'
  );
  if (duplicateIso) fail(report, `Duplicate active name Iso-Lateral Row already exists as external_id ${duplicateIso.external_id}`);

  const duplicateLever = activeMasters.find(
    (row) => String(row.name || '').trim().toLowerCase() === 'standing lever row' && String(row.external_id) !== '267'
  );
  if (duplicateLever) {
    fail(report, `Duplicate active name Standing Lever Row already exists as external_id ${duplicateLever.external_id}`);
  }

  if (!existing261) fail(report, 'Active master 261 not found; refusing to insert a second Iso-Lateral / Diverging Row card');

  fs.mkdirSync(path.dirname(ROLLBACK), { recursive: true });
  fs.writeFileSync(
    ROLLBACK,
    JSON.stringify(
      {
        generated_at: report.generated_at,
        master_261_before: snapshot(existing261),
        master_267_before: snapshot(existing267),
        t_bar_untouched: snapshot(tBar),
        landmine_untouched: snapshot(landmine),
        chest_supported_untouched: snapshot(chestSupported),
        machine_row_untouched: snapshot(machineRow),
      },
      null,
      2
    )
  );
  report.rollback_path = ROLLBACK;
  report.live_active_master_before = activeMasters.length;

  const record261 = loadMasterLibraryRecords().find((row) => row.id === '261');
  const record267 = loadMasterLibraryRecords().find((row) => row.id === '267');
  if (!record261) fail(report, 'Local master 261 missing');
  if (!record267) fail(report, 'Local master 267 missing');
  if (record261!.name !== 'Iso-Lateral Row') fail(report, `Local 261 name should be Iso-Lateral Row, got ${record261!.name}`);

  const payload261 = masterRecordToCatalogRow(record261!);
  const payload267 = masterRecordToCatalogRow(record267!);
  if (payload261.equipment !== 'Machine' || payload261.movement_pattern !== 'pull_horizontal') {
    fail(report, `Unexpected 261 mapping equipment=${payload261.equipment} pattern=${payload261.movement_pattern}`);
  }
  if (payload267.equipment !== 'Machine' || payload267.movement_pattern !== 'pull_horizontal') {
    fail(report, `Unexpected 267 mapping equipment=${payload267.equipment} pattern=${payload267.movement_pattern}`);
  }
  if (payload267.media_url !== null || payload267.image_url !== null || payload267.gif_url !== null) {
    fail(report, 'Standing Lever Row must ship with null media placeholders');
  }

  const err261 = await upsertMaster(supabase, '261', payload261, existing261);
  if (err261) fail(report, `261 update failed: ${err261}`);
  const err267 = await upsertMaster(supabase, '267', payload267, existing267);
  if (err267) fail(report, `267 upsert failed: ${err267}`);

  const after = await fetchAll(supabase);
  if (after.error) fail(report, after.error);
  const afterMasters = after.rows.filter(
    (row) => row.external_source === MASTER_CATALOG_SOURCE && !row.user_id && row.is_archived !== true
  );
  const after261 = afterMasters.find((row) => String(row.external_id) === '261');
  const after267 = afterMasters.find((row) => String(row.external_id) === '267');
  if (!after261) fail(report, '261 missing after write');
  if (!after267) fail(report, '267 missing after write');
  if (after261.name !== 'Iso-Lateral Row') fail(report, `261 name after write is ${after261.name}`);
  if (after267.name !== 'Standing Lever Row') fail(report, `267 name after write is ${after267.name}`);

  const afterTBar = afterMasters.find((row) => String(row.external_id) === '17');
  const afterLandmine = afterMasters.find((row) => String(row.external_id) === '16');
  const afterChest = afterMasters.find((row) => String(row.external_id) === '15');
  const afterMachine = afterMasters.find((row) => String(row.external_id) === '142');
  if (tBar && afterTBar && JSON.stringify(snapshot(afterTBar)) !== JSON.stringify(snapshot(tBar))) {
    fail(report, 'T-Bar Row (17) changed during apply');
  }
  if (landmine && afterLandmine && JSON.stringify(snapshot(afterLandmine)) !== JSON.stringify(snapshot(landmine))) {
    fail(report, 'Landmine Row (16) changed during apply');
  }
  if (chestSupported && afterChest && JSON.stringify(snapshot(afterChest)) !== JSON.stringify(snapshot(chestSupported))) {
    fail(report, 'Chest-Supported Row (15) changed during apply');
  }
  if (machineRow && afterMachine && JSON.stringify(snapshot(afterMachine)) !== JSON.stringify(snapshot(machineRow))) {
    fail(report, 'Machine Row (142) changed during apply');
  }

  const duplicateIsoAfter = afterMasters.filter((row) => String(row.name || '').trim().toLowerCase() === 'iso-lateral row');
  if (duplicateIsoAfter.length !== 1) fail(report, `Expected one Iso-Lateral Row, found ${duplicateIsoAfter.length}`);
  const duplicateLeverAfter = afterMasters.filter((row) => String(row.name || '').trim().toLowerCase() === 'standing lever row');
  if (duplicateLeverAfter.length !== 1) fail(report, `Expected one Standing Lever Row, found ${duplicateLeverAfter.length}`);

  const pickerPool = workoutSearchCatalogItems(afterMasters);
  const isoSearch = searchCatalog(pickerPool, { query: 'iso-lateral row', section: 'strength', limit: 5 });
  const leverSearch = searchCatalog(pickerPool, { query: 'standing lever row', section: 'strength', limit: 5 });
  const candidates = selectAiGenerationCatalogRows(afterMasters);

  report.status = 'applied';
  report.live_active_master_after = afterMasters.length;
  report.expected_local_count = expectedMasterCatalogCount();
  report.ai_candidates = candidates.length;
  report.iso_lateral_row = {
    id: after261.id,
    name: after261.name,
    external_id: after261.external_id,
    equipment: after261.equipment,
    compatible_equipment: compatibleEquipmentOptions(after261),
    aliases: after261.coaching_metadata?.aliases || [],
    generation_eligible: isAiGenerationEligibleRow(after261),
    search_top: isoSearch.map((row) => ({ name: row.name, external_id: row.external_id })),
    ai: catalogExerciseFromRow(after261),
  };
  report.standing_lever_row = {
    id: after267.id,
    name: after267.name,
    external_id: after267.external_id,
    equipment: after267.equipment,
    compatible_equipment: compatibleEquipmentOptions(after267),
    media_url: after267.media_url ?? null,
    image_url: after267.image_url ?? null,
    gif_url: after267.gif_url ?? null,
    generation_eligible: isAiGenerationEligibleRow(after267),
    search_top: leverSearch.map((row) => ({ name: row.name, external_id: row.external_id })),
    ai: catalogExerciseFromRow(after267),
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        status: 'applied',
        active_masters: afterMasters.length,
        ai_candidates: candidates.length,
        iso_lateral_row: report.iso_lateral_row,
        standing_lever_row: report.standing_lever_row,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  fs.writeFileSync(REPORT, JSON.stringify({ status: 'aborted', error: String(error?.message || error) }, null, 2));
  process.exit(1);
});
