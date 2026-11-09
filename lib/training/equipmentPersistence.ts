/**
 * Program equipment stays on the planned exercise.
 * A blank later week inherits an earlier explicit assignment for that same day.
 * A later week that already names a different implement keeps it.
 * A series with no planned implement can take the newest confirmed set snapshot.
 * Set-log rows are never rewritten here.
 */
import { canonicalEquipment } from './equipmentIdentity';
import { compatibleEquipmentOptions } from './exerciseEquipment';
import { catalogHistoryAliasKeys, sharedCatalogAliasIndex } from './catalogDedupe';
import { parseProvenance } from '../progress/provenance';

export type EquipmentProgramExercise = {
  workoutId: string;
  exerciseId: string;
  week: number;
  dayOrder: number;
  dayLabel: string;
  catalogExerciseId: string;
  name: string;
  sortOrder: number | null;
  section: string;
  equipment: string;
};

export function equipmentIsBlank(value?: string | null): boolean {
  return !String(value || '').trim();
}

/** Hidden scope still follows the program. A visible "Just today" choice stays on this workout. */
export function equipmentEditScope(input: {
  applyScope: 'current' | 'future';
  scopeControlVisible: boolean;
}): 'current' | 'future' {
  if (input.scopeControlVisible && input.applyScope === 'current') return 'current';
  return 'future';
}

/**
 * Store an implement the plan named, or the only legal catalog implement.
 * A multi-implement card with no named implement stays blank. History is not an input.
 */
export function assignedEquipmentForInsert(input: {
  assigned?: string | null;
  catalogItem?: any;
}): string {
  const options = compatibleEquipmentOptions(input.catalogItem);
  const assigned = String(input.assigned || '').trim();
  if (assigned) {
    const key = canonicalEquipment(assigned).key;
    return options.find((option) => canonicalEquipment(option).key === key) || assigned;
  }
  return options.length === 1 ? options[0] : '';
}

/**
 * Current row takes the athlete's choice.
 * A blank later row inherits it.
 * A later row still on the previous implement moves with the choice.
 * A later row that already names a different implement is left alone.
 */
export function equipmentWriteForTarget(input: {
  selected: string;
  previousEquipment?: string | null;
  targetEquipment?: string | null;
  isCurrent: boolean;
}): { write: boolean; equipment: string } {
  const selected = String(input.selected || '').trim();
  if (!selected) return { write: false, equipment: '' };
  const target = String(input.targetEquipment || '').trim();
  if (input.isCurrent) return { write: true, equipment: selected };
  if (!target) return { write: true, equipment: selected };
  const selectedKey = canonicalEquipment(selected).key;
  const targetKey = canonicalEquipment(target).key;
  if (targetKey === selectedKey) return { write: false, equipment: target };
  const previous = String(input.previousEquipment || '').trim();
  if (previous && canonicalEquipment(previous).key === targetKey) return { write: true, equipment: selected };
  return { write: false, equipment: target };
}

function sameDay(a: EquipmentProgramExercise, b: EquipmentProgramExercise): boolean {
  return a.dayOrder === b.dayOrder && a.dayLabel === b.dayLabel;
}

function duplicateCatalogOnWorkout(row: EquipmentProgramExercise, all: EquipmentProgramExercise[]): boolean {
  if (!row.catalogExerciseId) return false;
  return all.some(
    (other) =>
      other.workoutId === row.workoutId &&
      other.exerciseId !== row.exerciseId &&
      other.section === row.section &&
      other.catalogExerciseId === row.catalogExerciseId
  );
}

function samePlannedExercise(
  row: EquipmentProgramExercise,
  other: EquipmentProgramExercise,
  all: EquipmentProgramExercise[]
): boolean {
  if (!sameDay(row, other) || row.section !== other.section) return false;
  if (row.catalogExerciseId && other.catalogExerciseId) {
    if (row.catalogExerciseId !== other.catalogExerciseId) return false;
    if (duplicateCatalogOnWorkout(row, all) || duplicateCatalogOnWorkout(other, all)) {
      return row.sortOrder != null && row.sortOrder === other.sortOrder;
    }
    return true;
  }
  if (row.catalogExerciseId || other.catalogExerciseId) return false;
  return row.name.trim().toLowerCase() === other.name.trim().toLowerCase() && row.sortOrder === other.sortOrder;
}

/** Blank planned rows only. The nearest earlier explicit program assignment wins. Snapshots are not read. */
export function blankExercisesInheritingProgramEquipment(
  rows: EquipmentProgramExercise[]
): Array<{ workoutId: string; exerciseId: string; equipment: string }> {
  const fills: Array<{ workoutId: string; exerciseId: string; equipment: string }> = [];
  rows.forEach((row) => {
    if (!equipmentIsBlank(row.equipment)) return;
    const earlier = rows
      .filter(
        (other) =>
          other.week < row.week &&
          !equipmentIsBlank(other.equipment) &&
          samePlannedExercise(row, other, rows)
      )
      .sort((a, b) => b.week - a.week || String(b.exerciseId).localeCompare(String(a.exerciseId)));
    const nearestWeek = earlier[0]?.week;
    if (nearestWeek == null) return;
    const hits = earlier.filter((other) => other.week === nearestWeek);
    if (hits.length !== 1) return;
    fills.push({
      workoutId: row.workoutId,
      exerciseId: row.exerciseId,
      equipment: String(hits[0].equipment).trim(),
    });
  });
  return fills;
}

export type EquipmentHistoryRow = {
  id?: string | null;
  user_id?: string | null;
  log_date?: string | null;
  updated_at?: string | null;
  completed?: boolean | null;
  snapshot_catalog_exercise_id?: string | null;
  snapshot_exercise_name?: string | null;
  snapshot_equipment?: string | null;
  snapshot_provenance?: unknown;
  st_planned_sets?: {
    st_exercises?: {
      catalog_exercise_id?: string | null;
      name?: string | null;
    } | null;
  } | null;
};

function ymd(value: unknown): string {
  return String(value || '').trim().slice(0, 10);
}

function catalogIdsFor(catalog: any[], catalogId?: string | null, name?: string | null): Set<string> {
  const ids = new Set<string>();
  const direct = String(catalogId || '').trim();
  if (direct) ids.add(direct);
  const known = sharedCatalogAliasIndex(catalog).ids;
  catalogHistoryAliasKeys(catalog, catalogId, name).forEach((key) => {
    if (known.has(key) || key === direct) ids.add(key);
  });
  return ids;
}

function sameCatalogExercise(
  catalog: any[],
  currentId: string,
  currentName: string,
  rowId: string,
  rowName: string
): boolean {
  const currentKeys = new Set(catalogHistoryAliasKeys(catalog, currentId, currentName));
  if (!currentKeys.size) return false;
  const rowKeys = catalogHistoryAliasKeys(catalog, rowId, rowName);
  if (!rowKeys.some((key) => currentKeys.has(key))) return false;
  const currentIds = catalogIdsFor(catalog, currentId, currentName);
  const rowIds = catalogIdsFor(catalog, rowId, rowName);
  if (currentIds.size && rowIds.size) return Array.from(currentIds).some((id) => rowIds.has(id));
  return true;
}

function optionLabel(options: string[], equipment: string): string {
  const identity = canonicalEquipment(equipment);
  if (!identity.key || identity.key === 'unspecified') return '';
  if (!options.length) return identity.label;
  return options.find((option) => canonicalEquipment(option).key === identity.key) || '';
}

/**
 * Newest confirmed implement for this exercise before the open session.
 * Backfilled and estimated snapshots are not a selection.
 * The returned label is one of the card's legal options.
 */
export function verifiedSnapshottedEquipment(input: {
  catalog?: any[] | null;
  catalogExerciseId?: string | null;
  exerciseName?: string | null;
  options?: string[] | null;
  sessionDate?: string | null;
  userId?: string | null;
  rows?: EquipmentHistoryRow[] | null;
}): string {
  const catalog = input.catalog || [];
  const currentId = String(input.catalogExerciseId || '').trim();
  const currentName = String(input.exerciseName || '').trim();
  const options = (input.options || []).map((option) => String(option || '').trim()).filter(Boolean);
  const sessionDate = ymd(input.sessionDate);
  const userId = String(input.userId || '').trim();
  const hits = (input.rows || [])
    .flatMap((row) => {
      const rowUser = String(row.user_id || '').trim();
      if (userId && rowUser && rowUser !== userId) return [];
      if (row.completed === false) return [];
      const date = ymd(row.log_date);
      if (!date || (sessionDate && date >= sessionDate)) return [];
      const provenance = parseProvenance(row.snapshot_provenance);
      if (provenance.equipment === 'backfilled' || provenance.equipment === 'estimated') return [];
      if (provenance.equipmentDetail === 'logged_name' || provenance.equipmentDetail === 'single_implement') return [];
      const equipment = String(row.snapshot_equipment || '').trim();
      if (!equipment || canonicalEquipment(equipment).key === 'unspecified') return [];
      const rowId = String(
        row.snapshot_catalog_exercise_id || row.st_planned_sets?.st_exercises?.catalog_exercise_id || ''
      ).trim();
      const rowName = String(row.snapshot_exercise_name || row.st_planned_sets?.st_exercises?.name || '').trim();
      if (!sameCatalogExercise(catalog, currentId, currentName, rowId, rowName)) return [];
      const label = optionLabel(options, equipment);
      if (!label) return [];
      return [{
        label,
        date,
        updatedAt: String(row.updated_at || '').trim(),
        id: String(row.id || '').trim(),
      }];
    })
    .sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp) return dateCmp;
      const updatedCmp = b.updatedAt.localeCompare(a.updatedAt);
      if (updatedCmp) return updatedCmp;
      return b.id.localeCompare(a.id);
    });
  return hits[0]?.label || '';
}

function seriesHasExplicitEquipment(row: EquipmentProgramExercise, rows: EquipmentProgramExercise[]): boolean {
  return rows.some(
    (other) =>
      other.exerciseId !== row.exerciseId &&
      !equipmentIsBlank(other.equipment) &&
      samePlannedExercise(row, other, rows)
  );
}

/**
 * Blank rows whose planned series names no implement.
 * An explicit Dumbbell week blocks a Machine snapshot from filling the blanks.
 */
export function blankExercisesInheritingVerifiedEquipment(
  rows: EquipmentProgramExercise[],
  verifiedEquipment: (row: EquipmentProgramExercise) => string
): Array<{ workoutId: string; exerciseId: string; equipment: string }> {
  const fills: Array<{ workoutId: string; exerciseId: string; equipment: string }> = [];
  rows.forEach((row) => {
    if (!equipmentIsBlank(row.equipment)) return;
    if (seriesHasExplicitEquipment(row, rows)) return;
    const equipment = String(verifiedEquipment(row) || '').trim();
    if (!equipment) return;
    fills.push({ workoutId: row.workoutId, exerciseId: row.exerciseId, equipment });
  });
  return fills;
}

/** Stored implement, then an earlier planned assignment, then a confirmed snapshot. */
export function restoredEquipmentForExercise(input: {
  exerciseId: string;
  rows: EquipmentProgramExercise[];
  verifiedEquipment?: string | null;
}): string {
  const stored = input.rows.find((row) => row.exerciseId === input.exerciseId);
  if (stored && !equipmentIsBlank(stored.equipment)) return stored.equipment;
  const fromProgram = blankExercisesInheritingProgramEquipment(input.rows).find(
    (fill) => fill.exerciseId === input.exerciseId
  );
  if (fromProgram) return fromProgram.equipment;
  const fromHistory = blankExercisesInheritingVerifiedEquipment(input.rows, () => input.verifiedEquipment || '').find(
    (fill) => fill.exerciseId === input.exerciseId
  );
  return fromHistory?.equipment || '';
}

export function equipmentRowsFromProgram(
  program: { st_workouts?: any[] | null } | null | undefined,
  sectionOf: (exercise: any) => string
): EquipmentProgramExercise[] {
  const rows: EquipmentProgramExercise[] = [];
  (program?.st_workouts || []).forEach((workout: any) => {
    const workoutId = String(workout?.id || '').trim();
    if (!workoutId) return;
    (workout?.st_exercises || []).forEach((exercise: any) => {
      const exerciseId = String(exercise?.id || '').trim();
      if (!exerciseId) return;
      const sort = exercise?.sort_order;
      rows.push({
        workoutId,
        exerciseId,
        week: Number(workout?.week) || 0,
        dayOrder: Number(workout?.day_order) || 0,
        dayLabel: String(workout?.day_label || '').trim(),
        catalogExerciseId: String(exercise?.catalog_exercise_id || '').trim(),
        name: String(exercise?.name || '').trim(),
        sortOrder: sort == null || String(sort).trim() === '' ? null : Number(sort),
        section: sectionOf(exercise),
        equipment: String(exercise?.equipment || '').trim(),
      });
    });
  });
  return rows;
}
