/**
 * Live optimized generate pipeline (BIQ-0228). Does not persist a user program.
 * Writes docs/catalog-overhaul/optimized-generate-report.json
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fetchAllExerciseCatalog } from '../../lib/training/catalogFetch';
import { adaptGenerationCatalog } from '../../lib/scienceEngine/generation/catalogEligibility';
import { runGenerationPipeline } from '../../lib/scienceEngine/generation/orchestrator';
import { slimContextForPrompt } from '../../lib/scienceEngine/generation/prompt';
import { buildGenerationContext } from '../../lib/scienceEngine/generation/context';
import { generateProgram } from '../../lib/scienceEngine/generateProgram';
import { estimateApiCostUsd } from '../../lib/scienceEngine/generation/openaiClient';
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

const TEST_PROFILE: TrainingProfile = {
  userId: 'opt-generate',
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

async function main() {
  loadEnvLocal();
  const wall0 = Date.now();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
  const fetched = await fetchAllExerciseCatalog(supabase);
  const catalog = adaptGenerationCatalog(fetched.data || []);
  const science = generateProgram(TEST_PROFILE, catalog);
  const { context } = buildGenerationContext({
    profile: TEST_PROFILE,
    program: science,
    catalog,
    userPrompt: TEST_PROFILE.intakeNotes || '',
    programName: 'Optimized 3-Day Hypertrophy',
    mode: 'full_program',
    recentTraining: [],
  });
  const slim = slimContextForPrompt(context);
  const pipeline = await runGenerationPipeline({
    profile: TEST_PROFILE,
    catalog,
    userPrompt: TEST_PROFILE.intakeNotes || '',
    programName: 'Optimized 3-Day Hypertrophy',
    mode: 'full_program',
    apiKey: process.env.OPENAI_API_KEY,
  });
  const week1 = pipeline.program.workouts.filter((w) => w.week === 1);
  const report = {
    generated_at: new Date().toISOString(),
    wall_ms: Date.now() - wall0,
    ai_latency_ms: pipeline.run.aiLatencyMs,
    pipeline_ms: pipeline.run.latencyMs,
    model: pipeline.run.model,
    reasoning_effort: pipeline.run.reasoningEffort,
    input_tokens: pipeline.run.inputTokens,
    output_tokens: pipeline.run.outputTokens,
    reasoning_tokens: pipeline.run.reasoningTokens,
    openai_calls: pipeline.openaiCalls,
    generation_method: pipeline.method,
    fallback_used: pipeline.method === 'science_fallback',
    prompt_chars: JSON.stringify(slim).length,
    unique_exercise_count: slim.exercise_library.length,
    serialized_exercise_object_count: slim.exercise_library.length,
    warmup_ids: slim.warmup_ids.length,
    cooldown_ids: slim.cooldown_ids.length,
    initial_validator: pipeline.initialValidation,
    deterministic_repairs: pipeline.repairs,
    final_validator: pipeline.validation,
    estimated_usd: estimateApiCostUsd({
      model: pipeline.run.model,
      inputTokens: pipeline.run.inputTokens,
      outputTokens: pipeline.run.outputTokens,
      reasoningTokens: pipeline.run.reasoningTokens,
    }),
    volume_targets: pipeline.program.volumeTargets,
    workouts: week1.map((w) => ({
      day: w.dayLabel,
      name: w.name,
      emphasis: w.emphasis,
      estimated_minutes: w.estimatedMinutes,
      warmup: w.warmup.map((item) => ({ name: item.name, sets: item.sets, reps: item.reps })),
      potentiation: w.potentiation.map((ex) => ({ name: ex.name, sets: ex.sets })),
      strength: w.exercises.map((ex) => ({
        name: ex.name,
        role: ex.role,
        sets: ex.sets,
        reps: `${ex.repMin}-${ex.repMax}`,
        rir: ex.targetRir,
        rest: ex.restSeconds,
        superset: ex.supersetLabel || null,
        pattern: ex.movementPattern,
        fatigue: null,
      })),
      cooldown: w.cooldown.map((item) => ({ name: item.name, sets: item.sets, reps: item.reps })),
    })),
    ai_error: pipeline.aiError,
  };
  fs.writeFileSync(
    path.join(process.cwd(), 'docs/catalog-overhaul/optimized-generate-report.json'),
    JSON.stringify(report, null, 2)
  );
}

main().catch((err) => {
  fs.writeFileSync(
    path.join(process.cwd(), 'docs/catalog-overhaul/optimized-generate-report.json'),
    JSON.stringify({ error: err?.message || String(err), stack: err?.stack }, null, 2)
  );
  process.exit(1);
});
