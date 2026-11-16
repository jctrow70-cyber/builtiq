/**
 * MOB-01 — mobile API / host configuration.
 *
 * Web keeps relative `/api/...` same-origin calls.
 * Native bridge (remote server.url) also same-origin to the Preview host.
 * Later local-asset builds will set NEXT_PUBLIC_BUILDIQ_API_BASE_URL to the
 * hosted Vercel origin so APIs stay server-side.
 */

export function getApiBaseUrl(): string {
  const configured = String(process.env.NEXT_PUBLIC_BUILDIQ_API_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return '';
}

/** Join API base with a path that starts with `/`. */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}

export function isMobileBridgeMode(): boolean {
  return String(process.env.NEXT_PUBLIC_BUILDIQ_MOBILE_BRIDGE || '').trim() === '1';
}
