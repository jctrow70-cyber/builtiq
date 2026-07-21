import { formatMacro } from './macros';

export type MacroRingStatus = 'primary' | 'near' | 'over';

export function macroRingRatio(actual: number, target: number): number {
  if (!target || target <= 0) return 0;
  return actual / target;
}

/** Arc fill amount for the ring (0–1). Over-goal still renders a full ring. */
export function macroRingArc(actual: number, target: number): number {
  return Math.min(1, macroRingRatio(actual, target));
}

export function macroRingStatus(actual: number, target: number): MacroRingStatus {
  const ratio = macroRingRatio(actual, target);
  if (ratio > 1) return 'over';
  if (ratio >= 0.9) return 'near';
  return 'primary';
}

export function formatCaloriesRemaining(consumed: number, goal: number): string {
  const diff = goal - consumed;
  if (diff >= 0) return `${formatMacro(diff)} Remaining`;
  return `${formatMacro(Math.abs(diff))} Over`;
}
