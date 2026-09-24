import { countWorkingSets, inferLoadMode, prescriptionRange, currentLoadOf, isWorkingRole } from './countedSets';
import { classifyRir, COMPARABLE_LOOKBACK_DAYS, COMPARABLE_MAX_EXPOSURES, type EffortClass } from './reasonCodes';
import type { ExerciseExposureInput } from './inputs';
import type { CountedWorkingSet } from './countedSets';

export type ComparableExposure = {
  log_date: string;
  catalog_exercise_id: string | null;
  exercise_name: string;
  measurement_type: string;
  laterality: string;
  load: number | null;
  load_mode: string;
  rep_min: number | null;
  rep_max: number | null;
  target_rir: number | null;
  counted: CountedWorkingSet[];
  all_top: boolean;
  any_below_min: boolean;
  majority_below_min: boolean;
  all_in_range: boolean;
  missing_rir: boolean;
  rir_compatible: boolean | null;
  rir_excessive: boolean;
  rir_underchallenged: boolean;
  effort: EffortClass;
  could_not_complete: boolean;
};

function normalizeName(name?: string | null): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function daysBetween(a: string, b: string): number {
  const da = Date.parse(String(a).slice(0, 10));
  const db = Date.parse(String(b).slice(0, 10));
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 0;
  return Math.abs(da - db) / 86400000;
}

function rangesOverlap(a: { min: number | null; max: number | null }, b: { min: number | null; max: number | null }): boolean {
  if (a.min == null || a.max == null || b.min == null || b.max == null) return true;
  return !(a.max < b.min - 2 || b.max < a.min - 2);
}

export function exposuresAreComparable(current: ExerciseExposureInput, other: ExerciseExposureInput): boolean {
  if (!isWorkingRole(other.program_role || other.sets?.[0]?.snapshot_program_role)) return false;
  if (!isWorkingRole(current.program_role || current.sets?.[0]?.snapshot_program_role)) return false;

  const curCat = current.catalog_exercise_id || current.sets?.[0]?.snapshot_catalog_exercise_id || null;
  const otherCat = other.catalog_exercise_id || other.sets?.[0]?.snapshot_catalog_exercise_id || null;
  if (curCat && otherCat) {
    if (curCat !== otherCat) return false;
  } else if (normalizeName(current.exercise_name) !== normalizeName(other.exercise_name) || !normalizeName(current.exercise_name)) {
    return false;
  }

  const curMeas = String(current.measurement_type || 'reps').toLowerCase();
  const otherMeas = String(other.measurement_type || 'reps').toLowerCase();
  if (curMeas !== otherMeas) return false;

  const curLat = String(current.laterality || '').toLowerCase();
  const otherLat = String(other.laterality || '').toLowerCase();
  if (curLat && otherLat && curLat !== otherLat) return false;

  return rangesOverlap(prescriptionRange(current), prescriptionRange(other));
}

export function sessionEffort(counted: CountedWorkingSet[], targetRir: number | null): EffortClass {
  if (targetRir == null) return 'unknown';
  const known = counted.filter((s) => s.rir != null);
  if (!known.length) return 'unknown';
  const bands = known.map((s) => classifyRir(Number(s.rir), targetRir));
  const allExcessive = bands.every((b) => b === 'excessive');
  const allEasy = bands.every((b) => b === 'underchallenged');
  const allCompatible = bands.every((b) => b === 'compatible');
  if (allExcessive) return 'excessive';
  if (allEasy && known.length === counted.length) return 'underchallenged';
  if (allCompatible) return 'compatible';
  if (bands.some((b) => b === 'excessive')) return 'mixed';
  return 'compatible';
}

export function summarizeExposure(exposure: ExerciseExposureInput, _rirTolerance?: number): ComparableExposure {
  const counted = countWorkingSets(exposure).counted;
  const range = prescriptionRange(exposure);
  const effort = sessionEffort(counted, range.targetRir);
  const knownRir = counted.filter((s) => s.rir != null);
  const rirExcessive = effort === 'excessive' || (range.targetRir != null && knownRir.some((s) => classifyRir(Number(s.rir), range.targetRir) === 'excessive'));
  const rirUnderchallenged = effort === 'underchallenged';
  const rirCompatible = effort === 'compatible' ? true : range.targetRir == null || !knownRir.length ? null : false;
  const allTop = !!range.max && counted.length > 0 && counted.every((s) => s.reps >= range.max);
  const anyBelow = range.min != null && counted.some((s) => s.reps < range.min);
  const belowCount = range.min != null ? counted.filter((s) => s.reps < range.min).length : 0;
  return {
    log_date: exposure.log_date,
    catalog_exercise_id: exposure.catalog_exercise_id || exposure.sets?.[0]?.snapshot_catalog_exercise_id || null,
    exercise_name: exposure.exercise_name || '',
    measurement_type: String(exposure.measurement_type || 'reps'),
    laterality: String(exposure.laterality || ''),
    load: currentLoadOf(counted),
    load_mode: inferLoadMode(exposure, counted),
    rep_min: range.min,
    rep_max: range.max,
    target_rir: range.targetRir,
    counted,
    all_top: allTop,
    any_below_min: !!anyBelow,
    majority_below_min: counted.length > 0 && belowCount > counted.length / 2,
    all_in_range: range.min != null && counted.length > 0 && counted.every((s) => s.reps >= range.min),
    missing_rir: counted.length > 0 && counted.some((s) => s.rir == null),
    rir_compatible: rirCompatible,
    rir_excessive: rirExcessive,
    rir_underchallenged: rirUnderchallenged,
    effort,
    could_not_complete: exposure.attempt_outcome === 'could_not_complete',
  };
}

export function selectComparableHistory(
  current: ExerciseExposureInput,
  history: ExerciseExposureInput[] | undefined,
  _rirTolerance?: number
): ComparableExposure[] {
  const currentKey = `${String(current.log_date).slice(0, 10)}|${current.catalog_exercise_id || current.exercise_name || ''}`;
  const rows = (history || [])
    .filter((row) => {
      const key = `${String(row.log_date).slice(0, 10)}|${row.catalog_exercise_id || row.exercise_name || ''}`;
      return key !== currentKey && exposuresAreComparable(current, row);
    })
    .filter((row) => daysBetween(current.log_date, row.log_date) <= COMPARABLE_LOOKBACK_DAYS)
    .sort((a, b) => String(b.log_date).localeCompare(String(a.log_date)))
    .slice(0, COMPARABLE_MAX_EXPOSURES)
    .map((row) => summarizeExposure(row));
  return rows;
}

export function sameLoadContext(a: number | null, b: number | null, increment: number): boolean {
  if (a == null || b == null) return a === b;
  const slack = increment > 0 ? increment / 2 : 0.5;
  return Math.abs(a - b) <= slack;
}
