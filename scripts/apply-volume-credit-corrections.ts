/**
 * BIQ-0229: Apply approved hypertrophy credit corrections to active master rows only.
 * Writes rollback first. Does not touch archived or user-custom rows.
 *
 * Run: npx tsx scripts/apply-volume-credit-corrections.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { MASTER_CATALOG_SOURCE } from '../lib/training/masterCatalog';

const ARTIFACT = path.join(process.cwd(), 'docs/catalog-overhaul/proposed-volume-credits.json');
const ROLLBACK = path.join(process.cwd(), 'docs/catalog-overhaul/volume-credit-corrections-rollback.json');
const REPORT = path.join(process.cwd(), 'docs/catalog-overhaul/volume-credit-corrections-apply-report.json');

const PRIMARY_UPPER_BACK_RULE = 'midback_row_primary_upper_back';

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

function asObject(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return { ...value };
}

function creditsFromMap(map: Record<string, number>) {
  return Object.entries(map).map(([muscle, credit]) => ({ muscle, credit }));
}

function creditKey(rows: Array<{ muscle: string; credit: number }>) {
  return JSON.stringify(
    [...rows]
      .map((row) => ({ muscle: String(row.muscle), credit: Number(row.credit) }))
      .sort((a, b) => a.muscle.localeCompare(b.muscle))
  );
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
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  process.exit(2);
}

function loadTargets() {
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
  const targets: Array<{
    id: string;
    name: string;
    rule: string;
    proposed: Record<string, number>;
    setPrimaryUpperBack: boolean;
  }> = [];
  (artifact.rules || []).forEach((rule: any) => {
    (rule.exercises || []).forEach((ex: any) => {
      if (ex.change === 'none') return;
      targets.push({
        id: String(ex.id),
        name: String(ex.exercise),
        rule: String(rule.id),
        proposed: rule.proposed,
        setPrimaryUpperBack: rule.id === PRIMARY_UPPER_BACK_RULE,
      });
    });
  });
  return targets;
}

async function main() {
  loadEnvLocal();
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    status: 'started',
    phase_2b: 'not_started',
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail(report, 'Supabase URL or SUPABASE_SERVICE_ROLE_KEY is not set.');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const live = await fetchAll(supabase);
  if (live.error || !live.rows.length) fail(report, `Catalog fetch failed: ${live.error || 'no rows'}`);

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

  const targets = loadTargets();
  report.target_count = targets.length;
  const byId = new Map(liveActiveMaster.map((row) => [String(row.id), row]));
  const matchErrors: string[] = [];
  const patches = targets.map((target) => {
    const liveRow = byId.get(target.id);
    if (!liveRow) {
      matchErrors.push(`No active master for ${target.name} (${target.id})`);
      return null;
    }
    if (liveRow.is_archived === true || liveRow.user_id) {
      matchErrors.push(`${target.name} is archived or user-custom`);
      return null;
    }
    if (String(liveRow.name) !== target.name) {
      matchErrors.push(`Name mismatch ${target.name} vs live ${liveRow.name}`);
      return null;
    }
    const meta = asObject(liveRow.coaching_metadata);
    const nextMeta = {
      ...meta,
      hypertrophy_volume_credits: creditsFromMap(target.proposed),
    };
    if (target.setPrimaryUpperBack) {
      nextMeta.primary_muscles = ['upper_back'];
      const secondary = new Set<string>([...(Array.isArray(meta.secondary_muscles) ? meta.secondary_muscles : []), 'lats', 'biceps']);
      secondary.delete('upper_back');
      nextMeta.secondary_muscles = Array.from(secondary);
    }
    return { target, liveRow, nextMeta };
  });

  if (matchErrors.length || patches.some((row) => !row)) {
    fail(report, `Match failed: ${matchErrors.join('; ')}`);
  }

  const ready = patches.filter((row): row is NonNullable<typeof row> => !!row);
  const rollback = {
    generated_at: new Date().toISOString(),
    supabase_host: new URL(url).host,
    rows: ready.map((row) => ({
      id: row.liveRow.id,
      name: row.liveRow.name,
      coaching_metadata: row.liveRow.coaching_metadata,
      muscle_targets: row.liveRow.muscle_targets,
      muscle_group: row.liveRow.muscle_group,
    })),
  };
  fs.mkdirSync(path.dirname(ROLLBACK), { recursive: true });
  fs.writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2));
  report.rollback_path = ROLLBACK;
  report.rollback_rows = rollback.rows.length;

  for (const row of ready) {
    const { error } = await supabase
      .from('st_exercise_catalog')
      .update({ coaching_metadata: row.nextMeta })
      .eq('id', row.liveRow.id)
      .eq('is_archived', false)
      .eq('external_source', MASTER_CATALOG_SOURCE)
      .is('user_id', null);
    if (error) fail(report, `Write failed on ${row.target.name}: ${error.message}. Rollback is at ${ROLLBACK}`);
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
    if (JSON.stringify(now.coaching_metadata || {}) !== JSON.stringify(before.coaching_metadata || {})) {
      archivedModified += 1;
      persistErrors.push(`Archived row modified: ${now.name}`);
    }
  });

  const verified: any[] = [];
  ready.forEach((row) => {
    const persisted = afterById.get(String(row.liveRow.id));
    if (!persisted) {
      persistErrors.push(`Missing after write: ${row.target.name}`);
      return;
    }
    const credits = asObject(persisted.coaching_metadata).hypertrophy_volume_credits || [];
    if (creditKey(credits) !== creditKey(creditsFromMap(row.target.proposed))) {
      persistErrors.push(`Credit mismatch after write: ${row.target.name}`);
    }
    if (row.target.setPrimaryUpperBack && asObject(persisted.coaching_metadata).primary_muscles?.[0] !== 'upper_back') {
      persistErrors.push(`Primary muscle not updated: ${row.target.name}`);
    }
    verified.push({
      id: row.target.id,
      name: row.target.name,
      rule: row.target.rule,
      credits,
    });
  });

  const untouchedMasters = liveActiveMaster.filter((row) => !ready.some((p) => p.liveRow.id === row.id));
  untouchedMasters.forEach((before) => {
    const now = afterById.get(String(before.id));
    if (!now) return;
    if (JSON.stringify(now.coaching_metadata || {}) !== JSON.stringify(before.coaching_metadata || {})) {
      persistErrors.push(`Untargeted master modified: ${now.name}`);
    }
  });

  if (persistErrors.length) fail(report, persistErrors.join('; '));

  report.status = 'applied';
  report.rows_updated = ready.length;
  report.archived_rows_modified = archivedModified;
  report.verified = verified;
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
}

main().catch((err) => {
  fs.writeFileSync(REPORT, JSON.stringify({ status: 'aborted', error: err?.message || String(err) }, null, 2));
  process.exit(1);
});
