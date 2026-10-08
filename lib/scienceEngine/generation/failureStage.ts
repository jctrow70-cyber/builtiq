import { parseWeekProgram, programMaxOutputTokens } from './openaiClient';
import type { AiWeekProgram, GenerationOutcome } from './types';

export type { GenerationOutcome };

export type ResponseStage =
  | 'parsed_program'
  | 'api_timeout'
  | 'api_error'
  | 'empty_response'
  | 'incomplete_response'
  | 'output_token_exhaustion'
  | 'json_parse_failure'
  | 'schema_validation_failure';

export type ModelResultSnapshot = {
  program: AiWeekProgram | null;
  raw: unknown;
  error: string | null;
  responseStatus?: string | null;
  incompleteReason?: string | null;
  finishReason?: string | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
};

export type ResponseClassification = {
  stage: ResponseStage;
  message: string;
  schemaIssues: string[];
  program: AiWeekProgram | null;
};

const VALIDATION_SENTENCE = 'AI week failed validation after deterministic repair; used the science template.';

export function outcomeMessage(outcome: GenerationOutcome, detail?: string | null): string | null {
  const extra = String(detail || '').trim();
  switch (outcome) {
    case 'ai':
    case 'ai_repaired':
      return null;
    case 'science_fallback':
      return 'AI is not configured; used the science template.';
    case 'api_timeout':
      return 'The model timed out before returning a program; used the science template.';
    case 'api_error':
      return extra
        ? `The model request failed (${extra}); used the science template.`
        : 'The model request failed; used the science template.';
    case 'empty_response':
      return 'The model returned an empty response; used the science template.';
    case 'incomplete_response':
      return extra
        ? `The model response was incomplete (${extra}); used the science template.`
        : 'The model response was incomplete; used the science template.';
    case 'output_token_exhaustion':
      return 'The model used the output-token budget before finishing the program; used the science template.';
    case 'json_parse_failure':
      return 'The model response was not valid JSON; used the science template.';
    case 'schema_validation_failure':
      return 'The model JSON did not match the program schema; used the science template.';
    case 'programming_validation_failure':
      return 'The AI week failed programming validation; used the science template.';
    case 'repair_failure':
      return VALIDATION_SENTENCE;
    default:
      return VALIDATION_SENTENCE;
  }
}

export function weekSchemaIssues(value: unknown): string[] {
  const issues: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push('Program must be a JSON object.');
    return issues;
  }
  const row = value as { workouts?: unknown };
  if (!Array.isArray(row.workouts)) {
    issues.push('workouts must be an array.');
    return issues;
  }
  row.workouts.forEach((workout, index) => {
    if (!workout || typeof workout !== 'object' || Array.isArray(workout)) {
      issues.push(`workouts[${index}] must be an object.`);
      return;
    }
    const day = workout as { day_label?: unknown; strength?: unknown };
    if (typeof day.day_label !== 'string' || !day.day_label.trim()) {
      issues.push(`workouts[${index}].day_label is required.`);
    }
    if (!Array.isArray(day.strength)) {
      issues.push(`workouts[${index}].strength must be an array.`);
      return;
    }
    day.strength.forEach((block, blockIndex) => {
      if (!block || typeof block !== 'object' || Array.isArray(block)) {
        issues.push(`workouts[${index}].strength[${blockIndex}] must be an object.`);
        return;
      }
      const exercises = (block as { exercises?: unknown }).exercises;
      if (!Array.isArray(exercises)) {
        issues.push(`workouts[${index}].strength[${blockIndex}].exercises must be an array.`);
        return;
      }
      exercises.forEach((exercise, exerciseIndex) => {
        const id = exercise && typeof exercise === 'object' ? (exercise as { exercise_id?: unknown }).exercise_id : null;
        if (typeof id !== 'string' || !id.trim()) {
          issues.push(
            `workouts[${index}].strength[${blockIndex}].exercises[${exerciseIndex}].exercise_id is required.`
          );
        }
      });
    });
  });
  return issues;
}

function rawText(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  return '';
}

function parsedJson(text: string): { ok: boolean; value: unknown } {
  if (!text) return { ok: false, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    /* fence */
  }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) {
    try {
      return { ok: true, value: JSON.parse(fence[1]) };
    } catch {
      return { ok: false, value: null };
    }
  }
  return { ok: false, value: null };
}

function budgetHit(input: ModelResultSnapshot): boolean {
  if (input.incompleteReason === 'max_output_tokens') return true;
  if (input.finishReason === 'length') return true;
  const max = programMaxOutputTokens();
  return input.outputTokens != null && input.outputTokens >= max;
}

function incompleteSignal(input: ModelResultSnapshot): string | null {
  const status = String(input.responseStatus || '').toLowerCase();
  if (status === 'incomplete' || status === 'cancelled') return input.incompleteReason || status;
  if (input.finishReason === 'content_filter') return 'content_filter';
  return null;
}

export function classifyModelResult(input: ModelResultSnapshot): ResponseClassification {
  const candidate = input.program || (input.raw ? parseWeekProgram(input.raw) : null);
  const schemaIssues = candidate ? weekSchemaIssues(candidate) : [];
  const parsed = Boolean(candidate && schemaIssues.length === 0);
  if (parsed && candidate) {
    return { stage: 'parsed_program', message: '', schemaIssues: [], program: candidate };
  }

  const error = String(input.error || '').trim();
  const status = String(input.responseStatus || '').toLowerCase();
  if (error && /timeout|timed out|abort|deadline/i.test(error)) {
    return { stage: 'api_timeout', message: outcomeMessage('api_timeout') || '', schemaIssues, program: null };
  }
  if (error || status === 'failed') {
    return {
      stage: 'api_error',
      message: outcomeMessage('api_error', error || status || null) || '',
      schemaIssues,
      program: null,
    };
  }
  if (budgetHit(input)) {
    return {
      stage: 'output_token_exhaustion',
      message: outcomeMessage('output_token_exhaustion') || '',
      schemaIssues,
      program: null,
    };
  }
  const incomplete = incompleteSignal(input);
  if (incomplete) {
    return {
      stage: 'incomplete_response',
      message: outcomeMessage('incomplete_response', incomplete) || '',
      schemaIssues,
      program: null,
    };
  }
  if (candidate && schemaIssues.length) {
    return {
      stage: 'schema_validation_failure',
      message: outcomeMessage('schema_validation_failure') || '',
      schemaIssues,
      program: null,
    };
  }

  const text = rawText(input.raw);
  const objectRaw = input.raw && typeof input.raw === 'object' ? input.raw : null;
  if (!text && !objectRaw) {
    return { stage: 'empty_response', message: outcomeMessage('empty_response') || '', schemaIssues, program: null };
  }

  const json = text ? parsedJson(text) : { ok: true, value: objectRaw };
  if (!json.ok) {
    return {
      stage: 'json_parse_failure',
      message: outcomeMessage('json_parse_failure') || '',
      schemaIssues,
      program: null,
    };
  }
  const issues = weekSchemaIssues(json.value);
  return {
    stage: 'schema_validation_failure',
    message: outcomeMessage('schema_validation_failure') || '',
    schemaIssues: issues,
    program: null,
  };
}

export function finalOutcome(opts: {
  stage: ResponseStage;
  initialOk: boolean;
  finalOk: boolean;
  repairAttempted: boolean;
}): GenerationOutcome {
  if (opts.stage !== 'parsed_program') return opts.stage;
  if (opts.finalOk) return opts.repairAttempted ? 'ai_repaired' : 'ai';
  if (opts.repairAttempted || !opts.initialOk) return 'repair_failure';
  return 'programming_validation_failure';
}

/** Character estimate only. The exercise catalog is model input, not part of this sample. */
export function estimateTextTokens(text: string): number {
  const length = String(text || '').length;
  if (!length) return 0;
  return Math.ceil(length / 4);
}

export function representativeWeekJson(days: number): string {
  const workout = {
    day_label: 'Mon',
    name: 'Athletic session',
    emphasis: 'Upper-body push and lower-body pull with a repeated session.',
    estimated_minutes: 45,
    warmup: [1, 2, 3].map((n) => ({
      exercise_id: `warmup-${n}`,
      sets: 2,
      prescription: '8',
      why: 'Prepare the joints and patterns used by the primary lifts in this session.',
    })),
    potentiation: [
      {
        exercise_id: 'primer-1',
        sets: 2,
        prescription: '4',
        why: 'Brief explosive primer before the first heavy primary.',
      },
    ],
    strength: [1, 2, 3, 4, 5].map((n) => ({
      type: 'straight_sets',
      exercises: [
        {
          exercise_id: `lift-${n}`,
          role: n === 1 ? 'primary' : n > 3 ? 'isolation' : 'secondary',
          working_sets: 3,
          rep_min: 3,
          rep_max: 6,
          target_rir: 2,
          rest_seconds: 150,
          reps_per_side: false,
          measurement_type: 'reps',
          why: 'Goal-specific working prescription for the requested emphasis, kept inside the session.',
        },
      ],
    })),
    cooldown: [1, 2].map((n) => ({
      exercise_id: `cooldown-${n}`,
      sets: 1,
      prescription: '30 sec/side',
      why: 'Easy mobility after the working sets.',
    })),
  };
  return JSON.stringify({
    schema_version: '2.1',
    summary: 'One athletic week built from the requested days, duration, and emphasis.',
    coaching_notes: 'Repeat the session only when identical days were requested. Keep primaries stable across weeks.',
    workouts: Array.from({ length: Math.max(1, days) }, (_, index) => ({
      ...workout,
      day_label: ['Mon', 'Tue', 'Thu', 'Fri'][index] || `Day${index + 1}`,
    })),
    progression: {
      strategy: 'Keep the same primaries and progress load from logged performance.',
      primary_exercise_ids: ['lift-1'],
    },
  });
}

export function measureRepresentativeOutputBudget(assumedReasoningTokens = 1500) {
  const maxOutputTokens = programMaxOutputTokens();
  const twoDayTokens = estimateTextTokens(representativeWeekJson(2));
  const fourDayTokens = estimateTextTokens(representativeWeekJson(4));
  const reasoning = Math.max(0, assumedReasoningTokens);
  return {
    maxOutputTokens,
    twoDayTokens,
    fourDayTokens,
    twoDayFits: twoDayTokens <= maxOutputTokens,
    fourDayFits: fourDayTokens <= maxOutputTokens,
    assumedReasoningTokens: reasoning,
    fourDayWithReasoningTokens: fourDayTokens + reasoning,
    fourDayWithLowReasoningFits: fourDayTokens + reasoning <= maxOutputTokens,
    catalogIncluded: false as const,
    note: 'Output budget covers the week JSON plus reasoning tokens on the Responses API. The exercise catalog is sent as input and is not part of this sample. This is a 4-characters-per-token estimate, not a live tokenizer count. The 6000 cap is unchanged.',
  };
}

export function outputBudgetSnapshot(opts: {
  outputTokens: number | null;
  reasoningTokens: number | null;
}) {
  const maxOutputTokens = programMaxOutputTokens();
  const outputTokens = opts.outputTokens;
  const reasoningTokens = opts.reasoningTokens;
  const visibleOutputTokens =
    outputTokens != null && reasoningTokens != null && outputTokens >= reasoningTokens
      ? outputTokens - reasoningTokens
      : null;
  return {
    max_output_tokens: maxOutputTokens,
    output_tokens: outputTokens,
    reasoning_tokens: reasoningTokens,
    visible_output_tokens: visibleOutputTokens,
    saturated: outputTokens != null && outputTokens >= maxOutputTokens,
  };
}
