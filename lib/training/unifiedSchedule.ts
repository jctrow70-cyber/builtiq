import { cycleLengthOf } from '../programDesign/cycle';
import { addDaysYmd, dayLabelFromYmd, mondayOfWeek, programEndDate } from './programCalendar';

export type ScheduleSourceKind = 'personal' | 'group';

export type PlannedScheduleWorkout = {
  id: string;
  week: number;
  dayLabel: string;
  title?: string | null;
};

export type ProgramExpectationDate = {
  workoutId: string;
  scheduledDate: string;
  dayLabel: string;
  title: string;
};

export type ExpectationSessionStatus = 'completed' | 'partial' | 'skipped' | 'in_progress' | 'not_started' | null;

export type ExpectationFact = {
  id?: string;
  workoutId?: string | null;
  scheduledDate: string;
  excused?: boolean;
  sessionStatus?: ExpectationSessionStatus;
  recipientStatus?: string | null;
  sourceKey?: string;
  teamId?: string | null;
  origin?: 'program' | 'assignment';
};

export type AdherenceCounts = {
  expected_past: number;
  completed_past: number;
  partial_past: number;
  skipped_past: number;
  missed: number;
  due_today: number;
  completed_today: number;
  future: number;
  completion_rate: number | null;
};

export type ExpectationDisplayState = 'Completed' | 'Partial' | 'Skipped' | 'Missed' | 'Today' | 'Upcoming' | 'Excused';

function daysFrom(anchor: string, date: string): number {
  const [ay, am, ad] = anchor.split('-').map(Number);
  const [by, bm, bd] = date.split('-').map(Number);
  const a = Date.UTC(ay, (am || 1) - 1, ad || 1);
  const b = Date.UTC(by, (bm || 1) - 1, bd || 1);
  return Math.floor((b - a) / 86400000);
}

/** Week index inside the cycle. Dates before week 1 and after the final week are outside the schedule. */
export function scheduleWeekNumber(anchorMonday: string, date: string, totalWeeks: number): number | null {
  const diff = daysFrom(anchorMonday, date);
  if (diff < 0) return null;
  const week = Math.floor(diff / 7) + 1;
  const max = Math.max(1, totalWeeks);
  if (week < 1 || week > max) return null;
  return week;
}

export function scheduleCycleWeeks(program: { weeks?: number | null; cycle_length_weeks?: number | null }): number {
  return cycleLengthOf(program);
}

export function scheduleAnchorMonday(input: {
  sourceKind: ScheduleSourceKind;
  startsOn?: string | null;
  programStart?: string | null;
  effectiveOn: string;
}): string {
  const clock =
    input.sourceKind === 'personal'
      ? input.startsOn || input.programStart || input.effectiveOn
      : input.programStart || input.startsOn || input.effectiveOn;
  return mondayOfWeek(clock);
}

/**
 * Remaining program dates from the effective local date through the final Sunday.
 * Does not clamp later dates onto the last program week.
 */
export function buildProgramExpectationDates(input: {
  sourceKind: ScheduleSourceKind;
  startsOn?: string | null;
  programStart?: string | null;
  cycleWeeks: number;
  workouts: PlannedScheduleWorkout[];
  effectiveOn: string;
}): ProgramExpectationDate[] {
  const weeks = Math.max(1, Math.min(52, Math.floor(input.cycleWeeks || 1)));
  const anchor = scheduleAnchorMonday(input);
  const end = programEndDate(anchor, weeks);
  const from = input.effectiveOn > (input.startsOn || input.effectiveOn) ? input.effectiveOn : input.startsOn || input.effectiveOn;
  if (from > end) return [];
  const rows: ProgramExpectationDate[] = [];
  let date = from;
  while (date <= end) {
    const week = scheduleWeekNumber(anchor, date, weeks);
    if (week != null) {
      const dayLabel = dayLabelFromYmd(date);
      for (const workout of input.workouts) {
        if (Number(workout.week) === week && workout.dayLabel === dayLabel) {
          rows.push({
            workoutId: workout.id,
            scheduledDate: date,
            dayLabel,
            title: workout.title || workout.dayLabel || 'Workout',
          });
        }
      }
    }
    date = addDaysYmd(date, 1);
  }
  return rows;
}

export function sourceLabel(sourceKey: string, teamName?: string | null): string {
  if (sourceKey === 'personal') return 'Personal';
  return teamName || 'Group';
}

export function sessionFulfillsExpectation(
  session: { expectationId?: string | null; workoutId?: string | null; logDate?: string | null },
  expectation: { id?: string | null; workoutId?: string | null; scheduledDate: string }
): boolean {
  if (session.expectationId && expectation.id && session.expectationId === expectation.id) return true;
  return !!session.workoutId && session.workoutId === expectation.workoutId && session.logDate === expectation.scheduledDate;
}

export function expectationDisplayState(input: {
  scheduledDate: string;
  localToday: string;
  excused?: boolean;
  sessionStatus?: ExpectationSessionStatus;
}): ExpectationDisplayState {
  if (input.excused) return 'Excused';
  if (input.sessionStatus === 'completed') return 'Completed';
  if (input.sessionStatus === 'partial') return 'Partial';
  if (input.sessionStatus === 'skipped') return 'Skipped';
  if (input.scheduledDate < input.localToday) return 'Missed';
  if (input.scheduledDate === input.localToday) return 'Today';
  return 'Upcoming';
}

function skippedPast(row: ExpectationFact): boolean {
  return row.sessionStatus === 'skipped' || (row.sessionStatus == null && row.recipientStatus === 'skipped');
}

function emptyCounts(): AdherenceCounts {
  return {
    expected_past: 0,
    completed_past: 0,
    partial_past: 0,
    skipped_past: 0,
    missed: 0,
    due_today: 0,
    completed_today: 0,
    future: 0,
    completion_rate: null,
  };
}

/** Historical completion is completed past workouts divided by non-excused past workouts. Today is not in that ratio. */
export function adherenceCounts(rows: ExpectationFact[], localToday: string): AdherenceCounts {
  const counts = emptyCounts();
  for (const row of rows) {
    if (row.excused) continue;
    if (row.scheduledDate < localToday) {
      counts.expected_past += 1;
      if (row.sessionStatus === 'completed') counts.completed_past += 1;
      else if (row.sessionStatus === 'partial') counts.partial_past += 1;
      else if (skippedPast(row)) counts.skipped_past += 1;
      else counts.missed += 1;
    } else if (row.scheduledDate === localToday) {
      if (row.sessionStatus === 'completed') counts.completed_today += 1;
      else counts.due_today += 1;
    } else if (row.scheduledDate > localToday) {
      counts.future += 1;
    }
  }
  counts.completion_rate =
    counts.expected_past === 0 ? null : Math.round((counts.completed_past / counts.expected_past) * 1000) / 10;
  return counts;
}

export function countsForGroup(rows: ExpectationFact[], teamId: string, localToday: string): AdherenceCounts {
  const sourceKey = `group:${teamId}`;
  return adherenceCounts(
    rows.filter((row) => row.sourceKey === sourceKey || (row.origin === 'assignment' && row.teamId === teamId)),
    localToday
  );
}

export function pastRowsStay<T extends { scheduledDate: string }>(rows: T[], effectiveOn: string): T[] {
  return rows.filter((row) => row.scheduledDate < effectiveOn);
}

export function todayFollowsEdit(hasSession: boolean): boolean {
  return !hasSession;
}
