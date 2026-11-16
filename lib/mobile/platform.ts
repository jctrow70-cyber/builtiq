/**
 * MOB-01 — native platform detection.
 * Additive helper for Capacitor WebViews. Safe on plain web.
 */

export type NativePlatform = 'ios' | 'android' | 'web';

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function getCapacitor(): CapacitorBridge | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
  return cap || null;
}

/** True when running inside a Capacitor native shell (iOS/Android). */
export function isNativePlatform(): boolean {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform) return false;
  try {
    return !!cap.isNativePlatform();
  } catch {
    return false;
  }
}

export function getNativePlatform(): NativePlatform {
  if (!isNativePlatform()) return 'web';
  const cap = getCapacitor();
  const raw = String(cap?.getPlatform?.() || '').toLowerCase();
  if (raw === 'ios') return 'ios';
  if (raw === 'android') return 'android';
  return 'web';
}
