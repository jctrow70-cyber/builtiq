import { isMajorMuscle } from '../rules';
import type { MuscleId } from '../taxonomy';
import type { DesignerExercise, StrengthRole } from './types';

export type MuscleTier = 'major' | 'secondary' | 'minor';

const SECONDARY_HYPERTROPHY: MuscleId[] = [
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
];

const MUSCLE_WORDS: Array<{ token: string; muscle: string }> = [
  { token: 'chest', muscle: 'chest' },
  { token: 'pec', muscle: 'chest' },
  { token: 'upper back', muscle: 'upper_back' },
  { token: 'upper-back', muscle: 'upper_back' },
  { token: 'trap', muscle: 'upper_back' },
  { token: 'lat', muscle: 'lats' },
  { token: 'front delt', muscle: 'front_delts' },
  { token: 'anterior delt', muscle: 'front_delts' },
  { token: 'side delt', muscle: 'side_delts' },
  { token: 'lateral delt', muscle: 'side_delts' },
  { token: 'rear delt', muscle: 'rear_delts' },
  { token: 'posterior delt', muscle: 'rear_delts' },
  { token: 'bicep', muscle: 'biceps' },
  { token: 'tricep', muscle: 'triceps' },
  { token: 'quad', muscle: 'quads' },
  { token: 'hamstring', muscle: 'hamstrings' },
  { token: 'glute', muscle: 'glutes' },
  { token: 'calf', muscle: 'calves' },
  { token: 'calves', muscle: 'calves' },
  { token: 'ab', muscle: 'abs' },
  { token: 'core', muscle: 'abs' },
  { token: 'oblique', muscle: 'obliques' },
];

export function muscleTier(muscle: string, priority: string): MuscleTier {
  if (priority === 'high_priority') return 'major';
  if (priority === 'maintenance') return 'minor';
  if (isMajorMuscle(muscle as MuscleId)) return 'major';
  if (SECONDARY_HYPERTROPHY.includes(muscle as MuscleId)) return 'secondary';
  return 'minor';
}

export function isCooldownEligible(ex: { name: string; program_roles?: string[]; warmup_eligible?: boolean; rawCategory?: string }): boolean {
  const n = String(ex.name || '').toLowerCase();
  const category = String(ex.rawCategory || '').toLowerCase();
  if (/stretch|mobility|breath|child.?s pose|cat.?cow|pigeon|foam roll|world.?s greatest|doorway|easy walk/.test(n)) {
    return true;
  }
  if (/stretch|mobility|cooldown/.test(category)) return true;
  return false;
}

export function isWorkingIsolationAsCooldown(ex: DesignerExercise): boolean {
  if (isCooldownEligible(ex)) return false;
  if (ex.exercise_kind === 'isolation') return true;
  if (ex.program_roles.some((role) => ['primary', 'secondary', 'isolation', 'accessory'].includes(role)) && !ex.warmup_eligible) {
    return true;
  }
  return ex.fatigue_cost !== 'low' && !/stretch|mobility/.test(ex.name.toLowerCase());
}

export function isRampEligible(ex: DesignerExercise, role: StrengthRole, repMax?: number): boolean {
  if (role !== 'primary') return false;
  if (ex.exercise_kind !== 'compound') return false;
  const warmupOnly = ex.warmup_eligible && ex.program_roles.every((r) => r === 'warmup' || r === 'power');
  if (warmupOnly) return false;
  const technical = ex.skill_level === 'medium' || ex.skill_level === 'high';
  const fatiguing = ex.fatigue_cost === 'medium' || ex.fatigue_cost === 'high';
  const intenseEnough = (repMax ?? ex.default_rep_max) <= 12;
  return (technical || fatiguing) && intenseEnough;
}

export function restBand(opts: {
  role: StrengthRole;
  kind: DesignerExercise['exercise_kind'];
  fatigue: DesignerExercise['fatigue_cost'];
  repMax: number;
  goal: string;
  inSuperset: boolean;
}): { min: number; max: number; compromiseBelow: number } {
  const goal = opts.goal.toLowerCase();
  const strengthBias = /strength|power|athletic/.test(goal);
  const heavyPrimary = opts.role === 'primary' && opts.kind === 'compound' && opts.fatigue === 'high';
  const lowReps = opts.repMax <= 6;
  if (heavyPrimary && (strengthBias || lowReps)) {
    return { min: 180, max: 300, compromiseBelow: 150 };
  }
  if (heavyPrimary) {
    return { min: 150, max: 240, compromiseBelow: 120 };
  }
  if (opts.role === 'primary' && opts.kind === 'compound') {
    return { min: 120, max: 210, compromiseBelow: 90 };
  }
  if (opts.kind === 'compound' && opts.fatigue === 'high') {
    return { min: 120, max: 210, compromiseBelow: 75 };
  }
  if (opts.inSuperset) {
    return { min: 45, max: 150, compromiseBelow: 30 };
  }
  if (opts.kind === 'isolation' || opts.role === 'isolation') {
    return { min: 45, max: 120, compromiseBelow: 30 };
  }
  return { min: 75, max: 180, compromiseBelow: 45 };
}

export function musclesMentionedInWhy(why: string): string[] {
  const text = ` ${String(why || '').toLowerCase()} `;
  const found: string[] = [];
  [...MUSCLE_WORDS]
    .sort((a, b) => b.token.length - a.token.length)
    .forEach((row) => {
      const token = row.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`[^a-z]${token}s?[^a-z]`);
      if (pattern.test(text) && !found.includes(row.muscle)) found.push(row.muscle);
    });
  return found;
}

export function whyAgreesWithExercise(why: string, ex: DesignerExercise): boolean {
  const mentioned = musclesMentionedInWhy(why);
  if (!mentioned.length) return true;
  const allowed = new Set([...ex.primary_muscles, ...ex.secondary_muscles]);
  return mentioned.every((muscle) => allowed.has(muscle));
}

export function inferFallbackFatigue(
  name: string,
  exerciseType: 'compound' | 'isolation',
  programRoles: string[]
): 'low' | 'medium' | 'high' {
  const n = name.toLowerCase();
  if (programRoles.includes('warmup') || programRoles.includes('power')) return 'low';
  if (exerciseType === 'isolation' || /plank|pallof/.test(n)) return 'low';
  if (
    /back squat|front squat|conventional deadlift|trap bar deadlift|barbell bench|overhead press|barbell row|romanian deadlift|hip thrust|bulgarian|walking lunge|pull-?up|chin-?up|chest dip/.test(
      n
    )
  ) {
    return 'high';
  }
  return 'medium';
}
