/**
 * BIQ-0182: personal on-the-fly workout day moves.
 * Run: npx tsx scripts/test-workout-day-moves.ts
 */
import assert from 'node:assert/strict';
import {
  currentDateForMove,
  detailsWithWorkoutDayMove,
  moveKeyForActivity,
  nativeDateForActivity,
  workoutAppearsOnDate,
  workoutDayMovesFromDetails,
} from '../lib/programDesign/workoutDayMoves';
import {
  applyWorkoutDayMoves,
  mergeProgramActivities,
  overlayVisibleExpectations,
  planForCalendarDate,
  planForDate,
} from '../lib/programDesign/trainingSchedule';
import type { ProgramActivity, ProgramDesignRecord } from '../lib/programDesign/types';

const program: ProgramDesignRecord = {
  id: 'prog-1',
  name: 'Group Plan',
  visibility: 'team',
  weeks: 4,
  start_date: '2026-09-14',
  end_date: '2026-10-11',
  status: 'active',
};

const wed: ProgramActivity = {
  id: 'legacy-w-wed',
  program_id: 'prog-1',
  week_number: 1,
  day_of_week: 2,
  sort_order: 0,
  activity_type: 'strength',
  title: 'Upper Body',
  duration_minutes: 60,
  notes: '',
  details: {},
  workout_id: 'w-wed',
};

const fri: ProgramActivity = {
  id: 'legacy-w-fri',
  program_id: 'prog-1',
  week_number: 1,
  day_of_week: 4,
  sort_order: 1,
  activity_type: 'strength',
  title: 'Lower Body',
  duration_minutes: 60,
  notes: '',
  details: {},
  workout_id: 'w-fri',
};

assert.equal(nativeDateForActivity(program, wed), '2026-09-16');
assert.equal(nativeDateForActivity(program, fri), '2026-09-18');
assert.equal(moveKeyForActivity(wed), 'w:w-wed');

let details = detailsWithWorkoutDayMove({}, 'w:w-wed', '2026-09-17');
details = detailsWithWorkoutDayMove(details, 'w:w-fri', '2026-09-19');
const moves = workoutDayMovesFromDetails(details);
assert.equal(moves['w:w-wed'], '2026-09-17');
assert.equal(moves['w:w-fri'], '2026-09-19');
assert.equal(currentDateForMove(moves, 'w:w-wed', '2026-09-16'), '2026-09-17');

const activities = mergeProgramActivities(program, [wed, fri], []);
const wedNative = applyWorkoutDayMoves(planForDate(program, activities, '2026-09-16'), program, activities, moves);
const thu = applyWorkoutDayMoves(planForDate(program, activities, '2026-09-17'), program, activities, moves);
const friNative = applyWorkoutDayMoves(planForDate(program, activities, '2026-09-18'), program, activities, moves);
const sat = applyWorkoutDayMoves(planForDate(program, activities, '2026-09-19'), program, activities, moves);

assert.equal(wedNative.items.some((i) => i.workoutId === 'w-wed'), false);
assert.equal(thu.items.some((i) => i.workoutId === 'w-wed'), true);
assert.equal(thu.items.find((i) => i.workoutId === 'w-wed')?.movedFrom, '2026-09-16');
assert.equal(friNative.items.some((i) => i.workoutId === 'w-fri'), false);
assert.equal(sat.items.some((i) => i.workoutId === 'w-fri'), true);

const movedFriWorkout = { id: 'w-fri', week: 1, day_label: 'Fri' };
assert.equal(workoutAppearsOnDate(program, movedFriWorkout, '2026-09-18', moves), false);
assert.equal(workoutAppearsOnDate(program, movedFriWorkout, '2026-09-19', moves), true);

details = detailsWithWorkoutDayMove(details, 'w:w-wed', '2026-09-16');
assert.equal(workoutDayMovesFromDetails(details)['w:w-wed'], '2026-09-16');
details = detailsWithWorkoutDayMove(details, 'w:w-wed', null);
assert.equal(workoutDayMovesFromDetails(details)['w:w-wed'], undefined);

const stillThere = planForDate(program, activities, '2026-09-16');
assert.equal(stillThere.items.some((item) => item.workoutId === 'w-wed'), true);
assert.equal(planForDate(program, activities, '2026-09-07').items.length, 0);
assert.equal(planForDate(program, activities, '2026-10-12').items.length, 0);

const sixWeek: ProgramDesignRecord = {
  id: 'mary',
  name: 'Mary',
  weeks: 6,
  start_date: '2026-09-14',
  end_date: '2026-10-25',
};
const weekSixMonday: ProgramActivity = {
  ...wed,
  id: 'legacy-w-mon',
  week_number: 6,
  day_of_week: 0,
  title: 'Full Body A',
  workout_id: 'w-mon',
};
assert.equal(planForDate(sixWeek, [weekSixMonday], '2026-10-19').items[0]?.title, 'Full Body A');
assert.equal(planForDate(sixWeek, [weekSixMonday], '2026-10-26').items.length, 0);
assert.equal(planForDate(sixWeek, [weekSixMonday], '2026-11-02').items.length, 0);

const novemberRun = planForCalendarDate(sixWeek, [weekSixMonday], [{
  id: 'run',
  user_id: 'u',
  activity_date: '2026-11-04',
  activity_type: 'cardio',
  title: 'Easy run',
  duration_minutes: 30,
  notes: '',
  details: {},
  recurrence: 'none',
  recurrence_until: null,
  recurrence_weekdays: [],
  workout_id: null,
}], '2026-11-04');
assert.equal(novemberRun.items.length, 1);
assert.equal(novemberRun.items[0]?.title, 'Easy run');

// Sunday → Saturday: the program item moves, and the expectation overlay must not resurrect Sunday.
const sundayAct: ProgramActivity = {
  id: 'legacy-w-sun',
  program_id: 'prog-1',
  week_number: 1,
  day_of_week: 6,
  sort_order: 0,
  activity_type: 'strength',
  title: 'Full Body',
  duration_minutes: 60,
  notes: '',
  details: {},
  workout_id: 'w-sun',
};
assert.equal(nativeDateForActivity(program, sundayAct), '2026-09-20');
const sunToSat = workoutDayMovesFromDetails(detailsWithWorkoutDayMove({}, 'w:w-sun', '2026-09-19'));
const sundayActs = mergeProgramActivities(program, [sundayAct], []);
const sundayPlan = applyWorkoutDayMoves(planForDate(program, sundayActs, '2026-09-20'), program, sundayActs, sunToSat);
const saturdayPlan = applyWorkoutDayMoves(planForDate(program, sundayActs, '2026-09-19'), program, sundayActs, sunToSat);
assert.equal(sundayPlan.items.some((i) => i.workoutId === 'w-sun'), false);
assert.equal(sundayPlan.movedAway?.some((i) => i.workoutId === 'w-sun'), true);
assert.equal(saturdayPlan.items.some((i) => i.workoutId === 'w-sun'), true);
assert.equal(saturdayPlan.items.find((i) => i.workoutId === 'w-sun')?.movedFrom, '2026-09-20');

const sundayExpectation = {
  id: 'exp-sun',
  workoutId: 'w-sun',
  programId: 'prog-1',
  scheduledDate: '2026-09-20',
  title: 'Full Body',
  sourceKey: 'personal',
  teamId: null,
  sourceName: 'Personal',
  excused: false,
  sessionStatus: null as null,
};
const overlaidSunday = overlayVisibleExpectations(sundayPlan, [sundayExpectation], '2026-09-19', null, null, null, sunToSat);
const overlaidSaturday = overlayVisibleExpectations(saturdayPlan, [sundayExpectation], '2026-09-19', null, null, null, sunToSat);
assert.equal(overlaidSunday.items.some((i) => i.workoutId === 'w-sun' || i.title === 'Full Body'), false);
assert.equal(overlaidSaturday.items.filter((i) => i.workoutId === 'w-sun').length, 1);
assert.equal(overlaidSaturday.items.find((i) => i.workoutId === 'w-sun')?.expectationId, 'exp-sun');
assert.equal(overlaidSaturday.items.find((i) => i.workoutId === 'w-sun')?.movedFrom, '2026-09-20');

// Private-copy lineage: template expectation on Sunday must not ghost after the copy item moves.
const copySun: ProgramActivity = { ...sundayAct, id: 'legacy-copy-sun', workout_id: 'copy-sun', title: 'Full Body' };
const copyMoves = workoutDayMovesFromDetails(detailsWithWorkoutDayMove({}, 'w:copy-sun', '2026-09-19'));
const copyActs = mergeProgramActivities(program, [copySun], []);
const copySunday = applyWorkoutDayMoves(planForDate(program, copyActs, '2026-09-20'), program, copyActs, copyMoves);
const templateGhost = overlayVisibleExpectations(
  copySunday,
  [
    {
      id: 'exp-template-sun',
      workoutId: 'template-sun',
      programId: 'prog-template',
      scheduledDate: '2026-09-20',
      title: 'Full Body',
      sourceKey: 'group:team',
      teamId: 'team',
      sourceName: 'Basketball',
      excused: false,
      sessionStatus: null,
    },
  ],
  '2026-09-19',
  'prog-template',
  { sourceKey: 'personal', sourceName: 'Personal' },
  ['prog-1', 'prog-template'],
  copyMoves
);
assert.equal(templateGhost.items.some((i) => i.title === 'Full Body'), false);

console.log('OK: workout-day-moves checks passed');
