import { generateProgram } from '../generateProgram';
import { validateProgram } from '../validator';
import { DESIGNER_PROMPT_VERSION, SCIENCE_ENGINE_VERSION } from '../version';
import type { CatalogExercise, ScienceProgram, TrainingProfile } from '../types';
import type { RecentLiftSummary } from '../recentTraining';
import { adaptGenerationCatalog } from './catalogEligibility';
import { buildGenerationContext } from './context';
import { libraryById } from './library';
import { persistGenerationRun } from './log';
import { mapAiWeekToScience } from './mapper';
import { programModelName, requestWeekProgram, type ModelCallResult } from './openaiClient';
import { buildDesignerInstructions, buildDesignerUserContent } from './prompt';
import { repairAiProgram } from './repairAiProgram';
import { validateAiProgram } from './validateAiProgram';
import type {
  DeterministicRepair,
  GenerationContext,
  GenerationMethod,
  GenerationMode,
  GenerationRun,
  ValidationIssue,
  ValidationResult,
} from './types';

export type OrchestratorResult = {
  program: ScienceProgram;
  method: GenerationMethod;
  validation: { ok: boolean; issues: ValidationIssue[] };
  initialValidation: ValidationResult;
  qualityWarnings: ValidationIssue[];
  repairs: DeterministicRepair[];
  openaiCalls: number;
  aiError: string | null;
  replacedDays: number;
  run: GenerationRun;
  generationRunId: string | null;
};

export async function runGenerationPipeline(opts: {
  profile: TrainingProfile;
  catalog: CatalogExercise[];
  userPrompt: string;
  programName: string;
  mode?: GenerationMode;
  recentTraining?: RecentLiftSummary[];
  apiKey?: string | null;
  supabase?: any;
  userId?: string | null;
  requestFn?: (args: { apiKey: string; system: string; user: string }) => Promise<ModelCallResult>;
}): Promise<OrchestratorResult> {
  const started = Date.now();
  const mode = opts.mode || 'full_program';
  const catalog = adaptGenerationCatalog(opts.catalog);
  const science = generateProgram(opts.profile, catalog);
  const scienceCheck = validateProgram(science, opts.profile);
  if (!scienceCheck.ok) {
    throw new Error(scienceCheck.issues.map((i) => i.message).join('; ') || 'Science engine validation failed');
  }

  const { context, catalogById } = buildGenerationContext({
    profile: opts.profile,
    program: science,
    catalog,
    userPrompt: opts.userPrompt,
    programName: opts.programName,
    mode,
    recentTraining: opts.recentTraining,
  });
  const library = libraryById(context);
  const request = opts.requestFn || requestWeekProgram;

  if (!opts.apiKey) {
    return finish({
      science,
      context,
      method: 'science_fallback',
      validation: { ok: true, issues: [] },
      initialValidation: { ok: false, issues: [] },
      program: null,
      aiError: 'AI is not configured; used the science template.',
      repairs: [],
      openaiCalls: 0,
      aiLatencyMs: 0,
      latencyMs: Date.now() - started,
      raw: null,
      supabase: opts.supabase,
      userId: opts.userId,
    });
  }

  const aiStarted = Date.now();
  const call = await request({
    apiKey: opts.apiKey,
    system: buildDesignerInstructions(context),
    user: buildDesignerUserContent(context),
  });
  const aiLatencyMs = Date.now() - aiStarted;
  const lastError = call.error;
  let working = call.program;
  const initialValidation = validateAiProgram(working, context, catalogById);
  let repairs: DeterministicRepair[] = [];
  let validation = initialValidation;

  if (working && !validation.ok) {
    const repaired = repairAiProgram(working, context, catalogById);
    working = repaired.program;
    repairs = repaired.repairs;
    validation = validateAiProgram(working, context, catalogById);
  }

  const unusable = !working || !validation.ok || Boolean(lastError);
  if (!unusable && working) {
    const mapped = mapAiWeekToScience(working, science, opts.profile, catalogById, library);
    return finish({
      science: mapped,
      context,
      method: repairs.length ? 'ai_repaired' : 'ai',
      validation,
      initialValidation,
      program: working,
      aiError: null,
      repairs,
      openaiCalls: 1,
      aiLatencyMs,
      latencyMs: Date.now() - started,
      raw: call.raw,
      tokens: { in: call.inputTokens, out: call.outputTokens, reasoning: call.reasoningTokens },
      model: call.model,
      api: call.api,
      reasoningEffort: call.reasoningEffort,
      supabase: opts.supabase,
      userId: opts.userId,
    });
  }

  return finish({
    science,
    context,
    method: 'science_fallback',
    validation,
    initialValidation,
    program: working,
    aiError: lastError || 'AI week failed validation after deterministic repair; used the science template.',
    repairs,
    openaiCalls: 1,
    aiLatencyMs,
    latencyMs: Date.now() - started,
    raw: call.raw,
    tokens: { in: call.inputTokens, out: call.outputTokens, reasoning: call.reasoningTokens },
    model: call.model,
    api: call.api,
    reasoningEffort: call.reasoningEffort,
    supabase: opts.supabase,
    userId: opts.userId,
  });
}

async function finish(opts: {
  science: ScienceProgram;
  context: GenerationContext;
  method: GenerationMethod;
  validation: ValidationResult;
  initialValidation: ValidationResult;
  program: GenerationRun['program'];
  aiError: string | null;
  repairs: DeterministicRepair[];
  openaiCalls: number;
  aiLatencyMs: number;
  latencyMs: number;
  raw: unknown;
  tokens?: { in: number | null; out: number | null; reasoning?: number | null };
  model?: string;
  api?: 'responses' | 'chat.completions' | null;
  reasoningEffort?: string | null;
  supabase?: any;
  userId?: string | null;
}): Promise<OrchestratorResult> {
  const run: GenerationRun = {
    method: opts.method,
    model: opts.model || programModelName(),
    promptVersion: DESIGNER_PROMPT_VERSION,
    scienceVersion: SCIENCE_ENGINE_VERSION,
    program: opts.program,
    context: opts.context,
    validation: opts.validation,
    initialValidation: opts.initialValidation,
    repairs: opts.repairs,
    repairAttempts: opts.repairs.length,
    openaiCalls: opts.openaiCalls,
    aiError: opts.aiError,
    latencyMs: opts.latencyMs,
    aiLatencyMs: opts.aiLatencyMs,
    inputTokens: opts.tokens?.in ?? null,
    outputTokens: opts.tokens?.out ?? null,
    reasoningTokens: opts.tokens?.reasoning ?? null,
    api: opts.api ?? null,
    reasoningEffort: opts.reasoningEffort ?? null,
    rawOutput: opts.raw,
  };
  const generationRunId = await persistGenerationRun(opts.supabase, opts.userId || null, null, run);
  return {
    program: opts.science,
    method: opts.method,
    validation: opts.validation,
    initialValidation: opts.initialValidation,
    qualityWarnings: opts.validation.issues.filter((i) => i.severity !== 'error'),
    repairs: opts.repairs,
    openaiCalls: opts.openaiCalls,
    aiError: opts.aiError,
    replacedDays: opts.method === 'science_fallback' ? 0 : opts.science.split.length,
    run,
    generationRunId,
  };
}
