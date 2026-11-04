import { equipmentSeriesKey, seriesIdentityFromParts, type SeriesIdentity } from './identity';
import { comparableVariantKey } from '../training/equipmentIdentity';
import { loggerSelectedEquipment } from '../training/previousPerformanceDisplay';
import { equipmentRecordLabel, equipmentRecordOf, type EquipmentRecord } from './provenance';
import { comparableWindows, inSpan, rangeBounds, type ProgressRange } from './ranges';
import { seriesChartPoints, type SeriesChartMetric, type SeriesChartPoint } from './seriesChart';
import { e1rmOf, isCountedWorkingSet, type ProgressSetFact } from './setFacts';
import { buildSeriesWindows, percentChange } from './strengthSeries';
import { mondayOfWeek } from '../training/programCalendar';

export const EXERCISE_CHART_RANGES = ['4W', '3M', '6M', '1Y', 'All'] as const;
export type ExerciseChartRange = (typeof EXERCISE_CHART_RANGES)[number];

export type ExerciseProgressIdentity = {
  catalogExerciseId?: string | null;
  exerciseName: string;
  equipment?: string | null;
  variant?: string | null;
};

export type ExerciseProgressRequest = ExerciseProgressIdentity & {
  returnTo: 'training' | 'progress';
  returnSection: 'strength' | 'training';
};

export type PerformanceMark = {
  weight: number | null;
  reps: number | null;
  e1rm: number | null;
  date: string;
};

export type ExerciseSessionSetView = {
  id: string;
  setType: string;
  setNumber: number | null;
  weight: number | null;
  reps: number | null;
  notes: string;
  equipmentLabel: string;
  verified: boolean;
};

export type RecentExerciseSession = {
  date: string;
  best: PerformanceMark | null;
  workingSets: number;
  sets: ExerciseSessionSetView[];
};

export type ExerciseProgressModel = {
  identity: SeriesIdentity;
  equipmentOptions: SeriesIdentity[];
  record: EquipmentRecord;
  recordLabel: string | null;
  changePercent: number | null;
  changeLoad: number | null;
  allTimeLoad: PerformanceMark | null;
  allTimeE1rm: PerformanceMark | null;
  periodBest: PerformanceMark | null;
  chart: SeriesChartPoint[];
  recent: RecentExerciseSession[];
  allSessions: RecentExerciseSession[];
};

export function exerciseProgressRequest(input: ExerciseProgressRequest): ExerciseProgressRequest {
  const variant = comparableVariantKey(input.variant);
  return {
    catalogExerciseId: input.catalogExerciseId || null,
    exerciseName: String(input.exerciseName || 'Exercise').trim() || 'Exercise',
    equipment: input.equipment || null,
    variant: variant || null,
    returnTo: input.returnTo,
    returnSection: input.returnSection,
  };
}

/**
 * The progress request uses the equipment the logger is actually using.
 * Bilateral is not its own history series when older sets never stored a side.
 */
export function exerciseProgressTargetFromLogger(input: {
  catalogExerciseId?: string | null;
  exerciseName?: string | null;
  equipment?: string | null;
  pendingEquipment?: string | null;
  laterality?: string | null;
}): ExerciseProgressIdentity {
  const equipment = loggerSelectedEquipment(input.equipment, input.pendingEquipment);
  const variant = comparableVariantKey(input.laterality);
  return {
    catalogExerciseId: input.catalogExerciseId || null,
    exerciseName: String(input.exerciseName || 'Exercise').trim() || 'Exercise',
    equipment: equipment || null,
    variant: variant || null,
  };
}

export function sameExercise(fact: ProgressSetFact, target: ExerciseProgressIdentity): boolean {
  const catalog = String(target.catalogExerciseId || '').trim();
  if (catalog && fact.identity.catalogExerciseId) return fact.identity.catalogExerciseId === catalog;
  return fact.identity.exerciseName.trim().toLowerCase() === String(target.exerciseName || '').trim().toLowerCase();
}

export function factsForEquipment(facts: ProgressSetFact[], equipment?: string | null, variant?: string | null): ProgressSetFact[] {
  const wanted = equipmentSeriesKey(equipment, variant);
  return facts.filter((fact) => equipmentSeriesKey(fact.identity.equipmentLabel === 'Unspecified' ? '' : fact.identity.equipmentLabel, fact.identity.variant) === wanted);
}

export function equipmentChoices(facts: ProgressSetFact[]): SeriesIdentity[] {
  const byKey = new Map<string, SeriesIdentity>();
  facts.forEach((fact) => {
    const variant = comparableVariantKey(fact.identity.variant) || null;
    const key = equipmentSeriesKey(fact.identity.equipmentLabel, variant);
    if (!byKey.has(key)) byKey.set(key, { ...fact.identity, variant });
  });
  return Array.from(byKey.values()).sort((a, b) => a.equipmentLabel.localeCompare(b.equipmentLabel) || String(a.variant || '').localeCompare(String(b.variant || '')));
}

export function bestLoad(facts: ProgressSetFact[]): PerformanceMark | null {
  const rows = facts.filter((fact) => isCountedWorkingSet(fact) && fact.weight != null && fact.weight > 0);
  const best = [...rows].sort((a, b) => (b.weight || 0) - (a.weight || 0) || (b.reps || 0) - (a.reps || 0) || b.logDate.localeCompare(a.logDate))[0];
  return best ? markOf(best) : null;
}

export function bestEstimated1Rm(facts: ProgressSetFact[]): PerformanceMark | null {
  const ranked = facts
    .filter((fact) => isCountedWorkingSet(fact))
    .map((fact) => ({ fact, e1rm: e1rmOf(fact) }))
    .filter((item) => item.e1rm != null)
    .sort((a, b) => (b.e1rm || 0) - (a.e1rm || 0) || b.fact.logDate.localeCompare(a.fact.logDate));
  return ranked[0] ? markOf(ranked[0].fact) : null;
}

export function exerciseSessions(facts: ProgressSetFact[]): RecentExerciseSession[] {
  const byDate = new Map<string, ProgressSetFact[]>();
  facts.forEach((fact) => {
    if (!fact.logDate) return;
    const list = byDate.get(fact.logDate) || [];
    list.push(fact);
    byDate.set(fact.logDate, list);
  });
  return Array.from(byDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, rows]) => {
      const working = rows.filter((fact) => isCountedWorkingSet(fact));
      const best = bestEstimated1Rm(working) || bestLoad(working);
      return {
        date,
        best,
        workingSets: working.length,
        sets: rows
          .slice()
          .sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0) || a.id.localeCompare(b.id))
          .map((fact) => ({
            id: fact.id,
            setType: fact.setType,
            setNumber: fact.setNumber,
            weight: fact.weight,
            reps: fact.reps,
            notes: fact.notes || '',
            equipmentLabel: fact.identity.equipmentLabel,
            verified: fact.provenance.equipment === 'snapshotted',
          })),
      };
    });
}

export function buildExerciseProgress(input: {
  facts: ProgressSetFact[];
  target: ExerciseProgressIdentity;
  range: ExerciseChartRange | ProgressRange;
  today: string;
  metric?: SeriesChartMetric;
}): ExerciseProgressModel {
  const exerciseFacts = input.facts.filter((fact) => sameExercise(fact, input.target));
  const options = equipmentChoices(exerciseFacts);
  const selected = seriesIdentityFromParts({
    catalogExerciseId: input.target.catalogExerciseId,
    exerciseName: input.target.exerciseName,
    equipment: input.target.equipment,
    variant: comparableVariantKey(input.target.variant) || null,
  });
  const seriesFacts = factsForEquipment(exerciseFacts, selected.equipmentLabel === 'Unspecified' ? '' : selected.equipmentLabel, selected.variant);
  const earliest = seriesFacts.map((fact) => fact.logDate).sort()[0] || input.today;
  const range = normalizeRange(input.range);
  const view = rangeBounds(range, input.today, earliest);
  const windows = comparableWindows(view);
  const summary = buildSeriesWindows(seriesFacts, view, windows.baseline, windows.current, mondayOfWeek)[0];
  const periodFacts = seriesFacts.filter((fact) => inSpan(fact.logDate, view));
  const record = equipmentRecordOf(seriesFacts.map((fact) => fact.provenance.equipment));
  const sessions = exerciseSessions(seriesFacts);
  return {
    identity: seriesFacts[0]?.identity || selected,
    equipmentOptions: options.length ? options : [selected],
    record,
    recordLabel: equipmentRecordLabel(record),
    changePercent: summary?.percentChange ?? null,
    changeLoad: summary?.baselineE1rm != null && summary.currentE1rm != null ? summary.currentE1rm - summary.baselineE1rm : null,
    allTimeLoad: bestLoad(seriesFacts),
    allTimeE1rm: bestEstimated1Rm(seriesFacts),
    periodBest: bestEstimated1Rm(periodFacts) || bestLoad(periodFacts),
    chart: seriesChartPoints(periodFacts, input.metric || 'e1rm'),
    recent: sessions.slice(0, 4),
    allSessions: sessions,
  };
}

export function historyListLayout(width: number): 'stacked' | 'split' {
  return width >= 768 ? 'split' : 'stacked';
}

function normalizeRange(range: string): ProgressRange {
  if (range === '4W' || range === '3M' || range === '6M' || range === '1Y' || range === 'All') return range;
  return '4W';
}

function markOf(fact: ProgressSetFact): PerformanceMark {
  return {
    weight: fact.weight,
    reps: fact.reps,
    e1rm: e1rmOf(fact),
    date: fact.logDate,
  };
}

export function seriesIdentityKey(identity: SeriesIdentity): string {
  return seriesKey(identity);
}

export { percentChange };
