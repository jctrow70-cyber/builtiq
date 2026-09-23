import { generateProgram } from '../generateProgram';
import { validateProgram } from '../validator';
import { DESIGNER_PROMPT_VERSION, SCIENCE_ENGINE_VERSION } from '../version';
import type { CatalogExercise, ScienceProgram, TrainingProfile } from '../types';
import type { RecentLiftSummary } from '../recentTraining';
import { buildGenerationContext } from './context';
import { libraryById } from './library';
import { persistGenerationRun } from './log';
import { mapAiWeekToScience } from './mapper';
import { programModelName, requestWeekProgram, type ModelCallResult } from './openaiClient';
import { buildDesignerInstructions, buildDesignerUserContent, buildRepairInstructions, buildRepairUserContent } from './prompt';
import { validateAiProgram } from './validateAiProgram';
import type { GenerationContext, GenerationMethod, GenerationMode, GenerationRun, ValidationIssue } from './types';

const MAX_REPAIRS = 2;

export type OrchestratorResult = {
  program: ScienceProgram;
  method: GenerationMethod;
  validation: { ok: boolean; issues: ValidationIssue[] };
  qualityWarnings: ValidationIssue[];
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
  const science = generateProgram(opts.profile, opts.catalog);
  const scienceCheck = validateProgram(science, opts.profile);
  if (!scienceCheck.ok) {
    throw new Error(scienceCheck.issues.map((i) => i.message).join('; ') || 'Science engine validation failed');
  }

  const { context, catalogById } = buildGenerationContext({
    profile: opts.profile,
    program: science,
    catalog: opts.catalog,
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
      program: null,
      aiError: 'AI is not configured; used the science template.',
      repairAttempts: 0,
      latencyMs: Date.now() - started,
      raw: null,
      supabase: opts.supabase,
      userId: opts.userId,
    });
  }

  let call = await request({
    apiKey: opts.apiKey,
    system: buildDesignerInstructions(context),
    user: buildDesignerUserContent(context),
  });
  let repairAttempts = 0;
  let validation = validateAiProgram(call.program, context, catalogById);
  let lastError = call.error;

  while ((!call.program || !validation.ok) && repairAttempts < MAX_REPAIRS && opts.apiKey) {
    repairAttempts += 1;
    const errors = validation.issues.filter((i) => i.severity === 'error');
    if (!errors.length && !call.program) {
      errors.push({ code: 'EMPTY_PROGRAM', severity: 'error', message: lastError || 'The model returned unreadable JSON.' });
    }
    call = await request({
      apiKey: opts.apiKey,
      system: buildRepairInstructions(),
      user: buildRepairUserContent(call.program, errors),
    });
    lastError = call.error;
    validation = validateAiProgram(call.program, context, catalogById);
  }

  if (call.program && validation.ok) {
    const mapped = mapAiWeekToScience(call.program, science, opts.profile, catalogById, library);
    return finish({
      science: mapped,
      context,
      method: repairAttempts ? 'ai_repaired' : 'ai',
      validation,
      program: call.program,
      aiError: null,
      repairAttempts,
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
    program: call.program,
    aiError: lastError || 'AI week failed validation after repair; used the science template.',
    repairAttempts,
    latencyMs: Date.now() - started,
    raw: call.raw,
    tokens: { in: call.inputTokens, out: call.outputTokens },
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
  validation: { ok: boolean; issues: ValidationIssue[] };
  program: GenerationRun['program'];
  aiError: string | null;
  repairAttempts: number;
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
    repairAttempts: opts.repairAttempts,
    aiError: opts.aiError,
    latencyMs: opts.latencyMs,
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
    qualityWarnings: opts.validation.issues.filter((i) => i.severity !== 'error'),
    aiError: opts.aiError,
    replacedDays: opts.method === 'science_fallback' ? 0 : opts.science.split.length,
    run,
    generationRunId,
  };
}
