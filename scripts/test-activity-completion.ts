/**
 * BIQ-0176 calendar Complete + strength completion helpers.
 * Run: npx tsx scripts/test-activity-completion.ts
 */
import assert from 'node:assert/strict';
import {
  calendarCheckoffDates,
  decorateDayPlanCompletion,
  detailsWithProgramItemCompleted,
  isProgramItemCompletedOnDate,
  isStrengthWorkoutCompleted,
  itemAllowsCheckoff,
  mergeTrainingCompletedDates,
  programCompletionsFromDetails,
} from '../lib/programDesign/activityCompletion';
import {
  calendarItemsForDate,
  detailsForThisDaySave,
  detailsWithCompletedDate,
  isActivityCompletedOnDate,
  isCompletionLedger,
  type UserCalendarActivity,
} from '../lib/programDesign/userCalendar';
import { weekdayIndexFromYmd } from '../lib/programDesign/recurrence';
import type { TrainingDayPlan } from '../lib/programDesign/trainingSchedule';

function act(partial: Partial<UserCalendarActivity> & { activity_date: string }): UserCalendarActivity {
  return {
    id: 'a1',
    user_id: 'u1',
    activity_type: 'cardio',
    title: 'Ride',
    duration_minutes: 45,
    notes: '',
    details: {},
    recurrence: 'none',
    recurrence_until: null,
    recurrence_weekdays: [weekdayIndexFromYmd(partial.activity_date)],
    workout_id: null,
    ...partial,
  };
}

const once = act({ activity_date: '2026-09-13' });
const afterComplete = detailsWithCompletedDate(once.details, '2026-09-13', true);
assert.deepEqual(afterComplete.completed_dates, ['2026-09-13']);
assert.equal(isActivityCompletedOnDate({ ...once, details: afterComplete }, '2026-09-13'), true);
assert.equal(isActivityCompletedOnDate({ ...once, details: afterComplete }, '2026-09-14'), false);
const afterUndo = detailsWithCompletedDate(afterComplete, '2026-09-13', false);
assert.equal(afterUndo.completed_dates, undefined);
assert.equal(isActivityCompletedOnDate({ ...once, details: afterUndo }, '2026-09-13'), false);

const weekly = act({
  id: 'ride-weekly',
  activity_date: '2026-09-09',
  recurrence: 'weekly',
  recurrence_weekdays: [0, 2, 4],
});
const fridayOnly = detailsWithCompletedDate(weekly.details, '2026-09-11', true);
assert.deepEqual(fridayOnly.completed_dates, ['2026-09-11']);
assert.equal(isActivityCompletedOnDate({ ...weekly, details: fridayOnly }, '2026-09-11'), true);
assert.equal(isActivityCompletedOnDate({ ...weekly, details: fridayOnly }, '2026-09-14'), false);
const fridayItems = calendarItemsForDate([{ ...weekly, details: fridayOnly }], '2026-09-11');
assert.equal(fridayItems[0].completed, true);
const mondayItems = calendarItemsForDate([{ ...weekly, details: fridayOnly }], '2026-09-14');
assert.equal(mondayItems[0].completed, false);

const afterThisDayEdit = detailsForThisDaySave(fridayOnly, '2026-09-11', {
  title: 'Easy spin',
  activity_type: 'cardio',
  duration_minutes: 20,
  notes: '',
  details: { cardio_type: 'Bike' },
});
assert.deepEqual(afterThisDayEdit.completed_dates, ['2026-09-11']);
assert.equal(isActivityCompletedOnDate({ ...weekly, details: afterThisDayEdit }, '2026-09-11'), true);

const ledgerDetails = detailsWithProgramItemCompleted({}, 'prog-rest-1', '2026-09-13', true);
assert.equal(ledgerDetails.completion_ledger, true);
assert.deepEqual(programCompletionsFromDetails(ledgerDetails)['prog-rest-1'], ['2026-09-13']);
const ledger = act({
  id: 'ledger',
  activity_date: '1970-01-01',
  activity_type: 'rest',
  title: '',
  details: ledgerDetails,
});
assert.equal(isCompletionLedger(ledger), true);
assert.equal(calendarItemsForDate([ledger], '2026-09-13').length, 0);
assert.equal(isProgramItemCompletedOnDate([ledger], 'prog-rest-1', '2026-09-13'), true);
assert.equal(isProgramItemCompletedOnDate([ledger], 'prog-rest-1', '2026-09-14'), false);

const workout = {
  id: 'w1',
  st_exercises: [{ st_planned_sets: [{ id: 's1' }, { id: 's2' }, { id: 's3', is_deleted: true }] }],
};
assert.equal(isStrengthWorkoutCompleted(workout, { s1: { completed: true } }), false);
assert.equal(isStrengthWorkoutCompleted(workout, { s1: { completed: true }, s2: { completed: true } }), true);
assert.equal(isStrengthWorkoutCompleted(workout, { s1: { completed: true }, s2: { completed: false } }), false);
assert.equal(isStrengthWorkoutCompleted({ id: 'empty', st_exercises: [] }, {}), false);

const workoutWithWarmup = {
  id: 'w-wu',
  st_exercises: [
    { section: 'warmup', st_planned_sets: [{ id: 'wu1' }] },
    { section: 'strength', st_planned_sets: [{ id: 'main1' }] },
  ],
};
assert.equal(isStrengthWorkoutCompleted(workoutWithWarmup, { main1: { completed: true } }), true);
assert.equal(isStrengthWorkoutCompleted(workoutWithWarmup, { wu1: { completed: true } }), false);

assert.equal(itemAllowsCheckoff({ workoutId: null, activityType: 'cardio', source: 'calendar' }), true);
assert.equal(itemAllowsCheckoff({ workoutId: null, activityType: 'rest', source: 'program' }), true);
assert.equal(itemAllowsCheckoff({ workoutId: 'w1', activityType: 'strength', source: 'calendar' }), false);
assert.equal(itemAllowsCheckoff({ workoutId: null, activityType: 'strength', source: 'calendar' }), false);

const merged = mergeTrainingCompletedDates(['2026-09-10'], [
  { ...once, details: afterComplete },
  ledger,
]);
assert.deepEqual(merged, ['2026-09-10', '2026-09-13']);
assert.deepEqual(calendarCheckoffDates([{ ...weekly, details: fridayOnly }]), ['2026-09-11']);

const plan: TrainingDayPlan = {
  date: '2026-09-13',
  dayLabel: 'Sun',
  weekNumber: 1,
  dayOfWeek: 6,
  items: [
    {
      id: 'cal-ride',
      title: 'Ride',
      typeLabel: 'Cardio',
      activityType: 'cardio',
      duration: '45 min',
      workoutId: null,
      activityId: 'a1',
      isRest: false,
      source: 'calendar',
      completed: true,
    },
    {
      id: 'str',
      title: 'Lift',
      typeLabel: 'Strength',
      activityType: 'strength',
      duration: '',
      workoutId: 'w1',
      activityId: 's1',
      isRest: false,
      source: 'calendar',
    },
  ],
  primary: null,
  later: [],
  isToday: true,
};
const decorated = decorateDayPlanCompletion(plan, {
  activities: [{ ...once, details: afterComplete }],
  workouts: [workout],
  progressLogs: [{ planned_set_id: 's1', log_date: '2026-09-13', completed: true }],
  sessionLogs: { s2: { planned_set_id: 's2', log_date: '2026-09-13', completed: true } },
  selectedDate: '2026-09-13',
});
assert.equal(decorated.items[0].completed, true);
assert.equal(decorated.items[1].completed, true);

console.log('OK: activity completion checks passed');
