import { generateProgram } from '../generateProgram';
import { trainingProfileFromSources } from '../profile';
import { adaptGenerationCatalog, isAiGenerationEligibleRow, selectAiGenerationCatalogRows } from '../generation/catalogEligibility';
import { FALLBACK_CATALOG } from '../catalogAdapter';
import { MASTER_CATALOG_SOURCE } from '../../training/masterCatalog';
import { extraSetInsertPayload, countsTowardProgression } from '../../training/extraSets';
import { canAddPlannedSetAfterSiblingLogs, canRewritePlannedSetPrescription } from '../../training/plannedSetGuard';
import { plannedRepRangeFromLog } from '../../training/setLogSnapshots';
import { evaluateProgressionDecision, adaptationDraftFromDecision } from './decision';
import { REASON, RIR_TOLERANCE } from './reasonCodes';
import { resolveLoadIncrement, roundLoadToIncrement } from './increments';
import { reportedRirOrUnknown } from './confidence';
import type { ExerciseExposureInput, LoggedSetInput } from './inputs';
import type { ProgressionDecisionKind } from './types';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const CAT = '11111111-1111-1111-1111-111111111111';

function set(reps: number, opts: Partial<LoggedSetInput> & { id?: string } = {}): LoggedSetInput {
  const extra = opts.is_extra_set === true;
  return {
    planned_set_id: extra ? null : opts.planned_set_id || opts.id || `ps-${reps}-${opts.snapshot_set_number || 1}`,
    is_extra_set: extra,
    completed: opts.completed ?? true,
    set_type: opts.set_type || 'working',
    snapshot_set_type: opts.snapshot_set_type || opts.set_type || 'working',
    snapshot_rep_min: opts.snapshot_rep_min ?? 8,
    snapshot_rep_max: opts.snapshot_rep_max ?? 10,
    snapshot_target_rir: opts.snapshot_target_rir === undefined ? 2 : opts.snapshot_target_rir,
    snapshot_target_reps: opts.snapshot_target_reps || '8-10',
    snapshot_program_role: opts.snapshot_program_role || 'primary',
    snapshot_catalog_exercise_id: opts.snapshot_catalog_exercise_id || CAT,
    actual_weight: opts.actual_weight ?? 185,
    actual_reps: opts.actual_reps ?? reps,
    actual_rir: Object.prototype.hasOwnProperty.call(opts, 'actual_rir') ? opts.actual_rir : 2,
    actual_rpe: opts.actual_rpe,
    actual_duration: opts.actual_duration,
    actual_distance: opts.actual_distance,
    side: opts.side ?? null,
    is_deleted: opts.is_deleted,
    snapshot_section: opts.snapshot_section,
    snapshot_set_number: opts.snapshot_set_number,
  };
}

function bench(opts: Partial<ExerciseExposureInput> & { reps?: number[]; rir?: Array<number | null>; date?: string } = {}): ExerciseExposureInput {
  const reps = opts.reps || [10, 10, 10];
  return {
    log_date: opts.date || '2026-09-24',
    catalog_exercise_id: opts.catalog_exercise_id || CAT,
    exercise_name: opts.exercise_name || 'Barbell Bench Press',
    program_role: opts.program_role || 'primary',
    measurement_type: opts.measurement_type || 'reps',
    laterality: opts.laterality || 'bilateral',
    equipment: opts.equipment || 'Barbell',
    movement_pattern: opts.movement_pattern || 'horizontal_push',
    loadable: opts.loadable,
    load_mode: opts.load_mode,
    prescription: opts.prescription || { rep_min: 8, rep_max: 10, target_rir: 2, working_set_count: 3 },
    sets: opts.sets || reps.map((r, i) => set(r, { actual_rir: Array.isArray(opts.rir) ? opts.rir[i] : 2, snapshot_set_number: i + 1, id: `ps-${opts.date || 'cur'}-${i}` })),
    workout_status: opts.workout_status,
    exercise_status: opts.exercise_status,
    attempt_outcome: opts.attempt_outcome,
    pain_flag: opts.pain_flag,
    pain_associated: opts.pain_associated,
    units: opts.units || 'lb',
    user_increment: opts.user_increment,
    gym_increment: opts.gym_increment,
  };
}

function decide(current: ExerciseExposureInput, history: ExerciseExposureInput[] = []) {
  const before = JSON.stringify(current);
  const out = evaluateProgressionDecision({ current, history });
  assert(JSON.stringify(current) === before, '2A.2 must not mutate the exposure input');
  assert(out.applied === false, '2A.2 must never apply the decision');
  assert(out.reason_codes.length >= 1, 'every decision needs a reason code');
  return out;
}

function expect(kind: ProgressionDecisionKind, current: ExerciseExposureInput, history?: ExerciseExposureInput[]) {
  const out = decide(current, history);
  assert(out.decision === kind, `expected ${kind}, got ${out.decision} (${out.reason_codes.join(',')}) — ${out.explanation.summary}`);
  return out;
}

export function runPhase2a2DecisionChecks() {
  const A = expect('progress_load', bench({ reps: [10, 10, 10], rir: [2, 2, 2] }));
  assert(A.reason_codes.includes(REASON.PROG_LOAD_TOP_RANGE_RIR), 'A: RIR-confirmed progression code');
  assert(A.confidence === 'high', 'A: high confidence');
  assert(A.proposed_load === 190, `A: 185+5, got ${A.proposed_load}`);

  const B = expect('hold', bench({ reps: [10, 10, 10], rir: [null, null, null] }));
  assert(B.reason_codes.includes(REASON.HOLD_FIRST_NO_RIR_CONFIRMATION), 'B: first no-RIR hold');
  assert(B.proposed_load === 185, 'B: keep 185');

  const firstNoRir = bench({ date: '2026-09-10', reps: [10, 10, 10], rir: [null, null, null] });
  const C = expect('progress_load', bench({ date: '2026-09-17', reps: [10, 10, 10], rir: [null, null, null] }), [firstNoRir]);
  assert(C.reason_codes.includes(REASON.PROG_LOAD_REPEATED_PERFORMANCE), 'C: repeated-performance progression');
  assert(C.confidence === 'performance_only', 'C: performance-only confidence');
  assert(C.proposed_load === 190, `C: propose 190, got ${C.proposed_load}`);

  const D1 = expect('build_reps', bench({ reps: [10, 9, 8], rir: [2, 2, 2] }));
  assert(D1.reason_codes.includes(REASON.BUILD_REPS_WITHIN_RANGE), 'D: 10/9/8 builds reps');
  const D2 = expect('build_reps', bench({ reps: [9, 9, 8], rir: [2, 2, 2] }));
  assert(D2.proposed_load === 185, 'D: retain load');

  const E = expect('hold', bench({ reps: [10, 10, 10], rir: [0, 0, 0] }));
  assert(E.reason_codes.includes(REASON.HOLD_EXCESSIVE_EFFORT), 'E: RIR 0 vs target 2 does not progress');
  assert(E.proposed_load === 185, 'E: hold 185');

  const F = expect('hold', bench({ reps: [8, 8, 7], rir: [2, 2, 1] }));
  assert(F.reason_codes.includes(REASON.HOLD_SINGLE_BAD_EXPOSURE), 'F: one poor exposure holds');

  const poor1 = bench({ date: '2026-09-03', reps: [7, 7, 6], rir: [1, 1, 0] });
  const G = expect('reduce_load', bench({ date: '2026-09-17', reps: [7, 6, 6], rir: [1, 0, 0] }), [poor1]);
  assert(G.reason_codes.includes(REASON.REDUCE_REPEATED_BELOW_RANGE), 'G: repeated below-minimum reduces');
  assert(G.proposed_load === 180, `G: 185-5, got ${G.proposed_load}`);

  const priorTop = bench({ date: '2026-09-10', reps: [10, 10, 10], rir: [2, 2, 2] });
  const H = expect(
    'build_reps',
    bench({
      date: '2026-09-17',
      reps: [8, 8, 8],
      rir: [2, 2, 2],
      sets: [8, 8, 8].map((r, i) => set(r, { actual_weight: 190, actual_rir: 2, id: `h-${i}` })),
    }),
    [priorTop]
  );
  assert(H.reason_codes.includes(REASON.HOLD_SUCCESSFUL_LOAD_STEP), 'H: manual 185→190 with 8/8/8 is not regression');
  assert(H.proposed_load === 190, 'H: keep the new load');

  const I = expect('insufficient_data', bench({ workout_status: 'skipped', sets: [], reps: [] }));
  assert(I.reason_codes.includes(REASON.INSUFFICIENT_SKIPPED), 'I: skipped workout');

  const J = expect('insufficient_data', bench({ exercise_status: 'skipped', attempt_outcome: 'did_not_perform', sets: [] }));
  assert(J.reason_codes.includes(REASON.INSUFFICIENT_SKIPPED), 'J: skipped exercise');

  const Kfull = expect(
    'progress_load',
    bench({ workout_status: 'partial', exercise_status: 'completed', reps: [10, 10, 10], rir: [2, 2, 2] })
  );
  assert(Kfull.decision === 'progress_load', 'K: completed exercise inside a partial workout still evaluates');
  const Kpartial = expect(
    'insufficient_data',
    bench({
      workout_status: 'partial',
      exercise_status: 'partial',
      prescription: { rep_min: 8, rep_max: 10, target_rir: 2, working_set_count: 3 },
      sets: [set(10, { id: 'only-one' })],
    })
  );
  assert(Kpartial.reason_codes.includes(REASON.INSUFFICIENT_PARTIAL), 'K: one of three logged sets is insufficient');

  const L = expect(
    'build_reps',
    bench({
      sets: [
        set(9, { id: 'l1', snapshot_set_number: 1 }),
        set(9, { id: 'l2', snapshot_set_number: 2 }),
        set(8, { id: 'l3', snapshot_set_number: 3 }),
        set(12, { is_extra_set: true, extra_set_number: 1, actual_weight: 185, planned_set_id: null } as any),
      ],
    })
  );
  assert(!countsTowardProgression({ is_extra_set: true }), 'L: extras are excluded from progression qualification');
  assert(L.reason_codes.includes(REASON.NOTE_EXTRAS_EXCLUDED), 'L: extra PR is noted and ignored');
  assert(L.decision === 'build_reps', 'L: extra 12 does not trigger load progress');

  const extraPayload = extraSetInsertPayload({
    exercise_id: 'exA',
    log_date: '2026-09-24',
    extra_set_number: 1,
    actual_reps: '12',
    actual_weight: '185',
  });
  assert(extraPayload.planned_set_id == null && extraPayload.is_extra_set === true, 'L: extra insert model unchanged');

  const M = expect(
    'progress_load',
    bench({
      sets: [
        set(15, { set_type: 'warmup', snapshot_set_type: 'warmup', id: 'wu', actual_weight: 45, actual_rir: null }),
        set(5, { set_type: 'ramp', snapshot_set_type: 'ramp', id: 'ramp', actual_weight: 135, actual_rir: null }),
        set(10, { id: 'm1', snapshot_set_number: 1 }),
        set(10, { id: 'm2', snapshot_set_number: 2 }),
        set(10, { id: 'm3', snapshot_set_number: 3 }),
      ],
    })
  );
  assert(M.reason_codes.includes(REASON.NOTE_WARMUP_RAMP_EXCLUDED), 'M: warmups/ramps excluded');
  assert(M.proposed_load === 190, 'M: only working 10/10/10 @2 progress');

  const N = expect('pain_hold', bench({ reps: [10, 10, 10], rir: [2, 2, 2], pain_flag: 'pain_limiting' }));
  assert(N.reason_codes.includes(REASON.PAIN_HOLD), 'N: pain limiting holds');
  assert(N.proposed_load === 185, 'N: no load increase under pain');

  const O = expect('progress_load', bench({ reps: [10, 10, 10], rir: [2, 2, 2], pain_flag: null }));
  assert(!O.reason_codes.includes(REASON.PAIN_HOLD), 'O: unanswered pain is not treated as no-pain hold or as pain');
  assert(O.decision === 'progress_load', 'O: null pain does not block an otherwise valid RIR progression');

  const P = expect(
    'hold',
    bench({
      exercise_name: 'Pull-Up',
      equipment: 'bodyweight',
      load_mode: 'bodyweight',
      laterality: 'bilateral',
      prescription: { rep_min: 6, rep_max: 8, target_rir: 2, working_set_count: 3 },
      sets: [8, 8, 8].map((r, i) =>
        set(r, { actual_weight: '', snapshot_rep_min: 6, snapshot_rep_max: 8, snapshot_target_reps: '6-8', id: `p-${i}` })
      ),
    })
  );
  assert(P.reason_codes.includes(REASON.HOLD_BODYWEIGHT_NO_EXTERNAL_LOAD), 'P: unweighted pull-up does not add 5 lb');
  assert(P.proposed_load === 0 || P.proposed_load == null, `P: no invented load, got ${P.proposed_load}`);

  const Q = expect(
    'progress_load',
    bench({
      exercise_name: 'Pull-Up',
      equipment: 'bodyweight',
      load_mode: 'weighted_bodyweight',
      prescription: { rep_min: 6, rep_max: 8, target_rir: 2, working_set_count: 3 },
      sets: [8, 8, 8].map((r, i) =>
        set(r, { actual_weight: 25, snapshot_rep_min: 6, snapshot_rep_max: 8, snapshot_target_reps: '6-8', id: `q-${i}` })
      ),
    })
  );
  assert(Q.decision === 'progress_load', 'Q: weighted bodyweight may progress the added load');
  assert(Q.proposed_load === 27.5, `Q: 25+2.5, got ${Q.proposed_load}`);

  const R = expect(
    'progress_load',
    bench({
      laterality: 'unilateral',
      exercise_name: 'Dumbbell Row',
      equipment: 'Dumbbell',
      reps: [10, 10, 10],
      rir: [2, 2, 2],
    })
  );
  assert(R.reason_codes.includes(REASON.NOTE_UNILATERAL_NO_SIDE_SPLIT), 'R: no side-specific logs — limitation noted');
  const Rsplit = expect(
    'hold',
    bench({
      laterality: 'unilateral',
      equipment: 'Dumbbell',
      exercise_name: 'Dumbbell Row',
      sets: [
        set(10, { side: 'left', id: 'rl1' }),
        set(10, { side: 'left', id: 'rl2' }),
        set(7, { side: 'right', id: 'rr1' }),
        set(7, { side: 'right', id: 'rr2' }),
      ],
    })
  );
  assert(Rsplit.decision !== 'progress_load', 'R: weaker side blocks load progress');

  const S = expect(
    'hold',
    bench({
      measurement_type: 'time',
      exercise_name: 'Farmer Carry',
      equipment: 'Dumbbell',
      sets: [set(1, { actual_reps: '', actual_duration: '40s', actual_rir: null })],
    })
  );
  assert(S.reason_codes.includes(REASON.HOLD_NON_REP_MEASUREMENT), 'S: time/distance is conservative hold');

  const T = evaluateProgressionDecision({
    current: {
      log_date: '2026-01-01',
      exercise_name: 'Legacy Press',
      measurement_type: 'reps',
      sets: [{ actual_reps: '8', actual_weight: '135', completed: true, actual_rir: null }],
    },
  });
  assert(T.applied === false, 'T: null-snapshot logs do not crash');
  assert(T.decision === 'insufficient_data', `T: conservative insufficient, got ${T.decision}`);
  assert(T.reason_codes.includes(REASON.INSUFFICIENT_NULL_SNAPSHOT), 'T: null snapshot reason');
  const oldRange = plannedRepRangeFromLog({ snapshot_target_reps: '8-10' }, { rep_min: 8, rep_max: 10 });
  assert(oldRange.min === 8 && oldRange.raw === '8-10', 'T: old logs still render a range');

  const rirInvent = decide(
    bench({
      sets: [10, 10, 10].map((r, i) => set(r, { actual_rir: null, actual_rpe: 8, id: `rpe-${i}` })),
    })
  );
  assert(reportedRirOrUnknown(null) === null, 'RPE-only logs never invent RIR');
  assert(rirInvent.decision === 'hold', 'RPE without RIR uses the no-RIR confirmation path');
  assert(rirInvent.reason_codes.includes(REASON.HOLD_FIRST_NO_RIR_CONFIRMATION), 'RPE is not converted to RIR 2');

  const eight = expect('build_reps', bench({ reps: [8, 8, 8], rir: [2, 2, 2] }));
  assert(eight.reason_codes.includes(REASON.BUILD_REPS_WITHIN_RANGE), '8/8/8 at compatible effort builds reps');

  const discomfort = expect('review_required', bench({ reps: [10, 10, 10], rir: [2, 2, 2], pain_flag: 'discomfort' }));
  assert(discomfort.reason_codes.includes(REASON.REVIEW_PAIN_DISCOMFORT), 'unassociated discomfort reviews');
  const discomfortKnown = expect(
    'pain_hold',
    bench({ reps: [10, 10, 10], rir: [2, 2, 2], pain_flag: 'discomfort', pain_associated: true })
  );
  assert(discomfortKnown.decision === 'pain_hold', 'associated discomfort does not progress');

  const couldNot = decide(
    bench({
      attempt_outcome: 'could_not_complete',
      exercise_status: 'partial',
      sets: [set(10, { id: 'c1' }), set(7, { id: 'c2' })],
    })
  );
  assert(couldNot.decision === 'hold' || couldNot.decision === 'insufficient_data', 'could_not_complete uses logged sets as evidence');
  assert(!couldNot.reason_codes.includes(REASON.INSUFFICIENT_SKIPPED), 'could_not_complete is not treated as skipped');

  const otherLift = bench({
    date: '2026-09-10',
    catalog_exercise_id: '22222222-2222-2222-2222-222222222222',
    exercise_name: 'Back Squat',
    reps: [10, 10, 10],
    rir: [null, null, null],
  });
  const notComparable = expect('hold', bench({ date: '2026-09-17', reps: [10, 10, 10], rir: [null, null, null] }), [otherLift]);
  assert(notComparable.reason_codes.includes(REASON.HOLD_FIRST_NO_RIR_CONFIRMATION), 'different catalog id is not a confirmation exposure');

  const stale = bench({ date: '2026-07-01', reps: [10, 10, 10], rir: [null, null, null] });
  const windowed = expect('hold', bench({ date: '2026-09-17', reps: [10, 10, 10], rir: [null, null, null] }), [stale]);
  assert(windowed.reason_codes.includes(REASON.HOLD_FIRST_NO_RIR_CONFIRMATION), 'history older than 42 days is ignored');

  const rounded = roundLoadToIncrement(187.4, 5);
  assert(rounded === 185 || rounded === 190, 'rounding stays on increment steps');
  const plate = resolveLoadIncrement({ equipment: 'Plate-loaded', units: 'lb' });
  assert(plate.increment === 10 && plate.rounding === 'nearest_increment', 'plate-loaded has its own increment');

  const draft = adaptationDraftFromDecision(A, { user_id: 'user-a', exercise_catalog_id: CAT });
  assert(draft.decision === 'progress_load' && draft.actor === 'engine', 'ledger draft is available for 2A.3');
  assert((draft.after_json as any).applied === false, 'draft records that 2A.2 did not apply');

  assert(RIR_TOLERANCE === 0.5, 'RIR tolerance is 0.5');
  const almost = expect('progress_load', bench({ reps: [10, 10, 10], rir: [1.5, 2, 2] }));
  assert(almost.decision === 'progress_load', 'RIR 1.5 vs target 2 is within tolerance');
  const tooHard = expect('hold', bench({ reps: [10, 10, 10], rir: [1, 1, 1] }));
  assert(tooHard.reason_codes.includes(REASON.HOLD_EXCESSIVE_EFFORT), 'RIR 1 vs target 2 is excessive');

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
  assert(science.workouts.filter((w) => w.week === 1).length === 3, 'Phase 1 generation still produces week 1');
  const custom = {
    id: 'custom-1',
    name: 'User Curl',
    user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    is_system: false,
    is_archived: false,
  };
  assert(!isAiGenerationEligibleRow(custom), '260-card policy still excludes customs');
  const masters = Array.from({ length: 260 }, (_, i) => ({
    id: String(i + 1),
    name: `Master ${i + 1}`,
    is_archived: false,
    is_system: true,
    user_id: null,
    external_source: MASTER_CATALOG_SOURCE,
  }));
  assert(selectAiGenerationCatalogRows([...masters, custom]).length === 260, 'eligibility stays 260');
  assert(adaptGenerationCatalog([...masters, custom], { allowFallback: false }).length === 260, 'adapted catalog stays 260');
  assert(canAddPlannedSetAfterSiblingLogs().ok, '2A.1 mid-session add remains allowed');
  assert(!canRewritePlannedSetPrescription({ plannedSetId: 'psA', logs: [{ planned_set_id: 'psA', completed: true, actual_reps: '8' }] }).ok, '2A.1 logged-set rewrite guard unchanged');

  console.log('BIQ-0218 Phase 2A.2 decision-engine checks passed.');
  console.log(`A bench 185x10/10/10 @RIR2 → ${A.proposed_load} lb (${A.reason_codes[0]})`);
  console.log(`C two no-RIR top-range exposures → ${C.proposed_load} lb (${C.reason_codes[0]})`);
  console.log(`H manual 190x8/8/8 → ${H.decision} at ${H.proposed_load}`);
}
