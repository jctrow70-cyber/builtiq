/**
 * BIQ-0262 Phase 4 individual workout rescheduling.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-workout-reschedule.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adherenceCounts } from '../lib/training/unifiedSchedule';
import { materializeMemberSchedule } from '../lib/groups/memberSchedule';
import {
  applyScheduleOverrides,
  excusedLeavesDenominator,
  pauseFutureProgramExpectations,
  personalCalendarGroupDate,
  rescheduleBlockReason,
  type RescheduleRow,
} from '../lib/groups/scheduleOverrides';

const today = '2026-10-12';
const program = {
  id: 'full-body',
  name: 'Full Body Strength',
  startDate: '2026-10-12',
  weeks: 1,
  workouts: [
    { id: 'a1', week: 1, dayLabel: 'Mon', dayOrder: 0, title: 'Full Body A' },
    { id: 'b1', week: 1, dayLabel: 'Wed', dayOrder: 1, title: 'Full Body B' },
    { id: 'c1', week: 1, dayLabel: 'Fri', dayOrder: 2, title: 'Full Body C' },
  ],
};

function generated(userId: string): RescheduleRow[] {
  return materializeMemberSchedule({
    mode: 'program_days',
    program,
    startsOn: '2026-10-12',
    effectiveOn: today,
  }).map((row) => ({
    userId,
    sourceKey: 'group:team',
    programId: program.id,
    workoutId: row.workoutId,
    scheduledDate: row.scheduledDate,
    dayLabel: row.dayLabel,
    origin: 'program' as const,
    excused: false,
    hasSession: false,
  }));
}

const amy = generated('amy');
const mike = generated('mike');
const wednesday = amy.find((row) => row.workoutId === 'b1');
assert.ok(wednesday);
assert.equal(wednesday.scheduledDate, '2026-10-14');

const moved = applyScheduleOverrides(
  [...amy, ...mike],
  [{ userId: 'amy', sourceKey: 'group:team', workoutId: 'b1', originalDate: '2026-10-14', action: 'move', newDate: '2026-10-15' }],
  today
);
const amyMoved = moved.find((row) => row.userId === 'amy' && row.workoutId === 'b1');
const mikeSame = moved.find((row) => row.userId === 'mike' && row.workoutId === 'b1');
assert.equal(amyMoved?.scheduledDate, '2026-10-15');
assert.equal(mikeSame?.scheduledDate, '2026-10-14');
assert.equal(moved.filter((row) => row.userId === 'amy' && row.workoutId === 'b1').length, 1);

const occupied = applyScheduleOverrides(
  amy,
  [{ userId: 'amy', sourceKey: 'group:team', workoutId: 'b1', originalDate: '2026-10-14', action: 'move', newDate: '2026-10-16' }],
  today
);
assert.equal(occupied.filter((row) => row.scheduledDate === '2026-10-16').length, 2);
assert.deepEqual(
  occupied.filter((row) => row.scheduledDate === '2026-10-16').map((row) => row.workoutId).sort(),
  ['b1', 'c1']
);

const rebuilt = generated('amy');
const again = applyScheduleOverrides(
  rebuilt,
  [{ userId: 'amy', sourceKey: 'group:team', workoutId: 'b1', originalDate: '2026-10-14', action: 'move', newDate: '2026-10-15' }],
  today
);
const twice = applyScheduleOverrides(
  again,
  [{ userId: 'amy', sourceKey: 'group:team', workoutId: 'b1', originalDate: '2026-10-14', action: 'move', newDate: '2026-10-15' }],
  today
);
assert.equal(again.find((row) => row.workoutId === 'b1')?.scheduledDate, '2026-10-15');
assert.equal(twice.filter((row) => row.workoutId === 'b1').length, 1);
assert.equal(program.workouts.find((row) => row.id === 'b1')?.dayLabel, 'Wed');

assert.equal(rescheduleBlockReason({ scheduledDate: '2026-10-11', today, hasSession: false, action: 'move' }), 'Past workouts stay in history.');
assert.equal(rescheduleBlockReason({ scheduledDate: today, today, hasSession: true, action: 'move' }), 'A logged workout stays on its date.');
const frozen = applyScheduleOverrides(
  amy.map((row) => (row.workoutId === 'b1' ? { ...row, hasSession: true } : row)),
  [{ userId: 'amy', sourceKey: 'group:team', workoutId: 'b1', originalDate: '2026-10-14', action: 'move', newDate: '2026-10-15' }],
  today
);
assert.equal(frozen.find((row) => row.workoutId === 'b1')?.scheduledDate, '2026-10-14');

const excused = applyScheduleOverrides(
  amy,
  [{ userId: 'amy', sourceKey: 'group:team', workoutId: 'b1', originalDate: '2026-10-14', action: 'excuse', newDate: null }],
  today
);
assert.equal(excused.find((row) => row.workoutId === 'b1')?.excused, true);
assert.equal(excused.filter((row) => row.workoutId === 'b1').length, 1);
assert.equal(
  excusedLeavesDenominator(
    [{ scheduledDate: '2026-10-14', excused: true, origin: 'program', sourceKey: 'group:team' }],
    today
  ),
  true
);
const restored = applyScheduleOverrides(amy, [], today);
assert.equal(restored.find((row) => row.workoutId === 'b1')?.excused, false);

const skipped = adherenceCounts(
  [{ scheduledDate: '2026-10-11', sessionStatus: 'skipped', origin: 'program', sourceKey: 'group:team' }],
  today
);
assert.equal(skipped.expected_past, 1);
assert.equal(skipped.skipped_past, 1);

const paused = pauseFutureProgramExpectations(
  [
    ...amy,
    { userId: 'amy', sourceKey: 'personal', programId: 'personal', workoutId: 'p1', scheduledDate: '2026-10-16', dayLabel: 'Fri', origin: 'program', excused: false, hasSession: false },
    { userId: 'amy', sourceKey: 'group:team', programId: program.id, workoutId: 'one', scheduledDate: '2026-10-16', dayLabel: 'Fri', origin: 'assignment', excused: false, hasSession: false },
    { userId: 'amy', sourceKey: 'group:team', programId: program.id, workoutId: 'past', scheduledDate: '2026-10-11', dayLabel: 'Sun', origin: 'program', excused: false, hasSession: false },
  ],
  'amy',
  'group:team',
  today
);
assert.equal(paused.some((row) => row.sourceKey === 'group:team' && row.origin === 'program' && row.scheduledDate >= today), false);
assert.equal(paused.some((row) => row.sourceKey === 'personal'), true);
assert.equal(paused.some((row) => row.origin === 'assignment'), true);
assert.equal(paused.some((row) => row.scheduledDate === '2026-10-11'), true);
const resumed = generated('amy').filter((row) => row.scheduledDate >= today);
assert.equal(resumed.some((row) => row.scheduledDate < today), false);

assert.equal(personalCalendarGroupDate({ sourceKey: 'group:team', scheduledDate: '2026-10-15', scheduleVisible: true }), '2026-10-15');
assert.equal(personalCalendarGroupDate({ sourceKey: 'group:team', scheduledDate: '2026-10-15', scheduleVisible: false }), null);
assert.equal(personalCalendarGroupDate({ sourceKey: 'personal', scheduledDate: '2026-10-16', scheduleVisible: true }), null);

const sql = readFileSync(new URL('../supabase/migrations/20261012_064_workout_reschedule.sql', import.meta.url), 'utf8');
const phase3 = readFileSync(new URL('../supabase/migrations/20261012_063_member_training_schedules.sql', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../app/components/groups/MemberTrainingWorkspace.tsx', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../app/components/groups/WorkoutScheduleActions.tsx', import.meta.url), 'utf8');
assert.match(sql, /st_training_schedule_overrides/);
assert.match(sql, /unique \(enrollment_id, workout_id, original_scheduled_date, action\)/);
assert.match(sql, /st_apply_saved_overrides/);
assert.match(sql, /st_move_member_workout/);
assert.match(sql, /st_excuse_member_workout/);
assert.match(sql, /st_restore_member_workout/);
assert.match(sql, /st_set_member_group_expectation/);
assert.match(sql, /Not authorized/);
assert.match(sql, /Past workouts stay in history/);
assert.match(sql, /A logged workout stays on its date/);
assert.match(sql, /expectation_enabled = p_enabled/);
assert.doesNotMatch(sql, /update public\.st_programs/);
assert.doesNotMatch(sql, /status = 'paused'/);
assert.doesNotMatch(phase3, /st_training_schedule_overrides/);
assert.match(workspace, /WorkoutScheduleActions/);
assert.match(actions, /Move Workout/);
assert.match(actions, /Excuse Workout/);
assert.match(actions, /Restore Workout/);
assert.match(workspace, /Edit Training Days/);
assert.match(workspace, /Pause Schedule/);
assert.match(workspace, /Resume Schedule/);
assert.match(workspace, /Edit shared program/);
assert.doesNotMatch(workspace, /Skip Workout/);

const amyDays = materializeMemberSchedule({
  mode: 'custom_weekdays',
  weekdays: ['Mon', 'Wed', 'Fri'],
  program,
  startsOn: '2026-10-12',
  effectiveOn: today,
});
assert.deepEqual(amyDays.map((row) => row.scheduledDate), ['2026-10-12', '2026-10-14', '2026-10-16']);

console.log('workout reschedule tests passed');
