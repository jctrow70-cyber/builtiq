import { getScienceRules, goalUsesStrengthBias } from './rules';
import type { CatalogExercise, ExercisePrescription, PrimaryGoal, ProgramRole, TrainingProfile } from './types';

export function repRangeFor(role: ProgramRole, goal: PrimaryGoal, exercise: CatalogExercise): { min: number; max: number } {
  if (goal === 'strength') {
    if (role === 'primary') return { min: 3, max: 6 };
    if (role === 'secondary') return { min: 5, max: 10 };
    return { min: 8, max: 15 };
  }
  if (goal === 'strength_hypertrophy') {
    if (role === 'primary') return { min: 3, max: 6 };
    if (role === 'secondary') return { min: 6, max: 10 };
    return { min: 8, max: 15 };
  }
  if (goal === 'hypertrophy' || goal === 'fat_loss_support') {
    if (role === 'primary') return { min: 5, max: 10 };
    if (role === 'secondary') return { min: 6, max: 12 };
    if (role === 'isolation') return { min: 8, max: 15 };
    return { min: 8, max: 15 };
  }
  if (goal === 'muscular_endurance') return { min: 12, max: 20 };
  if (goal === 'athletic_performance') {
    if (role === 'primary') return { min: 3, max: 6 };
    if (role === 'power') return { min: 2, max: 5 };
    return { min: 6, max: 12 };
  }
  return { min: Math.max(6, exercise.defaultRepMin), max: Math.min(15, exercise.defaultRepMax || 15) };
}

export function hypertrophyPrimaryPressRange(): { min: number; max: number } {
  return { min: 6, max: 8 };
}

export function targetRirFor(role: ProgramRole, profile: TrainingProfile): number {
  const rules = getScienceRules();
  const band = rules.rirByExperience[profile.experienceLevel];
  if (role === 'power' || role === 'warmup') return 5;
  if (goalUsesStrengthBias(profile.primaryGoal) && role === 'primary') return band.strengthCompound;
  if (role === 'isolation') return band.isolation;
  return band.compound;
}

export function restSecondsFor(role: ProgramRole, profile: TrainingProfile, exercise: CatalogExercise): number {
  const rules = getScienceRules();
  if (role === 'power') return 60;
  if (role === 'warmup') return 20;
  if (role === 'primary' && (goalUsesStrengthBias(profile.primaryGoal) || exercise.fatigueCost === 'high')) {
    return rules.restSeconds.heavyCompound[0];
  }
  if (role === 'isolation' || exercise.exerciseType === 'isolation') return rules.restSeconds.isolation[0];
  return rules.restSeconds.moderateCompound[0];
}

export function loadIncrementFor(exercise: CatalogExercise): number {
  const rules = getScienceRules();
  const lower = ['squat', 'hinge', 'lunge', 'knee_flexion'].includes(exercise.movementPattern);
  return lower ? rules.loadIncrement.lowerCompound : rules.loadIncrement.upperCompound;
}

export function prescribeExercise(opts: {
  exercise: CatalogExercise;
  role: ProgramRole;
  profile: TrainingProfile;
  sets: number;
  preferPressRange?: boolean;
  why?: string;
}): ExercisePrescription {
  const { exercise, role, profile, sets, preferPressRange, why } = opts;
  let range = repRangeFor(role, profile.primaryGoal, exercise);
  if (preferPressRange && profile.primaryGoal === 'hypertrophy' && role === 'primary') {
    range = hypertrophyPrimaryPressRange();
  }
  const rir = targetRirFor(role, profile);
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    role,
    muscleGroup: exercise.primaryMuscles[0] || 'muscle',
    primaryMuscles: exercise.primaryMuscles,
    movementPattern: exercise.movementPattern,
    sets: Math.max(1, sets),
    repMin: range.min,
    repMax: range.max,
    targetRir: rir,
    restSeconds: restSecondsFor(role, profile, exercise),
    loadIncrement: loadIncrementFor(exercise),
    why,
  };
}

export function rirToRpe(rir: number): string {
  const rpe = Math.max(5, Math.min(10, 10 - rir));
  return String(rpe);
}
