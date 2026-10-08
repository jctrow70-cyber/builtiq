import { parseProvenance, type SnapshotProvenance } from './provenance';

/** Missing equipment is its own series. It is never folded into a known implement. */
export const UNSPECIFIED_EQUIPMENT = 'unspecified';

export type SeriesIdentity = {
  catalogExerciseId: string | null;
  exerciseName: string;
  equipmentKey: string;
  equipmentLabel: string;
  variant: string | null;
};

export function seriesKey(identity: SeriesIdentity): string {
  const exercise = identity.catalogExerciseId || `name:${identity.exerciseName.trim().toLowerCase()}`;
  const variant = (identity.variant || '').trim().toLowerCase();
  return `${exercise}|${identity.equipmentKey}|${variant}`;
}

export function seriesIdentityFromParts(input: {
  catalogExerciseId?: string | null;
  exerciseName?: string | null;
  equipment?: string | null;
  variant?: string | null;
}): SeriesIdentity {
  const equipmentLabel = String(input.equipment || '').trim();
  const variant = String(input.variant || '').trim();
  return {
    catalogExerciseId: String(input.catalogExerciseId || '').trim() || null,
    exerciseName: String(input.exerciseName || 'Exercise').trim() || 'Exercise',
    equipmentKey: equipmentLabel ? equipmentLabel.toLowerCase() : UNSPECIFIED_EQUIPMENT,
    equipmentLabel: equipmentLabel || 'Unspecified',
    variant: variant || null,
  };
}

export function seriesIdentityFromLog(row: any): SeriesIdentity {
  return seriesIdentityFromParts({
    catalogExerciseId: row?.snapshot_catalog_exercise_id,
    exerciseName: row?.snapshot_exercise_name,
    equipment: row?.snapshot_equipment,
    variant: row?.snapshot_variant,
  });
}

export function provenanceFromLog(row: any): SnapshotProvenance {
  return parseProvenance(row?.snapshot_provenance);
}

export function displaySeriesName(identity: SeriesIdentity): string {
  const variant = identity.variant ? ` · ${identity.variant}` : '';
  return `${identity.exerciseName} · ${identity.equipmentLabel}${variant}`;
}
