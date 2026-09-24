import type { SupabaseClient } from '@supabase/supabase-js';
import type { PainFlag, SessionStatus, SkipReason, WorkoutFeel } from '../scienceEngine/adaptation/types';

export type WorkoutSessionRow = {
  id?: string;
  user_id: string;
  workout_id: string;
  program_id?: string | null;
  log_date: string;
  status: SessionStatus;
  skip_reason?: SkipReason | null;
  completed_at?: string | null;
  duration_minutes?: number | null;
  feedback_id?: string | null;
};

export type WorkoutFeedbackDraft = {
  workout_feel?: WorkoutFeel | null;
  pain_flag?: PainFlag | null;
  notes?: string | null;
};

function missingTable(error: { message?: string } | null | undefined): boolean {
  return /does not exist|could not find|schema cache/i.test(error?.message || '');
}

export async function upsertWorkoutSession(
  supabase: SupabaseClient,
  row: WorkoutSessionRow
): Promise<{ data: WorkoutSessionRow | null; error: string | null; pendingMigration: boolean }> {
  const payload = {
    user_id: row.user_id,
    workout_id: row.workout_id,
    program_id: row.program_id || null,
    log_date: row.log_date,
    status: row.status,
    skip_reason: row.status === 'skipped' ? row.skip_reason || 'other' : null,
    completed_at: row.status === 'completed' || row.status === 'partial' ? row.completed_at || new Date().toISOString() : null,
    duration_minutes: row.duration_minutes ?? null,
    feedback_id: row.feedback_id || null,
  };
  const { data, error } = await supabase
    .from('st_workout_sessions')
    .upsert(payload, { onConflict: 'user_id,workout_id,log_date' })
    .select()
    .maybeSingle();
  if (missingTable(error)) return { data: null, error: error?.message || 'st_workout_sessions missing', pendingMigration: true };
  if (error) return { data: null, error: error.message, pendingMigration: false };
  return { data: (data as WorkoutSessionRow) || null, error: null, pendingMigration: false };
}

export async function upsertWorkoutFeel(
  supabase: SupabaseClient,
  opts: { userId: string; workoutId: string; logDate: string; draft: WorkoutFeedbackDraft }
): Promise<{ id: string | null; error: string | null; pendingMigration: boolean }> {
  const payload = {
    user_id: opts.userId,
    workout_id: opts.workoutId,
    log_date: opts.logDate,
    workout_feel: opts.draft.workout_feel || null,
    pain_flag: opts.draft.pain_flag || 'none',
    notes: opts.draft.notes || null,
  };
  const { data, error } = await supabase.from('st_workout_feedback').insert(payload).select('id').maybeSingle();
  if (missingTable(error) || /workout_feel|pain_flag|notes/i.test(error?.message || '')) {
    return { id: null, error: error?.message || 'feedback columns missing', pendingMigration: true };
  }
  if (error) return { id: null, error: error.message, pendingMigration: false };
  return { id: data?.id || null, error: null, pendingMigration: false };
}

export async function upsertExerciseSession(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    exerciseId: string;
    workoutSessionId?: string | null;
    logDate: string;
    status: 'not_started' | 'completed' | 'partial' | 'skipped';
    skipReason?: SkipReason | null;
    attemptOutcome?: 'did_not_perform' | 'could_not_complete' | 'completed';
  }
): Promise<{ error: string | null; pendingMigration: boolean }> {
  const payload = {
    user_id: opts.userId,
    exercise_id: opts.exerciseId,
    workout_session_id: opts.workoutSessionId || null,
    log_date: opts.logDate,
    status: opts.status,
    skip_reason: opts.status === 'skipped' ? opts.skipReason || 'other' : null,
    attempt_outcome: opts.attemptOutcome || (opts.status === 'skipped' ? 'did_not_perform' : 'completed'),
  };
  const { error } = await supabase.from('st_exercise_sessions').upsert(payload, { onConflict: 'user_id,exercise_id,log_date' });
  if (missingTable(error)) return { error: error?.message || 'st_exercise_sessions missing', pendingMigration: true };
  return { error: error?.message || null, pendingMigration: false };
}
