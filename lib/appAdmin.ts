import type { User } from '@supabase/supabase-js';

/** Comma-separated platform admin emails (server env only). */
export function getAppAdminEmails(): string[] {
  const raw =
    process.env.BUILDIQ_ADMIN_EMAILS ||
    process.env.BUILDIQ_CATALOG_ADMIN_EMAILS ||
    process.env.BUILD_IQ_CATALOG_ADMIN_EMAILS ||
    process.env.BUILTIQ_CATALOG_ADMIN_EMAILS ||
    '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAppAdmin(user: Pick<User, 'email'> | null | undefined): boolean {
  const email = String(user?.email || '')
    .trim()
    .toLowerCase();
  if (!email) return false;
  const allowlist = getAppAdminEmails();
  if (!allowlist.length) return false;
  return allowlist.includes(email);
}

/** Recipients for new bug report email alerts. Falls back to platform admin emails. */
export function getBugReportNotifyEmails(): string[] {
  const raw = process.env.BUILDIQ_BUG_REPORT_NOTIFY_EMAILS || process.env.BUILDIQ_ADMIN_EMAILS || '';
  const explicit = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (explicit.length) return explicit;
  return getAppAdminEmails();
}
