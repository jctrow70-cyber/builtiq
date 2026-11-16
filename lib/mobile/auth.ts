/**
 * MOB-01 — authentication integration seam for native shells.
 *
 * Today auth remains the existing Supabase browser client in lib/supabaseClient.ts.
 * This module reserves a place for Capacitor Preferences / Secure Storage without
 * changing session persistence or workout completion logic.
 */

export type MobileAuthAdapter = {
  /** Optional native-backed persistence key namespace. */
  storageNamespace: string;
  /** Reserved for MOB-02+: secure token mirror. */
  supportsSecureStorage: boolean;
};

export const defaultMobileAuthAdapter: MobileAuthAdapter = {
  storageNamespace: 'buildiq.auth.dev',
  supportsSecureStorage: false,
};

export function getMobileAuthAdapter(): MobileAuthAdapter {
  return defaultMobileAuthAdapter;
}
