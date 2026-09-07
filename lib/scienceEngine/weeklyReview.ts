import { getScienceRules } from './rules';
import type { MuscleVolumeDecision, TrainingProfile, VolumeTarget, WeeklyReview } from './types';
import { evaluateProgression, type ProgressionResult } from './progression';
import type { MuscleId } from './taxonomy';

export function reviewTrainingWeek(input: {
  profile: TrainingProfile;
  volumeTargets: VolumeTarget[];
  prescribedWorkouts: number;
  completedWorkouts: number;
  exerciseResults: ProgressionResult[];
  sessionDifficulty?: number[];
  energy?: number[];
  soreness?: number[];
}): WeeklyReview {
  const adherence = input.prescribedWorkouts > 0 ? input.completedWorkouts / input.prescribedWorkouts : 0;
  const progressing = input.exerciseResults.filter((r) => r.decision === 'PROGRESS_LOAD' || r.decision === 'PROGRESS_REPS').length;
  const stalled = input.exerciseResults.filter((r) => r.decision === 'EVALUATE_UNDERPERFORMANCE').length;
  const hardSessions = (input.sessionDifficulty || []).filter((n) => n >= 9).length;
  const lowEnergy = (input.energy || []).filter((n) => n <= 2).length;
  const highSoreness = (input.soreness || []).filter((n) => n >= 4).length;

  let status: WeeklyReview['status'] = 'maintain';
  const reasons: string[] = [];
  if (adherence < 0.6 && input.prescribedWorkouts >= 2) {
    status = 'low_adherence';
    reasons.push('Fewer than 60% of prescribed workouts were completed. Adjust the schedule before changing training stress.');
  } else if (stalled >= 2 && (hardSessions >= 2 || lowEnergy >= 2 || highSoreness >= 2)) {
    status = 'fatigue_detected';
    reasons.push('Performance declined on multiple lifts while recovery indicators were also poor.');
  } else if (progressing > 0 && stalled === 0) {
    status = 'progressing';
    reasons.push('Performance is improving at the current training dose.');
  } else if (stalled >= 2) {
    status = 'stalled';
    reasons.push('Several lifts stopped progressing.');
  }

  const deloadRecommended = status === 'fatigue_detected';
  const volumeAdjustments = input.volumeTargets.map((target) =>
    muscleVolumeDecision(target.muscle, target.targetSets, status)
  );

  return {
    status,
    prescribedWorkouts: input.prescribedWorkouts,
    completedWorkouts: input.completedWorkouts,
    exerciseAdjustments: input.exerciseResults,
    volumeAdjustments,
    deloadRecommended,
    reasons,
  };
}

function muscleVolumeDecision(
  muscle: MuscleId,
  currentSets: number,
  status: WeeklyReview['status']
): { muscle: MuscleId; decision: MuscleVolumeDecision; currentSets: number; nextWeekSets: number; reason: string } {
  const rules = getScienceRules();
  if (status === 'progressing') {
    return {
      muscle,
      decision: 'MAINTAIN_VOLUME',
      currentSets,
      nextWeekSets: currentSets,
      reason: 'Performance is improving at the current training dose.',
    };
  }
  if (status === 'fatigue_detected') {
    const next = Math.max(2, Math.round(currentSets * (1 - rules.volumeReducePercent[0])));
    return {
      muscle,
      decision: 'DECREASE_VOLUME',
      currentSets,
      nextWeekSets: next,
      reason: 'Recovery and performance trends support a temporary volume reduction.',
    };
  }
  if (status === 'stalled') {
    const next = currentSets + rules.volumeIncreaseSets[0];
    return {
      muscle,
      decision: 'INCREASE_VOLUME',
      currentSets,
      nextWeekSets: next,
      reason: 'Performance stalled after the current workload was tolerated.',
    };
  }
  return {
    muscle,
    decision: 'MAINTAIN_VOLUME',
    currentSets,
    nextWeekSets: currentSets,
    reason: 'No clear trend supports changing weekly volume.',
  };
}

export { evaluateProgression };
