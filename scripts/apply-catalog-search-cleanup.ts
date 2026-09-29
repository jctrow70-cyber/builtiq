/**
 * BIQ-0235: Targeted live catalog repair + masters 261/262.
 * Does not rewrite history, planned workouts, or archived/custom rows.
 *
 * Run: npx tsx scripts/apply-catalog-search-cleanup.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { MASTER_CATALOG_SOURCE, expectedMasterCatalogCount, loadMasterLibraryRecords, masterRecordToCatalogRow } from '../lib/training/masterCatalog';
import { needsCardioInferenceRepair, repairedFirstClassFields } from '../lib/training/catalogTypeRepair';
import { NEW_MASTER_CLASSIFICATIONS } from '../lib/training/masterCatalogEnrichment';
import { buildCatalogPatch } from '../lib/scienceEngine/catalogEnrichment/storage';
import { isAiGenerationEligibleRow, selectAiGenerationCatalogRows } from '../lib/scienceEngine/generation/catalogEligibility';
import { searchCatalog } from '../lib/training/catalogSearch';
import { compatibleEquipmentOptions } from '../lib/training/exerciseEquipment';

const ROLLBACK = path.join(process.cwd(), 'docs/catalog-overhaul/catalog-search-cleanup-rollback.json');
const REPORT = path.join(process.cwd(), 'docs/catalog-overhaul/catalog-search-cleanup-apply-report.json');

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

function cloneMeta(raw: any) {
  return raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : {};
}

function fail(report: Record<string, unknown>, message: string): never {
  report.status = 'aborted';
  report.error = message;
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ status: 'aborted', error: message }, null, 2));
  process.exit(2);
}

async function main() {
  loadEnvLocal();
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    change: 'BIQ-0235',
    status: 'started',
    phase_2b: 'not_started',
    schema_migration: false,
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail(report, 'Supabase URL or SUPABASE_SERVICE_ROLE_KEY is not set.');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const live = await fetchAll(supabase);
  if (live.error || !live.rows.length) fail(report, `Catalog fetch failed: ${live.error || 'no rows'}`);

  const activeMaster = live.rows.filter(
    (row) => row.is_archived !== true && row.is_system !== false && !row.user_id && row.external_source === MASTER_CATALOG_SOURCE
  );
  const archived = live.rows.filter((row) => row.is_archived === true);
  const customs = live.rows.filter((row) => row.user_id || row.is_system === false);
  report.live_total = live.rows.length;
  report.live_active_master_before = activeMaster.length;
  report.live_archived = archived.length;
  report.live_customs = customs.length;
  report.supabase_host = new URL(url).host;

  const typeRepairs = activeMaster.filter(needsCardioInferenceRepair);
  const byExternal = new Map(activeMaster.map((row) => [String(row.external_id), row]));

  const metaTargets = ['12', '25', '63']
    .map((id) => byExternal.get(id))
    .filter(Boolean) as any[];

  const rollbackTargets = new Map<string, any>();
  typeRepairs.forEach((row) => rollbackTargets.set(String(row.id), row));
  metaTargets.forEach((row) => rollbackTargets.set(String(row.id), row));

  const rollback = {
    generated_at: new Date().toISOString(),
    change: 'BIQ-0235',
    supabase_host: new URL(url).host,
    rows: Array.from(rollbackTargets.values()),
  };
  fs.mkdirSync(path.dirname(ROLLBACK), { recursive: true });
  fs.writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2));
  report.rollback_path = ROLLBACK;
  report.rollback_rows = rollback.rows.length;
  report.type_repair_ids = typeRepairs.map((row) => ({
    external_id: row.external_id,
    name: row.name,
    before: { exercise_type: row.exercise_type, category: row.category, progression_type: row.progression_type },
    after: repairedFirstClassFields(row),
  }));

  if (typeRepairs.some((row) => String(row.external_id) === '242' || /ergometer/i.test(row.name))) {
    fail(report, 'Row Ergometer was selected for repair. Aborting.');
  }

  for (const row of typeRepairs) {
    const next = repairedFirstClassFields(row);
    const { error } = await supabase
      .from('st_exercise_catalog')
      .update({
        exercise_type: next.exercise_type,
        category: next.category,
        progression_type: next.progression_type,
      })
      .eq('id', row.id)
      .eq('is_archived', false)
      .eq('external_source', MASTER_CATALOG_SOURCE)
      .is('user_id', null);
    if (error) fail(report, `Type repair failed on ${row.name}: ${error.message}. Rollback at ${ROLLBACK}`);
  }

  const afterTypes = await fetchAll(supabase);
  if (afterTypes.error) fail(report, `Re-read after type repair failed: ${afterTypes.error}`);
  const afterTypeById = new Map(afterTypes.rows.map((row) => [String(row.id), row]));

  function current(id: string) {
    const liveRow = byExternal.get(id);
    return (liveRow && afterTypeById.get(String(liveRow.id))) || liveRow;
  }

  const genericRow = current('12');
  if (genericRow) {
    const meta = cloneMeta(genericRow.coaching_metadata);
    meta.aliases = (Array.isArray(meta.aliases) ? meta.aliases : []).filter((alias: string) => String(alias).toLowerCase() !== 'bent row');
    const { error } = await supabase
      .from('st_exercise_catalog')
      .update({ coaching_metadata: meta })
      .eq('id', genericRow.id)
      .eq('is_archived', false)
      .eq('external_source', MASTER_CATALOG_SOURCE);
    if (error) fail(report, `Row 12 alias repair failed: ${error.message}`);
  }

  const inverted = current('25');
  if (inverted) {
    const meta = cloneMeta(inverted.coaching_metadata);
    meta.default_equipment = 'Bodyweight';
    meta.compatible_equipment = ['Bodyweight', 'Suspension Trainer'];
    const { error } = await supabase
      .from('st_exercise_catalog')
      .update({
        equipment: 'Bodyweight',
        coaching_metadata: meta,
      })
      .eq('id', inverted.id)
      .eq('is_archived', false)
      .eq('external_source', MASTER_CATALOG_SOURCE);
    if (error) fail(report, `Inverted Row equipment repair failed: ${error.message}`);
  }

  const reverse = current('63');
  if (reverse) {
    const meta = cloneMeta(reverse.coaching_metadata);
    const aliases = new Set<string>([...(Array.isArray(meta.aliases) ? meta.aliases : []), 'Backward Lunge', 'Rear Lunge']);
    const compatible = new Set<string>([
      ...(Array.isArray(meta.compatible_equipment) ? meta.compatible_equipment : []),
      'Bodyweight',
      'Dumbbell',
      'Barbell',
      'Kettlebell',
      'Smith Machine',
    ]);
    meta.aliases = Array.from(aliases);
    meta.compatible_equipment = Array.from(compatible);
    const { error } = await supabase
      .from('st_exercise_catalog')
      .update({ coaching_metadata: meta })
      .eq('id', reverse.id)
      .eq('is_archived', false)
      .eq('external_source', MASTER_CATALOG_SOURCE);
    if (error) fail(report, `Reverse Lunge repair failed: ${error.message}`);
  }

  const records = loadMasterLibraryRecords();
  const inserts: any[] = [];
  for (const id of ['261', '262']) {
    if (byExternal.get(id) || afterTypeById.has(String(byExternal.get(id)?.id || ''))) continue;
    const record = records.find((row) => row.id === id);
    if (!record) fail(report, `Local master ${id} missing`);
    const mapped = masterRecordToCatalogRow(record);
    const built = buildCatalogPatch({
      name: record.name,
      category: record.category,
      proposed: NEW_MASTER_CLASSIFICATIONS[id],
      existingMetadata: mapped.coaching_metadata,
      existingMovementPattern: mapped.movement_pattern,
    });
    if (built.errors.length) fail(report, built.errors.join('; '));
    inserts.push({
      ...mapped,
      movement_pattern: built.patch.movement_pattern,
      progression_type: built.patch.progression_type,
      coaching_metadata: built.patch.coaching_metadata,
    });
  }

  if (inserts.length) {
    const { error } = await supabase.from('st_exercise_catalog').insert(inserts);
    if (error) fail(report, `Insert 261/262 failed: ${error.message}. Rollback at ${ROLLBACK}`);
  }

  const after = await fetchAll(supabase);
  if (after.error) fail(report, `Final re-read failed: ${after.error}`);
  const afterById = new Map(after.rows.map((row) => [String(row.id), row]));
  const afterByExternal = new Map(
    after.rows.filter((row) => row.external_source === MASTER_CATALOG_SOURCE).map((row) => [String(row.external_id), row])
  );

  const persistErrors: string[] = [];
  let archivedModified = 0;
  let customModified = 0;

  archived.forEach((before) => {
    const now = afterById.get(String(before.id));
    if (!now) {
      persistErrors.push(`Archived row disappeared: ${before.id}`);
      return;
    }
    if (JSON.stringify(before) !== JSON.stringify({ ...now, updated_at: before.updated_at })) {
      const changed =
        now.exercise_type !== before.exercise_type ||
        now.category !== before.category ||
        now.progression_type !== before.progression_type ||
        JSON.stringify(now.coaching_metadata) !== JSON.stringify(before.coaching_metadata);
      if (changed) {
        archivedModified += 1;
        persistErrors.push(`Archived row modified: ${now.name}`);
      }
    }
  });

  customs.forEach((before) => {
    const now = afterById.get(String(before.id));
    if (!now) return;
    const changed =
      now.exercise_type !== before.exercise_type ||
      now.category !== before.category ||
      now.progression_type !== before.progression_type ||
      JSON.stringify(now.coaching_metadata) !== JSON.stringify(before.coaching_metadata);
    if (changed) {
      customModified += 1;
      persistErrors.push(`Custom row modified: ${now.name}`);
    }
  });

  const rereadRepairs = typeRepairs.map((before) => {
    const now = afterById.get(String(before.id));
    const expected = repairedFirstClassFields(before);
    if (!now) persistErrors.push(`Missing after repair: ${before.name}`);
    else {
      if (now.exercise_type !== expected.exercise_type) persistErrors.push(`${before.name} type ${now.exercise_type} != ${expected.exercise_type}`);
      if (now.category !== expected.category) persistErrors.push(`${before.name} category ${now.category} != ${expected.category}`);
      if (now.progression_type !== expected.progression_type) persistErrors.push(`${before.name} progression ${now.progression_type} != ${expected.progression_type}`);
      if (JSON.stringify(now.coaching_metadata?.hypertrophy_volume_credits) !== JSON.stringify(before.coaching_metadata?.hypertrophy_volume_credits)) {
        persistErrors.push(`${before.name} volume credits changed`);
      }
    }
    return now;
  });

  const row12 = afterByExternal.get('12');
  if ((row12?.coaching_metadata?.aliases || []).some((alias: string) => String(alias).toLowerCase() === 'bent row')) {
    persistErrors.push('Row 12 still has Bent Row alias');
  }
  const row25 = afterByExternal.get('25');
  const invEq = compatibleEquipmentOptions(row25);
  if (!invEq.includes('Bodyweight') || !invEq.includes('Suspension Trainer')) {
    persistErrors.push(`Inverted Row equipment ${invEq.join(', ')}`);
  }
  const row63 = afterByExternal.get('63');
  const lungeEq = compatibleEquipmentOptions(row63);
  if (!lungeEq.includes('Smith Machine') || !(row63?.coaching_metadata?.aliases || []).includes('Rear Lunge')) {
    persistErrors.push('Reverse Lunge missing Rear Lunge / Smith Machine');
  }
  const row242 = afterByExternal.get('242');
  if (!row242 || row242.exercise_type !== 'cardio') persistErrors.push('Row Ergometer is no longer cardio');

  const row261 = afterByExternal.get('261');
  const row262 = afterByExternal.get('262');
  if (!row261 || row261.name !== 'Diverging Row') persistErrors.push('Master 261 missing');
  if (!row262 || row262.name !== 'Converging Chest Press') persistErrors.push('Master 262 missing');
  if (row261 && !isAiGenerationEligibleRow(row261)) persistErrors.push('261 not AI-eligible');
  if (row262 && !isAiGenerationEligibleRow(row262)) persistErrors.push('262 not AI-eligible');

  const afterActiveMaster = after.rows.filter(
    (row) => row.is_archived !== true && row.external_source === MASTER_CATALOG_SOURCE && row.is_system !== false && !row.user_id
  );
  const aiCandidates = selectAiGenerationCatalogRows(after.rows);
  if (afterActiveMaster.length !== 262) persistErrors.push(`active master count ${afterActiveMaster.length}, expected 262`);
  if (aiCandidates.length !== 262) persistErrors.push(`AI candidates ${aiCandidates.length}, expected 262`);
  if (expectedMasterCatalogCount() !== 262) persistErrors.push(`local master count ${expectedMasterCatalogCount()}`);

  if (persistErrors.length || archivedModified !== 0 || customModified !== 0) {
    fail(
      report,
      `Verification failed (archivedModified=${archivedModified}, customModified=${customModified}): ${persistErrors.join('; ')}`
    );
  }

  const strengthRow = searchCatalog(afterActiveMaster, { query: 'row', section: 'strength', limit: 12 });
  const cardioRow = searchCatalog(afterActiveMaster, { query: 'row', section: 'cardio', limit: 8 });

  report.status = 'applied';
  report.archived_rows_modified = 0;
  report.custom_rows_modified = 0;
  report.live_active_master_after = afterActiveMaster.length;
  report.ai_candidates = aiCandidates.length;
  report.repaired = rereadRepairs.filter(Boolean).map((row: any) => ({
    external_id: row.external_id,
    name: row.name,
    exercise_type: row.exercise_type,
    category: row.category,
    progression_type: row.progression_type,
  }));
  report.strength_row_search = strengthRow.map((row: any, i: number) => ({
    rank: i + 1,
    name: row.name,
    external_id: row.external_id,
    exercise_type: row.exercise_type,
    category: row.category,
    progression_type: row.progression_type,
    measurement_type: row.coaching_metadata?.measurement_type,
  }));
  report.cardio_row_search = cardioRow.map((row: any, i: number) => ({
    rank: i + 1,
    name: row.name,
    external_id: row.external_id,
    exercise_type: row.exercise_type,
  }));
  report.diverging_row = row261;
  report.converging_chest_press = row262;
  report.reverse_lunge_equipment = compatibleEquipmentOptions(row63);
  report.inverted_row_equipment = invEq;
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        status: 'applied',
        repaired: (report.type_repair_ids as any[]).length,
        active_master: afterActiveMaster.length,
        ai_candidates: aiCandidates.length,
        archived_modified: 0,
        custom_modified: 0,
        rollback: ROLLBACK,
        strength_row_top: (report.strength_row_search as any[]).slice(0, 8),
        cardio_row_top: report.cardio_row_search,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
