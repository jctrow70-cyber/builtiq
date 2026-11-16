import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * MOB-01 / BIQ-0325 — Capacitor foundation (development bridge only).
 *
 * Remote server.url is an initial WebView bridge, not the permanent architecture.
 * Prefer BUILDIQ_MOBILE_SERVER_URL or mobile/dev-target.json (gitignored).
 * Never default to production (builtiq-duf7.vercel.app / live Supabase).
 */

type DevTarget = {
  serverUrl?: string;
  notes?: string;
};

function readDevTarget(): DevTarget | null {
  const path = join(__dirname, 'mobile', 'dev-target.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as DevTarget;
  } catch {
    return null;
  }
}

function resolveServerUrl(): string | undefined {
  const fromEnv = String(process.env.BUILDIQ_MOBILE_SERVER_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const fromFile = String(readDevTarget()?.serverUrl || '').trim();
  if (fromFile) return fromFile.replace(/\/$/, '');

  return undefined;
}

const serverUrl = resolveServerUrl();

const config: CapacitorConfig = {
  // Development-only identifiers until product/store IDs are approved.
  appId: 'com.buildiq.health.dev',
  appName: 'BuildIQ Health Dev',
  webDir: 'mobile/www',
  server: {
    // When unset, the shell loads local mobile/www (stub). Set a Preview / test
    // deployment URL for the authorized MOB-01 remote bridge.
    ...(serverUrl ? { url: serverUrl, cleartext: false } : {}),
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    App: {
      // Deep-link scheme reserved for future Universal Links / App Links (MOB-02+).
    },
  },
};

export default config;
