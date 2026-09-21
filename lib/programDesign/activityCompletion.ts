import type { SupabaseClient } from '@supabase/supabase-js';
import {
  COMPLETION_LEDGER_FLAG,
  completedDatesFromDetails,
  isActivityCompletedOnDate,
  isCompletionLedger,
  type UserCalendarActivity,
} from './userCalendar';
import type { TrainingDayItem, TrainingDayPlan } from './trainingSchedule';

export type WorkoutLike = {
  id?: string;
  st_exercises?: Array<{
    section?: string;
    st_planned_sets?: Array<{ id?: string; is_deleted?: boolean }>;
  }>;
};

export type SetLogLike = {
  id?: string;
  planned_set_id?: string;
  log_date?: string;
  completed?: boolean;
};

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeYmd(value: unknown): string {
  return String(value || '').slice(0, 10);
}

function uniqueDates(dates: string[]): string[] {
  return Array.from(new Set(dates.filter((d) => isYmd(d)))).sort();
}

export function programCompletionsFromDetails(
  details: Record<string, unknown> | null | undefined
): Record<string, string[]> {
  const raw = details?.program_completions;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [activityId, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = String(activityId || '').trim();
    if (!id) continue;
    const dates = Array.isArray(value)
      ? uniqueDates(value.map((item) => normalizeYmd(item)))
      : [];
    if (dates.length) out[id] = dates;
  }
  return out;
}

export function findCompletionLedger(
  activities: UserCalendarActivity[]
): UserCalendarActivity | null {
  return activities.find((a) => isCompletionLedger(a)) || null;
}

export function isProgramItemCompletedOnDate(
  activities: UserCalendarActivity[],
  programActivityId: string,
  dateYmd: string
): boolean {
  const ledger = findCompletionLedger(activities);
  if (!ledger) return false;
  return (programCompletionsFromDetails(ledger.details)[programActivityId] || []).includes(dateYmd);
}

export function detailsWithProgramItemCompleted(
  details: Record<string, unknown> | null | undefined,
  programActivityId: string,
  dateYmd: string,
  completed: boolean
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(details || {}), [COMPLETION_LEDGER_FLAG]: true };
  const completions = programCompletionsFromDetails(next);
  const dates = new Set(completions[programActivityId] || []);
  if (isYmd(dateYmd)) {
    if (completed) dates.add(dateYmd);
    else dates.delete(dateYmd);
  }
  const list = Array.from(dates).sort();
  if (list.length) completions[programActivityId] = list;
  else delete completions[programActivityId];
  if (Object.keys(completions).length) next.program_completions = completions;
  else delete next.program_completions;
  return next;
}

export async function setProgramItemCompleted(
  supabase: SupabaseClient,
  userId: string,
  activities: UserCalendarActivity[],
  programActivityId: string,
  dateYmd: string,
  completed: boolean
): Promise<{ error: string | null }> {
  const ledger = findCompletionLedger(activities);
  const details = detailsWithProgramItemCompleted(ledger?.details, programActivityId, dateYmd, completed);
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

export function calendarCheckoffDates(activities: UserCalendarActivity[]): string[] {
  const dates: string[] = [];
  for (const activity of activities) {
    if (isCompletionLedger(activity)) {
      for (const list of Object.values(programCompletionsFromDetails(activity.details))) {
        dates.push(...list);
      }
      continue;
    }
    dates.push(...completedDatesFromDetails(activity.details));
  }
  return uniqueDates(dates);
}

export function mergeTrainingCompletedDates(
  progressLogDates: string[],
  activities: UserCalendarActivity[]
): string[] {
  return uniqueDates([...progressLogDates.map((d) => normalizeYmd(d)), ...calendarCheckoffDates(activities)]);
}

function exerciseSectionOf(exercise: { section?: string } | null | undefined): string {
  return String(exercise?.section || 'strength');
}

/** Warm-up cards are prescription-only — there is no set logger, so those sets cannot block Done. */
export function exerciseCountsTowardWorkoutCompletion(exercise: { section?: string } | null | undefined): boolean {
  return exerciseSectionOf(exercise) !== 'warmup';
}

export function plannedSetIdsForWorkout(
  workout: WorkoutLike | null | undefined,
  opts?: { loggableOnly?: boolean }
): string[] {
  const ids: string[] = [];
  (workout?.st_exercises || []).forEach((exercise) => {
    if (opts?.loggableOnly && !exerciseCountsTowardWorkoutCompletion(exercise)) return;
    (exercise.st_planned_sets || [])
      .filter((set) => !set.is_deleted)
      .forEach((set) => {
        if (set.id) ids.push(String(set.id));
      });
  });
  return ids;
}

/** Same rule as Training/Dashboard: every loggable planned set has st_set_logs.completed = true for that date. */
export function isStrengthWorkoutCompleted(
  workout: WorkoutLike | null | undefined,
  logMap: Record<string, SetLogLike | undefined>
): boolean {
  const ids = plannedSetIdsForWorkout(workout, { loggableOnly: true });
  if (!ids.length) return false;
  return ids.every((id) => !!logMap[id]?.completed);
}

export function logMapForDate(
  dateYmd: string,
  progressLogs: SetLogLike[],
  sessionLogs: Record<string, SetLogLike | undefined>,
  selectedDate: string
): Record<string, SetLogLike | undefined> {
  const map: Record<string, SetLogLike | undefined> = {};
  progressLogs.forEach((row) => {
    if (normalizeYmd(row.log_date) !== dateYmd || !row.planned_set_id) return;
    map[String(row.planned_set_id)] = row;
  });
  if (dateYmd === selectedDate) {
    Object.entries(sessionLogs || {}).forEach(([id, row]) => {
      if (!row) return;
      if (row.log_date && normalizeYmd(row.log_date) !== dateYmd) return;
      map[id] = row;
    });
  }
  return map;
}

export function itemUsesStrengthLogs(item: Pick<TrainingDayItem, 'workoutId' | 'activityType'>): boolean {
  return !!item.workoutId && item.activityType === 'strength';
}

export function itemAllowsCheckoff(item: Pick<TrainingDayItem, 'workoutId' | 'activityType' | 'source'>): boolean {
  if (item.workoutId) return false;
  if (item.activityType === 'strength' && item.source === 'calendar') return false;
  return item.source === 'calendar' || item.source === 'program';
}

export function decorateDayPlanCompletion(
  plan: TrainingDayPlan,
  opts: {
    activities: UserCalendarActivity[];
    workouts: WorkoutLike[];
    progressLogs: SetLogLike[];
    sessionLogs: Record<string, SetLogLike | undefined>;
    selectedDate: string;
  }
): TrainingDayPlan {
  const logMap = logMapForDate(plan.date, opts.progressLogs, opts.sessionLogs, opts.selectedDate);
  const workoutsById = new Map(opts.workouts.map((w) => [String(w.id || ''), w]));
  const mark = (item: TrainingDayItem): TrainingDayItem => {
    if (item.workoutId) {
      const workout = workoutsById.get(item.workoutId);
      return { ...item, completed: isStrengthWorkoutCompleted(workout, logMap) };
    }
    if (item.source === 'calendar') {
      return { ...item, completed: !!item.completed };
    }
    if (item.source === 'program' && item.activityId) {
      return { ...item, completed: isProgramItemCompletedOnDate(opts.activities, item.activityId, plan.date) };
    }
    return { ...item, completed: false };
  };
  const items = plan.items.map(mark);
  return {
    ...plan,
    items,
    primary: plan.primary ? mark(plan.primary) : null,
    later: plan.later.map(mark),
  };
}

export function isCalendarActivityCompletedOnDate(activity: UserCalendarActivity, dateYmd: string): boolean {
  return isActivityCompletedOnDate(activity, dateYmd);
}
