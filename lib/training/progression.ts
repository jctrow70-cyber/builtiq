/**
 * Rule-based progression v1. Swap this module for AI-driven logic later without UI changes.
 */

export type SetPerformance = { weight: string; reps: string; completed: boolean };

export type LastPerformance = {
  date: string;
  sets: SetPerformance[];
  summary: string;
  avgReps: number;
  topWeight: number;
  missedSets: number;
};

export type ProgressionResult = {
  lastSummary: string;
  nextTarget: string;
  note: string;
  ruleApplied: string;
};

const parseNum = (v: string | number | null | undefined) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function buildLastPerformance(rows: any[]): LastPerformance | null {
  if (!rows?.length) return null;
  const date = rows[0].log_date;
  const sameDay = rows.filter((r) => r.log_date === date && r.completed !== false);
  if (!sameDay.length) return null;

  const sets: SetPerformance[] = sameDay.map((r) => ({
    weight: String(r.actual_weight || ''),
    reps: String(r.actual_reps || ''),
    completed: r.completed !== false,
  }));

  const repCounts = sets.map((s) => parseNum(s.reps)).filter((n) => n > 0);
  const weights = sets.map((s) => parseNum(s.weight)).filter((n) => n > 0);
  const avgReps = repCounts.length ? repCounts.reduce((a, b) => a + b, 0) / repCounts.length : 0;
  const topWeight = weights.length ? Math.max(...weights) : 0;
  const missedSets = sets.filter((s) => !s.reps || parseNum(s.reps) === 0).length;

  const summary = `${sets.length}×${repCounts.length ? Math.round(avgReps) : '-'} @ ${topWeight || '-'} lb`;

  return { date, sets, summary, avgReps, topWeight, missedSets };
}

function isLowerBody(name: string, muscle: string): boolean {
  const s = `${name} ${muscle}`.toLowerCase();
  return /squat|deadlift|leg|hamstring|quad|glute|lunge|hip thrust|curl|extension/.test(s);
}

export function recommendNextTarget(
  last: LastPerformance | null,
  plannedSetCount = 3,
  exerciseName = '',
  muscleGroup = ''
): ProgressionResult {
  if (!last || !last.sets.length) {
    return {
      lastSummary: 'No prior log',
      nextTarget: `${plannedSetCount} sets — log your first session`,
      note: 'Complete this workout to unlock progression hints.',
      ruleApplied: 'none',
    };
  }

  const lastSummary = `${last.summary} (${last.date})`;
  const targetReps = Math.max(1, Math.round(last.avgReps) || 8);
  const lower = isLowerBody(exerciseName, muscleGroup);
  const bump = lower ? 10 : 5;

  if (last.missedSets >= 2) {
    const reduced = Math.max(0, last.topWeight - bump);
    return {
      lastSummary,
      nextTarget: `${plannedSetCount}×${targetReps} @ ${reduced || 'same'} lb`,
      note: 'Multiple sets missed — repeat with slightly less weight.',
      ruleApplied: 'reduce_load',
    };
  }

  if (last.missedSets >= 1) {
    return {
      lastSummary,
      nextTarget: `${plannedSetCount}×${targetReps} @ ${last.topWeight || 'same'} lb`,
      note: 'Some reps missed — repeat the same target.',
      ruleApplied: 'repeat',
    };
  }

  if (last.topWeight > 0) {
    return {
      lastSummary,
      nextTarget: `${plannedSetCount}×${targetReps} @ ${last.topWeight + bump} lb`,
      note: 'All reps completed — increase weight slightly.',
      ruleApplied: 'add_weight',
    };
  }

  return {
    lastSummary,
    nextTarget: `${plannedSetCount}×${targetReps + 1} reps`,
    note: 'Add reps within your target range before increasing weight.',
    ruleApplied: 'add_reps',
  };
}

export function getExercisePerformanceFromHistory(
  historyRows: any[],
  exerciseKey: string
): LastPerformance | null {
  const rows = (historyRows || []).filter((r) => {
    const catalogId = r.snapshot_catalog_exercise_id || r.st_planned_sets?.st_exercises?.catalog_exercise_id || '';
    const name = r.snapshot_exercise_name || r.st_planned_sets?.st_exercises?.name || '';
    const key = catalogId || String(name).toLowerCase().trim();
    return key === exerciseKey;
  });
  if (!rows.length) return null;
  return buildLastPerformance(rows);
}
