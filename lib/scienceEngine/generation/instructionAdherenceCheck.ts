/**
 * BIQ-0247 instruction adherence and warm-up limits.
 * Imported from lib/scienceEngine/acceptanceCheck.ts
 */
import { FALLBACK_CATALOG } from '../catalogAdapter';
import { generateProgram } from '../generateProgram';
import { trainingProfileFromSources } from '../profile';
import { validateProgram } from '../validator';
import { buildGenerationContext } from './context';
import { requestsIdenticalDays, resolveHardRequirements, warmupExerciseBounds } from './hardRequirements';
import { buildDesignerInstructions, slimContextForPrompt } from './prompt';
import { enforceSessionConstraints } from './repairAiProgram';
import { runGenerationPipeline } from './orchestrator';
import { validateAiProgram } from './validateAiProgram';
import type { AiWeekProgram, AiWorkoutPlan } from './types';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function idOf(name: string): string {
  const hit = FALLBACK_CATALOG.find((ex) => ex.name === name);
  if (!hit?.id) throw new Error(`Fallback catalog missing ${name}`);
  return String(hit.id);
}

const EMPHASIS_NOTES =
  'Both workouts must be exactly the same. Upper-body push emphasis. Lower-body pull emphasis. Baseball training.';

function emphasisProfile(minutes = 60) {
  return trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'athletic_performance', birth_year: 1990 },
    trainingProfile: {
      warmup_style: 'dynamic',
      warmup_duration: 'standard',
      potentiation_preference: 'automatic',
      preferred_session_minutes: minutes,
    },
    config: {
      days: ['Mon', 'Fri'],
      dayTypes: { Mon: 'Full Body', Fri: 'Full Body' },
      weeks: 1,
      sessionMinutes: minutes,
      primaryGoal: 'athletic_performance',
      trainingFeel: ['athletic'],
      intakeNotes: EMPHASIS_NOTES,
    },
  });
}

function lift(name: string, role: 'primary' | 'secondary' | 'isolation' | 'accessory', sets = 3) {
  return {
    exercise_id: idOf(name),
    role,
    working_sets: sets,
    rep_min: 6,
    rep_max: 8,
    target_rir: 2,
    rest_seconds: 120,
    reps_per_side: false,
    measurement_type: 'reps' as const,
    why: `${role} ${name}`,
  };
}

function strengthDay(label: string, names: string[]): AiWorkoutPlan {
  return {
    day_label: label,
    name: `Day ${label}`,
    emphasis: label,
    estimated_minutes: 50,
    warmup: ['Goblet Squat', 'Band Row', 'Scapular Push-Up', 'Inchworm', 'Lateral Lunge', 'Glute Bridge'].map((name) => ({
      exercise_id: idOf(name),
      sets: 1,
      prescription: '8',
      why: `Prep ${name}`,
    })),
    potentiation: [{ exercise_id: idOf('Medicine-Ball Chest Pass'), sets: 2, prescription: '4', why: 'Athletic primer' }],
    strength: names.map((name, index) => ({
      type: 'straight_sets' as const,
      exercises: [lift(name, index === 0 ? 'primary' : 'secondary')],
    })),
    cooldown: [],
  };
}

export async function runInstructionAdherenceChecks() {
  const parsed = resolveHardRequirements(EMPHASIS_NOTES, { sessionMinutes: 60, warmupStyle: 'dynamic', warmupDuration: 'standard' });
  assert(parsed.identicalDays, 'Identical-day wording must be a hard requirement');
  assert(parsed.upperPush && parsed.lowerPull, 'Push and lower-pull emphasis must both be recognized');
  assert(parsed.requiredMuscles.includes('chest') && parsed.requiredMuscles.includes('hamstrings') && parsed.requiredMuscles.includes('glutes'), 'Emphasis muscles must be required');
  assert(parsed.waivedMajorMuscles.includes('quads') && parsed.waivedMajorMuscles.includes('lats'), 'Opposite majors are waived, not deleted from the catalog');
  assert(!parsed.waivedMajorMuscles.includes('chest'), 'A required muscle cannot be waived');
  assert(!requestsIdenticalDays('Make the days different, not identical'), 'A rejection of identical days must stay a preference for variety');
  assert(warmupExerciseBounds({ sessionMinutes: 60, warmupStyle: 'dynamic', warmupDuration: 'standard' }).max === 4, 'A standard 60-minute session caps dynamic warm-ups at 4');
  assert(warmupExerciseBounds({ sessionMinutes: 60, warmupDuration: 'extended', extendedWarmup: true }).max === 6, 'An extended warm-up may use up to 6 drills');

  const profile = emphasisProfile(60);
  const program = generateProgram(profile, FALLBACK_CATALOG);
  const scienceCheck = validateProgram(program, profile);
  assert(scienceCheck.ok, `Emphasis fallback should stay valid: ${scienceCheck.issues.map((i) => i.message).join('; ')}`);
  const week = program.workouts.filter((workout) => workout.week === 1);
  assert(week.length === 2, `Expected 2 days, got ${week.length}`);
  const signature = (workout: (typeof week)[number]) => workout.exercises.map((ex) => `${ex.name}|${ex.sets}|${ex.repMin}|${ex.repMax}`).join('||');
  assert(signature(week[0]) === signature(week[1]), `Identical request must reuse one session:\n${signature(week[0])}\n${signature(week[1])}`);
  assert(week[0].name === week[1].name, `Both days should share a name, got ${week[0].name} and ${week[1].name}`);
  const patterns = new Set(week[0].exercises.map((ex) => ex.movementPattern));
  const patternList = Array.from(patterns).join(', ');
  assert(patterns.has('horizontal_push') || patterns.has('vertical_push'), `Session should keep an upper push, got ${patternList}`);
  assert(patterns.has('hinge'), `Session should keep a lower pull, got ${patternList}`);
  week.forEach((workout) => {
    const names = workout.warmup.map((item) => item.name);
    assert(names.length >= 2 && names.length <= 4, `${workout.dayLabel} warm-up count ${names.length} (${names.join(', ')})`);
    assert(new Set(names.map((name) => name.toLowerCase())).size === names.length, `Duplicate warm-ups: ${names.join(', ')}`);
    const primers = workout.potentiation.map((item) => item.name.toLowerCase());
    assert(names.every((name) => !primers.includes(name.toLowerCase())), `Primer leaked into warm-up: ${names.join(', ')}`);
    if (workout.rampFor) assert(!names.includes(workout.rampFor), `Ramp lift ${workout.rampFor} should stay off the warm-up list`);
  });
  assert(
    program.explanations.some((line) => /identical workouts were required/i.test(line)),
    'Fallback should say that identical days were kept'
  );

  const varied = generateProgram(
    trainingProfileFromSources({
      profile: { experience_level: 'intermediate', primary_goal: 'muscle', birth_year: 1990 },
      trainingProfile: { preferred_session_minutes: 60, warmup_style: 'dynamic', warmup_duration: 'standard' },
      config: {
        days: ['Mon', 'Wed', 'Fri'],
        dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
        weeks: 1,
        sessionMinutes: 60,
      },
    }),
    FALLBACK_CATALOG
  );
  const variedWeek = varied.workouts.filter((workout) => workout.week === 1);
  const variedLists = variedWeek.map((workout) => workout.exercises.map((ex) => ex.name).join('|'));
  assert(new Set(variedLists).size === 3, `Unrequested full-body days must stay different: ${variedLists.join(' / ')}`);
  assert(variedWeek[0].name === 'Full Body A' && variedWeek[2].name === 'Full Body C', `A/B/C names should remain, got ${variedWeek.map((w) => w.name).join(', ')}`);

  const { context, catalogById } = buildGenerationContext({
    profile,
    program,
    catalog: FALLBACK_CATALOG,
    userPrompt: EMPHASIS_NOTES,
    programName: 'Baseball emphasis',
    mode: 'full_program',
  });
  const instructions = buildDesignerInstructions(context);
  assert(/identical workouts are required/i.test(instructions), 'Designer instructions must allow identical days when requested');
  assert(!/not cloned days/.test(instructions), 'The anti-clone sentence must not override an identical-day request');
  const payload = slimContextForPrompt(context) as { constraints?: { warmup_minutes?: { min: number } }; hard_requirements?: { identical_days?: boolean } };
  assert(payload.constraints?.warmup_minutes?.min != null, 'Warm-up minutes must be in the model payload');
  assert(payload.hard_requirements?.identical_days === true, 'Hard requirements must be in the model payload');

  const plain = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle' },
    config: { days: ['Mon', 'Wed', 'Fri'], dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' }, sessionMinutes: 60, weeks: 1 },
  });
  const plainContext = buildGenerationContext({
    profile: plain,
    program: generateProgram(plain, FALLBACK_CATALOG),
    catalog: FALLBACK_CATALOG,
    userPrompt: 'Build a training week.',
    programName: 'Variety',
    mode: 'full_program',
  }).context;
  assert(/not cloned days/.test(buildDesignerInstructions(plainContext)), 'Variety request must still forbid cloned days');

  const covered: AiWeekProgram = {
    schema_version: '2.1',
    summary: 'Emphasis week',
    workouts: [
      strengthDay('Mon', ['Barbell Bench Press', 'Romanian Deadlift', 'Hip Thrust']),
      strengthDay('Fri', ['Back Squat', 'Lat Pulldown', 'Dumbbell Row']),
    ],
  };
  const before = validateAiProgram(covered, context, catalogById);
  assert(
    before.issues.some((issue) => issue.code === 'IDENTICAL_DAYS' && issue.severity === 'error'),
    'Different days must fail when identical workouts were required'
  );
  assert(
    before.issues.some((issue) => issue.code === 'WARMUP_COUNT' && issue.severity === 'error'),
    'Six warm-ups must fail the standard cap'
  );
  assert(
    !before.issues.some((issue) => issue.code === 'VOLUME_OFF' && issue.severity === 'error' && /quads/i.test(issue.message)),
    `Waived quads must not hard-fail volume: ${before.issues.filter((i) => i.code === 'VOLUME_OFF').map((i) => i.message).join('; ')}`
  );

  const missingChest: AiWeekProgram = {
    ...covered,
    workouts: [strengthDay('Mon', ['Romanian Deadlift', 'Hip Thrust']), strengthDay('Fri', ['Romanian Deadlift', 'Hip Thrust'])],
  };
  const chestCheck = validateAiProgram(missingChest, context, catalogById);
  assert(
    chestCheck.issues.some((issue) => issue.code === 'VOLUME_OFF' && issue.severity === 'error' && /chest/i.test(issue.message)),
    'Missing a required emphasis muscle must still be an error'
  );

  const noEmphasis = buildGenerationContext({
    profile: plain,
    program: generateProgram(plain, FALLBACK_CATALOG),
    catalog: FALLBACK_CATALOG,
    userPrompt: 'Hypertrophy.',
    programName: 'Hypertrophy',
    mode: 'full_program',
  });
  const quadGap = validateAiProgram(
    { schema_version: '2.1', summary: 'No quads', workouts: [strengthDay('Mon', ['Barbell Bench Press', 'Romanian Deadlift']), strengthDay('Wed', ['Overhead Press', 'Hip Thrust']), strengthDay('Fri', ['Incline Dumbbell Press', 'Dumbbell Row'])] },
    noEmphasis.context,
    noEmphasis.catalogById
  );
  assert(
    quadGap.issues.some((issue) => issue.code === 'VOLUME_OFF' && issue.severity === 'error' && /quads/i.test(issue.message)),
    'Without an emphasis waiver, a missing major muscle stays an error'
  );

  const duplicated = strengthDay('Mon', ['Barbell Bench Press', 'Romanian Deadlift', 'Hip Thrust']);
  duplicated.warmup = [duplicated.warmup[0], duplicated.warmup[0], ...duplicated.warmup.slice(1)];
  const dupCheck = validateAiProgram({ schema_version: '2.1', summary: 'Dupes', workouts: [duplicated, strengthDay('Fri', ['Barbell Bench Press', 'Romanian Deadlift', 'Hip Thrust'])] }, context, catalogById);
  assert(dupCheck.issues.some((issue) => issue.code === 'DUPLICATE_WARMUP'), 'Duplicate warm-ups must be rejected');

  const fixed = enforceSessionConstraints(covered, context, catalogById);
  const after = validateAiProgram(fixed.program, context, catalogById);
  assert(fixed.repairs.some((repair) => repair.code === 'IDENTICAL_DAYS'), 'Repair must copy the template day');
  assert(fixed.repairs.some((repair) => repair.code === 'WARMUP_COUNT'), 'Repair must trim extra warm-ups');
  assert(
    !after.issues.some((issue) => issue.code === 'IDENTICAL_DAYS' || issue.code === 'WARMUP_COUNT' || issue.code === 'DUPLICATE_WARMUP'),
    `Constraints should clear identical-day and warm-up errors: ${after.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}`
  );
  assert((fixed.program.workouts[0].potentiation || []).length === 1, 'Athletic primer must stay on the session');
  assert(
    (fixed.program.workouts[0].warmup || []).every((item) => item.exercise_id !== idOf('Medicine-Ball Chest Pass')),
    'Primer must not be rewritten into the dynamic warm-up list'
  );

  const unknown = strengthDay('Mon', ['Barbell Bench Press', 'Romanian Deadlift']);
  unknown.strength.push({ type: 'straight_sets', exercises: [{ ...lift('Hip Thrust', 'secondary'), exercise_id: '8b9630fe-ea3d-4fda-a234-b697c8b0cbe3' }] });
  const removed = enforceSessionConstraints({ schema_version: '2.1', summary: 'Bad id', workouts: [unknown, strengthDay('Fri', ['Back Squat'])] }, context, catalogById);
  assert(removed.repairs.some((repair) => repair.code === 'UNKNOWN_EXERCISE_ID'), 'Unknown exercise ids must be removed in repair');
  assert(
    removed.program.workouts.every((workout) => workout.strength.every((block) => block.exercises.every((ex) => ex.exercise_id !== '8b9630fe-ea3d-4fda-a234-b697c8b0cbe3'))),
    'The bad id must not remain on any day'
  );

  const fallback = await runGenerationPipeline({
    profile,
    catalog: FALLBACK_CATALOG,
    userPrompt: EMPHASIS_NOTES,
    programName: 'Baseball emphasis',
    apiKey: null,
  });
  assert(fallback.method === 'science_fallback', `No-key path should use science fallback, got ${fallback.method}`);
  const saved = fallback.program.workouts.filter((workout) => workout.week === 1);
  assert(signature(saved[0]) === signature(saved[1]), 'Fallback must not replace identical days with Full Body A/B');
  assert(saved[0].warmup.length <= 4 && new Set(saved[0].warmup.map((item) => item.name.toLowerCase())).size === saved[0].warmup.length, 'Fallback warm-ups must stay inside the cap and unique');

  const extended = generateProgram(
    trainingProfileFromSources({
      profile: { experience_level: 'intermediate', primary_goal: 'athletic_performance' },
      trainingProfile: { warmup_style: 'athletic', warmup_duration: 'extended', preferred_session_minutes: 60 },
      config: {
        days: ['Mon'],
        dayTypes: { Mon: 'Full Body' },
        sessionMinutes: 60,
        weeks: 1,
        primaryGoal: 'athletic_performance',
        intakeNotes: 'Extended athletic warm-up.',
      },
    }),
    FALLBACK_CATALOG
  );
  const extendedWarm = extended.workouts.filter((workout) => workout.week === 1)[0].warmup;
  assert(extendedWarm.length >= 3 && extendedWarm.length <= 6, `Extended warm-up should be allowed past 4 and capped at 6, got ${extendedWarm.length}`);
  assert(extendedWarm.length > 4, `Extended athletic warm-up should be allowed to exceed the standard cap, got ${extendedWarm.map((item) => item.name).join(', ')}`);
}
