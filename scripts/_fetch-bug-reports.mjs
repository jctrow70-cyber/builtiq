import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL || '';
const url = rawUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
const sb = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb
  .from('st_bug_reports')
  .select('id, title, description, page_context, app_nav, status, created_at')
  .order('created_at', { ascending: false })
  .limit(5);

if (error) {
  fs.writeFileSync('scripts/_bug-reports-out.json', JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
}

fs.writeFileSync('scripts/_bug-reports-out.json', JSON.stringify(data, null, 2));
