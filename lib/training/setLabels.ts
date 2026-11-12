import { isRampEffortSetType } from './setTypes';

export type SetLabelRow = {
  id: string;
  set_type?: string | null;
  set_number?: number | null;
};

/** Next stored set_number for an exercise (avoids colliding with gaps or soft-deletes). */
export function nextPlannedSetNumber(sets: Array<{ set_number?: number | null; is_deleted?: boolean | null }> | null | undefined): number {
  const active = (sets || []).filter((s) => !s.is_deleted);
  if (!active.length) return 1;
  return Math.max(...active.map((s) => Number(s.set_number) || 0)) + 1;
}

export function nextPlannedSortOrder(sets: Array<{ sort_order?: number | null; is_deleted?: boolean | null }> | null | undefined): number {
  const active = (sets || []).filter((s) => !s.is_deleted);
  if (!active.length) return 0;
  return Math.max(...active.map((s) => Number(s.sort_order) || 0)) + 1;
}

/**
 * Visible set label by position within ramp vs working groups.
 * Uses list order (not raw set_number), so duplicate or gapped stored numbers
 * still show Set 1…N / Ramp 1…N without skips or repeats.
 */
export function setDisplayLabel(set: SetLabelRow, all: SetLabelRow[]): string {
  if (isRampEffortSetType(set.set_type)) {
    const ramps = all.filter((s) => isRampEffortSetType(s.set_type));
    const idx = ramps.findIndex((s) => s.id === set.id);
    return `Ramp ${(idx >= 0 ? idx : 0) + 1}`;
  }
  const working = all.filter((s) => !isRampEffortSetType(s.set_type));
  const idx = working.findIndex((s) => s.id === set.id);
  return `Set ${(idx >= 0 ? idx : 0) + 1}`;
}
