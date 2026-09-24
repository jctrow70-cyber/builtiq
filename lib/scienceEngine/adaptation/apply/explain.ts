import type { ProgressionDecisionKind } from '../types';
import { REASON } from '../reasonCodes';
import type { ApplyAbortReason } from './types';

export function explainAdaptation(opts: {
  decision: ProgressionDecisionKind;
  reason_codes: string[];
  exercise_name: string;
  from_load: string | null;
  to_load: string | null;
  unit: string;
  increment?: number | null;
  rep_min?: number | null;
  rep_max?: number | null;
  abort_reason?: ApplyAbortReason;
}): { headline: string; why: string; next_line: string } {
  const name = opts.exercise_name || 'This exercise';
  const from = opts.from_load || 'the current load';
  const to = opts.to_load || from;
  const unit = opts.unit || 'lb';
  const range = opts.rep_min != null && opts.rep_max != null ? `${opts.rep_min}–${opts.rep_max}` : 'the prescribed';
  const codes = opts.reason_codes || [];
  const delta = opts.increment != null && Number.isFinite(opts.increment) ? Math.abs(Number(opts.increment)) : null;

  if (opts.abort_reason === 'NO_ELIGIBLE_TARGET') {
    return {
      headline: `No eligible next ${name}`,
      why: 'The next comparable exposure is not eligible. BuiltIQ did not change a logged, completed, locked, or unrelated workout.',
      next_line: 'No prescription change.',
    };
  }
  if (opts.abort_reason === 'STALE_TARGET_PRESCRIPTION') {
    return {
      headline: `No automatic change to ${name}`,
      why: 'The next workout was edited after this decision was calculated, so BuiltIQ did not overwrite it.',
      next_line: 'Your edit was kept.',
    };
  }
  if (opts.abort_reason === 'HISTORY_GUARD' || opts.abort_reason === 'TARGET_HAS_PERFORMANCE') {
    return {
      headline: `No change to ${name}`,
      why: 'The next comparable exposure already has performance, so its prescription was not rewritten.',
      next_line: 'No prescription change.',
    };
  }

  if (opts.decision === 'progress_load' && codes.includes(REASON.PROG_LOAD_UNDERCHALLENGED)) {
    return {
      headline: `${name} ${to} ${unit}`,
      why: `The sets were easier than the target effort, so BuiltIQ added one normal increment (${from} → ${to} ${unit}). This is not the same as hitting the prescribed RIR.`,
      next_line: delta ? `↑ ${delta} ${unit}` : `↑ to ${to} ${unit}`,
    };
  }
  if (opts.decision === 'progress_load' && codes.includes(REASON.PROG_LOAD_REPEATED_PERFORMANCE)) {
    return {
      headline: `${name} ${to} ${unit}`,
      why: `You reached the top of your ${range} range on two comparable sessions. RIR was not logged, so this is repeated-performance progression.`,
      next_line: delta ? `↑ ${delta} ${unit}` : `↑ to ${to} ${unit}`,
    };
  }
  if (opts.decision === 'progress_load') {
    return {
      headline: `${name} ${to} ${unit}`,
      why: `${name} increased from ${from} ${unit} to ${to} ${unit} because you reached the top of your ${range} rep range across all working sets while staying within the target effort range.`,
      next_line: delta ? `↑ ${delta} ${unit}` : `↑ to ${to} ${unit}`,
    };
  }
  if (opts.decision === 'reduce_load') {
    return {
      headline: `${name} ${to} ${unit}`,
      why: `Load is reduced from ${from} ${unit} to ${to} ${unit} after repeated below-range work with excessive effort.`,
      next_line: delta ? `↓ ${delta} ${unit}` : `↓ to ${to} ${unit}`,
    };
  }
  if (opts.decision === 'build_reps') {
    return {
      headline: `Keep ${from} ${unit}`,
      why: `Stay at ${from} ${unit} and work toward ${opts.rep_max ?? 'the top of the range'} reps on every set.`,
      next_line: `Keep ${from} ${unit} and work toward ${opts.rep_max ?? 'top'} reps on every set.`,
    };
  }
  if (opts.decision === 'hold') {
    return {
      headline: `Keep ${from} ${unit}`,
      why: 'The load is held after this exposure. One hard or unconfirmed session is not an automatic change.',
      next_line: `Keep ${from} ${unit}.`,
    };
  }
  if (opts.decision === 'pain_hold') {
    return {
      headline: `No change to ${name}`,
      why: 'Pain was reported. The next prescription was not changed. This is not a diagnosis.',
      next_line: 'Review how this exercise felt before adding load.',
    };
  }
  if (opts.decision === 'review_required') {
    return {
      headline: `No automatic change to ${name}`,
      why: 'Signals conflicted or effort was unclear, so BuiltIQ did not rewrite the next workout.',
      next_line: 'Review this exercise before changing load.',
    };
  }
  return {
    headline: `No change to ${name}`,
    why: 'There was not enough comparable performance to adapt the next workout.',
    next_line: 'No prescription change.',
  };
}
