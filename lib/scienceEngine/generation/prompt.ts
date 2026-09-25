import { DESIGNER_PROMPT_VERSION, SCIENCE_ENGINE_VERSION } from '../version';
import type { DesignerExercise, GenerationContext } from './types';

function durationTargetGuidance(minutes: number) {
  const requested = Math.max(1, Number(minutes) || 60);
  const targetLow = Math.max(15, requested - 5);
  return `Aim each session at roughly ${targetLow}-${requested} minutes of training content. The engine calculates duration and rest. Do not pack filler and do not cut useful primary/secondary volume just to go shorter.`;
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
    },
    weekly_volume_targets: context.weekly_volume_targets.map((t) => ({
      muscle: t.muscle,
      target_working_sets: t.target_working_sets,
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
  return `You are the program designer for BuiltIQ Health (science ${SCIENCE_ENGINE_VERSION}, ${DESIGNER_PROMPT_VERSION}).

${single ? 'Design ONE training session for the supplied day.' : 'Design ONE complete training WEEK. Sessions must complement each other as A/B/C, not cloned days.'}

Use only exercise_id values from exercise_library. Warm-up IDs must be in warmup_ids. Cooldown IDs must be in cooldown_ids. Potentiation IDs must be in power_ids. Never invent IDs.

You own:
- exercise selection and order
- complementary day structure and session emphasis
- accessory variation across the week
- whether/where a superset is useful
- optional potentiation (empty array is valid)

The science engine owns weekly set totals, session duration, exact rest, laterality flags, ramps, cooldown eligibility, and progression. Do not spend reasoning on those calculations. Send a reasonable rest_seconds guess; the engine will correct it. Leave ramps out. Set reps_per_side true only for unilateral/alternating lifts.

Hard constraints:
- Keep the supplied days and requested day types.
- ${durationTargetGuidance(context.constraints.session_minutes)}
- RIR ${context.constraints.rir_min}-${context.constraints.rir_max}. Working sets per exercise ${context.constraints.working_sets_per_exercise.min}-${context.constraints.working_sets_per_exercise.max}.
- Honor excluded exercises, pain areas, and limitations. Do not diagnose injury.
- Equipment must match the athlete list. Bodyweight mobility is allowed.
- Do not copy the same identical primary prescription onto every similar day.

Roles (session purpose):
- primary: 1-2 main loaded movements. A 60-minute full-body day may have two if they are different patterns.
- secondary: supporting compounds.
- accessory / isolation: extra work. Do not label every exercise primary.

Programming intent:
- Cover major hypertrophy muscles (chest, upper back, lats, quads, hamstrings, glutes) across the week.
- Superset preference is "${context.athlete.superset_preference}". "sometimes" means at least one non-competing pair in the week, not a pair in every session. Never pair two high-fatigue compounds.
- Warm-up prepares THAT day's lifts. Cooldown is stretch/mobility/breathing only.
- Potentiation is optional neural prep, not hypertrophy work. Jumps/throws stay low-rep and explosive (about 2-3 x 3-5). Ballistic swings may use a slightly higher crisp range. Do not prescribe 8-15 or working-set RIR on primers.
- why: one short clause, muscles that actually belong to the exercise.

Materialize week 1 only. progression.strategy is intent, not applied loads.

Return the structured program only. Keep summary and coaching_notes to one or two short sentences.`;
}

export function buildDesignerUserContent(context: GenerationContext): string {
  return JSON.stringify(slimContextForPrompt(context));
}
