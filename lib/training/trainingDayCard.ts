import type { SessionStatus } from '../scienceEngine/adaptation/types';
import type { ExpectationSessionStatus } from './unifiedSchedule';

export const TRAINING_CALENDAR_VIEWS = ['day', 'week', 'month'] as const;

export type TrainingCalendarView = (typeof TRAINING_CALENDAR_VIEWS)[number];

/** Compact source · type · duration/focus line under the workout title. */
export function trainingDayCardLine(input: {
  source?: string | null;
  typeLabel?: string | null;
  duration?: string | null;
  focus?: string | null;
}): string {
  const source = String(input.source || '').trim();
  const typeLabel = String(input.typeLabel || '').trim();
  const duration = String(input.duration || '').trim();
  const focus = String(input.focus || '').trim();
  const focusUseful = Boolean(focus && focus !== typeLabel);
  return [source, typeLabel, duration, focusUseful ? focus : null].filter(Boolean).join(' · ');
}

/**
 * Schedule adherence owns Missed, Excused, and explicit Completed, Partial, and Skipped.
 * In progress is session progress and only replaces an open Scheduled day.
 * A past unfinished session stays Missed. Partial and in-progress never become Completed here.
 */
export function presentTrainingStatus(input: {
  scheduleState?: string | null;
  setLogsCompleted?: boolean;
  sessionStatus?: ExpectationSessionStatus;
  progress?: SessionStatus | null;
}): string {
  const schedule = String(input.scheduleState || '').trim();
  const session = input.sessionStatus || null;
  const progress = input.progress || null;
  if (session === 'skipped' || schedule === 'Skipped' || progress === 'skipped') return 'Skipped';
  if (session === 'partial' || schedule === 'Partial' || progress === 'partial') return 'Partial';
  if (session === 'completed' || schedule === 'Completed' || input.setLogsCompleted || progress === 'completed') return 'Completed';
  if (schedule === 'Missed') return 'Missed';
  if (schedule === 'Excused') return 'Excused';
  const openDay = !schedule || schedule === 'Scheduled' || schedule === 'Today' || schedule === 'Upcoming';
  if (openDay && (session === 'in_progress' || progress === 'in_progress')) return 'In progress';
  if (!schedule || schedule === 'Today' || schedule === 'Upcoming') return 'Scheduled';
  return schedule;
}

export function trainingStatusClass(label: string): string {
  return `te-status te-status--${label.toLowerCase().replace(/\s+/g, '-')}`;
}

/** Hide Scheduled next to Start and Completed next to Review. Keep Missed / Partial. */
export function trainingDayCardShowsStatus(input: {
  statusLabel?: string | null;
  canStart?: boolean;
}): boolean {
  const label = String(input.statusLabel || '').trim();
  if (!label) return false;
  if (input.canStart && (label === 'Scheduled' || label === 'Completed')) return false;
  return true;
}

export function trainingDayCardAction(input: {
  canStart?: boolean;
  completed?: boolean;
}): 'Start' | 'Review' | null {
  if (!input.canStart) return null;
  return input.completed ? 'Review' : 'Start';
}

export function trainingDayCardTitleAria(input: {
  name?: string | null;
  canPreview?: boolean;
}): string | undefined {
  if (!input.canPreview) return undefined;
  const name = String(input.name || '').trim() || 'workout';
  return `View details for ${name}`;
}

/** Header Add stays; empty-day copy does not repeat the same green button. */
export function showEmptyDayAdd(headerHasAdd: boolean): boolean {
  return !headerHasAdd;
}

export function trainingPageHeading(input: {
  sessionOpen?: boolean;
  sessionIntent?: 'log' | 'edit';
  selectedDateLabel?: string | null;
}): { title: string; subtitle?: string } {
  if (input.sessionOpen) {
    return { title: input.sessionIntent === 'edit' ? 'Edit workout' : 'Workout' };
  }
  const subtitle = String(input.selectedDateLabel || '').trim();
  return subtitle ? { title: 'Training', subtitle } : { title: 'Training' };
}
