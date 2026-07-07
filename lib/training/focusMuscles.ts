export const FOCUS_MUSCLES = [
  'Chest',
  'Hamstrings',
  'Quads',
  'Lats',
  'Traps',
  'Shoulders',
  'Glutes',
  'Arms',
  'Core',
] as const;

export type FocusMuscle = (typeof FOCUS_MUSCLES)[number];

export const FOCUS_WEEKLY_SETS = { min: 10, max: 15, perSession: 3 };

/** Maps focus label to catalog muscle_group substring matches */
export const FOCUS_ALIASES: Record<string, string[]> = {
  Chest: ['chest', 'upper chest', 'pec'],
  Hamstrings: ['hamstring', 'hamstrings'],
  Quads: ['quad', 'quads'],
  Lats: ['lat', 'lats'],
  Traps: ['trap', 'traps', 'upper back'],
  Shoulders: ['shoulder', 'delts', 'rear delts', 'side delts'],
  Glutes: ['glute', 'glutes'],
  Arms: ['bicep', 'tricep', 'arms', 'forearm'],
  Core: ['core', 'abs', 'abdominal'],
};

export function catalogMatchesFocus(muscleGroup: string, focus: string): boolean {
  const mg = String(muscleGroup || '').toLowerCase();
  const aliases = FOCUS_ALIASES[focus] || [focus.toLowerCase()];
  return aliases.some((a) => mg.includes(a));
}

export function pickCatalogForFocus(catalog: any[], focus: string, limit = 2): any[] {
  return (catalog || [])
    .filter((c) => !c.is_archived && c.category === 'strength' && catalogMatchesFocus(c.muscle_group, focus))
    .slice(0, limit);
}

export function focusVolumeSummary(focusMuscles: string[], weeks: number, daysPerWeek: number): string {
  if (!focusMuscles.length) return '';
  const setsPerWeek = Math.min(FOCUS_WEEKLY_SETS.max, FOCUS_WEEKLY_SETS.min + 2);
  return focusMuscles
    .map((f) => `${f} (~${setsPerWeek} working sets/week)`)
    .join(' · ');
}
