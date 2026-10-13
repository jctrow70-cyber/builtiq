/**
 * BIQ-0262 Phase 3 per-member schedules.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-member-schedule.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProgramExpectationDates } from '../lib/training/unifiedSchedule';
import { buildGroupTrainingBoard } from '../lib/groups/trainingWorkspace';
import {
  customWeekdayError,
  materializeMemberSchedule,
  programCycleAnchor,
  refreshScheduledExpectations,
  type ExpectationRow,
} from '../lib/groups/memberSchedule';

const program = {
  id: 'full-body',
  name: 'Full Body Strength',
  startDate: '2026-10-12',
  weeks: 2,
  workouts: [
    { id: 'a1', week: 1, dayLabel: 'Mon', dayOrder: 0, title: 'Workout A' },
    { id: 'b1', week: 1, dayLabel: 'Wed', dayOrder: 1, title: 'Workout B' },
    { id: 'c1', week: 1, dayLabel: 'Fri', dayOrder: 2, title: 'Workout C' },
    { id: 'a2', week: 2, dayLabel: 'Mon', dayOrder: 0, title: 'Workout A' },
    { id: 'b2', week: 2, dayLabel: 'Wed', dayOrder: 1, title: 'Workout B' },
    { id: 'c2', week: 2, dayLabel: 'Fri', dayOrder: 2, title: 'Workout C' },
  ],
};

const amy = materializeMemberSchedule({
  mode: 'program_days',
  program,
  startsOn: '2026-10-12',
  effectiveOn: '2026-10-12',
});
const mike = materializeMemberSchedule({
  mode: 'custom_weekdays',
  weekdays: ['Tue', 'Thu', 'Sat'],
  program,
  startsOn: '2026-10-12',
  effectiveOn: '2026-10-12',
  cycleAnchor: programCycleAnchor(program, '2026-10-12'),
});
const sarah = materializeMemberSchedule({
  mode: 'custom_weekdays',
  weekdays: ['Mon', 'Thu', 'Sun'],
  program,
  startsOn: '2026-10-12',
  effectiveOn: '2026-10-12',
  cycleAnchor: programCycleAnchor(program, '2026-10-12'),
});

assert.deepEqual(amy.slice(0, 3).map((row) => row.scheduledDate), ['2026-10-12', '2026-10-14', '2026-10-16']);
assert.deepEqual(mike.slice(0, 3).map((row) => row.scheduledDate), ['2026-10-13', '2026-10-15', '2026-10-17']);
assert.deepEqual(sarah.slice(0, 3).map((row) => row.scheduledDate), ['2026-10-12', '2026-10-15', '2026-10-18']);
assert.deepEqual(amy.slice(0, 3).map((row) => row.workoutId), ['a1', 'b1', 'c1']);
assert.deepEqual(mike.slice(0, 3).map((row) => row.workoutId), ['a1', 'b1', 'c1']);
assert.deepEqual(sarah.slice(0, 3).map((row) => row.workoutId), ['a1', 'b1', 'c1']);
assert.equal(mike[3].workoutId, 'a2');
assert.equal(mike[3].scheduledDate, '2026-10-20');

const mikeLater = materializeMemberSchedule({
  mode: 'custom_weekdays',
  weekdays: ['Fri', 'Sat', 'Sun'],
  program,
  startsOn: '2026-10-12',
  effectiveOn: '2026-10-12',
  cycleAnchor: programCycleAnchor(program, '2026-10-12'),
});
assert.deepEqual(amy.slice(0, 3).map((row) => row.scheduledDate), ['2026-10-12', '2026-10-14', '2026-10-16']);
assert.notDeepEqual(mikeLater.slice(0, 3).map((row) => row.scheduledDate), mike.slice(0, 3).map((row) => row.scheduledDate));

assert.equal(customWeekdayError(
  [
    { id: 'a', week: 1, dayLabel: 'Mon', dayOrder: 0 },
    { id: 'b', week: 1, dayLabel: 'Wed', dayOrder: 1 },
    { id: 'c', week: 2, dayLabel: 'Mon', dayOrder: 0 },
  ],
  ['Mon', 'Wed']
)?.includes('same number'), true);

assert.equal(customWeekdayError(
  [
    { id: 'a', week: 1, dayLabel: 'Mon', dayOrder: 0 },
    { id: 'b', week: 1, dayLabel: 'Mon', dayOrder: 0 },
  ],
  ['Mon', 'Wed']
)?.includes('clear order'), true);

const programDays = buildProgramExpectationDates({
  sourceKind: 'group',
  startsOn: '2026-10-12',
  programStart: '2026-10-12',
  cycleWeeks: 2,
  workouts: program.workouts.map((workout) => ({ id: workout.id, week: workout.week, dayLabel: workout.dayLabel, title: workout.title })),
  effectiveOn: '2026-10-12',
});
assert.deepEqual(amy.map((row) => row.scheduledDate), programDays.map((row) => row.scheduledDate));
assert.deepEqual(amy.map((row) => row.workoutId), programDays.map((row) => row.workoutId));

const anchor = programCycleAnchor(program, '2026-10-20');
assert.equal(anchor, '2026-10-12');
const joined = materializeMemberSchedule({
  mode: 'custom_weekdays',
  weekdays: ['Tue', 'Thu', 'Sat'],
  program,
  startsOn: '2026-10-20',
  effectiveOn: '2026-10-20',
  cycleAnchor: anchor,
});
assert.equal(joined[0].scheduledDate, '2026-10-20');
assert.equal(joined[0].workoutId, 'a2');
assert.equal(joined.some((row) => row.scheduledDate < '2026-10-20'), false);

const baseRows: ExpectationRow[] = [
  { userId: 'amy', sourceKey: 'group:team', programId: 'full-body', workoutId: 'old', scheduledDate: '2026-10-01', dayLabel: 'Wed', origin: 'program', hasSession: true },
  { userId: 'amy', sourceKey: 'group:team', programId: 'full-body', workoutId: 'a1', scheduledDate: '2026-10-12', dayLabel: 'Mon', origin: 'program', hasSession: true },
  { userId: 'amy', sourceKey: 'group:team', programId: 'full-body', workoutId: 'b1', scheduledDate: '2026-10-14', dayLabel: 'Wed', origin: 'program', hasSession: false },
  { userId: 'amy', sourceKey: 'personal', programId: 'secret', workoutId: 'secret', scheduledDate: '2026-10-13', dayLabel: 'Tue', origin: 'program', hasSession: false },
  { userId: 'amy', sourceKey: 'group:team', programId: null, workoutId: 'one-off', scheduledDate: '2026-10-13', dayLabel: 'Tue', origin: 'assignment', hasSession: false },
];
const refreshed = refreshScheduledExpectations({
  rows: baseRows,
  userId: 'amy',
  sourceKey: 'group:team',
  mode: 'custom_weekdays',
  weekdays: ['Tue', 'Thu', 'Sat'],
  program,
  startsOn: '2026-10-12',
  effectiveOn: '2026-10-12',
  cycleAnchor: anchor,
  todayFrozen: true,
  staleCustom: false,
});
assert.equal(refreshed.some((row) => row.scheduledDate === '2026-10-01' && row.workoutId === 'old'), true);
assert.equal(refreshed.some((row) => row.scheduledDate === '2026-10-12' && row.workoutId === 'a1' && row.hasSession), true);
assert.equal(refreshed.some((row) => row.sourceKey === 'personal' && row.workoutId === 'secret'), true);
assert.equal(refreshed.some((row) => row.origin === 'assignment' && row.workoutId === 'one-off'), true);
assert.equal(refreshed.some((row) => row.scheduledDate === '2026-10-14' && row.workoutId === 'b1'), false);
assert.equal(refreshed.some((row) => row.scheduledDate === '2026-10-13' && row.workoutId === 'a1'), true);
const again = refreshScheduledExpectations({
  rows: refreshed,
  userId: 'amy',
  sourceKey: 'group:team',
  mode: 'custom_weekdays',
  weekdays: ['Tue', 'Thu', 'Sat'],
  program,
  startsOn: '2026-10-12',
  effectiveOn: '2026-10-12',
  cycleAnchor: anchor,
  todayFrozen: true,
  staleCustom: false,
});
assert.deepEqual(
  again.filter((row) => row.userId === 'amy' && row.origin === 'program' && row.sourceKey === 'group:team').map((row) => `${row.scheduledDate}:${row.workoutId}`),
  refreshed.filter((row) => row.userId === 'amy' && row.origin === 'program' && row.sourceKey === 'group:team').map((row) => `${row.scheduledDate}:${row.workoutId}`)
);

const stale = refreshScheduledExpectations({
  rows: baseRows,
  userId: 'amy',
  sourceKey: 'group:team',
  mode: 'custom_weekdays',
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu'],
  program,
  startsOn: '2026-10-12',
  effectiveOn: '2026-10-12',
  todayFrozen: false,
  staleCustom: true,
});
assert.equal(stale.some((row) => row.scheduledDate === '2026-10-14' && row.workoutId === 'b1'), true);

const forkProfile = { mode: 'custom_weekdays' as const, weekdays: ['Tue', 'Thu', 'Sat'], cycleAnchor: '2026-10-12' };
const forkProgram = { ...program, id: 'fork', sourceProgramId: program.id };
assert.deepEqual(forkProfile.weekdays, ['Tue', 'Thu', 'Sat']);
assert.equal(materializeMemberSchedule({
  mode: forkProfile.mode,
  weekdays: forkProfile.weekdays,
  program: forkProgram,
  startsOn: '2026-10-12',
  effectiveOn: '2026-10-12',
  cycleAnchor: forkProfile.cycleAnchor,
})[0].workoutId, 'a1');

const board = buildGroupTrainingBoard({
  teamId: 'team',
  today: '2026-10-12',
  canManage: true,
  viewerUserId: 'amy',
  members: [
    {
      userId: 'mike',
      name: 'Mike',
      enrollment: { programId: 'full-body', status: 'active', startsOn: '2026-10-12' },
      schedule: { mode: 'custom_weekdays', weekdays: ['Tue', 'Thu', 'Sat'] },
    },
  ],
  programs: [program],
  expectations: [],
  expectationsAvailable: false,
  completionKnown: false,
});
assert.equal(board.members[0].scheduleDays, 'Tue, Thu, Sat');

const reviewBoard = buildGroupTrainingBoard({
  teamId: 'team',
  today: '2026-10-12',
  canManage: true,
  viewerUserId: 'amy',
  members: [
    {
      userId: 'mike',
      name: 'Mike',
      enrollment: { programId: 'full-body', status: 'active', startsOn: '2026-10-12' },
      schedule: { mode: 'custom_weekdays', weekdays: ['Mon', 'Tue', 'Wed', 'Thu'] },
    },
  ],
  programs: [{ ...program, workouts: program.workouts }],
  expectations: [],
  expectationsAvailable: true,
  completionKnown: true,
});
assert.equal(reviewBoard.members[0].scheduleNeedsReview, true);
assert.match(reviewBoard.members[0].scheduleReviewDetail || '', /stay as they are/);

const migration = readFileSync(new URL('../supabase/migrations/20261012_063_member_training_schedules.sql', import.meta.url), 'utf8');
const assignFn = migration.slice(migration.indexOf('function public.st_assign_group_programs'));
assert.ok(assignFn.indexOf('st_program_custom_schedule_error') < assignFn.indexOf('insert into public.st_program_assignments'));
assert.match(migration, /st_training_schedule_profiles/);
assert.match(migration, /mode text not null default 'program_days'/);
assert.match(migration, /source_key = 'personal'/);
assert.match(migration, /Not authorized/);
assert.match(migration, /on conflict \(user_id, source_key, workout_id, scheduled_date\)/);
assert.match(migration, /not public.st_expectation_has_session\(e.id\)/);
assert.match(migration, /row_number\(\) over/);
assert.doesNotMatch(migration, /st_training_schedule_overrides/);
assert.match(readFileSync(new URL('../app/components/groups/AssignTrainingWizard.tsx', import.meta.url), 'utf8'), /materializeMemberSchedule/);
assert.match(readFileSync(new URL('../app/components/groups/MemberTrainingWorkspace.tsx', import.meta.url), 'utf8'), /Edit Training Days/);
assert.match(readFileSync(new URL('../app/components/groups/GroupTrainingHome.tsx', import.meta.url), 'utf8'), /scheduleMode/);

console.log('member schedule checks passed');
