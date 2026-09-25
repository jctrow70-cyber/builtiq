import { creditSets, contributionsForExercise } from '../contributions';
import { classifySessionDuration, estimateSessionFromAi } from '../duration';
import { goalUsesHypertrophyBias } from '../rules';
import type { CatalogExercise } from '../types';
import type { MuscleId } from '../taxonomy';
import { findDesignerById } from './matchById';
import {
  isWorkingIsolationAsCooldown,
  muscleTier,
  restBand,
  whyAgreesWithExercise,
} from './qualityRules';
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
  [...context.candidate_library, ...context.warmup_library, ...(context.cooldown_library || [])].forEach((ex) =>
    library.set(ex.exercise_id, ex)
  );
  const excludedNames = new Set(context.athlete.excluded_exercise_names.map((n) => n.toLowerCase()));
  const excludedIds = new Set(context.athlete.excluded_exercise_ids);
  const week1 = program.workouts;

  week1.forEach((workout) => {
    validateWorkout(workout, context, library, catalogById, excludedNames, excludedIds, issues);
  });

  validatePrimaryFrequency(week1, library, context, issues);
  validateWeeklyVolume(week1, library, catalogById, context, issues);
  validatePatternCoverage(week1, library, context, issues);
  validateSupersetPreference(week1, context, issues);

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

  const checkItem = (item: { exercise_id: string; prescription?: string; why?: string }, kind: 'warmup' | 'potentiation' | 'cooldown' | 'strength') => {
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
    if (kind === 'cooldown' && (isWorkingIsolationAsCooldown(hit) || !hit.cooldown_eligible)) {
      issues.push(
        err(
          'COOLDOWN_NOT_ELIGIBLE',
          `${hit.name} is not a cooldown movement. Use a stretch or easy mobility drill.`,
          workout.day_label,
          hit.exercise_id
        )
      );
    }
    if (item.prescription && /\/side/i.test(item.prescription) && hit.laterality === 'bilateral') {
      issues.push(err('LATERALITY_MISMATCH', `${hit.name} is bilateral and cannot be prescribed /side`, workout.day_label, hit.exercise_id));
    }
    if (item.why && !whyAgreesWithExercise(item.why, hit)) {
      issues.push(
        warn(
          'WHY_MISMATCH',
          `${hit.name} why ("${item.why}") does not match its muscles (${[...hit.primary_muscles, ...hit.secondary_muscles].join(', ') || 'none listed'}).`,
          workout.day_label,
          hit.exercise_id
        )
      );
    }
    used.add(hit.exercise_id);
    return hit;
  };

  workout.warmup.forEach((item) => checkItem(item, 'warmup'));
  workout.potentiation.forEach((item) => checkItem(item, 'potentiation'));
  workout.cooldown.forEach((item) => checkItem(item, 'cooldown'));

  const supersetIds = new Set(
    workout.strength
      .filter((block) => block.type !== 'straight_sets' && block.exercises.length >= 2)
      .flatMap((block) => block.exercises.map((ex) => ex.exercise_id))
  );

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
    if ((ex.ramp_sets?.length || 0) && ex.role !== 'primary') {
      issues.push(warn('RAMP_ON_ACCESSORY', `Ramp sets on ${hit.name} are unusual`, workout.day_label, hit.exercise_id));
    }
    if (ex.why && !whyAgreesWithExercise(ex.why, hit)) {
      issues.push(
        warn(
          'WHY_MISMATCH',
          `${hit.name} why ("${ex.why}") does not match its muscles.`,
          workout.day_label,
          hit.exercise_id
        )
      );
    }
    validateRest(ex, hit, context.athlete.primary_goal, supersetIds.has(ex.exercise_id), workout.day_label, issues);
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

  validateRoles(workout, strength, library, context, issues);
  validateSessionFatigue(workout, strength, library, issues);

  if (!addon) validateStimulus(workout, strength, library, context, issues);
}

function validateRoles(
  workout: AiWorkoutPlan,
  strength: AiStrengthExercise[],
  library: Map<string, DesignerExercise>,
  context: GenerationContext,
  issues: ValidationIssue[]
) {
  if (!strength.length) return;
  const primaries = strength.filter((ex) => ex.role === 'primary');
  const minutes = context.constraints.session_minutes;
  if (strength.length >= 4 && primaries.length === strength.length) {
    issues.push(
      err(
        'ROLE_ALL_PRIMARY',
        `${workout.name} labels every working exercise primary. Roles must reflect session purpose.`,
        workout.day_label
      )
    );
  } else if (primaries.length >= 4 && minutes <= 75) {
    issues.push(
      warn(
        'ROLE_TOO_MANY_PRIMARY',
        `${workout.name} has ${primaries.length} primaries. A typical session has 1-2 main lifts.`,
        workout.day_label
      )
    );
  }

  strength.forEach((ex) => {
    const meta = library.get(ex.exercise_id);
    if (!meta) return;
    if (ex.role === 'primary' && meta.exercise_kind === 'isolation') {
      issues.push(
        warn(
          'ROLE_ISOLATION_PRIMARY',
          `${meta.name} is an isolation movement labeled primary.`,
          workout.day_label,
          ex.exercise_id
        )
      );
    }
    if (ex.role === 'isolation' && meta.exercise_kind === 'compound' && meta.fatigue_cost === 'high') {
      issues.push(
        warn(
          'ROLE_COMPOUND_ISOLATION',
          `${meta.name} is a high-fatigue compound labeled isolation.`,
          workout.day_label,
          ex.exercise_id
        )
      );
    }
  });
}

function validateRest(
  ex: AiStrengthExercise,
  meta: DesignerExercise,
  goal: string,
  inSuperset: boolean,
  day: string,
  issues: ValidationIssue[]
) {
  const band = restBand({
    role: ex.role,
    kind: meta.exercise_kind,
    fatigue: meta.fatigue_cost,
    repMax: ex.rep_max,
    goal,
    inSuperset,
  });
  if (ex.rest_seconds < band.compromiseBelow) {
    issues.push(
      err(
        'REST_TOO_SHORT',
        `${meta.name} rests ${ex.rest_seconds}s; ${ex.role} ${meta.fatigue_cost}-fatigue ${meta.exercise_kind} work is likely to lose performance below ${band.compromiseBelow}s.`,
        day,
        ex.exercise_id
      )
    );
  } else if (ex.rest_seconds < band.min) {
    issues.push(
      warn(
        'REST_TOO_SHORT',
        `${meta.name} rests ${ex.rest_seconds}s; ${ex.role} ${meta.exercise_kind} work usually needs ${band.min}-${band.max}s.`,
        day,
        ex.exercise_id
      )
    );
  }
}

function validateSessionFatigue(
  workout: AiWorkoutPlan,
  strength: AiStrengthExercise[],
  library: Map<string, DesignerExercise>,
  issues: ValidationIssue[]
) {
  if (strength.length < 4) return;
  const high = strength.filter((ex) => library.get(ex.exercise_id)?.fatigue_cost === 'high');
  if (high.length === strength.length) {
    issues.push(
      err(
        'SESSION_FATIGUE',
        `${workout.name} selects high-fatigue movements for every working exercise.`,
        workout.day_label
      )
    );
  } else if (high.length / strength.length >= 0.75) {
    issues.push(
      warn(
        'SESSION_FATIGUE',
        `${workout.name} is ${high.length}/${strength.length} high-fatigue selections.`,
        workout.day_label
      )
    );
  }
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
  issues: ValidationIssue[]
) {
  const minutes = context.constraints.session_minutes;
  const workingSets = strength.reduce((sum, ex) => sum + ex.working_sets, 0);
  const patterns = new Set(strength.map((ex) => library.get(ex.exercise_id)?.movement_pattern).filter(Boolean));
  const estimated = estimateSessionFromAi(workout, library);
  const goal = context.athlete.primary_goal;
  const fullBody = requestedType(workout, context) === 'Full Body';

  const weakSets = workingSets < 6;
  const weakCoverage = fullBody && minutes >= 50 && patterns.size < 3;
  const noPrimary = !strength.some((ex) => ex.role === 'primary') && requestedType(workout, context) !== 'Mobility';
  const durationFit = classifySessionDuration(estimated, minutes);

  if ((weakSets && strength.length < 3) || (weakCoverage && workingSets < 8) || noPrimary) {
    issues.push(
      err(
        'INSUFFICIENT_STIMULUS',
        `${workout.name} does not provide enough training stimulus for a ${minutes}-minute ${goal} session (${strength.length} lifts, ${workingSets} working sets, ${patterns.size} patterns).`,
        workout.day_label
      )
    );
  } else if (minutes >= 55 && workingSets < 8 && fullBody) {
    issues.push(
      warn(
        'DURATION_UNDER',
        `${workout.name} may be light for a ${minutes}-minute session (${workingSets} working sets, ~${estimated} min).`,
        workout.day_label
      )
    );
  }
  if (durationFit.over === 'error') {
    issues.push(err('DURATION_OVER', `${workout.name} is estimated at ${estimated} min vs ${minutes}`, workout.day_label));
  } else if (durationFit.over === 'warning') {
    issues.push(warn('DURATION_OVER', `${workout.name} is estimated at ${estimated} min vs ${minutes}`, workout.day_label));
  } else if (durationFit.under === 'warning' && estimated > 0 && !weakSets) {
    issues.push(
      warn(
        'DURATION_UNDER',
        `${workout.name} is estimated at ${estimated} min vs ${minutes}. That can be fine if stimulus is enough; do not add filler.`,
        workout.day_label
      )
    );
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

  const hypertrophy = goalUsesHypertrophyBias(context.athlete.primary_goal as any);
  context.weekly_volume_targets.forEach((target) => {
    const got = credits[target.muscle] || 0;
    const ratio = target.target_working_sets > 0 ? got / target.target_working_sets : 1;
    const tier = muscleTier(target.muscle, target.priority);
    const over = ratio > 1.6;

    if (tier === 'major') {
      if (got < 1) {
        issues.push(err('VOLUME_OFF', `Major hypertrophy target ${target.muscle} has no meaningful working-set credit.`));
      } else if (hypertrophy && ratio < 0.5) {
        issues.push(err('VOLUME_OFF', `${target.muscle} working sets (${got}) are severely below the ${target.target_working_sets} target.`));
      } else if (ratio < 0.7 || over) {
        issues.push(warn('VOLUME_OFF', `${target.muscle} working sets (${got}) vs target ${target.target_working_sets}.`));
      } else if (ratio < 0.85 || ratio > 1.25) {
        issues.push(info('VOLUME_OFF', `${target.muscle} planned ${got} vs target ${target.target_working_sets}.`));
      }
      return;
    }

    if (tier === 'secondary') {
      if (got < 1 && hypertrophy) {
        issues.push(warn('VOLUME_OFF', `Secondary hypertrophy muscle ${target.muscle} has no direct/meaningful stimulus.`));
      } else if (ratio < 0.4 && target.priority !== 'maintenance') {
        issues.push(warn('VOLUME_OFF', `${target.muscle} working sets (${got}) are well below the ${target.target_working_sets} target.`));
      } else if (ratio < 0.65 || over) {
        issues.push(info('VOLUME_OFF', `${target.muscle} planned ${got} vs target ${target.target_working_sets}.`));
      }
      return;
    }

    if (target.priority === 'high_priority' && got < 1) {
      issues.push(warn('VOLUME_OFF', `Priority ${target.muscle} has no working-set credit.`));
    } else if (got < 1) {
      issues.push(info('VOLUME_OFF', `Optional ${target.muscle} has no direct work; indirect stimulus may be enough.`));
    }
  });
}

function validatePatternCoverage(
  workouts: AiWorkoutPlan[],
  library: Map<string, DesignerExercise>,
  context: GenerationContext,
  issues: ValidationIssue[]
) {
  if (workouts.length < 3) return;
  const counts: Record<string, number> = {};
  workouts.forEach((w) => {
    flattenStrength(w).forEach((ex) => {
      const pattern = library.get(ex.exercise_id)?.movement_pattern;
      if (!pattern) return;
      counts[pattern] = (counts[pattern] || 0) + 1;
    });
  });
  const squat = (counts.squat || 0) + (counts.lunge || 0);
  const hinge = counts.hinge || 0;
  // Hypertrophy pressing is contextual: horizontal/incline plus delt isolation can cover
  // push without a vertical_push / overhead press. Do not checklist every pattern.
  const push = (counts.horizontal_push || 0) + (counts.vertical_push || 0);
  const pull = (counts.horizontal_pull || 0) + (counts.vertical_pull || 0);
  const hypertrophy = goalUsesHypertrophyBias(context.athlete.primary_goal as any);
  const fullBody = context.schedule.days.filter((d) => d.requested_type === 'Full Body').length >= 3;

  if (hypertrophy && fullBody) {
    if (!squat) issues.push(err('PATTERN_GAP', 'The week has no squat or lunge pattern.'));
    if (!hinge) issues.push(err('PATTERN_GAP', 'The week has no hinge pattern.'));
    if (!push) issues.push(err('PATTERN_GAP', 'The week has no push pattern.'));
    if (!pull) issues.push(err('PATTERN_GAP', 'The week has no pull pattern.'));
  } else {
    ['squat', 'hinge', 'horizontal_push', 'horizontal_pull'].forEach((need) => {
      const hit =
        (counts[need] || 0) > 0 ||
        (need === 'squat' && (counts.lunge || 0) > 0);
      if (!hit) issues.push(warn('PATTERN_GAP', `The week is light on ${need.replace('_', ' ')} work.`));
    });
  }

  if (push >= 3 && pull > 0 && push / pull >= 2.5) {
    issues.push(warn('PATTERN_IMBALANCE', `Push exposures (${push}) far exceed pull exposures (${pull}).`));
  }
  if (pull >= 3 && push > 0 && pull / push >= 2.5) {
    issues.push(warn('PATTERN_IMBALANCE', `Pull exposures (${pull}) far exceed push exposures (${push}).`));
  }
  Object.entries(counts).forEach(([pattern, count]) => {
    if (count >= 4 && ['horizontal_push', 'horizontal_pull', 'squat', 'hinge'].includes(pattern)) {
      issues.push(warn('PATTERN_REDUNDANCY', `${pattern.replace('_', ' ')} appears ${count} times; check whether that redundancy is intentional.`));
    }
  });
}

function validateSupersetPreference(workouts: AiWorkoutPlan[], context: GenerationContext, issues: ValidationIssue[]) {
  const pref = String(context.athlete.superset_preference || '').toLowerCase();
  const hasSuperset = workouts.some((w) =>
    (w.strength || []).some((block) => block.type !== 'straight_sets' && (block.exercises || []).length >= 2)
  );
  if (/sometimes|often|always|yes/.test(pref) && !hasSuperset) {
    issues.push(
      warn(
        'SUPERSET_PREF',
        `Superset preference is "${context.athlete.superset_preference}" but the week contains no supersets.`
      )
    );
  }
  if (/never|none|^no$/.test(pref) && hasSuperset) {
    issues.push(warn('SUPERSET_PREF', `Superset preference is "${context.athlete.superset_preference}" but the week includes supersets.`));
  }
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
