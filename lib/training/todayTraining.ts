import { deriveSessionStatus } from './sessionOutcome';
import { presentTrainingStatus, trainingDayCardAction, trainingDayCardLine } from './trainingDayCard';
import { trainingCalendarAction } from './trainingPreview';
import { trainingSourceLabel } from './trainingSource';
import {
  decorateDayPlanCompletion,
  itemAllowsCheckoff,
  logMapForDate,
  type SetLogLike,
  type WorkoutLike,
} from '../programDesign/activityCompletion';
import { formatLongWeekday } from '../programDesign/cycle';
import { trainingWorkoutSummary } from '../programDesign/workoutPreview';
import {
  overlayVisibleExpectations,
  planForCalendarDate,
  type TrainingDayItem,
  type TrainingDayPlan,
  type VisibleScheduleExpectation,
} from '../programDesign/trainingSchedule';
import type { ProgramActivity, ProgramDesignRecord } from '../programDesign/types';
import type { UserCalendarActivity } from '../programDesign/userCalendar';
import type { WorkoutDayMoves } from '../programDesign/workoutDayMoves';

export const TODAY_TRAINING_LIMIT = 3;

export type TodayTrainingAction = 'Start' | 'Continue' | 'Review' | 'Mark complete' | 'Undo complete' | 'Set up';

export type TodayTrainingRow = {
  item: TrainingDayItem;
  name: string;
  meta: string;
  movedLabel: string | null;
  status: string | null;
  action: TodayTrainingAction | null;
  canPreview: boolean;
};

export type TodayTrainingNotice = { kind: 'pending' } | { kind: 'incomplete'; message: string };

export type TodayTrainingModel =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'no-program'; notice: TodayTrainingNotice | null }
  | { state: 'rest'; notice: TodayTrainingNotice | null }
  | { state: 'empty'; notice: TodayTrainingNotice | null }
  | { state: 'activities'; rows: TodayTrainingRow[]; hiddenCount: number; notice: TodayTrainingNotice | null };

export type TodayTrainingNavigation =
  | { kind: 'logger'; item: TrainingDayItem; date: string }
  | { kind: 'preview'; item: TrainingDayItem; date: string }
  | { kind: 'checkoff'; item: TrainingDayItem; date: string }
  | { kind: 'setup'; activityId: string; date: string; title: string }
  | { kind: 'calendar' }
  | { kind: 'programs' }
  | { kind: 'none' };

type LogMap = Record<string, SetLogLike | undefined>;

/** Training's today list: program day, calendar items, moves, completion, then visible expectations. */
export function composeTodayTrainingPlan(input: {
  program: ProgramDesignRecord | null;
  activities: ProgramActivity[];
  calendarActivities: UserCalendarActivity[];
  moves?: WorkoutDayMoves;
  workouts?: WorkoutLike[];
  progressLogs?: SetLogLike[];
  sessionLogs?: LogMap;
  expectations?: VisibleScheduleExpectation[];
  today: string;
  followedSourceProgramId?: string | null;
  followedSource?: { sourceKey: string; sourceName: string } | null;
  lineageProgramIds?: string[] | null;
}): TrainingDayPlan {
  const today = input.today;
  const base = decorateDayPlanCompletion(
    planForCalendarDate(
      input.program,
      input.activities,
      input.calendarActivities,
      today,
      today,
      input.moves || {}
    ),
    {
      activities: input.calendarActivities,
      workouts: input.workouts || [],
      progressLogs: input.progressLogs || [],
      sessionLogs: input.sessionLogs || {},
      selectedDate: today,
      program: input.program,
    }
  );
  return overlayVisibleExpectations(
    base,
    input.expectations || [],
    today,
    input.followedSourceProgramId,
    input.followedSource,
    input.lineageProgramIds,
    input.moves || {}
  );
}

export function todayTrainingLogMap(input: {
  today: string;
  progressLogs?: SetLogLike[];
  sessionLogs?: LogMap;
  includeSessionLogs: boolean;
  program?: ProgramDesignRecord | null;
  workouts?: WorkoutLike[];
}): LogMap {
  const session = input.includeSessionLogs ? input.sessionLogs || {} : {};
  const progress = input.progressLogs || [];
  const workouts = input.workouts || [];
  if (input.program && workouts.length) {
    const merged: LogMap = {};
    workouts.forEach((workout) => {
      if (!workout?.id) return;
      const part = logMapForDate(input.today, progress, session, input.today, {
        program: input.program,
        workout,
      });
      Object.assign(merged, part);
    });
    return merged;
  }
  return logMapForDate(input.today, progress, session, input.today);
}

export function todayTrainingIdentity(
  item: TrainingDayItem,
  programNames: Record<string, string>,
  followedProgramName?: string | null
): string {
  const source = trainingSourceLabel(item) || '';
  const named = item.programId ? programNames[item.programId] : '';
  const programName = named || (item.source === 'program' ? String(followedProgramName || '').trim() : '');
  if (programName && source && programName.toLowerCase() !== source.toLowerCase()) return `${programName} · ${source}`;
  return source || programName;
}

function workoutFor(item: TrainingDayItem, workoutsById: Record<string, WorkoutLike | undefined>) {
  if (!item.workoutId) return null;
  return workoutsById[item.workoutId] || null;
}

/** Same presentation label as the Training calendar. Adherence wins on a missed day. */
export function todayTrainingStatus(
  item: TrainingDayItem,
  workoutsById: Record<string, WorkoutLike | undefined>,
  logMap: LogMap
): string | null {
  if (item.isRest) return null;
  const derived = item.workoutId
    ? deriveSessionStatus({
        workout: workoutFor(item, workoutsById),
        logs: logMap,
        explicit: item.sessionStatus ? { status: item.sessionStatus } : null,
      })
    : null;
  return presentTrainingStatus({
    scheduleState: item.statusLabel,
    setLogsCompleted: !!item.completed,
    sessionStatus: item.sessionStatus || null,
    progress: derived,
  });
}

export function todayTrainingAction(item: TrainingDayItem, status: string | null): TodayTrainingAction | null {
  if (item.isRest || !status) return null;
  if (!item.workoutId) {
    if (item.activityType === 'strength' && item.source === 'calendar' && item.activityId) return 'Set up';
    if (itemAllowsCheckoff(item)) return item.completed ? 'Undo complete' : 'Mark complete';
    return null;
  }
  if ((status === 'Partial' || status === 'In progress') && !item.completed) return 'Continue';
  if (status === 'Missed' || status === 'Excused') return null;
  return trainingDayCardAction({
    canStart: true,
    completed: !!item.completed || status === 'Completed' || status === 'Skipped',
  });
}

export function presentTodayTrainingRow(
  item: TrainingDayItem,
  input: {
    workoutsById?: Record<string, WorkoutLike | undefined>;
    logMap?: LogMap;
    programNames?: Record<string, string>;
    followedProgramName?: string | null;
  }
): TodayTrainingRow {
  const workoutsById = input.workoutsById || {};
  const logMap = input.logMap || {};
  const summary = trainingWorkoutSummary({
    title: item.title,
    workout: item.workoutId ? workoutsById[item.workoutId] : null,
    duration: item.duration,
  });
  const identity = todayTrainingIdentity(item, input.programNames || {}, input.followedProgramName);
  const status = todayTrainingStatus(item, workoutsById, logMap);
  return {
    item,
    name: summary.name,
    meta: trainingDayCardLine({
      source: identity,
      typeLabel: item.typeLabel,
      duration: summary.duration,
      focus: summary.focus,
    }),
    movedLabel: item.movedFrom ? `Moved from ${formatLongWeekday(item.movedFrom)}` : null,
    status,
    action: todayTrainingAction(item, status),
    canPreview: !!item.workoutId,
  };
}

function scheduleNotice(input: { schedulePending?: boolean; scheduleError?: string | null }): TodayTrainingNotice | null {
  if (input.schedulePending) return { kind: 'pending' };
  const message = String(input.scheduleError || '').trim();
  if (message) return { kind: 'incomplete', message };
  return null;
}

export function classifyTodayTraining(input: {
  loading: boolean;
  failed: boolean;
  programConfigured: boolean;
  plan: TrainingDayPlan | null;
  workoutsById?: Record<string, WorkoutLike | undefined>;
  logMap?: LogMap;
  programNames?: Record<string, string>;
  followedProgramName?: string | null;
  schedulePending?: boolean;
  scheduleError?: string | null;
  scheduleRepairing?: boolean;
  programReady?: boolean;
}): TodayTrainingModel {
  if (input.loading) return { state: 'loading' };
  if (input.failed) return { state: 'error' };
  const notice = scheduleNotice(input);
  const allItems = input.plan?.items || [];
  const items = allItems.filter((item) => !item.isRest);
  const restDay = allItems.some((item) => item.isRest);
  if (!items.length && !restDay && (input.scheduleRepairing || input.programReady === false)) return { state: 'loading' };
  if (items.length) {
    const shown = items.slice(0, TODAY_TRAINING_LIMIT);
    return {
      state: 'activities',
      hiddenCount: Math.max(0, items.length - TODAY_TRAINING_LIMIT),
      notice,
      rows: shown.map((item) =>
        presentTodayTrainingRow(item, {
          workoutsById: input.workoutsById,
          logMap: input.logMap,
          programNames: input.programNames,
          followedProgramName: input.followedProgramName,
        })
      ),
    };
  }
  if ((input.plan?.items || []).some((item) => item.isRest)) return { state: 'rest', notice };
  if (!input.programConfigured) return { state: 'no-program', notice };
  return { state: 'empty', notice };
}

/** Start and Continue open the logger only when the item has a workout id. */
export function navigationForTodayTraining(input: {
  item?: TrainingDayItem | null;
  date: string;
  action?: TodayTrainingAction | 'preview' | 'calendar' | 'programs' | null;
}): TodayTrainingNavigation {
  if (input.action === 'calendar') return { kind: 'calendar' };
  if (input.action === 'programs') return { kind: 'programs' };
  const item = input.item;
  if (!item || item.isRest) return { kind: 'none' };
  if (input.action === 'preview') {
    if (trainingCalendarAction('title', item) !== 'preview') return { kind: 'none' };
    return { kind: 'preview', item, date: input.date };
  }
  if (input.action === 'Review') {
    if (trainingCalendarAction('review', item) !== 'log') return { kind: 'none' };
    return { kind: 'logger', item, date: input.date };
  }
  if (input.action === 'Start' || input.action === 'Continue') {
    if (!item.workoutId) return { kind: 'none' };
    return { kind: 'logger', item, date: input.date };
  }
  if (input.action === 'Mark complete' || input.action === 'Undo complete') {
    if (item.workoutId || !itemAllowsCheckoff(item)) return { kind: 'none' };
    return { kind: 'checkoff', item, date: input.date };
  }
  if (input.action === 'Set up') {
    if (item.workoutId || !item.activityId) return { kind: 'none' };
    return { kind: 'setup', activityId: item.activityId, date: input.date, title: item.title };
  }
  return { kind: 'none' };
}
