import type { SessionStatus, SkipReason } from '../scienceEngine/adaptation/types';
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
