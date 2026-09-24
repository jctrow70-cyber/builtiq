import type { IncrementRounding, IncrementSource } from './types';

export type IncrementContext = {
  equipment?: string | null;
  movementPattern?: string | null;
  units?: 'lb' | 'kg';
  /** Future per-user override. Takes precedence over gym and defaults. */
  userIncrement?: number | null;
  /** Future gym/stack override. Beats equipment defaults. */
  gymIncrement?: number | null;
  /** Weighted chin-up / dip-belt style load. */
  loadMode?: 'external' | 'bodyweight' | 'weighted_bodyweight' | 'assisted' | null;
};

export type ResolvedIncrement = {
  increment: number;
  unit: 'lb' | 'kg';
  source: IncrementSource;
  reason: string;
  rounding: IncrementRounding;
};

const LOWER_PATTERNS = new Set(['squat', 'hinge', 'lunge', 'knee_flexion', 'calf_raise']);

function normalizeEquipment(value?: string | null): string {
  return String(value || '').toLowerCase();
}

function equipmentDefault(
  equipment: string,
  movementPattern: string,
  units: 'lb' | 'kg',
  loadMode?: IncrementContext['loadMode']
): { increment: number; reason: string } {
  if (loadMode === 'bodyweight' || (/bodyweight|none|no equipment/.test(equipment) && loadMode !== 'weighted_bodyweight')) {
    return { increment: 0, reason: 'Bodyweight work does not use a load increment' };
  }
  if (loadMode === 'weighted_bodyweight' || /dip.?belt|weight.?belt|weighted bodyweight/.test(equipment)) {
    return { increment: units === 'kg' ? 1.25 : 2.5, reason: 'Small added-weight step for weighted bodyweight' };
  }
  if (/kettlebell|kb\b/.test(equipment)) {
    return { increment: units === 'kg' ? 4 : 9, reason: 'Next typical kettlebell jump' };
  }
  if (/dumbbell|db\b/.test(equipment)) {
    return { increment: units === 'kg' ? 2 : 5, reason: 'Next typical dumbbell pair' };
  }
  if (/plate[- ]?load/.test(equipment)) {
    return { increment: units === 'kg' ? 5 : 10, reason: 'Plate-loaded machine step' };
  }
  if (/cable|stack|machine|pin/.test(equipment)) {
    return { increment: units === 'kg' ? 2.5 : 5, reason: 'One cable/machine stack notch' };
  }
  if (/barbell|olympic|ez[- ]?bar/.test(equipment)) {
    const lower = LOWER_PATTERNS.has(movementPattern);
    return {
      increment: units === 'kg' ? 2.5 : 5,
      reason: lower ? 'Barbell lower-body plate step' : 'Barbell upper-body plate step',
    };
  }
  return {
    increment: units === 'kg' ? 2.5 : 5,
    reason: 'Unknown equipment — conservative default plate step',
  };
}

/** Round a proposed load to the increment. Increment 0 leaves the load unchanged. */
export function roundLoadToIncrement(load: number, increment: number, mode: 'nearest' | 'up' | 'down' = 'nearest'): number {
  if (!Number.isFinite(load)) return 0;
  if (!increment || increment <= 0) return load;
  const steps = load / increment;
  if (mode === 'up') return Math.ceil(steps) * increment;
  if (mode === 'down') return Math.floor(steps) * increment;
  return Math.round(steps) * increment;
}

function withRounding(result: Omit<ResolvedIncrement, 'rounding'>): ResolvedIncrement {
  return {
    ...result,
    rounding: result.increment > 0 ? 'nearest_increment' : 'none',
  };
}

/** Resolve the next load jump. Does not apply progression. */
export function resolveLoadIncrement(ctx: IncrementContext = {}): ResolvedIncrement {
  const units = ctx.units === 'kg' ? 'kg' : 'lb';
  if (ctx.userIncrement != null && Number.isFinite(ctx.userIncrement) && ctx.userIncrement >= 0) {
    return withRounding({
      increment: ctx.userIncrement,
      unit: units,
      source: 'user',
      reason: 'Athlete-specific increment override',
    });
  }
  if (ctx.gymIncrement != null && Number.isFinite(ctx.gymIncrement) && ctx.gymIncrement >= 0) {
    return withRounding({
      increment: ctx.gymIncrement,
      unit: units,
      source: 'gym',
      reason: 'Gym-specific increment override',
    });
  }
  const fallback = equipmentDefault(
    normalizeEquipment(ctx.equipment),
    String(ctx.movementPattern || ''),
    units,
    ctx.loadMode
  );
  return withRounding({
    increment: fallback.increment,
    unit: units,
    source: 'equipment_default',
    reason: fallback.reason,
  });
}
