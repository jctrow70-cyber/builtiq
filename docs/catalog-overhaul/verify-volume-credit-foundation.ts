/**
 * After BIQ-0229 credit write: rescore the captured GPT week, generate science fallback,
 * and run one live AI pipeline. Does not persist a user program.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fetchAllExerciseCatalog } from '../../lib/training/catalogFetch';
import { adaptGenerationCatalog, selectAiGenerationCatalogRows } from '../../lib/scienceEngine/generation/catalogEligibility';
import { generateProgram } from '../../lib/scienceEngine/generateProgram';
import { runGenerationPipeline } from '../../lib/scienceEngine/generation/orchestrator';
import { calculateWeeklyVolume } from '../../lib/scienceEngine/volume';
import { contributionsForExercise, creditSets } from '../../lib/scienceEngine/contributions';
import { movementFamily } from '../../lib/scienceEngine/exerciseSelection';
import { isMajorMuscle } from '../../lib/scienceEngine/rules';
import type { MuscleId } from '../../lib/scienceEngine/taxonomy';
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
  userId: 'volume-foundation',
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

const WATCH = [
  'upper_back',
  'lats',
  'rear_delts',
  'biceps',
  'chest',
  'quads',
  'hamstrings',
  'glutes',
  'front_delts',
  'side_delts',
  'triceps',
];

function isWorkingRow(name: string) {
  return /\brow\b/i.test(name) && !/upright|renegade|rear.?delt|row to neck/i.test(name);
}

async function main() {
  loadEnvLocal();
  const report: any = { generated_at: new Date().toISOString(), phase_2b: 'not_started' };
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
  const fetched = await fetchAllExerciseCatalog(supabase);
  const rawRows = selectAiGenerationCatalogRows(fetched.data || []);
  const catalog = adaptGenerationCatalog(rawRows);
  const catalogById = new Map(catalog.filter((ex) => ex.id).map((ex) => [String(ex.id), ex]));
  report.catalog_count = catalog.length;

  const diagnosis = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'docs/catalog-overhaul/volume-credit-diagnosis.json'), 'utf8')
  );
  const capturedWeekly: Record<string, number> = {};
  (diagnosis.per_exercise_trace || []).forEach((ex: any) => {
    const row = catalogById.get(ex.catalog_id);
    if (!row) return;
    const gained = creditSets(contributionsForExercise(row), Number(ex.sets) || 0);
    Object.entries(gained).forEach(([muscle, value]) => {
      capturedWeekly[muscle] = (capturedWeekly[muscle] || 0) + value;
    });
  });
  const targets = calculateWeeklyVolume(TEST_PROFILE);
  const capturedWatch = Object.fromEntries(WATCH.map((m) => [m, capturedWeekly[m] || 0]));
  const majorErrors = WATCH.filter((muscle) => {
    const target = targets.find((t) => t.muscle === muscle);
    if (!target || !isMajorMuscle(muscle as MuscleId)) return false;
    const got = capturedWeekly[muscle] || 0;
    return got < 1 || got / target.targetSets < 0.5;
  });
  report.captured_week_rescore = {
    current_at_capture: diagnosis.volume_before_after?.current,
    after_live_credits: capturedWatch,
    expected_upper_back: 5.5,
    expected_chest: 11,
    major_volume_errors: majorErrors,
    volume_error_pass: majorErrors.length === 0,
  };

  const fallback = generateProgram(TEST_PROFILE, rawRows);
  const fallbackWeek1 = fallback.workouts.filter((w) => w.week === 1);
  const fallbackDays = fallbackWeek1.map((w) => {
    const families = w.exercises.map((ex) => movementFamily(ex.name)).filter(Boolean);
    const verticals = w.exercises.filter((ex) => movementFamily(ex.name) === 'vertical_pull').map((ex) => ex.name);
    return {
      day: w.dayLabel,
      exercises: w.exercises.map((ex) => ({ name: ex.name, role: ex.role, sets: ex.sets, pattern: ex.movementPattern })),
      vertical_pulls: verticals,
      has_row: w.exercises.some((ex) => isWorkingRow(ex.name)),
      stacked_vertical_family: families.filter((f) => f === 'vertical_pull').length > 1,
    };
  });
  report.forced_fallback = {
    days: fallbackDays,
    has_horizontal_row: fallbackDays.some((d) => d.has_row),
    no_same_session_vertical_stack: fallbackDays.every((d) => !d.stacked_vertical_family),
  };

  if (process.env.OPENAI_API_KEY && process.env.SKIP_LIVE_AI !== '1') {
    const pipeline = await runGenerationPipeline({
      profile: TEST_PROFILE,
      catalog,
      userPrompt: TEST_PROFILE.intakeNotes || '',
      programName: 'Volume foundation 3-day',
      mode: 'full_program',
      apiKey: process.env.OPENAI_API_KEY,
    });
    const week1 = pipeline.program.workouts.filter((w) => w.week === 1);
    report.live_ai = {
      method: pipeline.method,
      fallback_used: pipeline.method === 'science_fallback',
      model: pipeline.run.model,
      ai_latency_ms: pipeline.run.aiLatencyMs,
      openai_calls: pipeline.openaiCalls,
      initial_errors: pipeline.initialValidation.issues.filter((i) => i.severity === 'error').map((i) => i.message),
      repairs: pipeline.repairs,
      final_errors: pipeline.validation.issues.filter((i) => i.severity === 'error').map((i) => i.message),
      final_ok: pipeline.validation.ok,
      workouts: week1.map((w) => ({
        day: w.dayLabel,
        exercises: w.exercises.map((ex) => ({ name: ex.name, role: ex.role, sets: ex.sets })),
      })),
      ai_error: pipeline.aiError,
    };
  } else {
    const priorPath = path.join(process.cwd(), 'docs/catalog-overhaul/volume-credit-foundation-verify.json');
    let priorLive = { skipped: true };
    try {
      priorLive = JSON.parse(fs.readFileSync(priorPath, 'utf8')).live_ai || priorLive;
    } catch {
      /* no prior report */
    }
    report.live_ai = process.env.SKIP_LIVE_AI === '1' ? { ...priorLive, reused: true } : { skipped: true };
  }

  const out = path.join(process.cwd(), 'docs/catalog-overhaul/volume-credit-foundation-verify.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  const failed =
    capturedWatch.upper_back < 5 ||
    capturedWatch.chest < 5 ||
    majorErrors.length > 0 ||
    !report.forced_fallback.has_horizontal_row ||
    !report.forced_fallback.no_same_session_vertical_stack;
  if (failed) process.exit(1);
}

main().catch((err) => {
  fs.writeFileSync(
    path.join(process.cwd(), 'docs/catalog-overhaul/volume-credit-foundation-verify.json'),
    JSON.stringify({ error: err?.message || String(err), stack: err?.stack }, null, 2)
  );
  process.exit(1);
});
