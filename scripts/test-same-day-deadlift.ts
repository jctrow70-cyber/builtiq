/**
 * BIQ-0171: Never stack two deadlift variations in the same session.
 * Run: npx tsx scripts/test-same-day-deadlift.ts
 */
import { applyAiWeekDesign } from '../lib/scienceEngine/applyAiDesign';
import { conflictsInSession, isDeadliftVariation, pickExercise } from '../lib/scienceEngine/exerciseSelection';
import { generateProgram } from '../lib/scienceEngine/generateProgram';
import { trainingProfileFromSources } from '../lib/scienceEngine/profile';
import { validateProgramQuality } from '../lib/scienceEngine/qualityCheck';
import { adaptCatalog } from '../lib/scienceEngine/catalogAdapter';
import type { ScienceProgram } from '../lib/scienceEngine/types';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function run() {
  assert(isDeadliftVariation('Conventional Deadlift'), 'conventional is a deadlift variation');
  assert(isDeadliftVariation('Romanian Deadlift'), 'RDL is a deadlift variation');
  assert(isDeadliftVariation('Dumbbell RDL'), 'Dumbbell RDL counts');
  assert(isDeadliftVariation('Trap Bar Deadlift'), 'trap bar counts');
  assert(!isDeadliftVariation('Hip Thrust'), 'hip thrust is not a deadlift variation');
  assert(conflictsInSession('Romanian Deadlift', ['Conventional Deadlift']), 'RDL conflicts with conventional in-session');
  assert(!conflictsInSession('Barbell Row', ['Conventional Deadlift']), 'row does not conflict with deadlift');

  const profile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'strength', birth_year: 1990 },
    trainingProfile: { preferred_session_minutes: 60 },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      weeks: 1,
      sessionMinutes: 60,
    },
  });
  const catalog = adaptCatalog([]);

  const blocked = pickExercise(catalog, {
    profile,
    muscle: 'hamstrings',
    role: 'secondary',
    pattern: 'hinge',
    alreadyNames: ['Conventional Deadlift'],
    sessionNames: ['Conventional Deadlift'],
    preferredNames: ['Romanian Deadlift'],
  });
  assert(
    !blocked || !isDeadliftVariation(blocked.name),
    `pickExercise must not add a second deadlift in-session, got ${blocked?.name}`
  );

  // Across the week, RDL may still follow a conventional day (sessionNames empty).
  const acrossWeek = pickExercise(catalog, {
    profile,
    muscle: 'hamstrings',
    role: 'secondary',
    pattern: 'hinge',
    alreadyNames: ['Conventional Deadlift', 'Overhead Press'],
    sessionNames: [],
    preferredNames: ['Romanian Deadlift'],
  });
  assert(acrossWeek, 'across-week RDL should still be allowed when sessionNames is empty');

  const science = generateProgram(profile, catalog);
  const ai = {
    summary: 'Test week with illegal same-day deadlift pair',
    workouts: science.workouts
      .filter((w) => w.week === 1)
      .map((w, index) => ({
        day_label: w.dayLabel,
        name: w.name,
        strength:
          index === 0
            ? [
                { name: 'Conventional Deadlift', sets: 3, reps: '5', role: 'primary' },
                { name: 'Romanian Deadlift', sets: 3, reps: '8', role: 'secondary' },
                { name: 'Barbell Bench Press', sets: 3, reps: '6' },
                { name: 'Barbell Row', sets: 3, reps: '8' },
              ]
            : w.exercises.map((ex) => ({ name: ex.name, sets: ex.sets, reps: `${ex.repMin}-${ex.repMax}`, role: ex.role })),
      })),
  };

  const applied = applyAiWeekDesign(science, ai, catalog, profile);
  assert(applied.applied, 'AI week should apply');
  const day = applied.program.workouts.find((w) => w.week === 1 && w.dayLabel === science.workouts.find((x) => x.week === 1)?.dayLabel);
  assert(day, 'first day missing after AI apply');
  const deadlifts = (day?.exercises || []).filter((ex) => isDeadliftVariation(ex.name));
  assert(
    deadlifts.length === 1,
    `Expected one deadlift variation after AI apply, got ${deadlifts.map((d) => d.name).join(', ') || 'none'}`
  );

  const firstDay = science.workouts.find((w) => w.week === 1);
  assert(firstDay, 'science week 1 day missing');
  const badProgram: ScienceProgram = {
    ...science,
    workouts: [
      {
        ...firstDay!,
        exercises: [
          { ...firstDay!.exercises[0], name: 'Conventional Deadlift', role: 'primary', movementPattern: 'hinge', primaryMuscles: ['hamstrings'] },
          { ...firstDay!.exercises[0], name: 'Romanian Deadlift', role: 'secondary', movementPattern: 'hinge', primaryMuscles: ['hamstrings'] },
        ],
      },
    ],
  };
  const quality = validateProgramQuality(badProgram, 60);
  assert(
    quality.issues.some((i) => i.code === 'SAME_DAY_DEADLIFTS'),
    'quality check should flag same-day deadlift variations'
  );

  console.log('BIQ-0171 same-day deadlift checks passed');
}

run();
