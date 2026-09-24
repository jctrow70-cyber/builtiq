/**
 * BIQ-0213: Apply approved active-catalog enrichment to st_exercise_catalog.
 * Writes only the 260 active BuiltIQ master rows. Aborts if validation fails.
 *
 * Run: npx tsx scripts/apply-active-catalog-enrichment.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { MASTER_CATALOG_SOURCE } from '../lib/training/masterCatalog';
import { buildCatalogPatch, validatePersistedRow, ENRICHMENT_VERSION } from '../lib/scienceEngine/catalogEnrichment/storage';

const SRC = path.join(process.cwd(), 'docs/catalog-overhaul/active-catalog-enrichment.json');
const ROLLBACK = path.join(process.cwd(), 'docs/catalog-overhaul/active-catalog-enrichment-rollback.json');
const APPLY_REPORT = path.join(process.cwd(), 'docs/catalog-overhaul/active-catalog-enrichment-apply-report.json');

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

function fail(report: Record<string, unknown>, message: string): never {
  report.status = 'aborted';
  report.error = message;
  fs.mkdirSync(path.dirname(APPLY_REPORT), { recursive: true });
  fs.writeFileSync(APPLY_REPORT, JSON.stringify(report, null, 2));
  console.error(JSON.stringify({ status: 'aborted', error: message }, null, 2));
  process.exit(2);
}

async function main() {
  loadEnvLocal();
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    enrichment_version: ENRICHMENT_VERSION,
    status: 'started',
    phase_2: 'not_started',
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail(report, 'Supabase URL or SUPABASE_SERVICE_ROLE_KEY is not set. Cannot apply production enrichment.');
  }

  let supabase;
  try {
    supabase = createClient(url, key, { auth: { persistSession: false } });
  } catch (err: any) {
    fail(report, `Failed to create Supabase client: ${err?.message || err}`);
  }

  const live = await fetchAll(supabase);
  if (live.error || !live.rows.length) {
    fail(report, `Supabase catalog fetch failed: ${live.error || 'no rows'}. Approved enrichment was not written.`);
  }

  const artifact = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const proposedRows = artifact.exercises || [];
  if (proposedRows.length !== 260) {
    fail(report, `Expected 260 proposed exercises, found ${proposedRows.length}`);
  }

  const liveActiveMaster = live.rows.filter(
    (row) => row.is_archived !== true && row.is_system !== false && !row.user_id && row.external_source === MASTER_CATALOG_SOURCE
  );
  const liveArchived = live.rows.filter((row) => row.is_archived === true);
  report.live_total_rows = live.rows.length;
  report.live_active_master = liveActiveMaster.length;
  report.live_archived = liveArchived.length;
  report.supabase_host = new URL(url).host;

  if (liveActiveMaster.length !== 260) {
    fail(report, `Expected 260 active master rows, found ${liveActiveMaster.length}. Aborting.`);
  }

  const byExternal = new Map(liveActiveMaster.map((row) => [String(row.external_id), row]));
  const byName = new Map(liveActiveMaster.map((row) => [String(row.name).toLowerCase(), row]));
  const targets: Array<{ live: any; proposed: any; patch: ReturnType<typeof buildCatalogPatch> }> = [];
  const matchErrors: string[] = [];

  proposedRows.forEach((proposed: any) => {
    const liveRow = byExternal.get(String(proposed.external_id)) || byName.get(String(proposed.name).toLowerCase());
    if (!liveRow) {
      matchErrors.push(`No live active master match for ${proposed.name} (${proposed.external_id})`);
      return;
    }
    if (liveRow.is_archived === true) {
      matchErrors.push(`${proposed.name} matched an archived row`);
      return;
    }
    const built = buildCatalogPatch({
      name: proposed.name,
      category: proposed.category,
      proposed: proposed.proposed,
      existingMetadata: liveRow.coaching_metadata,
      existingMovementPattern: liveRow.movement_pattern,
    });
    targets.push({ live: liveRow, proposed, patch: built });
  });

  if (matchErrors.length || targets.length !== 260) {
    fail(report, `Match/build failed: ${matchErrors.join('; ') || `built ${targets.length} targets`}`);
  }

  const validationErrors = targets.flatMap((row) => row.patch.errors);
  if (validationErrors.length) {
    fail(report, `Pre-write validation failed: ${validationErrors.join('; ')}`);
  }

  const targetIds = new Set(targets.map((row) => String(row.live.id)));
  if (targetIds.size !== 260) fail(report, `Duplicate live IDs in target set (${targetIds.size})`);

  const rollback = {
    generated_at: new Date().toISOString(),
    enrichment_version: ENRICHMENT_VERSION,
    supabase_host: new URL(url).host,
    rows: targets.map((row) => row.live),
  };
  fs.mkdirSync(path.dirname(ROLLBACK), { recursive: true });
  fs.writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2));
  report.rollback_path = ROLLBACK;
  report.rollback_rows = rollback.rows.length;

  let updated = 0;
  for (const row of targets) {
    const { error } = await supabase
      .from('st_exercise_catalog')
      .update({
        movement_pattern: row.patch.patch.movement_pattern,
        muscle_group: row.patch.patch.muscle_group,
        muscle_targets: row.patch.patch.muscle_targets,
        primary_muscle_percentage: row.patch.patch.primary_muscle_percentage,
        secondary_muscle_percentage: row.patch.patch.secondary_muscle_percentage,
        progression_type: row.patch.patch.progression_type,
        coaching_metadata: row.patch.patch.coaching_metadata,
      })
      .eq('id', row.live.id)
      .eq('is_archived', false)
      .eq('external_source', MASTER_CATALOG_SOURCE);
    if (error) {
      fail(report, `Write failed on ${row.proposed.name}: ${error.message}. Rollback artifact is at ${ROLLBACK}`);
    }
    updated += 1;
  }

  const after = await fetchAll(supabase);
  if (after.error) fail(report, `Post-write re-read failed: ${after.error}`);
  const afterById = new Map(after.rows.map((row) => [String(row.id), row]));
  const persistErrors: string[] = [];
  let archivedModified = 0;

  liveArchived.forEach((before) => {
    const now = afterById.get(String(before.id));
    if (!now) {
      persistErrors.push(`Archived row ${before.id} disappeared`);
      return;
    }
    const beforeMeta = JSON.stringify(before.coaching_metadata || {});
    const afterMeta = JSON.stringify(now.coaching_metadata || {});
    if (
      now.movement_pattern !== before.movement_pattern ||
      now.muscle_group !== before.muscle_group ||
      JSON.stringify(now.muscle_targets || null) !== JSON.stringify(before.muscle_targets || null) ||
      beforeMeta !== afterMeta
    ) {
      archivedModified += 1;
      persistErrors.push(`Archived row modified: ${now.name}`);
    }
  });

  targets.forEach((row) => {
    const persisted = afterById.get(String(row.live.id));
    if (!persisted) {
      persistErrors.push(`Missing after write: ${row.proposed.name}`);
      return;
    }
    persistErrors.push(...validatePersistedRow({ name: row.proposed.name, before: row.live, after: persisted, patch: row.patch.patch }));
  });

  if (persistErrors.length || archivedModified !== 0) {
    fail(report, `Persistence verification failed (${archivedModified} archived modified): ${persistErrors.join('; ')}`);
  }

  const afterActiveMaster = after.rows.filter(
    (row) => row.is_archived !== true && row.external_source === MASTER_CATALOG_SOURCE && row.is_system !== false && !row.user_id
  );

  report.status = 'applied';
  report.active_rows_updated = updated;
  report.archived_rows_modified = 0;
  report.after_active_master = afterActiveMaster.length;
  report.validation = { ok: true, errors: [] };
  report.persistence = { ok: true, errors: [] };
  fs.writeFileSync(APPLY_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
