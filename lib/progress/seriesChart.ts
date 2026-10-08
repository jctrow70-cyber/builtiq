import { e1rmOf, isCountedWorkingSet, setVolume, type ProgressSetFact } from './setFacts';

export type SeriesChartMetric = 'e1rm' | 'load' | 'reps' | 'volume' | 'sets';

export type SeriesChartPoint = { date: string; value: number };

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
