import { e1rmOf, isCountedWorkingSet, setVolume, type ProgressSetFact } from './setFacts';

export type SeriesChartMetric = 'e1rm' | 'load' | 'reps' | 'volume' | 'sets';

export type SeriesChartPoint = { date: string; value: number };

/**
 * Vertical range for a strength chart.
 * Small changes stay visible. A large rise can still include zero.
 * The axis never drops below zero.
 */
export function chartValueDomain(values: number[]): { min: number; max: number } {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return { min: 0, max: 1 };
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  const span = high - low;
  const pad = Math.max(span * 0.2, high * 0.04, 1);
  const relative = high > 0 ? span / high : 1;
  let min = relative < 0.4 ? low - pad : 0;
  let max = high + pad;
  if (min < 0) min = 0;
  if (max <= min) max = min + 1;
  return { min: roundChart(min), max: roundChart(max) };
}

function roundChart(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * What a sparse chart should show.
 * Point values are the calculated metric. Axis endpoints are only a scale,
 * and a single date does not get a second label.
 */
export function chartReadout(points: SeriesChartPoint[]): { pointValues: number[]; dates: string[]; showScale: boolean } {
  const plotted = points.filter((point) => Number.isFinite(point.value));
  const dates = Array.from(new Set(plotted.map((point) => point.date)));
  return {
    pointValues: plotted.map((point) => point.value),
    dates,
    showScale: plotted.length >= 2 && dates.length >= 2,
  };
}

/**
 * One point per logged day for a single series.
 * Days without that series are omitted. They are not filled with zero.
 */
export function seriesChartPoints(facts: ProgressSetFact[], metric: SeriesChartMetric): SeriesChartPoint[] {
  const byDate = new Map<string, ProgressSetFact[]>();
  facts.forEach((fact) => {
    if (!isCountedWorkingSet(fact)) return;
    const rows = byDate.get(fact.logDate) || [];
    rows.push(fact);
    byDate.set(fact.logDate, rows);
  });

  const points: SeriesChartPoint[] = [];
  Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([date, rows]) => {
      const value = metricValue(rows, metric);
      if (value != null) points.push({ date, value });
    });
  return points;
}

function metricValue(rows: ProgressSetFact[], metric: SeriesChartMetric): number | null {
  if (metric === 'sets') return rows.length;
  if (metric === 'e1rm') return maxOf(rows.map((row) => e1rmOf(row)));
  if (metric === 'load') return maxOf(rows.map((row) => (row.weight != null && row.weight > 0 ? row.weight : null)));
  if (metric === 'reps') return maxOf(rows.map((row) => row.reps));
  const volumes = rows.map((row) => setVolume(row)).filter((value): value is number => value != null);
  return volumes.length ? volumes.reduce((sum, value) => sum + value, 0) : null;
}

function maxOf(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value != null && Number.isFinite(value));
  return numbers.length ? Math.max(...numbers) : null;
}
