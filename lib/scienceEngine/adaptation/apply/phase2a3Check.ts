import { generateProgram } from '../../generateProgram';
import { trainingProfileFromSources } from '../../profile';
import { FALLBACK_CATALOG } from '../../catalogAdapter';
import { adaptGenerationCatalog, isAiGenerationEligibleRow, selectAiGenerationCatalogRows } from '../../generation/catalogEligibility';
import { MASTER_CATALOG_SOURCE } from '../../../training/masterCatalog';
import { evaluateProgressionDecision } from '../decision';
import { REASON } from '../reasonCodes';
import { ADAPTATION_ENGINE_VERSION } from '../types';
import type { ProgressionDecisionResult } from '../decision';
import { applyProgressionDecision } from './applyDecision';
import { explainAdaptation } from './explain';
import { applicationKey, prescriptionFingerprint, workingSetsOf } from './fingerprint';
import { selectNextEligibleExposure } from './nextExposure';
import { APPLY_ENGINE_VERSION, type CandidateExposure, type LedgerEventRecord, type SourceExposureRef } from './types';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const USER = 'user-a';
const OTHER = 'user-b';
const PROG = 'prog-a';
const OTHER_PROG = 'prog-b';
const CAT = '11111111-1111-1111-1111-111111111111';

function decision(kind: ProgressionDecisionResult['decision'], extra: Partial<ProgressionDecisionResult> = {}): ProgressionDecisionResult {
  return {
    decision: kind,
    reason_codes: extra.reason_codes || [REASON.PROG_LOAD_TOP_RANGE_RIR],
    confidence: extra.confidence || 'high',
    current_load: extra.current_load ?? 185,
    proposed_load: extra.proposed_load ?? (kind === 'progress_load' ? 190 : kind === 'reduce_load' ? 180 : 185),
    current_rep_range: extra.current_rep_range || { min: 8, max: 10 },
    proposed_rep_range: extra.proposed_rep_range || { min: 8, max: 10 },
    increment_value: extra.increment_value ?? 5,
    increment_source: extra.increment_source || 'equipment_default',
    increment_reason: extra.increment_reason || 'Barbell upper-body plate step',
    increment_unit: extra.increment_unit || 'lb',
    rounding: extra.rounding || 'nearest_increment',
    evidence: extra.evidence || {
      exposures_used: [],
      counted_set_count: 3,
      excluded: { extras: 0, warmups: 0, ramps: 0, skipped: 0, empty: 0 },
      comparable_window: { days: 42, max_exposures: 4 },
      rir_path: 'high',
      rir_tolerance_low: 0.5,
      rir_tolerance_high: 1.5,
      effort: 'compatible',
      load_mode: 'external',
      laterality_limitation: null,
    },
    explanation: extra.explanation || { summary: 'test', facts: {} },
    science_version: extra.science_version || '1.4.4',
    adaptation_engine_version: extra.adaptation_engine_version || ADAPTATION_ENGINE_VERSION,
    applied: false,
  };
}

function sets(exerciseId: string, weight: string, extras?: { warmup?: boolean; ramp?: boolean }) {
  const rows = [
    { id: `${exerciseId}-w1`, exercise_id: exerciseId, set_type: 'working', set_number: 1, target_weight: weight, target_reps: '8-10', rep_min: 8, rep_max: 10, target_rir: 2 },
    { id: `${exerciseId}-w2`, exercise_id: exerciseId, set_type: 'working', set_number: 2, target_weight: weight, target_reps: '8-10', rep_min: 8, rep_max: 10, target_rir: 2 },
    { id: `${exerciseId}-w3`, exercise_id: exerciseId, set_type: 'working', set_number: 3, target_weight: weight, target_reps: '8-10', rep_min: 8, rep_max: 10, target_rir: 2 },
  ];
  if (extras?.warmup) {
    rows.unshift({ id: `${exerciseId}-wu`, exercise_id: exerciseId, set_type: 'warmup', set_number: 0, target_weight: '45', target_reps: '10', rep_min: 10, rep_max: 10, target_rir: 5 });
  }
  if (extras?.ramp) {
    rows.splice(1, 0, { id: `${exerciseId}-ramp`, exercise_id: exerciseId, set_type: 'ramp', set_number: 0, target_weight: '135', target_reps: '5', rep_min: 5, rep_max: 5, target_rir: 3 });
  }
  return rows;
}

function candidate(partial: Partial<CandidateExposure> & { exercise_id: string; week: number; day_order: number }): CandidateExposure {
  return {
    user_id: partial.user_id || USER,
    program_id: partial.program_id || PROG,
    workout_id: partial.workout_id || `w-${partial.week}-${partial.day_order}`,
    exercise_id: partial.exercise_id,
    catalog_exercise_id: partial.catalog_exercise_id || CAT,
    exercise_name: partial.exercise_name || 'Barbell Bench Press',
    program_role: partial.program_role || 'primary',
    measurement_type: partial.measurement_type || 'reps',
    laterality: partial.laterality || 'bilateral',
    week: partial.week,
    day_order: partial.day_order,
    day_label: partial.day_label || 'Fri',
    week_status: partial.week_status || 'activated',
    has_performance: partial.has_performance || false,
    planned_sets: partial.planned_sets || sets(partial.exercise_id, '185', { warmup: true, ramp: true }),
  };
}

const source: SourceExposureRef = {
  user_id: USER,
  program_id: PROG,
  workout_id: 'w-1-1',
  exercise_id: 'ex-mon',
  catalog_exercise_id: CAT,
  week: 1,
  day_order: 1,
  log_date: '2026-09-21',
  measurement_type: 'reps',
  program_role: 'primary',
  laterality: 'bilateral',
  exercise_name: 'Barbell Bench Press',
};

function workingWeight(target: CandidateExposure) {
  return String(workingSetsOf(target.planned_sets)[0]?.target_weight || '');
}

export function runPhase2a3ApplyChecks() {
  const friday = candidate({ exercise_id: 'ex-fri', week: 1, day_order: 3, day_label: 'Fri' });
  const nextMonday = candidate({ exercise_id: 'ex-next-mon', week: 2, day_order: 1, day_label: 'Mon', week_status: 'template' });

  const A = applyProgressionDecision({
    source,
    decision: decision('progress_load', { reason_codes: [REASON.PROG_LOAD_TOP_RANGE_RIR], proposed_load: 190 }),
    candidates: [friday, nextMonday],
  });
  assert(A.status === 'mutated' && A.mutated, `A: expected mutated, got ${A.status}`);
  assert(workingWeight(friday) === '190', `A: Friday should be 190, got ${workingWeight(friday)}`);
  assert(workingWeight(nextMonday) === '185', 'A: do not touch later template Monday');
  assert(friday.planned_sets.find((s) => s.set_type === 'warmup')?.target_weight === '45', 'K/A: warmup unchanged');
  assert(friday.planned_sets.find((s) => s.set_type === 'ramp')?.target_weight === '135', 'K/A: ramp unchanged');

  const B = applyProgressionDecision({
    source,
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [friday, nextMonday],
    existing_events: [A.event],
  });
  assert(B.abort_reason === 'ALREADY_APPLIED', 'B: second call is idempotent');
  assert(workingWeight(friday) === '190', 'B: stays 190, not 195');

  const fridayLogged = candidate({ exercise_id: 'ex-fri-logged', week: 1, day_order: 3, has_performance: true });
  const mondayActivated = candidate({ exercise_id: 'ex-mon2', week: 2, day_order: 1, week_status: 'activated', day_label: 'Mon' });
  const Cskip = applyProgressionDecision({
    source,
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [fridayLogged, mondayActivated],
  });
  assert(Cskip.target?.exercise_id === 'ex-mon2', 'C: skip logged Friday and use next eligible activated Monday');
  assert(workingWeight(mondayActivated) === '190', 'C: next eligible target becomes 190');
  const cTemplate = candidate({ exercise_id: 'ex-c-template', week: 2, day_order: 1, week_status: 'template', day_label: 'Mon' });
  const Cnone = applyProgressionDecision({
    source,
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [fridayLogged, cTemplate],
  });
  assert(Cnone.status === 'mutated' && Cnone.target?.exercise_id === 'ex-c-template', 'C: logged Friday is skipped; unperformed template Monday is eligible');
  assert(workingWeight(cTemplate) === '190', 'C: policy now allows the first template target');
  assert(cTemplate.week_status === 'template', 'C: applying into a template does not activate the week');

  const staleTarget = candidate({ exercise_id: 'ex-fri-stale', week: 1, day_order: 3 });
  const expected = prescriptionFingerprint(staleTarget.planned_sets);
  staleTarget.planned_sets.forEach((s) => {
    if (s.set_type === 'working') s.target_weight = '200';
  });
  const D = applyProgressionDecision({
    source,
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [staleTarget],
    expected_fingerprint: expected,
  });
  assert(D.abort_reason === 'STALE_TARGET_PRESCRIPTION' && D.status === 'not_applied', 'D: stale abort');
  assert(workingWeight(staleTarget) === '200', 'D: do not overwrite the manual edit');

  const reduceTarget = candidate({ exercise_id: 'ex-fri-red', week: 1, day_order: 3 });
  const E = applyProgressionDecision({
    source,
    decision: decision('reduce_load', { reason_codes: [REASON.REDUCE_REPEATED_BELOW_RANGE_EXCESSIVE], proposed_load: 180, confidence: 'hold' }),
    candidates: [reduceTarget],
  });
  assert(E.status === 'mutated' && workingWeight(reduceTarget) === '180', 'E: reduce applies exact 180');
  assert(workingSetsOf(reduceTarget.planned_sets).every((s) => String(s.target_weight) === '180'), 'E: only working sets reduced');

  const buildTarget = candidate({ exercise_id: 'ex-fri-build', week: 1, day_order: 3 });
  const F = applyProgressionDecision({
    source,
    decision: decision('build_reps', { reason_codes: [REASON.BUILD_REPS_WITHIN_RANGE], proposed_load: 185, confidence: 'hold' }),
    candidates: [buildTarget],
  });
  assert(F.status === 'recorded_no_change' && !F.mutated, 'F: build_reps with same range is recorded_no_change');
  assert(workingWeight(buildTarget) === '185', 'F: load unchanged');

  const holdTarget = candidate({ exercise_id: 'ex-fri-hold', week: 1, day_order: 3 });
  const G = applyProgressionDecision({
    source,
    decision: decision('hold', { reason_codes: [REASON.HOLD_SINGLE_BAD_EXPOSURE], proposed_load: 185, confidence: 'hold' }),
    candidates: [holdTarget],
  });
  assert(G.status === 'recorded_no_change', 'G: hold is recorded_no_change');
  assert(workingWeight(holdTarget) === '185', 'G: no rewrite');

  const reviewTarget = candidate({ exercise_id: 'ex-fri-rev', week: 1, day_order: 3 });
  const H = applyProgressionDecision({
    source,
    decision: decision('review_required', { reason_codes: [REASON.REVIEW_BELOW_RANGE_UNKNOWN_EFFORT], proposed_load: 185, confidence: 'review' }),
    candidates: [reviewTarget],
  });
  assert(H.status === 'not_applied' && H.abort_reason === 'NON_AUTOMATIC_DECISION', 'H: review is not applied');
  assert(workingWeight(reviewTarget) === '185', 'H: no mutation');

  const painTarget = candidate({ exercise_id: 'ex-fri-pain', week: 1, day_order: 3 });
  const I = applyProgressionDecision({
    source,
    decision: decision('pain_hold', { reason_codes: [REASON.PAIN_HOLD], proposed_load: 185, confidence: 'hold' }),
    candidates: [painTarget],
  });
  assert(I.status === 'not_applied' && I.abort_reason === 'NON_AUTOMATIC_DECISION', 'I: pain_hold is not applied');
  assert(workingWeight(painTarget) === '185', 'I: no mutation');

  const insuffTarget = candidate({ exercise_id: 'ex-fri-ins', week: 1, day_order: 3 });
  const J = applyProgressionDecision({
    source,
    decision: decision('insufficient_data', { reason_codes: [REASON.INSUFFICIENT_SKIPPED], proposed_load: null, confidence: 'insufficient' }),
    candidates: [insuffTarget],
  });
  assert(J.status === 'not_applied', 'J: insufficient_data is not applied');

  const otherUser = candidate({ exercise_id: 'ex-other-user', week: 1, day_order: 3, user_id: OTHER });
  const L = applyProgressionDecision({
    source,
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [otherUser],
  });
  assert(L.abort_reason === 'NO_ELIGIBLE_TARGET', 'L: another user cannot be targeted');
  assert(workingWeight(otherUser) === '185', 'L: other user unchanged');

  const otherProg = candidate({ exercise_id: 'ex-other-prog', week: 1, day_order: 3, program_id: OTHER_PROG });
  const M = applyProgressionDecision({
    source,
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [otherProg],
  });
  assert(M.abort_reason === 'NO_ELIGIBLE_TARGET', 'M: another program is not targeted');

  const loggedOnly = candidate({ exercise_id: 'ex-hist', week: 1, day_order: 3, has_performance: true });
  const N = applyProgressionDecision({
    source,
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [loggedOnly],
  });
  assert(N.status === 'not_applied', 'N: logged prescription is not rewritten');
  assert(workingWeight(loggedOnly) === '185', 'N: historical load stays');

  const afterUser = candidate({ exercise_id: 'ex-after', week: 1, day_order: 3 });
  const first = applyProgressionDecision({
    source: { ...source, exercise_id: 'ex-mon-after' },
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [afterUser],
  });
  assert(first.status === 'mutated' && workingWeight(afterUser) === '190', 'O: first apply writes 190');
  afterUser.planned_sets.forEach((s) => {
    if (s.set_type === 'working') s.target_weight = '195';
  });
  const O = applyProgressionDecision({
    source: { ...source, exercise_id: 'ex-mon-after' },
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [afterUser],
    existing_events: [first.event],
  });
  assert(O.abort_reason === 'ALREADY_APPLIED', 'O: engine does not re-apply');
  assert(workingWeight(afterUser) === '195', 'O: manual edit after adaptation remains');

  const liveUnder = evaluateProgressionDecision({
    current: {
      log_date: '2026-09-21',
      catalog_exercise_id: CAT,
      exercise_name: 'Barbell Bench Press',
      program_role: 'primary',
      measurement_type: 'reps',
      laterality: 'bilateral',
      equipment: 'Barbell',
      prescription: { rep_min: 8, rep_max: 10, target_rir: 2, working_set_count: 3 },
      sets: [10, 10, 10].map((reps, i) => ({
        planned_set_id: `u-${i}`,
        completed: true,
        set_type: 'working',
        actual_weight: 185,
        actual_reps: reps,
        actual_rir: 5,
        snapshot_rep_min: 8,
        snapshot_rep_max: 10,
        snapshot_target_rir: 2,
      })),
    },
  });
  assert(liveUnder.decision === 'progress_load' && liveUnder.proposed_load === 190, 'P: 2A.2 underchallenged still one increment');
  const pTarget = candidate({ exercise_id: 'ex-under', week: 1, day_order: 3 });
  const P = applyProgressionDecision({ source, decision: liveUnder, candidates: [pTarget] });
  assert(P.status === 'mutated' && workingWeight(pTarget) === '190', 'P: apply exact 2A.2 proposed 190');
  assert(liveUnder.reason_codes.includes(REASON.PROG_LOAD_UNDERCHALLENGED), 'P: underchallenged reason preserved');

  const firstNoRir = {
    log_date: '2026-09-14',
    catalog_exercise_id: CAT,
    exercise_name: 'Barbell Bench Press',
    program_role: 'primary' as const,
    measurement_type: 'reps',
    laterality: 'bilateral',
    equipment: 'Barbell',
    prescription: { rep_min: 8, rep_max: 10, target_rir: 2, working_set_count: 3 },
    sets: [10, 10, 10].map((reps, i) => ({
      planned_set_id: `q0-${i}`,
      completed: true,
      set_type: 'working',
      actual_weight: 185,
      actual_reps: reps,
      actual_rir: null,
      snapshot_rep_min: 8,
      snapshot_rep_max: 10,
      snapshot_target_rir: 2,
    })),
  };
  const liveNoRir = evaluateProgressionDecision({
    current: { ...firstNoRir, log_date: '2026-09-21', sets: firstNoRir.sets.map((s, i) => ({ ...s, planned_set_id: `q1-${i}` })) },
    history: [firstNoRir],
  });
  assert(liveNoRir.decision === 'progress_load' && liveNoRir.proposed_load === 190, 'Q: 2A.2 repeated no-RIR proposes 190');
  const qTarget = candidate({ exercise_id: 'ex-norir', week: 1, day_order: 3 });
  const Q = applyProgressionDecision({ source, decision: liveNoRir, candidates: [qTarget] });
  assert(Q.status === 'mutated' && workingWeight(qTarget) === '190', 'Q: apply exact no-RIR increment');
  assert(liveNoRir.reason_codes.includes(REASON.PROG_LOAD_REPEATED_PERFORMANCE), 'Q: repeated-performance reason');

  assert(A.event.before_json && A.event.after_json, 'R: ledger has before/after');
  assert(A.event.science_version === '1.4.4', 'R: science version stored');
  assert(A.event.adaptation_engine_version === ADAPTATION_ENGINE_VERSION, 'R: 2A.2 version stored');
  assert(A.event.application_status === 'mutated', 'R: application status mutated');
  assert(A.event.reason_codes.includes(REASON.PROG_LOAD_TOP_RANGE_RIR), 'R: reason codes stored');
  assert(A.event.increment_value === 5, 'R: increment stored');
  assert(A.application_key.includes(USER) && A.application_key.includes('progress_load'), 'R: deterministic key');

  assert(D.event.application_status === 'not_applied', 'S: stale is auditable');
  assert(D.abort_reason === 'STALE_TARGET_PRESCRIPTION', 'S: stale reason');
  assert(workingWeight(staleTarget) === '200', 'S: no mutation on failed apply');

  const chosen = selectNextEligibleExposure(source, [fridayLogged, mondayActivated]);
  assert(chosen?.exercise_id === 'ex-mon2', 'next-exposure skips logged Friday');
  const key = applicationKey({
    user_id: USER,
    source_workout_id: source.workout_id,
    source_exercise_id: source.exercise_id,
    target_workout_id: friday.workout_id,
    target_exercise_id: friday.exercise_id,
    catalog_exercise_id: CAT,
    decision: 'progress_load',
  });
  assert(key === A.application_key, 'application key is stable');
  assert(!A.application_key.includes('1.4.4') && !A.application_key.includes(ADAPTATION_ENGINE_VERSION) && !A.application_key.includes(APPLY_ENGINE_VERSION), 'application key excludes engine/science versions');

  const copy: LedgerEventRecord = { ...A.event };
  assert(copy.apply_engine_version === undefined, '2A.3 version lives on after_json, not by overloading 2A.1 columns');
  void APPLY_ENGINE_VERSION;

  const text = explainAdaptation({
    decision: 'progress_load',
    reason_codes: [REASON.PROG_LOAD_TOP_RANGE_RIR],
    exercise_name: 'Barbell Bench Press',
    from_load: '185',
    to_load: '190',
    unit: 'lb',
    increment: 5,
    rep_min: 8,
    rep_max: 10,
  });
  assert(/185/.test(text.why) && /190/.test(text.why) && /8–10/.test(text.why), 'explanation template mentions load and range');
  assert(!/increased/.test(N.explanation.why), 'no-target explanation does not claim a load increase');
  assert(/not change/.test(D.explanation.why) || /did not overwrite/.test(D.explanation.why), 'stale explanation is conservative');

  const week2Mon = candidate({ exercise_id: 'ex-w2-mon', week: 2, day_order: 1, week_status: 'template', day_label: 'Mon' });
  const week3Mon = candidate({ exercise_id: 'ex-w3-mon', week: 3, day_order: 1, week_status: 'template', day_label: 'Mon' });
  const fridayDone = candidate({ exercise_id: 'ex-w1-fri-done', week: 1, day_order: 3, has_performance: true });
  const U = applyProgressionDecision({
    source: { ...source, workout_id: 'w-1-3', exercise_id: 'ex-w1-fri-done', week: 1, day_order: 3 },
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [fridayDone, week2Mon, week3Mon],
  });
  assert(U.status === 'mutated' && U.target?.exercise_id === 'ex-w2-mon', 'U: first template Monday is the target');
  assert(workingWeight(week2Mon) === '190', 'U: Week 2 Monday becomes 190');
  assert(workingWeight(week3Mon) === '185', 'U: Week 3 remains unchanged');
  assert(week2Mon.week_status === 'template' && week3Mon.week_status === 'template', 'U: week_status stays template');

  const vTemplate = candidate({ exercise_id: 'ex-v-template', week: 2, day_order: 1, week_status: 'template', has_performance: true });
  const V = applyProgressionDecision({
    source: { ...source, workout_id: 'w-1-3v', exercise_id: 'ex-fri-v', week: 1, day_order: 3 },
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [vTemplate],
  });
  assert(V.status === 'not_applied' && V.abort_reason === 'NO_ELIGIBLE_TARGET', 'V: template with performance is not eligible');
  assert(workingWeight(vTemplate) === '185', 'V: no mutation');

  const wTemplate = candidate({ exercise_id: 'ex-w-template', week: 2, day_order: 1, week_status: 'template' });
  const wExpected = prescriptionFingerprint(wTemplate.planned_sets);
  wTemplate.planned_sets.forEach((s) => {
    if (s.set_type === 'working') s.target_weight = '200';
  });
  const W = applyProgressionDecision({
    source: { ...source, workout_id: 'w-1-3w', exercise_id: 'ex-fri-w', week: 1, day_order: 3 },
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [wTemplate],
    expected_fingerprint: wExpected,
  });
  assert(W.abort_reason === 'STALE_TARGET_PRESCRIPTION' && W.status === 'not_applied', 'W: edited template is stale');
  assert(workingWeight(wTemplate) === '200' && wTemplate.week_status === 'template', 'W: keep the edit and template status');

  const xCompleted = candidate({ exercise_id: 'ex-x-completed', week: 2, day_order: 1, week_status: 'completed' });
  const xLocked = candidate({ exercise_id: 'ex-x-locked', week: 2, day_order: 2, week_status: 'locked' });
  const Xc = applyProgressionDecision({
    source: { ...source, workout_id: 'w-1-3x', exercise_id: 'ex-fri-x', week: 1, day_order: 3 },
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [xCompleted],
  });
  const Xl = applyProgressionDecision({
    source: { ...source, workout_id: 'w-1-3x', exercise_id: 'ex-fri-x', week: 1, day_order: 3 },
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [xLocked],
  });
  assert(Xc.abort_reason === 'NO_ELIGIBLE_TARGET' && workingWeight(xCompleted) === '185', 'X: completed is never eligible');
  assert(Xl.abort_reason === 'NO_ELIGIBLE_TARGET' && workingWeight(xLocked) === '185', 'X: locked is never eligible');

  const yTarget = candidate({ exercise_id: 'ex-y', week: 1, day_order: 3 });
  const Y1 = applyProgressionDecision({
    source: { ...source, exercise_id: 'ex-mon-y' },
    decision: decision('progress_load', { proposed_load: 190, adaptation_engine_version: '2a3.0.0', science_version: '1.4.4' }),
    candidates: [yTarget],
  });
  assert(Y1.status === 'mutated' && workingWeight(yTarget) === '190', 'Y: first apply writes 190');
  const Y2 = applyProgressionDecision({
    source: { ...source, exercise_id: 'ex-mon-y' },
    decision: decision('progress_load', { proposed_load: 190, adaptation_engine_version: '2a3.0.1', science_version: '1.4.4' }),
    candidates: [yTarget],
    existing_events: [Y1.event],
  });
  assert(Y2.abort_reason === 'ALREADY_APPLIED' && workingWeight(yTarget) === '190', 'Y: newer apply-engine version does not reapply');
  assert(Y1.application_key === Y2.application_key, 'Y: application identity is version-free');

  const Z = applyProgressionDecision({
    source: { ...source, exercise_id: 'ex-mon-y' },
    decision: decision('progress_load', { proposed_load: 195, adaptation_engine_version: '2a3.0.1', science_version: '1.4.5' }),
    candidates: [yTarget],
    existing_events: [Y1.event],
  });
  assert(Z.abort_reason === 'ALREADY_APPLIED' && workingWeight(yTarget) === '190', 'Z: science version change does not reapply');
  assert(Z.application_key === Y1.application_key, 'Z: same source/target/decision identity');

  const aaTarget = candidate({ exercise_id: 'ex-aa', week: 1, day_order: 3 });
  const aaExpected = prescriptionFingerprint(aaTarget.planned_sets);
  aaTarget.planned_sets.forEach((s) => {
    if (s.set_type === 'working') s.target_weight = '200';
  });
  const AA1 = applyProgressionDecision({
    source: { ...source, exercise_id: 'ex-mon-aa' },
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [aaTarget],
    expected_fingerprint: aaExpected,
  });
  assert(AA1.status === 'not_applied' && AA1.abort_reason === 'STALE_TARGET_PRESCRIPTION', 'AA: first attempt is stale');
  assert(workingWeight(aaTarget) === '200', 'AA: manual 200 kept');
  aaTarget.planned_sets.forEach((s) => {
    if (s.set_type === 'working') s.target_weight = '185';
  });
  const AA2 = applyProgressionDecision({
    source: { ...source, exercise_id: 'ex-mon-aa' },
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [aaTarget],
    expected_fingerprint: aaExpected,
    existing_events: [AA1.event],
  });
  assert(AA2.status === 'mutated' && workingWeight(aaTarget) === '190', 'AA: after restore, same identity may succeed once');
  assert(AA2.application_key === AA1.application_key, 'AA: stale and success share the adaptation identity');
  const AA3 = applyProgressionDecision({
    source: { ...source, exercise_id: 'ex-mon-aa' },
    decision: decision('progress_load', { proposed_load: 190 }),
    candidates: [aaTarget],
    existing_events: [AA1.event, AA2.event],
  });
  assert(AA3.abort_reason === 'ALREADY_APPLIED' && workingWeight(aaTarget) === '190', 'AA: later retries do not mutate again');

  const profile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle' },
    trainingProfile: { preferred_session_minutes: 60 },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      weeks: 2,
      sessionMinutes: 60,
    },
  });
  const science = generateProgram(profile, FALLBACK_CATALOG);
  assert(science.workouts.filter((w) => w.week === 1).length === 3, 'T: Phase 1 still generates week 1');
  const custom = {
    id: 'custom-1',
    name: 'User Curl',
    user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    is_system: false,
    is_archived: false,
  };
  assert(!isAiGenerationEligibleRow(custom), 'T: customs still excluded');
  const masters = Array.from({ length: 260 }, (_, i) => ({
    id: String(i + 1),
    name: `Master ${i + 1}`,
    is_archived: false,
    is_system: true,
    user_id: null,
    external_source: MASTER_CATALOG_SOURCE,
  }));
  assert(selectAiGenerationCatalogRows([...masters, custom]).length === 260, 'T: 260-card policy');
  assert(adaptGenerationCatalog([...masters, custom], { allowFallback: false }).length === 260, 'T: adapted 260');
  console.log('BIQ-0219 Phase 2A.3 apply-layer checks passed.');
  console.log(`A Friday ${workingWeight(friday)} after progress; U Week2 ${workingWeight(week2Mon)} template; Y/Z version-stable; AA ${AA3.abort_reason}`);
}
