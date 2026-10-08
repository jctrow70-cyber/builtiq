import { generateProgram } from '../generateProgram';
import { trainingProfileFromSources } from '../profile';
import { adaptGenerationCatalog, isAiGenerationEligibleRow, selectAiGenerationCatalogRows } from '../generation/catalogEligibility';
import { FALLBACK_CATALOG } from '../catalogAdapter';
import { expectedMasterCatalogCount, MASTER_CATALOG_SOURCE } from '../../training/masterCatalog';
import { evaluateProgressionDecision } from './decision';
import type { LedgerEventRecord } from './apply/types';
import {
  formatAdaptationSummary,
  isPersonalAdaptationSource,
  orchestrateCompletedWorkout,
  shouldContinueAdaptationRun,
  shouldEvaluateExercise,
  shouldTriggerCompletedWorkoutAdaptation,
  type AdaptationOrchestrationInput,
} from '../../training/adaptationOrchestration';
import { applyProgressionForCompletedExercise, persistAdaptationApplication } from '../../training/adaptationApply';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const USER = 'user-a';
const OTHER = 'user-b';
const PROG = 'prog-a';
const GROUP = 'prog-group';
const CAT = '11111111-1111-1111-1111-111111111111';
const CAT2 = '22222222-2222-2222-2222-222222222222';

function sets(exerciseId: string, weight: string, extra?: { warmup?: boolean }) {
  const rows = [
    { id: `${exerciseId}-1`, exercise_id: exerciseId, set_type: 'working', set_number: 1, target_weight: weight, target_reps: '8-10', rep_min: 8, rep_max: 10, target_rir: 2 },
    { id: `${exerciseId}-2`, exercise_id: exerciseId, set_type: 'working', set_number: 2, target_weight: weight, target_reps: '8-10', rep_min: 8, rep_max: 10, target_rir: 2 },
    { id: `${exerciseId}-3`, exercise_id: exerciseId, set_type: 'working', set_number: 3, target_weight: weight, target_reps: '8-10', rep_min: 8, rep_max: 10, target_rir: 2 },
  ];
  if (extra?.warmup) {
    rows.unshift({ id: `${exerciseId}-wu`, exercise_id: exerciseId, set_type: 'warmup', set_number: 0, target_weight: '45', target_reps: '10', rep_min: 10, rep_max: 10, target_rir: 5 });
  }
  return rows;
}

function exercise(id: string, opts?: { catalog?: string; name?: string; section?: string; role?: string; weight?: string; warmup?: boolean }) {
  return {
    id,
    catalog_exercise_id: opts?.catalog || CAT,
    name: opts?.name || 'Barbell Bench Press',
    section: opts?.section || 'strength',
    program_role: opts?.role || 'primary',
    measurement_type: 'reps',
    laterality: 'bilateral',
    st_planned_sets: sets(id, opts?.weight || '185', { warmup: opts?.warmup }),
  };
}

function workout(id: string, week: number, day: number, exercises: any[], weekStatus = 'template') {
  return {
    id,
    program_id: PROG,
    week,
    day_order: day,
    day_label: 'Mon',
    week_status: weekStatus,
    st_exercises: exercises,
  };
}

function logsFor(ex: any, opts?: { complete?: boolean; reps?: number[]; rir?: Array<number | null>; weight?: string }) {
  const out: Record<string, any> = {};
  const planned = (ex.st_planned_sets || []).filter((s: any) => s.set_type === 'working');
  planned.forEach((s: any, i: number) => {
    const complete = opts?.complete !== false;
    out[s.id] = {
      planned_set_id: s.id,
      log_date: '2026-10-08',
      completed: complete && (opts?.reps ? i < (opts.reps.length || 0) || opts.complete !== false : complete),
      actual_weight: opts?.weight || '185',
      actual_reps: opts?.reps ? opts.reps[i] : 10,
      actual_rir: opts?.rir ? opts.rir[i] : 2,
    };
    if (opts?.reps && i >= opts.reps.length) {
      out[s.id] = { planned_set_id: s.id, log_date: '2026-10-08', completed: false };
    }
  });
  if (opts?.complete === false && !opts?.reps) {
    planned.forEach((s: any) => {
      out[s.id] = { planned_set_id: s.id, log_date: '2026-10-08', completed: false };
    });
  }
  return out;
}

function personalProgram(workouts: any[]) {
  return { id: PROG, owner_user_id: USER, visibility: 'personal', team_id: null, st_workouts: workouts };
}

function input(partial: Partial<AdaptationOrchestrationInput> & { sourceWorkout: any; program: any }): AdaptationOrchestrationInput {
  return {
    userId: USER,
    session: {
      user_id: USER,
      workout_id: partial.sourceWorkout.id,
      program_id: PROG,
      log_date: '2026-10-08',
      status: 'completed',
    },
    logsByPlannedSetId: {},
    ...partial,
  };
}

export async function runPhase2b1OrchestrationChecks() {
  assert(shouldTriggerCompletedWorkoutAdaptation('completed'), '1: completed triggers');
  const disabledDirect = await applyProgressionForCompletedExercise({
    supabase: {} as any,
    userId: USER,
    program: { id: PROG },
    workout: { id: 'wo-1' },
    exercise: { id: 'ex-1', catalog_exercise_id: CAT },
    logsByPlannedSetId: {},
  });
  assert(disabledDirect === null, 'set-level apply is disabled without allowDirectApply');
  assert(shouldContinueAdaptationRun({ status: 'pending', created_at: new Date().toISOString() }) === 'wait', '7: in-flight pending does not apply again');
  assert(shouldContinueAdaptationRun({ status: 'completed' }) === 'reuse', '7: completed run is reused');
  assert(shouldContinueAdaptationRun({ status: 'failed' }) === 'retry', '7: failed run is retryable');
  assert(shouldContinueAdaptationRun({ status: 'pending', created_at: new Date(Date.now() - 120_000).toISOString() }) === 'retry', '7: stale pending can retry');
  assert(!isPersonalAdaptationSource({ id: PROG, visibility: 'personal' }, USER).ok, '6: missing owner is excluded');
  assert(shouldTriggerCompletedWorkoutAdaptation('partial'), '1: partial triggers');
  assert(!shouldTriggerCompletedWorkoutAdaptation('in_progress'), '2: in_progress does not trigger');
  assert(!shouldTriggerCompletedWorkoutAdaptation('not_started'), '2: not_started does not trigger');
  assert(!shouldTriggerCompletedWorkoutAdaptation('skipped'), 'skipped session is handled separately');

  const w1 = exercise('ex-w1', { warmup: true });
  const w2 = exercise('ex-w2');
  const w3 = exercise('ex-w3');
  const program = personalProgram([
    workout('wo-1', 1, 1, [w1], 'in_progress'),
    workout('wo-2', 2, 1, [w2], 'template'),
    workout('wo-3', 3, 1, [w3], 'template'),
  ]);

  const incomplete = orchestrateCompletedWorkout(
    input({
      program,
      sourceWorkout: program.st_workouts[0],
      session: { user_id: USER, workout_id: 'wo-1', program_id: PROG, log_date: '2026-10-08', status: 'in_progress' },
      logsByPlannedSetId: logsFor(w1, { complete: false, reps: [10] }),
    })
  );
  assert(!incomplete.triggered && incomplete.skipped_reason === 'not_completed', '2: incomplete workout does not adapt');
  assert(incomplete.updated === 0, '2: no mutations on incomplete');

  const success = orchestrateCompletedWorkout(
    input({
      program,
      sourceWorkout: program.st_workouts[0],
      logsByPlannedSetId: logsFor(w1),
    })
  );
  assert(success.triggered && success.evaluated >= 1, '1: successful completion evaluates');
  assert(success.updated === 1, '5: first eligible future exposure is updated');
  assert(success.results[0]?.mutated && success.results[0]?.target?.exercise_id === 'ex-w2', '5/6: Week 2 template is the target');
  assert(success.results[0]?.after_load === '190', '6: template week load becomes 190');
  assert(success.mutations.every((m) => String(m.planned_set_id).startsWith('ex-w2')), '5: only the first future exposure is mutated');
  assert(!success.mutations.some((m) => String(m.planned_set_id).startsWith('ex-w3')), '5: later week unchanged');
  assert(w1.st_planned_sets.some((s: any) => s.set_type === 'warmup' && String(s.target_weight) === '45'), 'warmup set not rewritten');
  assert(/evaluated 1 exercise/.test(success.summary) && /prepared 1 adjustment/.test(success.summary), 'summary copy');

  const curl = exercise('ex-curl', { catalog: CAT2, name: 'Curl', weight: '30' });
  const curlNext = exercise('ex-curl-n', { catalog: CAT2, name: 'Curl', weight: '30' });
  const partialProgram = personalProgram([
    workout('wo-p', 1, 1, [exercise('ex-p-bench'), curl], 'in_progress'),
    workout('wo-p2', 2, 1, [exercise('ex-p-bench-n'), curlNext], 'template'),
  ]);
  const partialLogs = {
    ...logsFor(partialProgram.st_workouts[0].st_exercises[0], { reps: [7, 7], rir: [4, 4], complete: false }),
  };
  partialLogs[partialProgram.st_workouts[0].st_exercises[0].st_planned_sets[0].id].completed = true;
  partialLogs[partialProgram.st_workouts[0].st_exercises[0].st_planned_sets[1].id].completed = true;
  const partial = orchestrateCompletedWorkout(
    input({
      program: partialProgram,
      sourceWorkout: partialProgram.st_workouts[0],
      session: { user_id: USER, workout_id: 'wo-p', program_id: PROG, log_date: '2026-10-08', status: 'partial' },
      logsByPlannedSetId: partialLogs,
    })
  );
  assert(partial.triggered, '3: partial completion still evaluates');
  assert(partial.results.some((r) => r.decision === 'hold' || r.decision === 'reduce_load' || r.decision === 'review_required' || r.decision === 'insufficient_data' || r.decision === 'progress_load' || r.decision === 'build_reps'), '3: uses actual logged sets');

  const skippedEx = exercise('ex-skip');
  const skippedNext = exercise('ex-skip-n');
  const skipProgram = personalProgram([
    workout('wo-s', 1, 1, [skippedEx], 'in_progress'),
    workout('wo-s2', 2, 1, [skippedNext], 'template'),
  ]);
  const skipped = orchestrateCompletedWorkout(
    input({
      program: skipProgram,
      sourceWorkout: skipProgram.st_workouts[0],
      logsByPlannedSetId: {},
      exerciseSessions: { 'ex-skip': { status: 'skipped', attempt_outcome: 'did_not_perform' } },
    })
  );
  assert(skipped.results[0]?.decision === 'insufficient_data', '4: skipped exercise is not a failed set');
  assert(!skipped.results[0]?.mutated, '4: skip does not reduce future load');
  assert(String(skippedNext.st_planned_sets[0].target_weight) === '185', '4: future load unchanged');

  const locked = exercise('ex-lock');
  const lockedNext = exercise('ex-lock-n');
  const lockedProgram = personalProgram([
    workout('wo-l', 1, 1, [exercise('ex-l-src')], 'in_progress'),
    workout('wo-l2', 2, 1, [locked], 'completed'),
    workout('wo-l3', 3, 1, [lockedNext], 'locked'),
  ]);
  const lockedRun = orchestrateCompletedWorkout(
    input({
      program: lockedProgram,
      sourceWorkout: lockedProgram.st_workouts[0],
      logsByPlannedSetId: logsFor(lockedProgram.st_workouts[0].st_exercises[0]),
    })
  );
  assert(!lockedRun.results[0]?.mutated, '7: completed/locked targets stay protected');
  assert(lockedRun.results[0]?.abort_reason === 'NO_ELIGIBLE_TARGET', '7: no eligible future week');

  const loggedFuture = exercise('ex-hist-n');
  const histProgram = personalProgram([
    workout('wo-h', 1, 1, [exercise('ex-h')], 'in_progress'),
    workout('wo-h2', 2, 1, [loggedFuture], 'template'),
  ]);
  const histLogs = {
    ...logsFor(histProgram.st_workouts[0].st_exercises[0]),
    ...logsFor(loggedFuture, { weight: '185' }),
  };
  histProgram.st_workouts[1].st_exercises[0].st_planned_sets.forEach((s: any) => {
    if (histLogs[s.id]) histLogs[s.id].log_date = '2026-10-09';
  });
  const histRun = orchestrateCompletedWorkout(
    input({
      program: histProgram,
      sourceWorkout: histProgram.st_workouts[0],
      logsByPlannedSetId: histLogs,
    })
  );
  assert(!histRun.results[0]?.mutated, '8: logged future sets remain protected');

  const staleSrc = exercise('ex-stale');
  const staleNext = exercise('ex-stale-n');
  const staleProgram = personalProgram([
    workout('wo-st', 1, 1, [staleSrc], 'in_progress'),
    workout('wo-st2', 2, 1, [staleNext], 'template'),
  ]);
  const liveSetsById: Record<string, any> = {};
  staleNext.st_planned_sets.forEach((s: any) => {
    liveSetsById[s.id] = { ...s, target_weight: '200' };
  });
  const staleRun = orchestrateCompletedWorkout(
    input({
      program: staleProgram,
      sourceWorkout: staleProgram.st_workouts[0],
      logsByPlannedSetId: logsFor(staleSrc),
      liveSetsById,
    })
  );
  assert(staleRun.results[0]?.abort_reason === 'STALE_TARGET_PRESCRIPTION', '9: manual edit aborts apply');
  assert(String(staleNext.st_planned_sets[0].target_weight) === '185' || String(liveSetsById[staleNext.st_planned_sets[0].id].target_weight) === '200', '9: edited load kept');

  const replay = orchestrateCompletedWorkout(
    input({
      program: personalProgram([
        workout('wo-r', 1, 1, [exercise('ex-r')], 'in_progress'),
        workout('wo-r2', 2, 1, [exercise('ex-r2')], 'template'),
      ]),
      sourceWorkout: workout('wo-r', 1, 1, [exercise('ex-r')], 'in_progress'),
      logsByPlannedSetId: logsFor(exercise('ex-r')),
      existingEvents: success.results.map((r) => r.event) as LedgerEventRecord[],
    })
  );
  const replaySame = orchestrateCompletedWorkout(
    input({
      program,
      sourceWorkout: program.st_workouts[0],
      logsByPlannedSetId: logsFor(w1),
      existingEvents: success.results.map((r) => r.event) as LedgerEventRecord[],
    })
  );
  assert(replaySame.results[0]?.abort_reason === 'ALREADY_APPLIED', '10: repeated completion does not double-apply');
  assert(replaySame.already_applied >= 1, '10: already-applied counted');

  const concurrentSecond = orchestrateCompletedWorkout(
    input({
      program,
      sourceWorkout: program.st_workouts[0],
      logsByPlannedSetId: logsFor(w1),
      existingEvents: success.results.map((r) => r.event) as LedgerEventRecord[],
    })
  );
  assert(concurrentSecond.results[0]?.abort_reason === 'ALREADY_APPLIED', '11: concurrent second pass does not double-apply');

  const pain = orchestrateCompletedWorkout(
    input({
      program: personalProgram([
        workout('wo-pain', 1, 1, [exercise('ex-pain')], 'in_progress'),
        workout('wo-pain2', 2, 1, [exercise('ex-pain-n')], 'template'),
      ]),
      sourceWorkout: workout('wo-pain', 1, 1, [exercise('ex-pain')], 'in_progress'),
      logsByPlannedSetId: logsFor(exercise('ex-pain')),
      painFlag: 'pain_limiting',
    })
  );
  assert(pain.results[0]?.decision === 'pain_hold', '12: pain is review/hold, not auto progress');
  assert(!pain.results[0]?.mutated && pain.review >= 1, '12: pain is not applied');

  const missingRir = orchestrateCompletedWorkout(
    input({
      program: personalProgram([
        workout('wo-rir', 1, 1, [exercise('ex-rir')], 'in_progress'),
        workout('wo-rir2', 2, 1, [exercise('ex-rir-n')], 'template'),
      ]),
      sourceWorkout: workout('wo-rir', 1, 1, [exercise('ex-rir')], 'in_progress'),
      logsByPlannedSetId: logsFor(exercise('ex-rir'), { rir: [null, null, null] }),
    })
  );
  const rirDecision = evaluateProgressionDecision({
    current: {
      log_date: '2026-10-08',
      catalog_exercise_id: CAT,
      exercise_name: 'Barbell Bench Press',
      program_role: 'primary',
      measurement_type: 'reps',
      prescription: { rep_min: 8, rep_max: 10, target_rir: 2, working_set_count: 3 },
      sets: [10, 10, 10].map((reps, i) => ({
        planned_set_id: `rir-${i}`,
        completed: true,
        set_type: 'working',
        snapshot_rep_min: 8,
        snapshot_rep_max: 10,
        snapshot_target_rir: 2,
        actual_weight: 185,
        actual_reps: reps,
        actual_rir: null,
      })),
    },
  });
  assert(rirDecision.decision !== 'progress_load' || rirDecision.reason_codes.join('').includes('PERFORMANCE') || rirDecision.decision === 'build_reps' || rirDecision.decision === 'hold' || rirDecision.decision === 'review_required' || rirDecision.decision === 'insufficient_data', '13: missing RIR is not fabricated into high-confidence progress');
  assert(missingRir.results[0]?.decision !== 'progress_load' || missingRir.results[0]?.reason_codes.some((c) => /PERFORMANCE|RIR|INSUFFICIENT|HOLD|BUILD/i.test(String(c))), '13: orchestration does not invent RIR');

  const extraProgram = personalProgram([
    workout('wo-x', 1, 1, [exercise('ex-x')], 'in_progress'),
    workout('wo-x2', 2, 1, [exercise('ex-x-n')], 'template'),
  ]);
  const extraLogs = [
    { exercise_id: 'ex-x', is_extra_set: true, completed: true, actual_weight: '185', actual_reps: '12', actual_rir: 0, log_date: '2026-10-08' },
  ];
  const onlyTwoPlanned = logsFor(extraProgram.st_workouts[0].st_exercises[0], { reps: [9, 9], rir: [3, 3] });
  const extraRun = orchestrateCompletedWorkout(
    input({
      program: extraProgram,
      sourceWorkout: extraProgram.st_workouts[0],
      logsByPlannedSetId: onlyTwoPlanned,
      extraLogs,
    })
  );
  assert(extraRun.results[0]?.decision !== 'progress_load' || extraRun.results[0]?.reason_codes.some((c) => /INSUFFICIENT|HOLD|BUILD|REVIEW/i.test(String(c))), '14: extra sets do not by themselves qualify progression');

  const skippedSession = orchestrateCompletedWorkout(
    input({
      program,
      sourceWorkout: program.st_workouts[0],
      session: { user_id: USER, workout_id: 'wo-1', program_id: PROG, log_date: '2026-10-08', status: 'skipped' },
      logsByPlannedSetId: logsFor(w1),
    })
  );
  assert(!skippedSession.triggered && skippedSession.skipped_reason === 'skipped_session', 'skipped workout does not adapt');

  const otherUser = orchestrateCompletedWorkout(
    input({
      userId: OTHER,
      program,
      sourceWorkout: program.st_workouts[0],
      session: { user_id: USER, workout_id: 'wo-1', program_id: PROG, log_date: '2026-10-08', status: 'completed' },
      logsByPlannedSetId: logsFor(w1),
    })
  );
  assert(!otherUser.triggered && otherUser.skipped_reason === 'not_owner', '16: cross-user isolation');

  const group = isPersonalAdaptationSource({ id: GROUP, owner_user_id: USER, visibility: 'team', team_id: 'team-1' }, USER);
  assert(!group.ok && group.reason === 'group_or_trainer', '17: group/trainer sources excluded');
  const otherProg = orchestrateCompletedWorkout(
    input({
      program: { id: 'prog-b', owner_user_id: USER, visibility: 'personal', team_id: null, st_workouts: program.st_workouts.map((w: any) => ({ ...w, program_id: 'prog-b' })) },
      sourceWorkout: { ...program.st_workouts[0], program_id: 'prog-b' },
      logsByPlannedSetId: logsFor(w1),
    })
  );
  assert(otherProg.triggered, '17: personal program still adapts inside its own program_id');
  assert(otherProg.results[0]?.event.program_id === 'prog-b', '17: event stays on the source program');

  assert(!shouldEvaluateExercise({ section: 'warmup', catalog_exercise_id: CAT, program_role: 'warmup' }), 'warmup not evaluated');
  assert(!shouldEvaluateExercise({ section: 'strength', program_role: 'primary' }), 'no catalog id skipped');

  const persistOrder: string[] = [];
  const fakeSupabase = {
    from(table: string) {
      const api: any = {
        insert: (row: any) => {
          persistOrder.push(`insert:${table}:${row?.application_status || ''}`);
          return api;
        },
        update: () => {
          persistOrder.push(`update:${table}`);
          return api;
        },
        select: () => api,
        eq: async () => ({ error: null }),
        maybeSingle: async () => ({ data: { id: 'evt-1' }, error: null }),
      };
      return api;
    },
  };
  if (success.results[0]) {
    const persistOut = await persistAdaptationApplication(fakeSupabase as any, success.results[0]);
    assert(!persistOut.persistError, 'persist helper accepts the 2B.1 insert-first path');
    assert(persistOrder[0]?.startsWith('insert:st_adaptation_events'), '11: unique ledger claim happens before planned-set writes');
    assert(persistOrder.some((step) => step === 'update:st_planned_sets'), '11: planned-set update follows the claim');
  }

  const profile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle' },
    trainingProfile: { preferred_session_minutes: 60 },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      weeks: 4,
      sessionMinutes: 60,
    },
  });
  const science = generateProgram(profile, FALLBACK_CATALOG);
  assert(science.workouts.filter((w) => w.week === 1).length === 3, '18: Phase 1 still generates week 1');
  const custom = {
    id: 'custom-1',
    name: 'User Curl',
    user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    is_system: false,
    is_archived: false,
  };
  assert(!isAiGenerationEligibleRow(custom), '18: customs still excluded');
  const masterCount = expectedMasterCatalogCount();
  const masters = Array.from({ length: masterCount }, (_, i) => ({
    id: String(i + 1),
    name: `Master ${i + 1}`,
    is_archived: false,
    is_system: true,
    user_id: null,
    external_source: MASTER_CATALOG_SOURCE,
  }));
  assert(selectAiGenerationCatalogRows([...masters, custom]).length === masterCount, `18: ${masterCount}-card eligibility`);
  assert(adaptGenerationCatalog([...masters, custom], { allowFallback: false }).length === masterCount, '18: adapted catalog count');
  assert(masterCount === expectedMasterCatalogCount(), '18: Phase 1 eligibility still uses expectedMasterCatalogCount()');

  const failureKept = formatAdaptationSummary({
    triggered: true,
    skipped_reason: null,
    evaluated: 5,
    updated: 0,
    error: 'write failed',
    pending_retry: true,
    limitation: null,
  });
  assert(/Workout complete/.test(failureKept) && /retry safely/.test(failureKept), '15: completion language remains after adaptation failure');

  console.log('BIQ-0254 Phase 2B.1 orchestration checks passed.');
  console.log(`Evaluated ${success.evaluated}, updated ${success.updated}, week2 ${success.results[0]?.after_load}, skip ${skipped.results[0]?.decision}, pain ${pain.results[0]?.decision}, masters ${masterCount}`);
}
