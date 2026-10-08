import { generateProgram } from '../generateProgram';
import { validateProgram } from '../validator';
import { DESIGNER_PROMPT_VERSION, SCIENCE_ENGINE_VERSION } from '../version';
import type { CatalogExercise, ScienceProgram, TrainingProfile } from '../types';
import type { RecentLiftSummary } from '../recentTraining';
import { adaptGenerationCatalog } from './catalogEligibility';
import { buildGenerationContext } from './context';
import { applyRequestToProfile } from './hardRequirements';
import { libraryById } from './library';
import { persistGenerationRun } from './log';
import { mapAiWeekToScience } from './mapper';
import { classifyModelResult, finalOutcome, outcomeMessage } from './failureStage';
import { programModelName, requestWeekProgram, type ModelCallResult } from './openaiClient';
import { buildDesignerInstructions, buildDesignerUserContent } from './prompt';
import { applyDurationEfficiency, enforceSessionConstraints, repairAiProgram } from './repairAiProgram';
import { validateAiProgram } from './validateAiProgram';
import type {
  AiWeekProgram,
  DeterministicRepair,
  GenerationContext,
  GenerationMethod,
  GenerationMode,
  GenerationOutcome,
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
  outcome: GenerationOutcome;
  replacedDays: number;
  run: GenerationRun;
  generationRunId: string | null;
  rawAiProgram: AiWeekProgram | null;
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
  const profile = applyRequestToProfile(opts.profile, opts.userPrompt);
  const science = generateProgram(profile, catalog);
  const scienceCheck = validateProgram(science, profile);
  if (!scienceCheck.ok) {
    throw new Error(scienceCheck.issues.map((i) => i.message).join('; ') || 'Science engine validation failed');
  }

  const { context, catalogById } = buildGenerationContext({
    profile,
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
      outcome: 'science_fallback',
      validation: { ok: true, issues: [] },
      initialValidation: { ok: false, issues: [] },
      program: null,
      aiError: outcomeMessage('science_fallback'),
      repairs: [],
      openaiCalls: 0,
      aiLatencyMs: 0,
      latencyMs: Date.now() - started,
      raw: null,
      supabase: opts.supabase,
      userId: opts.userId,
      rawAiProgram: null,
    });
  }

  const aiStarted = Date.now();
  const call = await request({
    apiKey: opts.apiKey,
    system: buildDesignerInstructions(context),
    user: buildDesignerUserContent(context),
  });
  const aiLatencyMs = Date.now() - aiStarted;
  const classified = classifyModelResult(call);
  const rawAiProgram = classified.program;
  if (classified.stage !== 'parsed_program' || !classified.program) {
    const issue = errIssue(classified.stage, classified.message);
    return finish({
      science,
      context,
      method: 'science_fallback',
      outcome: classified.stage,
      validation: { ok: false, issues: [issue] },
      initialValidation: { ok: false, issues: [issue] },
      program: null,
      aiError: classified.message,
      repairs: [],
      openaiCalls: 1,
      aiLatencyMs,
      latencyMs: Date.now() - started,
      raw: call.raw,
      tokens: { in: call.inputTokens, out: call.outputTokens, reasoning: call.reasoningTokens },
      model: call.model,
      api: call.api,
      reasoningEffort: call.reasoningEffort,
      responseStatus: call.responseStatus ?? null,
      incompleteReason: call.incompleteReason ?? null,
      finishReason: call.finishReason ?? null,
      schemaIssues: classified.schemaIssues,
      supabase: opts.supabase,
      userId: opts.userId,
      rawAiProgram: null,
    });
  }

  let working: AiWeekProgram | null = classified.program;
  let repairs: DeterministicRepair[] = [];
  if (working) {
    const constrained = enforceSessionConstraints(working, context, catalogById);
    working = constrained.program;
    repairs = constrained.repairs;
  }
  const initialValidation = validateAiProgram(working, context, catalogById);
  let validation = initialValidation;

  if (working && !validation.ok) {
    const repaired = repairAiProgram(working, context, catalogById);
    working = repaired.program;
    repairs = [...repairs, ...repaired.repairs];
    validation = validateAiProgram(working, context, catalogById);
  } else if (working && validation.issues.some((issue) => issue.code === 'DURATION_OVER' && issue.severity === 'warning')) {
    const tightened = applyDurationEfficiency(working, context, catalogById);
    if (tightened.repairs.length) {
      working = tightened.program;
      repairs = tightened.repairs;
      validation = validateAiProgram(working, context, catalogById);
    }
  }

  const outcome = finalOutcome({
    stage: 'parsed_program',
    initialOk: initialValidation.ok,
    finalOk: Boolean(working) && validation.ok,
    repairAttempted: !initialValidation.ok || repairs.length > 0,
  });
  const initialFailureStage = initialValidation.ok ? null : ('programming_validation_failure' as const);
  if (working && validation.ok) {
    const mapped = mapAiWeekToScience(working, science, profile, catalogById, library);
    return finish({
      science: mapped,
      context,
      method: outcome === 'ai_repaired' ? 'ai_repaired' : 'ai',
      outcome,
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
      responseStatus: call.responseStatus ?? null,
      incompleteReason: call.incompleteReason ?? null,
      finishReason: call.finishReason ?? null,
      schemaIssues: [],
      initialFailureStage,
      rawAiProgram,
    });
  }

  const failedOutcome = finalOutcome({
    stage: 'parsed_program',
    initialOk: initialValidation.ok,
    finalOk: false,
    repairAttempted: true,
  });
  return finish({
    science,
    context,
    method: 'science_fallback',
    outcome: failedOutcome,
    validation,
    initialValidation,
    program: working,
    aiError: outcomeMessage(failedOutcome),
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
    responseStatus: call.responseStatus ?? null,
    incompleteReason: call.incompleteReason ?? null,
    finishReason: call.finishReason ?? null,
    schemaIssues: [],
    initialFailureStage,
    rawAiProgram,
  });
}

function errIssue(code: string, message: string): ValidationIssue {
  return { code: code.toUpperCase(), severity: 'error', message };
}

async function finish(opts: {
  science: ScienceProgram;
  context: GenerationContext;
  method: GenerationMethod;
  outcome: GenerationOutcome;
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
  responseStatus?: string | null;
  incompleteReason?: string | null;
  finishReason?: string | null;
  schemaIssues?: string[];
  initialFailureStage?: GenerationOutcome | null;
  supabase?: any;
  userId?: string | null;
  rawAiProgram?: AiWeekProgram | null;
}): Promise<OrchestratorResult> {
  const run: GenerationRun = {
    method: opts.method,
    outcome: opts.outcome,
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
    responseStatus: opts.responseStatus ?? null,
    incompleteReason: opts.incompleteReason ?? null,
    finishReason: opts.finishReason ?? null,
    schemaIssues: opts.schemaIssues || [],
    initialFailureStage: opts.initialFailureStage ?? null,
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
    outcome: opts.outcome,
    replacedDays: opts.method === 'science_fallback' ? 0 : opts.science.split.length,
    run,
    generationRunId,
    rawAiProgram: opts.rawAiProgram || null,
  };
}
