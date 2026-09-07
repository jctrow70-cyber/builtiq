import { clamp, getScienceRules, isMajorMuscle } from './rules';
import { MUSCLE_IDS, type MuscleId } from './taxonomy';
import type { MusclePriority, TrainingProfile, VolumeTarget } from './types';

export function musclePriorityOf(muscle: MuscleId, profile: TrainingProfile): MusclePriority {
  if (profile.priorityMuscles.includes(muscle)) return 'high_priority';
  if (profile.lowPriorityMuscles.includes(muscle)) return 'maintenance';
  return 'normal';
}

export function calculateWeeklyVolume(profile: TrainingProfile): VolumeTarget[] {
  const rules = getScienceRules();
  const band = rules.volumeBands[profile.experienceLevel] || rules.volumeBands.intermediate;

  return MUSCLE_IDS.map((muscle) => {
    const priority = musclePriorityOf(muscle, profile);
    const base = isMajorMuscle(muscle) ? band.major : band.smaller;
    const multiplied = base.start * rules.priorityMultiplier[priority];
    const targetSets = clamp(Math.round(multiplied), Math.max(2, Math.round(base.min * 0.5)), Math.round(base.max * 1.25));
    return {
      muscle,
      priority,
      minSets: base.min,
      maxSets: base.max,
      targetSets,
    };
  });
}

export function preferredExposuresPerWeek(weeklySets: number): [number, number] {
  if (weeklySets <= 6) return [1, 2];
  if (weeklySets <= 12) return [2, 2];
  return [2, 3];
}

export function allocateSessionSets(weeklyTarget: number, exposures: number): number[] {
  const days = Math.max(1, exposures);
  const per = weeklyTarget / days;
  const clamped = clamp(per, 3, 8);
  const base = Math.round(clamped);
  const out = Array.from({ length: days }, () => base);
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
  while (sum > weeklyTarget && out.some((n) => n > 3)) {
    const idx = out.findIndex((n) => n > 3);
    if (idx < 0) break;
    out[idx] -= 1;
    sum -= 1;
  }
  return out;
}
