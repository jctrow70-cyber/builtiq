import type { ExercisePrescription, ProgressionResult, ScienceWorkout } from './types';

export function explainProgression(result: ProgressionResult, exerciseName: string, nextLoad?: number): string {
  if (result.decision === 'PROGRESS_LOAD') {
    return `${exerciseName}: you reached the top of your prescribed rep range on all working sets while maintaining the target effort, so BuiltIQ ${nextLoad ? `increased the load to ${nextLoad} lb` : 'increased the load'}.`;
  }
  if (result.decision === 'PROGRESS_REPS') {
    return `${exerciseName}: sets stayed in range, so the load is unchanged. Keep adding reps until you hit the top of the range.`;
  }
  if (result.decision === 'MAINTAIN') {
    return result.reason;
  }
  return result.reason;
}

export function explainWarmup(workout: ScienceWorkout): string {
  const muscles = workout.exercises.flatMap((ex) => ex.primaryMuscles).filter((m, i, arr) => arr.indexOf(m) === i);
  const muscleText = muscles.slice(0, 4).map((m) => m.replace('_', ' ')).join(', ') || 'the muscles trained today';
  return `Today's warm-up prepares ${muscleText} through dynamic movement before transitioning into explosive preparation for your first major lift.`;
}

export function explainPowerPrimer(workout: ScienceWorkout): string {
  const primer = workout.potentiation[0];
  if (!primer) return 'Power Primer is off for this session.';
  return `This short explosive movement (${primer.name}) prepares your nervous system for the force and speed demands of ${workout.rampFor || 'the first major lift'} without creating significant fatigue.`;
}

export function explainIsolationSets(ex: ExercisePrescription, indirectNote?: string): string {
  if (indirectNote) return indirectNote;
  return `${ex.name} uses ${ex.sets} sets to finish the remaining weekly target for ${ex.primaryMuscles[0]?.replace('_', ' ') || 'this muscle'}.`;
}
