/**
 * BIQ-0263 session finalization. Run: node .\node_modules\tsx\dist\cli.mjs .\scripts\test-session-finalization.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completedSessionDraft, outstandingRequiredSetIds, sessionStatusAfterPlanChange } from '../lib/training/sessionOutcome';
import { preservedSessionLink } from '../lib/training/workoutSessions';
import { pickFulfillingSession } from '../lib/training/unifiedSchedule';

const workout = {
  id: 'group-wo',
  st_exercises: [
    {
      section: 'warmup',
      st_planned_sets: [{ id: 'wu', set_type: 'warmup' }],
    },
    {
      section: 'strength',
      st_planned_sets: [
        { id: 'work-1', set_type: 'working' },
        { id: 'work-2', set_type: 'working' },
        { id: 'deleted', set_type: 'working', is_deleted: true },
      ],
    },
  ],
};

const link = {
  intent: 'log' as const,
  logDate: '2026-10-15',
  expectationId: 'exp-moved',
  sourceKey: 'group:team-1',
  scheduledDate: '2026-10-15',
};

const done = completedSessionDraft({
  ...link,
  workout,
  logs: {
    'work-1': { completed: true, planned_set_id: 'work-1' },
    'work-2': { completed: true, planned_set_id: 'work-2' },
  },
});
assert.equal(done?.status, 'completed');
assert.equal(done?.workoutId, 'group-wo');
assert.equal(done?.expectationId, 'exp-moved');
assert.equal(done?.sourceKey, 'group:team-1');
assert.equal(done?.scheduledDate, '2026-10-15');

const partial = completedSessionDraft({
  ...link,
  workout,
  logs: {
    'work-1': { completed: true, planned_set_id: 'work-1' },
    'work-2': { completed: false, planned_set_id: 'work-2' },
  },
});
assert.equal(partial, null);

const skipped = completedSessionDraft({
  ...link,
  workout,
  logs: {},
  existingStatus: 'skipped',
});
assert.equal(skipped, null);
assert.equal(completedSessionDraft({ ...link, workout, logs: {} }), null);

const repeat = completedSessionDraft({
  ...link,
  workout,
  existingStatus: 'completed',
  logs: {
    'work-1': { completed: true, planned_set_id: 'work-1' },
    'work-2': { completed: true, planned_set_id: 'work-2' },
  },
});
assert.equal(repeat, null);

const moved = completedSessionDraft({
  ...link,
  scheduledDate: '2026-10-16',
  logDate: '2026-10-16',
  workout,
  logs: {
    'work-1': { completed: true, planned_set_id: 'work-1' },
    'work-2': { completed: true, planned_set_id: 'work-2' },
    'old-day': { completed: true, planned_set_id: 'old-day' },
  },
});
assert.equal(moved?.scheduledDate, '2026-10-16');
assert.equal(moved?.workoutId, 'group-wo');

const personalSameDay = completedSessionDraft({
  ...link,
  workout,
  logs: {
    'personal-1': { completed: true, planned_set_id: 'personal-1' },
    'personal-2': { completed: true, planned_set_id: 'personal-2' },
  },
});
assert.equal(personalSameDay, null);

const secondWorkout = {
  id: 'group-wo-b',
  st_exercises: [{ section: 'strength', st_planned_sets: [{ id: 'b1', set_type: 'working' }] }],
};
assert.equal(
  completedSessionDraft({
    ...link,
    workout: secondWorkout,
    logs: { 'work-1': { completed: true, planned_set_id: 'work-1' }, 'work-2': { completed: true, planned_set_id: 'work-2' } },
  }),
  null
);
assert.equal(
  completedSessionDraft({
    ...link,
    workout: secondWorkout,
    expectationId: 'exp-b',
    logs: { b1: { completed: true, planned_set_id: 'b1' } },
  })?.workoutId,
  'group-wo-b'
);

const overlaid = completedSessionDraft({
  ...link,
  workout,
  logs: {
    'work-1': { completed: true, planned_set_id: 'other-program-set' },
    'work-2': { completed: true, planned_set_id: 'work-2' },
  },
});
assert.equal(overlaid, null);

const explicitPartial = completedSessionDraft({
  ...link,
  workout,
  existingStatus: 'partial',
  logs: {
    'work-1': { completed: true, planned_set_id: 'work-1' },
    'work-2': { completed: true, planned_set_id: 'work-2' },
  },
});
assert.equal(explicitPartial, null);

const stored = {
  expectation_id: 'exp-moved',
  source_key: 'group:team-1',
  scheduled_date: '2026-10-16',
  feedback_id: 'feel-1',
  completed_at: '2026-10-16T15:00:00.000Z',
};
const reopened = preservedSessionLink(stored, {
  status: 'completed',
  expectation_id: null,
  source_key: null,
  scheduled_date: null,
  feedback_id: 'feel-2',
});
assert.equal(reopened.expectation_id, 'exp-moved');
assert.equal(reopened.source_key, 'group:team-1');
assert.equal(reopened.scheduled_date, '2026-10-16');
assert.equal(reopened.feedback_id, 'feel-2');
assert.equal(reopened.completed_at, stored.completed_at);
const movedAgain = preservedSessionLink(stored, {
  status: 'completed',
  expectation_id: 'exp-new',
  source_key: 'group:team-1',
  scheduled_date: '2026-10-17',
});
assert.equal(movedAgain.expectation_id, 'exp-new');
assert.equal(movedAgain.scheduled_date, '2026-10-17');

const addedSet = {
  id: 'group-wo',
  st_exercises: [
    {
      section: 'strength',
      st_planned_sets: [
        { id: 'work-1', set_type: 'working' },
        { id: 'work-2', set_type: 'working' },
        { id: 'work-3', set_type: 'working' },
      ],
    },
  ],
};
const openLogs = {
  'work-1': { completed: true, planned_set_id: 'work-1' },
  'work-2': { completed: true, planned_set_id: 'work-2' },
};
assert.deepEqual(outstandingRequiredSetIds(addedSet, openLogs), ['work-3']);
assert.equal(sessionStatusAfterPlanChange({ existingStatus: 'completed', workout: addedSet, logs: openLogs }), 'partial');
assert.equal(sessionStatusAfterPlanChange({ existingStatus: 'partial', workout: addedSet, logs: openLogs }), null);
assert.equal(sessionStatusAfterPlanChange({ existingStatus: 'skipped', workout: addedSet, logs: openLogs }), null);
assert.equal(
  completedSessionDraft({ ...link, workout: addedSet, logs: openLogs, existingStatus: 'partial' }),
  null
);

const pair = [
  { id: 'exp-a', userId: 'amy', workoutId: 'group-wo', scheduledDate: '2026-10-16' },
  { id: 'exp-b', userId: 'amy', workoutId: 'group-wo', scheduledDate: '2026-10-16' },
];
const linkedToA = [{ expectationId: 'exp-a', workoutId: 'group-wo', logDate: '2026-10-16', status: 'completed' }];
assert.equal(pickFulfillingSession(linkedToA, pair[0], pair)?.expectationId, 'exp-a');
assert.equal(pickFulfillingSession(linkedToA, pair[1], pair), null);
const unlinked = [{ expectationId: null, workoutId: 'group-wo', logDate: '2026-10-16', status: 'completed' }];
assert.equal(pickFulfillingSession(unlinked, pair[0], pair), null);
assert.equal(pickFulfillingSession(unlinked, pair[1], pair), null);
assert.equal(pickFulfillingSession(unlinked, pair[0], [pair[0]])?.workoutId, 'group-wo');

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert.match(page, /completedSessionDraft\(/);
assert.match(page, /expectation_id:draft\.expectationId/);
assert.match(page, /source_key:draft\.sourceKey/);
assert.match(page, /scheduled_date:draft\.scheduledDate/);
assert.match(page, /sessionStatusAfterPlanChange\(/);
assert.match(page, /Additional required sets are still open/);
const sessionsLib = readFileSync(new URL('../lib/training/workoutSessions.ts', import.meta.url), 'utf8');
assert.match(sessionsLib, /preservedSessionLink/);
assert.match(sessionsLib, /onConflict: 'user_id,workout_id,log_date'/);

const statusSql = readFileSync(new URL('../supabase/migrations/20261016_067_group_expectation_status.sql', import.meta.url), 'utf8');
assert.match(statusSql, /DO NOT APPLY/);
assert.match(statusSql, /st_user_can_edit_team\(p_team_id\)/);
assert.match(statusSql, /tm\.status = 'active'/);
assert.match(statusSql, /m\.status = 'active'/);
assert.match(statusSql, /s\.expectation_id = e\.id/);
assert.match(statusSql, /s\.expectation_id is null/);
assert.match(statusSql, /s\.workout_id = e\.workout_id/);
assert.match(statusSql, /s\.log_date = e\.scheduled_date/);
assert.match(statusSql, /other\.id <> e\.id/);
assert.match(statusSql, /enr\.status = 'paused' and e\.scheduled_date >= p_local_today/);
assert.doesNotMatch(statusSql, /st_group_schedule_adherence\(/);
assert.doesNotMatch(statusSql, /st_set_logs/);
assert.match(statusSql, /p_to_date - p_from_date > 83/);
assert.match(statusSql, /revoke all on function public\.st_group_expectation_status/);
assert.match(statusSql, /'paused'/);
assert.match(statusSql, /'excused'/);

const programRead = readFileSync(new URL('../supabase/migrations/20261016_066_group_assigned_program_read.sql', import.meta.url), 'utf8');
assert.doesNotMatch(programRead, /source_program_id/);
assert.doesNotMatch(programRead, /st_set_logs/);
assert.match(programRead, /security definer/);
assert.match(programRead, /set search_path = public/);
assert.match(programRead, /revoke all on function public\.st_read_group_assigned_program\(uuid, uuid, uuid\) from public, anon/);
assert.match(programRead, /grant execute on function public\.st_read_group_assigned_program\(uuid, uuid, uuid\) to authenticated/);

console.log('session finalization checks passed');
