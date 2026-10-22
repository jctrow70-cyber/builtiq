import assert from 'node:assert/strict';
import { groupActivityLogReturn, groupActivitySourceKey, groupStrengthCardCanLog, isGroupActivitySourceKey } from '../lib/groups/groupActivityLog';
import { trainingLoggerBack } from '../lib/groups/groupLogReturn';
import { sessionFulfillsExpectation } from '../lib/training/unifiedSchedule';

const today = '2026-10-22';
const member = 'member-1';
const request = {
  sessionUserId: member,
  teamId: 'team-1',
  memberUserId: member,
  workoutId: 'workout-1',
  seriesId: 'series-1',
  originalDate: '2026-10-20',
  scheduledDate: '2026-10-22',
  returnTo: 'group-calendar' as const,
};

const returning = groupActivityLogReturn(request);
assert.equal(returning?.expectationId, '');
assert.equal(returning?.returnTo, 'group-calendar');
assert.equal(trainingLoggerBack(returning), 'group');
assert.equal(groupActivityLogReturn({ ...request, memberUserId: 'other' }), null);
assert.equal(groupActivitySourceKey('series-1'), 'group-activity:series-1');
assert.equal(isGroupActivitySourceKey(groupActivitySourceKey('series-1')), true);

const card = {
  viewerUserId: member,
  memberUserId: member,
  activityType: 'strength',
  workoutId: 'workout-1',
  seriesId: 'series-1',
  originalDate: '2026-10-22',
  date: today,
  today,
  status: 'scheduled',
};
assert.equal(groupStrengthCardCanLog(card), true);
assert.equal(groupStrengthCardCanLog({ ...card, viewerUserId: 'coach' }), false);
assert.equal(groupStrengthCardCanLog({ ...card, activityType: 'cardio' }), false);
assert.equal(groupStrengthCardCanLog({ ...card, date: '2026-10-23' }), false);
assert.equal(groupStrengthCardCanLog({ ...card, status: 'skipped' }), false);
assert.equal(
  groupStrengthCardCanLog({
    ...card,
    expectations: [{ userId: member, workoutId: 'workout-1', scheduledDate: today }],
  }),
  false
);
assert.equal(
  groupStrengthCardCanLog({
    ...card,
    expectations: [{ userId: member, workoutId: 'workout-1', scheduledDate: today, excused: true }],
  }),
  true
);

assert.equal(
  sessionFulfillsExpectation(
    { sourceKey: 'group-activity:series-1', workoutId: 'workout-1', logDate: today },
    { id: 'exp-1', workoutId: 'workout-1', scheduledDate: today }
  ),
  false
);
assert.equal(
  sessionFulfillsExpectation(
    { workoutId: 'workout-1', logDate: today },
    { id: 'exp-1', workoutId: 'workout-1', scheduledDate: today }
  ),
  true
);

console.log('group activity log checks passed');
