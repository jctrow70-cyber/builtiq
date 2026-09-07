import type { ScienceProgram, TrainingProfile, ValidationIssue, ValidationResult } from './types';
import { preferredExposuresPerWeek } from './volume';

export function validateProgram(program: ScienceProgram, profile: TrainingProfile): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!program.workouts.length) issues.push(err('NO_WORKOUTS', 'Program has no workouts.'));
  if (!program.scienceVersion) issues.push(err('VERSION', 'Science version is missing.'));

  const week1 = program.workouts.filter((w) => w.week === 1);
  if (week1.length !== program.split.length) {
    issues.push(err('SPLIT_MISMATCH', 'Week 1 workouts do not match the generated split.'));
  }

  week1.forEach((workout) => {
    if (!workout.exercises.length) issues.push(err('EMPTY_STRENGTH', `${workout.dayLabel} has no working exercises.`));
    if (workout.estimatedMinutes > (profile.preferredSessionMinutes || 60) + 15) {
      issues.push(warn('DURATION', `${workout.name} may exceed the ${profile.preferredSessionMinutes} minute cap.`));
    }
    if (profile.warmupStyle !== 'minimal' && workout.warmup.length < 3) {
      issues.push(err('WARMUP', `${workout.name} warm-up is too thin for a dynamic preparation block.`));
    }
    if (profile.potentiationPreference !== 'off' && workout.exercises.some((ex) => ex.role === 'primary') && !workout.potentiation.length) {
      issues.push(warn('PRIMER', `${workout.name} is missing a Power Primer.`));
    }
    const families = workout.exercises.map((ex) => pressFamily(ex.name)).filter(Boolean);
    if (families.filter((f) => f === 'flat_press').length > 1) {
      issues.push(warn('REDUNDANCY', `${workout.name} repeats similar pressing patterns.`));
    }
    workout.exercises.forEach((ex) => {
      if (ex.sets < 1 || ex.sets > 6) issues.push(err('SETS', `${ex.name} has an invalid set count.`));
      if (ex.repMin > ex.repMax) issues.push(err('REPS', `${ex.name} has an inverted rep range.`));
      if (ex.targetRir < 0 || ex.targetRir > 5) issues.push(err('RIR', `${ex.name} has an invalid RIR.`));
      if (profile.excludedExercises.some((n) => n.toLowerCase() === ex.name.toLowerCase())) {
        issues.push(err('RESTRICTED', `${ex.name} is excluded by the user profile.`));
      }
    });
  });

  program.volumeTargets.forEach((target) => {
    const exposures = program.split.filter((d) => d.targetMuscles.includes(target.muscle)).length;
    const [minExp] = preferredExposuresPerWeek(target.targetSets);
    if (target.priority === 'high_priority' && exposures < minExp) {
      issues.push(warn('FREQUENCY', `${target.muscle} may need another weekly exposure to distribute ${target.targetSets} sets.`));
    }
  });

  return { ok: issues.every((i) => i.severity !== 'error'), issues };
}

export function validateAIResponse(ai: { workouts?: any[] }, science: ScienceProgram): ValidationResult {
  const issues: ValidationIssue[] = [];
  const allowedNames = new Set(
    science.workouts.flatMap((w) => [...w.exercises, ...w.potentiation].map((ex) => ex.name.toLowerCase()))
  );
  const allowedIds = new Set(
    science.workouts.flatMap((w) => [...w.exercises, ...w.potentiation].map((ex) => String(ex.exerciseId || '').toLowerCase()).filter(Boolean))
  );
  (ai.workouts || []).forEach((workout: any) => {
    (workout.exercises || []).forEach((ex: any) => {
      const id = String(ex.exercise_id || '').toLowerCase();
      const name = String(ex.name || '').toLowerCase();
      if (id && !allowedIds.has(id) && name && !allowedNames.has(name)) {
        issues.push(err('UNKNOWN_EXERCISE', `AI selected an exercise that is not in the science prescription: ${ex.exercise_id || ex.name}`));
      }
      if (ex.target_rir != null && (Number(ex.target_rir) < 0 || Number(ex.target_rir) > 5)) {
        issues.push(err('RIR', `Invalid AI RIR for ${ex.name || ex.exercise_id}`));
      }
    });
  });
  return { ok: issues.every((i) => i.severity !== 'error'), issues };
}

function pressFamily(name: string): string {
  const n = String(name || '').toLowerCase();
  if (/bench press|chest press/.test(n) && !/incline/.test(n)) return 'flat_press';
  return '';
}

function err(code: string, message: string): ValidationIssue {
  return { code, message, severity: 'error' };
}
function warn(code: string, message: string): ValidationIssue {
  return { code, message, severity: 'warning' };
}
