import type { User } from '@supabase/supabase-js';

/** Comma-separated admin emails allowed to run catalog imports (server env only). */
export function getCatalogAdminEmails(): string[] {
  const raw =
    process.env.BUILD_IQ_CATALOG_ADMIN_EMAILS || process.env.BUILTIQ_CATALOG_ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isCatalogAdmin(user: Pick<User, 'email'> | null | undefined): boolean {
  const email = String(user?.email || '')
    .trim()
    .toLowerCase();
  if (!email) return false;
  const allowlist = getCatalogAdminEmails();
  if (!allowlist.length) return false;
  return allowlist.includes(email);
}
