/** Filter catalog exercises by user-available equipment */

export const EQUIPMENT_OPTIONS = [
  { id: 'full_gym', label: 'Full gym' },
  { id: 'barbell', label: 'Barbell' },
  { id: 'dumbbell', label: 'Dumbbell' },
  { id: 'cable', label: 'Cable' },
  { id: 'machine', label: 'Machines' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'bands', label: 'Bands' },
  { id: 'pull-up bar', label: 'Pull-up bar' },
  { id: 'bench', label: 'Bench' },
  { id: 'medicine ball', label: 'Medicine ball' },
  { id: 'bodyweight', label: 'Bodyweight' },
] as const;

export function normalizeEquipmentList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean);
}

export function hasEquipmentFilter(selected?: string[] | null): boolean {
  const list = normalizeEquipmentList(selected);
  if (!list.length) return false;
  if (list.includes('full_gym')) return false;
  return true;
}

/** Bodyweight / empty equipment always allowed (warmup, stretches). */
function isUniversalEquipment(eq: string): boolean {
  return !eq || eq === 'bodyweight' || eq === 'none' || eq === 'other';
}

export function exerciseMatchesEquipment(item: any, selected: string[]): boolean {
  const list = normalizeEquipmentList(selected);
  if (!list.length || list.includes('full_gym')) return true;

  const eq = String(item?.equipment || '').toLowerCase().trim();
  const compatible = Array.isArray(item?.coaching_metadata?.compatible_equipment)
    ? item.coaching_metadata.compatible_equipment.map((x: unknown) => String(x || '').toLowerCase())
    : [];
  const pool = [eq, ...compatible].filter(Boolean);
  if (pool.some((value: string) => isUniversalEquipment(value))) return true;

  return list.some((sel) => {
    const s = sel.toLowerCase();
    if (s === 'machine') return pool.some((value: string) => value.includes('machine') || value.includes('smith'));
    if (s === 'cable') return pool.some((value: string) => value.includes('cable'));
    if (s === 'pull-up bar') return pool.some((value: string) => value.includes('pull') || value.includes('chin'));
    if (s === 'medicine ball') return pool.some((value: string) => value.includes('medicine') || value.includes('med ball'));
    if (s === 'bands') return pool.some((value: string) => value.includes('band'));
    return pool.some((value: string) => value.includes(s) || s.includes(value));
  });
}

export function filterCatalogByEquipment(items: any[], selected?: string[] | null): any[] {
  if (!hasEquipmentFilter(selected)) return items || [];
  const list = normalizeEquipmentList(selected);
  return (items || []).filter((item) => exerciseMatchesEquipment(item, list));
}

export function equipmentFilterLabel(selected?: string[] | null): string {
  const list = normalizeEquipmentList(selected);
  if (!list.length || list.includes('full_gym')) return 'Full gym (no equipment filter)';
  return list
    .map((id) => EQUIPMENT_OPTIONS.find((o) => o.id === id)?.label || id)
    .join(' · ');
}
