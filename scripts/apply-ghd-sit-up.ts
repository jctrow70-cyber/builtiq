/**
 * BIQ-0246: Insert GHD Sit-Up (264).
 * Does not rewrite history, planned workouts, or archived/custom rows.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { MASTER_CATALOG_SOURCE, expectedMasterCatalogCount, loadMasterLibraryRecords, masterRecordToCatalogRow } from '../lib/training/masterCatalog';
import { isAiGenerationEligibleRow, selectAiGenerationCatalogRows } from '../lib/scienceEngine/generation/catalogEligibility';
import { compatibleEquipmentOptions } from '../lib/training/exerciseEquipment';
import { catalogExerciseFromRow } from '../lib/scienceEngine/catalogAdapter';

const ROLLBACK = path.join(process.cwd(), 'docs/catalog-overhaul/ghd-sit-up-rollback.json');
const REPORT = path.join(process.cwd(), 'docs/catalog-overhaul/ghd-sit-up-apply-report.json');

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

async function main() {
  loadEnvLocal();
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    change: 'BIQ-0246',
    status: 'started',
    schema_migration: false,
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail(report, 'Supabase URL or SUPABASE_SERVICE_ROLE_KEY is not set.');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const live = await fetchAll(supabase);
  if (live.error) fail(report, live.error);

  const masters = live.rows.filter((row) => row.external_source === MASTER_CATALOG_SOURCE && !row.user_id);
  const activeMasters = masters.filter((row) => row.is_archived !== true);
  const existing = activeMasters.find((row) => String(row.external_id) === '264');
  const sitUp = activeMasters.find((row) => String(row.external_id) === '215');

  fs.mkdirSync(path.dirname(ROLLBACK), { recursive: true });
  fs.writeFileSync(
    ROLLBACK,
    JSON.stringify({ generated_at: report.generated_at, existing: existing || null, sit_up_untouched: sitUp?.id || null }, null, 2)
  );
  report.rollback_path = ROLLBACK;
  report.live_active_master_before = activeMasters.length;

  const record = loadMasterLibraryRecords().find((row) => row.id === '264');
  if (!record) fail(report, 'Local master 264 missing');
  const payload = masterRecordToCatalogRow(record!);
  if (payload.equipment !== 'GHD' || payload.movement_pattern !== 'isolation') {
    fail(report, `Unexpected local mapping equipment=${payload.equipment} pattern=${payload.movement_pattern}`);
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
        is_archived: false,
      })
      .eq('id', existing.id)
      .eq('external_source', MASTER_CATALOG_SOURCE)
      .eq('external_id', '264')
      .is('user_id', null);
    if (error) fail(report, error.message);
  } else {
    const { error } = await supabase.from('st_exercise_catalog').insert(payload);
    if (error) fail(report, error.message);
  }

  const after = await fetchAll(supabase);
  if (after.error) fail(report, after.error);
  const afterMasters = after.rows.filter((row) => row.external_source === MASTER_CATALOG_SOURCE && !row.user_id && row.is_archived !== true);
  const ghd = afterMasters.find((row) => String(row.external_id) === '264');
  if (!ghd) fail(report, '264 missing after write');
  const afterSitUp = afterMasters.find((row) => String(row.external_id) === '215');
  if (sitUp && afterSitUp && JSON.stringify(afterSitUp) !== JSON.stringify(sitUp)) {
    fail(report, 'Sit-Up (215) changed during the GHD insert');
  }

  const adapted = catalogExerciseFromRow(ghd);
  const candidates = selectAiGenerationCatalogRows(afterMasters);
  report.status = 'applied';
  report.live_active_master_after = afterMasters.length;
  report.expected_local_count = expectedMasterCatalogCount();
  report.ai_candidates = candidates.length;
  report.ghd_sit_up = {
    id: ghd.id,
    name: ghd.name,
    external_id: ghd.external_id,
    exercise_type: ghd.exercise_type,
    equipment: ghd.equipment,
    compatible_equipment: compatibleEquipmentOptions(ghd),
    movement_pattern: ghd.movement_pattern,
    coaching_movement_pattern: ghd.coaching_metadata?.movement_pattern,
    primary_muscles: ghd.coaching_metadata?.primary_muscles,
    secondary_muscles: ghd.coaching_metadata?.secondary_muscles,
    hypertrophy_volume_credits: ghd.coaching_metadata?.hypertrophy_volume_credits,
    generation_eligible: isAiGenerationEligibleRow(ghd),
    ai_movement: adapted?.movementPattern,
    ai_equipment: adapted?.equipment,
    ai_muscles: adapted?.primaryMuscles,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    status: 'applied',
    active_masters: afterMasters.length,
    ai_candidates: candidates.length,
    ghd: report.ghd_sit_up,
  }, null, 2));
}

main().catch((error) => {
  fs.writeFileSync(REPORT, JSON.stringify({ status: 'aborted', error: String(error?.message || error) }, null, 2));
  process.exit(1);
});
