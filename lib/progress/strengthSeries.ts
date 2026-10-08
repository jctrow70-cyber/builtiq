import { seriesKey, displaySeriesName, type SeriesIdentity } from './identity';
import { inSpan, type DateSpan } from './ranges';
import type { DataProvenance } from './provenance';
import { e1rmOf, isCountedWorkingSet, setVolume, type ProgressSetFact } from './setFacts';

export type SeriesWindows = {
  identity: SeriesIdentity;
  key: string;
  label: string;
  baselineE1rm: number | null;
  currentE1rm: number | null;
  percentChange: number | null;
  baselineSessions: number;
  currentSessions: number;
  baselineQualifyingSets: number;
  currentQualifyingSets: number;
  distinctWeeks: number;
  workingSetsInView: number;
  programRole: string | null;
  movementPattern: string | null;
  equipmentProvenance: DataProvenance;
  patternProvenance: DataProvenance;
  bestSet: { weight: number; reps: number; date: string } | null;
  lastSet: { weight: number; reps: number; date: string } | null;
  viewVolume: number;
};

export function percentChange(baseline: number | null, current: number | null): number | null {
  if (baseline == null || current == null || !(baseline > 0)) return null;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}

export function buildSeriesWindows(
  facts: ProgressSetFact[],
  view: DateSpan,
  baseline: DateSpan,
  current: DateSpan,
  weekOf: (date: string) => string
): SeriesWindows[] {
  const groups = new Map<string, ProgressSetFact[]>();
  facts.forEach((fact) => {
    if (!fact.logDate) return;
    const key = seriesKey(fact.identity);
    const list = groups.get(key) || [];
    list.push(fact);
    groups.set(key, list);
  });

  return Array.from(groups.entries())
    .map(([key, rows]) => summarizeSeries(key, rows, view, baseline, current, weekOf))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function summarizeSeries(
  key: string,
  rows: ProgressSetFact[],
  view: DateSpan,
  baseline: DateSpan,
  current: DateSpan,
  weekOf: (date: string) => string
): SeriesWindows {
  const identity = rows[0].identity;
  const baselineBest = bestE1rm(rows, baseline);
  const currentBest = bestE1rm(rows, current);
  const qualifying = rows.filter((fact) => e1rmOf(fact) != null);
  const weeks = new Set(qualifying.map((fact) => weekOf(fact.logDate)));
  const viewRows = rows.filter((fact) => inSpan(fact.logDate, view) && isCountedWorkingSet(fact));
  const performed = viewRows
    .filter((fact) => fact.weight != null && fact.reps != null)
    .sort((a, b) => a.logDate.localeCompare(b.logDate) || a.id.localeCompare(b.id));
  const best = [...performed].sort((a, b) => (e1rmOf(b) || 0) - (e1rmOf(a) || 0) || (b.weight || 0) - (a.weight || 0))[0];
  const last = performed[performed.length - 1];

  return {
    identity,
    key,
    label: displaySeriesName(identity),
    baselineE1rm: baselineBest.value,
    currentE1rm: currentBest.value,
    percentChange: percentChange(baselineBest.value, currentBest.value),
    baselineSessions: baselineBest.sessions,
    currentSessions: currentBest.sessions,
    baselineQualifyingSets: baselineBest.sets,
    currentQualifyingSets: currentBest.sets,
    distinctWeeks: weeks.size,
    workingSetsInView: viewRows.length,
    programRole: mostCommon(rows.map((fact) => fact.programRole)),
    movementPattern: mostCommon(rows.map((fact) => fact.movementPattern)),
    equipmentProvenance: strongestProvenance(rows.map((fact) => fact.provenance.equipment)),
    patternProvenance: strongestProvenance(rows.map((fact) => fact.provenance.movementPattern)),
    bestSet: best && best.weight != null && best.reps != null ? { weight: best.weight, reps: best.reps, date: best.logDate } : null,
    lastSet: last && last.weight != null && last.reps != null ? { weight: last.weight, reps: last.reps, date: last.logDate } : null,
    viewVolume: Math.round(viewRows.reduce((sum, fact) => sum + (setVolume(fact) || 0), 0)),
  };
}

function bestE1rm(rows: ProgressSetFact[], span: DateSpan): { value: number | null; sessions: number; sets: number } {
  const matched = rows.filter((fact) => inSpan(fact.logDate, span) && e1rmOf(fact) != null);
  let value: number | null = null;
  matched.forEach((fact) => {
    const estimate = e1rmOf(fact);
    if (estimate != null && (value == null || estimate > value)) value = estimate;
  });
  return {
    value,
    sessions: new Set(matched.map((fact) => fact.logDate)).size,
    sets: matched.length,
  };
}

function mostCommon(values: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  let best: string | null = null;
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  });
  return best;
}

function strongestProvenance(values: DataProvenance[]): DataProvenance {
  const rank = { snapshotted: 3, backfilled: 2, estimated: 1, unknown: 0 };
  return values.reduce<DataProvenance>((best, value) => (rank[value] > rank[best] ? value : best), 'unknown');
}

export type PrKind = 'load' | 'e1rm' | 'reps_at_load' | 'best_set';

export type SeriesPr = {
  key: string;
  label: string;
  kind: PrKind;
  weight: number | null;
  reps: number | null;
  e1rm: number | null;
  date: string;
};

/** One headline PR per series. Load, then reps at that load, then e1RM when it is a different performance. */
export function seriesPersonalRecords(facts: ProgressSetFact[]): SeriesPr[] {
  const groups = new Map<string, ProgressSetFact[]>();
  facts.forEach((fact) => {
    if (!isCountedWorkingSet(fact)) return;
    if (fact.weight == null && fact.reps == null) return;
    const key = seriesKey(fact.identity);
    const list = groups.get(key) || [];
    list.push(fact);
    groups.set(key, list);
  });

  const records: SeriesPr[] = [];
  groups.forEach((rows, key) => {
    const label = displaySeriesName(rows[0].identity);
    const loaded = rows.filter((fact) => fact.weight != null && fact.weight > 0);
    const heaviest = [...loaded].sort((a, b) => (b.weight || 0) - (a.weight || 0) || (b.reps || 0) - (a.reps || 0))[0];
    if (heaviest?.weight != null) {
      records.push({
        key,
        label,
        kind: 'load',
        weight: heaviest.weight,
        reps: heaviest.reps,
        e1rm: e1rmOf(heaviest),
        date: heaviest.logDate,
      });
      const sameLoad = loaded.filter((fact) => fact.weight === heaviest.weight && fact.reps != null);
      const repBest = [...sameLoad].sort((a, b) => (b.reps || 0) - (a.reps || 0))[0];
      if (repBest && repBest.id !== heaviest.id && (repBest.reps || 0) > (heaviest.reps || 0)) {
        records.push({
          key,
          label,
          kind: 'reps_at_load',
          weight: repBest.weight,
          reps: repBest.reps,
          e1rm: e1rmOf(repBest),
          date: repBest.logDate,
        });
      }
    }
    const estimated = rows
      .map((fact) => ({ fact, e1rm: e1rmOf(fact) }))
      .filter((item) => item.e1rm != null)
      .sort((a, b) => (b.e1rm || 0) - (a.e1rm || 0))[0];
    if (estimated && estimated.fact.id !== heaviest?.id) {
      records.push({
        key,
        label,
        kind: 'e1rm',
        weight: estimated.fact.weight,
        reps: estimated.fact.reps,
        e1rm: estimated.e1rm,
        date: estimated.fact.logDate,
      });
    }
  });
  return records;
}
