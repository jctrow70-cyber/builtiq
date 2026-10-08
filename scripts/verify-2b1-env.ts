/**
 * Read-only Phase 2B.1 environment check. Does not write catalog or prescriptions.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { MASTER_CATALOG_SOURCE, expectedMasterCatalogCount } from '../lib/training/masterCatalog';
import { probePhase2a3Ledger } from '../lib/training/adaptationOrchestration';

const REPORT = path.join(process.cwd(), 'docs/catalog-overhaul/env-2b1-verify.json');

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

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const report: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    wrote_supabase: false,
    expected_master_count: expectedMasterCatalogCount(),
  };
  if (!url || !key) {
    report.error = 'missing supabase env';
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    process.exit(2);
  }
  report.supabase_host = new URL(url).host;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const ledger = await probePhase2a3Ledger(supabase);
  report.phase2a3_ledger = ledger;

  const { count: activeCount, error: countError } = await supabase
    .from('st_exercise_catalog')
    .select('id', { count: 'exact', head: true })
    .eq('external_source', MASTER_CATALOG_SOURCE)
    .is('user_id', null)
    .eq('is_archived', false);
  report.active_master_count = activeCount;
  report.count_error = countError?.message || null;

  const { data: card264, error: cardError } = await supabase
    .from('st_exercise_catalog')
    .select('external_id, name, exercise_type, category, movement_pattern, equipment, is_archived, coaching_metadata')
    .eq('external_source', MASTER_CATALOG_SOURCE)
    .eq('external_id', '264')
    .maybeSingle();
  report.master_264 = card264 || null;
  report.master_264_error = cardError?.message || null;

  const { error: runError } = await supabase.from('st_adaptation_runs').select('id').limit(1);
  report.adaptation_runs_table = runError
    ? { ready: false, reason: runError.message }
    : { ready: true, reason: null };

  const { error: idxError } = await supabase.from('st_adaptation_events').select('application_key').limit(1);
  report.application_key_readable = !idxError || !/application_key/i.test(idxError.message || '');

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    host: report.supabase_host,
    expected: report.expected_master_count,
    live_active: report.active_master_count,
    ledger_ready: ledger.ready,
    ledger_reason: ledger.reason,
    master_264: card264?.name || null,
    runs_ready: !runError,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
