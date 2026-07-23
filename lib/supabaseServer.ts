import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseFromRequest(request: Request): { supabase: SupabaseClient; token: string } {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const supabase = createClient(url, anonKey, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  });
  return { supabase, token };
}

export async function requireAuthUser(supabase: SupabaseClient, token: string) {
  if (!token) return { user: null, error: 'Missing authorization token' };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: error?.message || 'Unauthorized' };
  return { user: data.user, error: null };
}

export function createServiceRoleSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Server missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
