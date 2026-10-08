import { addDaysYmd } from '../training/programCalendar';

export const PROGRESS_RANGES = ['7D', '4W', '3M', '6M', '1Y', 'All'] as const;
export type ProgressRange = (typeof PROGRESS_RANGES)[number];

const RANGE_DAYS: Record<Exclude<ProgressRange, 'All'>, number> = {
  '7D': 7,
  '4W': 28,
  '3M': 91,
  '6M': 182,
  '1Y': 365,
};

export type DateSpan = { from: string; to: string };

/** Ranges shorter than this compare against the previous equal window instead of the first 28 days. */
export const SHORT_RANGE_DAYS = 56;
export const COMPARISON_WINDOW_DAYS = 28;

export function inclusiveDays(from: string, to: string): number {
  const start = Date.UTC(...parts(from));
  const end = Date.UTC(...parts(to));
  return Math.floor((end - start) / 86400000) + 1;
}

export function rangeBounds(range: ProgressRange, today: string, earliestDate?: string | null): DateSpan {
  const to = today;
  if (range === 'All') {
    const from = earliestDate && earliestDate <= today ? earliestDate : today;
    return { from, to };
  }
  const days = RANGE_DAYS[range];
  return { from: addDaysYmd(today, -(days - 1)), to };
}

export type ComparableWindows = {
  mode: 'within_range' | 'previous_window';
  baseline: DateSpan;
  current: DateSpan;
};

export function comparableWindows(span: DateSpan): ComparableWindows {
  const days = inclusiveDays(span.from, span.to);
  if (days >= SHORT_RANGE_DAYS) {
    return {
      mode: 'within_range',
      baseline: { from: span.from, to: addDaysYmd(span.from, COMPARISON_WINDOW_DAYS - 1) },
      current: { from: addDaysYmd(span.to, -(COMPARISON_WINDOW_DAYS - 1)), to: span.to },
    };
  }
  return {
    mode: 'previous_window',
    current: span,
    baseline: { from: addDaysYmd(span.from, -days), to: addDaysYmd(span.from, -1) },
  };
}

export function inSpan(date: string, span: DateSpan): boolean {
  const day = String(date || '').slice(0, 10);
  return !!day && day >= span.from && day <= span.to;
}

export function earliestIsoDate(dates: string[]): string | null {
  const clean = dates.map((date) => String(date || '').slice(0, 10)).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  if (!clean.length) return null;
  return clean.sort()[0];
}

function parts(ymd: string): [number, number, number] {
  const [year, month, day] = ymd.slice(0, 10).split('-').map(Number);
  return [year, (month || 1) - 1, day || 1];
}
