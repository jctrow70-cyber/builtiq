/**
 * Program equipment stays on the planned exercise.
 * A blank later week inherits an earlier explicit assignment for that same day.
 * A later week that already names a different implement keeps it.
 * Set-log snapshots are never a source and are never rewritten here.
 */
import { canonicalEquipment } from './equipmentIdentity';
import { compatibleEquipmentOptions } from './exerciseEquipment';

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
