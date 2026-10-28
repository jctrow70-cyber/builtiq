/**
 * Read-only catalog source counts. Does not update or delete rows and does not print instruction text.
 * Usage: npx tsx scripts/inventory-catalog-sources.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function loadEnvFiles() {
  const root = process.cwd();
  for (const name of ['.env.local', '.env']) {
    const filePath = path.join(root, name);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

type Bucket = { rows: number; archived: number; active: number; userOwned: number };

async function main() {
  loadEnvFiles();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      JSON.stringify(
        {
          ran: false,
          reason: 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. No database query was made.',
        },
        null,
        2
      )
    );
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const buckets = new Map<string, Bucket>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('st_exercise_catalog')
      .select('external_source,is_archived,user_id')
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    for (const row of rows) {
      const source = String(row.external_source || '(none)');
      const bucket = buckets.get(source) || { rows: 0, archived: 0, active: 0, userOwned: 0 };
      bucket.rows += 1;
      if (row.user_id) bucket.userOwned += 1;
      if (row.is_archived) bucket.archived += 1;
      else bucket.active += 1;
      buckets.set(source, bucket);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const sources = Array.from(buckets.entries())
    .map(([external_source, counts]) => ({ external_source, ...counts }))
    .sort((a, b) => a.external_source.localeCompare(b.external_source));
  console.log(JSON.stringify({ ran: true, writes: 0, sources }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
