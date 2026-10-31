import type { PainFlag, SessionStatus, SkipReason, WorkoutFeel } from '../scienceEngine/adaptation/types';

/** Review of a saved session starts open so existing feedback is visible. New sessions stay collapsed. */
export function sessionFeedbackDefaultExpanded(status?: SessionStatus | null): boolean {
  return status === 'completed' || status === 'partial' || status === 'skipped';
}

/** Skip and finish must reveal the card so skip reasons and remaining fields stay reachable. */
export function sessionFeedbackShouldReveal(status?: SessionStatus | null): boolean {
  return status === 'completed' || status === 'partial' || status === 'skipped';
}

export function sessionFeedbackSummary(input: {
  status?: SessionStatus | null;
  feel?: WorkoutFeel | '' | null;
  pain?: PainFlag | '' | null;
  notes?: string | null;
  skipReason?: SkipReason | '' | null;
}): string {
  const statusLabel =
    input.status === 'completed'
      ? 'Completed'
      : input.status === 'partial'
        ? 'Partial'
        : input.status === 'skipped'
          ? 'Skipped'
          : '';
  const feel = String(input.feel || '').trim().replace(/_/g, ' ');
  const pain = String(input.pain || '').trim().replace(/_/g, ' ');
  const skipReason = String(input.skipReason || '').trim().replace(/_/g, ' ');
  const notes = String(input.notes || '').trim();
  return [statusLabel, feel, pain && pain !== 'none' ? pain : null, skipReason, notes ? 'Notes' : null]
    .filter(Boolean)
    .join(' · ');
}

/** Collapse never mutates values. Parent state is the source of truth. */
export function sessionFeedbackValuesAfterToggle<T extends Record<string, unknown>>(values: T): T {
  return { ...values };
}

export type SessionFeedbackOpener = 'how-did-it-go' | 'finish';

/** Finish Workout is only for the personal Training logger in log/Review, not Edit or member panels. */
export function showFinishWorkoutAction(input: {
  sessionOpen?: boolean;
  sessionIntent?: 'log' | 'edit' | null;
  memberPanel?: boolean;
}): boolean {
  return !!input.sessionOpen && input.sessionIntent === 'log' && !input.memberPanel;
}

/** Uses existing session status only. Does not derive completion from logs. */
export function finishWorkoutActionLabel(status?: SessionStatus | null): string {
  return sessionFeedbackShouldReveal(status) ? 'Review Workout Feedback' : 'Finish Workout';
}

/** Both openers show the same SessionOutcomeCard. Open/close never writes a session. */
export function sessionFeedbackSharedInterface(opener?: SessionFeedbackOpener | null): {
  opener: SessionFeedbackOpener | null;
  interface: 'session-outcome';
  usesParentState: true;
  writesOnOpen: false;
  writesOnClose: false;
} {
  return {
    opener: opener === 'how-did-it-go' || opener === 'finish' ? opener : null,
    interface: 'session-outcome',
    usesParentState: true,
    writesOnOpen: false,
    writesOnClose: false,
  };
}

/** Closing the sheet keeps the same parent values and status. */
export function sessionFeedbackValuesAfterSheetClose<T extends Record<string, unknown>>(values: T): T {
  return sessionFeedbackValuesAfterToggle(values);
}

export type SessionFeedbackIdentity = {
  userId?: string | null;
  workoutId?: string | null;
  logDate?: string | null;
};

export type SessionFeedbackRecord = {
  id?: string | null;
  user_id?: string | null;
  workout_id?: string | null;
  log_date?: string | null;
  workout_feel?: WorkoutFeel | '' | null;
  pain_flag?: PainFlag | '' | null;
  notes?: string | null;
};

/** user + workout + log date. Missing parts never match another session. */
export function sessionFeedbackIdentityKey(input: SessionFeedbackIdentity): string | null {
  const userId = String(input.userId || '').trim();
  const workoutId = String(input.workoutId || '').trim();
  const logDate = String(input.logDate || '').trim();
  if (!userId || !workoutId || !logDate) return null;
  return `${userId}|${workoutId}|${logDate}`;
}

export function sessionFeedbackMatchesIdentity(
  row: SessionFeedbackRecord | null | undefined,
  session: SessionFeedbackIdentity
): boolean {
  const wanted = sessionFeedbackIdentityKey(session);
  if (!wanted || !row) return false;
  return sessionFeedbackIdentityKey({
    userId: row.user_id,
    workoutId: row.workout_id,
    logDate: row.log_date,
  }) === wanted;
}

/**
 * Prefer the session-linked feedback id. Fall back only to a row for the same user, workout, and date.
 * Sessions are unique on user_id + workout_id + log_date. Extra feedback rows for that key are later
 * inserts for the same session, not another session.
 */
export function pickSessionFeedback(input: {
  session: SessionFeedbackIdentity & { feedbackId?: string | null };
  linked?: SessionFeedbackRecord | null;
  latest?: SessionFeedbackRecord | null;
}): SessionFeedbackRecord | null {
  const linked = input.linked;
  const feedbackId = String(input.session.feedbackId || '').trim();
  if (linked && sessionFeedbackMatchesIdentity(linked, input.session)) {
    if (!feedbackId || String(linked.id || '') === feedbackId) return linked;
  }
  const latest = input.latest;
  if (latest && sessionFeedbackMatchesIdentity(latest, input.session)) return latest;
  return null;
}

export function sessionFeedbackStateFromRow(row: SessionFeedbackRecord | null | undefined): {
  feel: WorkoutFeel | '';
  pain: PainFlag | '';
  notes: string;
} {
  if (!row) return { feel: '', pain: '', notes: '' };
  const feelRaw = String(row.workout_feel || '').trim();
  const feel = feelRaw === 'easy' || feelRaw === 'good' || feelRaw === 'hard' || feelRaw === 'very_hard'
    ? (feelRaw as WorkoutFeel)
    : '';
  const painRaw = String(row.pain_flag || '').trim();
  const pain = painRaw === 'none' || painRaw === 'discomfort' || painRaw === 'pain_limiting' || painRaw === 'stopped_due_to_pain'
    ? (painRaw as PainFlag)
    : '';
  return { feel, pain, notes: String(row.notes || '') };
}

/** Late or dirty loads must not replace the values the user is editing. */
export function shouldApplySessionFeedbackHydration(input: {
  loadKey?: string | null;
  currentKey?: string | null;
  loadGeneration?: number;
  currentGeneration?: number;
  dirty?: boolean;
}): boolean {
  if (!input.loadKey || input.loadKey !== input.currentKey) return false;
  if (Number(input.loadGeneration) !== Number(input.currentGeneration)) return false;
  if (input.dirty) return false;
  return true;
}
