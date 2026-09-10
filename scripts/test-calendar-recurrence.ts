/**
 * BIQ-0170 multi-day weekly recurrence.
 * Run: npx tsx scripts/test-calendar-recurrence.ts
 */
import assert from 'node:assert/strict';
import { activityOccursOnDate, type UserCalendarActivity } from '../lib/programDesign/userCalendar';
import { normalizeWeekdays, weekdayIndexFromYmd, weekdaysFromDetails } from '../lib/programDesign/recurrence';

function act(partial: Partial<UserCalendarActivity> & { activity_date: string }): UserCalendarActivity {
  return {
    id: 'a1',
    user_id: 'u1',
    activity_type: 'cardio',
    title: 'Ride',
    duration_minutes: 45,
    notes: '',
    details: {},
    recurrence: 'weekly',
    recurrence_until: null,
    recurrence_weekdays: [weekdayIndexFromYmd(partial.activity_date)],
    workout_id: null,
    ...partial,
  };
}

assert.equal(weekdayIndexFromYmd('2026-09-07'), 0); // Monday
assert.equal(weekdayIndexFromYmd('2026-09-09'), 2); // Wednesday
assert.equal(weekdayIndexFromYmd('2026-09-13'), 6); // Sunday
assert.deepEqual(normalizeWeekdays([2, 0, 2, 4]), [0, 2, 4]);
assert.deepEqual(weekdaysFromDetails({ recurrence_weekdays: [1, 3] }, 0), [1, 3]);
assert.deepEqual(weekdaysFromDetails({}, 2), [2]);

const series = act({
  activity_date: '2026-09-09',
  recurrence_weekdays: [0, 2, 4], // Mon Wed Fri, starting Wednesday
});

assert.equal(activityOccursOnDate(series, '2026-09-07'), false); // Mon before start
assert.equal(activityOccursOnDate(series, '2026-09-09'), true); // start Wed
assert.equal(activityOccursOnDate(series, '2026-09-11'), true); // Fri
assert.equal(activityOccursOnDate(series, '2026-09-14'), true); // next Mon
assert.equal(activityOccursOnDate(series, '2026-09-10'), false); // Thu
assert.equal(activityOccursOnDate(series, '2026-09-08'), false); // Tue

const until = act({
  activity_date: '2026-09-09',
  recurrence_weekdays: [0, 2, 4],
  recurrence_until: '2026-09-11',
});
assert.equal(activityOccursOnDate(until, '2026-09-11'), true);
assert.equal(activityOccursOnDate(until, '2026-09-14'), false);

const once = act({
  activity_date: '2026-09-09',
  recurrence: 'none',
  recurrence_weekdays: [0, 2, 4],
});
assert.equal(activityOccursOnDate(once, '2026-09-09'), true);
assert.equal(activityOccursOnDate(once, '2026-09-11'), false);

const legacyWeekly = act({
  activity_date: '2026-09-09',
  recurrence: 'weekly',
  recurrence_weekdays: [],
});
assert.equal(activityOccursOnDate(legacyWeekly, '2026-09-16'), true);
assert.equal(activityOccursOnDate(legacyWeekly, '2026-09-14'), false);

console.log('OK: multi-day calendar recurrence checks passed');
