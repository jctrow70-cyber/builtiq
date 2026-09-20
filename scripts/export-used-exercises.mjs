/**
 * Export distinct exercises logged by household emails to a mapping CSV.
 * Reads .env.local (service role). Run from repo root:
 *   node scripts/export-used-exercises.mjs you@email.com spouse@email.com
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL || '';
const url = rawUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const emails = process.argv.slice(2).map((e) => e.trim().toLowerCase()).filter(Boolean);
const sb = createClient(url, key, { auth: { persistSession: false } });

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const { data: profiles, error: profileErr } = await sb
  .from('st_profiles')
  .select('user_id, display_name');
if (profileErr) {
  console.error(profileErr.message);
  process.exit(1);
}

const nameByUser = Object.fromEntries((profiles || []).map((p) => [p.user_id, p.display_name || '']));

let householdIds = null;
if (emails.length) {
  const { data: users, error: userErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (userErr) {
    console.error(userErr.message);
    process.exit(1);
  }
  householdIds = (users?.users || [])
    .filter((u) => emails.includes(String(u.email || '').toLowerCase()))
    .map((u) => u.id);
  if (!householdIds.length) {
    console.error('No auth users matched those emails.');
    process.exit(1);
  }
}

const pageSize = 1000;
let from = 0;
const logs = [];
while (true) {
  let q = sb
    .from('st_set_logs')
    .select('user_id, log_date, completed, snapshot_exercise_name, snapshot_catalog_exercise_id')
    .order('log_date', { ascending: true })
    .range(from, from + pageSize - 1);
  if (householdIds) q = q.in('user_id', householdIds);
  const { data, error } = await q;
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  const rows = data || [];
  logs.push(...rows);
  if (rows.length < pageSize) break;
  from += pageSize;
}

const catalogIds = [...new Set(logs.map((r) => r.snapshot_catalog_exercise_id).filter(Boolean))];
const catalogById = {};
for (let i = 0; i < catalogIds.length; i += 200) {
  const chunk = catalogIds.slice(i, i + 200);
  const { data, error } = await sb
    .from('st_exercise_catalog')
    .select('id, name, external_source, external_id, muscle_group, equipment, movement_pattern')
    .in('id', chunk);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  for (const row of data || []) catalogById[row.id] = row;
}

const grouped = new Map();
for (const row of logs) {
  const cat = row.snapshot_catalog_exercise_id ? catalogById[row.snapshot_catalog_exercise_id] : null;
  const loggedName = String(row.snapshot_exercise_name || '').trim() || cat?.name || 'Unknown';
  const key = `${loggedName.toLowerCase()}|${row.snapshot_catalog_exercise_id || ''}`;
  let acc = grouped.get(key);
  if (!acc) {
    acc = {
      logged_name: loggedName,
      current_catalog_name: cat?.name || '',
      current_catalog_id: row.snapshot_catalog_exercise_id || '',
      external_source: cat?.external_source || '',
      external_id: cat?.external_id || '',
      muscle_group: cat?.muscle_group || '',
      equipment: cat?.equipment || '',
      movement_pattern: cat?.movement_pattern || '',
      set_rows: 0,
      completed_sets: 0,
      users: new Set(),
      first_logged: row.log_date,
      last_logged: row.log_date,
    };
    grouped.set(key, acc);
  }
  acc.set_rows += 1;
  if (row.completed) acc.completed_sets += 1;
  acc.users.add(nameByUser[row.user_id] || row.user_id);
  if (String(row.log_date) < String(acc.first_logged)) acc.first_logged = row.log_date;
  if (String(row.log_date) > String(acc.last_logged)) acc.last_logged = row.log_date;
}

const header = [
  'logged_name',
  'current_catalog_name',
  'current_catalog_id',
  'external_source',
  'external_id',
  'muscle_group',
  'equipment',
  'movement_pattern',
  'who_logged',
  'set_rows',
  'completed_sets',
  'user_count',
  'first_logged',
  'last_logged',
  'new_exercise_id',
  'new_exercise_name',
];

const rows = [...grouped.values()].sort((a, b) => b.set_rows - a.set_rows || a.logged_name.localeCompare(b.logged_name));
const csv = [
  header.join(','),
  ...rows.map((r) =>
    [
      r.logged_name,
      r.current_catalog_name,
      r.current_catalog_id,
      r.external_source,
      r.external_id,
      r.muscle_group,
      r.equipment,
      r.movement_pattern,
      [...r.users].sort().join('; '),
      r.set_rows,
      r.completed_sets,
      r.users.size,
      r.first_logged,
      r.last_logged,
      '',
      '',
    ]
      .map(csvCell)
      .join(',')
  ),
].join('\n');

const out = 'docs/catalog-overhaul/used-exercises-to-map.csv';
fs.writeFileSync(out, csv, 'utf8');
console.log(`WROTE ${out} exercises=${rows.length} set_rows=${logs.length} household=${householdIds ? householdIds.length : 'all loggers'}`);
