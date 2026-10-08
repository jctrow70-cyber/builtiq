import { formatWaist, formatWeight, type UnitsPreference } from '../body/measurements';
import type { MuscleExposure } from './muscleVolume';
import type { ProgressReport } from './report';
import type { ProgressRange } from './ranges';
import type { SeriesPr } from './strengthSeries';

export type ProgressSection = 'overview' | 'strength' | 'training' | 'nutrition' | 'body';

export type OverviewRow = { label: string; value: string };

export type OverviewSummary = {
  title: string;
  detail: string | null;
  rows: OverviewRow[];
  baseline: boolean;
};

export type ProgressCardModel = {
  id: 'strength' | 'training' | 'nutrition' | 'body';
  value: string | null;
  label: string;
  lines: string[];
  emptyTitle: string;
  emptyBody: string;
};

export type HeadlineRecord = {
  key: string;
  label: string;
  weight: number | null;
  reps: number | null;
  e1rm: number | null;
  date: string;
};

export type MuscleMode = 'effective' | 'direct';

const RANGE_PERIOD: Record<ProgressRange, string> = {
  '7D': 'Last 7 days',
  '4W': 'Last 4 weeks',
  '3M': 'Last 3 months',
  '6M': 'Last 6 months',
  '1Y': 'Last year',
  All: 'All time',
};

export function rangePeriodLabel(range: ProgressRange): string {
  return RANGE_PERIOD[range];
}

export function formatSets(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toFixed(1);
  return String(rounded);
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function formatLoad(value: number | null, unit: string): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${unit}`;
}

export function signedPercent(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 0.05) return '0%';
  const digits = Number.isInteger(rounded) ? String(Math.abs(rounded)) : Math.abs(rounded).toFixed(1);
  return `${rounded > 0 ? '+' : '-'}${digits}%`;
}

export function overviewSummary(report: ProgressReport, units: UnitsPreference): OverviewSummary {
  const strength = report.strengthIndex.percentChange;
  const weight = report.body.find((metric) => metric.key === 'weight');
  const waist = report.body.find((metric) => metric.key === 'waist');
  const adherence = report.adherence?.counts.completion_rate ?? null;
  const hasTraining = report.muscles.groups.some((group) => group.effectiveSets > 0 || group.directSets > 0);
  const hasAnything = strength != null || hasTraining || !!report.nutrition.averages || report.body.length > 0 || adherence != null;

  if (!hasAnything) {
    return {
      baseline: true,
      title: 'Building your baseline',
      detail: 'Complete a few workouts and check-ins and BuildIQ will begin identifying your trends.',
      rows: [],
    };
  }

  const rows: OverviewRow[] = [];
  if (strength != null) {
    rows.push({ label: 'Strength', value: trendValue(strength, signedPercent(strength) || '0%', 1) });
  }
  if (weight?.delta != null) {
    rows.push({ label: 'Body weight', value: measurementTrend(weight.delta, units, 'weight') });
  }
  if (waist?.delta != null) {
    rows.push({ label: 'Waist', value: measurementTrend(waist.delta, units, 'length') });
  }
  if (adherence != null) {
    rows.push({ label: 'Training adherence', value: formatRate(adherence) });
  }

  let title = 'Your recent check-ins';
  if (strength != null && strength > 1) title = 'Trending positively';
  else if (strength != null && strength < -1) title = 'Strength is down over this period';
  else if (strength != null) title = 'Holding steady';

  return { baseline: false, title, detail: null, rows };
}

export function overviewCards(report: ProgressReport, units: UnitsPreference): ProgressCardModel[] {
  const index = report.strengthIndex;
  const strengthLines: string[] = [];
  if (index.coverageLine) strengthLines.push(index.coverageLine);
  const performances = new Set(report.personalRecords.map((record) => record.key)).size;
  if (performances > 0) {
    strengthLines.push(`${performances} best performance${performances === 1 ? '' : 's'} this period`);
  }

  const sets = workingSetsInView(report);
  const workouts = completedWorkouts(report) ?? (report.loggedTrainingDays > 0 ? report.loggedTrainingDays : null);
  const trainingLines: string[] = [];
  if (workouts != null && sets > 0) trainingLines.push(`${sets} working set${sets === 1 ? '' : 's'}`);
  if (workouts == null && sets > 0) trainingLines.push(rangePeriodLabel(report.range));
  const adherence = report.adherence?.counts.completion_rate ?? null;
  if (adherence != null) trainingLines.push(`${formatRate(adherence)} adherence`);

  const nutrition = report.nutrition;
  const nutritionLines: string[] = [];
  if (nutrition.averages?.protein != null) nutritionLines.push(`${Math.round(nutrition.averages.protein)} g protein`);
  if (nutrition.loggedDays > 0 && nutrition.daysInRange > 0) {
    nutritionLines.push(`${nutrition.loggedDays} of ${nutrition.daysInRange} days logged`);
  }

  const weight = report.body.find((metric) => metric.key === 'weight');
  const waist = report.body.find((metric) => metric.key === 'waist');
  const weightValue = weight ? weight.rollingAverage ?? weight.last : null;
  const bodyLines: string[] = [];
  if (weight?.delta != null) bodyLines.push(`Change ${measurementTrend(weight.delta, units, 'weight')}`);
  if (waist?.last != null) bodyLines.push(`Waist ${formatWaist(waist.last, units)}`);

  return [
    {
      id: 'strength',
      value: index.percentChange == null ? null : signedPercent(index.percentChange),
      label: index.label === 'overall' ? 'Overall Strength' : index.label === 'trend' ? 'Strength Trend' : 'Strength',
      lines: strengthLines,
      emptyTitle: 'Not enough strength history yet',
      emptyBody: 'Log comparable working sets and a trend can appear here.',
    },
    {
      id: 'training',
      value: workouts != null ? String(workouts) : sets > 0 ? String(sets) : null,
      label: workouts != null ? (workouts === 1 ? 'Workout' : 'Workouts') : 'Working sets',
      lines: trainingLines,
      emptyTitle: 'No training in this period',
      emptyBody: 'Completed workouts and working sets will show here.',
    },
    {
      id: 'nutrition',
      value: nutrition.averages?.calories != null ? `${Math.round(nutrition.averages.calories).toLocaleString('en-US')} kcal` : null,
      label: 'Daily average',
      lines: nutritionLines,
      emptyTitle: 'No meals logged in this period',
      emptyBody: 'Averages use logged days only.',
    },
    {
      id: 'body',
      value: weightValue != null ? formatWeight(weightValue, units) : null,
      label: weight?.rollingAverage != null ? 'Weight trend' : 'Latest weight',
      lines: bodyLines,
      emptyTitle: 'No body check-ins in this period',
      emptyBody: 'Add a measurement to see how your body is changing.',
    },
  ];
}

export function headlineRecords(records: SeriesPr[]): HeadlineRecord[] {
  const grouped = new Map<string, SeriesPr[]>();
  records.forEach((record) => {
    const list = grouped.get(record.key) || [];
    list.push(record);
    grouped.set(record.key, list);
  });
  return Array.from(grouped.values())
    .map((list) => {
      const load = list.find((record) => record.kind === 'load');
      const reps = list.find((record) => record.kind === 'reps_at_load');
      const estimated = list.find((record) => record.kind === 'e1rm');
      const primary = reps || load || estimated || list[0];
      return {
        key: primary.key,
        label: primary.label,
        weight: primary.weight,
        reps: primary.reps,
        e1rm: estimated?.e1rm ?? primary.e1rm,
        date: primary.date,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label));
}

export function muscleValue(group: MuscleExposure, mode: MuscleMode): number {
  return mode === 'direct' ? group.directSets : group.effectiveSets;
}

/** Average of the week buckets already on the report. This does not create a new volume formula. */
export function muscleWeekAverage(group: MuscleExposure, mode: MuscleMode): number | null {
  if (group.weeks.length < 2) return null;
  const recent = group.weeks.slice(-4);
  const total = recent.reduce((sum, week) => sum + (mode === 'direct' ? week.directSets : week.effectiveSets), 0);
  return Math.round((total / recent.length) * 100) / 100;
}

export function muscleWeekChange(group: MuscleExposure, mode: MuscleMode): string | null {
  if (group.weeks.length < 2) return null;
  const last = group.weeks[group.weeks.length - 1];
  const prev = group.weeks[group.weeks.length - 2];
  const current = mode === 'direct' ? last.directSets : last.effectiveSets;
  const previous = mode === 'direct' ? prev.directSets : prev.effectiveSets;
  const delta = current - previous;
  if (Math.abs(delta) < 0.05) return '→ unchanged';
  if (previous > 0) {
    const percent = Math.round((delta / previous) * 100);
    return `${delta > 0 ? '↑' : '↓'} ${Math.abs(percent)}%`;
  }
  const sets = Math.abs(Math.round(delta * 10) / 10);
  return `${delta > 0 ? '↑' : '↓'} ${sets} sets`;
}

export function weeklyExposure(groups: MuscleExposure[], mode: MuscleMode): { date: string; value: number }[] {
  const totals = new Map<string, number>();
  groups.forEach((group) => {
    group.weeks.forEach((week) => {
      const amount = mode === 'direct' ? week.directSets : week.effectiveSets;
      totals.set(week.weekStart, (totals.get(week.weekStart) || 0) + amount);
    });
  });
  return Array.from(totals.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));
}

export function completedWorkouts(report: ProgressReport): number | null {
  const counts = report.adherence?.counts;
  if (!counts) return null;
  const expected = counts.expected_past + counts.due_today;
  if (expected <= 0) return null;
  return counts.completed_past + counts.completed_today;
}

export function workingSetsInView(report: ProgressReport): number {
  return report.series.reduce((sum, series) => sum + series.workingSetsInView, 0);
}

function completedPhrase(delta: number, units: UnitsPreference, kind: 'weight' | 'length'): string {
  const formatted = kind === 'weight' ? formatWeight(Math.abs(delta), units) : formatWaist(Math.abs(delta), units);
  return formatted === '—' ? 'unchanged' : formatted;
}

function measurementTrend(delta: number, units: UnitsPreference, kind: 'weight' | 'length'): string {
  if (Math.abs(delta) < 0.3) return '→ unchanged';
  return `${delta > 0 ? '↑' : '↓'} ${completedPhrase(delta, units, kind)}`;
}

function trendValue(value: number, formatted: string, flatAt: number): string {
  const magnitude = formatted.replace(/^[+-]/, '');
  if (Math.abs(value) < flatAt) return `→ ${magnitude}`;
  return `${value > 0 ? '↑' : '↓'} ${magnitude}`;
}

function formatRate(rate: number): string {
  const rounded = Math.round(rate * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}
