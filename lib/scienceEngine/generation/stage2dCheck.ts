/**
 * Stage 2D: seed preflight, coordinated repair, duration target, working structure.
 */
import { FALLBACK_CATALOG } from '../catalogAdapter';
import { classifySessionDuration, durationBands } from '../duration';
import { generateProgram } from '../generateProgram';
import { trainingProfileFromSources } from '../profile';
import { scienceProgramToAiPlan } from '../toAiPlan';
import { validateProgram } from '../validator';
import { buildGenerationContext } from './context';
import { resolveHardRequirements } from './hardRequirements';
import { parseWorkingStructure } from './workingStructure';
import { runGenerationPipeline } from './orchestrator';
import { generationRunDiagnostics } from './log';
import { requiredRepairs, repairAiProgram } from './repairAiProgram';
import { validateAiProgram } from './validateAiProgram';
import type { AiStrengthExercise, AiWeekProgram, AiWorkoutPlan } from './types';
import { inspectWorkingStructure, isCoreExercise, isCoreMovement } from './workingStructure';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function idOf(name: string): string {
  const hit = FALLBACK_CATALOG.find((ex) => ex.name === name);
  if (!hit?.id) throw new Error(`Fallback catalog missing ${name}`);
  return String(hit.id);
}

function lift(name: string, role: AiStrengthExercise['role'], extra?: Partial<AiStrengthExercise>): AiStrengthExercise {
  return {
    exercise_id: idOf(name),
    role,
    working_sets: role === 'primary' ? 3 : 2,
    rep_min: role === 'primary' ? 6 : 8,
    rep_max: role === 'primary' ? 8 : 12,
    target_rir: 2,
    rest_seconds: role === 'primary' ? 120 : 75,
    reps_per_side: /row|lunge|split|single|one-arm/i.test(name),
    measurement_type: 'reps',
    why: `${role} work for ${name}`,
    ...extra,
  };
}

const STRUCTURE_NOTES =
  'Set up the workouts to start and end with glute exercises. In the middle do a push/pull superset and a core exercise.';

function gluteProfile() {
  return trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'hypertrophy', birth_year: 1990 },
    trainingProfile: {
      warmup_style: 'dynamic',
      warmup_duration: 'standard',
      preferred_session_minutes: 45,
      available_equipment: ['barbell', 'dumbbell', 'cable', 'machine'],
    },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      weeks: 1,
      sessionMinutes: 45,
      primaryGoal: 'hypertrophy',
      experienceLevel: 'intermediate',
      focusMuscles: ['Glutes'],
      availableEquipment: ['barbell', 'dumbbell', 'cable', 'machine'],
      intakeNotes: `Intermediate hypertrophy. 3 days Monday Wednesday Friday. 45 minutes. Glute priority. ${STRUCTURE_NOTES}`,
    },
  });
}

function structuredDay(
  label: string,
  pair: [string, string],
  extra: string
): AiWorkoutPlan {
  return {
    day_label: label,
    name: `${label} glute session`,
    emphasis: 'Glute priority with a middle push/pull pair',
    estimated_minutes: 44,
    warmup: [{ exercise_id: idOf('Glute Bridge'), sets: 1, prescription: '8', why: 'Prep glutes' }],
    potentiation: [],
    strength: [
      { type: 'straight_sets', exercises: [lift('Hip Thrust', 'primary')] },
      {
        type: 'superset',
        exercises: [
          lift(pair[0], 'secondary', { rest_seconds: 90 }),
          lift(pair[1], 'secondary', { rest_seconds: 90 }),
        ],
      },
      { type: 'straight_sets', exercises: [lift(extra, extra === 'Plank' ? 'accessory' : 'secondary', { rest_seconds: extra === 'Plank' ? 45 : 90 })] },
      { type: 'straight_sets', exercises: [lift('Plank', 'accessory', { rest_seconds: 45, measurement_type: 'time' })] },
      { type: 'straight_sets', exercises: [lift('Cable Kickback', 'isolation')] },
    ],
    cooldown: [{ exercise_id: idOf('Hamstring Stretch'), sets: 1, prescription: '30 sec', why: 'Ease hamstrings' }],
  };
}

function structuredWeek(): AiWeekProgram {
  return {
    schema_version: '2.1',
    summary: 'Glute-priority week with the requested working order.',
    coaching_notes: 'Keep the opener and closer as glute work.',
    workouts: [
      structuredDay('Mon', ['Cable Chest Fly', 'Dumbbell Row'], 'Goblet Squat'),
      structuredDay('Wed', ['Overhead Press', 'Lat Pulldown'], 'Romanian Deadlift'),
      structuredDay('Fri', ['Incline Dumbbell Press', 'Lat Pulldown'], 'Walking Lunge'),
    ],
  };
}

function brokenStructureWeek(): AiWeekProgram {
  return {
    schema_version: '2.1',
    summary: 'Order is wrong',
    coaching_notes: '',
    workouts: ['Mon', 'Wed', 'Fri'].map((label) => ({
      day_label: label,
      name: `${label} out of order`,
      emphasis: 'Needs repair',
      estimated_minutes: 44,
      warmup: [{ exercise_id: idOf('Scapular Push-Up'), sets: 1, prescription: '8', why: 'Scap prep' }],
      potentiation: [],
      strength: [
        { type: 'straight_sets', exercises: [lift('Barbell Bench Press', 'primary')] },
        { type: 'straight_sets', exercises: [lift('Hip Thrust', 'secondary')] },
        { type: 'straight_sets', exercises: [lift('Dumbbell Row', 'secondary')] },
        { type: 'straight_sets', exercises: [lift('Conventional Deadlift', 'primary')] },
        { type: 'straight_sets', exercises: [lift('Back Squat', 'primary')] },
        { type: 'straight_sets', exercises: [lift('Plank', 'accessory', { rest_seconds: 45, measurement_type: 'time' })] },
        { type: 'straight_sets', exercises: [lift('Cable Kickback', 'isolation')] },
      ],
      cooldown: [],
    })),
  };
}

function heavyRequestedPairWeek(): AiWeekProgram {
  return {
    schema_version: '2.1',
    summary: 'Glute week with a heavy antagonist pair the user requested.',
    coaching_notes: '',
    workouts: ['Mon', 'Wed', 'Fri'].map((label) => ({
      day_label: label,
      name: `${label} heavy pair`,
      emphasis: 'Keep the requested push/pull superset',
      estimated_minutes: 44,
      warmup: [{ exercise_id: idOf('Glute Bridge'), sets: 1, prescription: '8', why: 'Prep glutes' }],
      potentiation: [],
      strength: [
        { type: 'straight_sets', exercises: [lift('Hip Thrust', 'primary', { rest_seconds: 150 })] },
        {
          type: 'superset',
          exercises: [
            lift('Barbell Bench Press', 'secondary', { rest_seconds: 90 }),
            lift('Dumbbell Row', 'secondary', { rest_seconds: 90 }),
          ],
        },
        { type: 'straight_sets', exercises: [lift('Plank', 'accessory', { rest_seconds: 45, measurement_type: 'time' })] },
        { type: 'straight_sets', exercises: [lift('Cable Kickback', 'isolation')] },
      ],
      cooldown: [{ exercise_id: idOf('Hamstring Stretch'), sets: 1, prescription: '30 sec', why: 'Ease hamstrings' }],
    })),
  };
}

function mockCall(program: AiWeekProgram) {
  return async () => ({
    program,
    raw: { output: [] },
    model: 'gpt-5.4',
    api: 'responses' as const,
    reasoningEffort: 'low' as const,
    inputTokens: 800,
    outputTokens: 900,
    reasoningTokens: 100,
    error: null,
  });
}

export async function runStage2dChecks() {
  const fortyFive = durationBands(45);
  assert(fortyFive.requested === 45 && fortyFive.advisoryLimit === 45 && fortyFive.hardLimit === 53, `45-minute bands should aim at 45 and reject after 53, got ${JSON.stringify(fortyFive)}`);
  assert(classifySessionDuration(50, 45).over === 'warning', '50 vs 45 is advisory, not the preferred length');
  assert(classifySessionDuration(45, 45).over === 'ok', '45 vs 45 is on target');
  assert(classifySessionDuration(54, 45).over === 'error', '54 vs 45 exceeds the hard limit');

  const parsed = parseWorkingStructure(STRUCTURE_NOTES);
  assert(parsed?.openMuscle === 'glutes' && parsed.closeMuscle === 'glutes', 'Must parse start/end glute work');
  assert(parsed.middlePushPullSuperset && parsed.middleCore, 'Must parse middle push/pull superset and core');
  assert(
    isCoreMovement({ name: 'Cable Chop', movement_pattern: 'rotation', primary_muscles: ['obliques'] }),
    'Cable Chop must count as core/rotation'
  );
  assert(
    isCoreMovement({ name: 'Cable Chop', movement_pattern: 'other' }),
    'Cable Chop must count as core by name even if the pattern is generic'
  );
  const hard = resolveHardRequirements(`Intermediate hypertrophy. ${STRUCTURE_NOTES}`, { sessionMinutes: 45 });
  assert(hard.workingStructure?.middlePushPullSuperset, 'Hard requirements must keep the working-portion structure');

  const profile = gluteProfile();
  const seed = generateProgram(profile, FALLBACK_CATALOG);
  const seedCheck = validateProgram(seed, profile);
  assert(
    !seedCheck.issues.some((issue) => issue.severity === 'error' && issue.code !== 'DURATION' && issue.code !== 'DURATION_OVER'),
    `Science seed safety failed: ${seedCheck.issues.map((issue) => issue.message).join('; ')}`
  );

  let modelCalls = 0;
  const reached = await runGenerationPipeline({
    profile,
    catalog: FALLBACK_CATALOG,
    userPrompt: profile.intakeNotes || STRUCTURE_NOTES,
    programName: 'Stage 2D glute',
    apiKey: 'test-key',
    requestFn: async (args) => {
      modelCalls += 1;
      assert(args.apiKey === 'test-key', 'Pipeline must pass the configured API key to the model');
      return mockCall(structuredWeek())();
    },
  });
  assert(modelCalls === 1, `3x45 glute request must reach the model, calls=${modelCalls}`);
  assert(
    reached.method === 'ai' || reached.method === 'ai_repaired',
    `Expected an AI method after the model returned a structured week, got ${reached.method}: ${reached.aiError || ''}; final ${reached.validation.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => issue.message)
      .join('; ')}`
  );
  assert(reached.openaiCalls === 1, 'Live-configured request must record one model call');
  assert(reached.validation.ok, 'final_ok must mean no remaining error-severity issues');
  const diag = generationRunDiagnostics(reached.run);
  assert(diag.original_ai && (diag.original_ai.days || []).length === 3, 'Diagnostics must keep the original AI week');
  assert(Array.isArray(diag.required_repairs) && Array.isArray(diag.optional_repairs), 'Diagnostics must split required and optional repairs');
  assert(Array.isArray(diag.remaining_warnings), 'Diagnostics must keep advisory warnings separately from errors');
  assert((diag.remaining_errors || []).length === 0, 'A passing week must not record remaining hard errors');

  const { context, catalogById } = buildGenerationContext({
    profile,
    program: seed,
    catalog: FALLBACK_CATALOG,
    userPrompt: profile.intakeNotes || STRUCTURE_NOTES,
    programName: 'Stage 2D glute',
    mode: 'full_program',
  });
  const library = new Map(context.candidate_library.map((ex) => [ex.exercise_id, ex]));
  assert(isCoreExercise(library.get(idOf('Pallof Press'))), 'Validator core helper must recognize Pallof Press');
  assert(isCoreExercise(library.get(idOf('Plank'))), 'Validator core helper must recognize Plank');
  const valid = validateAiProgram(structuredWeek(), context, catalogById);
  assert(valid.ok, `Structured week should validate: ${valid.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join('; ')}`);
  const heavyPair = validateAiProgram(heavyRequestedPairWeek(), context, catalogById);
  assert(
    !heavyPair.issues.some((issue) => issue.code === 'SUPERSET_HEAVY_PAIR' && issue.severity === 'error'),
    `Requested push/pull pair must not be a hard error: ${heavyPair.issues.map((issue) => issue.message).join('; ')}`
  );
  structuredWeek().workouts.forEach((workout) => {
    const inspect = inspectWorkingStructure(workout, parsed!, library);
    assert(inspect.ok, `${workout.day_label} structure failed: ${inspect.misses.join('; ')}`);
  });

  const repaired = repairAiProgram(brokenStructureWeek(), context, catalogById);
  assert(
    repaired.repairs.some((repair) => repair.code === 'WORKING_STRUCTURE'),
    `Repair must restore working structure, got ${repaired.repairs.map((repair) => repair.action).join('; ')}`
  );
  const after = validateAiProgram(repaired.program, context, catalogById);
  assert(
    !after.issues.some((issue) => issue.code === 'WORKING_STRUCTURE' && issue.severity === 'error'),
    `Repaired week still breaks structure: ${after.issues.filter((issue) => issue.code === 'WORKING_STRUCTURE').map((issue) => issue.message).join('; ')}`
  );
  repaired.program.workouts.forEach((workout) => {
    const inspect = inspectWorkingStructure(workout, parsed!, library);
    assert(inspect.ok, `Repair left ${workout.day_label} unstructured: ${inspect.misses.join('; ')}`);
    const pair = (workout.strength || []).some((block) => block.type === 'superset' && (block.exercises || []).length >= 2);
    assert(pair, `${workout.day_label} lost the structured superset representation`);
    const names = (workout.strength || []).flatMap((block) => block.exercises || []).map((ex) => library.get(ex.exercise_id)?.name || ex.exercise_id);
    assert(names[0] === 'Hip Thrust', `${workout.day_label} should open with Hip Thrust, got ${names[0]}`);
    assert(names[names.length - 1] === 'Cable Kickback', `${workout.day_label} should close with Cable Kickback, not ${names[names.length - 1]}`);
    assert(names[names.length - 1] !== 'Back Squat', `${workout.day_label} used Back Squat as a glute closer`);
    assert(names[names.length - 1] !== 'Conventional Deadlift', `${workout.day_label} used Conventional Deadlift as a glute closer`);
  });

  const keptPair = repairAiProgram(heavyRequestedPairWeek(), context, catalogById);
  keptPair.program.workouts.forEach((workout) => {
    const pair = (workout.strength || []).find((block) => block.type === 'superset' && (block.exercises || []).length >= 2);
    const pairNames = (pair?.exercises || []).map((ex) => library.get(ex.exercise_id)?.name).join(' + ');
    assert(
      pairNames.includes('Barbell Bench Press') && pairNames.includes('Dumbbell Row'),
      `${workout.day_label} repair split the requested heavy push/pull pair: ${pairNames || 'none'}`
    );
  });

  const optionalOnly = repairAiProgram(structuredWeek(), context, catalogById);
  assert(requiredRepairs(optionalOnly.repairs).length === 0, `A valid structured week should not need required repairs: ${optionalOnly.repairs.map((repair) => repair.action).join('; ')}`);

  const persist = scienceProgramToAiPlan(reached.program, { programName: 'Stage 2D glute' });
  const week1 = reached.program.workouts.filter((workout) => workout.week === 1);
  const saved = (persist.workouts || []).filter((workout) => Number(workout.week) === 1);
  assert(week1.length === saved.length, 'Persisted day count must match the validated week');
  week1.forEach((workout, index) => {
    const names = workout.exercises.map((ex) => ex.name).join('|');
    const savedNames = (saved[index].strength || [])
      .flatMap((block: any) => (block.superset ? block.superset : block.exercises ? block.exercises : [block]))
      .map((ex: any) => ex.name)
      .join('|');
    assert(names === savedNames, `${workout.dayLabel} persist mismatch: ${names} vs ${savedNames}`);
  });

  const prompt = (await import('./prompt')).buildDesignerInstructions(context);
  assert(/working-portion structure/i.test(prompt), 'Prompt must describe the requested working-portion structure');
  assert(/prefer loadable/i.test(prompt), 'Prompt must prefer progressive gym lifts when equipment exists');

  const bodyweightOnly = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'hypertrophy', birth_year: 1990 },
    trainingProfile: {
      warmup_style: 'dynamic',
      warmup_duration: 'standard',
      preferred_session_minutes: 45,
      available_equipment: ['bodyweight'],
    },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      weeks: 1,
      sessionMinutes: 45,
      primaryGoal: 'hypertrophy',
      experienceLevel: 'intermediate',
      focusMuscles: ['Glutes'],
      availableEquipment: ['bodyweight'],
      intakeNotes: `Intermediate hypertrophy. 3 days Monday Wednesday Friday. 45 minutes. Glute priority. ${STRUCTURE_NOTES}`,
    },
  });
  const blocked = await runGenerationPipeline({
    profile: bodyweightOnly,
    catalog: FALLBACK_CATALOG,
    userPrompt: bodyweightOnly.intakeNotes || STRUCTURE_NOTES,
    programName: 'Stage 2D equipment hard fail',
    apiKey: 'test-key',
    requestFn: mockCall(structuredWeek()),
  });
  assert(blocked.method === 'science_fallback', `Protected structure must not accept leftover hard errors, got ${blocked.method}`);
  assert(!blocked.validation.ok, 'final_ok must stay false when hard programming errors remain');
  assert(
    blocked.validation.issues.some((issue) => issue.severity === 'error'),
    `Expected leftover error-severity issues, got ${blocked.validation.issues.map((issue) => `${issue.severity}:${issue.code}`).join(', ')}`
  );

  console.log('BIQ-0270 Stage 2D coordinated repair and seed-preflight checks passed');
}
