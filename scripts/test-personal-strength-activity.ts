/**
 * BIQ-0175 on-the-fly Training strength workouts.
 * Run: npx tsx scripts/test-personal-strength-activity.ts
 */
import assert from 'node:assert/strict';
import {
  excludeOnTheFlyPrograms,
  isOnTheFlyProgram,
  isPersonalWorkoutContainer,
  ON_THE_FLY_GENERATION_METHOD,
  ON_THE_FLY_PROGRAM_NAME,
  PERSONAL_CONTAINER_GENERATION_METHOD,
} from '../lib/programDesign/personalStrengthWorkout';
import { calendarItemsForDate, type UserCalendarActivity } from '../lib/programDesign/userCalendar';

assert.equal(PERSONAL_CONTAINER_GENERATION_METHOD, 'manual');
assert.equal(isOnTheFlyProgram({ generation_method: ON_THE_FLY_GENERATION_METHOD, name: 'Other' }), true);
assert.equal(isOnTheFlyProgram({ generation_method: 'ai', name: ON_THE_FLY_PROGRAM_NAME }), true);
assert.equal(isOnTheFlyProgram({ generation_method: 'manual', name: 'Push / Pull' }), false);
assert.equal(isPersonalWorkoutContainer({ name: ON_THE_FLY_PROGRAM_NAME }), true);
assert.equal(isPersonalWorkoutContainer({ generation_method: ON_THE_FLY_GENERATION_METHOD }), true);
assert.equal(isPersonalWorkoutContainer({ generation_method: PERSONAL_CONTAINER_GENERATION_METHOD, name: ON_THE_FLY_PROGRAM_NAME }), true);

const visible = excludeOnTheFlyPrograms([
  { id: '1', name: 'Push / Pull', generation_method: 'science_ai' },
  { id: '2', name: ON_THE_FLY_PROGRAM_NAME, generation_method: ON_THE_FLY_GENERATION_METHOD },
  { id: '3', name: ON_THE_FLY_PROGRAM_NAME, generation_method: PERSONAL_CONTAINER_GENERATION_METHOD },
  { id: '4', name: 'My manual plan', generation_method: 'manual' },
]);
assert.deepEqual(visible.map((p) => p.id), ['1', '4']);

const strength: UserCalendarActivity = {
  id: 's1',
  user_id: 'u1',
  activity_date: '2026-09-13',
  activity_type: 'strength',
  title: 'Garage session',
  duration_minutes: 45,
  notes: '',
  details: {},
  recurrence: 'none',
  recurrence_until: null,
  recurrence_weekdays: [6],
  workout_id: 'w-123',
};
const items = calendarItemsForDate([strength], '2026-09-13');
assert.equal(items.length, 1);
assert.equal(items[0].workoutId, 'w-123');
assert.equal(items[0].activityType, 'strength');
assert.equal(calendarItemsForDate([strength], '2026-09-14').length, 0);

const cardio: UserCalendarActivity = {
  ...strength,
  id: 'c1',
  activity_type: 'cardio',
  title: 'Zone 2',
  workout_id: null,
};
assert.equal(calendarItemsForDate([cardio], '2026-09-13')[0].workoutId, null);

console.log('OK: personal strength activity helpers passed');
