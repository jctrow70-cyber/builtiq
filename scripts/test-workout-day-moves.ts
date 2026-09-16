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
  workoutDayMovesFromDetails,
} from '../lib/programDesign/workoutDayMoves';
import { applyWorkoutDayMoves, mergeProgramActivities, planForDate } from '../lib/programDesign/trainingSchedule';
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

details = detailsWithWorkoutDayMove(details, 'w:w-wed', '2026-09-16');
assert.equal(workoutDayMovesFromDetails(details)['w:w-wed'], '2026-09-16');
details = detailsWithWorkoutDayMove(details, 'w:w-wed', null);
assert.equal(workoutDayMovesFromDetails(details)['w:w-wed'], undefined);

console.log('OK: workout-day-moves checks passed');
