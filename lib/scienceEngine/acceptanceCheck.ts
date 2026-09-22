/**
 * BIQ-0141 acceptance checks for the science engine.
 * Run: npx tsx lib/scienceEngine/acceptanceCheck.ts
 */
import { assertInferScheduleExamples } from '../programDesign/inferSchedule';
import { assertIntakeScheduleExamples } from '../programDesign/intakePreferences';
import { trainingProfileFromSources } from './profile';
import { generateProgram } from './generateProgram';
import { applyAiWeekDesign } from './applyAiDesign';
import { adaptCatalog } from './catalogAdapter';
import { buildProgramDesignerPrompt } from './programDesigner';
import { findByName } from './exerciseSelection';
import { summarizeRecentLogs } from './recentTraining';
import { evaluateProgression } from './progression';
import { validateProgram } from './validator';
import { runPhase1GenerationChecks } from './generation/phase1Check';
import type { TrainingProfile } from './types';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function acceptanceProfile(): TrainingProfile {
  return trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle', birth_year: 1990 },
    trainingProfile: {
      warmup_style: 'dynamic',
      warmup_duration: 'standard',
      potentiation_preference: 'automatic',
      preferred_session_minutes: 60,
    },
    config: {
      days: ['Mon', 'Tue', 'Thu', 'Fri'],
      dayTypes: { Mon: 'Upper Body', Tue: 'Lower Body', Thu: 'Upper Body', Fri: 'Lower Body' },
      focusMuscles: ['Chest'],
      weeks: 6,
      sessionMinutes: 60,
      workingLoads: { bench: 185 },
    },
  });
}

async function run() {
  assertInferScheduleExamples();
  assertIntakeScheduleExamples();
  const profile = acceptanceProfile();
  const program = generateProgram(profile);
  const validation = validateProgram(program, profile);
  assert(validation.ok, `Program invalid: ${validation.issues.map((i) => i.message).join('; ')}`);

  const week1 = program.workouts.filter((w) => w.week === 1);
  const types = week1.map((w) => w.workoutType);
  assert(
    types.join(',') === 'Upper Body,Lower Body,Upper Body,Lower Body',
    `Expected ULUL split, got ${types.join(', ')}`
  );

  const chest = program.volumeTargets.find((t) => t.muscle === 'chest');
  assert(chest && chest.targetSets >= 11 && chest.targetSets <= 13, `Chest target should be ~12, got ${chest?.targetSets}`);

  const upperA = week1.find((w) => w.workoutType === 'Upper Body');
  assert(upperA, 'Missing upper workout');
  const bench = upperA!.exercises.find((ex) => /bench/i.test(ex.name));
  assert(bench, `Expected a bench press on Upper A, got ${upperA!.exercises.map((e) => e.name).join(', ')}`);
  assert(bench!.sets === 3, `Bench sets should be 3, got ${bench!.sets}`);
  assert(bench!.repMin === 6 && bench!.repMax === 8, `Bench range should be 6-8, got ${bench!.repMin}-${bench!.repMax}`);
  assert(bench!.targetRir === 2, `Bench RIR should be 2, got ${bench!.targetRir}`);

  const warmupNames = upperA!.warmup.map((w) => w.name.toLowerCase()).join(' | ');
  assert(upperA!.warmup.length >= 3, `Upper A warm-up should have at least 3 moves, got ${warmupNames}`);
  assert(/push-up|row|scapular|thoracic/i.test(warmupNames), `Upper A warm-up should prep press/row patterns, got ${warmupNames}`);

  const primer = upperA!.potentiation[0];
  assert(primer && /chest pass|medicine/i.test(primer.name), `Expected medicine-ball chest pass, got ${primer?.name}`);
  assert(primer!.sets === 2 && primer!.repMax >= 3, `Primer should be 2x3-4, got ${primer!.sets}x${primer!.repMin}-${primer!.repMax}`);

  assert(upperA!.rampSets.length >= 3, `Expected bench ramp sets, got ${upperA!.rampSets.length}`);
  const rampWeights = upperA!.rampSets.map((r) => r.weight).filter(Boolean);
  assert(rampWeights.includes('45') && rampWeights.includes('165'), `Expected 45 and 165 ramp, got ${rampWeights.join(',')}`);

  const week1Perf = evaluateProgression({
    exerciseName: 'Barbell Bench Press',
    repMin: 6,
    repMax: 8,
    targetRir: 2,
    loadIncrement: 5,
    workingSets: [
      { weight: 185, reps: 8, rir: 2 },
      { weight: 185, reps: 8, rir: 2 },
      { weight: 185, reps: 7, rir: 2 },
    ],
  });
  assert(week1Perf.decision === 'PROGRESS_REPS', `Week 1 8/8/7 should PROGRESS_REPS, got ${week1Perf.decision}`);

  const week2 = evaluateProgression({
    exerciseName: 'Barbell Bench Press',
    repMin: 6,
    repMax: 8,
    targetRir: 2,
    loadIncrement: 5,
    workingSets: [
      { weight: 185, reps: 8, rir: 2 },
      { weight: 185, reps: 8, rir: 2 },
      { weight: 185, reps: 8, rir: 2 },
    ],
  });
  assert(week2.decision === 'PROGRESS_LOAD', `Week 2 8/8/8 @ 2 RIR should PROGRESS_LOAD, got ${week2.decision}`);
  assert(week2.nextLoad === 190, `Next load should be 190, got ${week2.nextLoad}`);

  const week3 = evaluateProgression({
    exerciseName: 'Barbell Bench Press',
    repMin: 6,
    repMax: 8,
    targetRir: 2,
    loadIncrement: 5,
    workingSets: [
      { weight: 190, reps: 7, rir: 2 },
      { weight: 190, reps: 6, rir: 2 },
      { weight: 190, reps: 6, rir: 2 },
    ],
  });
  assert(week3.decision === 'PROGRESS_REPS' || week3.decision === 'MAINTAIN', `190x7/6/6 should keep load, got ${week3.decision}`);
  assert(week3.nextLoad === 190, `Should keep 190, got ${week3.nextLoad}`);

  const fullBodyProfile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle', birth_year: 1990 },
    trainingProfile: { preferred_session_minutes: 60 },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      weeks: 4,
      sessionMinutes: 60,
    },
  });
  const fullBody = generateProgram(fullBodyProfile);
  const broProfile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle', birth_year: 1990 },
    trainingProfile: { preferred_session_minutes: 60 },
    config: {
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      dayTypes: { Mon: 'Chest', Tue: 'Back', Wed: 'Shoulders', Thu: 'Arms', Fri: 'Legs' },
      weeks: 4,
      sessionMinutes: 60,
    },
  });
  const broProgram = generateProgram(broProfile);
  const broWeek1 = broProgram.workouts.filter((w) => w.week === 1);
  assert(
    broWeek1.map((w) => w.workoutType).join(',') === 'Chest,Back,Shoulders,Arms,Legs',
    `Bro split types should be Chest/Back/Shoulders/Arms/Legs, got ${broWeek1.map((w) => w.workoutType).join(',')}`
  );
  const chestDay = broWeek1.find((w) => w.workoutType === 'Chest');
  const backDay = broWeek1.find((w) => w.workoutType === 'Back');
  const legsDay = broWeek1.find((w) => w.workoutType === 'Legs');
  assert(chestDay && chestDay.exercises.some((e) => /bench|press|fly/i.test(e.name)), `Chest day missing press/fly, got ${chestDay?.exercises.map((e) => e.name).join(', ')}`);
  assert(chestDay && !chestDay.exercises.some((e) => /squat|deadlift|row/i.test(e.name)), `Chest day should not include squat/deadlift/row`);
  assert(backDay && backDay.exercises.some((e) => /row|pulldown|pull-?up/i.test(e.name)), `Back day missing pull, got ${backDay?.exercises.map((e) => e.name).join(', ')}`);
  assert(legsDay && legsDay.exercises.some((e) => /squat|lunge|rdl|deadlift/i.test(e.name)), `Legs day missing lower lift, got ${legsDay?.exercises.map((e) => e.name).join(', ')}`);

  const fbWeek1 = fullBody.workouts.filter((w) => w.week === 1);
  assert(fbWeek1.length === 3, `Expected 3 full-body days, got ${fbWeek1.length}`);
  const fbLists = fbWeek1.map((w) => w.exercises.map((e) => e.name).join(' | '));
  assert(fbLists[0] !== fbLists[1], `Full Body A and B should differ:\nA: ${fbLists[0]}\nB: ${fbLists[1]}`);
  assert(fbLists[1] !== fbLists[2], `Full Body B and C should differ:\nB: ${fbLists[1]}\nC: ${fbLists[2]}`);
  const fbPrimaries = fbWeek1.map((w) => w.exercises[0]?.name || '');
  assert(new Set(fbPrimaries).size === 3, `Full-body days should start with different primary lifts, got ${fbPrimaries.join(', ')}`);
  assert(
    fbWeek1.every((w) => w.exercises.length >= 4),
    `Each full-body day should have at least 4 lifts, got ${fbWeek1.map((w) => `${w.name}:${w.exercises.length}`).join(', ')}`
  );
  assert(
    !/leg curl|reverse lunge \+ rotation/i.test(fbPrimaries.join(' | ')),
    `Full-body primaries should be compounds, got ${fbPrimaries.join(', ')}`
  );
  assert(fbWeek1[0].name === 'Full Body A' && fbWeek1[1].name === 'Full Body B' && fbWeek1[2].name === 'Full Body C', `Expected Full Body A/B/C names, got ${fbWeek1.map((w) => w.name).join(', ')}`);
  const warmA = fbWeek1[0].warmup.map((w) => w.name).join(' | ');
  const warmB = fbWeek1[1].warmup.map((w) => w.name).join(' | ');
  assert(warmA !== warmB, `Full-body warm-ups should match each session, not a clone.\nA: ${warmA}\nB: ${warmB}`);

  const designed = applyAiWeekDesign(
    fullBody,
    {
      summary: 'Test week',
      workouts: [
        {
          day_label: 'Mon',
          name: 'Full Body A',
          emphasis: 'Squat / press',
          warmup: [{ name: 'Goblet Squat', sets: 1, reps: '8' }, { name: 'Push-Up to Toe Touch', sets: 1, reps: '6' }, { name: 'Band Row', sets: 1, reps: '12' }],
          potentiation: null,
          strength: [
            { name: 'Back Squat', sets: 3, reps: '5-6', target_rir: 2, role: 'primary' },
            { name: 'Barbell Bench Press', sets: 3, reps: '6-8', target_rir: 2 },
            { name: 'Dumbbell Row', sets: 3, reps: '8-10' },
            { name: 'Walking Lunge', sets: 2, reps: '10' },
          ],
        },
        {
          day_label: 'Wed',
          name: 'Full Body B',
          emphasis: 'Hinge / overhead',
          warmup: [{ name: 'Light DB RDL', sets: 1, reps: '8' }, { name: 'Reverse Lunge + Rotation', sets: 1, reps: '5' }, { name: 'Scapular Push-Up', sets: 1, reps: '8' }],
          strength: [
            { name: 'Conventional Deadlift', sets: 3, reps: '4-6', target_rir: 2, role: 'primary' },
            { superset: [{ name: 'Overhead Press', sets: 3, reps: '8' }, { name: 'Pull-Up', sets: 3, reps: '6-8' }] },
            { name: 'Bulgarian Split Squat', sets: 3, reps: '8' },
          ],
        },
        {
          day_label: 'Fri',
          name: 'Full Body C',
          warmup: [{ name: 'Lateral Lunge', sets: 1, reps: '5' }, { name: 'Glute Bridge', sets: 1, reps: '10' }, { name: 'Band Row', sets: 1, reps: '12' }],
          strength: [
            { name: 'Bulgarian Split Squat', sets: 3, reps: '8' },
            { name: 'Incline Dumbbell Press', sets: 3, reps: '8-10' },
            { name: 'Seated Cable Row', sets: 3, reps: '10' },
            { name: 'Pallof Press', sets: 2, reps: '10' },
          ],
        },
      ],
    },
    adaptCatalog([]),
    fullBodyProfile
  );
  assert(designed.applied && designed.replacedDays === 3, `AI week design should replace 3 days, got ${designed.replacedDays}`);
  const designedWeek = designed.program.workouts.filter((w: any) => w.week === 1);
  assert(designedWeek[0].exercises[0].name === 'Back Squat', `Designed A should start with squat, got ${designedWeek[0].exercises[0]?.name}`);
  assert(designedWeek[1].exercises.some((e: any) => e.supersetGroupId), 'Designed B should keep a selective superset');
  assert(designedWeek[0].warmup[0].name !== designedWeek[1].warmup[0].name, 'Designed warm-ups should differ by session');

  const blockDesigned = applyAiWeekDesign(
    fullBody,
    {
      workouts: [
        {
          day_label: 'Mon',
          name: 'Full Body A',
          emphasis: 'Squat / press',
          warmup: [{ name: 'Goblet Squat', sets: 1, reps: '8' }, { name: 'Push-Up to Toe Touch', sets: 1, reps: '6' }, { name: 'Band Row', sets: 1, reps: '12' }],
          strength: [
            { type: 'straight_sets', exercises: [{ name: 'Back Squat', sets: 3, reps: '5', role: 'primary' }] },
            { type: 'superset', exercises: [{ name: 'Chest-Supported Row', sets: 3, reps: '8' }, { name: 'Incline Dumbbell Press', sets: 3, reps: '8' }] },
            { type: 'straight_sets', exercises: [{ name: 'Walking Lunge', sets: 2, reps: '10' }] },
          ],
        },
        {
          day_label: 'Wed',
          warmup: [{ name: 'Light DB RDL', sets: 1, reps: '8' }, { name: 'Reverse Lunge + Rotation', sets: 1, reps: '5' }, { name: 'Scapular Push-Up', sets: 1, reps: '8' }],
          strength: [
            { type: 'straight_sets', exercises: [{ name: 'Deadlift', sets: 3, reps: '5', role: 'primary' }] },
            { name: 'Overhead Press', sets: 3, reps: '8' },
            { name: 'Lat Pulldown', sets: 3, reps: '10' },
          ],
        },
        {
          day_label: 'Fri',
          warmup: [{ name: 'Lateral Lunge', sets: 1, reps: '5' }, { name: 'Glute Bridge', sets: 1, reps: '10' }, { name: 'Band Row', sets: 1, reps: '12' }],
          strength: [
            { name: 'Bulgarian Split Squat', sets: 3, reps: '8' },
            { name: 'Dumbbell Bench Press', sets: 3, reps: '8' },
            { name: 'Seated Cable Row', sets: 3, reps: '10' },
          ],
        },
      ],
    },
    adaptCatalog([]),
    fullBodyProfile
  );
  assert(blockDesigned.applied, 'Block-format AI week should apply');
  const blockWeek = blockDesigned.program.workouts.filter((w: any) => w.week === 1);
  assert(blockWeek[0].exercises.some((e: any) => e.supersetGroupId), 'Block superset should map to existing superset grouping');
  assert(blockWeek[0].exercises.some((e: any) => /row/i.test(e.name)), `Chest-Supported Row should alias to a row, got ${blockWeek[0].exercises.map((e: any) => e.name).join(', ')}`);
  assert(/deadlift/i.test(blockWeek[1].exercises[0]?.name || ''), `Deadlift alias should resolve, got ${blockWeek[1].exercises[0]?.name}`);

  const designer = buildProgramDesignerPrompt(fullBody, fullBodyProfile, '3 day full body strength', adaptCatalog([]), []);
  assert(!designer.user.includes('science_seed_exercises'), 'Designer prompt must not send science seed lifts for the AI to fill');
  assert(designer.user.includes('week_to_design'), 'Designer prompt should send the week skeleton without pre-picked lifts');
  assert(designer.system.includes('Do not fill predetermined slots') || designer.system.includes('do not fill predetermined slots'), 'Prompt should tell the model it owns programming judgment');

  const chestDayProfile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle' },
    trainingProfile: { warmup_style: 'dynamic', warmup_duration: 'standard', preferred_session_minutes: 45 },
    config: {
      days: ['Sun'],
      dayTypes: { Sun: 'Chest' },
      focusMuscles: ['Chest'],
      weeks: 1,
      sessionMinutes: 45,
    },
  });
  const singleChestProgram = generateProgram(chestDayProfile);
  const chestWorkout = singleChestProgram.workouts.find((w) => w.week === 1);
  assert(chestWorkout?.workoutType === 'Chest', `Single-day chest request should stay Chest, got ${chestWorkout?.workoutType}`);
  const chestWarm = (chestWorkout?.warmup || []).map((w) => w.name).join(' | ');
  assert(!/squat|lunge/i.test(chestWarm), `Chest-day warm-up should be upper/chest prep, not lower-body primers. Got ${chestWarm}`);
  assert(/push-up|press|scapular|row|thoracic|inchworm|face pull/i.test(chestWarm), `Chest-day warm-up should include upper prep, got ${chestWarm}`);
  const chestDesigner = buildProgramDesignerPrompt(singleChestProgram, chestDayProfile, 'generate a chest workout just for today with a warm up geared towards chest.', adaptCatalog([]), []);
  assert(chestDesigner.system.includes('ONE training SESSION'), 'Single-day generate should ask for one session, not a full week');
  const chestAiWarm = applyAiWeekDesign(
    singleChestProgram,
    {
      summary: 'Chest today',
      workouts: [
        {
          day_label: chestWorkout?.dayLabel || 'Sun',
          warmup: [
            { name: 'Goblet Squat', sets: 1, reps: '8' },
            { name: 'Barbell Rear Lunge', sets: 1, reps: '8' },
            { name: 'Scapular Push-Up', sets: 1, reps: '10' },
          ],
          strength: [
            { name: 'Barbell Bench Press', sets: 3, reps: '6-8', target_rir: 2, role: 'primary' },
            { name: 'Incline Dumbbell Press', sets: 3, reps: '8-10' },
            { name: 'Cable Chest Fly', sets: 3, reps: '10-12' },
          ],
        },
      ],
    },
    adaptCatalog([]),
    chestDayProfile
  );
  const appliedChestWarm = (chestAiWarm.program.workouts.find((w) => w.week === 1)?.warmup || []).map((w) => w.name).join(' | ');
  assert(!/squat|lunge/i.test(appliedChestWarm), `AI lower-body warm-up on a Chest day should be replaced. Got ${appliedChestWarm}`);

  const longChestProfile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle' },
    trainingProfile: { warmup_style: 'dynamic', warmup_duration: 'standard', preferred_session_minutes: 90 },
    config: {
      days: ['Sun'],
      dayTypes: { Sun: 'Chest' },
      focusMuscles: ['Chest'],
      weeks: 1,
      sessionMinutes: 90,
    },
  });
  const longChest = generateProgram(longChestProfile).workouts.find((w) => w.week === 1);
  assert(
    (longChest?.exercises.length || 0) >= 6,
    `90-minute chest session should have at least 6 working lifts, got ${longChest?.exercises.map((e) => e.name).join(', ')}`
  );
  const thinAiChest = applyAiWeekDesign(
    generateProgram(longChestProfile),
    {
      summary: 'Long chest',
      workouts: [
        {
          day_label: longChest?.dayLabel || 'Sun',
          strength: [
            { name: 'Barbell Bench Press', sets: 3, reps: '6-8', role: 'primary' },
            { name: 'Incline Dumbbell Press', sets: 3, reps: '8-10' },
            { name: 'Cable Chest Fly', sets: 3, reps: '10-12' },
          ],
        },
      ],
    },
    adaptCatalog([]),
    longChestProfile
  );
  const paddedChest = thinAiChest.program.workouts.find((w) => w.week === 1);
  assert(
    (paddedChest?.exercises.length || 0) >= 6,
    `AI 3-lift chest day should be padded to a 90-minute session, got ${paddedChest?.exercises.map((e) => e.name).join(', ')}`
  );

  const gluteFocus = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'hypertrophy' },
    trainingProfile: { preferred_session_minutes: 60 },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      focusMuscles: ['Glutes'],
      weeks: 4,
      sessionMinutes: 60,
      varietyPreference: 'balanced',
      intakeNotes: 'I wanted 2 glute exercises per day',
    },
  });
  assert(gluteFocus.sessionMuscleQuotas?.glutes === 2, `Glute notes should parse to 2/day, got ${JSON.stringify(gluteFocus.sessionMuscleQuotas)}`);
  const gluteWeek = generateProgram(gluteFocus).workouts.filter((w) => w.week === 1);
  gluteWeek.forEach((w) => {
    const dedicated = w.exercises.filter((ex) =>
      (ex.primaryMuscles || []).includes('glutes') || /hip thrust|glute|kickback|hip abduction|step-?up/i.test(ex.name)
    );
    assert(
      dedicated.length >= 2,
      `${w.name} should have 2 dedicated glute lifts, got ${w.exercises.map((e) => e.name).join(', ')}`
    );
    assert(
      w.exercises.length >= 5,
      `${w.name} should have at least 5 working lifts for 60 minutes, got ${w.exercises.map((e) => e.name).join(', ')}`
    );
  });
  const daySignatures = gluteWeek.map((w) => w.exercises.slice(0, 3).map((e) => e.name).join('|'));
  assert(new Set(daySignatures).size >= 2, `Glute-focus days should not clone the same first three lifts: ${daySignatures.join(' / ')}`);

  const chestNotePlan = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'hypertrophy' },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      focusMuscles: ['Chest'],
      weeks: 4,
      sessionMinutes: 60,
      intakeNotes: '2 chest exercises per day',
    },
  });
  generateProgram(chestNotePlan)
    .workouts.filter((w) => w.week === 1)
    .forEach((w) => {
      const dedicated = w.exercises.filter(
        (ex) => (ex.primaryMuscles || []).includes('chest') || /bench|chest|fly|crossover|pec|dip/i.test(ex.name)
      );
      assert(dedicated.length >= 2, `${w.name} should have 2 chest lifts, got ${w.exercises.map((e) => e.name).join(', ')}`);
    });

  const armNotePlan = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'hypertrophy' },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      focusMuscles: ['Arms'],
      weeks: 4,
      sessionMinutes: 60,
      intakeNotes: 'two bicep exercises each session',
    },
  });
  assert(armNotePlan.sessionMuscleQuotas?.biceps === 2, 'Bicep notes should map to biceps quota');
  generateProgram(armNotePlan)
    .workouts.filter((w) => w.week === 1)
    .forEach((w) => {
      const dedicated = w.exercises.filter((ex) => /curl/i.test(ex.name) && !/leg curl/i.test(ex.name));
      assert(dedicated.length >= 2, `${w.name} should have 2 biceps lifts, got ${w.exercises.map((e) => e.name).join(', ')}`);
    });

  const catalog = adaptCatalog([]);
  assert(findByName(catalog, 'Chest-Supported Row')?.name === 'Dumbbell Row', 'Chest-supported row should alias to a proven row');
  assert(findByName(catalog, 'Light DB RDL')?.name === 'Dumbbell RDL', 'Light DB RDL should alias to Dumbbell RDL');

  const requestWins = trainingProfileFromSources({
    profile: { experience_level: 'beginner', primary_goal: 'muscle' },
    trainingProfile: {
      primary_goal: 'hypertrophy',
      experience_level: 'beginner',
      preferred_session_minutes: 90,
      superset_preference: 'minimal',
    },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      primaryGoal: 'strength',
      experienceLevel: 'advanced',
      sessionMinutes: 45,
      supersetPreference: 'frequently',
      varietyPreference: 'high',
      trainingFeel: ['athletic'],
      intakeNotes: 'No barbell back squats.',
    },
  });
  assert(requestWins.primaryGoal === 'strength', `Request goal should win, got ${requestWins.primaryGoal}`);
  assert(requestWins.experienceLevel === 'advanced', `Request experience should win, got ${requestWins.experienceLevel}`);
  assert(requestWins.preferredSessionMinutes === 45, `Request minutes should win, got ${requestWins.preferredSessionMinutes}`);
  assert(requestWins.supersetPreference === 'frequently', 'Request superset preference should win');
  assert(requestWins.potentiationPreference === 'athletic', 'Athletic feel should turn on athletic potentiation');

  const unknownApplied = applyAiWeekDesign(
    fullBody,
    {
      workouts: [
        {
          day_label: 'Mon',
          exercises: [
            { name: 'Safety Bar Squat', sets: 3, reps: '5', role: 'primary' },
            { name: 'Floor Press', sets: 3, reps: '6-8' },
            { name: 'Meadows Row', sets: 3, reps: '10' },
          ],
        },
      ],
    },
    adaptCatalog([]),
    fullBodyProfile
  );
  assert(unknownApplied.applied && unknownApplied.replacedDays === 1, `Unknown AI names should still apply 1 day, got ${unknownApplied.replacedDays}`);
  const unknownWeek = unknownApplied.program.workouts.filter((w: any) => w.week === 1);
  assert(
    unknownWeek[0].exercises.some((e: any) => /safety bar squat/i.test(e.name)),
    `Safety Bar Squat should be kept, got ${unknownWeek[0].exercises.map((e: any) => e.name).join(', ')}`
  );
  assert(unknownWeek[1].exercises[0]?.name === fbWeek1[1].exercises[0]?.name, 'Unmatched days should keep the science seed');

  const frequent = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle' },
    trainingProfile: { preferred_session_minutes: 60 },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      sessionMinutes: 60,
      weeks: 4,
      supersetPreference: 'frequently',
    },
  });
  const frequentProgram = generateProgram(frequent);
  const frequentWeek = frequentProgram.workouts.filter((w) => w.week === 1);
  assert(
    frequentWeek.some((w) => w.exercises.some((e) => e.supersetGroupId)),
    'Frequent supersets should appear on the science fallback'
  );
  const recent = summarizeRecentLogs([
    { snapshot_exercise_name: 'Back Squat', actual_weight: '185', log_date: '2026-09-01', completed: true },
    { snapshot_exercise_name: 'Back Squat', actual_weight: '190', log_date: '2026-09-08', completed: true },
  ]);
  assert(recent[0]?.name === 'Back Squat' && recent[0].sessions === 2 && recent[0].best_weight === '190', 'Recent training summary should roll up logged lifts');

  const cardioProfile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'fat_loss' },
    trainingProfile: {
      warmup_style: 'dynamic',
      warmup_duration: 'standard',
      potentiation_preference: 'off',
      preferred_session_minutes: 45,
    },
    config: {
      days: ['Mon', 'Wed', 'Fri', 'Sat'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body', Sat: 'Cardio' },
      weeks: 1,
      sessionMinutes: 45,
    },
  });
  const cardioProgram = generateProgram(cardioProfile);
  const cardioCheck = validateProgram(cardioProgram, cardioProfile);
  assert(cardioCheck.ok, `Cardio-day program invalid: ${cardioCheck.issues.map((i) => i.message).join('; ')}`);
  const sat = cardioProgram.workouts.find((w) => w.dayLabel === 'Sat' && w.week === 1);
  assert(sat?.workoutType === 'Cardio', `Saturday should be Cardio, got ${sat?.workoutType}`);
  assert((sat?.exercises.length || 0) >= 3, `Cardio day should have conditioning work, got ${sat?.exercises.map((e) => e.name).join(', ')}`);

  console.log('BIQ-0141 science engine acceptance checks passed.');
  console.log(`Bro split: ${broWeek1.map((w) => `${w.workoutType} (${w.exercises[0]?.name})`).join(' / ')}`);
  console.log(`Full body week: ${fbWeek1.map((w) => `${w.name} (${w.exercises[0]?.name})`).join(' / ')}`);
  console.log(`Split: ${types.join(' / ')}`);
  console.log(`Chest target: ${chest?.targetSets}`);
  console.log(`Bench: ${bench!.sets} x ${bench!.repMin}-${bench!.repMax} @ ${bench!.targetRir} RIR`);
  console.log(`Warm-up: ${upperA!.warmup.map((w) => w.name).join(', ')}`);
  console.log(`Power Primer: ${primer!.name} ${primer!.sets} x ${primer!.repMin}-${primer!.repMax}`);
  console.log(`Ramp: ${upperA!.rampSets.map((r) => `${r.weight || r.percent} x ${r.reps}`).join(', ')}`);
  await runPhase1GenerationChecks();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
