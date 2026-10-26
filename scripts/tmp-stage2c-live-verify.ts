/**
 * Stage 2C live generation verification. Read-only: no Supabase writes.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { FALLBACK_CATALOG, adaptCatalog } from '../lib/scienceEngine/catalogAdapter';
import { classifySessionDuration, estimateSessionFromAi } from '../lib/scienceEngine/duration';
import { adaptGenerationCatalog } from '../lib/scienceEngine/generation/catalogEligibility';
import { runGenerationPipeline } from '../lib/scienceEngine/generation/orchestrator';
import { libraryById } from '../lib/scienceEngine/generation/library';
import { programModelName } from '../lib/scienceEngine/generation/openaiClient';
import { trainingProfileFromSources } from '../lib/scienceEngine/profile';
import { scienceProgramToAiPlan } from '../lib/scienceEngine/toAiPlan';
import { SCIENCE_ENGINE_VERSION } from '../lib/scienceEngine/version';
import type { CatalogExercise, TrainingProfile } from '../lib/scienceEngine/types';

const OUT = path.join(process.cwd(), 'scripts/tmp-stage2c-live-verify-report.json');

function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return false;
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
  return true;
}

function flattenStrength(workout: any): any[] {
  return (workout.strength || []).flatMap((block: any) => {
    if (block?.superset) return block.superset;
    if (block?.exercises) return block.exercises;
    return [block];
  });
}

function namesOf(items: Array<{ name?: string }> | undefined) {
  return (items || []).map((item) => item.name).filter(Boolean);
}

async function loadCatalog(): Promise<{ catalog: CatalogExercise[]; source: string; note: string | null }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    return { catalog: adaptCatalog(FALLBACK_CATALOG), source: 'FALLBACK_CATALOG', note: 'Supabase credentials were not available. Used the local fallback catalog.' };
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('st_exercise_catalog').select('*').order('name').range(from, from + 999);
    if (error) {
      return { catalog: adaptCatalog(FALLBACK_CATALOG), source: 'FALLBACK_CATALOG', note: `Catalog read failed (${error.message}). Used the local fallback catalog.` };
    }
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
    from += 1000;
  }
  const adapted = adaptGenerationCatalog(rows, { allowFallback: false });
  if (adapted.length < 40) {
    return { catalog: adaptCatalog(FALLBACK_CATALOG), source: 'FALLBACK_CATALOG', note: `Live catalog returned ${adapted.length} eligible rows. Used the local fallback catalog.` };
  }
  return { catalog: adapted, source: 'st_exercise_catalog', note: null };
}

function persistMatch(pipeline: Awaited<ReturnType<typeof runGenerationPipeline>>) {
  const plan = scienceProgramToAiPlan(pipeline.program, { programName: 'verify' });
  const week1Science = (pipeline.program.workouts || []).filter((workout) => workout.week === 1);
  const week1Plan = (plan.workouts || []).filter((workout: any) => Number(workout.week) === 1);
  const mismatches: string[] = [];
  if (week1Science.length !== week1Plan.length) {
    mismatches.push(`Day count science ${week1Science.length} vs persist ${week1Plan.length}`);
  }
  week1Science.forEach((workout, index) => {
    const saved = week1Plan[index];
    if (!saved) return;
    const scienceNames = (workout.exercises || []).map((ex) => ex.name);
    const savedNames = flattenStrength(saved).map((ex: any) => ex.name);
    if (scienceNames.join('|') !== savedNames.join('|')) {
      mismatches.push(`${workout.dayLabel} working lifts differ: science [${scienceNames.join(', ')}] persist [${savedNames.join(', ')}]`);
    }
    const scienceWarm = namesOf(workout.warmup);
    const savedWarm = namesOf(saved.warmup);
    if (scienceWarm.join('|') !== savedWarm.join('|')) {
      mismatches.push(`${workout.dayLabel} warm-up differs: science [${scienceWarm.join(', ')}] persist [${savedWarm.join(', ')}]`);
    }
    const sciencePrimer = namesOf(workout.potentiation);
    const savedPrimer = namesOf(saved.primer);
    if (sciencePrimer.join('|') !== savedPrimer.join('|')) {
      mismatches.push(`${workout.dayLabel} primer differs: science [${sciencePrimer.join(', ')}] persist [${savedPrimer.join(', ')}]`);
    }
  });
  return { matched: mismatches.length === 0, mismatches, persist_days: week1Plan.length };
}

function inspectCase(label: string, profile: TrainingProfile, pipeline: Awaited<ReturnType<typeof runGenerationPipeline>>) {
  const library = libraryById({
    candidate_library: pipeline.run.context?.candidate_library || [],
    warmup_library: pipeline.run.context?.warmup_library || [],
    cooldown_library: pipeline.run.context?.cooldown_library || [],
  });
  const minutes = profile.preferredSessionMinutes;
  const week1 = (pipeline.program.workouts || []).filter((workout) => workout.week === 1);
  const finalAi = pipeline.run.program;
  const issues = pipeline.initialValidation?.issues || [];
  const days = week1.map((workout) => {
    const ai = finalAi?.workouts?.find((row) => row.day_label === workout.dayLabel);
    const estimated = ai ? estimateSessionFromAi(ai, library, { experienceLevel: profile.experienceLevel }) : workout.estimatedMinutes;
    const exercises = workout.exercises || [];
    return {
      day: workout.dayLabel,
      name: workout.name,
      estimated_minutes: estimated,
      science_estimated_minutes: workout.estimatedMinutes,
      duration_class: classifySessionDuration(estimated, minutes),
      working_count: exercises.length,
      working: exercises.map((ex) => ({
        name: ex.name,
        role: ex.role,
        sets: ex.sets,
        reps: `${ex.repMin}-${ex.repMax}`,
        rest: ex.restSeconds,
        pattern: ex.movementPattern,
        superset: ex.supersetGroupId || null,
        warmup_sets: (ex.setDetails || []).filter((set) => set.setType === 'warmup').length,
      })),
      warmup: namesOf(workout.warmup),
      primer: namesOf(workout.potentiation),
      cooldown: namesOf(workout.cooldown),
    };
  });
  return {
    label,
    method: pipeline.method,
    outcome: pipeline.outcome,
    model: pipeline.run.model,
    science_version: pipeline.run.scienceVersion,
    prompt_version: pipeline.run.promptVersion,
    openai_calls: pipeline.openaiCalls,
    ai_error: pipeline.aiError,
    initial_ok: pipeline.initialValidation?.ok ?? false,
    initial_errors: issues.filter((issue) => issue.severity === 'error'),
    initial_warnings: issues.filter((issue) => issue.severity !== 'error'),
    final_ok: pipeline.validation?.ok ?? false,
    final_issues: pipeline.validation?.issues || [],
    repairs: pipeline.repairs || [],
    days,
    persist: persistMatch(pipeline),
  };
}

function case1() {
  const notes = 'Intermediate. Build muscle / hypertrophy. 3 days Monday Wednesday Friday. 60 minutes. Hybrid / full body. Chest priority. Balanced variety. Supersets: let BuildIQ decide.';
  const profile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'hypertrophy', birth_year: 1990 },
    trainingProfile: {
      warmup_style: 'dynamic',
      warmup_duration: 'standard',
      variety_preference: 'balanced',
      superset_preference: 'sometimes',
      preferred_session_minutes: 60,
      potentiation_preference: 'automatic',
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
      trainingSplit: 'hybrid',
      focusMuscles: ['Chest'],
      intakeNotes: notes,
    },
  });
  return { profile, prompt: notes, name: 'Stage 2C live A hypertrophy 3x60' };
}

function case2() {
  const notes =
    'Athletic performance. Intermediate. 2 days, Monday and Friday. 45 minutes. Both days should use the same workout. Emphasize upper-body push and lower-body pull. Priority chest, hamstrings, and glutes. De-emphasize upper back, lats, and quads.';
  const profile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'athletic_performance', birth_year: 1990 },
    trainingProfile: {
      warmup_style: 'dynamic',
      warmup_duration: 'standard',
      preferred_session_minutes: 45,
      superset_preference: 'sometimes',
    },
    config: {
      days: ['Mon', 'Fri'],
      dayTypes: { Mon: 'Full Body', Fri: 'Full Body' },
      weeks: 1,
      sessionMinutes: 45,
      primaryGoal: 'athletic_performance',
      experienceLevel: 'intermediate',
      focusMuscles: ['Chest', 'Hamstrings', 'Glutes'],
      intakeNotes: notes,
      supersetPreference: 'sometimes',
    },
  });
  return { profile, prompt: notes, name: 'Stage 2C live B athletic 2x45' };
}

function case3() {
  const notes =
    'Intermediate hypertrophy. 3 days Monday Wednesday Friday. 45 minutes. Glute priority. Start and end the working portion with glute exercises. In the middle include a push/pull superset and a core exercise.';
  const profile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'hypertrophy', birth_year: 1990 },
    trainingProfile: {
      warmup_style: 'dynamic',
      warmup_duration: 'standard',
      preferred_session_minutes: 45,
      variety_preference: 'balanced',
      superset_preference: 'sometimes',
      potentiation_preference: 'automatic',
    },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      weeks: 1,
      sessionMinutes: 45,
      primaryGoal: 'hypertrophy',
      experienceLevel: 'intermediate',
      focusMuscles: ['Glutes'],
      varietyPreference: 'balanced',
      supersetPreference: 'sometimes',
      intakeNotes: notes,
    },
  });
  return { profile, prompt: notes, name: 'Stage 2C live C glute 3x45' };
}

function requirementReview(id: string, inspected: ReturnType<typeof inspectCase>, profile: TrainingProfile) {
  const kept: string[] = [];
  const missed: string[] = [];
  const concerns: string[] = [];
  if (id === 'A') {
    inspected.days.forEach((day) => {
      if (day.primer.length) missed.push(`${day.day} included a hypertrophy primer (${day.primer.join(', ')})`);
      else kept.push(`${day.day} omitted a power primer`);
      if (day.warmup.length < 1 || day.warmup.length > 3) concerns.push(`${day.day} warm-up count ${day.warmup.length}`);
      else kept.push(`${day.day} warm-up stayed targeted (${day.warmup.join(', ') || 'none'})`);
      if (day.duration_class.over === 'error') missed.push(`${day.day} is ${day.estimated_minutes} min vs 60`);
      else if (day.duration_class.over === 'warning') concerns.push(`${day.day} is ${day.estimated_minutes} min vs 60`);
      else kept.push(`${day.day} duration ${day.estimated_minutes} min`);
      if (day.working.some((ex) => /pull-?up|chin-?up|dip|push-?up/i.test(ex.name) && ex.warmup_sets > 0)) {
        concerns.push(`${day.day} assigned bodyweight ramp sets`);
      }
    });
    const chestDays = inspected.days.filter((day) => day.working.some((ex) => /bench|chest|fly|pec|dip/i.test(ex.name))).length;
    if (chestDays >= 2) kept.push('Chest work appears on at least two days');
    else missed.push('Chest priority is thin across the week');
  }
  if (id === 'B') {
    const signatures = inspected.days.map((day) => day.working.map((ex) => `${ex.name}|${ex.sets}|${ex.reps}`).join('||'));
    if (signatures.length >= 2 && signatures.every((row) => row === signatures[0] && row.length > 0)) kept.push('Monday and Friday are identical');
    else missed.push(`Identical-day request was not kept: ${signatures.join(' vs ')}`);
    const patterns = new Set(inspected.days.flatMap((day) => day.working.map((ex) => ex.pattern)));
    if (patterns.has('horizontal_push') || patterns.has('vertical_push')) kept.push('Upper-body push is present');
    else missed.push('Upper-body push is missing');
    if (patterns.has('hinge')) kept.push('Lower-body pull / hinge is present');
    else missed.push('Lower-body pull is missing');
    if (inspected.days.some((day) => day.working.some((ex) => /row|pulldown|pull-?up/i.test(ex.name)))) {
      concerns.push('A pull was included even though the request de-emphasized upper back and lats');
    }
    inspected.days.forEach((day) => {
      if (day.duration_class.over === 'error') missed.push(`${day.day} is ${day.estimated_minutes} min vs 45`);
      else if (day.duration_class.over === 'warning') concerns.push(`${day.day} is ${day.estimated_minutes} min vs 45`);
      else kept.push(`${day.day} duration ${day.estimated_minutes} min`);
    });
  }
  if (id === 'C') {
    inspected.days.forEach((day) => {
      const first = day.working[0];
      const last = day.working[day.working.length - 1];
      const glute = (name: string) => /glute|hip thrust|kickback|hip abduction|frog pump|pull-through|rdl|deadlift|lunge|squat|step-?up/i.test(name);
      if (first && glute(first.name)) kept.push(`${day.day} starts with ${first.name}`);
      else missed.push(`${day.day} starts with ${first?.name || 'nothing'}, not a glute lift`);
      if (last && glute(last.name)) kept.push(`${day.day} ends with ${last.name}`);
      else missed.push(`${day.day} ends with ${last?.name || 'nothing'}, not a glute lift`);
      const hasSuperset = day.working.some((ex) => ex.superset);
      if (hasSuperset) kept.push(`${day.day} has a superset`);
      else missed.push(`${day.day} has no push/pull superset`);
      if (day.working.some((ex) => /plank|pallof|dead bug|crunch|carry|core/i.test(ex.name) || ex.pattern.startsWith('core'))) {
        kept.push(`${day.day} includes core work`);
      } else missed.push(`${day.day} is missing a core exercise`);
      if (day.primer.length) missed.push(`${day.day} included a hypertrophy primer (${day.primer.join(', ')})`);
      if (day.duration_class.over === 'error') missed.push(`${day.day} is ${day.estimated_minutes} min vs 45`);
      else if (day.duration_class.over === 'warning') concerns.push(`${day.day} is ${day.estimated_minutes} min vs 45`);
      else kept.push(`${day.day} duration ${day.estimated_minutes} min`);
    });
  }
  if (!inspected.persist.matched) concerns.push(`Persist map mismatch: ${inspected.persist.mismatches.join('; ')}`);
  else kept.push('In-memory persist payload matches the final science week');
  if (profile.hardRequirements?.identicalDays && id === 'B') kept.push('Hard requirement parser saw identical days');
  return { kept, missed, concerns };
}

async function main() {
  const envLoaded = loadEnvLocal();
  const apiKey = process.env.OPENAI_API_KEY || '';
  const report: any = {
    generated_at: new Date().toISOString(),
    science_version: SCIENCE_ENGINE_VERSION,
    model: programModelName(),
    env_loaded: envLoaded,
    has_openai_key: Boolean(apiKey),
    live: false,
    limitation: null as string | null,
    catalog_source: null,
    cases: [] as any[],
  };
  if (!apiKey) {
    report.limitation = 'OPENAI_API_KEY is not set. Live model verification did not run.';
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ live: false, limitation: report.limitation }, null, 2));
    return;
  }
  const loaded = await loadCatalog();
  report.catalog_source = loaded.source;
  report.catalog_note = loaded.note;
  report.catalog_count = loaded.catalog.length;
  const cases = [
    { id: 'A', ...case1() },
    { id: 'B', ...case2() },
    { id: 'C', ...case3() },
  ];
  for (const item of cases) {
    const started = Date.now();
    try {
      const pipeline = await runGenerationPipeline({
        profile: item.profile,
        catalog: loaded.catalog,
        userPrompt: item.prompt,
        programName: item.name,
        mode: 'full_program',
        apiKey,
      });
      const inspected = inspectCase(item.id, item.profile, pipeline);
      report.cases.push({
        id: item.id,
        request: {
          goal: item.profile.primaryGoal,
          days: item.profile.preferredDays,
          minutes: item.profile.preferredSessionMinutes,
          notes: item.prompt,
          hard_requirements: pipeline.run.context.hard_requirements,
        },
        wall_ms: Date.now() - started,
        ...inspected,
        requirements: requirementReview(item.id, inspected, item.profile),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.cases.push({
        id: item.id,
        request: {
          goal: item.profile.primaryGoal,
          days: item.profile.preferredDays,
          minutes: item.profile.preferredSessionMinutes,
          notes: item.prompt,
        },
        wall_ms: Date.now() - started,
        live_ai_ran: false,
        method: null,
        outcome: null,
        openai_calls: 0,
        repairs: [],
        days: [],
        error: message,
        persist: { matched: false, mismatches: ['pipeline threw before persist mapping'] },
        requirements: { kept: [], missed: [`Pipeline failed before a live result: ${message}`], concerns: [] },
      });
    }
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  }
  report.live = report.cases.every((row: any) => Number(row.openai_calls || 0) > 0 && row.method);
  if (!report.live && !report.limitation) {
    const blocked = report.cases.filter((row: any) => !row.method);
    if (blocked.length) {
      report.limitation = `Live AI did not complete for ${blocked.map((row: any) => row.id).join(', ')}.`;
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        live: report.live,
        catalog_source: report.catalog_source,
        catalog_count: report.catalog_count,
        cases: report.cases.map((row: any) => ({
          id: row.id,
          method: row.method,
          outcome: row.outcome,
          initial_ok: row.initial_ok,
          final_ok: row.final_ok,
          error: row.error || null,
          repairs: (row.repairs || []).length,
          days: (row.days || []).map((day: any) => ({
            day: day.day,
            minutes: day.estimated_minutes,
            working: day.working_count,
            warmup: day.warmup,
            primer: day.primer,
          })),
          persist_matched: row.persist?.matched ?? false,
          missed: row.requirements?.missed || [],
          concerns: row.requirements?.concerns || [],
        })),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  let existing: any = null;
  try {
    if (fs.existsSync(OUT)) existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    existing = null;
  }
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        ...(existing && typeof existing === 'object' ? existing : {}),
        live: false,
        limitation: message,
        generated_at: existing?.generated_at || new Date().toISOString(),
        fatal: true,
      },
      null,
      2
    )
  );
  console.error(message);
  process.exit(1);
});
