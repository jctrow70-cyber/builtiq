import {
  addDaysYmd,
  formatYmd,
  mondayOfWeek,
  parseYmd,
  programEndDate,
  sundayOfWeek,
} from '../training/programCalendar';
import { WEEKDAY_LABELS, type WeekdayLabel } from './types';

export { mondayOfWeek, sundayOfWeek, programEndDate, addDaysYmd };

export function isMonday(ymd: string): boolean {
  return parseYmd(ymd).getDay() === 1;
}

/** Snap any date to the Monday of its Mon–Sun week. */
export function snapStartToMonday(ymd: string): { startDate: string; adjusted: boolean } {
  const startDate = mondayOfWeek(ymd);
  return { startDate, adjusted: startDate !== ymd };
}

export function cycleEndDate(startMonday: string, cycleWeeks: number): string {
  return programEndDate(startMonday, cycleWeeks);
}

export function cycleLengthOf(program: {
  cycle_length_weeks?: number | null;
  weeks?: number | null;
}): number {
  const n = Number(program.cycle_length_weeks || program.weeks || 6);
  return Math.max(1, Math.min(52, n || 6));
}

export function programDateRange(program: {
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  cycle_length_weeks?: number | null;
  weeks?: number | null;
}): { start: string; end: string } {
  const start = program.start_date
    ? mondayOfWeek(String(program.start_date).slice(0, 10))
    : program.created_at
      ? mondayOfWeek(String(program.created_at).slice(0, 10))
      : mondayOfWeek(formatYmd(new Date()));
  const end = program.end_date
    ? String(program.end_date).slice(0, 10)
    : cycleEndDate(start, cycleLengthOf(program));
  return { start, end };
}

export function formatMediumDate(ymd: string): string {
  const d = parseYmd(ymd);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatLongWeekday(ymd: string): string {
  const d = parseYmd(ymd);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatProgramRange(start: string, end: string): string {
  return `${formatMediumDate(start)} – ${formatMediumDate(end)}`;
}

export function formatCycleLength(weeks: number): string {
  return weeks === 1 ? '1 Week' : `${weeks} Weeks`;
}

export function weekdayLabel(dayOfWeek: number): WeekdayLabel {
  return WEEKDAY_LABELS[Math.max(0, Math.min(6, dayOfWeek))] || 'Mon';
}

export function dayOfWeekFromLabel(label: string): number {
  const idx = WEEKDAY_LABELS.indexOf(label as WeekdayLabel);
  return idx >= 0 ? idx : 0;
}

export function dateForProgramDay(startMonday: string, weekNumber: number, dayOfWeek: number): string {
  const week = Math.max(1, weekNumber);
  const day = Math.max(0, Math.min(6, dayOfWeek));
  return addDaysYmd(startMonday, (week - 1) * 7 + day);
}

/** Upcoming Monday. If the date is already Monday, keep it. */
export function nextMondayFrom(ymd?: string): string {
  const base = ymd || formatYmd(new Date());
  if (isMonday(base)) return base;
  return addDaysYmd(mondayOfWeek(base), 7);
}
