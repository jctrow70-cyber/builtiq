import type { ScienceProgram, ValidationIssue, ValidationResult } from './types';

export function validateProgramQuality(program: ScienceProgram): ValidationResult {
  const issues: ValidationIssue[] = [];
  const week1 = program.workouts.filter((w) => w.week === 1);
  const fullBody = week1.filter((w) => w.workoutType === 'Full Body');

  if (fullBody.length >= 2) {
    for (let i = 0; i < fullBody.length; i += 1) {
      for (let j = i + 1; j < fullBody.length; j += 1) {
        const a = new Set(fullBody[i].exercises.map((e) => e.name.toLowerCase()));
        const b = fullBody[j].exercises.map((e) => e.name.toLowerCase());
        const overlap = b.filter((n) => a.has(n)).length;
        if (overlap >= Math.max(3, Math.ceil(b.length * 0.6))) {
          issues.push(warn('WEEK_DUPLICATION', `${fullBody[i].name} and ${fullBody[j].name} repeat too many of the same lifts.`));
        }
        const warmA = new Set(fullBody[i].warmup.map((w) => w.name.toLowerCase()));
        const warmB = fullBody[j].warmup.map((w) => w.name.toLowerCase());
        const warmOverlap = warmB.filter((n) => warmA.has(n)).length;
        if (warmB.length && warmOverlap === warmB.length) {
          issues.push(warn('WARMUP_CLONE', `${fullBody[i].name} and ${fullBody[j].name} use the same warm-up.`));
        }
      }
    }
  }

  week1.forEach((workout) => {
    const primaries = workout.exercises.filter((ex) => ex.role === 'primary');
    primaries.forEach((ex) => {
      if (ex.supersetGroupId && /squat|deadlift|bench press/i.test(ex.name)) {
        issues.push(warn('PRIMARY_SUPERSET', `${ex.name} on ${workout.name} should not be in a heavy-compound superset.`));
      }
    });
    if (workout.exercises.length < 3) {
      issues.push(err('THIN_SESSION', `${workout.name} has too few working exercises.`));
    }
  });

  return { ok: issues.every((i) => i.severity !== 'error'), issues };
}

function err(code: string, message: string): ValidationIssue {
  return { code, message, severity: 'error' };
}
function warn(code: string, message: string): ValidationIssue {
  return { code, message, severity: 'warning' };
}
