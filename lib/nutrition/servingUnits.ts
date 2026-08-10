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

function pluralizeUnit(unit: string, qty: number): string {
  if (qty === 1) return unit;
  if (unit === 'serving') return 'servings';
  if (unit === 'piece') return 'pieces';
  if (unit === 'slice') return 'slices';
  if (unit === 'bowl') return 'bowls';
  if (unit === 'cup') return 'cups';
  return unit;
}

export function formatServingDisplay(qty: number, unit?: string | null): string {
  const q = Number(qty) || 1;
  const u = normalizeServingUnit(unit);
  if (q === 1 && u === 'serving') return '';
  const amount = q % 1 === 0 ? String(Math.round(q)) : String(q);
  return `${amount} ${pluralizeUnit(u, q)}`;
}

export function formatServingLabel(qty: number, unit?: string | null): string {
  return formatServingDisplay(qty, unit) || '1 serving';
}
