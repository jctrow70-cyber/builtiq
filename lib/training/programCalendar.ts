/**
 * Map program week numbers to calendar dates using st_programs.start_date.
 * Weeks run Monday–Sunday. Week 1 is the Mon–Sun block containing start_date.
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

export function todayYmd(): string {
  return formatYmd(new Date());
}

/** User-facing date format: mm/dd/yy */
export function formatDisplayDate(ymd: string): string {
  const [y, m, d] = String(ymd || '')
    .slice(0, 10)
    .split('-');
  if (!y || !m || !d) return '';
  return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y.slice(-2)}`;
}

/** Parse mm/dd/yy (or mm/dd/yyyy) into YYYY-MM-DD. */
export function parseDisplayDate(input: string): string | null {
  const m = String(input || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return formatYmd(date);
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setDate(d.getDate() + days);
  return formatYmd(d);
}

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

/** Monday on or before the given date (Sunday belongs to the preceding week). */
export function mondayOfWeek(ymd: string): string {
  const d = parseYmd(ymd);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatYmd(d);
}

/** Sunday ending the Mon–Sun week that contains the given date. */
export function sundayOfWeek(ymd: string): string {
  return addDaysYmd(mondayOfWeek(ymd), 6);
}

/** Monday–Sunday bounds for the calendar week containing refDate. */
export function currentCalendarWeekBounds(refDate = new Date()): { monday: string; sunday: string } {
  const monday = mondayOfWeek(formatYmd(refDate));
  return { monday, sunday: addDaysYmd(monday, 6) };
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
export function resolveProgramStartDate(program: { start_date?: string | null; created_at?: string | null } | null | undefined, fallback = todayYmd()): string {
  if (program?.start_date) return String(program.start_date).slice(0, 10);
  if (program?.created_at) return String(program.created_at).slice(0, 10);
  return fallback;
}

/** Monday anchor for program week blocks (Week 1 = Mon–Sun containing start_date). */
export function programWeekAnchor(startDate: string): string {
  return mondayOfWeek(startDate);
}

export function weekForDate(startDate: string, dateYmd: string, totalWeeks = 6): number {
  const anchor = programWeekAnchor(startDate);
  const diffDays = daysBetweenYmd(anchor, dateYmd);
  if (diffDays < 0) return 1;
  const week = Math.floor(diffDays / 7) + 1;
  const max = Math.max(1, Number(totalWeeks) || 6);
  return Math.min(Math.max(1, week), max);
}

export function weekStartDate(startDate: string, week: number): string {
  const w = Math.max(1, Number(week) || 1);
  return addDaysYmd(programWeekAnchor(startDate), (w - 1) * 7);
}

export function weekEndDate(startDate: string, week: number): string {
  return addDaysYmd(weekStartDate(startDate, week), 6);
}

export function weekRangeLabel(startDate: string, week: number): string {
  const a = weekStartDate(startDate, week);
  const b = weekEndDate(startDate, week);
  return `${formatDisplayDate(a)} – ${formatDisplayDate(b)}`;
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
