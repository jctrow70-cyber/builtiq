import { trimForDuration } from './duration';
import type { ScienceProgram, TrainingProfile, ValidationIssue } from './types';

const SOFT_SEED_CODES = new Set([
  'DURATION',
  'DURATION_OVER',
  'VOLUME_OFF',
  'PRIMER',
  'FREQUENCY',
  'WARMUP',
  'REDUNDANCY',
]);

/** Template duration/volume issues must not block a feasible AI request. */
export function scienceSeedBlocksAi(issues: ValidationIssue[]): ValidationIssue[] {
  return (issues || []).filter((issue) => issue.severity === 'error' && !SOFT_SEED_CODES.has(issue.code));
}

/** Trim the fallback template toward the requested clock when that is possible. */
export function makeScienceFallbackFeasible(
  program: ScienceProgram,
  profile: TrainingProfile
): ScienceProgram {
  const week1 = program.workouts
    .filter((workout) => workout.week === 1)
    .map((workout) => trimForDuration(workout, profile));
  if (!week1.length) return program;
  const workouts = program.workouts.map((workout) => {
    const template = week1.find((row) => row.dayLabel === workout.dayLabel) || week1[0];
    return {
      ...template,
      week: workout.week,
      exercises: template.exercises.map((ex) => ({ ...ex })),
      warmup: template.warmup.map((item) => ({ ...item })),
      potentiation: template.potentiation.map((ex) => ({ ...ex })),
      cooldown: (template.cooldown || []).map((item) => ({ ...item })),
    };
  });
  return { ...program, workouts };
}
