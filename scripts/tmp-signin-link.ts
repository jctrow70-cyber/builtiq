import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
const env: Record<string, string> = {};
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq < 1) continue;
  env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const email = (env.BUILDIQ_ADMIN_EMAILS || '').split(',')[0].trim();
if (!url || !key || !email) {
  writeFileSync(resolve(process.cwd(), 'scripts/tmp-signin-link-out.txt'), 'missing env\n');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo: 'http://localhost:3000/' },
});

const out = resolve(process.cwd(), 'scripts/tmp-signin-link-out.txt');
if (error || !data?.properties?.action_link) {
  writeFileSync(out, `error:${error?.message || 'no link'}\n`);
  process.exit(1);
}
writeFileSync(out, data.properties.action_link);
