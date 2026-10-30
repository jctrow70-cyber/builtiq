/**
 * BIQ-0279: Insert Iso-Lateral Decline Press (266).
 * Does not rewrite history, planned workouts, or archived/custom rows.
 * Does not modify Decline Press (3), Converging Chest Press (262), Machine Chest Press (140),
 * or Seated Chest Press (265).
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

const ROLLBACK = path.join(process.cwd(), 'docs/catalog-overhaul/iso-lateral-decline-press-rollback.json');
const REPORT = path.join(process.cwd(), 'docs/catalog-overhaul/iso-lateral-decline-press-apply-report.json');

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

async function main() {
  loadEnvLocal();
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    change: 'BIQ-0279',
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
  const existing = activeMasters.find((row) => String(row.external_id) === '266');
  const declinePress = activeMasters.find((row) => String(row.external_id) === '3');
  const machineChest = activeMasters.find((row) => String(row.external_id) === '140');
  const converging = activeMasters.find((row) => String(row.external_id) === '262');
  const seatedChest = activeMasters.find((row) => String(row.external_id) === '265');
  const duplicateName = activeMasters.find(
    (row) =>
      String(row.name || '').trim().toLowerCase() === 'iso-lateral decline press' && String(row.external_id) !== '266'
  );
  if (duplicateName) {
    fail(report, `Duplicate active name Iso-Lateral Decline Press already exists as external_id ${duplicateName.external_id}`);
  }

  fs.mkdirSync(path.dirname(ROLLBACK), { recursive: true });
  fs.writeFileSync(
    ROLLBACK,
    JSON.stringify(
      {
        generated_at: report.generated_at,
        existing: existing || null,
        decline_press_untouched: snapshot(declinePress),
        machine_chest_untouched: snapshot(machineChest),
        converging_untouched: snapshot(converging),
        seated_chest_untouched: snapshot(seatedChest),
      },
      null,
      2
    )
  );
  report.rollback_path = ROLLBACK;
  report.live_active_master_before = activeMasters.length;

  const record = loadMasterLibraryRecords().find((row) => row.id === '266');
  if (!record) fail(report, 'Local master 266 missing');
  const payload = masterRecordToCatalogRow(record!);
  if (payload.equipment !== 'Machine' || payload.movement_pattern !== 'push_horizontal') {
    fail(report, `Unexpected local mapping equipment=${payload.equipment} pattern=${payload.movement_pattern}`);
  }
  if (payload.media_url !== null || payload.image_url !== null || payload.gif_url !== null) {
    fail(report, 'Iso-Lateral Decline Press must ship with null media placeholders');
  }

  if (existing) {
    const { error } = await supabase
      .from('st_exercise_catalog')
      .update({
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
      })
      .eq('id', existing.id)
      .eq('external_source', MASTER_CATALOG_SOURCE)
      .eq('external_id', '266')
      .is('user_id', null);
    if (error) fail(report, error.message);
  } else {
    const { error } = await supabase.from('st_exercise_catalog').insert(payload);
    if (error) fail(report, error.message);
  }

  const after = await fetchAll(supabase);
  if (after.error) fail(report, after.error);
  const afterMasters = after.rows.filter(
    (row) => row.external_source === MASTER_CATALOG_SOURCE && !row.user_id && row.is_archived !== true
  );
  const inserted = afterMasters.find((row) => String(row.external_id) === '266');
  if (!inserted) fail(report, '266 missing after write');

  const afterDecline = afterMasters.find((row) => String(row.external_id) === '3');
  const afterMachine = afterMasters.find((row) => String(row.external_id) === '140');
  const afterConverging = afterMasters.find((row) => String(row.external_id) === '262');
  const afterSeated = afterMasters.find((row) => String(row.external_id) === '265');
  if (declinePress && afterDecline && JSON.stringify(snapshot(afterDecline)) !== JSON.stringify(snapshot(declinePress))) {
    fail(report, 'Decline Press (3) changed during the Iso-Lateral Decline Press insert');
  }
  if (machineChest && afterMachine && JSON.stringify(snapshot(afterMachine)) !== JSON.stringify(snapshot(machineChest))) {
    fail(report, 'Machine Chest Press (140) changed during the Iso-Lateral Decline Press insert');
  }
  if (converging && afterConverging && JSON.stringify(snapshot(afterConverging)) !== JSON.stringify(snapshot(converging))) {
    fail(report, 'Converging Chest Press (262) changed during the Iso-Lateral Decline Press insert');
  }
  if (seatedChest && afterSeated && JSON.stringify(snapshot(afterSeated)) !== JSON.stringify(snapshot(seatedChest))) {
    fail(report, 'Seated Chest Press (265) changed during the Iso-Lateral Decline Press insert');
  }

  const pickerPool = workoutSearchCatalogItems(afterMasters);
  const searchHits = searchCatalog(pickerPool, { query: 'iso-lateral decline press', section: 'strength', limit: 5 });
  const adapted = catalogExerciseFromRow(inserted);
  const candidates = selectAiGenerationCatalogRows(afterMasters);

  report.status = 'applied';
  report.live_active_master_after = afterMasters.length;
  report.expected_local_count = expectedMasterCatalogCount();
  report.ai_candidates = candidates.length;
  report.search_top = searchHits.map((row) => ({ name: row.name, external_id: row.external_id }));
  report.iso_lateral_decline_press = {
    id: inserted.id,
    name: inserted.name,
    external_id: inserted.external_id,
    exercise_type: inserted.exercise_type,
    equipment: inserted.equipment,
    compatible_equipment: compatibleEquipmentOptions(inserted),
    movement_pattern: inserted.movement_pattern,
    coaching_movement_pattern: inserted.coaching_metadata?.movement_pattern,
    primary_muscles: inserted.coaching_metadata?.primary_muscles,
    secondary_muscles: inserted.coaching_metadata?.secondary_muscles,
    hypertrophy_volume_credits: inserted.coaching_metadata?.hypertrophy_volume_credits,
    media_url: inserted.media_url ?? null,
    image_url: inserted.image_url ?? null,
    gif_url: inserted.gif_url ?? null,
    generation_eligible: isAiGenerationEligibleRow(inserted),
    ai_movement: adapted?.movementPattern,
    ai_equipment: adapted?.equipment,
    ai_muscles: adapted?.primaryMuscles,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        status: 'applied',
        active_masters: afterMasters.length,
        ai_candidates: candidates.length,
        iso_lateral_decline_press: report.iso_lateral_decline_press,
        search_top: report.search_top,
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
