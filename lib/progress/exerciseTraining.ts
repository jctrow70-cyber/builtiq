import { addDaysYmd, mondayOfWeek } from '../training/programCalendar';
import { inclusiveDays, inSpan, type DateSpan } from './ranges';
import { e1rmOf, isCountedWorkingSet, type ProgressSetFact } from './setFacts';

/**
 * Weekly training summary for one exercise series.
 *
 * Calendar weeks are Monday–Sunday. Weeks before the first completed working
 * set in the selected period are omitted. Empty weeks after that set stay in
 * the breakdown as "none recorded."
 *
 * The weekly average divides completed working sets by observed days / 7.
 * Observed days start on the first completed working set in the period and
 * end on the period's last day, so days before that set are not in the
 * denominator and an unfinished current week is not treated as seven days.
 * Fewer than seven observed days has no weekly average.
 */
export const WEEKLY_AVERAGE_MIN_DAYS = 7;

export type WeekPartial = 'first' | 'current' | 'first_and_current';

export type ExerciseWeekBucket = {
  weekStart: string;
  weekEnd: string;
  workingSets: number;
  trainingDays: number;
  bestE1rm: number | null;
  partial: WeekPartial | null;
};

export type ExerciseAverageNote = 'none' | 'too_short' | 'includes_open_week' | 'full_days';

export type ExerciseTrainingSummary = {
  workingSets: number;
  trainingDays: number;
  averageSetsPerWeek: number | null;
  averageNote: ExerciseAverageNote;
  observedFrom: string | null;
  observedTo: string | null;
  observedDays: number;
  latestTrainingDay: string | null;
  weeks: ExerciseWeekBucket[];
};

export type ExerciseObservationId =
  | 'strength_and_sets_up'
  | 'strength_stable_days_down'
  | 'uneven_weeks'
  | 'insufficient_strength';

export type ExerciseObservation = {
  id: ExerciseObservationId;
  text: string;
};

const OBSERVATION_TEXT: Record<ExerciseObservationId, string> = {
  strength_and_sets_up: 'Estimated strength and working sets were both higher in the recent comparison window.',
  strength_stable_days_down: 'Estimated strength stayed about the same while recorded training days were lower in the recent window.',
  uneven_weeks: 'Working sets were recorded in fewer than half of the weeks since the first completed set in this period.',
  insufficient_strength: 'There is not enough comparable strength history to describe a change.',
};

export function exerciseTrainingSummary(input: {
  facts: ProgressSetFact[];
  view: DateSpan;
}): ExerciseTrainingSummary {
  const working = input.facts
    .filter((fact) => inSpan(fact.logDate, input.view) && isCountedWorkingSet(fact))
    .sort((a, b) => a.logDate.localeCompare(b.logDate) || a.id.localeCompare(b.id));
  if (!working.length) {
    return {
      workingSets: 0,
      trainingDays: 0,
      averageSetsPerWeek: null,
      averageNote: 'none',
      observedFrom: null,
      observedTo: null,
      observedDays: 0,
      latestTrainingDay: null,
      weeks: [],
    };
  }

  const observedFrom = working[0].logDate;
  const observedTo = input.view.to;
  const observedDays = inclusiveDays(observedFrom, observedTo);
  const dates = new Set(working.map((fact) => fact.logDate));
  const weeks = weekStartsBetween(observedFrom, observedTo).map((weekStart): ExerciseWeekBucket => {
    const weekEnd = addDaysYmd(weekStart, 6);
    const rows = working.filter((fact) => fact.logDate >= weekStart && fact.logDate <= weekEnd);
    const first = weekStart < observedFrom;
    const current = weekEnd > observedTo;
    const partial: WeekPartial | null = first && current ? 'first_and_current' : first ? 'first' : current ? 'current' : null;
    return {
      weekStart,
      weekEnd,
      workingSets: rows.length,
      trainingDays: new Set(rows.map((fact) => fact.logDate)).size,
      bestE1rm: bestE1rm(rows),
      partial,
    };
  });
  const openWeek = weeks.some((week) => week.partial === 'current' || week.partial === 'first_and_current');

  return {
    workingSets: working.length,
    trainingDays: dates.size,
    averageSetsPerWeek: averageSetsPerWeek(working.length, observedDays),
    averageNote: observedDays < WEEKLY_AVERAGE_MIN_DAYS ? 'too_short' : openWeek ? 'includes_open_week' : 'full_days',
    observedFrom,
    observedTo,
    observedDays,
    latestTrainingDay: working[working.length - 1].logDate,
    weeks,
  };
}

export function exerciseTrainingObservation(input: {
  facts: ProgressSetFact[];
  baseline: DateSpan;
  current: DateSpan;
  weeks: ExerciseWeekBucket[];
  today: string;
  changePercent: number | null;
  changeLoad: number | null;
  periodWorkingSets: number;
}): ExerciseObservation | null {
  if (input.periodWorkingSets <= 0) return null;

  const baseline = countedIn(input.facts, input.baseline);
  const current = countedIn(input.facts, input.current);
  const e1rmDates = new Set<string>();
  baseline.e1rmDates.forEach((date) => e1rmDates.add(date));
  current.e1rmDates.forEach((date) => e1rmDates.add(date));
  const comparableStrength = input.changePercent != null && e1rmDates.size >= 2;

  if (comparableStrength && (input.changePercent || 0) > 0 && current.sets > baseline.sets) {
    return observation('strength_and_sets_up');
  }
  if (comparableStrength && strengthIsStable(input.changePercent, input.changeLoad) && current.days < baseline.days) {
    return observation('strength_stable_days_down');
  }
  if (weeksAreUneven(input.weeks, input.today)) return observation('uneven_weeks');
  if (!comparableStrength) return observation('insufficient_strength');
  return null;
}

export function weeksAreUneven(weeks: ExerciseWeekBucket[], today: string): boolean {
  const counted = weeks.filter((week) => week.workingSets > 0 || week.weekEnd <= today);
  if (counted.length < 4) return false;
  const filled = counted.filter((week) => week.workingSets > 0).length;
  return filled * 2 < counted.length;
}

function observation(id: ExerciseObservationId): ExerciseObservation {
  return { id, text: OBSERVATION_TEXT[id] };
}

function strengthIsStable(percent: number | null, load: number | null): boolean {
  if (percent == null) return false;
  if (Math.abs(percent) < 1) return true;
  return load != null && Math.abs(load) < 0.5;
}

function averageSetsPerWeek(workingSets: number, observedDays: number): number | null {
  if (observedDays < WEEKLY_AVERAGE_MIN_DAYS) return null;
  return Math.round((workingSets / (observedDays / 7)) * 10) / 10;
}

function bestE1rm(rows: ProgressSetFact[]): number | null {
  let best: number | null = null;
  rows.forEach((fact) => {
    const estimate = e1rmOf(fact);
    if (estimate != null && (best == null || estimate > best)) best = estimate;
  });
  return best;
}

function countedIn(facts: ProgressSetFact[], span: DateSpan) {
  const rows = facts.filter((fact) => inSpan(fact.logDate, span) && isCountedWorkingSet(fact));
  const e1rmDates = new Set<string>();
  rows.forEach((fact) => {
    if (e1rmOf(fact) != null) e1rmDates.add(fact.logDate);
  });
  return {
    sets: rows.length,
    days: new Set(rows.map((fact) => fact.logDate)).size,
    e1rmDates,
  };
}

function weekStartsBetween(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const starts: string[] = [];
  let cursor = mondayOfWeek(from);
  const last = mondayOfWeek(to);
  while (cursor <= last && starts.length < 520) {
    starts.push(cursor);
    cursor = addDaysYmd(cursor, 7);
  }
  return starts;
}
