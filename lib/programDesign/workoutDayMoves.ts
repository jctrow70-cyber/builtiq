import type { SupabaseClient } from '@supabase/supabase-js';
import { dateForWeekAndDay, resolveProgramStartDate } from '../training/programCalendar';
import { dateForProgramDay, programDateRange } from './cycle';
import type { ProgramActivity, ProgramDesignRecord } from './types';
import { isWeeklyRecurrence } from './recurrence';
import {
  COMPLETION_LEDGER_FLAG,
  createUserCalendarActivity,
  deleteUserCalendarOccurrence,
  draftFromCalendarActivity,
  isCompletionLedger,
  type UserCalendarActivity,
} from './userCalendar';

function findMoveLedger(activities: UserCalendarActivity[]): UserCalendarActivity | null {
  return activities.find((a) => isCompletionLedger(a)) || null;
}

type MoveItemRef = {
  workoutId?: string | null;
  activityId?: string | null;
  source?: 'program' | 'calendar';
};

export const WORKOUT_DAY_MOVES_KEY = 'workout_day_moves';

/** Map of `w:{workoutId}` or `a:{activityId}` → YYYY-MM-DD where the item should appear. */
export type WorkoutDayMoves = Record<string, string>;

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function workoutDayMovesFromDetails(
  details: Record<string, unknown> | null | undefined
): WorkoutDayMoves {
  const raw = details?.[WORKOUT_DAY_MOVES_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: WorkoutDayMoves = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(key || '').trim();
    const date = String(value || '').slice(0, 10);
    if (!id || !isYmd(date)) continue;
    out[id] = date;
  }
  return out;
}

export function workoutDayMovesFromActivities(activities: UserCalendarActivity[]): WorkoutDayMoves {
  const ledger = findMoveLedger(activities);
  return workoutDayMovesFromDetails(ledger?.details);
}

export function moveKeyForActivity(activity: Pick<ProgramActivity, 'id' | 'workout_id'>): string | null {
  if (activity.workout_id) return `w:${activity.workout_id}`;
  const id = String(activity.id || '');
  if (id.startsWith('legacy-')) {
    const workoutId = id.slice('legacy-'.length);
    return workoutId ? `w:${workoutId}` : null;
  }
  if (id) return `a:${id}`;
  return null;
}

export function moveKeyForItem(item: MoveItemRef): string | null {
  if (item.workoutId) return `w:${item.workoutId}`;
  if (item.source === 'program' && item.activityId) return `a:${item.activityId}`;
  return null;
}

export function nativeDateForActivity(
  program: ProgramDesignRecord,
  activity: Pick<ProgramActivity, 'week_number' | 'day_of_week'>
): string {
  const { start } = programDateRange(program);
  return dateForProgramDay(start, activity.week_number, activity.day_of_week);
}

export function nativeDateForWorkout(
  program: ProgramDesignRecord,
  workout: { week?: number | null; day_label?: string | null }
): string {
  const start = resolveProgramStartDate(program);
  return dateForWeekAndDay(start, Number(workout.week || 1), String(workout.day_label || 'Mon'));
}

export function currentDateForMove(moves: WorkoutDayMoves, key: string, nativeDate: string): string {
  return moves[key] || nativeDate;
}

export function detailsWithWorkoutDayMove(
  details: Record<string, unknown> | null | undefined,
  key: string,
  toDate: string | null
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(details || {}), [COMPLETION_LEDGER_FLAG]: true };
  const moves = workoutDayMovesFromDetails(next);
  if (toDate && isYmd(toDate)) moves[key] = toDate;
  else delete moves[key];
  if (Object.keys(moves).length) next[WORKOUT_DAY_MOVES_KEY] = moves;
  else delete next[WORKOUT_DAY_MOVES_KEY];
  return next;
}

export async function saveWorkoutDayMove(
  supabase: SupabaseClient,
  userId: string,
  activities: UserCalendarActivity[],
  key: string,
  toDate: string | null
): Promise<{ error: string | null }> {
  const ledger = findMoveLedger(activities);
  const details = detailsWithWorkoutDayMove(ledger?.details, key, toDate);
  if (ledger) {
    const { error } = await supabase.from('st_user_calendar_activities').update({ details }).eq('id', ledger.id);
    return { error: error?.message || null };
  }
  const { error } = await supabase.from('st_user_calendar_activities').insert({
    user_id: userId,
    activity_date: '1970-01-01',
    activity_type: 'rest',
    title: '',
    duration_minutes: null,
    notes: '',
    details,
    recurrence: 'none',
    recurrence_until: null,
    workout_id: null,
  });
  return { error: error?.message || null };
}

/** One-off calendar rows move by date. Weekly series skip the old date and add a one-off on the new date. */
export async function moveCalendarActivityToDate(
  supabase: SupabaseClient,
  activity: UserCalendarActivity,
  fromDate: string,
  toDate: string
): Promise<{ error: string | null }> {
  if (fromDate === toDate) return { error: null };
  if (!isYmd(toDate)) return { error: 'Pick a valid date' };
  if (isWeeklyRecurrence(activity.recurrence)) {
    const skipped = await deleteUserCalendarOccurrence(supabase, activity, fromDate, 'this-day');
    if (skipped.error) return skipped;
    const draft = draftFromCalendarActivity(activity, fromDate);
    const created = await createUserCalendarActivity(supabase, activity.user_id, toDate, {
      ...draft,
      recurrence: 'none',
      recurrence_until: null,
      recurrence_weekdays: [],
    }, { workoutId: activity.workout_id });
    return { error: created.error };
  }
  const { error } = await supabase
    .from('st_user_calendar_activities')
    .update({ activity_date: toDate })
    .eq('id', activity.id);
  return { error: error?.message || null };
}

export function workoutAppearsOnDate(
  program: ProgramDesignRecord,
  workout: { id?: string | null; week?: number | null; day_label?: string | null },
  dateYmd: string,
  moves: WorkoutDayMoves
): boolean {
  const id = String(workout.id || '');
  if (!id) return false;
  const native = nativeDateForWorkout(program, workout);
  return currentDateForMove(moves, `w:${id}`, native) === dateYmd;
}
