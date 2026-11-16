/**
 * MOB-01 mobile platform abstraction.
 * Keep imports additive; do not duplicate training/business logic here.
 */

import { startDeepLinkListener } from './deepLinks';
import { getNativePlatform, isNativePlatform } from './platform';

export { apiUrl, getApiBaseUrl, isMobileBridgeMode } from './config';
export { defaultMobileAuthAdapter, getMobileAuthAdapter } from './auth';
export {
  parseBuildIqDeepLink,
  setDeepLinkHandler,
  startDeepLinkListener,
} from './deepLinks';
export { getNativeServiceStatus, listNativeServiceStatuses } from './nativeServices';
export { getNativePlatform, isNativePlatform } from './platform';

let initialized = false;

/** Idempotent native bootstrap for the web shell when embedded in Capacitor. */
export async function initMobilePlatform(): Promise<void> {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  if (!isNativePlatform()) return;
  // eslint-disable-next-line no-console
  console.info('[BuildIQ mobile]', getNativePlatform(), 'shell ready (MOB-01)');
  await startDeepLinkListener();
}
