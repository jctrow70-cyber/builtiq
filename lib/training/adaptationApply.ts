import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateProgressionDecision } from '../scienceEngine/adaptation/decision';
import { applyProgressionDecision } from '../scienceEngine/adaptation/apply/applyDecision';
import { prescriptionFingerprint } from '../scienceEngine/adaptation/apply/fingerprint';
import { selectNextEligibleExposure } from '../scienceEngine/adaptation/apply/nextExposure';
import type { AdaptationApplicationResult, CandidateExposure, SourceExposureRef } from '../scienceEngine/adaptation/apply/types';
import type { ExerciseExposureInput } from '../scienceEngine/adaptation/inputs';
import { logHasPerformance } from './plannedSetGuard';

function lateralityOf(ex: any): string | null {
  return ex?.laterality || ex?.coaching_metadata?.laterality || null;
}

export function candidatesFromProgram(opts: {
  userId: string;
  program: any;
  extraWorkouts?: any[];
  logsByPlannedSetId?: Record<string, any>;
}): CandidateExposure[] {
  const rows: CandidateExposure[] = [];
  const seen = new Set<string>();
  const workouts = [...(opts.program?.st_workouts || []), ...(opts.extraWorkouts || [])].filter((workout: any) => {
    if (!workout?.id || seen.has(workout.id)) return false;
    if (workout.program_id && opts.program?.id && workout.program_id !== opts.program.id) return false;
    seen.add(workout.id);
    return true;
  });
  for (const workout of workouts) {
    for (const ex of workout.st_exercises || []) {
      const planned = ex.st_planned_sets || [];
      const hasPerf = planned.some((s: any) => logHasPerformance(opts.logsByPlannedSetId?.[s.id]));
      rows.push({
        user_id: opts.program.owner_user_id || opts.userId,
        program_id: opts.program.id,
        workout_id: workout.id,
        exercise_id: ex.id,
        catalog_exercise_id: ex.catalog_exercise_id,
        exercise_name: ex.name,
        program_role: ex.program_role,
        measurement_type: ex.measurement_type,
        laterality: lateralityOf(ex),
        week: Number(workout.week || 1),
        day_order: Number(workout.day_order || 0),
        day_label: workout.day_label,
        week_status: workout.week_status || null,
        has_performance: hasPerf,
        planned_sets: planned.map((s: any) => ({
          id: s.id,
          exercise_id: ex.id,
          set_type: s.set_type,
          set_number: s.set_number,
          target_weight: s.target_weight,
          target_reps: s.target_reps,
          rep_min: s.rep_min,
          rep_max: s.rep_max,
          target_rir: s.target_rir,
          is_deleted: s.is_deleted,
        })),
      });
    }
  }
  return rows;
}

export function exposureFromLoggedExercise(opts: {
  exercise: any;
  workout: any;
  logsByPlannedSetId: Record<string, any>;
}): ExerciseExposureInput {
  const planned = (opts.exercise.st_planned_sets || []).filter((s: any) => !s.is_deleted);
  const working = planned.filter((s: any) => {
    const type = String(s.set_type || 'working').toLowerCase();
    return type !== 'warmup' && type !== 'warm-up' && type !== 'ramp' && type !== 'ramp_up';
  });
  const rx = working[0] || planned[0];
  return {
    log_date: Object.values(opts.logsByPlannedSetId)[0]?.log_date || new Date().toISOString().slice(0, 10),
    catalog_exercise_id: opts.exercise.catalog_exercise_id,
    exercise_name: opts.exercise.name,
    program_role: opts.exercise.program_role,
    measurement_type: opts.exercise.measurement_type || 'reps',
    laterality: lateralityOf(opts.exercise),
    equipment: opts.exercise.equipment || opts.exercise.snapshot_equipment,
    prescription: {
      rep_min: rx?.rep_min,
      rep_max: rx?.rep_max,
      target_rir: rx?.target_rir,
      working_set_count: working.length,
    },
    sets: planned.map((s: any) => {
      const log = opts.logsByPlannedSetId[s.id] || {};
      return {
        planned_set_id: s.id,
        is_extra_set: log.is_extra_set === true,
        completed: !!log.completed,
        set_type: s.set_type,
        snapshot_set_type: log.snapshot_set_type || s.set_type,
        snapshot_rep_min: log.snapshot_rep_min ?? s.rep_min,
        snapshot_rep_max: log.snapshot_rep_max ?? s.rep_max,
        snapshot_target_rir: log.snapshot_target_rir ?? s.target_rir,
        snapshot_program_role: log.snapshot_program_role || opts.exercise.program_role,
        snapshot_catalog_exercise_id: log.snapshot_catalog_exercise_id || opts.exercise.catalog_exercise_id,
        actual_weight: log.actual_weight,
        actual_reps: log.actual_reps,
        actual_rir: log.actual_rir,
        actual_rpe: log.actual_rpe,
      };
    }),
  };
}

export async function persistAdaptationApplication(
  supabase: SupabaseClient,
  result: AdaptationApplicationResult
): Promise<{ persistError: string | null; pendingMigration: boolean }> {
  if (result.abort_reason === 'ALREADY_APPLIED') {
    return { persistError: null, pendingMigration: false };
  }
  for (const mutation of result.mutations) {
    const { error } = await supabase.from('st_planned_sets').update({ target_weight: mutation.to }).eq('id', mutation.planned_set_id);
    if (error) return { persistError: error.message, pendingMigration: false };
  }
  const row: Record<string, unknown> = {
    user_id: result.event.user_id,
    program_id: result.event.program_id,
    from_week: result.event.from_week,
    to_week: result.event.to_week,
    exercise_catalog_id: result.event.exercise_catalog_id,
    decision: result.event.decision,
    reason_codes: result.event.reason_codes,
    before_json: result.event.before_json,
    after_json: result.event.after_json,
    actor: 'engine',
    science_version: result.event.science_version,
    increment_source: result.event.increment_source,
    increment_reason: result.event.increment_reason,
    increment_value: result.event.increment_value,
    increment_unit: result.event.increment_unit,
    source_workout_id: result.event.source_workout_id,
    source_exercise_id: result.event.source_exercise_id,
    source_log_date: result.event.source_log_date,
    target_workout_id: result.event.target_workout_id,
    target_exercise_id: result.event.target_exercise_id,
    application_status: result.event.application_status,
    application_key: result.event.application_key,
    target_fingerprint: result.event.target_fingerprint,
    confidence: result.event.confidence,
    adaptation_engine_version: result.event.adaptation_engine_version,
  };
  const inserted = await supabase.from('st_adaptation_events').insert(row).select('id').maybeSingle();
  if (inserted.error && /source_workout_id|application_key|application_status|target_fingerprint|adaptation_engine_version/i.test(inserted.error.message || '')) {
    return { persistError: null, pendingMigration: true };
  }
  if (inserted.error && /duplicate key|application_key/i.test(inserted.error.message || '')) {
    return { persistError: null, pendingMigration: false };
  }
  return { persistError: inserted.error?.message || null, pendingMigration: false };
}

export function patchProgramPlannedWeights(program: any, mutations: Array<{ planned_set_id: string; to: string }>) {
  if (!program) return program;
  const next = { ...program, st_workouts: (program.st_workouts || []).map((w: any) => ({
    ...w,
    st_exercises: (w.st_exercises || []).map((ex: any) => ({
      ...ex,
      st_planned_sets: (ex.st_planned_sets || []).map((s: any) => {
        const hit = mutations.find((m) => m.planned_set_id === s.id);
        return hit ? { ...s, target_weight: hit.to } : s;
      }),
    })),
  })) };
  return next;
}

export async function applyProgressionForCompletedExercise(opts: {
  supabase: SupabaseClient;
  userId: string;
  program: any;
  workout: any;
  exercise: any;
  logsByPlannedSetId: Record<string, any>;
  extraWorkouts?: any[];
  historyExposures?: ExerciseExposureInput[];
}): Promise<AdaptationApplicationResult | null> {
  if (!opts.program?.id || !opts.exercise?.catalog_exercise_id) return null;
  const current = exposureFromLoggedExercise({
    exercise: opts.exercise,
    workout: opts.workout,
    logsByPlannedSetId: opts.logsByPlannedSetId,
  });
  const decision = evaluateProgressionDecision({ current, history: opts.historyExposures || [] });
  const candidates = candidatesFromProgram({
    userId: opts.userId,
    program: opts.program,
    extraWorkouts: opts.extraWorkouts,
    logsByPlannedSetId: opts.logsByPlannedSetId,
  });
  const source: SourceExposureRef = {
    user_id: opts.userId,
    program_id: opts.program.id,
    workout_id: opts.workout.id,
    exercise_id: opts.exercise.id,
    catalog_exercise_id: opts.exercise.catalog_exercise_id,
    week: Number(opts.workout.week || 1),
    day_order: Number(opts.workout.day_order || 0),
    log_date: current.log_date,
    measurement_type: opts.exercise.measurement_type || 'reps',
    program_role: opts.exercise.program_role,
    laterality: lateralityOf(opts.exercise),
    exercise_name: opts.exercise.name,
  };
  const laterIds = candidates
    .filter((c) => c.catalog_exercise_id === source.catalog_exercise_id && c.user_id === source.user_id && c.program_id === source.program_id)
    .flatMap((c) => c.planned_sets.map((s) => s.id));
  if (laterIds.length) {
    const { data: liveLogs } = await opts.supabase
      .from('st_set_logs')
      .select('planned_set_id,completed,actual_weight,actual_reps,actual_duration,actual_distance')
      .in('planned_set_id', laterIds)
      .eq('user_id', opts.userId);
    const perfIds = new Set((liveLogs || []).filter((row) => logHasPerformance(row)).map((row) => row.planned_set_id));
    candidates.forEach((c) => {
      if (c.planned_sets.some((s) => perfIds.has(s.id))) c.has_performance = true;
    });
  }
  const selected = selectNextEligibleExposure(source, candidates);
  const expected = selected ? prescriptionFingerprint(selected.planned_sets) : null;
  if (selected?.planned_sets?.length) {
    const ids = selected.planned_sets.map((s) => s.id);
    const { data: liveSets } = await opts.supabase
      .from('st_planned_sets')
      .select('id,exercise_id,set_type,set_number,target_weight,target_reps,rep_min,rep_max,target_rir,is_deleted')
      .in('id', ids);
    if (liveSets?.length) {
      selected.planned_sets = liveSets.map((s: any) => ({
        id: s.id,
        exercise_id: s.exercise_id || selected.exercise_id,
        set_type: s.set_type,
        set_number: s.set_number,
        target_weight: s.target_weight,
        target_reps: s.target_reps,
        rep_min: s.rep_min,
        rep_max: s.rep_max,
        target_rir: s.target_rir,
        is_deleted: s.is_deleted,
      }));
    }
  }
  const existing = await opts.supabase
    .from('st_adaptation_events')
    .select('application_key,application_status,reason_codes,before_json,after_json,target_fingerprint,decision,science_version,adaptation_engine_version,increment_value,increment_unit,source_workout_id,source_exercise_id,target_workout_id,target_exercise_id,user_id,program_id,from_week,to_week,exercise_catalog_id,actor,increment_source,increment_reason,confidence,source_log_date')
    .eq('user_id', opts.userId)
    .eq('source_exercise_id', opts.exercise.id);
  const existingEvents = existing.error ? [] : (existing.data || []);
  const result = applyProgressionDecision({
    source,
    decision,
    candidates,
    expected_fingerprint: expected,
    existing_events: existingEvents as any,
  });
  const persist = await persistAdaptationApplication(opts.supabase, result);
  if (persist.persistError) {
    return {
      ...result,
      status: 'not_applied',
      applied: false,
      mutated: false,
      abort_reason: /performance|history|st_planned_set/i.test(persist.persistError) ? 'HISTORY_GUARD' : result.abort_reason,
      mutations: [],
    };
  }
  return result;
}
