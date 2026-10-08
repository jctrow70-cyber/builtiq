/**
 * BIQ-0255 Stage 2A failure classification.
 * Imported from lib/scienceEngine/acceptanceCheck.ts
 */
import { FALLBACK_CATALOG } from '../catalogAdapter';
import { trainingProfileFromSources } from '../profile';
import {
  classifyModelResult,
  finalOutcome,
  measureRepresentativeOutputBudget,
  outcomeMessage,
} from './failureStage';
import { generationRunDiagnostics } from './log';
import { programMaxOutputTokens } from './openaiClient';
import { runGenerationPipeline } from './orchestrator';
import type { ModelCallResult } from './openaiClient';
import type { AiWeekProgram } from './types';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function profile() {
  return trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'athletic_performance' },
    trainingProfile: { preferred_session_minutes: 45, warmup_style: 'dynamic', warmup_duration: 'standard' },
    config: {
      days: ['Mon', 'Fri'],
      dayTypes: { Mon: 'Full Body', Fri: 'Full Body' },
      weeks: 4,
      sessionMinutes: 45,
      primaryGoal: 'athletic_performance',
      experienceLevel: 'intermediate',
    },
  });
}

function call(partial: Partial<ModelCallResult> & Pick<ModelCallResult, 'program' | 'raw' | 'error'>): ModelCallResult {
  return {
    model: 'gpt-5.4',
    api: 'responses',
    reasoningEffort: 'low',
    inputTokens: 1000,
    outputTokens: partial.outputTokens ?? null,
    reasoningTokens: partial.reasoningTokens ?? null,
    responseStatus: partial.responseStatus ?? null,
    incompleteReason: partial.incompleteReason ?? null,
    finishReason: partial.finishReason ?? null,
    ...partial,
  };
}

export async function runFailureStageChecks() {
  const empty = classifyModelResult({ program: null, raw: '', error: null, outputTokens: 0, reasoningTokens: 0 });
  assert(empty.stage === 'empty_response', `Empty body should be empty_response, got ${empty.stage}`);
  assert(!/validation/i.test(empty.message), `Empty response was labeled as validation: ${empty.message}`);
  assert(outcomeMessage('empty_response') === empty.message, 'Empty-response message should come from the outcome catalog');

  const blank = classifyModelResult({ program: null, raw: '   ', error: null });
  assert(blank.stage === 'empty_response', `Whitespace should be empty_response, got ${blank.stage}`);

  const timeout = classifyModelResult({ program: null, raw: '', error: 'Request timed out.' });
  assert(timeout.stage === 'api_timeout', `Timeout should not be an empty response, got ${timeout.stage}`);
  assert(!/validation/i.test(timeout.message), `Timeout was labeled as validation: ${timeout.message}`);

  const apiError = classifyModelResult({ program: null, raw: null, error: 'Connection reset' });
  assert(apiError.stage === 'api_error', `API error stage, got ${apiError.stage}`);
  assert(/Connection reset/.test(apiError.message), `API error should keep the provider detail: ${apiError.message}`);

  const incomplete = classifyModelResult({
    program: null,
    raw: '{"workouts":',
    error: null,
    responseStatus: 'incomplete',
    incompleteReason: 'content_filter',
  });
  assert(incomplete.stage === 'incomplete_response', `Content filter should be incomplete, got ${incomplete.stage}`);

  const exhausted = classifyModelResult({
    program: null,
    raw: '',
    error: null,
    responseStatus: 'incomplete',
    incompleteReason: 'max_output_tokens',
    outputTokens: 6000,
    reasoningTokens: 5900,
  });
  assert(
    exhausted.stage === 'output_token_exhaustion',
    `Token cap should not be reported as empty or validation, got ${exhausted.stage}: ${exhausted.message}`
  );
  assert(!/validation/i.test(exhausted.message), `Token exhaustion was labeled as validation: ${exhausted.message}`);

  const lengthStop = classifyModelResult({
    program: null,
    raw: '{"schema_version":"2.1"',
    error: null,
    finishReason: 'length',
    outputTokens: 6000,
    reasoningTokens: 0,
  });
  assert(lengthStop.stage === 'output_token_exhaustion', `finish_reason length should be token exhaustion, got ${lengthStop.stage}`);

  const badJson = classifyModelResult({ program: null, raw: 'not json at all', error: null, outputTokens: 20 });
  assert(badJson.stage === 'json_parse_failure', `Unparseable text should be json_parse_failure, got ${badJson.stage}`);
  assert(!/validation/i.test(badJson.message), `Parse failure was labeled as validation: ${badJson.message}`);

  const badSchema = classifyModelResult({ program: null, raw: JSON.stringify({ summary: 'No workouts' }), error: null });
  assert(badSchema.stage === 'schema_validation_failure', `JSON without workouts should fail schema, got ${badSchema.stage}`);
  assert(badSchema.schemaIssues.some((issue) => /workouts/.test(issue)), `Schema issues should name workouts: ${badSchema.schemaIssues.join('; ')}`);

  const parsed = classifyModelResult({
    program: {
      schema_version: '2.1',
      summary: 'Week',
      workouts: [{ day_label: 'Mon', name: 'A', emphasis: 'Push', estimated_minutes: 45, warmup: [], potentiation: [], strength: [], cooldown: [] }],
    },
    raw: null,
    error: null,
  });
  assert(parsed.stage === 'parsed_program', `A week object should reach programming validation, got ${parsed.stage}`);

  assert(
    finalOutcome({ stage: 'parsed_program', initialOk: true, finalOk: false, repairAttempted: false }) === 'programming_validation_failure',
    'A parsed week that fails before repair is a programming validation failure'
  );
  assert(
    finalOutcome({ stage: 'parsed_program', initialOk: false, finalOk: false, repairAttempted: true }) === 'repair_failure',
    'A parsed week that still fails after repair is a repair failure'
  );
  assert(
    outcomeMessage('repair_failure') === 'AI week failed validation after deterministic repair; used the science template.',
    'Repair failure keeps the existing validation sentence'
  );

  const budget = measureRepresentativeOutputBudget(1500);
  assert(budget.maxOutputTokens === 6000, `Output cap should stay 6000, got ${budget.maxOutputTokens}`);
  assert(programMaxOutputTokens() === 6000, 'programMaxOutputTokens should stay 6000');
  assert(budget.catalogIncluded === false, 'The output-budget sample must not include the exercise catalog');
  assert(budget.twoDayTokens > 400 && budget.fourDayTokens > budget.twoDayTokens, `Budget sample was too small: ${budget.twoDayTokens} / ${budget.fourDayTokens}`);
  assert(budget.twoDayFits && budget.fourDayFits && budget.fourDayWithLowReasoningFits, `Representative week does not fit the current output budget: ${JSON.stringify(budget)}`);

  const pipelineBase = {
    profile: profile(),
    catalog: FALLBACK_CATALOG,
    userPrompt: 'Both days should use the same workout.',
    programName: 'Stage 2A',
    apiKey: 'test-key',
  };
  const emptyRun = await runGenerationPipeline({
    ...pipelineBase,
    requestFn: async () => call({ program: null, raw: '', error: null, outputTokens: 0, reasoningTokens: 0 }),
  });
  assert(emptyRun.method === 'science_fallback', `Empty response should still save the science template, got ${emptyRun.method}`);
  assert(emptyRun.outcome === 'empty_response', `Pipeline outcome should be empty_response, got ${emptyRun.outcome}`);
  assert(emptyRun.program.workouts.length > 0, 'Science template should still contain workouts');
  assert(!/validation/i.test(emptyRun.aiError || ''), `Empty pipeline response was reported as validation: ${emptyRun.aiError}`);
  const emptyDiag = generationRunDiagnostics(emptyRun.run);
  assert(emptyDiag.outcome === 'empty_response', 'Generation-run diagnostics should store empty_response');
  assert(emptyDiag.output_budget.max_output_tokens === 6000, 'Diagnostics should record the unchanged output cap');
  assert(emptyDiag.initial_failure_stage == null, 'An empty response is not a programming validation failure');

  const emptyWeek: AiWeekProgram = { schema_version: '2.1', summary: 'Empty week', workouts: [] };
  const repairRun = await runGenerationPipeline({
    ...pipelineBase,
    requestFn: async () => call({ program: emptyWeek, raw: JSON.stringify(emptyWeek), error: null, outputTokens: 80, reasoningTokens: 10 }),
  });
  assert(repairRun.outcome === 'repair_failure', `Unrepairable parsed week should be repair_failure, got ${repairRun.outcome}`);
  assert(
    repairRun.aiError === 'AI week failed validation after deterministic repair; used the science template.',
    `Repair failure message changed: ${repairRun.aiError}`
  );
  assert(repairRun.run.initialFailureStage === 'programming_validation_failure', 'Initial programming failure should be stored separately from the repair outcome');
  const repairDiag = generationRunDiagnostics(repairRun.run);
  assert(repairDiag.initial_failure_stage === 'programming_validation_failure', 'Diagnostics should keep the initial programming failure');
  assert(repairDiag.outcome === 'repair_failure', 'Diagnostics should keep the repair failure as the final outcome');

  console.log(
    `BIQ-0255 output budget: 2-day ~${budget.twoDayTokens} tokens, 4-day ~${budget.fourDayTokens} tokens, 4-day + ${budget.assumedReasoningTokens} reasoning ~${budget.fourDayWithReasoningTokens} tokens, cap ${budget.maxOutputTokens}.`
  );
}
