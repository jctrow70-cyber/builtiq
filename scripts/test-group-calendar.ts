/**
 * BIQ-0262 Phase 5 group training calendar.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-group-calendar.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  adjacentCalendarWeek,
  buildGroupCalendar,
  calendarMemberIds,
  visibleCalendarCards,
} from '../lib/groups/groupCalendar';
import { buildGroupTrainingBoard, type GroupTrainingExpectationInput } from '../lib/groups/trainingWorkspace';

const today = '2026-10-14';
const teamId = 'team-1';
const weekStart = '2026-10-12';

function row(
  userId: string,
  date: string,
  title: string,
  extra: Partial<GroupTrainingExpectationInput> = {}
): GroupTrainingExpectationInput {
  return {
    userId,
    sourceKey: `group:${teamId}`,
    teamId,
    origin: 'program',
    scheduledDate: date,
    title,
    dayLabel: 'Mon',
    workoutId: title,
    ...extra,
  };
}

const members = [
  { userId: 'amy', name: 'Amy', memberId: 'm-amy' },
  { userId: 'mike', name: 'Mike', memberId: 'm-mike' },
];

function weekFor(expectations: GroupTrainingExpectationInput[], visibleUserIds = ['amy', 'mike'], completionKnown = true) {
  return buildGroupCalendar({
    weekStart,
    today,
    teamId,
    expectations,
    members,
    visibleUserIds,
    completionKnown,
  });
}

const mixed = weekFor([
  row('amy', '2026-10-12', 'Full Body A', { dayLabel: 'Mon' }),
  row('amy', '2026-10-15', 'Full Body B', { dayLabel: 'Wed', workoutId: 'b1' }),
  row('mike', '2026-10-13', 'Full Body A', { dayLabel: 'Mon', workoutId: 'a-mike' }),
  row('mike', '2026-10-15', 'Conditioning', { origin: 'assignment', workoutId: 'one' }),
  row('amy', '2026-10-14', 'Full Body C', { workoutId: 'c1', sessionStatus: 'partial' }),
  row('mike', '2026-10-14', 'Full Body B', { workoutId: 'b-mike', sessionStatus: 'completed' }),
  row('amy', '2026-10-16', 'Excused Day', { excused: true, workoutId: 'ex' }),
  row('amy', '2026-10-11', 'Last Week', { workoutId: 'old' }),
  row('amy', '2026-10-12', 'Personal Lift', { sourceKey: 'personal', workoutId: 'personal' }),
]);

assert.equal(mixed.days.length, 7);
assert.equal(mixed.days[0].date, '2026-10-12');
assert.equal(mixed.days[6].date, '2026-10-18');
assert.equal(mixed.days.find((day) => day.date === '2026-10-12')?.workouts.map((card) => card.memberName).join(','), 'Amy');
assert.equal(mixed.days.find((day) => day.date === '2026-10-13')?.workouts[0].memberName, 'Mike');
const thursday = mixed.days.find((day) => day.date === '2026-10-15');
assert.equal(thursday?.workouts.length, 2);
assert.equal(thursday?.workouts.some((card) => card.title === 'Full Body B' && card.memberName === 'Amy'), true);
assert.equal(mixed.days.some((day) => day.date === '2026-10-14' && day.workouts.some((card) => card.workoutId === 'b1')), false);
assert.equal(thursday?.workouts.find((card) => card.origin === 'assignment')?.sourceLabel, 'One-off');
assert.equal(mixed.days.find((day) => day.date === '2026-10-14')?.workouts.find((card) => card.memberName === 'Amy')?.state, 'Partial');
assert.equal(mixed.days.find((day) => day.date === '2026-10-14')?.workouts.find((card) => card.memberName === 'Mike')?.state, 'Completed');
assert.equal(mixed.days.find((day) => day.date === '2026-10-16')?.workouts[0].state, 'Excused');
assert.equal(mixed.days.some((day) => day.workouts.some((card) => card.title === 'Last Week' || card.title === 'Personal Lift')), false);

const restored = weekFor([row('amy', '2026-10-16', 'Excused Day', { excused: false, workoutId: 'ex' })]);
assert.equal(restored.days.find((day) => day.date === '2026-10-16')?.workouts[0].state, 'Upcoming');

const todayOpen = weekFor([row('amy', '2026-10-14', 'Due', { sessionStatus: null, workoutId: 'due' })]);
assert.equal(todayOpen.days.find((day) => day.date === '2026-10-14')?.workouts[0].state, 'Due today');
const missed = weekFor([row('amy', '2026-10-13', 'Missed', { sessionStatus: null, workoutId: 'miss' })]);
assert.equal(missed.days.find((day) => day.date === '2026-10-13')?.workouts[0].state, 'Missed');
const unknown = weekFor([row('amy', '2026-10-13', 'Missed', { sessionStatus: null, workoutId: 'miss' })], ['amy'], false);
assert.equal(unknown.days.find((day) => day.date === '2026-10-13')?.workouts[0].state, 'Not confirmed');

const customDate = weekFor([row('amy', '2026-10-13', 'Full Body A', { dayLabel: 'Mon', workoutId: 'custom' })]);
assert.equal(customDate.days.find((day) => day.date === '2026-10-12')?.workouts.length, 0);
assert.equal(customDate.days.find((day) => day.date === '2026-10-13')?.workouts[0].title, 'Full Body A');

const amyOnly = calendarMemberIds({
  members,
  memberUserId: 'amy',
  canSeeAll: true,
  viewerUserId: 'owner',
});
assert.deepEqual(amyOnly, ['amy']);
assert.equal(weekFor(mixed.days.flatMap((day) => []), amyOnly).memberCount, 0);
const amyWeek = weekFor(
  [row('amy', '2026-10-12', 'Full Body A'), row('mike', '2026-10-13', 'Full Body A', { workoutId: 'mike-a' })],
  amyOnly
);
assert.equal(amyWeek.workoutCount, 1);
assert.equal(amyWeek.memberCount, 1);

const early = calendarMemberIds({
  members,
  links: { 'm-amy': ['early'] },
  classificationId: 'early',
  canSeeAll: true,
  viewerUserId: 'owner',
});
assert.deepEqual(early, ['amy']);
const memberView = calendarMemberIds({
  members,
  canSeeAll: false,
  viewerUserId: 'mike',
});
assert.deepEqual(memberView, ['mike']);

assert.equal(adjacentCalendarWeek(weekStart, 1), '2026-10-19');
assert.equal(adjacentCalendarWeek(weekStart, -1), '2026-10-05');
const packed = visibleCalendarCards([1, 2, 3, 4, 5], false);
assert.equal(packed.visible.length, 3);
assert.equal(packed.hidden, 2);
assert.equal(visibleCalendarCards([1, 2, 3, 4], true).hidden, 0);

const paused = buildGroupTrainingBoard({
  teamId,
  today,
  canManage: true,
  viewerUserId: 'owner',
  members: [
    {
      userId: 'amy',
      name: 'Amy',
      trainingSource: 'team',
      isActiveParticipant: true,
      enrollment: { programId: 'prog', status: 'active', startsOn: '2026-10-06', expectationEnabled: false },
    },
    {
      userId: 'sarah',
      name: 'Sarah',
      trainingSource: 'personal',
      isActiveParticipant: true,
      enrollment: { programId: null, status: 'active', startsOn: '2026-10-06', expectationEnabled: false },
    },
  ],
  programs: [{ id: 'prog', name: 'Full Body', startDate: '2026-10-05', weeks: 1, workouts: [] }],
  expectations: [],
  expectationsAvailable: true,
  completionKnown: true,
});
assert.equal(paused.members.find((member) => member.userId === 'amy')?.statusLabel, 'Schedule paused');
assert.equal(paused.members.find((member) => member.userId === 'sarah')?.statusLabel, 'Personal training');

const home = readFileSync(new URL('../app/components/groups/GroupTrainingHome.tsx', import.meta.url), 'utf8');
const calendar = readFileSync(new URL('../app/components/groups/GroupTrainingCalendar.tsx', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../app/components/groups/WorkoutScheduleActions.tsx', import.meta.url), 'utf8');
const facts = readFileSync(new URL('../lib/groups/loadGroupTrainingFacts.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const tabs = readFileSync(new URL('../lib/groups/workspaceTabs.ts', import.meta.url), 'utf8');
assert.match(home, /Members/);
assert.match(home, /Calendar/);
assert.match(home, /setFactsTick/);
assert.match(calendar, /WorkoutScheduleActions/);
assert.match(calendar, /Previous week/);
assert.match(calendar, /Next week/);
assert.match(calendar, /group-calendar-mobile/);
assert.match(calendar, /group-calendar-board/);
assert.match(actions, /Move Workout/);
assert.match(actions, /Excuse Workout/);
assert.match(actions, /Restore Workout/);
assert.match(facts, /loadGroupCalendarWeek/);
assert.match(facts, /\.gte\('scheduled_date', from\)/);
assert.match(facts, /\.lte\('scheduled_date', to\)/);
assert.doesNotMatch(calendar, /buildProgramExpectationDates/);
assert.match(css, /@media \(min-width:721px\)/);
assert.match(css, /\.group-calendar-board\{display:grid/);
assert.match(tabs, /Overview/);
assert.match(tabs, /Training/);
assert.doesNotMatch(tabs, /Calendar/);

console.log('group calendar checks passed');
