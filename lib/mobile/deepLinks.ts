/**
 * MOB-01 — deep-link handling seam.
 *
 * Group invites already use `/invite/[token]` on web.
 * Native Universal Links / App Links wiring is deferred to MOB-02+.
 */

export type DeepLinkHandler = (url: string) => void;

let handler: DeepLinkHandler | null = null;
let started = false;

export function setDeepLinkHandler(next: DeepLinkHandler | null): void {
  handler = next;
}

export function parseBuildIqDeepLink(url: string): { path: string; token?: string } | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname || '/';
    const inviteMatch = path.match(/^\/invite\/([^/]+)\/?$/);
    if (inviteMatch) {
      return { path, token: decodeURIComponent(inviteMatch[1]) };
    }
    return { path };
  } catch {
    return null;
  }
}

/**
 * Start listening for Capacitor App `appUrlOpen` when the plugin is present.
 * No-op on web or when @capacitor/app is unavailable.
 */
export async function startDeepLinkListener(): Promise<void> {
  if (started || typeof window === 'undefined') return;
  started = true;
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('appUrlOpen', (event) => {
      const url = String(event?.url || '');
      if (!url || !handler) return;
      handler(url);
    });
  } catch {
    // Plugin absent or not in a native runtime — safe to ignore in MOB-01.
  }
}
