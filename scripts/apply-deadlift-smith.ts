/**
 * BIQ-0236: Add Smith Machine to live Deadlift (master 71) compatible equipment.
 * Does not rewrite history, planned workouts, or archived/custom rows.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { MASTER_CATALOG_SOURCE } from '../lib/training/masterCatalog';
import { compatibleEquipmentOptions } from '../lib/training/exerciseEquipment';

const ROLLBACK = path.join(process.cwd(), 'docs/catalog-overhaul/deadlift-smith-rollback.json');
const REPORT = path.join(process.cwd(), 'docs/catalog-overhaul/deadlift-smith-apply-report.json');

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

async function main() {
  loadEnvLocal();
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    change: 'BIQ-0236',
    status: 'started',
    schema_migration: false,
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
  const { data: live, error } = await supabase
    .from('st_exercise_catalog')
    .select('*')
    .eq('external_source', MASTER_CATALOG_SOURCE)
    .eq('external_id', '71')
    .eq('is_archived', false);
  if (error) {
    report.status = 'aborted';
    report.error = error.message;
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const row = (live || []).find((item: any) => !item.user_id);
  if (!row) {
    report.status = 'aborted';
    report.error = 'Active master Deadlift (71) not found.';
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  fs.mkdirSync(path.dirname(ROLLBACK), { recursive: true });
  fs.writeFileSync(ROLLBACK, JSON.stringify({ generated_at: report.generated_at, rows: [row] }, null, 2));
  report.rollback_path = ROLLBACK;

  const meta = cloneMeta(row.coaching_metadata);
  const compatible = new Set<string>([
    ...(Array.isArray(meta.compatible_equipment) ? meta.compatible_equipment : []),
    row.equipment,
    meta.default_equipment,
    'Barbell',
    'Smith Machine',
  ].filter(Boolean).map((item) => String(item)));
  meta.compatible_equipment = Array.from(compatible);
  meta.default_equipment = meta.default_equipment || row.equipment || 'Barbell';

  const { error: updateError } = await supabase
    .from('st_exercise_catalog')
    .update({ coaching_metadata: meta })
    .eq('id', row.id)
    .eq('is_archived', false)
    .eq('external_source', MASTER_CATALOG_SOURCE)
    .eq('external_id', '71');
  if (updateError) {
    report.status = 'aborted';
    report.error = updateError.message;
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const { data: after, error: rereadError } = await supabase
    .from('st_exercise_catalog')
    .select('*')
    .eq('id', row.id)
    .maybeSingle();
  if (rereadError || !after) {
    report.status = 'aborted';
    report.error = rereadError?.message || 'Re-read failed';
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const { count: archivedModified } = await supabase
    .from('st_exercise_catalog')
    .select('id', { count: 'exact', head: true })
    .eq('external_id', '71')
    .eq('is_archived', true)
    .neq('updated_at', row.updated_at);

  report.status = 'applied';
  report.repaired = {
    external_id: '71',
    name: after.name,
    before_equipment: row.coaching_metadata?.compatible_equipment || [],
    after_equipment: compatibleEquipmentOptions(after),
    archived_modified: 0,
    custom_modified: 0,
  };
  report.archived_probe = archivedModified ?? 0;
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: 'applied', after_equipment: report.repaired }, null, 2));
}

main().catch((error) => {
  fs.writeFileSync(REPORT, JSON.stringify({ status: 'aborted', error: String(error?.message || error) }, null, 2));
  process.exit(1);
});
