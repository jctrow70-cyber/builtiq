import { DESIGNER_PROMPT_VERSION, SCIENCE_ENGINE_VERSION } from '../version';
import type { GenerationRun } from './types';

export function sanitizeGenerationInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const cloned = JSON.parse(JSON.stringify(input));
  if (cloned.athlete) {
    delete cloned.athlete.email;
    if (cloned.athlete.sex) cloned.athlete.sex = cloned.athlete.sex ? '[set]' : null;
    if (cloned.athlete.age != null) cloned.athlete.age = '[set]';
  }
  return cloned;
}

export async function persistGenerationRun(
  supabase: any,
  userId: string | null,
  programId: string | null,
  run: GenerationRun
): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('st_generation_runs')
      .insert({
        program_id: programId,
        user_id: userId,
        generation_method: run.method,
        model: run.model,
        prompt_version: run.promptVersion || DESIGNER_PROMPT_VERSION,
        science_version: run.scienceVersion || SCIENCE_ENGINE_VERSION,
        latency_ms: run.latencyMs,
        input_tokens: run.inputTokens,
        output_tokens: run.outputTokens,
        repair_attempt: run.repairAttempts,
        ok: !run.validation || run.validation.ok || run.method === 'science_fallback',
        input_json: sanitizeGenerationInput(run.context),
        output_json: run.program,
        validation_json: run.validation,
        error_text: run.aiError,
      })
      .select('id')
      .maybeSingle();
    if (error) return null;
    return data?.id || null;
  } catch {
    return null;
  }
}

export async function attachGenerationRunProgram(supabase: any, runId: string | null, programId: string | null) {
  if (!supabase || !runId || !programId) return;
  try {
    await supabase.from('st_generation_runs').update({ program_id: programId }).eq('id', runId);
  } catch {
    /* table may not exist yet */
  }
}
