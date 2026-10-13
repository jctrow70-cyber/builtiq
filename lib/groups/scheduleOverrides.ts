import { dayLabelFromYmd } from '../training/programCalendar';
import { adherenceCounts, type ExpectationFact } from '../training/unifiedSchedule';

export type ScheduleOverrideAction = 'move' | 'excuse';

export type ScheduleOverride = {
  userId: string;
  sourceKey: string;
  workoutId: string;
  originalDate: string;
  action: ScheduleOverrideAction;
  newDate: string | null;
};

export type RescheduleRow = {
  userId: string;
  sourceKey: string;
  programId: string | null;
  workoutId: string | null;
  scheduledDate: string;
  dayLabel: string;
  origin: 'program' | 'assignment';
  excused: boolean;
  hasSession: boolean;
};

/** Ordinary edits cannot move or excuse history, or a workout that already has a session. */
export function rescheduleBlockReason(input: {
  scheduledDate: string;
  today: string;
  hasSession: boolean;
  action: ScheduleOverrideAction;
}): string | null {
  if (input.scheduledDate < input.today) return 'Past workouts stay in history.';
  if (input.hasSession) return 'A logged workout stays on its date.';
  if (input.action === 'excuse' && input.scheduledDate < input.today) return 'Past missed workouts are not excused here.';
  return null;
}

function sameWorkout(row: RescheduleRow, override: ScheduleOverride): boolean {
  return row.userId === override.userId && row.sourceKey === override.sourceKey && row.origin === 'program' && row.workoutId === override.workoutId;
}

/**
 * Applies saved overrides after program expectations are generated.
 * A later refresh can rebuild the program dates and these overrides put the member's changes back.
 */
export function applyScheduleOverrides(rows: RescheduleRow[], overrides: ScheduleOverride[], today: string): RescheduleRow[] {
  const next = rows.map((row) => ({ ...row }));
  const moves = overrides.filter((override) => override.action === 'move' && override.newDate);
  for (const override of moves) {
    const original = next.find((row) => sameWorkout(row, override) && row.scheduledDate === override.originalDate);
    if (!original) continue;
    if (original.scheduledDate < today || original.hasSession) continue;
    const destinationTaken = next.some(
      (row) =>
        row !== original &&
        sameWorkout(row, override) &&
        row.scheduledDate === override.newDate
    );
    if (destinationTaken) {
      const index = next.indexOf(original);
      if (index >= 0) next.splice(index, 1);
      continue;
    }
    original.scheduledDate = override.newDate || original.scheduledDate;
    original.dayLabel = dayLabelFromYmd(original.scheduledDate);
  }
  for (const override of overrides.filter((row) => row.action === 'excuse')) {
    const moved = moves.find(
      (row) => row.userId === override.userId && row.sourceKey === override.sourceKey && row.workoutId === override.workoutId && row.originalDate === override.originalDate
    );
    const currentDate = moved?.newDate || override.originalDate;
    const target = next.find((row) => sameWorkout(row, override) && row.scheduledDate === currentDate);
    if (!target || target.scheduledDate < today || target.hasSession) continue;
    target.excused = true;
  }
  return next;
}

export function pauseFutureProgramExpectations(rows: RescheduleRow[], userId: string, sourceKey: string, effectiveOn: string): RescheduleRow[] {
  return rows.filter((row) => {
    if (row.userId !== userId || row.sourceKey !== sourceKey || row.origin !== 'program') return true;
    if (row.scheduledDate < effectiveOn) return true;
    if (row.scheduledDate === effectiveOn && row.hasSession) return true;
    return false;
  });
}

export function excusedLeavesDenominator(rows: ExpectationFact[], today: string): boolean {
  const counted = (rowsToCount: ExpectationFact[]) => {
    const counts = adherenceCounts(rowsToCount, today);
    return counts.expected_past + counts.due_today + counts.future;
  };
  return counted(rows) < counted(rows.map((row) => ({ ...row, excused: false })));
}

/** The personal calendar shows a visible group expectation on its saved date. */
export function personalCalendarGroupDate(input: { sourceKey: string; scheduledDate: string; scheduleVisible: boolean }): string | null {
  if (!input.scheduleVisible || !input.sourceKey.startsWith('group:')) return null;
  return input.scheduledDate;
}
