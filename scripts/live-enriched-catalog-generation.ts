/**
 * Live Phase 1 generation against the enriched production catalog.
 * Refuses FALLBACK_CATALOG.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { FALLBACK_CATALOG, catalogExerciseFromRow } from '../lib/scienceEngine/catalogAdapter';
import { contributionsForExercise, creditSets } from '../lib/scienceEngine/contributions';
import { classifySessionDuration, estimateSessionFromAi } from '../lib/scienceEngine/duration';
import { adaptGenerationCatalog, selectAiGenerationCatalogRows } from '../lib/scienceEngine/generation/catalogEligibility';
import { runGenerationPipeline } from '../lib/scienceEngine/generation';
import { libraryById } from '../lib/scienceEngine/generation/library';
import { trainingProfileFromSources } from '../lib/scienceEngine/profile';
import { ENRICHMENT_VERSION } from '../lib/scienceEngine/catalogEnrichment/storage';

const OUT = path.join(process.cwd(), 'docs/catalog-overhaul/active-catalog-enrichment-live-generation.json');

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

async function fetchAll(supabase: any) {
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('st_exercise_catalog').select('*').order('name').range(from, from + 999);
    if (error) return { rows, error: error.message };
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
    from += 1000;
  }
  return { rows, error: null as string | null };
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!url || !key) throw new Error('Supabase URL/key not set');
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const live = await fetchAll(supabase);
  if (live.error || !live.rows.length) throw new Error(`Catalog fetch failed: ${live.error || 'no rows'}`);

  const active = live.rows.filter((row) => row.is_archived !== true);
  const customActive = active.filter((row) => row.user_id || row.is_system === false);
  const eligible = selectAiGenerationCatalogRows(live.rows);
  const adapted = adaptGenerationCatalog(live.rows, { allowFallback: false });
  const fallbackIds = new Set(FALLBACK_CATALOG.map((ex) => String(ex.id)));
  const usedFallback = adapted.some((ex) => fallbackIds.has(String(ex.id)) && !eligible.some((row) => String(row.id) === String(ex.id)));
  const enriched = adapted.filter((ex) => ex.raw?.coaching_metadata?.enrichment_version === ENRICHMENT_VERSION);
  const customCandidates = adapted.filter((ex) => ex.raw?.user_id || ex.raw?.is_system === false);

  if (active.length !== 279) {
    throw new Error(`Expected 279 active catalog rows, found ${active.length}`);
  }
  if (eligible.length !== 260 || adapted.length !== 260) {
    throw new Error(`Expected 260 AI candidates, found eligible=${eligible.length} adapted=${adapted.length}`);
  }
  if (customCandidates.length) throw new Error(`Custom rows leaked into AI candidates: ${customCandidates.map((ex) => ex.name).join(', ')}`);
  if (usedFallback) throw new Error('Refusing generation: FALLBACK_CATALOG entries were mixed in.');
  if (enriched.length !== 260) {
    throw new Error(`Refusing generation: only ${enriched.length} rows have ${ENRICHMENT_VERSION} metadata.`);
  }

  const profile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle' },
    trainingProfile: {
      warmup_style: 'dynamic',
      warmup_duration: 'standard',
      variety_preference: 'balanced',
      superset_preference: 'sometimes',
      preferred_session_minutes: 60,
    },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      weeks: 1,
      sessionMinutes: 60,
      primaryGoal: 'hypertrophy',
      experienceLevel: 'intermediate',
      varietyPreference: 'balanced',
      supersetPreference: 'sometimes',
      trainingSplit: 'full_body',
      intakeNotes: 'Intermediate. Build muscle / hypertrophy. 3 days/week Monday Wednesday Friday. 60 minutes. Full Body. Balanced variety. Supersets sometimes.',
    },
  });

  const pipeline = await runGenerationPipeline({
    profile,
    catalog: adapted,
    userPrompt: 'Intermediate. Build muscle / hypertrophy. 3 days/week Monday Wednesday Friday. 60 minutes. Full Body. Balanced variety. Supersets sometimes.',
    programName: 'Enriched catalog validation week',
    mode: 'full_program',
    apiKey,
  });

  const library = libraryById(pipeline.run.context);
  const week1 = (pipeline.program.workouts || []).filter((w) => w.week === 1);
  const volume: Record<string, number> = {};
  const patterns: Record<string, number> = {};
  const fatigue: Record<string, number> = {};
  const durations: any[] = [];
  const metadataProblems: string[] = [];

  week1.forEach((workout) => {
    const ai = pipeline.run.program?.workouts?.find((w) => w.day_label === workout.dayLabel);
    const estimated = ai ? estimateSessionFromAi(ai, library) : workout.estimatedMinutes;
    durations.push({
      day: workout.dayLabel,
      estimated_minutes: estimated,
      classification: classifySessionDuration(estimated, 60),
    });
    const checkRow = (ex: any, creditVolume: boolean) => {
      const id = ex.catalogExerciseId || ex.exerciseId;
      const raw = adapted.find((row) => row.id === id);
      const meta = raw ? catalogExerciseFromRow({ ...raw.raw, is_archived: false }) : null;
      if (!meta) {
        metadataProblems.push(`${ex.name} was not found in the enriched active catalog`);
        return;
      }
      if (creditVolume) {
        patterns[meta.movementPattern] = (patterns[meta.movementPattern] || 0) + 1;
        fatigue[meta.fatigueCost] = (fatigue[meta.fatigueCost] || 0) + 1;
        const credits = creditSets(contributionsForExercise(meta), ex.sets || 0);
        Object.entries(credits).forEach(([muscle, n]) => {
          volume[muscle] = (volume[muscle] || 0) + n;
        });
      }
      if (meta.raw?.coaching_metadata?.enrichment_version !== ENRICHMENT_VERSION) {
        metadataProblems.push(`${ex.name} used in program without enrichment_version`);
      }
    };
    (workout.exercises || []).forEach((ex) => checkRow(ex, true));
    (workout.warmup || []).forEach((ex) => checkRow(ex, false));
    (workout.cooldown || []).forEach((ex) => checkRow(ex, false));
  });

  const programIds = new Set<string>();
  const collectId = (id?: string | null) => {
    if (id) programIds.add(String(id));
  };
  week1.forEach((workout) => {
    (workout.warmup || []).forEach((ex: any) => collectId(ex.exerciseId));
    (workout.exercises || []).forEach((ex: any) => collectId(ex.catalogExerciseId || ex.exerciseId));
    (workout.cooldown || []).forEach((ex: any) => collectId(ex.exerciseId));
  });
  (pipeline.run.program?.workouts || []).forEach((workout) => {
    (workout.warmup || []).forEach((ex: any) => collectId(ex.exercise_id));
    (workout.strength || []).forEach((block: any) => (block.exercises || []).forEach((ex: any) => collectId(ex.exercise_id)));
    (workout.cooldown || []).forEach((ex: any) => collectId(ex.exercise_id));
  });
  const customIds = new Set(customActive.map((row) => String(row.id)));
  const customIdsInProgram = [...programIds].filter((id) => customIds.has(id));
  if (customIdsInProgram.length) {
    throw new Error(`Generated program contains custom exercise IDs: ${customIdsInProgram.join(', ')}`);
  }
  const fallbackIdsInProgram = [...programIds].filter((id) => fallbackIds.has(id) && !eligible.some((row) => String(row.id) === id));
  if (fallbackIdsInProgram.length) {
    throw new Error(`Generated program contains FALLBACK_CATALOG IDs: ${fallbackIdsInProgram.join(', ')}`);
  }

  const report = {
    generated_at: new Date().toISOString(),
    catalog_source: usedFallback ? 'FALLBACK_CATALOG' : 'enriched_active_production',
    supabase_active_rows: active.length,
    ai_candidate_rows: adapted.length,
    enriched_master_rows: enriched.length,
    custom_candidate_rows: customCandidates.length,
    custom_ids_in_program: customIdsInProgram,
    adapted_active: adapted.length,
    enriched_rows_in_library: enriched.length,
    method: pipeline.method,
    model: pipeline.run.model,
    api: pipeline.run.api,
    reasoning_effort: pipeline.run.reasoningEffort,
    latency_ms: pipeline.run.latencyMs,
    input_tokens: pipeline.run.inputTokens,
    output_tokens: pipeline.run.outputTokens,
    reasoning_tokens: pipeline.run.reasoningTokens,
    repairs: pipeline.run.repairAttempts,
    ai_error: pipeline.aiError,
    validation: pipeline.validation,
    quality_warnings: pipeline.qualityWarnings,
    program: pipeline.run.program || pipeline.program,
    science_week: week1,
    weekly_muscle_volume: volume,
    movement_pattern_distribution: patterns,
    fatigue_distribution: fatigue,
    duration_estimates: durations,
    metadata_problems: metadataProblems,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ wrote: OUT, catalog_source: report.catalog_source, method: report.method, repairs: report.repairs, adapted_active: report.adapted_active }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
