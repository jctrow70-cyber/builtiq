import { SCIENCE_ENGINE_VERSION } from '../version';
import {
  countWorkingSets,
  inferLoadMode,
  prescribedWorkingCount,
  prescriptionRange,
  type CountedWorkingSet,
} from './countedSets';
import { selectComparableHistory, sameLoadContext, summarizeExposure, type ComparableExposure } from './comparable';
import type { EvaluateProgressionInput } from './inputs';
import { resolveLoadIncrement, roundLoadToIncrement } from './increments';
import {
  COMPARABLE_LOOKBACK_DAYS,
  COMPARABLE_MAX_EXPOSURES,
  POOR_EXPOSURES_BEFORE_REDUCE,
  POOR_EXPOSURES_BEFORE_REVIEW,
  REASON,
  RIR_TOLERANCE,
  type ReasonCode,
} from './reasonCodes';
import type { AdaptationEventDraft, DecisionConfidence, IncrementSource, ProgressionDecisionKind } from './types';
import { ADAPTATION_ENGINE_VERSION } from './types';

export type ProgressionEvidence = {
  exposures_used: Array<{
    log_date: string;
    load: number | null;
    reps: number[];
    rirs: Array<number | null>;
    all_top: boolean;
  }>;
  counted_set_count: number;
  excluded: { extras: number; warmups: number; ramps: number; skipped: number; empty: number };
  comparable_window: { days: number; max_exposures: number };
  rir_path: 'high' | 'performance_only' | 'none' | null;
  rir_tolerance: number;
  load_mode: string;
  laterality_limitation: string | null;
};

export type ProgressionDecisionResult = {
  decision: ProgressionDecisionKind;
  reason_codes: ReasonCode[];
  confidence: DecisionConfidence;
  current_load: number | null;
  proposed_load: number | null;
  current_rep_range: { min: number | null; max: number | null };
  proposed_rep_range: { min: number | null; max: number | null } | null;
  increment_value: number | null;
  increment_source: IncrementSource | null;
  increment_reason: string | null;
  increment_unit: 'lb' | 'kg' | null;
  rounding: 'nearest_increment' | 'none';
  evidence: ProgressionEvidence;
  explanation: {
    summary: string;
    facts: Record<string, string | number | boolean | null>;
  };
  science_version: string;
  adaptation_engine_version: string;
  applied: false;
};

function codes(...list: Array<ReasonCode | false | null | undefined>): ReasonCode[] {
  const out = list.filter((c): c is ReasonCode => !!c);
  return out.length ? Array.from(new Set(out)) : [REASON.REVIEW_CONFLICTING_SIGNAL];
}

function exposureReps(row: ComparableExposure): number[] {
  return row.counted.map((s) => s.reps);
}

function evidenceFrom(
  current: ComparableExposure,
  history: ComparableExposure[],
  countedCount: number,
  excluded: ProgressionEvidence['excluded'],
  loadMode: string,
  rirPath: ProgressionEvidence['rir_path'],
  lateralityLimitation: string | null
): ProgressionEvidence {
  const used = [current, ...history].slice(0, COMPARABLE_MAX_EXPOSURES + 1);
  return {
    exposures_used: used.map((row) => ({
      log_date: row.log_date,
      load: row.load,
      reps: exposureReps(row),
      rirs: row.counted.map((s) => s.rir),
      all_top: row.all_top,
    })),
    counted_set_count: countedCount,
    excluded,
    comparable_window: { days: COMPARABLE_LOOKBACK_DAYS, max_exposures: COMPARABLE_MAX_EXPOSURES },
    rir_path: rirPath,
    rir_tolerance: RIR_TOLERANCE,
    load_mode: loadMode,
    laterality_limitation: lateralityLimitation,
  };
}

function result(partial: Omit<ProgressionDecisionResult, 'science_version' | 'adaptation_engine_version' | 'applied'>): ProgressionDecisionResult {
  return {
    ...partial,
    science_version: SCIENCE_ENGINE_VERSION,
    adaptation_engine_version: ADAPTATION_ENGINE_VERSION,
    applied: false,
  };
}

function weakerSideBlocks(counted: CountedWorkingSet[], laterality?: string | null): { blocked: boolean; limitation: string | null } {
  if (String(laterality || '').toLowerCase() !== 'unilateral') return { blocked: false, limitation: null };
  const left = counted.filter((s) => s.side === 'left');
  const right = counted.filter((s) => s.side === 'right');
  if (!left.length || !right.length) {
    return {
      blocked: false,
      limitation: 'Unilateral laterality is known, but side-specific logs are not stored. Qualification uses the whole exposure.',
    };
  }
  return { blocked: false, limitation: null };
}

function sideProgressionGate(
  counted: CountedWorkingSet[],
  laterality: string | null | undefined,
  qualify: (sets: CountedWorkingSet[]) => boolean
): { ok: boolean; note?: ReasonCode } {
  if (String(laterality || '').toLowerCase() !== 'unilateral') return { ok: qualify(counted) };
  const left = counted.filter((s) => s.side === 'left');
  const right = counted.filter((s) => s.side === 'right');
  if (left.length && right.length) {
    return { ok: qualify(left) && qualify(right) };
  }
  return { ok: qualify(counted), note: REASON.NOTE_UNILATERAL_NO_SIDE_SPLIT };
}

function consecutivePoor(history: ComparableExposure[], increment: number, currentLoad: number | null): number {
  let n = 0;
  for (const row of history) {
    if (!sameLoadContext(row.load, currentLoad, increment) && row.load != null && currentLoad != null && row.load < currentLoad) {
      break;
    }
    if (row.majority_below_min || (row.any_below_min && !row.all_in_range)) n += 1;
    else break;
  }
  return n;
}

function consecutiveTopMissingRir(current: ComparableExposure, history: ComparableExposure[], increment: number): number {
  if (!current.all_top || current.rir_excessive) return 0;
  if (!current.missing_rir && current.target_rir != null) return 0;
  let n = 1;
  for (const row of history) {
    if (!sameLoadContext(row.load, current.load, increment)) break;
    if (row.all_top && !row.rir_excessive && (row.missing_rir || row.target_rir == null)) n += 1;
    else break;
  }
  return n;
}

function manualLoadIncrease(current: ComparableExposure, history: ComparableExposure[], increment: number): boolean {
  const prior = history.find((row) => row.load != null);
  if (!prior || current.load == null || prior.load == null) return false;
  return current.load > prior.load + (increment > 0 ? increment / 4 : 0);
}

/**
 * Deterministic next-exposure recommendation.
 * Never mutates planned sets, weeks, or the adaptation ledger.
 */
export function evaluateProgressionDecision(input: EvaluateProgressionInput): ProgressionDecisionResult {
  const currentIn = input.current;
  const countedInfo = countWorkingSets(currentIn);
  const range = prescriptionRange(currentIn);
  const loadMode = inferLoadMode(currentIn, countedInfo.counted);
  const incrementForMode = resolveLoadIncrement({
    equipment: currentIn.equipment,
    movementPattern: currentIn.movement_pattern,
    units: currentIn.units,
    userIncrement: currentIn.user_increment,
    gymIncrement: currentIn.gym_increment,
    loadMode,
  });
  const usedIncrement = incrementForMode;
  const current = summarizeExposure(currentIn, RIR_TOLERANCE);
  const history = selectComparableHistory(currentIn, input.history, RIR_TOLERANCE);
  const laterality = weakerSideBlocks(countedInfo.counted, currentIn.laterality);
  const notes: ReasonCode[] = [];
  if (countedInfo.excluded.extras) notes.push(REASON.NOTE_EXTRAS_EXCLUDED);
  if (countedInfo.excluded.warmups || countedInfo.excluded.ramps) notes.push(REASON.NOTE_WARMUP_RAMP_EXCLUDED);
  if (laterality.limitation) notes.push(REASON.NOTE_UNILATERAL_NO_SIDE_SPLIT);

  const baseEvidence = (rirPath: ProgressionEvidence['rir_path']) =>
    evidenceFrom(current, history, countedInfo.counted.length, countedInfo.excluded, loadMode, rirPath, laterality.limitation);

  const finish = (
    decision: ProgressionDecisionKind,
    reason_codes: ReasonCode[],
    extra: {
      confidence: DecisionConfidence;
      proposed_load?: number | null;
      proposed_rep_range?: { min: number | null; max: number | null } | null;
      summary: string;
      rir_path?: ProgressionEvidence['rir_path'];
      facts?: Record<string, string | number | boolean | null>;
    }
  ): ProgressionDecisionResult =>
    result({
      decision,
      reason_codes: codes(...reason_codes, ...notes),
      confidence: extra.confidence,
      current_load: current.load,
      proposed_load: extra.proposed_load ?? current.load,
      current_rep_range: { min: range.min, max: range.max },
      proposed_rep_range: extra.proposed_rep_range ?? { min: range.min, max: range.max },
      increment_value: usedIncrement.increment,
      increment_source: usedIncrement.source,
      increment_reason: usedIncrement.reason,
      increment_unit: usedIncrement.unit,
      rounding: usedIncrement.rounding,
      evidence: baseEvidence(extra.rir_path ?? null),
      explanation: {
        summary: extra.summary,
        facts: {
          log_date: currentIn.log_date,
          load_mode: loadMode,
          counted_sets: countedInfo.counted.length,
          extras_excluded: countedInfo.excluded.extras,
          applied: false,
          ...(extra.facts || {}),
        },
      },
    });

  if (currentIn.workout_status === 'skipped') {
    return finish('insufficient_data', [REASON.INSUFFICIENT_SKIPPED], {
      confidence: 'insufficient',
      proposed_load: current.load,
      summary: 'Workout was skipped. This is adherence, not a strength regression.',
    });
  }
  if (currentIn.exercise_status === 'skipped' || (currentIn.attempt_outcome === 'did_not_perform' && !countedInfo.counted.length)) {
    return finish('insufficient_data', [REASON.INSUFFICIENT_SKIPPED], {
      confidence: 'insufficient',
      summary: 'Exercise was skipped or not performed. This is adherence, not a strength regression.',
    });
  }

  const pain = currentIn.pain_flag;
  if (pain === 'pain_limiting' || pain === 'stopped_due_to_pain') {
    return finish('pain_hold', [REASON.PAIN_HOLD], {
      confidence: 'hold',
      summary: 'Pain limited or stopped the exercise. Load is held. This is not a diagnosis or rehab prescription.',
      facts: { pain_flag: pain },
    });
  }
  if (pain === 'discomfort') {
    if (currentIn.pain_associated) {
      return finish('pain_hold', [REASON.PAIN_HOLD, REASON.REVIEW_PAIN_DISCOMFORT], {
        confidence: 'review',
        summary: 'Discomfort is associated with this exercise. Do not progress load.',
        facts: { pain_flag: pain, pain_associated: true },
      });
    }
    return finish('review_required', [REASON.REVIEW_PAIN_DISCOMFORT], {
      confidence: 'review',
      summary: 'Workout discomfort was reported without a known exercise association. Review before progressing.',
      facts: { pain_flag: pain, pain_associated: false },
    });
  }

  const measurement = String(currentIn.measurement_type || 'reps').toLowerCase();
  if (measurement && measurement !== 'reps') {
    return finish('hold', [REASON.HOLD_NON_REP_MEASUREMENT], {
      confidence: 'hold',
      summary: `Measurement type ${measurement} does not use rep-based load progression in Phase 2A.2.`,
      facts: { measurement_type: measurement },
    });
  }

  if (loadMode === 'assisted') {
    return finish('review_required', [REASON.REVIEW_ASSISTED_BODYWEIGHT], {
      confidence: 'review',
      summary: 'Assisted bodyweight work needs a coach/user review. 2A.2 does not invent un-assist increments.',
    });
  }

  if (!countedInfo.counted.length) {
    const nullSnap = range.min == null && range.max == null && !(currentIn.sets || []).some((s) => s.snapshot_rep_min != null || s.snapshot_target_reps);
    return finish('insufficient_data', [nullSnap ? REASON.INSUFFICIENT_NULL_SNAPSHOT : REASON.INSUFFICIENT_NO_COUNTED_SETS], {
      confidence: 'insufficient',
      summary: 'No counted working-set performance was available.',
    });
  }

  const prescribed = prescribedWorkingCount(currentIn, countedInfo.counted);
  const completeEnough = countedInfo.counted.length >= prescribed || currentIn.exercise_status === 'completed';
  if (!completeEnough && currentIn.attempt_outcome !== 'could_not_complete' && countedInfo.counted.length < Math.max(2, Math.ceil(prescribed * 0.67))) {
    return finish('insufficient_data', [REASON.INSUFFICIENT_PARTIAL], {
      confidence: 'insufficient',
      summary: 'Not enough planned working sets were performed to evaluate progression. Missing sets from a partial workout are not a regression.',
      facts: { counted: countedInfo.counted.length, prescribed },
    });
  }

  if (range.min == null || range.max == null) {
    return finish('insufficient_data', [REASON.INSUFFICIENT_NULL_SNAPSHOT], {
      confidence: 'insufficient',
      summary: 'Historical logs have no usable rep-range snapshot. 2A.2 holds conservatively and does not invent a range.',
    });
  }

  const qualifyTop = (sets: CountedWorkingSet[]) => sets.length > 0 && sets.every((s) => s.reps >= range.max!);
  const sideGate = sideProgressionGate(countedInfo.counted, currentIn.laterality, qualifyTop);
  if (sideGate.note) notes.push(sideGate.note);

  const allTop = current.all_top && sideGate.ok;
  const allInRange = current.all_in_range;
  const anyBelow = current.any_below_min;
  const loadStep = manualLoadIncrease(current, history, usedIncrement.increment);
  const poorStreak = (anyBelow ? 1 : 0) + consecutivePoor(history, usedIncrement.increment, current.load);

  if (loadStep && allInRange && !allTop) {
    return finish('build_reps', [REASON.HOLD_SUCCESSFUL_LOAD_STEP, REASON.BUILD_REPS_WITHIN_RANGE], {
      confidence: 'hold',
      proposed_load: current.load,
      summary: `Load increased from the prior comparable exposure to ${current.load}. Reps reset inside the range, so this is successful progression, not regression.`,
      facts: { prior_load: history[0]?.load ?? null, current_load: current.load },
    });
  }
  if (loadStep && allTop && current.rir_excessive) {
    return finish('hold', [REASON.HOLD_SUCCESSFUL_LOAD_STEP, REASON.HOLD_EXCESSIVE_EFFORT], {
      confidence: 'hold',
      proposed_load: current.load,
      summary: 'The athlete already stepped load up. Effort was harder than the RIR target, so the new load is held.',
    });
  }

  if (current.rir_excessive && allTop) {
    return finish('hold', [REASON.HOLD_EXCESSIVE_EFFORT], {
      confidence: 'hold',
      rir_path: 'none',
      summary: `All counted sets hit ${range.max} but reported RIR was more than ${RIR_TOLERANCE} below target ${range.targetRir}. Do not progress load.`,
    });
  }

  if (current.rir_excessive && allInRange && !allTop) {
    return finish('hold', [REASON.HOLD_EXCESSIVE_EFFORT], {
      confidence: 'hold',
      rir_path: 'none',
      proposed_load: current.load,
      summary: `Sets stayed in range but reported RIR was more than ${RIR_TOLERANCE} below target ${range.targetRir}. Keep the load.`,
    });
  }

  if (allTop && !current.rir_excessive) {
    const knownAll = countedInfo.counted.every((s) => s.rir != null) && range.targetRir != null;
    if (knownAll && current.rir_compatible) {
      if (loadMode === 'bodyweight' && !(current.load != null && current.load > 0)) {
        return finish('hold', [REASON.HOLD_BODYWEIGHT_NO_EXTERNAL_LOAD], {
          confidence: 'high',
          rir_path: 'high',
          proposed_load: current.load ?? 0,
          summary: 'Bodyweight sets reached the top of the range. 2A.2 will not add external load unless weighted performance was logged.',
        });
      }
      const proposed = proposeLoad(current.load, usedIncrement.increment, 'up');
      return finish('progress_load', [REASON.PROG_LOAD_TOP_RANGE_RIR], {
        confidence: 'high',
        rir_path: 'high',
        proposed_load: proposed,
        summary: `All counted working sets reached ${range.max} with RIR compatible with target ${range.targetRir} (tolerance ${RIR_TOLERANCE}). Propose ${proposed} ${usedIncrement.unit}.`,
      });
    }

    const missingStreak = consecutiveTopMissingRir(current, history, usedIncrement.increment);
    if (loadMode === 'bodyweight' && !(current.load != null && current.load > 0)) {
      return finish('hold', [REASON.HOLD_BODYWEIGHT_NO_EXTERNAL_LOAD], {
        confidence: 'performance_only',
        rir_path: 'performance_only',
        proposed_load: current.load ?? 0,
        summary: 'Bodyweight work hit the top of the range. No external-load increment is proposed.',
      });
    }
    if (missingStreak >= 2) {
      const proposed = proposeLoad(current.load, usedIncrement.increment, 'up');
      return finish('progress_load', [REASON.PROG_LOAD_REPEATED_PERFORMANCE], {
        confidence: 'performance_only',
        rir_path: 'performance_only',
        proposed_load: proposed,
        summary: `Two consecutive comparable top-of-range exposures without a usable RIR confirmation. Propose ${proposed} ${usedIncrement.unit}. Missing RIR was not invented.`,
        facts: { consecutive_top_range_missing_rir: missingStreak },
      });
    }
    return finish('hold', [REASON.HOLD_FIRST_NO_RIR_CONFIRMATION], {
      confidence: 'performance_only',
      rir_path: 'performance_only',
      proposed_load: current.load,
      summary: 'First comparable top-of-range exposure without a usable RIR confirmation. Hold for a second comparable session. RIR was not invented.',
      facts: { consecutive_top_range_missing_rir: missingStreak || 1 },
    });
  }

  if (allInRange && !allTop) {
    return finish('build_reps', [REASON.BUILD_REPS_WITHIN_RANGE], {
      confidence: 'hold',
      proposed_load: current.load,
      summary: `Counted sets stayed inside ${range.min}–${range.max} without every set reaching ${range.max}. Keep the load and build reps.`,
    });
  }

  if (anyBelow) {
    if (poorStreak >= POOR_EXPOSURES_BEFORE_REVIEW) {
      return finish('review_required', [REASON.REVIEW_CONFLICTING_SIGNAL, REASON.REDUCE_REPEATED_BELOW_RANGE], {
        confidence: 'review',
        proposed_load: proposeLoad(current.load, usedIncrement.increment, 'down'),
        summary: 'Repeated below-range performances across comparable exposures. Review before automatically changing the plan.',
        facts: { poor_streak: poorStreak },
      });
    }
    if (poorStreak >= POOR_EXPOSURES_BEFORE_REDUCE) {
      const proposed = proposeLoad(current.load, usedIncrement.increment, 'down');
      return finish('reduce_load', [REASON.REDUCE_REPEATED_BELOW_RANGE], {
        confidence: 'hold',
        proposed_load: proposed,
        summary: `Two consecutive comparable exposures were below ${range.min}. Propose ${proposed} ${usedIncrement.unit}.`,
        facts: { poor_streak: poorStreak },
      });
    }
    return finish('hold', [REASON.HOLD_SINGLE_BAD_EXPOSURE], {
      confidence: 'hold',
      proposed_load: current.load,
      summary: 'One comparable exposure fell short of the prescribed range. Hold the load; one hard day is not an automatic regression.',
      facts: { poor_streak: poorStreak },
    });
  }

  return finish('hold', [REASON.REVIEW_CONFLICTING_SIGNAL], {
    confidence: 'review',
    summary: 'Signals did not match a single progression rule. Hold and review.',
  });
}

function proposeLoad(current: number | null, increment: number, direction: 'up' | 'down'): number | null {
  if (current == null) return increment > 0 && direction === 'up' ? increment : current;
  if (increment <= 0) return current;
  const raw = direction === 'up' ? current + increment : Math.max(0, current - increment);
  return roundLoadToIncrement(raw, increment, 'nearest');
}

/** Build a ledger draft for 2A.3. 2A.2 does not persist it. */
export function adaptationDraftFromDecision(
  decision: ProgressionDecisionResult,
  ids: { user_id: string; program_id?: string | null; exercise_catalog_id?: string | null; from_week?: number | null }
): AdaptationEventDraft {
  return {
    user_id: ids.user_id,
    program_id: ids.program_id,
    from_week: ids.from_week,
    exercise_catalog_id: ids.exercise_catalog_id,
    decision: decision.decision,
    reason_codes: decision.reason_codes,
    before_json: {
      current_load: decision.current_load,
      current_rep_range: decision.current_rep_range,
      evidence: decision.evidence,
    },
    after_json: {
      proposed_load: decision.proposed_load,
      proposed_rep_range: decision.proposed_rep_range,
      applied: false,
    },
    actor: 'engine',
    science_version: decision.science_version,
    increment_source: decision.increment_source,
    increment_reason: decision.increment_reason,
    increment_value: decision.increment_value,
    increment_unit: decision.increment_unit,
  };
}

