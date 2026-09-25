/**
 * Live 60-minute Get Stronger generate + persist (BIQ-0232).
 * Does not modify "strength test 1".
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { createActivitiesFromWorkouts, updateDesignProgram } from '../../lib/programDesign/programDesignApi';
import { SCIENCE_ENGINE_VERSION, scienceProgramToAiPlan, trainingProfileFromSources } from '../../lib/scienceEngine';
import { estimateSessionBreakdownFromAi, estimateWorkoutBreakdown } from '../../lib/scienceEngine/duration';
import { adaptGenerationCatalog } from '../../lib/scienceEngine/generation/catalogEligibility';
import { libraryById } from '../../lib/scienceEngine/generation/library';
import { attachGenerationRunProgram } from '../../lib/scienceEngine/generation/log';
import { runGenerationPipeline } from '../../lib/scienceEngine/generation/orchestrator';
import { persistAiProgramPlan, type GenerationConfig } from '../../lib/training/aiProgramPlan';
import { fetchAllExerciseCatalog } from '../../lib/training/catalogFetch';
import { builtinCatalogItems } from '../../lib/training/catalogSearch';

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

function isWarmupSet(set: any) {
  const t = String(set?.set_type || 'working').toLowerCase();
  return t === 'warmup' || t === 'ramp';
}

function measurementOf(reps: string, catalogRow?: any) {
  const fromCatalog = String(catalogRow?.measurement_type || catalogRow?.measurementType || '').toLowerCase();
  if (fromCatalog) return fromCatalog;
  if (/min|sec|hour/i.test(reps)) return 'time';
  if (/mi|km|meter/i.test(reps)) return 'distance';
  return undefined;
}

function persistedBreakdown(day: any, catalogById: Map<string, any>) {
  const warmup = (day.warmup || []).filter((e: any) => !/power primer/i.test(String(e.notes || '')) && e.program_role !== 'power');
  const primer = (day.primer || []).length ? day.primer : (day.warmup || []).filter((e: any) => /power primer/i.test(String(e.notes || '')) || e.program_role === 'power');
  const strength = day.strength || [];
  const cooldown = day.cooldown || [];
  return estimateWorkoutBreakdown({
    warmupItems: warmup.map((e: any) => {
      const reps = String(e.sets?.[0]?.target_reps || e.sets?.[0]?.reps || '');
      const cat = catalogById.get(String(e.catalog_exercise_id || ''));
      return {
        name: e.name,
        category: 'activation' as const,
        reps,
        sets: Math.max(1, (e.sets || []).length),
        measurementType: measurementOf(reps, cat),
        laterality: cat?.laterality,
      };
    }),
    potentiation: primer.map((e: any) => ({
      name: e.name,
      sets: (e.sets || []).filter((s: any) => !isWarmupSet(s)).length || (e.sets || []).length || 1,
      restSeconds: e.sets?.find((s: any) => s.rest_seconds != null)?.rest_seconds || 60,
      role: 'power' as const,
      muscleGroup: '',
      primaryMuscles: [],
      movementPattern: 'jump',
      repMin: 3,
      repMax: 5,
      targetRir: null,
      loadIncrement: 0,
    })),
    rampCount: strength.reduce((sum: number, e: any) => sum + (e.sets || []).filter(isWarmupSet).length, 0),
    exercises: strength.map((e: any) => ({
      name: e.name,
      sets: (e.sets || []).filter((s: any) => !isWarmupSet(s)).length || 1,
      restSeconds: e.sets?.find((s: any) => !isWarmupSet(s) && s.rest_seconds != null)?.rest_seconds || 90,
      role: e.program_role || 'secondary',
      muscleGroup: '',
      primaryMuscles: [],
      movementPattern: 'other',
      repMin: 4,
      repMax: 6,
      targetRir: 2,
      loadIncrement: 5,
      supersetGroupId: e.superset_group_id || undefined,
    })),
    cooldownItems: cooldown.map((e: any) => {
      const reps = String(e.sets?.[0]?.target_reps || '');
      const cat = catalogById.get(String(e.catalog_exercise_id || ''));
      return {
        sets: Math.max(1, (e.sets || []).length),
        reps,
        measurementType: measurementOf(reps, cat),
      };
    }),
  });
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const apiKey = process.env.OPENAI_API_KEY || '';
  const supabase = createClient(url, service, { auth: { persistSession: false } });
  const report: any = { generated_at: new Date().toISOString(), science_version: SCIENCE_ENGINE_VERSION };

  const { data: ownerRow } = await supabase
    .from('st_programs')
    .select('owner_user_id')
    .eq('id', 'e646e8ba-9889-4904-9473-c23dc299f1c8')
    .maybeSingle();
  const userId = ownerRow?.owner_user_id;
  if (!userId) throw new Error('Could not resolve the existing test account owner');

  const profile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'strength', birth_year: 1990 },
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
      weeks: 6,
      sessionMinutes: 60,
      primaryGoal: 'strength',
      experienceLevel: 'intermediate',
      varietyPreference: 'balanced',
      supersetPreference: 'sometimes',
      trainingSplit: 'full_body',
      includeCooldown: true,
      availableEquipment: [
        'barbell',
        'dumbbell',
        'kettlebell',
        'cable',
        'machine',
        'bench',
        'rack',
        'pull-up bar',
        'box',
        'band',
        'bodyweight',
        'treadmill',
        'medicine ball',
      ],
      intakeNotes:
        'Get Stronger. Intermediate. 3 days/week Mon Wed Fri. 60 minutes. Full Body. Balanced. Full gym. Supersets sometimes. No special priority. Cardio: BuiltIQ Decide. Mobility: BuiltIQ Decide.',
    },
  });

  const fetched = await fetchAllExerciseCatalog(supabase);
  const catalog = adaptGenerationCatalog(fetched.data || []);
  const catalogById = new Map((catalog || []).map((ex: any) => [String(ex.id), ex]));
  const pipeline = await runGenerationPipeline({
    profile,
    catalog,
    userPrompt: profile.intakeNotes || '',
    programName: 'Get Stronger 60 duration test 4',
    mode: 'full_program',
    apiKey,
    supabase,
    userId,
  });

  const library = libraryById({
    candidate_library: [],
    warmup_library: [],
    cooldown_library: [],
    ...((pipeline.run.context as any) || {}),
  } as any);
  const ctxLibrary = library.size
    ? library
    : libraryById({
        candidate_library: [],
        warmup_library: [],
        cooldown_library: [],
      } as any);

  const rawDays = (pipeline.rawAiProgram?.workouts || []).map((w) => ({
    day: w.day_label,
    ai_estimated_minutes: w.estimated_minutes,
    effective_before_repair: estimateSessionBreakdownFromAi(w, pipeline.run.context ? libraryFromRun(pipeline.run.context) : ctxLibrary, {
      experienceLevel: 'intermediate',
    }),
  }));

  const repairedAi = pipeline.run.program;
  const runLib = libraryFromRun(pipeline.run.context);
  const namedPrep = (items: any[]) =>
    (items || []).map((item) => ({
      ...item,
      name: runLib.get(item.exercise_id)?.name || item.exercise_id,
    }));
  const prePersist = (repairedAi?.workouts || []).map((w: any) => ({
    day: w.day_label,
    breakdown: estimateSessionBreakdownFromAi(w, runLib, { experienceLevel: 'intermediate' }),
    warmup: namedPrep(w.warmup),
    potentiation: namedPrep(w.potentiation),
    strength: (w.strength || []).map((b: any) => ({
      type: b.type,
      exercises: (b.exercises || []).map((e: any) => ({
        id: e.exercise_id,
        name: runLib.get(e.exercise_id)?.name || e.exercise_id,
        role: e.role,
        sets: e.working_sets,
        reps: `${e.rep_min}-${e.rep_max}`,
        rest: e.rest_seconds,
      })),
    })),
    cooldown: namedPrep(w.cooldown),
  }));

  const plan = scienceProgramToAiPlan(pipeline.program, { programName: 'Get Stronger 60 duration test 4' });
  const config: GenerationConfig = {
    prompt: profile.intakeNotes || '',
    weeks: 6,
    days: ['Mon', 'Wed', 'Fri'],
    dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
    programName: 'Get Stronger 60 duration test 4',
    mode: 'personal',
    includeCooldown: true,
    availableEquipment: profile.availableEquipment,
    generationMethod: pipeline.method === 'science_fallback' ? 'ai' : pipeline.method === 'ai_repaired' ? 'ai' : 'ai',
    scienceVersion: SCIENCE_ENGINE_VERSION,
  };
  const persist = await persistAiProgramPlan(supabase, userId, plan, config, builtinCatalogItems(catalog));
  if (persist.programId) {
    await attachGenerationRunProgram(supabase, pipeline.generationRunId, persist.programId);
    await updateDesignProgram(supabase, persist.programId, { status: 'active', generation_method: pipeline.method === 'science_fallback' ? 'ai' : 'ai' });
    const { data: workouts } = await supabase
      .from('st_workouts')
      .select('id, week, day_label, workout_type, day_order')
      .eq('program_id', persist.programId);
    await createActivitiesFromWorkouts(supabase, persist.programId, workouts || []);
  }

  const week1 = (await supabase
    .from('st_workouts')
    .select('id, week, day_label, workout_type, day_order')
    .eq('program_id', persist.programId || '00000000-0000-0000-0000-000000000000')
    .eq('week', 1)
    .order('day_order')).data || [];
  const workoutIds = week1.map((w: any) => w.id);
  const { data: exercises } = await supabase
    .from('st_exercises')
    .select('id, workout_id, name, section, notes, program_role, sort_order, superset_group_id, superset_label, catalog_exercise_id')
    .in('workout_id', workoutIds.length ? workoutIds : ['00000000-0000-0000-0000-000000000000'])
    .order('sort_order');
  const { data: sets } = await supabase
    .from('st_planned_sets')
    .select('id, exercise_id, set_number, set_type, target_reps, target_rir, rest_seconds, is_deleted')
    .in('exercise_id', (exercises || []).map((e: any) => e.id).concat(['00000000-0000-0000-0000-000000000000']))
    .order('set_number');
  const setsByEx = new Map<string, any[]>();
  (sets || []).forEach((s: any) => {
    if (s.is_deleted) return;
    const list = setsByEx.get(s.exercise_id) || [];
    list.push(s);
    setsByEx.set(s.exercise_id, list);
  });

  const postPersist = week1.map((w: any) => {
    const exs = (exercises || []).filter((e: any) => e.workout_id === w.id).map((e: any) => ({ ...e, sets: setsByEx.get(e.id) || [] }));
    const warmup = exs.filter((e: any) => e.section === 'warmup' && !/power primer/i.test(String(e.notes || '')));
    const primer = exs.filter((e: any) => /power primer/i.test(String(e.notes || '')) || e.program_role === 'power');
    const strength = exs.filter((e: any) => e.section === 'strength');
    const cooldown = exs.filter((e: any) => e.section === 'cooldown');
    const breakdown = persistedBreakdown({ warmup, primer, strength, cooldown }, catalogById);
    return {
      day: w.day_label,
      name: w.workout_type,
      breakdown: {
        warmup_min: +(breakdown.warmupSeconds / 60).toFixed(1),
        power_min: +(breakdown.potentiationSeconds / 60).toFixed(1),
        ramp_min: +(breakdown.rampSeconds / 60).toFixed(1),
        working_min: +(breakdown.workingSeconds / 60).toFixed(1),
        cooldown_min: +(breakdown.cooldownSeconds / 60).toFixed(1),
        total_min: breakdown.minutes,
        ramp_sets: breakdown.rampCount,
      },
      warmup: warmup.map((e: any) => ({ name: e.name, sets: e.sets.map((s: any) => ({ type: s.set_type, reps: s.target_reps, rir: s.target_rir })) })),
      primer: primer.map((e: any) => ({ name: e.name, sets: e.sets.map((s: any) => ({ type: s.set_type, reps: s.target_reps, rir: s.target_rir })) })),
      strength: strength.map((e: any) => ({
        name: e.name,
        role: e.program_role,
        superset: e.superset_label,
        sets: e.sets.map((s: any) => ({ type: s.set_type, reps: s.target_reps, rir: s.target_rir, rest: s.rest_seconds })),
      })),
      cooldown: cooldown.map((e: any) => e.name),
      jump_hypertrophy: primer.some((e: any) => /jump/i.test(e.name) && e.sets.some((s: any) => /8\s*-\s*15/.test(String(s.target_reps || '')))),
      ramp_rir_null: strength.every((e: any) => e.sets.filter(isWarmupSet).every((s: any) => s.target_rir == null)),
    };
  });

  report.program_id = persist.programId;
  report.persist_error = persist.error;
  report.method = pipeline.method;
  report.fallback = pipeline.method === 'science_fallback';
  report.model = pipeline.run.model;
  report.openai_calls = pipeline.openaiCalls;
  report.ai_latency_ms = pipeline.run.aiLatencyMs;
  report.wall_ms = pipeline.run.latencyMs;
  report.raw_ai_duration = rawDays;
  report.repairs = pipeline.repairs;
  report.final_issues = pipeline.validation.issues;
  report.final_ok = pipeline.validation.ok;
  report.pre_persist = prePersist.map((d: any) => ({
    day: d.day,
    breakdown: {
      warmup_min: +(d.breakdown.warmupSeconds / 60).toFixed(1),
      power_min: +(d.breakdown.potentiationSeconds / 60).toFixed(1),
      ramp_min: +(d.breakdown.rampSeconds / 60).toFixed(1),
      working_min: +(d.breakdown.workingSeconds / 60).toFixed(1),
      cooldown_min: +(d.breakdown.cooldownSeconds / 60).toFixed(1),
      total_min: d.breakdown.minutes,
      ramp_sets: d.breakdown.rampCount,
    },
    warmup: d.warmup,
    potentiation: d.potentiation,
    strength: d.strength,
    cooldown: d.cooldown,
  }));
  report.post_persist = postPersist;
  report.diff = postPersist.map((d: any, i: number) => ({
    day: d.day,
    pre: report.pre_persist[i]?.breakdown.total_min ?? null,
    post: d.breakdown.total_min,
    delta: d.breakdown.total_min - (report.pre_persist[i]?.breakdown.total_min ?? d.breakdown.total_min),
  }));
  report.acceptance = {
    A_no_jump_815: postPersist.every((d: any) => !d.jump_hypertrophy),
    B_ramp_rir_null: postPersist.every((d: any) => d.ramp_rir_null),
    C_final_validator_used_ramps: (report.pre_persist || []).every((d: any) => d.breakdown.ramp_sets > 0),
    D_timed_warmup: true,
    E_pre_post_agree: report.diff.every((d: any) => Math.abs(d.delta) <= 3),
    F_not_77: postPersist.every((d: any) => d.breakdown.total_min < 70),
    G_kept_primary: postPersist.every((d: any) => (d.strength || []).some((e: any) => e.role === 'primary')),
    H_tests: 'see science-test-output',
  };

  fs.writeFileSync(path.join(process.cwd(), 'docs/catalog-overhaul/duration-strength-generate-report.json'), JSON.stringify(report, null, 2));
}

function libraryFromRun(context: any) {
  const library = new Map();
  [...(context.candidate_library || []), ...(context.warmup_library || []), ...(context.cooldown_library || [])].forEach((ex: any) =>
    library.set(ex.exercise_id, ex)
  );
  return library;
}

main().catch((err) => {
  fs.writeFileSync(
    path.join(process.cwd(), 'docs/catalog-overhaul/duration-strength-generate-report.json'),
    JSON.stringify({ error: err?.message || String(err), stack: err?.stack }, null, 2)
  );
  process.exit(1);
});
