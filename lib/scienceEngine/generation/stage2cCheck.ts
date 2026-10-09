/**
 * Stage 2C designer ownership checks.
 * Imported from lib/scienceEngine/acceptanceCheck.ts
 */
import { FALLBACK_CATALOG } from '../catalogAdapter';
import { generateProgram } from '../generateProgram';
import { isExplosivePrimer } from '../powerPrescription';
import { trainingProfileFromSources } from '../profile';
import { buildGenerationContext } from './context';
import { programMaxOutputTokens } from './openaiClient';
import { runGenerationPipeline } from './orchestrator';
import { buildDesignerInstructions, slimContextForPrompt } from './prompt';
import type { AiStrengthExercise, AiWeekProgram, AiWorkoutPlan } from './types';

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
    working_sets: 3,
    rep_min: role === 'primary' ? 5 : 8,
    rep_max: role === 'primary' ? 8 : 12,
    target_rir: 2,
    rest_seconds: role === 'primary' ? 180 : 90,
    reps_per_side: false,
    measurement_type: 'reps',
    why: `${role} work for ${name}`,
    ...extra,
  };
}

function day(label: string, name: string, emphasis: string, strength: AiWorkoutPlan['strength']): AiWorkoutPlan {
  return {
    day_label: label,
    name,
    emphasis,
    estimated_minutes: 58,
    warmup: [
      { exercise_id: idOf('Goblet Squat'), sets: 1, prescription: '8', why: 'Squat pattern prep' },
      { exercise_id: idOf('Band Row'), sets: 1, prescription: '12', why: 'Pull prep' },
      { exercise_id: idOf('Scapular Push-Up'), sets: 1, prescription: '8', why: 'Scap prep' },
    ],
    potentiation: [],
    strength,
    cooldown: [{ exercise_id: idOf('Hamstring Stretch'), sets: 1, prescription: '30 sec', why: 'Ease hamstrings after lower work' }],
  };
}

function autonomyWeek(): AiWeekProgram {
  return {
    schema_version: '2.0',
    summary: 'Three complementary full-body sessions for hypertrophy.',
    coaching_notes: 'Keep primaries stable and change accessories only if recovery slips.',
    workouts: [
      day('Mon', 'Full Body A', 'Squat and horizontal push', [
        { type: 'straight_sets', exercises: [lift('Back Squat', 'primary')] },
        {
          type: 'straight_sets',
          exercises: [lift('Barbell Bench Press', 'secondary', { working_sets: 4, rep_min: 8, rep_max: 12, rest_seconds: 135, target_rir: 2 })],
        },
        { type: 'superset', exercises: [lift('Dumbbell Row', 'secondary'), lift('Lateral Raise', 'isolation')] },
        { type: 'straight_sets', exercises: [lift('Romanian Deadlift', 'secondary', { working_sets: 2 })] },
        { type: 'straight_sets', exercises: [lift('Plank', 'accessory', { measurement_type: 'time', rep_min: 20, rep_max: 40 })] },
      ]),
      day('Wed', 'Full Body B', 'Hinge and vertical push', [
        { type: 'straight_sets', exercises: [lift('Conventional Deadlift', 'primary', { working_sets: 3, rep_min: 3, rep_max: 5 })] },
        { type: 'straight_sets', exercises: [lift('Overhead Press', 'secondary')] },
        { type: 'straight_sets', exercises: [lift('Lat Pulldown', 'secondary')] },
        { type: 'straight_sets', exercises: [lift('Walking Lunge', 'secondary', { reps_per_side: true })] },
        { type: 'straight_sets', exercises: [lift('Face Pull', 'isolation')] },
      ]),
      day('Fri', 'Full Body C', 'Unilateral and accessory hypertrophy', [
        { type: 'straight_sets', exercises: [lift('Bulgarian Split Squat', 'primary', { reps_per_side: true })] },
        { type: 'straight_sets', exercises: [lift('Incline Dumbbell Press', 'secondary')] },
        { type: 'straight_sets', exercises: [lift('Seated Cable Row', 'secondary')] },
        { type: 'straight_sets', exercises: [lift('Hip Thrust', 'secondary')] },
        { type: 'straight_sets', exercises: [lift('Dumbbell Curl', 'isolation')] },
      ]),
    ],
  };
}

export async function runStage2cChecks() {
  assert(programMaxOutputTokens() === 6000, 'Stage 2C must keep the 6000 output-token cap');
  assert(isExplosivePrimer({ name: 'Goblet Squat', movementPattern: 'squat' }) === false, 'Goblet Squat is not a power primer');
  assert(isExplosivePrimer({ name: 'Medicine-Ball Chest Pass', movementPattern: 'throw' }), 'A medicine-ball throw can be a primer');
  assert(isExplosivePrimer({ name: 'Kettlebell Swing', movementPattern: 'hinge' }), 'A kettlebell swing can be a primer');

  const athletic = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'athletic_performance', birth_year: 1990 },
    trainingProfile: { warmup_style: 'dynamic', warmup_duration: 'standard', preferred_session_minutes: 45 },
    config: {
      days: ['Mon', 'Fri'],
      dayTypes: { Mon: 'Full Body', Fri: 'Full Body' },
      focusMuscles: ['Chest', 'Hamstrings', 'Glutes'],
      sessionMinutes: 45,
      weeks: 4,
      intakeNotes:
        'Athletic performance. Both days should use the same workout. Emphasize upper-body push and lower-body pull. De-emphasize upper back, lats, and quads.',
    },
  });
  const athleticProgram = generateProgram(athletic, FALLBACK_CATALOG);
  const athleticContext = buildGenerationContext({
    profile: athletic,
    program: athleticProgram,
    catalog: FALLBACK_CATALOG,
    userPrompt: athletic.intakeNotes || '',
    programName: 'Athletic',
    mode: 'full_program',
  }).context;
  const athleticPrompt = buildDesignerInstructions(athleticContext);
  assert(athleticPrompt.includes('You propose the week'), 'A prompt must give the designer the prescription');
  assert(!athleticPrompt.includes('The science engine owns weekly set totals'), 'A prompt must stop assigning volume and rest to the engine');
  assert(/athletic performance/i.test(athleticPrompt), 'A prompt must name athletic programming');
  assert(/identical/i.test(athleticPrompt), 'A prompt must keep identical days');
  assert(/upper-body push/i.test(athleticPrompt) && /lower-body pull/i.test(athleticPrompt), 'A prompt must keep the emphasis');
  const athleticSlim = slimContextForPrompt(athleticContext);
  assert(
    athleticSlim.weekly_volume_targets.every((row) => row.minimum_working_sets != null && row.practical_max_sets != null),
    'A context must send the useful minimum and practical maximum'
  );

  const hypertrophy = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'hypertrophy', birth_year: 1990 },
    trainingProfile: { preferred_session_minutes: 60, superset_preference: 'sometimes' },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      sessionMinutes: 60,
      supersetPreference: 'sometimes',
      primaryGoal: 'hypertrophy',
      experienceLevel: 'intermediate',
    },
  });
  const hypertrophyPrompt = buildDesignerInstructions(
    buildGenerationContext({
      profile: hypertrophy,
      program: generateProgram(hypertrophy, FALLBACK_CATALOG),
      catalog: FALLBACK_CATALOG,
      userPrompt: 'Build muscle. 3 days. 60 minutes. Full body. Supersets sometimes.',
      programName: 'Hypertrophy',
      mode: 'full_program',
    }).context
  );
  assert(/hypertrophy/i.test(hypertrophyPrompt), 'B prompt must name hypertrophy volume');
  assert(/Supersets sometimes/i.test(hypertrophyPrompt), 'B prompt must keep supersets selective');
  assert(/horizontal push/i.test(hypertrophyPrompt) && /vertical pull/i.test(hypertrophyPrompt), 'B prompt must ask for weekly pattern coverage');

  const beginner = trainingProfileFromSources({
    profile: { experience_level: 'beginner', primary_goal: 'general_fitness', birth_year: 2000 },
    trainingProfile: { warmup_style: 'dynamic', warmup_duration: 'standard', preferred_session_minutes: 45 },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      sessionMinutes: 45,
      weeks: 4,
      intakeNotes: 'General fitness. Beginner. 3 days. 45 minutes.',
    },
  });
  const beginnerProgram = generateProgram(beginner, FALLBACK_CATALOG);
  beginnerProgram.workouts
    .filter((workout) => workout.week === 1)
    .forEach((workout) => {
      workout.potentiation.forEach((primer) => {
        assert(!/goblet squat/i.test(primer.name), `C used ${primer.name} as a power primer`);
        assert(isExplosivePrimer(primer), `C primer ${primer.name} is not explosive`);
      });
    });
  const beginnerPrompt = buildDesignerInstructions(
    buildGenerationContext({
      profile: beginner,
      program: beginnerProgram,
      catalog: FALLBACK_CATALOG,
      userPrompt: beginner.intakeNotes || '',
      programName: 'Fitness',
      mode: 'full_program',
    }).context
  );
  assert(/general fitness/i.test(beginnerPrompt), 'C prompt must name general fitness');

  const strength = trainingProfileFromSources({
    profile: { experience_level: 'advanced', primary_goal: 'strength', birth_year: 1988 },
    trainingProfile: { preferred_session_minutes: 75 },
    config: {
      days: ['Mon', 'Tue', 'Thu', 'Fri'],
      dayTypes: { Mon: 'Upper Body', Tue: 'Lower Body', Thu: 'Upper Body', Fri: 'Lower Body' },
      sessionMinutes: 75,
      primaryGoal: 'strength',
      experienceLevel: 'advanced',
    },
  });
  const strengthPrompt = buildDesignerInstructions(
    buildGenerationContext({
      profile: strength,
      program: generateProgram(strength, FALLBACK_CATALOG),
      catalog: FALLBACK_CATALOG,
      userPrompt: 'Strength. Advanced. 4 days. 75 minutes.',
      programName: 'Strength',
      mode: 'full_program',
    }).context
  );
  assert(/Goal strength/i.test(strengthPrompt), 'D prompt must prioritize heavy primary lifts and rest');

  const week = autonomyWeek();
  const science = generateProgram(hypertrophy, FALLBACK_CATALOG);
  const templateBench = science.workouts
    .find((workout) => workout.week === 1)
    ?.exercises.find((exercise) => /bench/i.test(exercise.name));
  const run = await runGenerationPipeline({
    profile: hypertrophy,
    catalog: FALLBACK_CATALOG,
    userPrompt: 'Build muscle. 3 days. 60 minutes. Full body. Supersets sometimes.',
    programName: 'Autonomy',
    apiKey: 'test-key',
    requestFn: async () => ({
      program: week,
      raw: { output: [] },
      model: 'gpt-5.4',
      api: 'responses' as const,
      reasoningEffort: 'low' as const,
      inputTokens: 1000,
      outputTokens: 1400,
      reasoningTokens: 200,
      error: null,
    }),
  });
  assert(run.method === 'ai', `E valid AI week was replaced, method ${run.method}: ${run.aiError || ''}`);
  const monday = run.program.workouts.find((workout) => workout.week === 1 && workout.dayLabel === 'Mon');
  const bench = monday?.exercises.find((exercise) => /bench/i.test(exercise.name));
  assert(bench, 'E lost the AI bench press');
  assert(bench!.sets === 4 && bench!.repMin === 8 && bench!.repMax === 12 && bench!.restSeconds === 135, `E bench prescription was normalized to ${bench!.sets}x${bench!.repMin}-${bench!.repMax} rest ${bench!.restSeconds}`);
  assert(
    !templateBench || templateBench.sets !== bench!.sets || templateBench.repMin !== bench!.repMin || templateBench.restSeconds !== bench!.restSeconds,
    'E AI bench matched the template, so the test does not prove autonomy'
  );
  const names = (monday?.exercises || []).map((exercise) => exercise.name);
  const templateNames = science.workouts.find((workout) => workout.week === 1 && workout.dayLabel === 'Mon')?.exercises.map((exercise) => exercise.name) || [];
  assert(names.join('|') !== templateNames.join('|'), 'E Monday was replaced by the science template');
  console.log('BIQ-0258 Stage 2C designer programming checks passed');
}
