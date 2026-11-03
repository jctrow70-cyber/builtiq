/**
 * Internal data-quality labels. The Progress UI should not print these raw values.
 * snapshotted — written when the set was first logged
 * backfilled — filled later by a conservative, explicit rule
 * estimated — copied from the current catalog after the workout
 * unknown — not enough evidence; do not treat as a precise fact
 */
export type DataProvenance = 'snapshotted' | 'backfilled' | 'estimated' | 'unknown';

export type EquipmentBackfillDetail = 'existing' | 'logged_name' | 'single_implement' | 'unspecified';

export type SnapshotProvenance = {
  equipment: DataProvenance;
  equipmentDetail: EquipmentBackfillDetail;
  movementPattern: DataProvenance;
  muscleCredits: DataProvenance;
  variant: DataProvenance;
};

export const UNKNOWN_PROVENANCE: SnapshotProvenance = {
  equipment: 'unknown',
  equipmentDetail: 'unspecified',
  movementPattern: 'unknown',
  muscleCredits: 'unknown',
  variant: 'unknown',
};

/** How sure we are about equipment for a whole series. One confirmed set does not verify the rest. */
export type EquipmentRecord = 'verified' | 'recovered' | 'mixed' | 'unknown';

export function equipmentRecordOf(values: DataProvenance[]): EquipmentRecord {
  if (!values.length) return 'unknown';
  const hasSnapshot = values.some((value) => value === 'snapshotted');
  const hasRecovered = values.some((value) => value === 'backfilled' || value === 'estimated');
  const hasUnknown = values.some((value) => value === 'unknown');
  if (hasSnapshot && (hasRecovered || hasUnknown)) return 'mixed';
  if (hasSnapshot) return 'verified';
  if (hasRecovered) return 'recovered';
  return 'unknown';
}

export function equipmentRecordLabel(record: EquipmentRecord): string | null {
  if (record === 'mixed') return 'Some sessions confirmed this equipment. Others were recovered or not recorded.';
  if (record === 'recovered') return 'Equipment was recovered from older workouts. It was not selected when those sets were logged.';
  if (record === 'unknown') return 'Equipment was not recorded for these sessions.';
  return null;
}

/** Series label used by the strength index. Mixed history is never reported as confirmed. */
export function displayedEquipmentProvenance(values: DataProvenance[]): DataProvenance {
  const record = equipmentRecordOf(values);
  if (record === 'verified') return 'snapshotted';
  if (record === 'unknown') return 'unknown';
  if (values.some((value) => value === 'backfilled')) return 'backfilled';
  if (values.some((value) => value === 'estimated')) return 'estimated';
  return 'unknown';
}

export function provenanceRank(value: DataProvenance): number {
  if (value === 'snapshotted') return 3;
  if (value === 'backfilled') return 2;
  if (value === 'estimated') return 1;
  return 0;
}

export function parseProvenance(raw: unknown): SnapshotProvenance {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const equipment = asProvenance(row.equipment);
  const detail = asEquipmentDetail(row.equipmentDetail);
  return {
    equipment,
    equipmentDetail: detail || (equipment === 'unknown' ? 'unspecified' : equipment === 'snapshotted' ? 'existing' : 'unspecified'),
    movementPattern: asProvenance(row.movementPattern),
    muscleCredits: asProvenance(row.muscleCredits),
    variant: asProvenance(row.variant),
  };
}

function asProvenance(value: unknown): DataProvenance {
  if (value === 'snapshotted' || value === 'backfilled' || value === 'estimated' || value === 'unknown') return value;
  return 'unknown';
}

function asEquipmentDetail(value: unknown): EquipmentBackfillDetail | null {
  if (value === 'existing' || value === 'logged_name' || value === 'single_implement' || value === 'unspecified') return value;
  return null;
}
