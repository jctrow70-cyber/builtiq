import { estimateE1rm, isWorkingSet } from '../training/estimated1Rm';
import { parseNumeric, parseReps } from '../training/progressAnalytics';
import { seriesIdentityFromLog, provenanceFromLog, type SeriesIdentity } from './identity';
import type { SnapshotProvenance } from './provenance';

export type MuscleCredit = { muscle: string; contribution: number };

export type ProgressSetFact = {
  id: string;
  logDate: string;
  completed: boolean;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  rir: number | null;
  setType: string;
  exerciseType: string;
  identity: SeriesIdentity;
  movementPattern: string | null;
  muscleCredits: MuscleCredit[] | null;
  muscleGroupLabel: string | null;
  programRole: string | null;
  provenance: SnapshotProvenance;
};

export function setFactFromRow(row: any): ProgressSetFact {
  const credits = parseCredits(row?.snapshot_muscle_credits);
  return {
    id: String(row?.id || ''),
    logDate: String(row?.log_date || '').slice(0, 10),
    completed: row?.completed === true,
    weight: parseNumeric(row?.actual_weight),
    reps: parseReps(row?.actual_reps),
    rpe: parseNumeric(row?.actual_rpe),
    rir: parseNumeric(row?.actual_rir),
    setType: String(row?.snapshot_set_type || 'working'),
    exerciseType: String(row?.snapshot_exercise_type || 'strength'),
    identity: seriesIdentityFromLog(row),
    movementPattern: String(row?.snapshot_movement_pattern || '').trim() || null,
    muscleCredits: credits,
    muscleGroupLabel: String(row?.snapshot_muscle_group || '').trim() || null,
    programRole: String(row?.snapshot_program_role || '').trim() || null,
    provenance: provenanceFromLog(row),
  };
}

export function e1rmOf(fact: ProgressSetFact): number | null {
  if (!fact.completed) return null;
  return estimateE1rm({
    weight: fact.weight,
    reps: fact.reps,
    setType: fact.setType,
    exerciseType: fact.exerciseType,
  });
}

export function setVolume(fact: ProgressSetFact): number | null {
  if (fact.weight == null || fact.reps == null) return null;
  return fact.weight * fact.reps;
}

export function isCountedWorkingSet(fact: ProgressSetFact): boolean {
  return fact.completed && isWorkingSet(fact.setType);
}

function parseCredits(raw: unknown): MuscleCredit[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const credits = raw
    .map((item) => {
      const muscle = String(item?.muscle || '').trim();
      const contribution = Number(item?.contribution);
      if (!muscle || !Number.isFinite(contribution) || contribution <= 0) return null;
      return { muscle, contribution };
    })
    .filter((item): item is MuscleCredit => !!item);
  return credits.length ? credits : null;
}
