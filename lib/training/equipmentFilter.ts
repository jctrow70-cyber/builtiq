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
  if (isUniversalEquipment(eq)) return true;

  return list.some((sel) => {
    const s = sel.toLowerCase();
    if (s === 'machine') return eq.includes('machine') || eq.includes('smith');
    if (s === 'cable') return eq.includes('cable');
    if (s === 'pull-up bar') return eq.includes('pull') || eq.includes('chin');
    if (s === 'medicine ball') return eq.includes('medicine') || eq.includes('med ball');
    if (s === 'bands') return eq.includes('band');
    return eq.includes(s) || s.includes(eq);
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
