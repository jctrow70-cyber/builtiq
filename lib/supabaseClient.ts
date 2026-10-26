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

/** Maps Auth session_not_found / missing-session errors to a clear re-login prompt. */
export function friendlySessionExpiredMessage(message?: string | null): string | null {
  const msg = String(message || '').trim();
  if (!msg) return null;
  if (/auth session missing/i.test(msg) || /session_not_found/i.test(msg)) {
    return 'Your sign-in expired. Please sign out and sign back in, then try again.';
  }
  return null;
}

export function friendlyAuthError(message?: string | null): string {
  const configError = getSupabaseConfigError();
  if (configError) return configError;

  const sessionExpired = friendlySessionExpiredMessage(message);
  if (sessionExpired) return sessionExpired;

  if (isTransientNetworkMessage(message)) {
    return 'Could not reach Supabase from this device (Load failed / network). Check: 1) Vercel has NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY, 2) Supabase → Authentication → URL Configuration includes your Vercel site URL, 3) try Chrome or disable content blockers, then retry.';
  }

  return String(message || '').trim() || 'Sign-in failed. Please try again.';
}

/**
 * Access token for API routes. Refreshes when missing expiry or within 60s of expiry.
 * `getSession()` alone can return a JWT whose Auth session row is gone; callers should
 * retry once with {@link refreshAccessToken} on "Auth session missing!".
 */
export async function getFreshAccessToken(client: SupabaseClient = supabase): Promise<string | null> {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session?.access_token) return null;

  const expiresAt = Number(session.expires_at || 0);
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt && expiresAt > now + 60) return session.access_token;

  return refreshAccessToken(client);
}

export async function refreshAccessToken(client: SupabaseClient = supabase): Promise<string | null> {
  const { data, error } = await client.auth.refreshSession();
  if (error || !data.session?.access_token) return null;
  return data.session.access_token;
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
