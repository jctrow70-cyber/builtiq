import type { ExercisePrescription, ScienceWorkout, TrainingProfile, WarmupItem } from './types';

const SET_SECONDS = 35;
const TRANSITION_SECONDS = 25;

export function estimateWorkoutMinutes(opts: {
  warmupItems: WarmupItem[];
  potentiation: ExercisePrescription[];
  rampCount: number;
  exercises: ExercisePrescription[];
}): number {
  const warmup = opts.warmupItems.reduce((sum, item) => sum + item.sets * 20, 90);
  const primer = opts.potentiation.reduce((sum, ex) => sum + ex.sets * (20 + (ex.restSeconds || 45)), 60);
  const ramp = opts.rampCount * 40;
  const work = opts.exercises.reduce((sum, ex) => sum + ex.sets * (SET_SECONDS + (ex.restSeconds || 90) + TRANSITION_SECONDS), 0);
  return Math.round((warmup + primer + ramp + work) / 60);
}

export function trimForDuration(workout: ScienceWorkout, profile: TrainingProfile): ScienceWorkout {
  const limit = profile.preferredSessionMinutes || 60;
  let next = { ...workout, exercises: workout.exercises.slice() };
  next.estimatedMinutes = estimateWorkoutMinutes({
    warmupItems: next.warmup,
    potentiation: next.potentiation,
    rampCount: next.rampSets.length,
    exercises: next.exercises,
  });

  while (next.estimatedMinutes > limit + 8 && next.exercises.length > 4) {
    const idx = next.exercises.map((ex, i) => ({ ex, i })).reverse().find((row) => row.ex.role === 'isolation' || row.ex.role === 'accessory')?.i;
    if (idx == null) break;
    next.exercises.splice(idx, 1);
    next.estimatedMinutes = estimateWorkoutMinutes({
      warmupItems: next.warmup,
      potentiation: next.potentiation,
      rampCount: next.rampSets.length,
      exercises: next.exercises,
    });
  }
  return next;
}
