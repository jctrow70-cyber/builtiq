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
