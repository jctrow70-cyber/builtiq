import { parseYmd } from '../training/programCalendar';

export const GROUP_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type GroupRepeatMode = 'none' | 'week' | 'custom';

export type GroupRepeatDraft = {
  mode: GroupRepeatMode;
  weekdays: number[];
  until: string | null;
};

/** Monday = 0, matching st_group_weekday_index. */
export function groupWeekdayIndex(ymd: string): number {
  return (parseYmd(ymd).getDay() + 6) % 7;
}

export function groupRepeatDraft(date: string): GroupRepeatDraft {
  return { mode: 'none', weekdays: [groupWeekdayIndex(date)], until: null };
}

export function groupRepeatSave(
  draft: GroupRepeatDraft,
  date: string
): { recurrence: 'none' | 'weekly'; recurrenceWeekdays: number[]; recurrenceUntil: string | null } {
  const start = groupWeekdayIndex(date);
  if (draft.mode === 'none') return { recurrence: 'none', recurrenceWeekdays: [], recurrenceUntil: null };
  if (draft.mode === 'week') return { recurrence: 'weekly', recurrenceWeekdays: [start], recurrenceUntil: draft.until || null };
  const days = Array.from(new Set([start, ...draft.weekdays.filter((day) => day >= 0 && day <= 6)])).sort((left, right) => left - right);
  return { recurrence: 'weekly', recurrenceWeekdays: days, recurrenceUntil: draft.until || null };
}
