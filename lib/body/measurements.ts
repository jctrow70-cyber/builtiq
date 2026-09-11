/** Body measurement helpers. Canonical storage matches st_profiles: lbs + inches. */

export type UnitsPreference = 'imperial' | 'metric';

export type BodyMeasurementRow = {
  id: string;
  user_id: string;
  measured_on: string;
  weight_lbs: number | null;
  waist_inches: number | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type BodyMeasurementDraft = {
  measured_on: string;
  weight: string;
  waist: string;
  notes?: string;
};

const LB_PER_KG = 2.2046226218;
const IN_PER_CM = 1 / 2.54;

export function weightUnitLabel(units: UnitsPreference): string {
  return units === 'metric' ? 'kg' : 'lb';
}

export function waistUnitLabel(units: UnitsPreference): string {
  return units === 'metric' ? 'cm' : 'in';
}

export function parsePositiveNumber(input: string | number | null | undefined): number | null {
  if (input == null || input === '') return null;
  const n = typeof input === 'number' ? input : Number(String(input).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function toCanonicalWeightLbs(value: number, units: UnitsPreference): number {
  const lbs = units === 'metric' ? value * LB_PER_KG : value;
  return Math.round(lbs * 100) / 100;
}

export function toCanonicalWaistInches(value: number, units: UnitsPreference): number {
  const inches = units === 'metric' ? value * IN_PER_CM : value;
  return Math.round(inches * 100) / 100;
}

export function fromCanonicalWeight(lbs: number | null | undefined, units: UnitsPreference): number | null {
  if (lbs == null || !Number.isFinite(Number(lbs))) return null;
  const n = units === 'metric' ? Number(lbs) / LB_PER_KG : Number(lbs);
  return Math.round(n * 10) / 10;
}

export function fromCanonicalWaist(inches: number | null | undefined, units: UnitsPreference): number | null {
  if (inches == null || !Number.isFinite(Number(inches))) return null;
  const n = units === 'metric' ? Number(inches) / IN_PER_CM : Number(inches);
  return Math.round(n * 10) / 10;
}

export function formatWeight(lbs: number | null | undefined, units: UnitsPreference): string {
  const v = fromCanonicalWeight(lbs, units);
  return v == null ? '—' : `${v} ${weightUnitLabel(units)}`;
}

export function formatWaist(inches: number | null | undefined, units: UnitsPreference): string {
  const v = fromCanonicalWaist(inches, units);
  return v == null ? '—' : `${v} ${waistUnitLabel(units)}`;
}

export function draftToCanonical(
  draft: BodyMeasurementDraft,
  units: UnitsPreference
): { measured_on: string; weight_lbs: number | null; waist_inches: number | null; notes: string | null } | null {
  const measured_on = String(draft.measured_on || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(measured_on)) return null;

  const weightInput = parsePositiveNumber(draft.weight);
  const waistInput = parsePositiveNumber(draft.waist);
  if (weightInput == null && waistInput == null) return null;

  return {
    measured_on,
    weight_lbs: weightInput == null ? null : toCanonicalWeightLbs(weightInput, units),
    waist_inches: waistInput == null ? null : toCanonicalWaistInches(waistInput, units),
    notes: draft.notes?.trim() ? draft.notes.trim() : null,
  };
}

/** Merge a new check-in into an existing same-day row (blank fields keep prior values). */
export function mergeMeasurement(
  existing: BodyMeasurementRow | null | undefined,
  next: { measured_on: string; weight_lbs: number | null; waist_inches: number | null; notes: string | null }
): { measured_on: string; weight_lbs: number | null; waist_inches: number | null; notes: string | null } {
  return {
    measured_on: next.measured_on,
    weight_lbs: next.weight_lbs ?? existing?.weight_lbs ?? null,
    waist_inches: next.waist_inches ?? existing?.waist_inches ?? null,
    notes: next.notes ?? existing?.notes ?? null,
  };
}

export function latestWithWeight(rows: BodyMeasurementRow[]): BodyMeasurementRow | null {
  return rows.find((r) => r.weight_lbs != null) || null;
}

export function latestWithWaist(rows: BodyMeasurementRow[]): BodyMeasurementRow | null {
  return rows.find((r) => r.waist_inches != null) || null;
}

export function deltaLabel(
  current: number | null | undefined,
  previous: number | null | undefined,
  units: UnitsPreference,
  kind: 'weight' | 'waist'
): string | null {
  if (current == null || previous == null) return null;
  const cur = kind === 'weight' ? fromCanonicalWeight(current, units) : fromCanonicalWaist(current, units);
  const prev = kind === 'weight' ? fromCanonicalWeight(previous, units) : fromCanonicalWaist(previous, units);
  if (cur == null || prev == null) return null;
  const diff = Math.round((cur - prev) * 10) / 10;
  if (diff === 0) return 'No change';
  const unit = kind === 'weight' ? weightUnitLabel(units) : waistUnitLabel(units);
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff} ${unit}`;
}
