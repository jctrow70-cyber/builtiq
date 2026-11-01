import {
  BODY_MEASUREMENT_DEFINITIONS,
  formatBodyMetric,
  readBodyMeasurement,
  type BodyMeasurementKey,
  type BodyMeasurementRow,
  type UnitsPreference,
} from '../body/measurements';
import { formatDisplayDate, mondayOfWeek } from '../training/programCalendar';
import { comparableWindows, rangeBounds } from './ranges';
import { isCountedWorkingSet, type ProgressSetFact } from './setFacts';
import { buildSeriesWindows, seriesPersonalRecords } from './strengthSeries';
import { buildStrengthIndex } from './strengthIndex';
import { formatLoad, headlineRecords, rangePeriodLabel, signedPercent } from './progressView';
import { bodyTrends } from './bodyTrends';

export type DashboardBodyLine = {
  key: BodyMeasurementKey;
  label: string;
  valueText: string;
  dateText: string;
  changeText: string | null;
  note: string | null;
};

export type DashboardAchievement = {
  key: string;
  label: string;
  detailText: string;
  dateText: string;
};

export type DashboardProgressModel = {
  periodLabel: string;
  empty: boolean;
  emptyCopy: string | null;
  strengthLabel: string | null;
  strengthValue: string | null;
  strengthContext: string | null;
  strengthEmpty: string | null;
  bodyLines: DashboardBodyLine[];
  bodyEmpty: string | null;
  achievements: DashboardAchievement[];
};

const ONE_CHECK_IN = 'One check-in this period.';
const OLDER_CHECK_IN = 'No new check-in in the last 4 weeks.';
const STRENGTH_EMPTY = 'Not enough strength history yet.';
const BODY_EMPTY = 'No body check-ins yet.';
const CARD_EMPTY = 'Your progress will show up after a workout or a body check-in.';

export function dashboardProgressModel(input: {
  today: string;
  units: UnitsPreference;
  facts: ProgressSetFact[];
  measurements: BodyMeasurementRow[];
}): DashboardProgressModel {
  const view = rangeBounds('4W', input.today);
  const windows = comparableWindows(view);
  const series = buildSeriesWindows(input.facts, view, windows.baseline, windows.current, mondayOfWeek);
  const index = buildStrengthIndex(series);
  const viewFacts = input.facts.filter((fact) => fact.logDate >= view.from && fact.logDate <= view.to);
  const achievements = headlineRecords(seriesPersonalRecords(viewFacts))
    .slice(0, 2)
    .map((record) => ({
      key: record.key,
      label: record.label,
      detailText: achievementDetail(record.weight, record.reps, record.e1rm, input.units),
      dateText: formatDisplayDate(record.date),
    }));
  const bodyLines = bodyLinesFor(input.measurements, view, input.units);
  const strengthValue = index.percentChange == null ? null : signedPercent(index.percentChange);
  const hasWork = viewFacts.some(isCountedWorkingSet);
  const empty = bodyLines.length === 0 && strengthValue == null && achievements.length === 0 && !hasWork;

  return {
    periodLabel: rangePeriodLabel('4W'),
    empty,
    emptyCopy: empty ? CARD_EMPTY : null,
    strengthLabel: strengthValue == null ? null : index.label === 'overall' ? 'Overall Strength' : 'Strength Trend',
    strengthValue,
    strengthContext: strengthValue == null ? null : index.coverageLine,
    strengthEmpty: empty || strengthValue != null ? null : STRENGTH_EMPTY,
    bodyLines,
    bodyEmpty: empty || bodyLines.length > 0 ? null : BODY_EMPTY,
    achievements,
  };
}

function bodyLinesFor(
  rows: BodyMeasurementRow[],
  view: { from: string; to: string },
  units: UnitsPreference
): DashboardBodyLine[] {
  const trends = bodyTrends(rows, view);
  const weight = lineFor('weight', rows, trends, view, units);
  const waist = lineFor('waist', rows, trends, view, units);
  if (weight || waist) return [weight, waist].filter((line): line is DashboardBodyLine => !!line);
  const fallback = fallbackKey(rows);
  const extra = fallback ? lineFor(fallback, rows, trends, view, units) : null;
  return extra ? [extra] : [];
}

function lineFor(
  key: BodyMeasurementKey,
  rows: BodyMeasurementRow[],
  trends: ReturnType<typeof bodyTrends>,
  view: { from: string; to: string },
  units: UnitsPreference
): DashboardBodyLine | null {
  const definition = BODY_MEASUREMENT_DEFINITIONS.find((item) => item.key === key);
  if (!definition) return null;
  const trend = trends.find((item) => item.key === key);
  if (trend && trend.samples >= 2 && trend.last != null) {
    const last = trend.raw[trend.raw.length - 1];
    return {
      key,
      label: definition.label,
      valueText: formatBodyMetric(trend.last, definition.kind, units),
      dateText: formatDisplayDate(last?.date || ''),
      changeText: formatChange(trend.delta, definition.kind, units),
      note: null,
    };
  }
  if (trend && trend.samples === 1 && trend.last != null) {
    return {
      key,
      label: definition.label,
      valueText: formatBodyMetric(trend.last, definition.kind, units),
      dateText: formatDisplayDate(trend.raw[0]?.date || ''),
      changeText: null,
      note: ONE_CHECK_IN,
    };
  }
  const older = latestBefore(rows, key, view.from);
  if (!older) return null;
  return {
    key,
    label: definition.label,
    valueText: formatBodyMetric(older.value, definition.kind, units),
    dateText: formatDisplayDate(older.date),
    changeText: null,
    note: OLDER_CHECK_IN,
  };
}

function fallbackKey(rows: BodyMeasurementRow[]): BodyMeasurementKey | null {
  let best: { key: BodyMeasurementKey; date: string } | null = null;
  BODY_MEASUREMENT_DEFINITIONS.forEach((definition) => {
    if (definition.key === 'weight' || definition.key === 'waist') return;
    rows.forEach((row) => {
      if (readBodyMeasurement(row, definition.key) == null) return;
      if (!best || row.measured_on > best.date) best = { key: definition.key, date: row.measured_on };
    });
  });
  return best?.key ?? null;
}

function latestBefore(rows: BodyMeasurementRow[], key: BodyMeasurementKey, viewFrom: string): { date: string; value: number } | null {
  let best: { date: string; value: number } | null = null;
  rows.forEach((row) => {
    if (row.measured_on >= viewFrom) return;
    const value = readBodyMeasurement(row, key);
    if (value == null) return;
    if (!best || row.measured_on > best.date) best = { date: row.measured_on, value };
  });
  return best;
}

function formatChange(delta: number | null, kind: 'weight' | 'length' | 'percent', units: UnitsPreference): string | null {
  if (delta == null) return null;
  if (delta === 0) return formatBodyMetric(0, kind, units);
  const arrow = delta > 0 ? '↑' : '↓';
  return `${arrow} ${formatBodyMetric(Math.abs(delta), kind, units)}`;
}

function achievementDetail(weight: number | null, reps: number | null, e1rm: number | null, units: UnitsPreference): string {
  const unit = units === 'metric' ? 'kg' : 'lb';
  const load = formatLoad(weight, unit);
  const performance = load && reps != null ? `${load} × ${reps}` : load || (reps != null ? `${reps} reps` : 'Logged set');
  const estimated = e1rm == null ? null : formatLoad(e1rm, unit);
  return estimated ? `${performance} · e1RM ${estimated}` : performance;
}
