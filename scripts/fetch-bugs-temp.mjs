import { readFileSync, writeFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
  return out;
}

const env = { ...process.env, ...loadEnv('.env.local') };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('missing supabase env');
  process.exit(1);
}

const sb = createClient(url, key);
const { data, error } = await sb
  .from('st_bug_reports')
  .select('id,title,description,page_context,app_nav,status,created_at')
  .order('created_at', { ascending: false })
  .limit(5);

if (error) {
  console.error(error.message);
  process.exit(1);
}

writeFileSync('scripts/bug-reports-out.json', JSON.stringify(data, null, 2));
console.log('wrote', data?.length ?? 0, 'reports');
