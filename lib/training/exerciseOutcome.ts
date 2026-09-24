import type { ExerciseAttemptOutcome, ExerciseSessionStatus } from '../scienceEngine/adaptation/types';
import { logHasPerformance, type PerformanceLike } from './plannedSetGuard';

export function deriveExerciseStatus(opts: {
  plannedSets?: Array<{ id?: string; is_deleted?: boolean; set_type?: string }>;
  logs?: Record<string, PerformanceLike | undefined>;
  explicit?: { status?: ExerciseSessionStatus | null; attempt_outcome?: ExerciseAttemptOutcome | null } | null;
}): { status: ExerciseSessionStatus; attempt: ExerciseAttemptOutcome } {
  if (opts.explicit?.status === 'skipped') {
    return { status: 'skipped', attempt: 'did_not_perform' };
  }
  const planned = (opts.plannedSets || []).filter((s) => !s.is_deleted && String(s.set_type || 'working') !== 'warmup');
  let done = 0;
  let started = 0;
  planned.forEach((set) => {
    const log = set.id ? opts.logs?.[set.id] : undefined;
    if (log?.completed) done += 1;
    else if (logHasPerformance(log)) started += 1;
  });
  if (planned.length && done === planned.length) {
    return { status: 'completed', attempt: 'completed' };
  }
  if (done > 0 || started > 0 || opts.explicit?.attempt_outcome === 'could_not_complete') {
    return { status: 'partial', attempt: 'could_not_complete' };
  }
  if (opts.explicit?.status === 'completed') return { status: 'completed', attempt: 'completed' };
  return { status: 'not_started', attempt: 'did_not_perform' };
}
