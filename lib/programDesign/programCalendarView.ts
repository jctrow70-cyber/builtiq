import { addDaysYmd, dayLabelFromYmd, todayYmd, weekForDate } from '../training/programCalendar';
import { dateForProgramDay } from './cycle';
import { WEEKDAY_LABELS, type ProgramActivity } from './types';

export type ProgramCalendarView = 'day' | 'week' | 'month';

export const PROGRAM_CALENDAR_VIEW_KEY = 'builtiq.programDesign.calendarView';

export function isProgramCalendarView(value: unknown): value is ProgramCalendarView {
  return value === 'day' || value === 'week' || value === 'month';
}

export function readPreferredCalendarView(): ProgramCalendarView {
  if (typeof window === 'undefined') return 'week';
  try {
    const stored = window.localStorage.getItem(PROGRAM_CALENDAR_VIEW_KEY);
    return isProgramCalendarView(stored) ? stored : 'week';
  } catch {
    return 'week';
  }
}

export function rememberCalendarView(view: ProgramCalendarView) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROGRAM_CALENDAR_VIEW_KEY, view);
  } catch {
    /* ignore quota / private mode */
  }
}

export function programDayState(activities: ProgramActivity[]): 'rest' | 'scheduled' | 'completed' {
  const actionable = (activities || []).filter((activity) => activity.activity_type !== 'rest');
  if (!actionable.length) return 'rest';
  return 'scheduled';
}

export function clampProgramWeek(week: number, totalWeeks: number): number {
  return Math.max(1, Math.min(totalWeeks, week));
}

export function selectProgramDate(
  startMonday: string,
  dateYmd: string,
  totalWeeks: number
): { week: number; dayOfWeek: number; date: string } {
  const week = clampProgramWeek(weekForDate(startMonday, dateYmd, totalWeeks), totalWeeks);
  const labeled = WEEKDAY_LABELS.indexOf(dayLabelFromYmd(dateYmd) as (typeof WEEKDAY_LABELS)[number]);
  const dayOfWeek = labeled >= 0 ? labeled : 0;
  return { week, dayOfWeek, date: dateForProgramDay(startMonday, week, dayOfWeek) };
}

export function defaultProgramDate(startMonday: string, totalWeeks: number, today = todayYmd()): string {
  const { start, end } = {
    start: startMonday,
    end: addDaysYmd(startMonday, Math.max(1, totalWeeks) * 7 - 1),
  };
  if (today >= start && today <= end) return today;
  return startMonday;
}
