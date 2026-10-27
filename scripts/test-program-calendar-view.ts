/**
 * BIQ-0271 Phase B: calendar-first Program Design helpers.
 * Run: npx tsx scripts/test-program-calendar-view.ts
 */
import assert from 'node:assert/strict';
import {
  clampProgramWeek,
  defaultProgramDate,
  isProgramCalendarView,
  programDayState,
  selectProgramDate,
} from '../lib/programDesign/programCalendarView';
import { monthCalendarCells } from '../lib/programDesign/trainingSchedule';
import {
  dayDurationMinutes,
  exerciseRestLabel,
  previewExerciseNames,
  workingExerciseCount,
  workoutFocusLabel,
  workoutPrimaryFocus,
} from '../lib/programDesign/workoutPreview';
import type { ProgramActivity, ProgramDesignRecord } from '../lib/programDesign/types';

assert.equal(isProgramCalendarView('week'), true);
assert.equal(isProgramCalendarView('day'), true);
assert.equal(isProgramCalendarView('month'), true);
assert.equal(isProgramCalendarView('workouts'), false);
assert.equal(clampProgramWeek(0, 6), 1);
assert.equal(clampProgramWeek(9, 6), 6);

const start = '2026-10-26'; // Monday
assert.deepEqual(selectProgramDate(start, '2026-10-28', 6), {
  week: 1,
  dayOfWeek: 2,
  date: '2026-10-28',
});
assert.equal(selectProgramDate(start, '2026-11-04', 6).week, 2);
assert.equal(defaultProgramDate(start, 6, '2026-10-28'), '2026-10-28');
assert.equal(defaultProgramDate(start, 6, '2026-09-01'), start);

const rest: ProgramActivity[] = [];
const scheduled: ProgramActivity[] = [
  {
    id: 'a1',
    program_id: 'p1',
    week_number: 1,
    day_of_week: 0,
    sort_order: 0,
    activity_type: 'strength',
    title: 'Lift',
    duration_minutes: 60,
    notes: '',
    details: {},
    workout_id: 'w1',
  },
];
assert.equal(programDayState(rest), 'rest');
assert.equal(programDayState(scheduled), 'scheduled');
assert.equal(dayDurationMinutes(scheduled), 60);

const workout = {
  workout_type: 'Chest + Squat',
  st_exercises: [
    { id: 'e1', section: 'warmup', name: 'March', st_planned_sets: [] },
    {
      id: 'e2',
      section: 'strength',
      name: 'Bench Press',
      muscle_group: 'Chest',
      st_planned_sets: [
        { set_type: 'warmup', target_reps: '8' },
        { set_type: 'working', rep_min: 5, rep_max: 8, target_rir: 2 },
      ],
    },
    { id: 'e3', section: 'conditioning', name: 'Bike', st_planned_sets: [{ set_type: 'working', target_reps: '10 min' }] },
  ],
};
assert.equal(workoutFocusLabel(workout), 'Chest + Squat');
assert.equal(workoutPrimaryFocus(workout), 'Chest');
assert.equal(workingExerciseCount(workout), 2);
assert.deepEqual(previewExerciseNames(workout, 3), ['Bench Press', 'Bike']);
assert.equal(exerciseRestLabel({ rest_seconds: 90, st_planned_sets: [] }), '1.5 min rest');
assert.equal(exerciseRestLabel({ st_planned_sets: [{ rest_seconds: 45 }] }), '45s rest');

const program = {
  id: 'p1',
  name: 'Test',
  start_date: start,
  end_date: '2026-12-06',
  weeks: 6,
} as ProgramDesignRecord;
const cells = monthCalendarCells(program, scheduled, '2026-10');
assert.ok(cells.length >= 28);
assert.ok(cells.every((cell) => cell.date));
const monday = cells.find((cell) => cell.date === '2026-10-26');
assert.ok(monday?.inProgram);
assert.equal(monday?.plan?.primary?.title, 'Lift');
const dots = (monday?.plan?.items || []).map((item) => item.activityType);
assert.ok(dots.includes('strength'));

console.log('program calendar view Phase B checks passed');
