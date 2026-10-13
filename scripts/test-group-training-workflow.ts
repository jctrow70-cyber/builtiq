/**
 * BIQ-0262 Phase 6 workflow model.
 * This checks the in-memory schedule. It does not execute SQL.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-group-training-workflow.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGroupCalendar } from '../lib/groups/groupCalendar';
import { materializeMemberSchedule, type ScheduleProgram } from '../lib/groups/memberSchedule';
import { applyScheduleOverrides, pauseFutureProgramExpectations, type RescheduleRow } from '../lib/groups/scheduleOverrides';
import { adherenceCounts } from '../lib/training/unifiedSchedule';
import { buildGroupTrainingBoard } from '../lib/groups/trainingWorkspace';

const today = '2026-10-12';
const teamId = 'team';
const program: ScheduleProgram = {
  id: 'shared',
  name: 'Full Body',
  startDate: '2026-10-12',
  weeks: 1,
  workouts: [
    { id: 'a', week: 1, dayLabel: 'Mon', dayOrder: 0, title: 'Full Body A' },
    { id: 'b', week: 1, dayLabel: 'Wed', dayOrder: 1, title: 'Full Body B' },
    { id: 'c', week: 1, dayLabel: 'Fri', dayOrder: 2, title: 'Full Body C' },
  ],
};

function rows(userId: string, weekdays: string[]): RescheduleRow[] {
  return materializeMemberSchedule({
    mode: 'custom_weekdays',
    weekdays,
    program,
    startsOn: today,
    effectiveOn: today,
    cycleAnchor: '2026-10-12',
  }).map((row) => ({
    userId,
    sourceKey: `group:${teamId}`,
    programId: program.id,
    workoutId: row.workoutId,
    scheduledDate: row.scheduledDate,
    dayLabel: row.dayLabel,
    origin: 'program' as const,
    excused: false,
    hasSession: false,
  }));
}

const amy = rows('amy', ['Mon', 'Wed', 'Fri']);
const mike = rows('mike', ['Tue', 'Thu', 'Sat']);
const sarah = rows('sarah', ['Mon', 'Thu', 'Sun']);
assert.deepEqual(amy.map((row) => row.scheduledDate), ['2026-10-12', '2026-10-14', '2026-10-16']);
assert.deepEqual(mike.map((row) => row.scheduledDate), ['2026-10-13', '2026-10-15', '2026-10-17']);
assert.deepEqual(sarah.map((row) => row.scheduledDate), ['2026-10-12', '2026-10-15', '2026-10-18']);
assert.equal(new Set([...amy, ...mike, ...sarah].map((row) => row.programId)).size, 1);

const moved = applyScheduleOverrides(
  [...amy, ...mike, ...sarah],
  [{ userId: 'mike', sourceKey: `group:${teamId}`, workoutId: 'a', originalDate: '2026-10-13', action: 'move', newDate: '2026-10-14' }],
  today
);
assert.equal(moved.find((row) => row.userId === 'mike' && row.workoutId === 'a')?.scheduledDate, '2026-10-14');
assert.equal(moved.find((row) => row.userId === 'amy' && row.workoutId === 'b')?.scheduledDate, '2026-10-14');
assert.equal(moved.filter((row) => row.userId === 'amy' && row.scheduledDate === '2026-10-13').length, 0);

const excused = applyScheduleOverrides(
  moved,
  [{ userId: 'amy', sourceKey: `group:${teamId}`, workoutId: 'b', originalDate: '2026-10-14', action: 'excuse', newDate: null }],
  today
);
const amyExcuse = adherenceCounts(
  excused.filter((row) => row.userId === 'amy').map((row) => ({ scheduledDate: row.scheduledDate, excused: row.excused, origin: 'program' as const, sourceKey: row.sourceKey })),
  '2026-10-15'
);
const amyIfCounted = adherenceCounts(
  excused.filter((row) => row.userId === 'amy').map((row) => ({ scheduledDate: row.scheduledDate, excused: false, origin: 'program' as const, sourceKey: row.sourceKey })),
  '2026-10-15'
);
assert.ok(amyExcuse.expected_past < amyIfCounted.expected_past);

const completed = excused.map((row) =>
  row.userId === 'sarah' && row.scheduledDate === '2026-10-12' ? { ...row, hasSession: true } : row
);
const calendar = buildGroupCalendar({
  weekStart: today,
  today: '2026-10-12',
  teamId,
  expectations: completed.map((row) => ({
    userId: row.userId,
    sourceKey: row.sourceKey,
    teamId,
    origin: row.origin,
    scheduledDate: row.scheduledDate,
    title: row.workoutId || 'Workout',
    workoutId: row.workoutId,
    excused: row.excused,
    sessionStatus: row.hasSession ? 'completed' : null,
  })),
  members: [
    { userId: 'amy', name: 'Amy' },
    { userId: 'mike', name: 'Mike' },
    { userId: 'sarah', name: 'Sarah' },
  ],
  visibleUserIds: ['amy', 'mike', 'sarah'],
  completionKnown: true,
});
assert.equal(calendar.days.find((day) => day.date === '2026-10-12')?.workouts.find((card) => card.userId === 'sarah')?.state, 'Completed');
assert.equal(calendar.days.find((day) => day.date === '2026-10-13')?.workouts.some((card) => card.userId === 'mike' && card.workoutId === 'a'), false);
assert.equal(calendar.days.find((day) => day.date === '2026-10-14')?.workouts.filter((card) => card.userId === 'mike').length, 1);

const paused = pauseFutureProgramExpectations(
  [
    ...completed,
    { userId: 'mike', sourceKey: 'personal', programId: 'personal-plan', workoutId: 'p', scheduledDate: '2026-10-16', dayLabel: 'Fri', origin: 'program', excused: false, hasSession: false },
  ],
  'mike',
  `group:${teamId}`,
  '2026-10-15'
);
assert.equal(paused.some((row) => row.userId === 'mike' && row.sourceKey.startsWith('group:') && row.scheduledDate >= '2026-10-15'), false);
assert.equal(paused.some((row) => row.userId === 'mike' && row.workoutId === 'a' && row.scheduledDate === '2026-10-14'), true);
assert.equal(paused.some((row) => row.userId === 'mike' && row.sourceKey === 'personal'), true);
const resumed = rows('mike', ['Tue', 'Thu', 'Sat']).filter((row) => row.scheduledDate >= '2026-10-16');
assert.equal(resumed.some((row) => row.scheduledDate < '2026-10-16'), false);

const withOneOff = [
  ...completed,
  { userId: 'sarah', sourceKey: `group:${teamId}`, programId: null, workoutId: 'extra', scheduledDate: '2026-10-16', dayLabel: 'Fri', origin: 'assignment' as const, excused: false, hasSession: false },
];
const oneOffCalendar = buildGroupCalendar({
  weekStart: today,
  today,
  teamId,
  expectations: withOneOff.map((row) => ({
    userId: row.userId,
    sourceKey: row.sourceKey,
    teamId,
    origin: row.origin,
    scheduledDate: row.scheduledDate,
    title: row.origin === 'assignment' ? 'Extra' : 'Workout',
    workoutId: row.workoutId,
    excused: row.excused,
  })),
  members: [{ userId: 'sarah', name: 'Sarah' }],
  visibleUserIds: ['sarah'],
  completionKnown: true,
});
assert.equal(oneOffCalendar.days.find((day) => day.date === '2026-10-16')?.workouts.some((card) => card.origin === 'assignment'), true);

const refreshed = applyScheduleOverrides(
  [...rows('amy', ['Mon', 'Wed', 'Fri']), ...rows('mike', ['Tue', 'Thu', 'Sat'])],
  [{ userId: 'mike', sourceKey: `group:${teamId}`, workoutId: 'a', originalDate: '2026-10-13', action: 'move', newDate: '2026-10-14' }],
  today
);
assert.equal(refreshed.filter((row) => row.userId === 'mike' && row.workoutId === 'a').length, 1);
assert.equal(program.workouts[0].dayLabel, 'Mon');

const board = buildGroupTrainingBoard({
  teamId,
  today,
  canManage: false,
  viewerUserId: 'amy',
  members: [
    { userId: 'amy', name: 'Amy', enrollment: { programId: program.id, expectationEnabled: true } },
    { userId: 'mike', name: 'Mike', enrollment: { programId: program.id, expectationEnabled: false } },
  ],
  programs: [program],
  expectations: [],
  expectationsAvailable: true,
  completionKnown: true,
});
assert.equal(board.members.length, 1);
assert.equal(board.members[0].userId, 'amy');

const assigner = buildGroupTrainingBoard({
  teamId,
  today,
  canManage: true,
  viewerUserId: 'assigner',
  members: [
    { userId: 'amy', name: 'Amy', trainingSource: 'team', enrollment: { programId: program.id, expectationEnabled: true } },
    { userId: 'mike', name: 'Mike', trainingSource: 'personal', enrollment: { expectationEnabled: false } },
  ],
  programs: [program],
  expectations: [],
  expectationsAvailable: true,
  completionKnown: true,
});
assert.equal(assigner.members.find((member) => member.userId === 'mike')?.statusLabel, 'Personal training');

const sql = readFileSync(new URL('../supabase/migrations/20261012_065_assigner_schedule_read.sql', import.meta.url), 'utf8');
assert.match(sql, /st_user_can_assign_in_group/);
assert.match(sql, /source_key <> 'personal'/);
assert.doesNotMatch(sql, /grant insert|grant update|grant delete/i);
const home = readFileSync(new URL('../app/components/groups/GroupTrainingHome.tsx', import.meta.url), 'utf8');
assert.match(home, /canManage \|\| canAssign/);
assert.doesNotMatch(home, /\{assignmentTools\}/);

console.log('group training workflow checks passed');
