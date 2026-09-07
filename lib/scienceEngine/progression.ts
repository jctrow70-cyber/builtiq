import type { PerWorkingSet, ProgressionInput, ProgressionResult } from './types';

export type { ProgressionResult };

export function estimated1Rm(weight: number, reps: number): number {
  if (reps > 12 || weight <= 0 || reps <= 0) return weight;
  return weight * (1 + reps / 30);
}

export function evaluateProgression(input: ProgressionInput): ProgressionResult {
  const sets = (input.workingSets || []).filter((s) => s.completed !== false && s.reps > 0);
  if (!sets.length) {
    return { decision: 'MAINTAIN', reason: 'No completed working sets were available to evaluate.' };
  }

  if (input.painScore != null && input.painScore >= 5) {
    return {
      decision: 'SUBSTITUTE',
      reason: 'Pain was 5 or higher. Automatic progression is stopped so the movement can be modified.',
    };
  }
  if (input.painScore != null && input.painScore >= 3) {
    return {
      decision: 'MAINTAIN',
      reason: 'Pain was in the 3–4 range. Load is held so the movement can be monitored.',
    };
  }

  const allHitTop = sets.every((s) => s.reps >= input.repMax);
  const allWithin = sets.every((s) => s.reps >= input.repMin);
  const avgRir = average(sets.map((s) => s.rir));
  const effortAcceptable = avgRir + 0.6 >= input.targetRir;
  const currentLoad = median(sets.map((s) => s.weight));

  if (allHitTop && effortAcceptable) {
    const nextLoad = currentLoad > 0 ? currentLoad + (input.loadIncrement || 5) : undefined;
    return {
      decision: 'PROGRESS_LOAD',
      reason:
        'All working sets reached the upper repetition target while maintaining the prescribed effort.',
      nextLoad,
      nextRepMin: input.repMin,
      nextRepMax: input.repMax,
      nextRir: input.targetRir,
    };
  }

  if (allWithin && !allHitTop) {
    return {
      decision: 'PROGRESS_REPS',
      reason: 'Sets stayed in the prescribed range, so the next session keeps the load and continues adding reps.',
      nextLoad: currentLoad || undefined,
      nextRepMin: input.repMin,
      nextRepMax: input.repMax,
      nextRir: input.targetRir,
    };
  }

  if (!allWithin) {
    const poor = input.consecutivePoorExposures || 1;
    if (poor >= 2) {
      return {
        decision: 'EVALUATE_UNDERPERFORMANCE',
        reason: 'Performance declined across two or more comparable exposures. Review recovery before changing the plan.',
        nextLoad: currentLoad || undefined,
      };
    }
    return {
      decision: 'MAINTAIN',
      reason: 'One session fell short of the prescribed range. The same load is kept unless pain or another issue is present.',
      nextLoad: currentLoad || undefined,
    };
  }

  return {
    decision: 'MAINTAIN',
    reason: 'Performance is being held at the current prescription.',
    nextLoad: currentLoad || undefined,
  };
}

export function setsFromLogs(rows: { actual_weight?: any; actual_reps?: any; actual_rir?: any; actual_rpe?: any; completed?: boolean }[]): PerWorkingSet[] {
  return (rows || []).map((row) => {
    const weight = Number(String(row.actual_weight ?? '').replace(/[^\d.]/g, '')) || 0;
    const reps = Number(String(row.actual_reps ?? '').replace(/[^\d.]/g, '')) || 0;
    const rir =
      row.actual_rir != null && String(row.actual_rir) !== ''
        ? Number(row.actual_rir)
        : rirFromRpe(row.actual_rpe);
    return { weight, reps, rir, completed: row.completed !== false };
  });
}

function rirFromRpe(rpe: any): number {
  const n = Number(String(rpe ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 2;
  return Math.max(0, Math.min(5, Math.round(10 - n)));
}

function average(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number {
  const vals = nums.filter((n) => n > 0).sort((a, b) => a - b);
  if (!vals.length) return 0;
  return vals[Math.floor(vals.length / 2)];
}
