/**
 * BIQ-0170: Custom cycle length must drive generation week count (not the old 6-week default).
 * Run: npx tsx scripts/test-custom-weeks-generation.ts
 */
import { cycleLengthOf, generationWeeksOf } from '../lib/programDesign/cycle';
import { trainingProfileFromSources } from '../lib/scienceEngine/profile';
import { generateProgram } from '../lib/scienceEngine/generateProgram';
import { missingProgramColumnFromError } from '../lib/training/programStatus';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function uniqueWeeks(program: { workouts: { week: number }[] }) {
  return [...new Set(program.workouts.map((w) => w.week))].sort((a, b) => a - b);
}

function generateForWeeks(weeks: number) {
  const profile = trainingProfileFromSources({
    profile: null,
    trainingProfile: null,
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      weeks,
      sessionMinutes: 45,
      primaryGoal: 'strength',
      experienceLevel: 'intermediate',
    },
  });
  return generateProgram(profile, []);
}

function run() {
  assert(cycleLengthOf({ weeks: 1, cycle_length_weeks: 6 }) === 1, 'Prefer weeks=1 over stale cycle_length_weeks=6');
  assert(cycleLengthOf({ weeks: null, cycle_length_weeks: 1 }) === 1, 'Fall back to cycle_length_weeks');
  assert(cycleLengthOf({}) === 6, 'Default remains 6 when unset');

  assert(generationWeeksOf({ weeks: 1, cycle_length_weeks: 1 }, 6) === 1, 'Existing 1-week program beats body default 6');
  assert(generationWeeksOf({ weeks: 1 }, undefined) === 1, 'Existing 1-week program alone');
  assert(generationWeeksOf(null, 1) === 1, 'Body weeks=1 without existing program');
  assert(generationWeeksOf(null, undefined) === 6, 'Missing weeks still defaults to 6');
  assert(generationWeeksOf({ weeks: 20 }, 20) === 12, 'Generation still caps at 12');

  const one = generateForWeeks(1);
  assert(one.weeks === 1, `Expected science weeks=1 got ${one.weeks}`);
  assert(uniqueWeeks(one).join(',') === '1', `Expected only week 1, got ${uniqueWeeks(one)}`);
  assert(one.workouts.length === 3, `Expected 3 workouts for 1 week × 3 days, got ${one.workouts.length}`);

  const six = generateForWeeks(6);
  assert(uniqueWeeks(six).length === 6, `Expected 6 unique weeks, got ${uniqueWeeks(six).length}`);

  assert(
    missingProgramColumnFromError({
      message: 'null value in column "record_kind" of relation "st_programs" violates not-null constraint',
    }) === null,
    'NOT NULL errors must not be treated as missing columns'
  );
  assert(
    missingProgramColumnFromError({
      message: "Could not find the 'cycle_length_weeks' column of 'st_programs' in the schema cache",
    }) === 'cycle_length_weeks',
    'Missing column errors should still parse'
  );

  console.log('BIQ-0170 custom weeks generation checks passed');
}

run();
