/**
 * BIQ-0271 Phase E2.1 — classify previous set performance for a planned set.
 * Pure library. E2.2 uses this for logger display and Copy last. Science comparable-exposure stays separate.
 *
 * Equipment identity follows Progress (`seriesIdentityFromParts`).
 * Exercise aliases follow `catalogHistoryAliasKeys`.
 * Extra sets follow `isExtraSetLog`.
 */

import { parseProvenance, type SnapshotProvenance } from '../progress/provenance';
import { seriesIdentityFromParts, UNSPECIFIED_EQUIPMENT } from '../progress/identity';
import { catalogHistoryAliasKeys } from './catalogDedupe';
import { isExtraSetLog } from './plannedSetGuard';

export type PreviousPerformanceKind = 'exact' | 'unknown_equipment' | 'different_equipment' | 'none';

/** How exercise identity overlapped. Alias/name overlap is not equipment equivalence. */
export type PreviousPerformanceIdentityMatch = 'catalog' | 'name';

export type PreviousPerformanceHit = {
  kind: Exclude<PreviousPerformanceKind, 'none'>;
  identityMatch: PreviousPerformanceIdentityMatch;
  sourceId: string | null;
  date: string;
  updatedAt: string | null;
  weight: string;
  reps: string;
  setType: string;
  setNumber: number;
  equipment: string;
  equipmentKey: string;
  provenance: SnapshotProvenance;
  teamId: string | null;
};

export type PreviousPerformanceResult = {
  kind: PreviousPerformanceKind;
  comparable: PreviousPerformanceHit | null;
  uncertain: PreviousPerformanceHit | null;
  otherEquipment: PreviousPerformanceHit[];
  copyLastEligible: boolean;
  copyLastSource: PreviousPerformanceHit | null;
};

export type PreviousPerformanceLog = {
  id?: string | null;
  user_id?: string | null;
  team_id?: string | null;
  log_date?: string | null;
  updated_at?: string | null;
  actual_weight?: unknown;
  actual_reps?: unknown;
  actual_duration?: unknown;
  actual_distance?: unknown;
  log_notes?: unknown;
  completed?: boolean | null;
  is_extra_set?: boolean | null;
  set_origin?: string | null;
  extra_set_number?: number | null;
  snapshot_catalog_exercise_id?: string | null;
  snapshot_exercise_name?: string | null;
  snapshot_equipment?: string | null;
  snapshot_set_type?: string | null;
  snapshot_set_number?: number | null;
  snapshot_provenance?: unknown;
  snapshot_variant?: string | null;
  st_planned_sets?: {
    set_type?: string | null;
    set_number?: number | null;
    st_exercises?: {
      name?: string | null;
      catalog_exercise_id?: string | null;
    } | null;
  } | null;
};

export type ClassifyPreviousPerformanceInput = {
  catalog?: any[] | null;
  catalogExerciseId?: string | null;
  exerciseName?: string | null;
  equipment?: string | null;
  setType?: string | null;
  setNumber?: number | null;
  sessionDate: string;
  userId?: string | null;
  rows?: PreviousPerformanceLog[] | null;
};

/** Actual logged values — completed-only rows are not a usable comparison. */
export function previousPerformanceHasValues(row: PreviousPerformanceLog | null | undefined): boolean {
  return !!(
    row &&
    (String(row.actual_weight || '').trim() ||
      String(row.actual_reps || '').trim() ||
      String(row.actual_duration || '').trim() ||
      String(row.actual_distance || '').trim() ||
      String(row.log_notes || '').trim())
  );
}

export function previousPerformanceCopyLastEligible(kind: PreviousPerformanceKind): boolean {
  return kind === 'exact';
}

export function classifyPreviousPerformance(input: ClassifyPreviousPerformanceInput): PreviousPerformanceResult {
  const empty: PreviousPerformanceResult = {
    kind: 'none',
    comparable: null,
    uncertain: null,
    otherEquipment: [],
    copyLastEligible: false,
    copyLastSource: null,
  };
  const sessionDate = ymd(input.sessionDate);
  if (!sessionDate) return empty;

  const catalog = input.catalog || [];
  const currentType = normalizeLoggedSetType(input.setType);
  const currentNumber = Number(input.setNumber ?? 1) || 1;
  const currentEquip = seriesIdentityFromParts({ equipment: input.equipment });
  const currentKeys = identityKeys(catalog, input.catalogExerciseId, input.exerciseName);
  const userId = String(input.userId || '').trim();

  const exact: PreviousPerformanceHit[] = [];
  const uncertain: PreviousPerformanceHit[] = [];
  const other: PreviousPerformanceHit[] = [];

  (input.rows || []).forEach((row) => {
    if (!row || typeof row !== 'object') return;
    if (userId && String(row.user_id || '').trim() && String(row.user_id) !== userId) return;
    if (isExtraSetLog(row)) return;
    if (!previousPerformanceHasValues(row)) return;
    const date = ymd(row.log_date);
    if (!date || date >= sessionDate) return;
    const identityMatch = exerciseIdentityMatch(currentKeys, catalog, input.catalogExerciseId, input.exerciseName, row);
    if (!identityMatch) return;
    if (normalizeLoggedSetType(rowSetType(row)) !== currentType) return;
    if ((Number(rowSetNumber(row)) || 1) !== currentNumber) return;

    const hit = toHit(row, date, currentEquip.equipmentKey, identityMatch);
    if (!hit) return;
    if (hit.kind === 'exact') exact.push(hit);
    else if (hit.kind === 'unknown_equipment') uncertain.push(hit);
    else other.push(hit);
  });

  const comparable = newest(exact);
  const uncertainHit = newest(uncertain);
  const otherEquipment = newestPerEquipment(other);
  const kind: PreviousPerformanceKind = comparable
    ? 'exact'
    : uncertainHit
      ? 'unknown_equipment'
      : otherEquipment.length
        ? 'different_equipment'
        : 'none';

  return {
    kind,
    comparable,
    uncertain: uncertainHit,
    otherEquipment,
    copyLastEligible: previousPerformanceCopyLastEligible(kind),
    copyLastSource: comparable,
  };
}

function ymd(value: unknown): string {
  return String(value || '').trim().slice(0, 10);
}

function identityKeys(catalog: any[], catalogId?: string | null, name?: string | null): Set<string> {
  return new Set(catalogHistoryAliasKeys(catalog, catalogId, name));
}

function rowCatalogId(row: PreviousPerformanceLog): string {
  return String(row.snapshot_catalog_exercise_id || row.st_planned_sets?.st_exercises?.catalog_exercise_id || '').trim();
}

function rowExerciseName(row: PreviousPerformanceLog): string {
  return String(row.snapshot_exercise_name || row.st_planned_sets?.st_exercises?.name || '').trim();
}

function rowSetType(row: PreviousPerformanceLog): string {
  return String(row.snapshot_set_type || row.st_planned_sets?.set_type || 'working');
}

function rowSetNumber(row: PreviousPerformanceLog): number {
  if (row.snapshot_set_number != null && String(row.snapshot_set_number).trim() !== '') {
    return Number(row.snapshot_set_number) || 1;
  }
  if (row.st_planned_sets?.set_number != null) return Number(row.st_planned_sets.set_number) || 1;
  return 1;
}

/** Keep ramp distinct from working. Do not coerce unknown types through `normalizeSetType`. */
function normalizeLoggedSetType(value?: string | null): string {
  const raw = String(value || 'working').trim().toLowerCase();
  return raw || 'working';
}

function catalogIdsFor(catalog: any[], catalogId?: string | null, name?: string | null): Set<string> {
  const ids = new Set<string>();
  const direct = String(catalogId || '').trim();
  if (direct) ids.add(direct);
  const known = new Set((catalog || []).map((item) => String(item?.id || '').trim()).filter(Boolean));
  catalogHistoryAliasKeys(catalog, catalogId, name).forEach((key) => {
    if (known.has(key) || key === direct) ids.add(key);
  });
  return ids;
}

function exerciseIdentityMatch(
  currentKeys: Set<string>,
  catalog: any[],
  catalogId: string | null | undefined,
  exerciseName: string | null | undefined,
  row: PreviousPerformanceLog,
): PreviousPerformanceIdentityMatch | null {
  if (!currentKeys.size) return null;
  const rowId = rowCatalogId(row);
  const rowName = rowExerciseName(row);
  const rowKeys = identityKeys(catalog, rowId, rowName);
  if (!Array.from(rowKeys).some((key) => currentKeys.has(key))) return null;
  const currentIds = catalogIdsFor(catalog, catalogId, exerciseName);
  const rowIds = catalogIdsFor(catalog, rowId, rowName);
  if (Array.from(currentIds).some((id) => rowIds.has(id))) return 'catalog';
  return 'name';
}

function classifyEquipmentKind(
  provenance: SnapshotProvenance,
  equipmentKey: string,
  currentEquipmentKey: string,
): Exclude<PreviousPerformanceKind, 'none'> {
  const currentKnown = currentEquipmentKey !== UNSPECIFIED_EQUIPMENT;
  const rowKnown = equipmentKey !== UNSPECIFIED_EQUIPMENT;
  if (currentKnown && rowKnown && equipmentKey === currentEquipmentKey && provenance.equipment === 'snapshotted') {
    return 'exact';
  }
  if (rowKnown && (!currentKnown || equipmentKey !== currentEquipmentKey)) {
    return 'different_equipment';
  }
  return 'unknown_equipment';
}

function toHit(
  row: PreviousPerformanceLog,
  date: string,
  currentEquipmentKey: string,
  identityMatch: PreviousPerformanceIdentityMatch,
): PreviousPerformanceHit {
  const identity = seriesIdentityFromParts({
    catalogExerciseId: rowCatalogId(row),
    exerciseName: rowExerciseName(row),
    equipment: row.snapshot_equipment,
    variant: row.snapshot_variant,
  });
  const provenance = parseProvenance(row.snapshot_provenance);
  return {
    kind: classifyEquipmentKind(provenance, identity.equipmentKey, currentEquipmentKey),
    identityMatch,
    sourceId: String(row.id || '').trim() || null,
    date,
    updatedAt: String(row.updated_at || '').trim() || null,
    weight: String(row.actual_weight || '').trim(),
    reps: String(row.actual_reps || '').trim(),
    setType: normalizeLoggedSetType(rowSetType(row)),
    setNumber: Number(rowSetNumber(row)) || 1,
    equipment: identity.equipmentLabel,
    equipmentKey: identity.equipmentKey,
    provenance,
    teamId: String(row.team_id || '').trim() || null,
  };
}

function newest(hits: PreviousPerformanceHit[]): PreviousPerformanceHit | null {
  if (!hits.length) return null;
  return [...hits].sort(compareHits)[0];
}

function newestPerEquipment(hits: PreviousPerformanceHit[]): PreviousPerformanceHit[] {
  const byKey = new Map<string, PreviousPerformanceHit>();
  [...hits].sort(compareHits).forEach((hit) => {
    if (!byKey.has(hit.equipmentKey)) byKey.set(hit.equipmentKey, hit);
  });
  return Array.from(byKey.values()).sort(compareHits);
}

function compareHits(a: PreviousPerformanceHit, b: PreviousPerformanceHit): number {
  const dateCmp = String(b.date).localeCompare(String(a.date));
  if (dateCmp) return dateCmp;
  const updatedCmp = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  if (updatedCmp) return updatedCmp;
  return String(b.sourceId || '').localeCompare(String(a.sourceId || ''));
}
