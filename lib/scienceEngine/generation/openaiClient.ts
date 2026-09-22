import OpenAI from 'openai';
import { WEEK_PROGRAM_JSON_SCHEMA, WEEK_PROGRAM_SCHEMA_NAME } from './schema';
import type { AiWeekProgram } from './types';

export type ModelCallResult = {
  program: AiWeekProgram | null;
  raw: unknown;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
};

const DEFAULT_MODEL = 'gpt-4o-mini';

export function programModelName(): string {
  return process.env.OPENAI_PROGRAM_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

export async function requestWeekProgram(opts: {
  apiKey: string;
  system: string;
  user: string;
}): Promise<ModelCallResult> {
  const model = programModelName();
  const openai = new OpenAI({ apiKey: opts.apiKey, timeout: 90_000 });
  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: 8000,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: WEEK_PROGRAM_SCHEMA_NAME,
          strict: true,
          schema: WEEK_PROGRAM_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    });
    const raw = completion.choices[0]?.message?.content || '';
    return {
      program: parseWeekProgram(raw),
      raw,
      model: completion.model || model,
      inputTokens: completion.usage?.prompt_tokens ?? null,
      outputTokens: completion.usage?.completion_tokens ?? null,
      error: null,
    };
  } catch (err: any) {
    return {
      program: null,
      raw: null,
      model,
      inputTokens: null,
      outputTokens: null,
      error: err?.message || 'OpenAI request failed',
    };
  }
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
