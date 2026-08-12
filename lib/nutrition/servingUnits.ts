export const SERVING_UNIT_OPTIONS = [
  { value: 'serving', label: 'Serving(s)' },
  { value: 'cup', label: 'Cup' },
  { value: 'oz', label: 'oz' },
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'tbsp', label: 'Tbsp' },
  { value: 'tsp', label: 'tsp' },
  { value: 'piece', label: 'Piece' },
  { value: 'slice', label: 'Slice' },
  { value: 'bowl', label: 'Bowl' },
] as const;

export type ServingUnit = (typeof SERVING_UNIT_OPTIONS)[number]['value'];

export function normalizeServingUnit(unit?: string | null): string {
  const value = String(unit || 'serving').trim().toLowerCase();
  return value || 'serving';
}

function formatNumber(value: number): string {
  const n = Number(value) || 0;
  if (n % 1 === 0) return String(Math.round(n));
  return String(Math.round(n * 100) / 100);
}

function pluralizeUnit(unit: string, qty: number): string {
  if (qty === 1) return unit;
  if (unit === 'serving') return 'servings';
  if (unit === 'piece') return 'pieces';
  if (unit === 'slice') return 'slices';
  if (unit === 'bowl') return 'bowls';
  if (unit === 'cup') return 'cups';
  return unit;
}

/** Label for one defined serving, e.g. "1 cup" or "28 g". */
export function formatServingSizeLabel(servingSize: number, unit?: string | null): string {
  const size = Math.max(0.01, Number(servingSize) || 1);
  const u = normalizeServingUnit(unit);
  const amount = formatNumber(size);
  if (u === 'serving') {
    return size === 1 ? '1 serving' : `${amount} servings`;
  }
  return `${amount} ${pluralizeUnit(u, size)}`;
}

/** How much was logged relative to the defined serving size. */
export function formatLoggedServingDisplay(
  amount: number,
  servingSize?: number | null,
  unit?: string | null
): string {
  const qty = Math.max(0.01, Number(amount) || 1);
  const size = Math.max(0.01, Number(servingSize) || 1);
  const u = normalizeServingUnit(unit);

  if (qty === 1 && size === 1 && u === 'serving') return '';

  const sizeLabel = formatServingSizeLabel(size, u);
  if (qty === 1) return sizeLabel;
  return `${formatNumber(qty)} × ${sizeLabel}`;
}

/** @deprecated Use formatLoggedServingDisplay */
export function formatServingDisplay(qty: number, unit?: string | null): string {
  return formatLoggedServingDisplay(qty, 1, unit);
}

export function formatServingLabel(servingSize: number, unit?: string | null): string {
  return formatServingSizeLabel(servingSize, unit);
}

export function effectiveServingAmount(amount: number, servingSize?: number | null): number {
  const qty = Math.max(0.01, Number(amount) || 1);
  const size = Math.max(0.01, Number(servingSize) || 1);
  return parseFloat((qty * size).toFixed(4));
}
