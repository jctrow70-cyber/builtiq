import type { SessionStatus, SkipReason } from '../scienceEngine/adaptation/types';
import { plannedSetIdsForWorkout, type SetLogLike, type WorkoutLike } from '../programDesign/activityCompletion';
import { logHasPerformance, type PerformanceLike } from './plannedSetGuard';

export type PlannedSetForOutcome = {
  id?: string;
  is_deleted?: boolean;
  set_type?: string;
};

export type ExerciseForOutcome = {
  section?: string;
  st_planned_sets?: PlannedSetForOutcome[];
};

export type WorkoutForOutcome = {
  st_exercises?: ExerciseForOutcome[];
};

function isLoggableExercise(ex: ExerciseForOutcome): boolean {
  return String(ex.section || 'strength') !== 'warmup';
}

function loggablePlannedSets(workout: WorkoutForOutcome | null | undefined): PlannedSetForOutcome[] {
  const sets: PlannedSetForOutcome[] = [];
  (workout?.st_exercises || []).forEach((ex) => {
    if (!isLoggableExercise(ex)) return;
    (ex.st_planned_sets || []).forEach((set) => {
      if (set.is_deleted) return;
      if (String(set.set_type || 'working') === 'warmup') return;
      sets.push(set);
    });
  });
  return sets;
}

/**
 * Derived status from logs never becomes skipped.
 * Empty logs = not_started. Skipped requires an explicit session row.
 */
export function deriveSessionStatus(opts: {
  workout?: WorkoutForOutcome | null;
  logs?: Record<string, PerformanceLike | undefined>;
  explicit?: { status?: SessionStatus | null; skip_reason?: SkipReason | null } | null;
}): SessionStatus {
  if (opts.explicit?.status === 'skipped') return 'skipped';
  if (opts.explicit?.status === 'completed') return 'completed';
  if (opts.explicit?.status === 'partial') return 'partial';

  const planned = loggablePlannedSets(opts.workout);
  if (!planned.length) return opts.explicit?.status || 'not_started';
  let done = 0;
  let started = 0;
  planned.forEach((set) => {
    const log = set.id ? opts.logs?.[set.id] : undefined;
    if (log?.completed) done += 1;
    else if (logHasPerformance(log)) started += 1;
  });
  if (done === planned.length) return 'completed';
  if (done > 0 || started > 0) return opts.explicit?.status === 'in_progress' ? 'in_progress' : 'in_progress';
  return 'not_started';
}

export function skippedIsNotFailed(status: SessionStatus): boolean {
  return status === 'skipped' || status === 'not_started';
}

export type CompletedSessionDraft = {
  workoutId: string;
  logDate: string;
  status: 'completed';
  expectationId: string | null;
  sourceKey: string | null;
  scheduledDate: string | null;
};

/**
 * Writes a completed session only when every required working set on this workout is completed.
 * Partial, skipped, and empty logs stay on the explicit Session card. A log counts only when it
 * is stored on that planned set, so another workout's sets on the same date do not finish this one.
 * An existing completed, partial, or skipped status is left unchanged.
 */
export function completedSessionDraft(input: {
  intent?: 'log' | 'edit' | null;
  workout?: WorkoutLike | null;
  logs?: Record<string, { completed?: boolean; planned_set_id?: string | null } | undefined>;
  logDate: string;
  expectationId?: string | null;
  sourceKey?: string | null;
  scheduledDate?: string | null;
  existingStatus?: string | null;
}): CompletedSessionDraft | null {
  if (input.intent === 'edit') return null;
  if (input.existingStatus === 'completed' || input.existingStatus === 'partial' || input.existingStatus === 'skipped') return null;
  const workoutId = input.workout?.id;
  if (!workoutId || !input.logDate) return null;
  const ids = plannedSetIdsForWorkout(input.workout, { loggableOnly: true });
  if (!ids.length) return null;
  const ready = ids.every((id) => {
    const log = input.logs?.[id];
    if (!log?.completed) return false;
    return !log.planned_set_id || log.planned_set_id === id;
  });
  if (!ready) return null;
  return {
    workoutId,
    logDate: input.logDate,
    status: 'completed',
    expectationId: input.expectationId || null,
    sourceKey: input.sourceKey || null,
    scheduledDate: input.scheduledDate || null,
  };
}

export function outstandingRequiredSetIds(
  workout: WorkoutLike | null | undefined,
  logs?: Record<string, SetLogLike | undefined>
): string[] {
  return plannedSetIdsForWorkout(workout, { loggableOnly: true }).filter((id) => {
    const log = logs?.[id];
    if (!log?.completed) return true;
    return !!log.planned_set_id && log.planned_set_id !== id;
  });
}

/** A completed session becomes partial when required sets are still open. Partial and skipped stay as chosen. */
export function sessionStatusAfterPlanChange(input: {
  existingStatus?: string | null;
  workout?: WorkoutLike | null;
  logs?: Record<string, SetLogLike | undefined>;
}): 'partial' | null {
  if (input.existingStatus !== 'completed') return null;
  if (!outstandingRequiredSetIds(input.workout, input.logs).length) return null;
  return 'partial';
}
