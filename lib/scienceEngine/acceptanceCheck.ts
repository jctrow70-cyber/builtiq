/**
 * BIQ-0141 acceptance checks for the science engine.
 * Run: npx tsx lib/scienceEngine/acceptanceCheck.ts
 */
import { assertInferScheduleExamples } from '../programDesign/inferSchedule';
import { trainingProfileFromSources } from './profile';
import { generateProgram } from './generateProgram';
import { evaluateProgression } from './progression';
import { validateProgram } from './validator';
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

function run() {
  assertInferScheduleExamples();
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
  ['goblet squat', 'push-up to toe touch', 'rdl', 'row', 'lunge'].forEach((needle) => {
    assert(warmupNames.includes(needle) || warmupNames.includes(needle.replace('-', ' ')), `Warm-up missing ${needle}: ${warmupNames}`);
  });

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

  console.log('BIQ-0141 science engine acceptance checks passed.');
  console.log(`Bro split: ${broWeek1.map((w) => `${w.workoutType} (${w.exercises[0]?.name})`).join(' / ')}`);
  console.log(`Full body week: ${fbWeek1.map((w) => `${w.name} (${w.exercises[0]?.name})`).join(' / ')}`);
  console.log(`Split: ${types.join(' / ')}`);
  console.log(`Chest target: ${chest?.targetSets}`);
  console.log(`Bench: ${bench!.sets} x ${bench!.repMin}-${bench!.repMax} @ ${bench!.targetRir} RIR`);
  console.log(`Warm-up: ${upperA!.warmup.map((w) => w.name).join(', ')}`);
  console.log(`Power Primer: ${primer!.name} ${primer!.sets} x ${primer!.repMin}-${primer!.repMax}`);
  console.log(`Ramp: ${upperA!.rampSets.map((r) => `${r.weight || r.percent} x ${r.reps}`).join(', ')}`);
}

run();
