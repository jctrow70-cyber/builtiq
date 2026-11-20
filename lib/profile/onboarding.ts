/** Shared profile onboarding helpers (BIQ-0326). */

export function profileHasDisplayName(profile: { display_name?: string | null } | null | undefined): boolean {
  return Boolean(String(profile?.display_name || '').trim());
}

/**
 * Gate onboarding only when the account truly lacks a usable profile.
 * A non-empty display name counts as onboarded (same rule as the BIQ-0006 backfill),
 * even if profile_completed was never flipped true.
 */
export function profileNeedsSetup(profile: {
  display_name?: string | null;
  profile_completed?: boolean | null;
} | null | undefined): boolean {
  if (!profile) return true;
  if (profile.profile_completed === true) return false;
  if (profileHasDisplayName(profile)) return false;
  return true;
}
