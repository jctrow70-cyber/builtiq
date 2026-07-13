/**
 * Map program week numbers to calendar dates using st_programs.start_date.
 * Week 1 begins on start_date; week N spans start+(N-1)*7 .. start+N*7-1.
 */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function parseYmd(ymd: string): Date {
  const [y, m, d] = String(ymd || '')
    .slice(0, 10)
    .split('-')
    .map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setDate(d.getDate() + days);
  return formatYmd(d);
}

export function dayLabelFromYmd(ymd: string): string {
  return DAY_LABELS[parseYmd(ymd).getDay()];
}

export function dayOrderFromLabel(dayLabel: string): number {
  const idx = DAY_LABELS.indexOf(dayLabel as (typeof DAY_LABELS)[number]);
  // App DAYS uses Mon=0..Sun=6; keep JS Sunday=0 for calendar math only.
  return idx >= 0 ? idx : 1;
}

/** Prefer explicit start_date; fall back to created_at date. */
export function resolveProgramStartDate(program: { start_date?: string | null; created_at?: string | null } | null | undefined, fallback = formatYmd(new Date())): string {
  if (program?.start_date) return String(program.start_date).slice(0, 10);
  if (program?.created_at) return String(program.created_at).slice(0, 10);
  return fallback;
}

export function weekForDate(startDate: string, dateYmd: string, totalWeeks = 6): number {
  const start = parseYmd(startDate);
  const date = parseYmd(dateYmd);
  const diffMs = date.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 0) return 1;
  const week = Math.floor(diffDays / 7) + 1;
  const max = Math.max(1, Number(totalWeeks) || 6);
  return Math.min(Math.max(1, week), max);
}

export function weekStartDate(startDate: string, week: number): string {
  const w = Math.max(1, Number(week) || 1);
  return addDaysYmd(startDate, (w - 1) * 7);
}

export function weekEndDate(startDate: string, week: number): string {
  return addDaysYmd(weekStartDate(startDate, week), 6);
}

export function weekRangeLabel(startDate: string, week: number): string {
  const a = weekStartDate(startDate, week);
  const b = weekEndDate(startDate, week);
  return `${a} → ${b}`;
}

/**
 * Calendar date for a program day_label inside a week block.
 * Picks the unique day in [weekStart, weekStart+6] matching Mon/Tue/... label.
 */
export function dateForWeekAndDay(startDate: string, week: number, dayLabel: string): string {
  const start = weekStartDate(startDate, week);
  for (let i = 0; i < 7; i++) {
    const ymd = addDaysYmd(start, i);
    if (dayLabelFromYmd(ymd) === dayLabel) return ymd;
  }
  return start;
}

/** Keep weekday when jumping weeks (e.g. Week 1 Wed → Week 2 Wed). */
export function dateForWeekKeepingWeekday(startDate: string, week: number, currentDateYmd: string): string {
  return dateForWeekAndDay(startDate, week, dayLabelFromYmd(currentDateYmd));
}
