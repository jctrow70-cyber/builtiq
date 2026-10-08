import { formatBodyMetric, type UnitsPreference } from '../body/measurements';
import type { BodyMetricTrend } from './bodyTrends';
import { inclusiveDays, type ProgressRange } from './ranges';
import type { ProgressReport } from './report';
import { completedWorkouts, formatCount, formatSets, rangePeriodLabel, signedPercent, workingSetsInView } from './progressView';

export type ProgressDomain = 'training' | 'nutrition' | 'body' | 'strength';

export type ComparisonMetricId =
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'weight'
  | 'waist'
  | 'chest'
  | 'arm'
  | 'thigh'
  | 'hip'
  | 'neck'
  | 'body_fat'
  | 'strength'
  | 'training';

export type ComparisonMetric = {
  id: ComparisonMetricId;
  label: string;
  value: string;
  detail: string | null;
};

export type ProgressObservation = {
  id: string;
  text: string;
  claimsCausation: false;
};

export type ProgressComparison = {
  periodLabel: string;
  metrics: ComparisonMetric[];
  observations: ProgressObservation[];
  domains: ProgressDomain[];
};

export function progressComparison(report: ProgressReport, units: UnitsPreference): ProgressComparison {
  const metrics: ComparisonMetric[] = [];
  const nutrition = report.nutrition;
  if (nutrition.averages?.calories != null) {
    metrics.push({
      id: 'calories',
      label: 'Calories',
      value: `${formatCount(nutrition.averages.calories)} avg`,
      detail: targetDetail(nutrition.averages.calories, nutrition.targets?.calories ?? null, 'calories'),
    });
  }
  if (nutrition.averages?.protein != null) {
    metrics.push({
      id: 'protein',
      label: 'Protein',
      value: `${Math.round(nutrition.averages.protein)} g avg`,
      detail: targetDetail(nutrition.averages.protein, nutrition.targets?.protein ?? null, 'grams'),
    });
  }
  if (nutrition.averages?.carbs != null) {
    metrics.push({
      id: 'carbs',
      label: 'Carbohydrates',
      value: `${Math.round(nutrition.averages.carbs)} g avg`,
      detail: targetDetail(nutrition.averages.carbs, nutrition.targets?.carbs ?? null, 'grams'),
    });
  }
  if (nutrition.averages?.fat != null) {
    metrics.push({
      id: 'fat',
      label: 'Fat',
      value: `${Math.round(nutrition.averages.fat)} g avg`,
      detail: targetDetail(nutrition.averages.fat, nutrition.targets?.fat ?? null, 'grams'),
    });
  }

  report.body.forEach((metric) => {
    const kind = metric.key === 'weight' ? 'weight' : metric.key === 'body_fat' ? 'percent' : 'length';
    const shown = metric.key === 'weight' && metric.rollingAverage != null ? metric.rollingAverage : metric.last;
    if (shown == null) return;
    metrics.push({
      id: metric.key,
      label: metric.label,
      value: formatBodyMetric(shown, kind, units),
      detail: metric.delta == null ? null : bodyChange(metric, units),
    });
  });

  if (report.strengthIndex.percentChange != null && signedPercent(report.strengthIndex.percentChange)) {
    metrics.push({
      id: 'strength',
      label: 'Strength',
      value: signedPercent(report.strengthIndex.percentChange) || '',
      detail: report.strengthIndex.coverageLine,
    });
  }

  const workouts = workoutCount(report);
  const frequency = workoutsPerWeek(report, workouts);
  if (workouts != null) {
    metrics.push({
      id: 'training',
      label: 'Training',
      value: frequency != null ? `${formatOne(frequency)} workouts/week` : `${workouts} workout${workouts === 1 ? '' : 's'}`,
      detail: workingSetsInView(report) > 0 ? `${workingSetsInView(report)} working sets` : null,
    });
  }

  return {
    periodLabel: rangePeriodLabel(report.range),
    metrics,
    observations: observations(report, units, frequency),
    domains: domains(report, workouts),
  };
}

export function metricsFor(comparison: ProgressComparison, ids: ComparisonMetricId[]): ComparisonMetric[] {
  return ids
    .map((id) => comparison.metrics.find((metric) => metric.id === id))
    .filter((metric): metric is ComparisonMetric => !!metric);
}

export function comparisonGap(comparison: ProgressComparison, focus: 'nutrition' | 'body'): string | null {
  const hasNutrition = comparison.domains.includes('nutrition');
  const hasBody = comparison.domains.includes('body');
  const hasTraining = comparison.domains.includes('training') || comparison.domains.includes('strength');
  if (focus === 'nutrition') {
    if (!hasNutrition && hasTraining) return 'Log nutrition for several days to compare it with your training trends.';
    if (hasNutrition && !hasTraining && !hasBody) return 'Log workouts or add a body check-in to line those changes up with nutrition.';
    if (!hasNutrition && !hasTraining && !hasBody) return 'Log meals, workouts, or body check-ins to see how they line up.';
    return null;
  }
  if (!hasBody && hasTraining) return 'Add weight, waist, or another measurement to compare body changes with training.';
  if (hasBody && !hasTraining) return 'Log strength workouts to compare body changes with performance.';
  if (!hasBody && !hasTraining) return 'Add a body check-in and log workouts to see how they move together.';
  return null;
}

export function workoutCount(report: ProgressReport): number | null {
  const scheduled = completedWorkouts(report);
  if (scheduled != null) return scheduled;
  return report.loggedTrainingDays > 0 ? report.loggedTrainingDays : null;
}

export function workoutsPerWeek(report: ProgressReport, workouts = workoutCount(report)): number | null {
  if (workouts == null) return null;
  const days = inclusiveDays(report.view.from, report.view.to);
  if (days < 7) return null;
  return Math.round((workouts / (days / 7)) * 10) / 10;
}

/** Trailing display trend from check-ins already on the report. Null until three samples exist. */
export function rollingDisplay(raw: { date: string; value: number }[]): { date: string; value: number }[] {
  if (raw.length < 3) return [];
  return raw.slice(2).map((point, index) => {
    const end = index + 3;
    const window = raw.slice(Math.max(0, end - 4), end);
    const value = window.reduce((sum, item) => sum + item.value, 0) / window.length;
    return { date: point.date, value: Math.round(value * 10) / 10 };
  });
}

function observations(report: ProgressReport, units: UnitsPreference, frequency: number | null): ProgressObservation[] {
  const notes: ProgressObservation[] = [];
  const strength = report.strengthIndex.percentChange;
  const weight = report.body.find((metric) => metric.key === 'weight');
  const waist = report.body.find((metric) => metric.key === 'waist');
  const protein = report.nutrition.averages?.protein;

  if (strength != null && weight?.delta != null) {
    notes.push({
      id: 'strength-weight',
      claimsCausation: false,
      text: `During this period, body weight ${bodyClause(weight, units)} while representative strength ${strengthClause(strength)}.`,
    });
  } else if (strength != null) {
    notes.push({
      id: 'strength',
      claimsCausation: false,
      text: `Representative strength ${strengthClause(strength)} over this period.`,
    });
  }

  if (weight?.delta != null && waist?.delta != null) {
    notes.push({
      id: 'weight-waist',
      claimsCausation: false,
      text: `Body weight ${bodyClause(weight, units)} while waist ${bodyClause(waist, units)}.`,
    });
  } else if (waist?.delta != null) {
    notes.push({
      id: 'waist',
      claimsCausation: false,
      text: `Waist ${bodyClause(waist, units)} during this period.`,
    });
  } else if (weight?.delta != null && strength == null) {
    notes.push({
      id: 'weight',
      claimsCausation: false,
      text: `Body weight ${bodyClause(weight, units)} during this period.`,
    });
  }

  if (protein != null && report.nutrition.loggedDays > 0) {
    notes.push({
      id: 'protein',
      claimsCausation: false,
      text: `Protein averaged ${Math.round(protein)} g of protein on logged nutrition days (${report.nutrition.loggedDays} of ${report.nutrition.daysInRange} days).`,
    });
  }

  if (frequency != null) {
    notes.push({
      id: 'frequency',
      claimsCausation: false,
      text: `Training frequency averaged ${formatOne(frequency)} workouts per week.`,
    });
  }

  return notes;
}

function domains(report: ProgressReport, workouts: number | null): ProgressDomain[] {
  const list: ProgressDomain[] = [];
  if (workouts != null || workingSetsInView(report) > 0) list.push('training');
  if (report.nutrition.averages) list.push('nutrition');
  if (report.body.length > 0) list.push('body');
  if (report.strengthIndex.percentChange != null) list.push('strength');
  return list;
}

function targetDetail(average: number, target: number | null, kind: 'calories' | 'grams'): string | null {
  if (target == null || !(target > 0)) return null;
  const percent = Math.round((average / target) * 1000) / 10;
  const gap = Math.round(average - target);
  if (kind === 'calories') {
    if (Math.abs(gap) < 1) return 'Matches your configured daily target';
    const direction = gap < 0 ? 'below' : 'above';
    return `${formatCount(Math.abs(gap))} calories ${direction} your configured daily target`;
  }
  return `${formatOne(percent)}% of target`;
}

function bodyClause(metric: BodyMetricTrend, units: UnitsPreference): string {
  const delta = metric.delta;
  if (delta == null) return 'was recorded';
  const kind = metric.key === 'weight' ? 'weight' : metric.key === 'body_fat' ? 'percent' : 'length';
  if (Math.abs(delta) < 0.05) return 'remained relatively stable';
  const amount = formatBodyMetric(Math.abs(delta), kind, units);
  if (Math.abs(delta) < 0.3 && kind !== 'percent') return 'remained relatively stable';
  return delta > 0 ? `increased ${amount}` : `decreased ${amount}`;
}

function bodyChange(metric: BodyMetricTrend, units: UnitsPreference): string | null {
  if (metric.delta == null || Math.abs(metric.delta) < 0.05) return 'Unchanged';
  const kind = metric.key === 'weight' ? 'weight' : metric.key === 'body_fat' ? 'percent' : 'length';
  const amount = formatBodyMetric(Math.abs(metric.delta), kind, units);
  return `${metric.delta > 0 ? '+' : '-'}${amount}`;
}

function strengthClause(percent: number): string {
  const signed = signedPercent(percent) || '0%';
  if (Math.abs(percent) < 1) return `changed ${signed}`;
  return percent > 0 ? `increased ${signed.replace('+', '')}` : `decreased ${signed.replace('-', '')}`;
}

function formatOne(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function overviewInsights(report: ProgressReport, units: UnitsPreference): { id: string; title: string; body: string }[] {
  const cards = progressComparison(report, units).observations.map((note) => ({
    id: note.id,
    title: insightTitle(note.id),
    body: note.text,
  }));
  const balance = balanceInsight(report);
  if (balance) {
    const at = cards.findIndex((card) => card.id === 'protein' || card.id === 'frequency');
    cards.splice(at === -1 ? cards.length : at, 0, balance);
  }
  return cards.slice(0, 4);
}

function balanceInsight(report: ProgressReport): { id: string; title: string; body: string } | null {
  const hamstrings = report.muscles.groups.find((group) => group.id === 'hamstrings');
  const quads = report.muscles.groups.find((group) => group.id === 'quads');
  if (
    !hamstrings ||
    !quads ||
    hamstrings.rolling4WeekEffective == null ||
    quads.rolling4WeekEffective == null ||
    hamstrings.weeks.length < 2 ||
    (hamstrings.rolling4WeekEffective <= 0 && quads.rolling4WeekEffective <= 0)
  ) {
    return null;
  }
  return {
    id: 'balance',
    title: 'Training balance',
    body: `Hamstring exposure averaged ${formatSets(hamstrings.rolling4WeekEffective)} effective sets per week compared with ${formatSets(quads.rolling4WeekEffective)} quad sets.`,
  };
}

function insightTitle(id: string): string {
  if (id === 'strength-weight') return 'Strength and body weight';
  if (id === 'strength') return 'Strength';
  if (id === 'weight-waist') return 'Body measurements';
  if (id === 'waist') return 'Waist';
  if (id === 'weight') return 'Body weight';
  if (id === 'protein') return 'Nutrition';
  if (id === 'frequency') return 'Training';
  return 'Progress';
}

export function periodLabelFor(range: ProgressRange): string {
  return rangePeriodLabel(range);
}
