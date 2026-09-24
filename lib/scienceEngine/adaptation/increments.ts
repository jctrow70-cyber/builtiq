import type { IncrementSource } from './types';

export type IncrementContext = {
  equipment?: string | null;
  movementPattern?: string | null;
  units?: 'lb' | 'kg';
  /** Future per-user override. Takes precedence over gym and defaults. */
  userIncrement?: number | null;
  /** Future gym/stack override. Beats equipment defaults. */
  gymIncrement?: number | null;
};

export type ResolvedIncrement = {
  increment: number;
  unit: 'lb' | 'kg';
  source: IncrementSource;
  reason: string;
};

const LOWER_PATTERNS = new Set(['squat', 'hinge', 'lunge', 'knee_flexion', 'calf_raise']);

function normalizeEquipment(value?: string | null): string {
  return String(value || '').toLowerCase();
}

function equipmentDefault(equipment: string, movementPattern: string, units: 'lb' | 'kg'): { increment: number; reason: string } {
  const lower = LOWER_PATTERNS.has(movementPattern);
  if (/kettlebell|kb\b/.test(equipment)) {
    return { increment: units === 'kg' ? 4 : 9, reason: 'Next typical kettlebell jump' };
  }
  if (/dumbbell|db\b/.test(equipment)) {
    return { increment: units === 'kg' ? 2 : 5, reason: 'Next typical dumbbell pair' };
  }
  if (/cable|stack|machine|pin/.test(equipment)) {
    return { increment: units === 'kg' ? 2.5 : 5, reason: 'One cable/machine stack notch' };
  }
  if (/bodyweight|none|no equipment/.test(equipment)) {
    return { increment: 0, reason: 'Bodyweight work does not use a load increment' };
  }
  if (/barbell|olympic|ez[- ]?bar/.test(equipment)) {
    return {
      increment: units === 'kg' ? (lower ? 2.5 : 2.5) : lower ? 5 : 5,
      reason: lower ? 'Barbell lower-body plate step' : 'Barbell upper-body plate step',
    };
  }
  return {
    increment: units === 'kg' ? 2.5 : 5,
    reason: 'Unknown equipment — conservative default plate step',
  };
}

/** Resolve the next load jump. Does not apply progression. */
export function resolveLoadIncrement(ctx: IncrementContext = {}): ResolvedIncrement {
  const units = ctx.units === 'kg' ? 'kg' : 'lb';
  if (ctx.userIncrement != null && Number.isFinite(ctx.userIncrement) && ctx.userIncrement >= 0) {
    return {
      increment: ctx.userIncrement,
      unit: units,
      source: 'user',
      reason: 'Athlete-specific increment override',
    };
  }
  if (ctx.gymIncrement != null && Number.isFinite(ctx.gymIncrement) && ctx.gymIncrement >= 0) {
    return {
      increment: ctx.gymIncrement,
      unit: units,
      source: 'gym',
      reason: 'Gym-specific increment override',
    };
  }
  const fallback = equipmentDefault(normalizeEquipment(ctx.equipment), String(ctx.movementPattern || ''), units);
  return {
    increment: fallback.increment,
    unit: units,
    source: 'equipment_default',
    reason: fallback.reason,
  };
}
