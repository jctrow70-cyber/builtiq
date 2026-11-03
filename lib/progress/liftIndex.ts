import { seriesIdentityFromParts, seriesKey } from './identity';

export type LiftIndexRow = {
  snapshot_catalog_exercise_id?: string | null;
  snapshot_exercise_name?: string | null;
  snapshot_equipment?: string | null;
  snapshot_variant?: string | null;
  catalog_exercise_id?: string | null;
  exercise_name?: string | null;
  equipment?: string | null;
  variant?: string | null;
  log_date?: string | null;
  last_performed?: string | null;
};

export type LiftDiscovery = {
  key: string;
  catalogExerciseId: string | null;
  exerciseName: string;
  equipment: string;
  equipmentLabel: string;
  variant: string | null;
  lastPerformed: string;
};

/**
 * Folds identity rows into one lift per exercise and equipment.
 * A date range is not applied. Aliases such as DB and Dumbbell stay one history.
 */
export function discoverLifts(rows: LiftIndexRow[]): LiftDiscovery[] {
  const byKey = new Map<string, LiftDiscovery>();
  (rows || []).forEach((row) => {
    const identity = seriesIdentityFromParts({
      catalogExerciseId: row.catalog_exercise_id ?? row.snapshot_catalog_exercise_id,
      exerciseName: row.exercise_name ?? row.snapshot_exercise_name,
      equipment: row.equipment ?? row.snapshot_equipment,
      variant: row.variant ?? row.snapshot_variant,
    });
    const date = String(row.last_performed || row.log_date || '').slice(0, 10);
    if (!identity.exerciseName || !date) return;
    const key = seriesKey(identity);
    const current = byKey.get(key);
    if (current && current.lastPerformed > date) return;
    byKey.set(key, {
      key,
      catalogExerciseId: identity.catalogExerciseId,
      exerciseName: identity.exerciseName,
      equipment: identity.equipmentKey === 'unspecified' ? '' : identity.equipmentLabel,
      equipmentLabel: identity.equipmentLabel,
      variant: identity.variant,
      lastPerformed: date,
    });
  });
  return Array.from(byKey.values()).sort((a, b) => (
    b.lastPerformed.localeCompare(a.lastPerformed)
    || a.exerciseName.localeCompare(b.exerciseName)
    || a.equipmentLabel.localeCompare(b.equipmentLabel)
  ));
}

export function filterLifts(lifts: LiftDiscovery[], query: string): LiftDiscovery[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return lifts;
  return lifts.filter((lift) => `${lift.exerciseName} ${lift.equipmentLabel} ${lift.variant || ''}`.toLowerCase().includes(needle));
}
