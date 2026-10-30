/**
 * BIQ-0271 Phase E2.3 — History labels and Current/All equipment filter.
 * Uses E2.1 snapshot identity. Does not change Copy last or persistence.
 */
import { seriesIdentityFromParts, UNSPECIFIED_EQUIPMENT } from '../progress/identity';
import { setTypeAcronym } from './setTypes';
import type { ExerciseSessionEntry, ExerciseSessionSet } from './exerciseSessionHistory';

export type HistoryEquipmentFilter = 'current' | 'all';

export type HistoryEquipmentKind = 'verified' | 'unknown' | 'different';

export function historySetTypeLabel(set: Pick<ExerciseSessionSet, 'setType' | 'setNumber' | 'extra'>): string {
  const raw = String(set.setType || 'working').trim().toLowerCase() || 'working';
  const n = Number(set.setNumber) || 1;
  const core = raw === 'warmup'
    ? `WU ${n}`
    : raw === 'ramp'
      ? `Ramp ${n}`
      : raw === 'backoff'
        ? `Backoff ${n}`
        : raw === 'working'
          ? `WK ${n}`
          : `${setTypeAcronym(raw)} ${n}`;
  return set.extra ? `Extra ${core}` : core;
}

export function historySetEquipmentKind(
  set: Pick<ExerciseSessionSet, 'equipmentKey' | 'equipmentVerified'>,
  currentEquipment?: string | null,
): HistoryEquipmentKind {
  if (!set.equipmentVerified) return 'unknown';
  const currentKey = seriesIdentityFromParts({ equipment: currentEquipment }).equipmentKey;
  if (currentKey === UNSPECIFIED_EQUIPMENT) return 'different';
  if (set.equipmentKey === currentKey) return 'verified';
  return 'different';
}

export function historySetEquipmentText(set: Pick<ExerciseSessionSet, 'equipmentLabel' | 'equipmentVerified'>): string {
  return set.equipmentVerified ? String(set.equipmentLabel || 'Unknown') : 'Unknown';
}

export function filterExerciseHistorySessions(
  sessions: ExerciseSessionEntry[] | null | undefined,
  input: { mode?: HistoryEquipmentFilter; currentEquipment?: string | null } = {},
): ExerciseSessionEntry[] {
  const mode = input.mode === 'all' ? 'all' : 'current';
  return (sessions || [])
    .map((session) => {
      const sets = (session.sets || []).filter((set) => {
        if (mode === 'all') return true;
        return historySetEquipmentKind(set, input.currentEquipment) === 'verified';
      });
      if (!sets.length) return null;
      return {
        ...session,
        sets,
        sessionSummary: sets.map((set) => set.summary).join(' · '),
      };
    })
    .filter((session): session is ExerciseSessionEntry => !!session);
}

export function historyEmptyMessage(input: {
  mode?: HistoryEquipmentFilter;
  currentEquipment?: string | null;
  allCount?: number;
}): string {
  const mode = input.mode === 'all' ? 'all' : 'current';
  if (mode === 'all') return 'No weekly logs for this exercise on this day yet.';
  const current = seriesIdentityFromParts({ equipment: input.currentEquipment });
  if (current.equipmentKey === UNSPECIFIED_EQUIPMENT) {
    return 'Select equipment to see verified history, or choose All equipment.';
  }
  if ((input.allCount || 0) > 0) {
    return `No verified ${current.equipmentLabel} history yet. Choose All equipment to see other or unknown logs.`;
  }
  return `No verified ${current.equipmentLabel} history yet.`;
}
