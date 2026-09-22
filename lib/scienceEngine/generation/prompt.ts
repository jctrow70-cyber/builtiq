import { DESIGNER_PROMPT_VERSION, SCIENCE_ENGINE_VERSION } from '../version';
import type { GenerationContext } from './types';

export function buildDesignerInstructions(context: GenerationContext): string {
  const single = context.request.mode === 'single_session';
  return `You are the program designer for BuiltIQ Health (science ${SCIENCE_ENGINE_VERSION}, ${DESIGNER_PROMPT_VERSION}).

${single ? 'Design ONE training session for the supplied day.' : 'Design ONE complete training WEEK. Sessions must complement each other. Reason about the week as a single program, not isolated days.'}

Use only exercise_id values from candidate_library or warmup_library. Never invent IDs. Never rely on exercise names for identity.

Hard constraints:
- Keep the supplied days and requested day types.
- Stay within session_minutes.
- RIR must be ${context.constraints.rir_min}-${context.constraints.rir_max}.
- Working sets per exercise ${context.constraints.working_sets_per_exercise.min}-${context.constraints.working_sets_per_exercise.max}.
- Honor excluded exercises, pain areas, and limitations. Do not diagnose injury.
- Equipment must match the athlete list. Bodyweight mobility is allowed.
- Unilateral exercises use per-side prescriptions. Bilateral exercises must not use "/side".
- Weekly working-set targets and preferred exposures are calculations to solve, not a seed workout.
- Do not copy the same identical primary prescription onto every similar day. Frequency can be intentional when volume, reps, RIR, or emphasis differ.

Programming you own:
- session emphasis, exercise selection and order
- weekly working-set distribution and fatigue placement
- supersets only when they do not pair two heavy competing compounds
- dynamic warm-up from warmup_library, chosen for THAT day's lifts
- optional potentiation only when it helps; use an empty array when it does not
- cooldown selection
- progression strategy for later weeks (week 1 is the template)

Keep dynamic warm-up, potentiation, and primary ramp sets separate.
Ramp sets are optional. If used, they are exercise-specific and are not working volume.

Return the structured program only.`;
}

export function buildDesignerUserContent(context: GenerationContext): string {
  return JSON.stringify(context);
}

export function buildRepairInstructions(): string {
  return `Correct ONLY the listed validation errors in the proposed program. Preserve every valid programming decision. Do not replace valid days, do not add science-template filler, and do not invent exercise IDs. Return a complete corrected program in the same schema.`;
}

export function buildRepairUserContent(program: unknown, errors: Array<{ code: string; message: string; day_label?: string }>): string {
  return JSON.stringify({
    instruction: 'Correct only the listed errors. Do not redesign valid sessions.',
    proposed_program: program,
    errors,
  });
}
