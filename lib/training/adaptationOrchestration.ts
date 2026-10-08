import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateProgressionDecision } from '../scienceEngine/adaptation/decision';
import { applyProgressionDecision } from '../scienceEngine/adaptation/apply/applyDecision';
import { prescriptionFingerprint } from '../scienceEngine/adaptation/apply/fingerprint';
import { selectNextEligibleExposure } from '../scienceEngine/adaptation/apply/nextExposure';
import { isWorkingRole } from '../scienceEngine/adaptation/countedSets';
import type {
  AdaptationApplicationResult,
  LedgerEventRecord,
  PlannedSetMutation,
  SourceExposureRef,
} from '../scienceEngine/adaptation/apply/types';
import type { ExerciseExposureInput } from '../scienceEngine/adaptation/inputs';
import type { PainFlag, SessionStatus } from '../scienceEngine/adaptation/types';
import { deriveExerciseStatus } from './exerciseOutcome';
import {
  candidatesFromProgram,
  exposureFromLoggedExercise,
  persistAdaptationApplication,
} from './adaptationApply';
import type { WorkoutSessionRow } from './workoutSessions';

export const ADAPTATION_ORCHESTRATION_VERSION = '2b1.0.0';

export type AdaptationSkipReason =
  | 'not_completed'
  | 'skipped_session'
  | 'group_or_trainer'
  | 'not_owner'
  | 'missing_program'
  | 'missing_session';

export type AdaptationOrchestrationResult = {
  triggered: boolean;
  skipped_reason: AdaptationSkipReason | null;
  limitation: string | null;
  evaluated: number;
  updated: number;
  held: number;
  review: number;
  failed: number;
  already_applied: number;
  pending_retry: boolean;
  summary: string;
  mutations: PlannedSetMutation[];
  results: AdaptationApplicationResult[];
  error: string | null;
  orchestration_version: string;
};

export type AdaptationOrchestrationInput = {
  userId: string;
  session: Pick<WorkoutSessionRow, 'user_id' | 'workout_id' | 'program_id' | 'log_date' | 'status'> | null;
  program: any | null;
  sourceWorkout: any | null;
  logsByPlannedSetId: Record<string, any>;
  extraLogs?: any[];
  exerciseSessions?: Record<string, { status?: string | null; attempt_outcome?: string | null }>;
  painFlag?: PainFlag | null;
  existingEvents?: LedgerEventRecord[];
  historyByCatalogId?: Record<string, ExerciseExposureInput[]>;
  /** Live planned-set rows keyed by id. Compared with the loaded snapshot to abort stale applies. */
  liveSetsById?: Record<string, { id: string; exercise_id?: string; set_type?: string | null; set_number?: number | null; target_weight?: string | number | null; target_reps?: string | null; rep_min?: number | null; rep_max?: number | null; target_rir?: number | null; is_deleted?: boolean | null }>;
};

export function shouldTriggerCompletedWorkoutAdaptation(status?: SessionStatus | string | null): boolean {
  return status === 'completed' || status === 'partial';
}

export function isPersonalAdaptationSource(program: any, userId: string): { ok: boolean; reason?: AdaptationSkipReason; limitation?: string } {
  if (!program?.id) return { ok: false, reason: 'missing_program' };
  if (!program.owner_user_id || program.owner_user_id !== userId) {
    return { ok: false, reason: 'not_owner', limitation: 'Only the owner of a personal program can receive automatic adaptation.' };
  }
  const visibility = String(program.visibility || 'personal').toLowerCase();
  if (visibility === 'team' || program.team_id) {
    return {
      ok: false,
      reason: 'group_or_trainer',
      limitation: 'Group and trainer-assigned programs are not auto-adapted in Phase 2B.1.',
    };
  }
  return { ok: true };
}

/** Workout-level run lock. Pending in-flight must not start a second apply. */
export function shouldContinueAdaptationRun(row?: { status?: string | null; updated_at?: string | null; created_at?: string | null } | null): 'apply' | 'reuse' | 'wait' | 'retry' {
  const status = String(row?.status || '');
  if (status === 'completed' || status === 'skipped') return 'reuse';
  if (status === 'failed') return 'retry';
  if (status === 'pending') {
    const stamped = Date.parse(String(row?.updated_at || row?.created_at || ''));
    if (Number.isFinite(stamped) && Date.now() - stamped > 60_000) return 'retry';
    return 'wait';
  }
  return 'apply';
}

export async function probePhase2a3Ledger(supabase: SupabaseClient): Promise<{ ready: boolean; reason: string | null }> {
  const { error } = await supabase.from('st_adaptation_events').select('id, application_key, application_status').limit(1);
  if (error && /does not exist|schema cache/i.test(error.message || '')) {
    return { ready: false, reason: 'st_adaptation_events is missing' };
  }
  if (error && /application_key|application_status/i.test(error.message || '')) {
    return { ready: false, reason: 'Phase 2A.3 migration 053 is not installed' };
  }
  if (error) return { ready: false, reason: error.message };
  return { ready: true, reason: null };
}

export function shouldEvaluateExercise(ex: any): boolean {
  if (!ex?.catalog_exercise_id) return false;
  const section = String(ex.section || 'strength').toLowerCase();
  if (section === 'warmup' || section === 'cooldown' || section === 'cardio' || section === 'mobility') return false;
  if (!isWorkingRole(ex.program_role)) return false;
  return true;
}

export function formatAdaptationSummary(result: Pick<AdaptationOrchestrationResult, 'triggered' | 'skipped_reason' | 'evaluated' | 'updated' | 'error' | 'pending_retry' | 'limitation'>): string {
  if (!result.triggered) {
    if (result.skipped_reason === 'group_or_trainer') {
      return 'Workout complete. Group and trainer programs are not auto-adapted yet.';
    }
    if (result.skipped_reason === 'skipped_session') {
      return 'Workout skipped. BuiltIQ did not change future prescriptions.';
    }
    if (result.skipped_reason === 'not_completed') {
      return 'Workout is not complete, so BuiltIQ did not adapt the next session.';
    }
    return result.limitation || 'Workout saved. No automatic adaptation ran.';
  }
  if (result.error || result.pending_retry) {
    return `Workout complete. BuiltIQ evaluated ${result.evaluated} exercise${result.evaluated === 1 ? '' : 's'}. Adaptation could not finish and can retry safely.`;
  }
  const n = result.updated;
  return `Workout complete. BuiltIQ evaluated ${result.evaluated} exercise${result.evaluated === 1 ? '' : 's'} and prepared ${n} adjustment${n === 1 ? '' : 's'} for your next session.`;
}

function emptyResult(partial: Partial<AdaptationOrchestrationResult>): AdaptationOrchestrationResult {
  const base: AdaptationOrchestrationResult = {
    triggered: false,
    skipped_reason: null,
    limitation: null,
    evaluated: 0,
    updated: 0,
    held: 0,
    review: 0,
    failed: 0,
    already_applied: 0,
    pending_retry: false,
    summary: '',
    mutations: [],
    results: [],
    error: null,
    orchestration_version: ADAPTATION_ORCHESTRATION_VERSION,
    ...partial,
  };
  base.summary = formatAdaptationSummary(base);
  return base;
}

function classifyResult(row: AdaptationApplicationResult): 'updated' | 'held' | 'review' | 'already' | 'other' {
  if (row.abort_reason === 'ALREADY_APPLIED') return 'already';
  if (row.decision === 'review_required' || row.decision === 'pain_hold' || row.decision === 'insufficient_data') return 'review';
  if (row.mutated) return 'updated';
  if (row.decision === 'hold' || row.decision === 'build_reps' || row.status === 'recorded_no_change') return 'held';
  return 'other';
}

export function historyFromProgramLogs(opts: {
  program: any;
  sourceWorkoutId: string;
  logDate: string;
  logsByPlannedSetId: Record<string, any>;
  extraLogs?: any[];
}): Record<string, ExerciseExposureInput[]> {
  const out: Record<string, ExerciseExposureInput[]> = {};
  const extrasByExercise = extrasGrouped(opts.extraLogs);
  const source = (opts.program?.st_workouts || []).find((w: any) => w.id === opts.sourceWorkoutId);
  const sourceWeek = Number(source?.week || 1);
  const sourceDay = Number(source?.day_order || 0);
  for (const workout of opts.program?.st_workouts || []) {
    if (!workout?.id || workout.id === opts.sourceWorkoutId) continue;
    const week = Number(workout.week || 1);
    const day = Number(workout.day_order || 0);
    if (week > sourceWeek || (week === sourceWeek && day >= sourceDay)) continue;
    for (const ex of workout.st_exercises || []) {
      if (!ex?.catalog_exercise_id) continue;
      const exposure = exposureFromLoggedExercise({
        exercise: ex,
        workout,
        logsByPlannedSetId: opts.logsByPlannedSetId,
        extraLogs: extrasByExercise[ex.id] || [],
      });
      const hasPerf = (exposure.sets || []).some((s) => s.completed || s.actual_reps || s.actual_weight);
      if (!hasPerf) continue;
      const list = out[ex.catalog_exercise_id] || [];
      list.push(exposure);
      out[ex.catalog_exercise_id] = list;
    }
  }
  return out;
}

function extrasGrouped(extraLogs?: any[]): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  (extraLogs || []).forEach((row) => {
    const id = String(row?.exercise_id || '');
    if (!id) return;
    if (!out[id]) out[id] = [];
    out[id].push(row);
  });
  return out;
}

export function orchestrateCompletedWorkout(input: AdaptationOrchestrationInput): AdaptationOrchestrationResult {
  const session = input.session;
  if (!session) return emptyResult({ skipped_reason: 'missing_session' });
  if (session.user_id !== input.userId) {
    return emptyResult({ skipped_reason: 'not_owner', limitation: 'Adaptation is scoped to the logged-in user.' });
  }
  if (session.status === 'skipped') return emptyResult({ skipped_reason: 'skipped_session' });
  if (!shouldTriggerCompletedWorkoutAdaptation(session.status)) {
    return emptyResult({ skipped_reason: 'not_completed' });
  }
  const source = isPersonalAdaptationSource(input.program, input.userId);
  if (!source.ok) return emptyResult({ skipped_reason: source.reason, limitation: source.limitation || null });
  if (!input.sourceWorkout?.id) return emptyResult({ skipped_reason: 'missing_program' });

  const extrasByExercise = extrasGrouped(input.extraLogs);
  const candidates = candidatesFromProgram({
    userId: input.userId,
    program: input.program,
    logsByPlannedSetId: input.logsByPlannedSetId,
  });
  const existing = [...(input.existingEvents || [])];
  const historyMap = input.historyByCatalogId || historyFromProgramLogs({
    program: input.program,
    sourceWorkoutId: input.sourceWorkout.id,
    logDate: session.log_date,
    logsByPlannedSetId: input.logsByPlannedSetId,
    extraLogs: input.extraLogs,
  });

  const results: AdaptationApplicationResult[] = [];
  const mutations: PlannedSetMutation[] = [];
  let evaluated = 0;
  let updated = 0;
  let held = 0;
  let review = 0;
  let already = 0;

  for (const ex of input.sourceWorkout.st_exercises || []) {
    if (!shouldEvaluateExercise(ex)) continue;
    evaluated += 1;
    const derived = deriveExerciseStatus({
      plannedSets: ex.st_planned_sets,
      logs: input.logsByPlannedSetId,
      explicit: input.exerciseSessions?.[ex.id],
    });
    const current = exposureFromLoggedExercise({
      exercise: ex,
      workout: input.sourceWorkout,
      logsByPlannedSetId: input.logsByPlannedSetId,
      extraLogs: extrasByExercise[ex.id] || [],
      workoutStatus: session.status,
      exerciseStatus: derived.status,
      attemptOutcome: derived.attempt,
      painFlag: input.painFlag || null,
      painAssociated: false,
    });
    const decision = evaluateProgressionDecision({
      current,
      history: historyMap[ex.catalog_exercise_id] || [],
    });
    const sourceRef: SourceExposureRef = {
      user_id: input.userId,
      program_id: input.program.id,
      workout_id: input.sourceWorkout.id,
      exercise_id: ex.id,
      catalog_exercise_id: ex.catalog_exercise_id,
      week: Number(input.sourceWorkout.week || 1),
      day_order: Number(input.sourceWorkout.day_order || 0),
      log_date: session.log_date,
      measurement_type: ex.measurement_type || 'reps',
      program_role: ex.program_role,
      laterality: ex.laterality || ex.coaching_metadata?.laterality || null,
      exercise_name: ex.name,
    };
    const selected = selectNextEligibleExposure(sourceRef, candidates);
    const expected = selected ? prescriptionFingerprint(selected.planned_sets) : null;
    if (selected && input.liveSetsById) {
      selected.planned_sets = selected.planned_sets.map((s) => {
        const live = input.liveSetsById?.[s.id];
        return live ? { ...s, ...live, exercise_id: live.exercise_id || s.exercise_id } : s;
      });
    }
    const applied = applyProgressionDecision({
      source: sourceRef,
      decision,
      candidates,
      expected_fingerprint: expected,
      existing_events: existing,
    });
    results.push(applied);
    existing.push(applied.event);
    if (applied.mutations?.length) mutations.push(...applied.mutations);
    const kind = classifyResult(applied);
    if (kind === 'updated') updated += 1;
    else if (kind === 'held') held += 1;
    else if (kind === 'review') review += 1;
    else if (kind === 'already') already += 1;
  }

  return emptyResult({
    triggered: true,
    evaluated,
    updated,
    held,
    review,
    already_applied: already,
    mutations,
    results,
  });
}

async function loadProgramTree(supabase: SupabaseClient, programId: string) {
  const { data: program, error: programError } = await supabase
    .from('st_programs')
    .select('id, owner_user_id, visibility, team_id, name')
    .eq('id', programId)
    .maybeSingle();
  if (programError || !program) return { program: null, error: programError?.message || 'Program not found' };
  const { data: workouts, error: workoutError } = await supabase
    .from('st_workouts')
    .select('id, program_id, week, day_label, day_order, workout_type, week_status, st_exercises(*, st_planned_sets(*))')
    .eq('program_id', programId)
    .order('week')
    .order('day_order');
  if (workoutError) return { program: null, error: workoutError.message };
  return { program: { ...program, st_workouts: workouts || [] }, error: null as string | null };
}

function flattenLogs(rows: any[] | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  (rows || []).forEach((row) => {
    if (row?.planned_set_id && row.is_extra_set !== true) out[row.planned_set_id] = row;
  });
  return out;
}

export async function runCompletedWorkoutAdaptation(opts: {
  supabase: SupabaseClient;
  userId: string;
  workoutId: string;
  logDate: string;
}): Promise<AdaptationOrchestrationResult> {
  const { data: session, error: sessionError } = await opts.supabase
    .from('st_workout_sessions')
    .select('id, user_id, workout_id, program_id, log_date, status, feedback_id')
    .eq('user_id', opts.userId)
    .eq('workout_id', opts.workoutId)
    .eq('log_date', opts.logDate)
    .maybeSingle();
  if (sessionError) {
    return emptyResult({ skipped_reason: 'missing_session', error: sessionError.message, pending_retry: true });
  }
  if (!session) return emptyResult({ skipped_reason: 'missing_session' });
  if (session.user_id !== opts.userId) return emptyResult({ skipped_reason: 'not_owner' });

  const programId = session.program_id;
  if (!programId) return emptyResult({ skipped_reason: 'missing_program' });
  const loaded = await loadProgramTree(opts.supabase, programId);
  if (loaded.error || !loaded.program) {
    return emptyResult({ skipped_reason: 'missing_program', error: loaded.error, pending_retry: !!loaded.error });
  }
  const sourceWorkout = (loaded.program.st_workouts || []).find((w: any) => w.id === opts.workoutId);
  const allPlannedIds = (loaded.program.st_workouts || []).flatMap((w: any) =>
    (w.st_exercises || []).flatMap((ex: any) => (ex.st_planned_sets || []).map((s: any) => s.id).filter(Boolean))
  );

  const { data: logs } = allPlannedIds.length
    ? await opts.supabase
        .from('st_set_logs')
        .select('*')
        .eq('user_id', opts.userId)
        .in('planned_set_id', allPlannedIds)
    : { data: [] as any[] };
  const exerciseIds = (sourceWorkout?.st_exercises || []).map((ex: any) => ex.id).filter(Boolean);
  let extraLogs: any[] = [];
  if (exerciseIds.length) {
    const extraRes = await opts.supabase
      .from('st_set_logs')
      .select('*')
      .eq('user_id', opts.userId)
      .eq('is_extra_set', true)
      .eq('log_date', opts.logDate)
      .in('exercise_id', exerciseIds);
    if (!extraRes.error) extraLogs = extraRes.data || [];
  }
  const { data: exerciseSessions } = await opts.supabase
    .from('st_exercise_sessions')
    .select('exercise_id, status, attempt_outcome')
    .eq('user_id', opts.userId)
    .eq('log_date', opts.logDate);
  let feedback: Array<{ pain_flag?: string | null; workout_feel?: string | null }> | null = null;
  if (session.feedback_id) {
    const byId = await opts.supabase.from('st_workout_feedback').select('pain_flag, workout_feel').eq('id', session.feedback_id).maybeSingle();
    feedback = byId.data ? [byId.data] : null;
  }
  if (!feedback) {
    const latest = await opts.supabase
      .from('st_workout_feedback')
      .select('pain_flag, workout_feel')
      .eq('user_id', opts.userId)
      .eq('workout_id', opts.workoutId)
      .eq('log_date', opts.logDate)
      .limit(1);
    feedback = latest.data || null;
  }
  const { data: existingEvents } = await opts.supabase
    .from('st_adaptation_events')
    .select(
      'application_key,application_status,reason_codes,before_json,after_json,target_fingerprint,decision,science_version,adaptation_engine_version,increment_value,increment_unit,source_workout_id,source_exercise_id,target_workout_id,target_exercise_id,user_id,program_id,from_week,to_week,exercise_catalog_id,actor,increment_source,increment_reason,confidence,source_log_date'
    )
    .eq('user_id', opts.userId)
    .eq('program_id', programId);

  const sessionMap: Record<string, { status?: string | null; attempt_outcome?: string | null }> = {};
  (exerciseSessions || []).forEach((row: any) => {
    if (row?.exercise_id) sessionMap[row.exercise_id] = row;
  });

  const logsByPlannedSetId = flattenLogs(logs);
  const painFlag = (feedback && feedback[0]?.pain_flag) || null;
  const { data: liveSetRows } = allPlannedIds.length
    ? await opts.supabase
        .from('st_planned_sets')
        .select('id,exercise_id,set_type,set_number,target_weight,target_reps,rep_min,rep_max,target_rir,is_deleted')
        .in('id', allPlannedIds)
    : { data: [] as any[] };
  const liveSetsById = Object.fromEntries((liveSetRows || []).map((row: any) => [row.id, row]));

  const claim = await claimAdaptationRun(opts.supabase, {
    userId: opts.userId,
    workoutId: opts.workoutId,
    programId,
    logDate: opts.logDate,
    sessionId: session.id,
  });
  if (claim.existingCompleted) return claim.existingCompleted;
  if (claim.error && !claim.pendingMigration) {
    return emptyResult({ triggered: true, pending_retry: true, error: claim.error, evaluated: 0 });
  }

  const ledger = await probePhase2a3Ledger(opts.supabase);
  if (!ledger.ready) {
    const blocked = emptyResult({
      triggered: true,
      pending_retry: true,
      error: ledger.reason,
      limitation: 'Workout is saved. Automatic prescription writes are disabled until Phase 2A.3 migration 053 is installed.',
    });
    await finishAdaptationRun(opts.supabase, claim.runId, blocked);
    return blocked;
  }

  const orchestrated = orchestrateCompletedWorkout({
    userId: opts.userId,
    session: {
      user_id: session.user_id,
      workout_id: session.workout_id,
      program_id: session.program_id,
      log_date: session.log_date,
      status: session.status,
    },
    program: loaded.program,
    sourceWorkout,
    logsByPlannedSetId,
    extraLogs: extraLogs || [],
    exerciseSessions: sessionMap,
    painFlag,
    existingEvents: (existingEvents || []) as LedgerEventRecord[],
    liveSetsById,
  });

  let failed = 0;
  let persistError: string | null = null;
  const keptMutations: PlannedSetMutation[] = [];
  for (const row of orchestrated.results) {
    const persist = await persistAdaptationApplication(opts.supabase, row);
    if (persist.pendingMigration) {
      persistError = persistError || 'Adaptation ledger migration is pending.';
      failed += 1;
      continue;
    }
    if (persist.persistError) {
      persistError = persist.persistError;
      failed += 1;
      continue;
    }
    if (row.mutated && !persist.alreadyApplied) keptMutations.push(...row.mutations);
  }

  const finalResult: AdaptationOrchestrationResult = {
    ...orchestrated,
    mutations: keptMutations,
    failed,
    error: persistError,
    pending_retry: !!persistError,
  };
  finalResult.summary = formatAdaptationSummary(finalResult);
  await finishAdaptationRun(opts.supabase, claim.runId, finalResult);
  return finalResult;
}

async function claimAdaptationRun(
  supabase: SupabaseClient,
  opts: { userId: string; workoutId: string; programId: string; logDate: string; sessionId?: string }
): Promise<{
  runId: string | null;
  existingCompleted: AdaptationOrchestrationResult | null;
  error: string | null;
  pendingMigration: boolean;
}> {
  const payload = {
    user_id: opts.userId,
    workout_id: opts.workoutId,
    program_id: opts.programId,
    log_date: opts.logDate,
    workout_session_id: opts.sessionId || null,
    status: 'pending',
  };
  const inserted = await supabase.from('st_adaptation_runs').insert(payload).select('id, status, result_json, summary_text, error_text').maybeSingle();
  if (inserted.error && /does not exist|schema cache/i.test(inserted.error.message || '')) {
    return { runId: null, existingCompleted: null, error: null, pendingMigration: true };
  }
  if (inserted.error && /duplicate key|23505/i.test(`${inserted.error.code || ''} ${inserted.error.message || ''}`)) {
    const existing = await supabase
      .from('st_adaptation_runs')
      .select('id, status, result_json, summary_text, error_text')
      .eq('user_id', opts.userId)
      .eq('workout_id', opts.workoutId)
      .eq('log_date', opts.logDate)
      .maybeSingle();
    const row = existing.data;
    const next = shouldContinueAdaptationRun(row);
    if (next === 'reuse' && row?.result_json && typeof row.result_json === 'object') {
      const cached = row.result_json as AdaptationOrchestrationResult;
      return {
        runId: row.id,
        existingCompleted: {
          ...cached,
          already_applied: (cached.already_applied || 0) + 1,
          summary: cached.summary || row.summary_text,
        },
        error: null,
        pendingMigration: false,
      };
    }
    if (next === 'wait') {
      return {
        runId: row?.id || null,
        existingCompleted: emptyResult({
          triggered: true,
          pending_retry: true,
          error: 'Adaptation is already running for this workout.',
        }),
        error: null,
        pendingMigration: false,
      };
    }
    if (next === 'retry' && row?.id) {
      await supabase
        .from('st_adaptation_runs')
        .update({ status: 'pending', error_text: null, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      return { runId: row.id, existingCompleted: null, error: null, pendingMigration: false };
    }
    return { runId: row?.id || null, existingCompleted: null, error: null, pendingMigration: false };
  }
  if (inserted.error) return { runId: null, existingCompleted: null, error: inserted.error.message, pendingMigration: false };
  return { runId: inserted.data?.id || null, existingCompleted: null, error: null, pendingMigration: false };
}

async function finishAdaptationRun(supabase: SupabaseClient, runId: string | null, result: AdaptationOrchestrationResult) {
  if (!runId) return;
  const status = result.pending_retry || result.error ? 'failed' : result.triggered ? 'completed' : 'skipped';
  await supabase
    .from('st_adaptation_runs')
    .update({
      status,
      skipped_reason: result.skipped_reason,
      evaluated_count: result.evaluated,
      updated_count: result.updated,
      held_count: result.held,
      review_count: result.review,
      failed_count: result.failed,
      summary_text: result.summary,
      error_text: result.error,
      result_json: {
        triggered: result.triggered,
        skipped_reason: result.skipped_reason,
        limitation: result.limitation,
        evaluated: result.evaluated,
        updated: result.updated,
        held: result.held,
        review: result.review,
        failed: result.failed,
        already_applied: result.already_applied,
        pending_retry: result.pending_retry,
        summary: result.summary,
        orchestration_version: result.orchestration_version,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);
}
