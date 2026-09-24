import type { ProgressionConfidence } from './types';

export type WorkingSetPerformance = {
  reps: number;
  rir?: number | null;
  completed?: boolean;
};

export type ConfidenceInput = {
  repMax: number;
  targetRir: number;
  workingSets: WorkingSetPerformance[];
  /** Prior comparable exposures that also hit top-of-range with missing RIR. */
  consecutiveTopRangeMissingRir?: number;
};

function countedSets(sets: WorkingSetPerformance[]): WorkingSetPerformance[] {
  return (sets || []).filter((s) => s.completed !== false && Number(s.reps) > 0);
}

function allHitTop(sets: WorkingSetPerformance[], repMax: number): boolean {
  return sets.length > 0 && sets.every((s) => s.reps >= repMax);
}

function rirKnown(set: WorkingSetPerformance): boolean {
  return set.rir != null && String(set.rir) !== '' && Number.isFinite(Number(set.rir));
}

/**
 * Missing RIR is never treated as target RIR 2.
 * High confidence: top of range + compatible reported RIR → load-eligible after one exposure.
 * Performance-only: top of range + missing RIR → hold the first time; eligible after two consecutive comparable exposures.
 */
export function progressionConfidence(input: ConfidenceInput): {
  confidence: ProgressionConfidence;
  loadEligible: boolean;
  reasonCode: string;
} {
  const sets = countedSets(input.workingSets);
  if (!sets.length || !allHitTop(sets, input.repMax)) {
    return { confidence: 'hold', loadEligible: false, reasonCode: 'HOLD_NOT_TOP_RANGE' };
  }

  const known = sets.filter(rirKnown);
  if (known.length === sets.length) {
    const compatible = known.every((s) => Number(s.rir) + 0.5 >= input.targetRir);
    if (compatible) {
      return { confidence: 'high', loadEligible: true, reasonCode: 'PROG_LOAD_TOP_RANGE' };
    }
    return { confidence: 'hold', loadEligible: false, reasonCode: 'HOLD_RIR_TOO_LOW' };
  }

  const missingCount = (input.consecutiveTopRangeMissingRir || 1);
  if (missingCount >= 2) {
    return { confidence: 'performance_only', loadEligible: true, reasonCode: 'PROG_LOAD_PERFORMANCE_ONLY' };
  }
  return { confidence: 'performance_only', loadEligible: false, reasonCode: 'HOLD_UNKNOWN_RIR_ONCE' };
}

/** Safety: never invent an RIR when the athlete did not log one. */
export function reportedRirOrUnknown(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
