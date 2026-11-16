/**
 * MOB-01 — registry for future native services (HealthKit, Health Connect, push).
 * Implementations are intentionally empty until later milestones.
 */

export type NativeServiceId = 'healthkit' | 'healthConnect' | 'push' | 'camera';

export type NativeServiceStatus = {
  id: NativeServiceId;
  available: boolean;
  reason: string;
};

const FUTURE_SERVICES: NativeServiceStatus[] = [
  { id: 'healthkit', available: false, reason: 'Deferred past MOB-01' },
  { id: 'healthConnect', available: false, reason: 'Deferred past MOB-01' },
  { id: 'push', available: false, reason: 'Deferred past MOB-01' },
  { id: 'camera', available: false, reason: 'Web camera path remains; native plugin later' },
];

export function listNativeServiceStatuses(): NativeServiceStatus[] {
  return FUTURE_SERVICES.map((row) => ({ ...row }));
}

export function getNativeServiceStatus(id: NativeServiceId): NativeServiceStatus {
  const found = FUTURE_SERVICES.find((row) => row.id === id);
  return found
    ? { ...found }
    : { id, available: false, reason: 'Unknown service' };
}
