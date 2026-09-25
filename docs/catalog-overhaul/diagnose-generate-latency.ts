/**
 * Read-only generate-latency diagnosis. Does not change production behavior.
 * Writes docs/catalog-overhaul/diagnose-generate-latency-report.json
 */
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { fetchAllExerciseCatalog } from '../../lib/training/catalogFetch';
import { adaptGenerationCatalog } from '../../lib/scienceEngine/generation/catalogEligibility';
import { generateProgram } from '../../lib/scienceEngine/generateProgram';
import { validateProgram } from '../../lib/scienceEngine/validator';
import { buildGenerationContext } from '../../lib/scienceEngine/generation/context';
import { libraryById } from '../../lib/scienceEngine/generation/library';
import { buildDesignerInstructions, buildDesignerUserContent } from '../../lib/scienceEngine/generation/prompt';
import { validateAiProgram } from '../../lib/scienceEngine/generation/validateAiProgram';
import { WEEK_PROGRAM_JSON_SCHEMA, WEEK_PROGRAM_SCHEMA_NAME } from '../../lib/scienceEngine/generation/schema';
import { parseWeekProgram, estimateApiCostUsd } from '../../lib/scienceEngine/generation/openaiClient';
import { mapAiWeekToScience } from '../../lib/scienceEngine/generation/mapper';
import type { TrainingProfile } from '../../lib/scienceEngine/types';

function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function now() {
  return Date.now();
}

function mark(started: number) {
  return Date.now() - started;
}

function chars(value: unknown) {
  return JSON.stringify(value).length;
}

function approxTokens(text: string) {
  return Math.ceil(text.length / 4);
}

const TEST_PROFILE: TrainingProfile = {
  userId: 'diag-generate',
  primaryGoal: 'hypertrophy',
  experienceLevel: 'intermediate',
  trainingDaysPerWeek: 3,
  preferredDays: ['Mon', 'Wed', 'Fri'],
  preferredSessionMinutes: 60,
  availableEquipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'rack', 'bodyweight'],
  preferredExercises: [],
  excludedExercises: [],
  injuryLimitations: [],
  painAreas: [],
  priorityMuscles: [],
  lowPriorityMuscles: [],
  warmupStyle: 'dynamic',
  warmupDuration: 'standard',
  potentiationPreference: 'automatic',
  includeCooldown: true,
  weeks: 6,
  supersetPreference: 'sometimes',
  varietyPreference: 'balanced',
  trainingSplit: 'full_body',
  trainingFeel: [],
  intakeNotes: 'Intermediate hypertrophy 3 days Mon Wed Fri 60 minutes Full Body Balanced supersets sometimes.',
  explicitDayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
};

async function timedCall(opts: {
  apiKey: string;
  model: string;
  effort: string | null;
  system: string;
  user: string;
  timeoutMs: number;
}) {
  const openai = new OpenAI({ apiKey: opts.apiKey, timeout: opts.timeoutMs });
  const t0 = now();
  try {
    const response = await (openai as any).responses.create({
      model: opts.model,
      ...(opts.effort ? { reasoning: { effort: opts.effort } } : {}),
      max_output_tokens: 16000,
      input: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
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
    const raw = response.output_text || '';
    const program = parseWeekProgram(raw);
    return {
      ok: true,
      completed: true,
      timed_out: false,
      latency_ms: mark(t0),
      model_requested: opts.model,
      model_returned: response.model || opts.model,
      api: 'responses',
      reasoning_effort: opts.effort,
      input_tokens: response.usage?.input_tokens ?? null,
      output_tokens: response.usage?.output_tokens ?? null,
      reasoning_tokens: response.usage?.output_tokens_details?.reasoning_tokens ?? null,
      error: null,
      program,
    };
  } catch (err: any) {
    const message = err?.message || String(err);
    return {
      ok: false,
      completed: false,
      timed_out: /timeout|timed out|abort|deadline/i.test(message),
      latency_ms: mark(t0),
      model_requested: opts.model,
      model_returned: null,
      api: 'responses',
      reasoning_effort: opts.effort,
      input_tokens: null,
      output_tokens: null,
      reasoning_tokens: null,
      error: message,
      program: null,
    };
  }
}

async function main() {
  const wall0 = now();
  loadEnvLocal();
  const report: any = {
    generated_at: new Date().toISOString(),
    scenario: {
      experience: 'intermediate',
      goal: 'hypertrophy',
      days: ['Mon', 'Wed', 'Fri'],
      minutes: 60,
      split: 'full_body',
      variety: 'balanced',
      supersets: 'sometimes',
    },
    env: {
      has_openai: Boolean(process.env.OPENAI_API_KEY),
      has_supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      program_model: process.env.OPENAI_PROGRAM_MODEL || 'gpt-5.4',
      reasoning_effort: process.env.OPENAI_PROGRAM_REASONING_EFFORT || 'medium',
      production_openai_timeout_ms: process.env.OPENAI_PROGRAM_TIMEOUT_MS || '35000 (code default after BIQ-0227)',
      route_max_duration_s: 120,
      route_runtime: 'nodejs',
    },
    timings_ms: {} as Record<string, number>,
    sizes: {},
    openai_calls: [] as any[],
    notes: [] as string[],
  };

  const tAuth = now();
  report.timings_ms.auth_user_lookup = 0;
  report.notes.push('Auth/user lookup was not executed; this script uses service/local catalog, not a signed-in UI session.');
  report.timings_ms.auth_user_lookup_note_ms = mark(tAuth);

  const tCatalog = now();
  let rawRows: any[] = [];
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const fetched = await fetchAllExerciseCatalog(supabase);
    if (fetched.error) report.notes.push(`Catalog fetch error: ${fetched.error}`);
    rawRows = fetched.data || [];
  }
  report.timings_ms.catalog_fetch = mark(tCatalog);
  report.sizes.raw_catalog_rows = rawRows.length;

  const tAdapt = now();
  const catalog = adaptGenerationCatalog(rawRows);
  report.timings_ms.catalog_adapt = mark(tAdapt);
  report.sizes.adapted_catalog_rows = catalog.length;

  const tScience = now();
  const science = generateProgram(TEST_PROFILE, catalog);
  const scienceCheck = validateProgram(science, TEST_PROFILE);
  report.timings_ms.science_generate_and_validate = mark(tScience);
  report.sizes.science_ok = scienceCheck.ok;
  report.sizes.science_weeks = science.weeks;
  report.sizes.science_workouts = science.workouts.length;

  const tContext = now();
  const { context, catalogById } = buildGenerationContext({
    profile: TEST_PROFILE,
    program: science,
    catalog,
    userPrompt: TEST_PROFILE.intakeNotes || '',
    programName: 'Diagnosis 3-Day Hypertrophy',
    mode: 'full_program',
    recentTraining: [],
  });
  const library = libraryById(context);
  report.timings_ms.prompt_context_construction = mark(tContext);

  const tPrompt = now();
  const system = buildDesignerInstructions(context);
  const user = buildDesignerUserContent(context);
  report.timings_ms.prompt_stringify = mark(tPrompt);

  const schemaText = JSON.stringify(WEEK_PROGRAM_JSON_SCHEMA);
  const candidateJson = JSON.stringify(context.candidate_library);
  const warmupJson = JSON.stringify(context.warmup_library);
  const cooldownJson = JSON.stringify(context.cooldown_library);
  report.sizes = {
    ...report.sizes,
    candidate_library_count: context.candidate_library.length,
    warmup_library_count: context.warmup_library.length,
    cooldown_library_count: context.cooldown_library.length,
    unique_library_ids: library.size,
    designer_exercise_fields: Object.keys(context.candidate_library[0] || {}),
    system_prompt_chars: system.length,
    system_prompt_approx_tokens: approxTokens(system),
    user_prompt_chars: user.length,
    user_prompt_approx_tokens: approxTokens(user),
    candidate_library_chars: candidateJson.length,
    warmup_library_chars: warmupJson.length,
    cooldown_library_chars: cooldownJson.length,
    catalog_total_chars: candidateJson.length + warmupJson.length + cooldownJson.length,
    catalog_approx_tokens: approxTokens(candidateJson + warmupJson + cooldownJson),
    schema_chars: schemaText.length,
    schema_approx_tokens: approxTokens(schemaText),
    expected_output: 'one week, 3 Full Body days, week-1 only, plus rationale/progression/quality_review',
  };

  const sample = context.candidate_library[0] || null;
  report.sizes.sample_candidate = sample;
  report.sizes.not_sent_in_prompt = [
    'video_url',
    'cues',
    'aliases',
    'long descriptions',
    'gif/media',
    'substitutes',
    'full raw coaching_metadata except laterality/measurement/cooldown/power/ramp/contraindications',
  ];

  if (!process.env.OPENAI_API_KEY) {
    report.notes.push('OPENAI_API_KEY missing; skipped live model calls.');
    report.timings_ms.wall_clock_without_ai = mark(wall0);
    fs.writeFileSync(
      path.join(process.cwd(), 'docs/catalog-overhaul/diagnose-generate-latency-report.json'),
      JSON.stringify(report, null, 2)
    );
    return;
  }

  const benches = [
    { id: 'A', model: 'gpt-5.4', effort: 'medium', timeoutMs: 180_000 },
    { id: 'B', model: 'gpt-5.4', effort: 'low', timeoutMs: 180_000 },
    { id: 'C', model: 'gpt-4o-mini', effort: null, timeoutMs: 90_000 },
  ];

  for (const bench of benches) {
    const call = await timedCall({
      apiKey: process.env.OPENAI_API_KEY,
      model: bench.model,
      effort: bench.effort,
      system,
      user,
      timeoutMs: bench.timeoutMs,
    });
    const tVal = now();
    const validation = validateAiProgram(call.program, context, catalogById);
    const validateMs = mark(tVal);
    let mappedQuality: any = null;
    if (call.program && validation.ok) {
      const mapped = mapAiWeekToScience(call.program, science, TEST_PROFILE, catalogById, library);
      mappedQuality = {
        workouts: mapped.workouts.filter((w) => w.week === 1).map((w) => ({
          day: w.dayLabel,
          name: w.name,
          strength_count: w.exercises.length,
          warmup_count: w.warmup.length,
          cooldown_count: w.cooldown.length,
        })),
      };
    }
    report.openai_calls.push({
      bench: bench.id,
      ...call,
      program: undefined,
      parse_ok: Boolean(call.program),
      validation_ok: validation.ok,
      validation_errors: validation.issues.filter((i) => i.severity === 'error').map((i) => i.code),
      validation_warnings: validation.issues.filter((i) => i.severity !== 'error').map((i) => i.code),
      validate_ms: validateMs,
      repair_required: !validation.ok,
      mapped_quality: mappedQuality,
      estimated_usd: estimateApiCostUsd({
        model: call.model_returned || bench.model,
        inputTokens: call.input_tokens,
        outputTokens: call.output_tokens,
        reasoningTokens: call.reasoning_tokens,
      }),
    });
  }

  report.totals = {
    openai_calls: report.openai_calls.length,
    input_tokens: report.openai_calls.reduce((n: number, c: any) => n + (c.input_tokens || 0), 0),
    output_tokens: report.openai_calls.reduce((n: number, c: any) => n + (c.output_tokens || 0), 0),
    reasoning_tokens: report.openai_calls.reduce((n: number, c: any) => n + (c.reasoning_tokens || 0), 0),
    ai_latency_ms: report.openai_calls.reduce((n: number, c: any) => n + (c.latency_ms || 0), 0),
    wall_clock_ms: mark(wall0),
    estimated_usd: report.openai_calls.reduce((n: number, c: any) => n + (c.estimated_usd || 0), 0),
  };

  report.historical_2026_09_23 = {
    source: 'docs/catalog-overhaul/active-catalog-enrichment-live-generation.json',
    method: 'ai_repaired',
    model: 'gpt-5.4-2026-03-05',
    api: 'responses',
    reasoning_effort: 'medium',
    latency_ms: 118040,
    input_tokens: 4752,
    output_tokens: 4783,
    reasoning_tokens: 851,
    repairs: 1,
  };

  const out = path.join(process.cwd(), 'docs/catalog-overhaul/diagnose-generate-latency-report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
}

main().catch((err) => {
  fs.writeFileSync(
    path.join(process.cwd(), 'docs/catalog-overhaul/diagnose-generate-latency-report.json'),
    JSON.stringify({ error: err?.message || String(err), stack: err?.stack }, null, 2)
  );
  process.exit(1);
});
