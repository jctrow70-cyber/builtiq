import OpenAI from 'openai';
import { WEEK_PROGRAM_JSON_SCHEMA, WEEK_PROGRAM_SCHEMA_NAME } from './schema';
import type { AiWeekProgram } from './types';

export type ModelCallResult = {
  program: AiWeekProgram | null;
  raw: unknown;
  model: string;
  api: 'responses' | 'chat.completions';
  reasoningEffort: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  error: string | null;
};

/** Reasoning-capable default. Override with OPENAI_PROGRAM_MODEL after the access spike. */
const DEFAULT_MODEL = 'gpt-5.4';
const DEFAULT_REASONING_EFFORT = 'low';
const DEFAULT_TIMEOUT_MS = 75_000;
const MIN_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_TOKENS = 6000;
const CHAT_MODELS = /gpt-4o|gpt-4\.1|gpt-3\.5|chatgpt/i;

export function programModelName(): string {
  return process.env.OPENAI_PROGRAM_MODEL || DEFAULT_MODEL;
}

export function programReasoningEffort(): string {
  return process.env.OPENAI_PROGRAM_REASONING_EFFORT || DEFAULT_REASONING_EFFORT;
}

export function modelUsesReasoning(model: string): boolean {
  return !CHAT_MODELS.test(model);
}

const MODEL_FALLBACKS = ['gpt-5.4', 'gpt-5', 'gpt-4o-mini'];

/** One design call must finish below the Vercel 120s route budget after catalog + persist. */
export function programRequestTimeoutMs(): number {
  const n = Number(process.env.OPENAI_PROGRAM_TIMEOUT_MS);
  return Number.isFinite(n) && n >= MIN_TIMEOUT_MS ? Math.min(n, MAX_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
}

export function isAiTimeoutError(message: string | null | undefined): boolean {
  return /timeout|timed out|abort|deadline/i.test(String(message || ''));
}

export async function requestWeekProgram(opts: {
  apiKey: string;
  system: string;
  user: string;
}): Promise<ModelCallResult> {
  const preferred = programModelName();
  const effort = programReasoningEffort();
  const openai = new OpenAI({ apiKey: opts.apiKey, timeout: programRequestTimeoutMs() });
  const chain = [preferred, ...MODEL_FALLBACKS.filter((name) => name !== preferred)];
  let last: ModelCallResult | null = null;
  for (const model of chain) {
    if (modelUsesReasoning(model) && typeof (openai as any).responses?.create === 'function') {
      last = await requestViaResponses(openai, model, effort, opts.system, opts.user);
      if (last.program && !last.error) return last;
      if (last.error && isAiTimeoutError(last.error)) return last;
      if (last.error && /model|not found|does not exist|invalid model/i.test(last.error)) continue;
      if (last.program) return last;
      if (last.error && !/structured|json_schema|text\.format|unsupported/i.test(last.error) && model === preferred) {
        return last;
      }
    }
    last = await requestViaChat(openai, model, opts.system, opts.user);
    if (last.program && !last.error) return last;
    if (last.error && isAiTimeoutError(last.error)) return last;
    if (last.error && /model|not found|does not exist|invalid model/i.test(last.error)) continue;
    return last;
  }
  return last!;
}

async function requestViaResponses(
  openai: OpenAI,
  model: string,
  effort: string,
  system: string,
  user: string
): Promise<ModelCallResult> {
  try {
    const response = await (openai as any).responses.create({
      model,
      reasoning: { effort },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: WEEK_PROGRAM_SCHEMA_NAME,
          strict: true,
          schema: WEEK_PROGRAM_JSON_SCHEMA,
        },
      },
    });
    const raw = response.output_text || extractResponsesText(response);
    return {
      program: parseWeekProgram(raw),
      raw,
      model: response.model || model,
      api: 'responses',
      reasoningEffort: effort,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? null,
      error: null,
    };
  } catch (err: any) {
    return {
      program: null,
      raw: null,
      model,
      api: 'responses',
      reasoningEffort: effort,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      error: err?.message || 'OpenAI Responses request failed',
    };
  }
}

async function requestViaChat(openai: OpenAI, model: string, system: string, user: string): Promise<ModelCallResult> {
  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: WEEK_PROGRAM_SCHEMA_NAME,
          strict: true,
          schema: WEEK_PROGRAM_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const raw = completion.choices[0]?.message?.content || '';
    return {
      program: parseWeekProgram(raw),
      raw,
      model: completion.model || model,
      api: 'chat.completions',
      reasoningEffort: null,
      inputTokens: completion.usage?.prompt_tokens ?? null,
      outputTokens: completion.usage?.completion_tokens ?? null,
      reasoningTokens: (completion.usage as any)?.completion_tokens_details?.reasoning_tokens ?? 0,
      error: null,
    };
  } catch (err: any) {
    return {
      program: null,
      raw: null,
      model,
      api: 'chat.completions',
      reasoningEffort: null,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      error: err?.message || 'OpenAI Chat Completions request failed',
    };
  }
}

function extractResponsesText(response: any): string {
  const chunks = (response?.output || [])
    .flatMap((item: any) => item?.content || [])
    .map((part: any) => part?.text || part?.output_text || '')
    .filter(Boolean);
  return chunks.join('\n');
}

export function parseWeekProgram(raw: unknown): AiWeekProgram | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as any).workouts)) {
    return raw as AiWeekProgram;
  }
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.workouts)) return parsed as AiWeekProgram;
  } catch {
    /* try fence */
  }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) {
    try {
      const parsed = JSON.parse(fence[1]);
      if (parsed && Array.isArray(parsed.workouts)) return parsed as AiWeekProgram;
    } catch {
      return null;
    }
  }
  return null;
}

/** Rough USD for reporting only. Standard-tier list prices, 2026-09. */
export function estimateApiCostUsd(opts: {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens?: number | null;
}): number | null {
  const inTok = opts.inputTokens ?? 0;
  const outTok = opts.outputTokens ?? 0;
  if (!inTok && !outTok) return null;
  const rates: Record<string, { in: number; out: number }> = {
    'gpt-4o-mini': { in: 0.15, out: 0.6 },
    'gpt-5': { in: 1.25, out: 10 },
    'gpt-5.4': { in: 2.5, out: 15 },
    'gpt-5.4-mini': { in: 0.75, out: 4.5 },
    'o3': { in: 2, out: 8 },
    'o4-mini': { in: 1.1, out: 4 },
  };
  const key =
    Object.keys(rates)
      .sort((a, b) => b.length - a.length)
      .find((name) => opts.model.startsWith(name)) || 'gpt-5.4';
  const rate = rates[key];
  return (inTok * rate.in + outTok * rate.out) / 1_000_000;
}
