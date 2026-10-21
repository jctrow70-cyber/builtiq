/**
 * BIQ-0263 Stage 2 recurrence display rules that do not need a signed-in database.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-group-activity-stage2.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapListedGroupActivity, groupActivityListRanges } from '../lib/groups/groupActivities';
import { groupRepeatSave, groupWeekdayIndex } from '../lib/groups/groupActivityRepeat';
import { extraStatusLabel, requiredExtraStanding, summarizeGroupExtras } from '../lib/groups/trainingWorkspace';

assert.equal(groupWeekdayIndex('2026-10-19'), 0);
assert.equal(groupWeekdayIndex('2026-10-21'), 2);

assert.deepEqual(groupRepeatSave({ mode: 'none', weekdays: [2], until: '2026-12-01' }, '2026-10-21'), {
  recurrence: 'none',
  recurrenceWeekdays: [],
  recurrenceUntil: null,
});
assert.deepEqual(groupRepeatSave({ mode: 'week', weekdays: [0, 1], until: '' }, '2026-10-21'), {
  recurrence: 'weekly',
  recurrenceWeekdays: [2],
  recurrenceUntil: null,
});
assert.deepEqual(groupRepeatSave({ mode: 'custom', weekdays: [0], until: '2026-12-31' }, '2026-10-21'), {
  recurrence: 'weekly',
  recurrenceWeekdays: [0, 2],
  recurrenceUntil: '2026-12-31',
});

const ranges = groupActivityListRanges('2026-01-01', '2026-12-31');
assert.ok(ranges.length > 1);
assert.equal(ranges[0].from, '2026-01-01');
assert.equal(ranges[ranges.length - 1].to, '2026-12-31');
for (let index = 0; index < ranges.length; index += 1) {
  const span = (Date.parse(ranges[index].to) - Date.parse(ranges[index].from)) / 86400000;
  assert.ok(span <= 111);
  if (index > 0) {
    const previous = Date.parse(ranges[index - 1].to);
    assert.equal(Date.parse(ranges[index].from) - previous, 86400000);
  }
}

const historical = mapListedGroupActivity(
  {
    series_id: 'series-1',
    occurrence_id: 'occ-1',
    user_id: 'member-1',
    original_date: '2026-01-06',
    occurrence_date: '2026-01-06',
    status: 'scheduled',
    completed: true,
    activity_type: 'cardio',
    title: 'Historical ride',
    details: { pace: 'easy' },
    required: false,
    virtual: false,
  },
  {
    id: 'series-1',
    workout_id: 'workout-1',
    recurrence: 'weekly',
    recurrence_weekdays: [1],
    details: { changed: true },
  }
);
assert.ok(historical);
assert.equal(historical?.title, 'Historical ride');
assert.equal(historical?.activityType, 'cardio');
assert.deepEqual(historical?.details, { pace: 'easy' });
assert.deepEqual(historical?.seriesDetails, { changed: true });
assert.equal(historical?.workoutId, 'workout-1');
assert.equal(extraStatusLabel(historical!), 'Completed');

const skipped = { date: '2026-10-01', required: true, completed: false, status: 'skipped' as const };
assert.equal(requiredExtraStanding(skipped, '2026-10-21'), 'skipped');
assert.equal(summarizeGroupExtras([skipped], '2026-10-21').requiredOpen, 0);
assert.equal(summarizeGroupExtras([skipped], '2026-10-21').skipped, 1);

const source = readFileSync(new URL('../lib/groups/groupActivities.ts', import.meta.url), 'utf8');
assert.match(source, /st_list_group_activities/);
assert.match(source, /st_complete_group_activity_occurrence/);
assert.match(source, /st_edit_group_activity_occurrence/);
assert.match(source, /st_edit_group_activity_future/);
assert.match(source, /st_edit_group_activity_series/);
assert.match(source, /st_skip_group_activity_occurrence/);
assert.match(source, /st_restore_group_activity_occurrence/);
assert.match(source, /st_end_group_activity_series/);
assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(/);

console.log('group activity stage 2 checks passed');
