/**
 * BIQ-0263 Stage 1 group extra rules that do not need a signed-in database.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-group-activity-stage1.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGroupCalendar } from '../lib/groups/groupCalendar';
import {
  buildGroupTrainingBoard,
  extraActivityLabel,
  groupExtraWeekItems,
  requiredExtraStanding,
  type GroupExtraActivity,
  type GroupTrainingExpectationInput,
  type GroupTrainingMemberInput,
} from '../lib/groups/trainingWorkspace';

const today = '2026-10-18';
const teamId = 'team-1';
const weekStart = '2026-10-12';
const types = ['cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest'] as const;

function expectation(date: string, title: string, extra: Partial<GroupTrainingExpectationInput> = {}): GroupTrainingExpectationInput {
  return {
    userId: 'amy',
    sourceKey: `group:${teamId}`,
    teamId,
    origin: 'program',
    scheduledDate: date,
    title,
    dayLabel: 'Wed',
    workoutId: 'w-wed',
    authoritativeStatus: 'missed',
    ...extra,
  };
}

const amy: GroupTrainingMemberInput = {
  userId: 'amy',
  name: 'Amy',
  trainingSource: 'team',
  isActiveParticipant: true,
  enrollment: { programId: 'prog', status: 'active', startsOn: '2026-10-05', expectationEnabled: true },
};

function extra(partial: Partial<GroupExtraActivity> & Pick<GroupExtraActivity, 'id' | 'date' | 'title' | 'activityType'>): GroupExtraActivity {
  return {
    userId: 'amy',
    workoutId: null,
    required: false,
    completed: false,
    ...partial,
  };
}

const typed = types.map((activityType, index) =>
  extra({
    id: activityType,
    date: index < 3 ? '2026-10-18' : '2026-10-17',
    title: activityType,
    activityType,
  })
);
const programWorkout = extra({
  id: 'program-workout',
  date: '2026-10-18',
  title: 'Full Body A',
  activityType: 'strength',
  workoutId: 'w-mon',
});
const requiredOpen = extra({
  id: 'required-open',
  date: '2026-10-18',
  title: 'Required mobility',
  activityType: 'mobility',
  required: true,
});
const requiredDone = extra({
  id: 'required-done',
  date: '2026-10-12',
  title: 'Required stretch',
  activityType: 'stretching',
  required: true,
  completed: true,
});
const requiredPast = extra({
  id: 'required-past',
  date: '2026-10-12',
  title: 'Required recovery',
  activityType: 'recovery',
  required: true,
});
const extras = [...typed, programWorkout, requiredOpen, requiredDone, requiredPast];
const originalExpectations = [expectation('2026-10-14', 'Full Body B')];

const board = buildGroupTrainingBoard({
  teamId,
  today,
  canManage: true,
  viewerUserId: 'owner',
  members: [amy],
  programs: [{ id: 'prog', name: 'Full Body', startDate: '2026-10-05', weeks: 4, visibility: 'team', workouts: [] }],
  defaultProgramId: 'prog',
  expectations: originalExpectations,
  expectationsAvailable: true,
  completionKnown: true,
  extras,
});

assert.equal(board.members[0].missedCount, 1);
assert.equal(originalExpectations.length, 1);
assert.equal(originalExpectations[0].title, 'Full Body B');
const sunday = board.members[0].weekItems.filter((item) => item.date === '2026-10-18');
assert.equal(sunday.some((item) => item.origin === 'program' || item.origin === 'assignment'), false);
assert.equal(sunday.filter((item) => item.origin === 'extra').length, 5);
for (const activityType of ['cardio', 'mobility', 'stretching']) {
  assert.equal(sunday.some((item) => item.activityType === activityType && item.state === 'Scheduled'), true);
}
assert.equal(sunday.some((item) => item.workoutId === 'w-mon' && item.title === 'Full Body A'), true);
assert.equal(sunday.some((item) => item.title === 'Required mobility' && item.required), true);
assert.equal(board.members[0].weekItems.find((item) => item.title === 'Full Body B')?.state, 'Missed');
assert.equal(board.members[0].weekItems.filter((item) => item.state === 'Missed').length, 1);
assert.equal(board.members[0].weekItems.find((item) => item.title === 'Required recovery')?.state, 'Scheduled');
assert.equal(requiredExtraStanding(requiredOpen, today), 'open');
assert.equal(requiredExtraStanding(requiredDone, today), 'completed');
assert.equal(requiredExtraStanding(requiredPast, today), 'not_completed');
assert.equal(requiredExtraStanding({ ...requiredPast, status: 'skipped' }, today), 'skipped');
assert.equal(requiredExtraStanding(typed[0], today), 'open');
assert.equal(extraActivityLabel(false), 'Extra');
assert.equal(extraActivityLabel(true), 'Extra · required');
assert.equal(
  groupExtraWeekItems(
    [extra({ id: 'other', userId: 'mike', date: '2026-10-18', title: 'Hidden', activityType: 'rest' })],
    'amy',
    weekStart,
    '2026-10-18'
  ).length,
  0
);

const calendar = buildGroupCalendar({
  weekStart,
  today,
  teamId,
  expectations: originalExpectations,
  members: [
    { userId: 'amy', name: 'Amy' },
    { userId: 'mike', name: 'Mike' },
  ],
  visibleUserIds: ['amy', 'mike'],
  completionKnown: true,
  extras: [
    ...extras,
    extra({ id: 'mike-rest', userId: 'mike', date: '2026-10-18', title: 'Rest', activityType: 'rest' }),
  ],
});
const sundayCards = calendar.days.find((day) => day.date === '2026-10-18')?.workouts || [];
assert.equal(sundayCards.filter((card) => card.userId === 'amy' && card.origin === 'extra').length, 5);
assert.equal(sundayCards.some((card) => card.title === 'Full Body A' && card.sourceLabel === 'Extra'), true);
assert.equal(sundayCards.some((card) => card.title === 'Rest' && card.memberName === 'Mike'), true);
const wednesday = calendar.days.find((day) => day.date === '2026-10-14')?.workouts || [];
assert.equal(wednesday.some((card) => card.title === 'Full Body B' && card.sourceLabel === 'Group plan' && card.state === 'Missed'), true);
assert.equal(wednesday.some((card) => card.origin === 'extra'), false);
const saturday = calendar.days.find((day) => day.date === '2026-10-17')?.workouts.map((card) => card.title).sort();
assert.deepEqual(saturday, ['recovery', 'rest', 'sport']);

const profile = readFileSync(new URL('../app/components/groups/MemberTrainingWorkspace.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../app/components/groups/GroupTrainingHome.tsx', import.meta.url), 'utf8');
const activities = readFileSync(new URL('../lib/groups/groupActivities.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261018_068_group_activity_series.sql', import.meta.url), 'utf8');
assert.match(profile, /extraActivityLabel/);
assert.match(profile, /Give this activity a name|Cardio, mobility, or other/);
const sheet = readFileSync(new URL('../app/components/groups/GroupMemberProfileSheet.tsx', import.meta.url), 'utf8');
assert.match(sheet, /saveGroupActivity/);
assert.doesNotMatch(sheet, /assignGroupWorkout/);
assert.doesNotMatch(home, /assignGroupWorkout/);
assert.match(activities, /st_save_group_activity/);
assert.doesNotMatch(activities, /st_user_calendar_activities/);
assert.doesNotMatch(migration, /st_training_expectations|st_user_calendar_activities|st_workout_sessions|st_set_logs|st_training_enrollments/);
assert.match(migration, /unique \(series_id, user_id, occurrence_date\)/);
assert.match(migration, /unique \(team_id, request_key\)/);

console.log('group activity stage 1 checks passed');
