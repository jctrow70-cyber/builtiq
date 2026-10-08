import { clamp, getScienceRules, isMajorMuscle } from './rules';
import { MUSCLE_IDS, type MuscleId } from './taxonomy';
import type { MusclePriority, PrimaryGoal, TrainingProfile, VolumeTarget } from './types';

/**
 * Preferred weekly volume scales with the goal, the week, and the session.
 * Direct-equivalent credits already count a secondary muscle at a fraction of a
 * primary. These numbers are programming guidelines, not physiological cutoffs.
 */
const GOAL_WEIGHT: Record<PrimaryGoal, number> = {
  hypertrophy: 1,
  strength_hypertrophy: 0.9,
  strength: 0.75,
  athletic_performance: 0.7,
  general_fitness: 0.8,
  fat_loss_support: 0.85,
  muscular_endurance: 0.65,
};

export function musclePriorityOf(muscle: MuscleId, profile: TrainingProfile): MusclePriority {
  if (profile.hardRequirements?.waivedMajorMuscles?.includes(muscle)) return 'maintenance';
  if (profile.priorityMuscles.includes(muscle)) return 'high_priority';
  if (profile.lowPriorityMuscles.includes(muscle)) return 'maintenance';
  return 'normal';
}

export function durationVolumeScale(minutes: number): number {
  if (minutes <= 30) return 0.6;
  if (minutes <= 45) return 0.8;
  if (minutes >= 75) return 1.05;
  return 1;
}

export function frequencyVolumeScale(days: number, goal: PrimaryGoal): number {
  if (days >= 4) return 1;
  if (days === 3) return goal === 'hypertrophy' || goal === 'strength_hypertrophy' ? 0.95 : 0.9;
  if (goal === 'hypertrophy' || goal === 'strength_hypertrophy') return 0.85;
  return 0.75;
}

export function calculateWeeklyVolume(profile: TrainingProfile): VolumeTarget[] {
  const rules = getScienceRules();
  const band = rules.volumeBands[profile.experienceLevel] || rules.volumeBands.intermediate;
  const goal = profile.primaryGoal;
  const minutes = profile.preferredSessionMinutes || 60;
  const days = Math.max(1, profile.trainingDaysPerWeek || 1);
  const recovery = profile.injuryLimitations?.length ? 0.85 : 1;
  const scale = (GOAL_WEIGHT[goal] || 0.8) * durationVolumeScale(minutes) * frequencyVolumeScale(days, goal) * recovery;
  const waived = new Set(profile.hardRequirements?.waivedMajorMuscles || []);

  return MUSCLE_IDS.map((muscle) => {
    const priority = musclePriorityOf(muscle, profile);
    const major = isMajorMuscle(muscle);
    const base = major ? band.major : band.smaller;
    if (waived.has(muscle)) {
      return {
        muscle,
        priority,
        minSets: base.min,
        maxSets: base.max,
        targetSets: 0,
        minimumSets: 0,
        preferredSets: 0,
        practicalMaxSets: 2,
      };
    }
    const weighted = base.start * rules.priorityMultiplier[priority] * scale;
    const minimumSets = minimumUsefulSets(goal, major, priority);
    const practicalMaxSets = Math.max(
      minimumSets,
      Math.min(Math.round(base.max * Math.max(scale, 0.75)), Math.round(Math.max(weighted, minimumSets) * 1.5))
    );
    const preferredSets = clamp(Math.round(weighted), minimumSets, practicalMaxSets);
    return {
      muscle,
      priority,
      minSets: base.min,
      maxSets: base.max,
      targetSets: preferredSets,
      minimumSets,
      preferredSets,
      practicalMaxSets,
    };
  });
}

function minimumUsefulSets(goal: PrimaryGoal, major: boolean, priority: MusclePriority): number {
  if (!major && priority !== 'high_priority') return 0;
  if (goal === 'hypertrophy' || goal === 'strength_hypertrophy' || goal === 'fat_loss_support') return major ? 4 : 2;
  if (goal === 'strength' || goal === 'athletic_performance') return major ? 3 : 2;
  return major ? 3 : 2;
}

export function preferredExposuresPerWeek(weeklySets: number): [number, number] {
  if (weeklySets <= 6) return [1, 2];
  if (weeklySets <= 12) return [2, 2];
  return [2, 3];
}

export function allocateSessionSets(weeklyTarget: number, exposures: number): number[] {
  const days = Math.max(1, exposures);
  if (weeklyTarget <= 0) return Array.from({ length: days }, () => 0);
  const per = weeklyTarget / days;
  const minPer = per < 3 ? 2 : 3;
  const clamped = clamp(Math.round(per), minPer, 8);
  const out = Array.from({ length: days }, () => clamped);
  let sum = out.reduce((a, b) => a + b, 0);
  let i = 0;
  while (sum < weeklyTarget && i < 12) {
    const idx = i % days;
    if (out[idx] < 8) {
      out[idx] += 1;
      sum += 1;
    }
    i += 1;
    if (out.every((n) => n >= 8)) break;
  }
  while (sum > weeklyTarget && out.some((n) => n > minPer)) {
    const idx = out.findIndex((n) => n > minPer);
    if (idx < 0) break;
    out[idx] -= 1;
    sum -= 1;
  }
  return out;
}
