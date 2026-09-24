import { reportedRirOrUnknown } from './confidence';
import type { ExerciseExposureInput, LoggedSetInput } from './inputs';
import type { LoadMode } from './types';

const EXCLUDED_SET_TYPES = new Set(['warmup', 'warm-up', 'ramp', 'ramp_up', 'specific_ramp', 'cooldown', 'cool-down', 'mobility']);
const EXCLUDED_ROLES = new Set(['warmup', 'power', 'conditioning']);
const EXCLUDED_SECTIONS = new Set(['warmup', 'cooldown', 'mobility', 'cardio']);

export type CountedWorkingSet = {
  reps: number;
  load: number | null;
  rir: number | null;
  side: 'left' | 'right' | 'both' | null;
  planned_set_id: string | null;
};

export type CountedSetResult = {
  counted: CountedWorkingSet[];
  excluded: { extras: number; warmups: number; ramps: number; skipped: number; empty: number };
};

export function parseFiniteNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(String(value).replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function parseReps(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parse logged load. "BW", empty, or bodyweight → 0. "+25" / "BW+25" → 25. */
export function parseLoad(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^(bw|bodyweight|body wt)$/i.test(raw)) return 0;
  const plus = raw.match(/^(?:bw\s*)?\+\s*(\d+(?:\.\d+)?)/i);
  if (plus) return Number(plus[1]);
  const n = parseFiniteNumber(raw);
  return n;
}

export function parseRepRange(raw?: string | null, min?: number | null, max?: number | null): { min: number | null; max: number | null } {
  if (min != null && max != null && Number.isFinite(Number(min)) && Number.isFinite(Number(max))) {
    return { min: Number(min), max: Number(max) };
  }
  const text = String(raw || '').trim();
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const single = text.match(/^(\d+)$/);
  if (single) return { min: Number(single[1]), max: Number(single[1]) };
  return { min: min == null ? null : Number(min), max: max == null ? null : Number(max) };
}

export function isWorkingRole(role?: string | null): boolean {
  const r = String(role || '').toLowerCase();
  if (!r) return true;
  return !EXCLUDED_ROLES.has(r);
}

function setTypeOf(set: LoggedSetInput): string {
  return String(set.snapshot_set_type || set.set_type || 'working').toLowerCase();
}

function hasMeaningfulPerformance(set: LoggedSetInput): boolean {
  if (set.completed === true) {
    return !!(parseReps(set.actual_reps) || String(set.actual_duration || '').trim() || String(set.actual_distance || '').trim() || parseLoad(set.actual_weight) != null);
  }
  return !!(parseReps(set.actual_reps) || String(set.actual_duration || '').trim() || String(set.actual_distance || '').trim());
}

export function countWorkingSets(exposure: ExerciseExposureInput): CountedSetResult {
  const excluded = { extras: 0, warmups: 0, ramps: 0, skipped: 0, empty: 0 };
  const counted: CountedWorkingSet[] = [];
  const role = exposure.program_role || exposure.sets?.[0]?.snapshot_program_role;
  if (!isWorkingRole(role)) {
    return { counted, excluded };
  }

  for (const set of exposure.sets || []) {
    if (set.is_deleted) {
      excluded.skipped += 1;
      continue;
    }
    if (set.is_extra_set === true || !set.planned_set_id) {
      if (set.is_extra_set === true) {
        excluded.extras += 1;
        continue;
      }
    }
    const type = setTypeOf(set);
    if (type === 'warmup' || type === 'warm-up' || EXCLUDED_SECTIONS.has(String(set.snapshot_section || '').toLowerCase())) {
      excluded.warmups += 1;
      continue;
    }
    if (type === 'ramp' || type === 'ramp_up' || type === 'specific_ramp') {
      excluded.ramps += 1;
      continue;
    }
    if (EXCLUDED_SET_TYPES.has(type) && type !== 'working') {
      if (type.includes('ramp')) excluded.ramps += 1;
      else excluded.warmups += 1;
      continue;
    }
    if (set.completed === false && !hasMeaningfulPerformance(set)) {
      excluded.skipped += 1;
      continue;
    }
    const reps = parseReps(set.actual_reps);
    if (!hasMeaningfulPerformance(set) || reps == null) {
      excluded.empty += 1;
      continue;
    }
    counted.push({
      reps,
      load: parseLoad(set.actual_weight),
      rir: reportedRirOrUnknown(set.actual_rir),
      side: set.side || null,
      planned_set_id: set.planned_set_id || null,
    });
  }
  return { counted, excluded };
}

export function inferLoadMode(exposure: ExerciseExposureInput, counted: CountedWorkingSet[]): LoadMode {
  if (exposure.load_mode) return exposure.load_mode;
  const equipment = String(exposure.equipment || '').toLowerCase();
  const loads = counted.map((s) => s.load).filter((n): n is number => n != null);
  const maxLoad = loads.length ? Math.max(...loads) : null;
  if (/assist/.test(equipment)) return 'assisted';
  if (maxLoad != null && maxLoad > 0 && (/bodyweight|pull-?up|chin-?up|dip/.test(equipment + ' ' + String(exposure.exercise_name || '').toLowerCase()) || exposure.loadable === true)) {
    return 'weighted_bodyweight';
  }
  if (maxLoad === 0 || (/bodyweight|none|no equipment/.test(equipment) && !(maxLoad != null && maxLoad > 0))) {
    return 'bodyweight';
  }
  if (maxLoad != null && maxLoad > 0) return 'external';
  if (exposure.loadable === false) return 'bodyweight';
  return 'external';
}

export function currentLoadOf(counted: CountedWorkingSet[]): number | null {
  const loads = counted.map((s) => s.load).filter((n): n is number => n != null && n >= 0);
  if (!loads.length) return null;
  const sorted = [...loads].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function prescriptionRange(exposure: ExerciseExposureInput): { min: number | null; max: number | null; targetRir: number | null } {
  const fromSets = (exposure.sets || []).find((s) => s.snapshot_rep_min != null || s.snapshot_rep_max != null || s.snapshot_target_reps);
  const parsed = parseRepRange(
    exposure.prescription?.rep_min != null && exposure.prescription?.rep_max != null
      ? `${exposure.prescription.rep_min}-${exposure.prescription.rep_max}`
      : fromSets?.snapshot_target_reps,
    exposure.prescription?.rep_min ?? fromSets?.snapshot_rep_min,
    exposure.prescription?.rep_max ?? fromSets?.snapshot_rep_max
  );
  const targetRir =
    exposure.prescription?.target_rir ??
    reportedRirOrUnknown(fromSets?.snapshot_target_rir);
  return { min: parsed.min, max: parsed.max, targetRir };
}

export function prescribedWorkingCount(exposure: ExerciseExposureInput, counted: CountedWorkingSet[]): number {
  if (exposure.prescription?.working_set_count != null) return exposure.prescription.working_set_count;
  const planned = new Set(
    (exposure.sets || [])
      .filter((s) => s.planned_set_id && s.is_extra_set !== true && !EXCLUDED_SET_TYPES.has(setTypeOf(s)))
      .map((s) => s.planned_set_id)
  );
  if (planned.size) return planned.size;
  return counted.length;
}
