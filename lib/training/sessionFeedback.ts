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
