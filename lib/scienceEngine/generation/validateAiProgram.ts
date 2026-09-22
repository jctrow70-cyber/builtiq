import { creditSets, contributionsForExercise } from '../contributions';
import { estimateWorkoutMinutes } from '../duration';
import type { CatalogExercise } from '../types';
import type { MuscleId } from '../taxonomy';
import { findDesignerById } from './matchById';
import type {
  AiStrengthExercise,
  AiWeekProgram,
  AiWorkoutPlan,
  DesignerExercise,
  GenerationContext,
  ValidationIssue,
  ValidationResult,
} from './types';

const HEAVY_PATTERNS = new Set(['squat', 'hinge', 'horizontal_push', 'vertical_push', 'horizontal_pull']);

export function validateAiProgram(
  program: AiWeekProgram | null,
  context: GenerationContext,
  catalogById: Map<string, CatalogExercise>
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!program || !Array.isArray(program.workouts) || !program.workouts.length) {
    return { ok: false, issues: [err('EMPTY_PROGRAM', 'The model did not return a usable week.')] };
  }

  const library = new Map<string, DesignerExercise>();
  [...context.candidate_library, ...context.warmup_library].forEach((ex) => library.set(ex.exercise_id, ex));
  const excludedNames = new Set(context.athlete.excluded_exercise_names.map((n) => n.toLowerCase()));
  const excludedIds = new Set(context.athlete.excluded_exercise_ids);
  const week1 = program.workouts;
  const profileLike = {
    primaryGoal: context.athlete.primary_goal,
    preferredSessionMinutes: context.constraints.session_minutes,
    experienceLevel: context.athlete.experience_level,
  };

  week1.forEach((workout) => {
    validateWorkout(workout, context, library, catalogById, excludedNames, excludedIds, issues);
  });

  validatePrimaryFrequency(week1, library, context, issues);
  validateWeeklyVolume(week1, library, catalogById, context, issues);
  validatePatternCoverage(week1, library, issues);

  return { ok: issues.every((i) => i.severity !== 'error'), issues };
}

function validateWorkout(
  workout: AiWorkoutPlan,
  context: GenerationContext,
  library: Map<string, DesignerExercise>,
  catalogById: Map<string, CatalogExercise>,
  excludedNames: Set<string>,
  excludedIds: Set<string>,
  issues: ValidationIssue[]
) {
  const addon = isAddon(workout, context);
  const strength = flattenStrength(workout);
  const used = new Set<string>();

  const checkItem = (item: { exercise_id: string; prescription?: string }, kind: 'warmup' | 'potentiation' | 'cooldown' | 'strength') => {
    const hit = findDesignerById(library, item.exercise_id);
    if (!hit) {
      issues.push(err('UNKNOWN_EXERCISE_ID', `Unknown exercise_id ${item.exercise_id}`, workout.day_label, item.exercise_id));
      return null;
    }
    if (excludedIds.has(hit.exercise_id) || excludedNames.has(hit.name.toLowerCase())) {
      issues.push(err('EXCLUDED_EXERCISE', `${hit.name} is excluded`, workout.day_label, hit.exercise_id));
    }
    if (context.constraints.equipment_must_match && !equipmentAllowed(hit, context.athlete.equipment)) {
      issues.push(err('EQUIPMENT_MISMATCH', `${hit.name} needs unavailable equipment`, workout.day_label, hit.exercise_id));
    }
    if (hitsContraindication(hit, context)) {
      issues.push(err('CONTRAINDICATION', `${hit.name} conflicts with a listed limitation`, workout.day_label, hit.exercise_id));
    }
    if (kind === 'warmup' && !hit.warmup_eligible) {
      issues.push(err('WARMUP_NOT_ELIGIBLE', `${hit.name} is not a warm-up movement`, workout.day_label, hit.exercise_id));
    }
    if (kind === 'potentiation' && !hit.power_eligible) {
      issues.push(err('PRIMER_NOT_ELIGIBLE', `${hit.name} is not power-eligible`, workout.day_label, hit.exercise_id));
    }
    if (item.prescription && /\/side/i.test(item.prescription) && hit.laterality === 'bilateral') {
      issues.push(err('LATERALITY_MISMATCH', `${hit.name} is bilateral and cannot be prescribed /side`, workout.day_label, hit.exercise_id));
    }
    used.add(hit.exercise_id);
    return hit;
  };

  workout.warmup.forEach((item) => checkItem(item, 'warmup'));
  workout.potentiation.forEach((item) => checkItem(item, 'potentiation'));
  workout.cooldown.forEach((item) => checkItem(item, 'cooldown'));

  strength.forEach((ex) => {
    const hit = checkItem(ex, 'strength');
    if (!hit) return;
    if (ex.working_sets < 1 || ex.working_sets > 6) {
      issues.push(err('INVALID_SETS', `${hit.name} has ${ex.working_sets} working sets`, workout.day_label, hit.exercise_id));
    }
    if (ex.rep_min < 1 || ex.rep_max < ex.rep_min) {
      issues.push(err('INVALID_REPS', `${hit.name} has an invalid rep range`, workout.day_label, hit.exercise_id));
    }
    if (ex.target_rir < 0 || ex.target_rir > 4) {
      issues.push(err('INVALID_RIR', `${hit.name} has RIR ${ex.target_rir}`, workout.day_label, hit.exercise_id));
    }
    if (ex.reps_per_side && hit.laterality === 'bilateral') {
      issues.push(err('LATERALITY_MISMATCH', `${hit.name} is bilateral and cannot use per-side reps`, workout.day_label, hit.exercise_id));
    }
    if (!ex.reps_per_side && hit.laterality === 'unilateral') {
      issues.push(warn('LATERALITY_MISMATCH', `${hit.name} is unilateral but was not marked per side`, workout.day_label, hit.exercise_id));
    }
    if (ex.measurement_type !== hit.measurement_type && hit.measurement_type !== 'reps') {
      issues.push(err('MEASUREMENT_MISMATCH', `${hit.name} should use ${hit.measurement_type}`, workout.day_label, hit.exercise_id));
    }
    if (ex.ramp_sets.length && ex.role !== 'primary') {
      issues.push(warn('RAMP_ON_ACCESSORY', `Ramp sets on ${hit.name} are unusual`, workout.day_label, hit.exercise_id));
    }
  });

  workout.strength.forEach((block) => {
    if (block.type !== 'straight_sets') validateSuperset(block.exercises, library, workout.day_label, issues);
  });

  const families = strength.map((ex) => movementFamily(library.get(ex.exercise_id)?.name || ''));
  if (families.filter((f) => f === 'deadlift').length > 1) {
    issues.push(err('SESSION_REDUNDANCY', `${workout.name} stacks more than one deadlift variation`, workout.day_label));
  }

  const isolationFirst = strength[0] && strength[0].role === 'isolation';
  if (isolationFirst && strength.some((ex) => ex.role === 'primary')) {
    issues.push(warn('ORDER', `${workout.name} starts with isolation before a primary`, workout.day_label));
  }

  if (!addon) validateStimulus(workout, strength, library, context, catalogById, issues);
}

function validateSuperset(
  exercises: AiStrengthExercise[],
  library: Map<string, DesignerExercise>,
  day: string,
  issues: ValidationIssue[]
) {
  if (exercises.length < 2) return;
  const items = exercises.map((ex) => ({ ex, meta: library.get(ex.exercise_id) })).filter((row) => row.meta);
  const heavy = items.filter((row) => isHeavyCompound(row.meta!));
  if (heavy.length >= 2) {
    issues.push(
      err(
        'SUPERSET_HEAVY_PAIR',
        `Heavy compounds ${heavy.map((h) => h.meta!.name).join(' + ')} should not share a superset`,
        day
      )
    );
    return;
  }
  const primary = items.find((row) => row.ex.role === 'primary');
  if (primary && heavy.includes(primary)) {
    const partner = items.find((row) => row !== primary);
    if (partner && competesWithPrimary(primary.meta!, partner.meta!)) {
      issues.push(
        err(
          'SUPERSET_PRIMARY',
          `${primary.meta!.name} is paired with a competing ${partner.meta!.name}`,
          day,
          primary.ex.exercise_id
        )
      );
    }
  }
}

function validateStimulus(
  workout: AiWorkoutPlan,
  strength: AiStrengthExercise[],
  library: Map<string, DesignerExercise>,
  context: GenerationContext,
  catalogById: Map<string, CatalogExercise>,
  issues: ValidationIssue[]
) {
  const minutes = context.constraints.session_minutes;
  const workingSets = strength.reduce((sum, ex) => sum + ex.working_sets, 0);
  const patterns = new Set(strength.map((ex) => library.get(ex.exercise_id)?.movement_pattern).filter(Boolean));
  const estimated = estimateFromPlan(workout, catalogById);
  const goal = context.athlete.primary_goal;
  const fullBody = requestedType(workout, context) === 'Full Body';

  const weakSets = workingSets < 6;
  const weakCoverage = fullBody && minutes >= 50 && patterns.size < 3;
  const farUnderTime = minutes >= 55 && estimated > 0 && estimated < Math.max(28, minutes * 0.45);
  const noPrimary = !strength.some((ex) => ex.role === 'primary') && requestedType(workout, context) !== 'Mobility';

  if ((weakSets && strength.length < 3) || (weakCoverage && workingSets < 8) || noPrimary) {
    issues.push(
      err(
        'INSUFFICIENT_STIMULUS',
        `${workout.name} does not provide enough training stimulus for a ${minutes}-minute ${goal} session (${strength.length} lifts, ${workingSets} working sets, ${patterns.size} patterns).`,
        workout.day_label
      )
    );
  } else if (farUnderTime || (minutes >= 55 && workingSets < 8 && fullBody)) {
    issues.push(
      warn(
        'DURATION_UNDER',
        `${workout.name} may be light for a ${minutes}-minute session (${workingSets} working sets, ~${estimated} min).`,
        workout.day_label
      )
    );
  }
  if (estimated > minutes + 15) {
    issues.push(err('DURATION_OVER', `${workout.name} is estimated at ${estimated} min vs ${minutes}`, workout.day_label));
  }
}

function validatePrimaryFrequency(
  workouts: AiWorkoutPlan[],
  library: Map<string, DesignerExercise>,
  context: GenerationContext,
  issues: ValidationIssue[]
) {
  const fullBody = workouts.filter((w) => requestedType(w, context) === 'Full Body');
  if (fullBody.length < 2) return;
  const byPrimary = new Map<string, Array<{ workout: AiWorkoutPlan; ex: AiStrengthExercise }>>();
  fullBody.forEach((workout) => {
    flattenStrength(workout)
      .filter((ex) => ex.role === 'primary')
      .forEach((ex) => {
        const list = byPrimary.get(ex.exercise_id) || [];
        list.push({ workout, ex });
        byPrimary.set(ex.exercise_id, list);
      });
  });

  byPrimary.forEach((rows, id) => {
    const name = library.get(id)?.name || id;
    if (rows.length >= 3 && fullBody.length >= 3) {
      if (justifiedFrequency(context)) {
        issues.push(warn('PRIMARY_FREQUENCY', `${name} appears on all ${rows.length} full-body days; keep this only if the frequency strategy stays intentional.`));
      } else {
        issues.push(err('PRIMARY_CLONE', `${name} is the primary on all ${rows.length} full-body days without a specialization or frequency justification.`));
      }
      return;
    }
    if (rows.length === 2) {
      const same = prescriptionsMatch(rows[0].ex, rows[1].ex) && rows[0].workout.emphasis === rows[1].workout.emphasis;
      const heavy = library.get(id)?.fatigue_cost === 'high';
      const weeklySets = rows.reduce((sum, row) => sum + row.ex.working_sets, 0);
      if (same && heavy && weeklySets >= 10) {
        issues.push(err('PRIMARY_CLONE', `${name} is copied with the same prescription on two days and the weekly dose is excessive (${weeklySets} working sets).`));
      } else if (same) {
        issues.push(warn('PRIMARY_DUPLICATE', `${name} repeats on two days with essentially the same prescription.`));
      } else {
        issues.push(info('PRIMARY_FREQUENCY', `${name} appears twice with different volume, reps, RIR, or emphasis.`));
      }
    }
  });
}

function validateWeeklyVolume(
  workouts: AiWorkoutPlan[],
  library: Map<string, DesignerExercise>,
  catalogById: Map<string, CatalogExercise>,
  context: GenerationContext,
  issues: ValidationIssue[]
) {
  const credits: Record<string, number> = {};
  workouts.forEach((workout) => {
    flattenStrength(workout).forEach((ex) => {
      const catalog = catalogById.get(ex.exercise_id);
      const designer = library.get(ex.exercise_id);
      if (!catalog && !designer) return;
      const row = catalog || {
        name: designer!.name,
        primaryMuscles: designer!.primary_muscles as MuscleId[],
        secondaryMuscles: designer!.secondary_muscles as MuscleId[],
      };
      const gained = creditSets(contributionsForExercise(row as CatalogExercise), ex.working_sets);
      Object.entries(gained).forEach(([muscle, value]) => {
        credits[muscle] = (credits[muscle] || 0) + value;
      });
    });
  });

  context.weekly_volume_targets.forEach((target) => {
    const got = credits[target.muscle] || 0;
    if (target.priority === 'high_priority' && got < 1) {
      issues.push(err('VOLUME_OFF', `High-priority ${target.muscle} has no working-set credit.`));
      return;
    }
    if (target.priority === 'high_priority' && got < target.target_working_sets * 0.5) {
      issues.push(warn('VOLUME_OFF', `${target.muscle} working sets (${got}) are well below the ${target.target_working_sets} target.`));
    } else if (Math.abs(got - target.target_working_sets) > target.target_working_sets * 0.35 && target.priority !== 'maintenance') {
      issues.push(info('VOLUME_OFF', `${target.muscle} planned ${got} vs target ${target.target_working_sets}.`));
    }
  });
}

function validatePatternCoverage(workouts: AiWorkoutPlan[], library: Map<string, DesignerExercise>, issues: ValidationIssue[]) {
  if (workouts.length < 3) return;
  const patterns = new Set(
    workouts.flatMap((w) => flattenStrength(w).map((ex) => library.get(ex.exercise_id)?.movement_pattern || ''))
  );
  ['squat', 'hinge', 'horizontal_push', 'horizontal_pull'].forEach((need) => {
    const hit =
      patterns.has(need) ||
      (need === 'squat' && patterns.has('lunge')) ||
      Array.from(patterns).some((p) => p.includes(need.replace('_', '')));
    if (!hit) issues.push(warn('PATTERN_GAP', `The week is light on ${need.replace('_', ' ')} work.`));
  });
}

function flattenStrength(workout: AiWorkoutPlan): AiStrengthExercise[] {
  return (workout.strength || []).flatMap((block) => block.exercises || []);
}

function requestedType(workout: AiWorkoutPlan, context: GenerationContext): string {
  return context.schedule.days.find((d) => d.day_label === workout.day_label)?.requested_type || workout.name;
}

function isAddon(workout: AiWorkoutPlan, context: GenerationContext): boolean {
  const type = requestedType(workout, context);
  return type === 'Cardio' || type === 'Mobility';
}

function equipmentAllowed(ex: DesignerExercise, available: string[]): boolean {
  if (!available.length) return true;
  if (ex.equipment.some((e) => ['bodyweight', 'none', ''].includes(e.toLowerCase()))) return true;
  const have = available.map((e) => e.toLowerCase());
  if (have.includes('full_gym')) return true;
  return ex.equipment.some((e) => have.some((h) => h.includes(e.toLowerCase()) || e.toLowerCase().includes(h)));
}

function hitsContraindication(ex: DesignerExercise, context: GenerationContext): boolean {
  const hay = [...ex.contraindications, ...context.athlete.pain_areas, ...context.athlete.limitations].join(' ').toLowerCase();
  return ex.contraindications.some((c) => {
    const token = c.toLowerCase();
    return context.athlete.pain_areas.some((p) => p.toLowerCase().includes(token) || token.includes(p.toLowerCase())) ||
      context.athlete.limitations.some((p) => p.toLowerCase().includes(token) || token.includes(p.toLowerCase()));
  }) || (hay.includes('knee') && /lunge|pistol/.test(ex.name.toLowerCase()) && context.athlete.limitations.some((l) => /knee/i.test(l)));
}

function isHeavyCompound(ex: DesignerExercise): boolean {
  return ex.exercise_kind === 'compound' && ex.fatigue_cost !== 'low' && HEAVY_PATTERNS.has(ex.movement_pattern);
}

function competesWithPrimary(primary: DesignerExercise, other: DesignerExercise): boolean {
  if (other.fatigue_cost === 'low' && other.exercise_kind === 'isolation') return false;
  if (other.warmup_eligible && other.fatigue_cost === 'low') return false;
  const shared = primary.primary_muscles.some((m) => other.primary_muscles.includes(m));
  const axial = ['squat', 'hinge'].includes(primary.movement_pattern) && ['squat', 'hinge', 'horizontal_pull'].includes(other.movement_pattern);
  return (shared && other.fatigue_cost !== 'low') || (axial && other.exercise_kind === 'compound');
}

function movementFamily(name: string): string {
  const n = name.toLowerCase();
  if (/\bdeadlift\b|\brdl\b/.test(n)) return 'deadlift';
  if (/bench press|chest press/.test(n)) return 'flat_press';
  return '';
}

function prescriptionsMatch(a: AiStrengthExercise, b: AiStrengthExercise): boolean {
  return a.working_sets === b.working_sets && a.rep_min === b.rep_min && a.rep_max === b.rep_max && a.target_rir === b.target_rir;
}

function justifiedFrequency(context: GenerationContext): boolean {
  const text = `${context.athlete.notes} ${context.athlete.primary_goal} ${context.request.user_request}`.toLowerCase();
  return /specializ|frequency|3x|three times|every session|every day|high frequency/.test(text);
}

function estimateFromPlan(workout: AiWorkoutPlan, catalogById: Map<string, CatalogExercise>): number {
  const exercises = flattenStrength(workout).map((ex) => ({
    name: catalogById.get(ex.exercise_id)?.name || ex.exercise_id,
    sets: ex.working_sets,
    restSeconds: ex.rest_seconds || 90,
    role: ex.role,
    muscleGroup: '',
    primaryMuscles: [],
    movementPattern: 'other',
    repMin: ex.rep_min,
    repMax: ex.rep_max,
    targetRir: ex.target_rir,
    loadIncrement: 5,
  }));
  return estimateWorkoutMinutes({
    warmupItems: workout.warmup.map((w) => ({ name: w.exercise_id, category: 'activation', reps: w.prescription, sets: w.sets || 1 })),
    potentiation: workout.potentiation.map((p) => ({
      name: p.exercise_id,
      sets: p.sets || 1,
      restSeconds: 45,
      role: 'power',
      muscleGroup: '',
      primaryMuscles: [],
      movementPattern: 'other',
      repMin: 3,
      repMax: 5,
      targetRir: 5,
      loadIncrement: 0,
    })),
    rampCount: flattenStrength(workout).reduce((sum, ex) => sum + (ex.ramp_sets?.length || 0), 0),
    exercises: exercises as any,
  });
}

function err(code: string, message: string, day_label?: string, exercise_id?: string): ValidationIssue {
  return { code, severity: 'error', message, day_label, exercise_id };
}
function warn(code: string, message: string, day_label?: string, exercise_id?: string): ValidationIssue {
  return { code, severity: 'warning', message, day_label, exercise_id };
}
function info(code: string, message: string, day_label?: string, exercise_id?: string): ValidationIssue {
  return { code, severity: 'info', message, day_label, exercise_id };
}

export function workingSetCreditsForTests(
  program: AiWeekProgram,
  catalogById: Map<string, CatalogExercise>
): Record<string, number> {
  const credits: Record<string, number> = {};
  program.workouts.forEach((workout) => {
    flattenStrength(workout).forEach((ex) => {
      const catalog = catalogById.get(ex.exercise_id);
      if (!catalog) return;
      const gained = creditSets(contributionsForExercise(catalog), ex.working_sets);
      Object.entries(gained).forEach(([muscle, value]) => {
        credits[muscle] = (credits[muscle] || 0) + value;
      });
    });
  });
  return credits;
}
