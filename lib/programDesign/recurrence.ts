import { dayLabelFromYmd } from '../training/programCalendar';
import { WEEKDAY_LABELS, type ActivityDraft, type WeekdayLabel } from './types';

/** Monday = 0 … Sunday = 6 (same as program `day_of_week`). */
export function weekdayIndexFromYmd(ymd: string): number {
  const label = dayLabelFromYmd(ymd) as WeekdayLabel;
  const idx = WEEKDAY_LABELS.indexOf(label);
  return idx >= 0 ? idx : 0;
}

export function normalizeWeekdays(days: Array<number | string> | null | undefined, fallback?: number): number[] {
  const parsed = (days || [])
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const unique = Array.from(new Set(parsed)).sort((a, b) => a - b);
  if (unique.length) return unique;
  if (fallback == null || fallback < 0 || fallback > 6) return [];
  return [fallback];
}

export function weekdaysFromDetails(
  details: Record<string, unknown> | null | undefined,
  fallbackWeekday?: number
): number[] {
  const raw = details?.recurrence_weekdays;
  const list = Array.isArray(raw) ? raw : [];
  return normalizeWeekdays(list, fallbackWeekday);
}

export function withRecurrenceDetails(
  details: Record<string, unknown> | null | undefined,
  weekdays: number[]
): Record<string, unknown> {
  const next = { ...(details || {}) };
  const days = normalizeWeekdays(weekdays);
  if (days.length) next.recurrence_weekdays = days;
  else delete next.recurrence_weekdays;
  return next;
}

export function draftWeekdays(draft: Pick<ActivityDraft, 'recurrence_weekdays'>, fallbackWeekday: number): number[] {
  return normalizeWeekdays(draft.recurrence_weekdays, fallbackWeekday);
}

export function isWeeklyRecurrence(recurrence: string | null | undefined): boolean {
  return recurrence === 'weekly';
}

export function occursOnWeekday(weekdays: number[], weekday: number): boolean {
  return weekdays.includes(weekday);
}
