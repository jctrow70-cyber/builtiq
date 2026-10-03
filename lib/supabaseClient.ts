import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function getSupabaseConfigError(): string | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'BuildIQ Health is missing Supabase settings on this deploy. In Vercel → Project → Settings → Environment Variables, set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for Production and Preview, then Redeploy.';
  }
  if (!/^https:\/\//i.test(supabaseUrl)) {
    return 'NEXT_PUBLIC_SUPABASE_URL must start with https:// (use your project URL from Supabase → Settings → API).';
  }
  return null;
}

function isTransientNetworkMessage(message?: string | null) {
  const msg = String(message || '').trim();
  const lower = msg.toLowerCase();
  return (
    !msg ||
    lower === 'load failed' ||
    lower === 'failed to fetch' ||
    lower === 'typeerror: load failed' ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('access control')
  );
}

export function friendlyWriteError(error?: unknown, fallback = 'Something went wrong. Please try again.') {
  const msg =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : String(error || '');
  if (isTransientNetworkMessage(msg)) {
    return 'Could not reach BuildIQ just then (Load failed / network). Check your connection and try again.';
  }
  return msg || fallback;
}

export function friendlyAuthError(message?: string | null): string {
  const configError = getSupabaseConfigError();
  if (configError) return configError;

  if (isTransientNetworkMessage(message)) {
    return 'Could not reach Supabase from this device (Load failed / network). Check: 1) Vercel has NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY, 2) Supabase → Authentication → URL Configuration includes your Vercel site URL, 3) try Chrome or disable content blockers, then retry.';
  }

  return String(message || '').trim() || 'Sign-in failed. Please try again.';
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
