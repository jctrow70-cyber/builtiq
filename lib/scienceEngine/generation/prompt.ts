import { DESIGNER_PROMPT_VERSION, SCIENCE_ENGINE_VERSION } from '../version';
import type { DesignerExercise, GenerationContext } from './types';

function durationTargetGuidance(minutes: number) {
  const requested = Math.max(1, Number(minutes) || 60);
  const targetLow = Math.max(15, requested - 5);
  return `The ${requested}-minute request is a time budget, not a target to fill. About ${targetLow}-${requested} minutes is plenty when the work is meaningful. Do not pack filler, and do not drop useful primary or secondary work only to finish early.`;
}

export type PromptExercise = {
  exercise_id: string;
  name: string;
  movement_pattern: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string[];
  laterality: string;
  measurement_type: string;
  exercise_kind: string;
  program_roles: string[];
  fatigue_cost: string;
  skill_level: string;
  warmup_eligible: boolean;
  cooldown_eligible: boolean;
  power_eligible: boolean;
  contraindications?: string[];
};

export function toPromptExercise(ex: DesignerExercise): PromptExercise {
  const row: PromptExercise = {
    exercise_id: ex.exercise_id,
    name: ex.name,
    movement_pattern: ex.movement_pattern,
    primary_muscles: ex.primary_muscles,
    secondary_muscles: ex.secondary_muscles,
    equipment: ex.equipment,
    laterality: ex.laterality,
    measurement_type: ex.measurement_type,
    exercise_kind: ex.exercise_kind,
    program_roles: ex.program_roles,
    fatigue_cost: ex.fatigue_cost,
    skill_level: ex.skill_level,
    warmup_eligible: ex.warmup_eligible,
    cooldown_eligible: ex.cooldown_eligible,
    power_eligible: ex.power_eligible,
  };
  if (ex.contraindications.length) row.contraindications = ex.contraindications;
  return row;
}

export function slimContextForPrompt(context: GenerationContext) {
  const byId = new Map<string, DesignerExercise>();
  [...context.candidate_library, ...context.warmup_library, ...(context.cooldown_library || [])].forEach((ex) => {
    byId.set(ex.exercise_id, ex);
  });
  const library = Array.from(byId.values());
  return {
    schema_version: context.schema_version,
    request: context.request,
    athlete: context.athlete,
    schedule: context.schedule,
    constraints: {
      session_minutes: context.constraints.session_minutes,
      rir_min: context.constraints.rir_min,
      rir_max: context.constraints.rir_max,
      working_sets_per_exercise: context.constraints.working_sets_per_exercise,
      typical_strength_moves: context.constraints.typical_strength_moves,
      laterality_rule: context.constraints.laterality_rule,
      equipment_must_match: context.constraints.equipment_must_match,
      no_medical_diagnosis: true,
      warmup_minutes: context.constraints.warmup_minutes,
      dynamic_warmup_exercises: context.constraints.dynamic_warmup_exercises,
    },
    hard_requirements: {
      identical_days: context.hard_requirements.identicalDays,
      upper_push: context.hard_requirements.upperPush,
      lower_pull: context.hard_requirements.lowerPull,
      required_muscles: context.hard_requirements.requiredMuscles,
      waived_major_muscles: context.hard_requirements.waivedMajorMuscles,
      extended_warmup: context.hard_requirements.extendedWarmup,
    },
    weekly_volume_targets: context.weekly_volume_targets.map((t) => ({
      muscle: t.muscle,
      minimum_working_sets: t.minimum_working_sets,
      target_working_sets: t.target_working_sets,
      practical_max_sets: t.practical_max_sets,
      priority: t.priority,
    })),
    ...(context.recent_training.lifts.length ? { recent_training: context.recent_training } : {}),
    exercise_library: library.map(toPromptExercise),
    warmup_ids: context.warmup_library.map((ex) => ex.exercise_id),
    cooldown_ids: (context.cooldown_library || []).map((ex) => ex.exercise_id),
    power_ids: library.filter((ex) => ex.power_eligible).map((ex) => ex.exercise_id),
  };
}

export function buildDesignerInstructions(context: GenerationContext): string {
  const single = context.request.mode === 'single_session';
  const hard = context.hard_requirements;
  const identical = Boolean(hard?.identicalDays) && !single;
  const warmup = context.constraints.dynamic_warmup_exercises || { min: 2, max: 4 };
  const opener = single
    ? 'Design ONE training session for the supplied day.'
    : identical
      ? 'Design ONE training session and repeat that same session on every supplied day. Identical workouts are required.'
      : 'Design ONE complete training WEEK. Sessions must complement each other as A/B/C, not cloned days.';
  const cloneRule = identical
    ? '- Repeat the same exercise_ids, sets, reps, RIR, warm-up, potentiation, and emphasis on every requested day. Day labels stay different.'
    : '- Do not copy the same identical primary prescription onto every similar day.';
  const emphasisBits = [
    hard?.upperPush ? 'upper-body push (chest, pressing, triceps)' : '',
    hard?.lowerPull ? 'lower-body pull (hamstrings, glutes, hinge)' : '',
  ].filter(Boolean);
  const emphasisRule = emphasisBits.length
    ? `- Hard emphasis: ${emphasisBits.join('; ')}. Keep that emphasis. Major muscles outside it are optional this week.`
    : '';
  const warmupBand = context.constraints.warmup_minutes;
  const pref = String(context.athlete.superset_preference || 'sometimes').toLowerCase();
  const supersetRule = /frequent|often|always/.test(pref)
    ? 'Supersets frequently: pair non-competing accessories when it helps. Leave demanding primaries as straight sets. Do not circuit the whole session.'
    : /rare|minimal|never|off/.test(pref)
      ? 'Supersets minimal: use a pair only when it clearly helps. Most work stays straight sets.'
      : 'Supersets sometimes: one or two compatible pairs in the week is enough. Do not pair every session. Never pair two high-fatigue compounds.';
  return `You are the program designer for BuiltIQ Health (science ${SCIENCE_ENGINE_VERSION}, ${DESIGNER_PROMPT_VERSION}).

${opener}

Use only exercise_id values from exercise_library. Warm-up IDs must be in warmup_ids. Cooldown IDs must be in cooldown_ids. Potentiation IDs must be in power_ids. Never invent IDs. An empty potentiation array is valid.

You propose the week: exercise selection and order, session emphasis, working sets, rep ranges, RIR, rest_seconds, warm-up, power primers when they fit, superset pairings, accessories, and how the days balance. Prefer recognizable exercises. Change a lift only when the week, the goal, or recovery needs a different pattern.

The engine validates safety, equipment, limitations, the requested days, feasibility, and programming quality. It keeps a valid prescription that differs from a template. It corrects ineligible exercises, unsafe rest, and broken structure. It applies lift-specific ramp-up sets. Leave ramp sets out of this response. Set reps_per_side true only for unilateral or alternating lifts.

${goalGuidance(context.athlete.primary_goal)}

${balanceGuidance(hard)}
${identical ? 'This request wants the same workout on each day. Repeat it.' : 'Use a different emphasis on each day when that serves the goal.'}

Volume: minimum_working_sets is the useful floor, target_working_sets is preferred, practical_max_sets is an advisory ceiling. Preferred targets are not mandatory minimums. A small indirect-credit overage is acceptable. Do not add redundant patterns just to hit a number.

Duration: ${durationTargetGuidance(context.constraints.session_minutes)} Count working sets, rest, warm-up, primers, and supersets. Do not add filler to use leftover minutes.

Hard constraints:
- Keep the supplied days and requested day types. Do not override equipment, limitations, or explicit schedule.
- RIR ${context.constraints.rir_min}-${context.constraints.rir_max}. Working sets per exercise ${context.constraints.working_sets_per_exercise.min}-${context.constraints.working_sets_per_exercise.max}.
- Honor excluded exercises, pain areas, and limitations. Do not diagnose injury.
- Equipment must match the athlete list. Bodyweight mobility is allowed.
${cloneRule}
${emphasisRule}
- ${supersetRule}
- Dynamic warm-up: ${warmup.min}-${warmup.max} unique exercises from warmup_ids that prepare THIS day's joints and patterns. No duplicate exercise_ids. Warm-up time target is ${warmupBand.min}-${warmupBand.max} minutes. ${hard?.extendedWarmup ? 'An extended warm-up was requested, so the top of that range is allowed.' : 'Do not pad the warm-up.'} ${identical ? 'The repeated day uses that same warm-up.' : 'Different training days should not share one generic warm-up.'} Dynamic warm-up, power primer, and ramp-up sets are different components.
- Power primers are optional explosive prep (jump, throw, swing), about 2-3 x 3-5, or a short ballistic swing. Do not put a normal squat, press, or row in potentiation. Omit the primer when none fits the experience, equipment, or goal. Do not add a power exercise to every athletic session.
- Cooldown is stretch, mobility, or breathing only.
- why: one short clause, muscles that actually belong to the exercise.

Roles: primary is 1-2 main lifts of different patterns. secondary supports them. accessory and isolation are extra work.

Materialize week 1 only. progression.strategy is intent, not applied loads.

Return the structured program only. Keep summary and coaching_notes to one or two short sentences.`;
}

function balanceGuidance(hard: GenerationContext['hard_requirements']): string {
  if (hard?.upperPush || hard?.lowerPull) {
    const lines = [
      'This request is specialized. Prioritize the hard emphasis. Do not add the opposite pattern just to balance the week.',
    ];
    if (hard.upperPush) {
      lines.push('Upper-body pulling is optional. Do not add rows, pulldowns, or pull-ups merely because a general program would include them.');
    }
    if (hard.lowerPull) {
      lines.push('Quad-dominant squats and lunges are optional. Do not add them merely to balance a hinge emphasis.');
      lines.push('Hamstring priority needs a hamstring-biased hinge, such as a Romanian deadlift, stiff-leg deadlift, or leg curl. A conventional or trap-bar deadlift is a different stimulus and does not replace that work. A hip thrust supports glutes; it does not replace hamstring work.');
    }
    lines.push('A de-emphasized muscle may be absent, or it may appear as a small accessory. It should not take the session time that the requested priorities need.');
    return lines.join(' ');
  }
  return 'Design the week together. Spread knee-dominant work, hip-dominant work, horizontal push, vertical push, horizontal pull, vertical pull, some unilateral work, accessories, and core across the days. Not every pattern belongs in every session. Keep primary lifts stable enough to progress. Do not vary exercises at random.';
}

function goalGuidance(goal: string): string {
  const value = String(goal || '').toLowerCase();
  if (value === 'hypertrophy' || value === 'strength_hypertrophy' || value === 'fat_loss_support') {
    return 'Goal hypertrophy: working-set volume, exercise choice, and recovery matter. Aim near the preferred targets when the session has time, and stay inside the practical maximum.';
  }
  if (value === 'strength') {
    return 'Goal strength: high-quality primary lifts, strength rep ranges, enough rest to repeat the set, and the same primaries long enough to overload.';
  }
  if (value === 'athletic_performance') {
    return 'Goal athletic performance: strength, power when it fits, unilateral work, movement quality, and fatigue management. Power work is a choice, not a requirement on every day.';
  }
  if (value === 'muscular_endurance') {
    return 'Goal endurance: develop the relevant endurance quality. Do not add strength volume the session does not need.';
  }
  return 'Goal general fitness: balanced, recognizable, sustainable training. Cover the main patterns across the week without maximizing volume.';
}

export function buildDesignerUserContent(context: GenerationContext): string {
  return JSON.stringify(slimContextForPrompt(context));
}
