/** BIQ-0013: Exercise Intelligence Database — enums and helpers for catalog + AI programming */

export const MOVEMENT_PATTERNS = [
  'squat',
  'hinge',
  'push_horizontal',
  'push_vertical',
  'pull_horizontal',
  'pull_vertical',
  'carry',
  'rotation',
  'isolation',
  'cardio',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const TRAINING_GOALS = ['strength', 'hypertrophy', 'endurance', 'power', 'mobility'] as const;
export type TrainingGoal = (typeof TRAINING_GOALS)[number];

export const PROGRESSION_TYPES = ['weight', 'reps', 'duration', 'distance', 'intensity'] as const;
export type ProgressionType = (typeof PROGRESSION_TYPES)[number];

export const ALTERNATIVE_REASONS = [
  'equipment_unavailable',
  'injury',
  'skill_level',
  'preference',
  'similar_stimulus',
] as const;
export type AlternativeReason = (typeof ALTERNATIVE_REASONS)[number];

export type MuscleTarget = {
  muscle: string;
  percentage: number;
  role: 'primary' | 'secondary';
};

export type CoachingMetadata = {
  programming_role?: string;
  fatigue_cost?: 'low' | 'moderate' | 'high';
  skill_demand?: 'low' | 'moderate' | 'high';
  equipment_constraints?: string[];
  substitution_triggers?: string[];
  rep_range_hints?: Partial<Record<TrainingGoal, string>>;
  superset_pairing_hints?: string[];
  coaching_cues?: string[];
  contraindications?: string[];
};

/** Map legacy BIQ-0005 seed patterns to BIQ-0013 movement_pattern values */
const LEGACY_MOVEMENT_MAP: Record<string, MovementPattern> = {
  push: 'push_horizontal',
  pull: 'pull_horizontal',
  squat: 'squat',
  hinge: 'hinge',
  lunge: 'squat',
  carry: 'carry',
  isolation: 'isolation',
  cardio: 'cardio',
  mobility: 'rotation',
  activation: 'isolation',
  stability: 'isolation',
  power: 'squat',
};

export function normalizeMovementPattern(raw?: string | null): MovementPattern | null {
  const v = String(raw || '').toLowerCase().trim();
  if (!v) return null;
  if (MOVEMENT_PATTERNS.includes(v as MovementPattern)) return v as MovementPattern;
  return LEGACY_MOVEMENT_MAP[v] || null;
}

export function parseMuscleTargets(raw: unknown): MuscleTarget[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === 'object' && typeof (t as MuscleTarget).muscle === 'string')
    .map((t) => ({
      muscle: String((t as MuscleTarget).muscle),
      percentage: Math.max(0, Math.min(100, Number((t as MuscleTarget).percentage) || 0)),
      role: (t as MuscleTarget).role === 'secondary' ? 'secondary' : 'primary',
    }));
}

export function volumeFromTargets(targets: MuscleTarget[]) {
  const primary = targets.filter((t) => t.role === 'primary').reduce((n, t) => n + t.percentage, 0);
  const secondary = targets.filter((t) => t.role === 'secondary').reduce((n, t) => n + t.percentage, 0);
  return { primary, secondary };
}

export function parseCoachingMetadata(raw: unknown): CoachingMetadata {
  if (!raw || typeof raw !== 'object') return {};
  return raw as CoachingMetadata;
}
