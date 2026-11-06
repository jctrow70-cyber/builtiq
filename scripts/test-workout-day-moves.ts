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

// BIQ-0311: Sunday → Saturday must not leave an expectation ghost on Sunday.
const sundayProgram: ProgramDesignRecord = {
  id: 'prog-sun',
  name: 'Week Plan',
  visibility: 'personal',
  weeks: 1,
  start_date: '2026-11-02',
  end_date: '2026-11-08',
  status: 'active',
};
const sundayLift: ProgramActivity = {
  id: 'legacy-w-sun',
  program_id: 'prog-sun',
  week_number: 1,
  day_of_week: 6,
  sort_order: 0,
  activity_type: 'strength',
  title: 'Sunday Lift',
  duration_minutes: 45,
  notes: '',
  details: {},
  workout_id: 'w-sun',
};
assert.equal(nativeDateForActivity(sundayProgram, sundayLift), '2026-11-08');
const sunToSat = { 'w:w-sun': '2026-11-07' };
const sundayActivities = mergeProgramActivities(sundayProgram, [sundayLift], []);
const sundayAfterMove = planForCalendarDate(sundayProgram, sundayActivities, [], '2026-11-08', '2026-11-06', sunToSat);
const saturdayAfterMove = planForCalendarDate(sundayProgram, sundayActivities, [], '2026-11-07', '2026-11-06', sunToSat);
assert.equal(sundayAfterMove.items.some((item) => item.workoutId === 'w-sun'), false);
assert.equal(saturdayAfterMove.items.some((item) => item.workoutId === 'w-sun'), true);
const sundayExpectation = {
  id: 'exp-sun',
  workoutId: 'w-sun',
  programId: 'prog-sun',
  scheduledDate: '2026-11-08',
  title: 'Sunday Lift',
  sourceKey: 'personal',
  teamId: null,
  sourceName: 'Personal',
  excused: false,
  sessionStatus: null as null,
};
const sundayOverlaid = overlayVisibleExpectations(sundayAfterMove, [sundayExpectation], '2026-11-06', null, null, null, sunToSat);
const saturdayOverlaid = overlayVisibleExpectations(saturdayAfterMove, [sundayExpectation], '2026-11-06', null, null, null, sunToSat);
assert.equal(sundayOverlaid.items.some((item) => item.workoutId === 'w-sun'), false);
assert.equal(sundayOverlaid.items.some((item) => String(item.id).startsWith('expectation-')), false);
assert.equal(saturdayOverlaid.items.filter((item) => item.workoutId === 'w-sun').length, 1);
assert.equal(saturdayOverlaid.items.find((item) => item.workoutId === 'w-sun')?.expectationId, 'exp-sun');
assert.equal(saturdayOverlaid.items.find((item) => item.workoutId === 'w-sun')?.movedFrom, '2026-11-08');

// A group reschedule rewrites scheduled_date and leaves the program weekday in place.
const groupMovedExpectation = { ...sundayExpectation, id: 'exp-group-move', scheduledDate: '2026-11-07' };
const sundayTemplate = planForCalendarDate(sundayProgram, sundayActivities, [], '2026-11-08', '2026-11-06', {});
const saturdayOpen = planForCalendarDate(sundayProgram, sundayActivities, [], '2026-11-07', '2026-11-06', {});
const sundayAfterGroupMove = overlayVisibleExpectations(sundayTemplate, [groupMovedExpectation], '2026-11-06');
const saturdayAfterGroupMove = overlayVisibleExpectations(saturdayOpen, [groupMovedExpectation], '2026-11-06');
assert.equal(sundayAfterGroupMove.items.some((item) => item.title === 'Sunday Lift'), false);
assert.equal(saturdayAfterGroupMove.items.filter((item) => item.workoutId === 'w-sun').length, 1);

// A personal copy moves by its own workout id. The source expectation must not stay on Sunday.
const copyProgram: ProgramDesignRecord = { ...sundayProgram, id: 'prog-copy', name: 'Week Plan copy' };
const copyLift: ProgramActivity = {
  ...sundayLift,
  id: 'legacy-w-sun-copy',
  program_id: 'prog-copy',
  workout_id: 'w-sun-copy',
};
const copyMoves = { 'w:w-sun-copy': '2026-11-07' };
const copyActivities = mergeProgramActivities(copyProgram, [copyLift], []);
const copySunday = planForCalendarDate(copyProgram, copyActivities, [], '2026-11-08', '2026-11-06', copyMoves);
const copySaturday = planForCalendarDate(copyProgram, copyActivities, [], '2026-11-07', '2026-11-06', copyMoves);
const sourceExpectation = { ...sundayExpectation, id: 'exp-source', programId: 'prog-sun' };
const copySundayView = overlayVisibleExpectations(
  copySunday,
  [sourceExpectation],
  '2026-11-06',
  'prog-sun',
  null,
  ['prog-copy', 'prog-sun'],
  copyMoves
);
const copySaturdayView = overlayVisibleExpectations(
  copySaturday,
  [sourceExpectation],
  '2026-11-06',
  'prog-sun',
  null,
  ['prog-copy', 'prog-sun'],
  copyMoves
);
assert.equal(copySunday.items.some((item) => item.workoutId === 'w-sun-copy'), false);
assert.equal(copySundayView.items.some((item) => item.title === 'Sunday Lift'), false);
assert.equal(copySaturdayView.items.filter((item) => item.title === 'Sunday Lift').length, 1);

console.log('OK: workout-day-moves checks passed');
