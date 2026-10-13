import { addDaysYmd, dayLabelFromYmd, programEndDate } from '../training/programCalendar';
import { scheduleAnchorMonday, scheduleCycleWeeks, scheduleWeekNumber } from '../training/unifiedSchedule';
import {
  customScheduleStructureError,
  formatScheduledDays,
  normalizeProgramDayLabel,
  orderedWeekSessions,
  type GroupTrainingWorkoutRef,
} from './trainingWorkspace';

export type ScheduleMode = 'program_days' | 'custom_weekdays';

export type MemberScheduleProfile = {
  mode: ScheduleMode;
  weekdays: string[];
  cycleAnchor: string | null;
};

export type ScheduledWorkoutDate = {
  workoutId: string;
  scheduledDate: string;
  dayLabel: string;
  title: string;
  week: number;
};

export type ScheduleProgram = {
  id?: string;
  startDate?: string | null;
  weeks?: number | null;
  cycleLengthWeeks?: number | null;
  workouts?: GroupTrainingWorkoutRef[];
};

const WEEKDAY_SET = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

export function normalizeWeekdays(weekdays: string[] | null | undefined): string[] {
  return (weekdays || []).map((day) => normalizeProgramDayLabel(day)).filter((day) => WEEKDAY_SET.has(day));
}

export function sessionCountForProgram(workouts: GroupTrainingWorkoutRef[] | null | undefined): number {
  const rows = workouts || [];
  const week = rows.map((workout) => Number(workout.week)).find((value) => orderedWeekSessions(rows, value).length > 0);
  if (!week) return 0;
  return orderedWeekSessions(rows, week).length;
}

/** Rejects a custom weekday list that would omit, duplicate, or reorder workouts unclearly. */
export function customWeekdayError(workouts: GroupTrainingWorkoutRef[] | null | undefined, weekdays: string[]): string | null {
  const structure = customScheduleStructureError(workouts);
  if (structure) return structure;
  const normalized = normalizeWeekdays(weekdays);
  if (normalized.length !== (weekdays || []).length) return 'Choose a weekday for each workout.';
  if (new Set(normalized).size !== normalized.length) return 'Choose each training day once.';
  const expected = sessionCountForProgram(workouts);
  if (normalized.length !== expected) {
    return `This program has ${expected} workouts each week. Select ${expected} training days.`;
  }
  return null;
}

export function programCycleAnchor(program: ScheduleProgram, startsOn: string): string {
  return scheduleAnchorMonday({
    sourceKind: 'group',
    programStart: program.startDate,
    startsOn,
    effectiveOn: startsOn,
  });
}

/**
 * Places one member's sessions.
 * program_days matches the shared program's day labels and week anchor.
 * custom_weekdays maps session order onto the member's weekdays inside that same program week.
 */
export function materializeMemberSchedule(input: {
  mode: ScheduleMode;
  weekdays?: string[] | null;
  program: ScheduleProgram;
  startsOn: string;
  effectiveOn: string;
  until?: string | null;
  cycleAnchor?: string | null;
  skipDate?: string | null;
}): ScheduledWorkoutDate[] {
  const workouts = input.program.workouts || [];
  const weeks = scheduleCycleWeeks({ weeks: input.program.weeks, cycle_length_weeks: input.program.cycleLengthWeeks });
  const anchor =
    input.mode === 'custom_weekdays'
      ? input.cycleAnchor || programCycleAnchor(input.program, input.startsOn)
      : scheduleAnchorMonday({
          sourceKind: 'group',
          programStart: input.program.startDate,
          startsOn: input.startsOn,
          effectiveOn: input.effectiveOn,
        });
  const end = input.until && input.until < programEndDate(anchor, weeks) ? input.until : programEndDate(anchor, weeks);
  const from = input.effectiveOn > input.startsOn ? input.effectiveOn : input.startsOn;
  if (from > end) return [];
  const custom = input.mode === 'custom_weekdays' ? normalizeWeekdays(input.weekdays) : [];
  const rows: ScheduledWorkoutDate[] = [];
  let date = from;
  while (date <= end) {
    if (input.skipDate && date === input.skipDate) {
      date = addDaysYmd(date, 1);
      continue;
    }
    const week = scheduleWeekNumber(anchor, date, weeks);
    if (week != null) {
      const dayLabel = dayLabelFromYmd(date);
      if (input.mode === 'custom_weekdays') {
        const index = custom.indexOf(dayLabel);
        const session = index >= 0 ? orderedWeekSessions(workouts, week)[index] : null;
        if (session?.id) {
          rows.push({
            workoutId: session.id,
            scheduledDate: date,
            dayLabel,
            title: session.title || normalizeProgramDayLabel(session.dayLabel) || 'Workout',
            week,
          });
        }
      } else {
        for (const session of orderedWeekSessions(workouts, week)) {
          if (!session.id || normalizeProgramDayLabel(session.dayLabel) !== dayLabel) continue;
          rows.push({
            workoutId: session.id,
            scheduledDate: date,
            dayLabel,
            title: session.title || dayLabel,
            week,
          });
        }
      }
    }
    date = addDaysYmd(date, 1);
  }
  return rows;
}

export function formatSchedulePreview(rows: ScheduledWorkoutDate[], limit = 4): string[] {
  return rows.slice(0, limit).map((row) => `${row.dayLabel} ${row.scheduledDate} — ${row.title}`);
}

export function scheduleDayLabel(mode: ScheduleMode, weekdays: string[] | null | undefined, programDays: string[]): string {
  if (mode === 'custom_weekdays') return formatScheduledDays(normalizeWeekdays(weekdays));
  return formatScheduledDays(programDays);
}

export type ExpectationRow = {
  userId: string;
  sourceKey: string;
  programId: string | null;
  workoutId: string | null;
  scheduledDate: string;
  dayLabel: string;
  origin: 'program' | 'assignment';
  hasSession: boolean;
};

/**
 * Mirrors schedule refresh for one enrollment.
 * Past rows stay. A date with a logged session stays. A stale custom profile leaves future rows untouched.
 */
export function refreshScheduledExpectations(input: {
  rows: ExpectationRow[];
  userId: string;
  sourceKey: string;
  mode: ScheduleMode;
  weekdays: string[];
  program: ScheduleProgram;
  startsOn: string;
  effectiveOn: string;
  cycleAnchor?: string | null;
  todayFrozen: boolean;
  staleCustom: boolean;
}): ExpectationRow[] {
  const mine = (row: ExpectationRow) => row.userId === input.userId && row.sourceKey === input.sourceKey;
  const kept = input.rows.filter((row) => {
    if (!mine(row)) return true;
    if (row.origin !== 'program') return true;
    if (row.scheduledDate < input.effectiveOn) return true;
    if (row.hasSession) return true;
    if (input.staleCustom && input.mode === 'custom_weekdays') return true;
    if (input.todayFrozen && row.scheduledDate === input.effectiveOn) return true;
    return false;
  });
  if (input.staleCustom && input.mode === 'custom_weekdays') return kept;
  const generated = materializeMemberSchedule({
    mode: input.mode,
    weekdays: input.weekdays,
    program: input.program,
    startsOn: input.startsOn,
    effectiveOn: input.effectiveOn,
    cycleAnchor: input.cycleAnchor,
    skipDate: input.todayFrozen ? input.effectiveOn : null,
  });
  const additions: ExpectationRow[] = generated
    .filter((row) => !kept.some((existing) => mine(existing) && existing.workoutId === row.workoutId && existing.scheduledDate === row.scheduledDate))
    .map((row) => ({
      userId: input.userId,
      sourceKey: input.sourceKey,
      programId: input.program.id || null,
      workoutId: row.workoutId,
      scheduledDate: row.scheduledDate,
      dayLabel: row.dayLabel,
      origin: 'program' as const,
      hasSession: false,
    }));
  return kept.concat(additions);
}
