/** Planned set types stored on st_planned_sets.set_type */
export type SetTypeValue = 'warmup' | 'working' | 'backoff' | 'dropset' | 'amrap';

export type SetTypeDef = {
  value: SetTypeValue;
  acronym: string;
  label: string;
};

export const SET_TYPES: SetTypeDef[] = [
  { value: 'warmup', acronym: 'WU', label: 'Warm-up' },
  { value: 'working', acronym: 'WK', label: 'Working' },
  { value: 'backoff', acronym: 'BO', label: 'Backoff' },
  { value: 'dropset', acronym: 'DS', label: 'Drop Set' },
  { value: 'amrap', acronym: 'AMRAP', label: 'As Many Reps As Possible' },
];

export function setTypeAcronym(value: string): string {
  return SET_TYPES.find((t) => t.value === value)?.acronym ?? value;
}

export function setTypeLabel(value: string): string {
  return SET_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function normalizeSetType(value: string): SetTypeValue {
  const hit = SET_TYPES.find((t) => t.value === value);
  return hit?.value ?? 'working';
}
