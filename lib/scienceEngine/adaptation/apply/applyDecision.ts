import { ADAPTATION_ENGINE_VERSION } from '../types';
import type { ProgressionDecisionKind } from '../types';
import { SCIENCE_ENGINE_VERSION } from '../../version';
import { parseLoad } from '../countedSets';
import { applicationKey, loadLabel, prescriptionFingerprint, successfulEvent, workingSetsOf } from './fingerprint';
import { explainAdaptation } from './explain';
import { selectNextEligibleExposure } from './nextExposure';
import {
  APPLY_ENGINE_VERSION,
  AUTOMATIC_DECISIONS,
  type AdaptationApplicationResult,
  type ApplyAbortReason,
  type ApplyProgressionInput,
  type ApplicationStatus,
  type CandidateExposure,
  type LedgerEventRecord,
  type PlannedSetMutation,
} from './types';

function workingLoad(target: CandidateExposure | null): string | null {
  if (!target) return null;
  const first = workingSetsOf(target.planned_sets)[0];
  const label = loadLabel(first?.target_weight);
  return label || null;
}

function buildEvent(
  input: ApplyProgressionInput,
  target: CandidateExposure | null,
  status: ApplicationStatus,
  abort: ApplyAbortReason,
  mutations: PlannedSetMutation[],
  key: string,
  expectedFp: string | null,
  actualFp: string | null
): LedgerEventRecord {
  const d = input.decision;
  return {
    user_id: input.source.user_id,
    program_id: input.source.program_id,
    from_week: input.source.week ?? null,
    to_week: target?.week ?? null,
    exercise_catalog_id: input.source.catalog_exercise_id || null,
    decision: d.decision,
    reason_codes: [...d.reason_codes, abort].filter((c): c is string => !!c && c !== 'ALREADY_APPLIED'),
    before_json: {
      source: input.source,
      target_before: target
        ? {
            workout_id: target.workout_id,
            exercise_id: target.exercise_id,
            week: target.week,
            load: workingLoad(target),
            fingerprint: actualFp,
          }
        : null,
      abort_reason: abort,
    },
    after_json: {
      application_status: status,
      proposed_load: d.proposed_load,
      mutations,
      applied: status !== 'not_applied',
      apply_engine_version: APPLY_ENGINE_VERSION,
    },
    actor: 'engine',
    science_version: d.science_version || SCIENCE_ENGINE_VERSION,
    adaptation_engine_version: d.adaptation_engine_version || ADAPTATION_ENGINE_VERSION,
    increment_source: d.increment_source,
    increment_reason: d.increment_reason,
    increment_value: d.increment_value,
    increment_unit: d.increment_unit,
    source_workout_id: input.source.workout_id,
    source_exercise_id: input.source.exercise_id,
    source_log_date: input.source.log_date || null,
    target_workout_id: target?.workout_id || null,
    target_exercise_id: target?.exercise_id || null,
    application_status: status,
    application_key: key,
    target_fingerprint: expectedFp,
    confidence: d.confidence,
  };
}

function resultOf(
  input: ApplyProgressionInput,
  target: CandidateExposure | null,
  status: ApplicationStatus,
  abort: ApplyAbortReason,
  mutations: PlannedSetMutation[],
  key: string,
  expectedFp: string | null,
  actualFp: string | null,
  beforeLoad: string | null,
  afterLoad: string | null
): AdaptationApplicationResult {
  const explanation = explainAdaptation({
    decision: input.decision.decision,
    reason_codes: input.decision.reason_codes,
    exercise_name: target?.exercise_name || input.source.exercise_name || 'This exercise',
    from_load: beforeLoad,
    to_load: afterLoad,
    unit: input.decision.increment_unit || 'lb',
    increment: input.decision.increment_value,
    rep_min: input.decision.current_rep_range.min,
    rep_max: input.decision.current_rep_range.max,
    abort_reason: abort === 'ALREADY_APPLIED' ? null : abort,
  });
  return {
    status,
    applied: status !== 'not_applied',
    mutated: status === 'mutated',
    abort_reason: abort,
    decision: input.decision.decision,
    reason_codes: input.decision.reason_codes,
    explanation,
    target,
    before_load: beforeLoad,
    after_load: afterLoad,
    application_key: key,
    target_fingerprint_expected: expectedFp,
    target_fingerprint_actual: actualFp,
    event: buildEvent(input, target, status, abort, mutations, key, expectedFp, actualFp),
    mutations,
  };
}

function keyFor(input: ApplyProgressionInput, target: CandidateExposure | null): string {
  return applicationKey({
    user_id: input.source.user_id,
    source_workout_id: input.source.workout_id,
    source_exercise_id: input.source.exercise_id,
    target_workout_id: target?.workout_id || 'none',
    target_exercise_id: target?.exercise_id || 'none',
    catalog_exercise_id: input.source.catalog_exercise_id,
    decision: input.decision.decision,
  });
}

function findExisting(input: ApplyProgressionInput, key: string): LedgerEventRecord | undefined {
  return (input.existing_events || []).find((row) => row.application_key === key && successfulEvent(row));
}

function applyLoadToWorkingSets(target: CandidateExposure, proposed: string): PlannedSetMutation[] {
  const mutations: PlannedSetMutation[] = [];
  workingSetsOf(target.planned_sets).forEach((set) => {
    const from = loadLabel(set.target_weight);
    if (from !== proposed) {
      mutations.push({ planned_set_id: set.id, field: 'target_weight', from, to: proposed });
      set.target_weight = proposed;
    }
  });
  return mutations;
}

/**
 * Apply a frozen 2A.2 decision to the next eligible comparable exposure.
 * Mutates the selected candidate's working planned sets in place when status is mutated.
 * Never writes warmup/ramp sets. Never changes week_status. Never bypasses history/performance checks.
 */
export function applyProgressionDecision(input: ApplyProgressionInput): AdaptationApplicationResult {
  const decision = input.decision.decision;
  const target = selectNextEligibleExposure(input.source, input.candidates);
  const key = keyFor(input, target);
  const existing = findExisting(input, key);
  if (existing) {
    const replay = resultOf(
      input,
      target,
      existing.application_status,
      'ALREADY_APPLIED',
      [],
      key,
      existing.target_fingerprint,
      target ? prescriptionFingerprint(target.planned_sets) : null,
      workingLoad(target),
      existing.after_json && typeof existing.after_json.proposed_load === 'number'
        ? String(existing.after_json.proposed_load)
        : workingLoad(target)
    );
    replay.event = existing;
    replay.reason_codes = existing.reason_codes || replay.reason_codes;
    return replay;
  }

  if (!AUTOMATIC_DECISIONS.includes(decision)) {
    return resultOf(input, target, 'not_applied', 'NON_AUTOMATIC_DECISION', [], key, null, target ? prescriptionFingerprint(target.planned_sets) : null, workingLoad(target), workingLoad(target));
  }

  if (!target) {
    return resultOf(input, null, 'not_applied', 'NO_ELIGIBLE_TARGET', [], key, input.expected_fingerprint || null, null, null, null);
  }

  if (target.user_id !== input.source.user_id) {
    return resultOf(input, target, 'not_applied', 'OWNERSHIP_MISMATCH', [], key, null, null, workingLoad(target), workingLoad(target));
  }
  if (target.program_id !== input.source.program_id) {
    return resultOf(input, target, 'not_applied', 'PROGRAM_MISMATCH', [], key, null, null, workingLoad(target), workingLoad(target));
  }
  if (target.has_performance) {
    return resultOf(input, target, 'not_applied', 'HISTORY_GUARD', [], key, null, prescriptionFingerprint(target.planned_sets), workingLoad(target), workingLoad(target));
  }

  const actualFp = prescriptionFingerprint(target.planned_sets);
  const expectedFp = input.expected_fingerprint != null ? input.expected_fingerprint : actualFp;
  if (expectedFp !== actualFp) {
    return resultOf(input, target, 'not_applied', 'STALE_TARGET_PRESCRIPTION', [], key, expectedFp, actualFp, workingLoad(target), workingLoad(target));
  }

  const before = workingLoad(target);
  const loadChange = decision === 'progress_load' || decision === 'reduce_load';
  if (loadChange && input.decision.proposed_load != null) {
    const proposed = String(input.decision.proposed_load);
    const mutations = applyLoadToWorkingSets(target, proposed);
    if (!mutations.length) {
      return resultOf(input, target, 'recorded_no_change', null, [], key, expectedFp, actualFp, before, proposed);
    }
    return resultOf(input, target, 'mutated', null, mutations, key, expectedFp, actualFp, before, proposed);
  }

  return resultOf(input, target, 'recorded_no_change', null, [], key, expectedFp, actualFp, before, before);
}

export function replayIfAlreadyApplied(result: AdaptationApplicationResult): boolean {
  return result.abort_reason === 'ALREADY_APPLIED';
}

export type { ProgressionDecisionKind };
