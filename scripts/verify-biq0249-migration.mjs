/**
 * BIQ-0249 inspect / apply / verify.
 * Does not print secrets. Does not reset the database or rewrite set logs.
 * Usage:
 *   node scripts/verify-biq0249-migration.mjs
 *   node scripts/verify-biq0249-migration.mjs --apply
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

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

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ref = url.replace(/^https:\/\//, '').split('.')[0] || 'missing';
const apply = process.argv.includes('--apply');

async function runSql(sql) {
  const tokens = [
    process.env.SUPABASE_ACCESS_TOKEN,
    process.env.SUPABASE_MANAGEMENT_TOKEN,
  ].filter(Boolean);
  if (!tokens.length) return { ok: false, error: 'No management token in environment' };
  let last = 'no attempt';
  for (const token of tokens) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (res.ok) {
      try {
        return { ok: true, data: JSON.parse(text) };
      } catch {
        return { ok: true, data: text };
      }
    }
    last = `management_api ${res.status}: ${text.slice(0, 300)}`;
    if (res.status !== 401 && res.status !== 403) return { ok: false, error: last };
  }
  return { ok: false, error: last };
}

function rows(result) {
  if (!result.ok) return [];
  return Array.isArray(result.data) ? result.data : [];
}

const inspectSql = `
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'st_programs' and column_name = 'generation_criteria') as criteria_column,
  (select count(*) from public.st_programs) as programs,
  (select count(*) from public.st_workouts) as workouts,
  (select count(*) from public.st_set_logs) as set_logs,
  (select pg_get_functiondef('public.st_duplicate_program(uuid,text,text,uuid,uuid)'::regprocedure)) as fn
`;

const before = await runSql(inspectSql);
if (!before.ok) {
  console.log(JSON.stringify({ ref, step: 'inspect', ok: false, error: before.error }, null, 2));
} else {
const current = rows(before)[0] || {};
const fn = String(current.fn || '');
const summary = {
  ref,
  criteria_column: Number(current.criteria_column || 0),
  programs: Number(current.programs || 0),
  programs_null_criteria: current.programs_null_criteria == null ? null : Number(current.programs_null_criteria),
  workouts: Number(current.workouts || 0),
  set_logs: Number(current.set_logs || 0),
  function_has_generation_criteria: fn.includes('generation_criteria'),
  function_has_end_date: fn.includes('end_date'),
  function_has_inclusive_plan: fn.includes('inclusive_plan'),
  function_has_science_version: fn.includes('science_version'),
  function_has_cycle_length: fn.includes('cycle_length_weeks'),
  function_bytes: fn.length,
};
console.log(JSON.stringify({ step: 'inspect', ...summary }, null, 2));
fs.writeFileSync(
  path.join(process.cwd(), 'scripts', '_biq0249_fn_before.sql'),
  fn || '-- function missing',
  'utf8'
);
}

const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || '', {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sample = await supabase.from('st_programs').select('id, generation_criteria').limit(1);
const counts = await Promise.all([
  supabase.from('st_programs').select('id', { count: 'exact', head: true }),
  supabase.from('st_workouts').select('id', { count: 'exact', head: true }),
  supabase.from('st_set_logs').select('id', { count: 'exact', head: true }),
]);
const nullCriteria = await supabase.from('st_programs').select('id', { count: 'exact', head: true }).is('generation_criteria', null);
const filledCriteria = await supabase.from('st_programs').select('id', { count: 'exact', head: true }).not('generation_criteria', 'is', null);
const marker = 'BIQ-0249-VERIFY-DELETE';
const owner = await supabase.from('st_programs').select('owner_user_id').not('owner_user_id', 'is', null).limit(1).maybeSingle();
const snapshot = {
  version: 1,
  saved_at: '2026-10-07T00:00:00.000Z',
  status: 'science_template',
  goal: 'Athletic Performance',
  split: 'Hybrid',
  experience: 'Intermediate',
  days: ['Mon', 'Fri'],
  session_minutes: 45,
  notes: 'Verification snapshot',
  focus_muscles: [],
  identical_days: true,
  upper_push: true,
  lower_pull: true,
  required_muscles: ['chest', 'hamstrings', 'glutes'],
  waived_muscles: ['quads', 'lats', 'upper back'],
  warmup_min: 2,
  warmup_max: 3,
  extended_warmup: false,
  kept: ['Both training days use the same workout.'],
  unmet: [],
};
let roundtrip = { skipped: true };
if (owner.data?.owner_user_id) {
  const inserted = await supabase.from('st_programs').insert({
    owner_user_id: owner.data.owner_user_id,
    visibility: 'personal',
    name: marker,
    weeks: 1,
    status: 'draft',
    generation_criteria: snapshot,
  }).select('id, generation_criteria').maybeSingle();
  if (inserted.error || !inserted.data?.id) {
    roundtrip = { inserted: false, error: inserted.error?.message || 'no id' };
  } else {
    const id = inserted.data.id;
    const updated = await supabase.from('st_programs').update({
      generation_criteria: { ...snapshot, status: 'ai_repaired', notes: 'Regenerated verification snapshot' },
    }).eq('id', id).select('generation_criteria').maybeSingle();
    const removed = await supabase.from('st_programs').delete().eq('id', id).eq('name', marker);
    roundtrip = {
      inserted: inserted.data.generation_criteria?.version === 1 && inserted.data.generation_criteria?.status === 'science_template',
      updated: updated.data?.generation_criteria?.status === 'ai_repaired',
      deleted: !removed.error,
      error: updated.error?.message || removed.error?.message || null,
    };
  }
}
const afterCounts = await Promise.all([
  supabase.from('st_workouts').select('id', { count: 'exact', head: true }),
  supabase.from('st_set_logs').select('id', { count: 'exact', head: true }),
  supabase.from('st_programs').select('id', { count: 'exact', head: true }).eq('name', marker),
]);
console.log(JSON.stringify({
  step: 'rest',
  programs_readable: !counts[0].error,
  program_count: counts[0].count,
  workout_count: counts[1].count,
  set_log_count: counts[2].count,
  criteria_select_error: sample.error ? sample.error.message : null,
  sample_criteria_null: sample.data ? sample.data.every((row) => row.generation_criteria == null) : null,
  null_criteria_count: nullCriteria.count,
  filled_criteria_count: filledCriteria.count,
  null_criteria_error: nullCriteria.error?.message || null,
  roundtrip,
  workouts_after: afterCounts[0].count,
  set_logs_after: afterCounts[1].count,
  marker_rows_left: afterCounts[2].count,
}, null, 2));

if (!apply) {
  process.exitCode = sample.error ? 2 : 0;
} else {
const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase', 'migrations', '20261007_056_program_generation_criteria.sql'),
  'utf8'
);
const applied = await runSql(migration);
if (!applied.ok) {
  console.log(JSON.stringify({ step: 'apply', ok: false, error: applied.error }, null, 2));
  process.exit(1);
}
const after = await runSql(`
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'st_programs' and column_name = 'generation_criteria') as criteria_column,
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'st_programs' and column_name = 'generation_criteria') as data_type,
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'st_programs' and column_name = 'generation_criteria') as is_nullable,
  (select count(*) from public.st_programs) as programs,
  (select count(*) from public.st_workouts) as workouts,
  (select count(*) from public.st_set_logs) as set_logs,
  (select position('generation_criteria' in pg_get_functiondef('public.st_duplicate_program(uuid,text,text,uuid,uuid)'::regprocedure)) > 0) as fn_copies_criteria
`);
console.log(JSON.stringify({ step: 'applied', ok: true, after: rows(after)[0] || after.error }, null, 2));
}
