/**
 * BIQ-0292 / BIQ-0293 — schedule repair ordering, rest days, and open guards.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-schedule-hardening.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { directWorkoutOpenAllowed, expectationStillMatches } from '../lib/training/calendarStartGuard';
import {
  armEnrollmentSync,
  enrollmentSyncIsIdle,
  enrollmentSyncSettled,
  releaseEnrollmentSyncIfIdle,
  resetEnrollmentSyncGate,
  subscribeEnrollmentSync,
  trackTrainingLoad,
} from '../lib/training/enrollmentSyncGate';
import { classifyTodayTraining } from '../lib/training/todayTraining';
import { scheduleRefreshResult, type VisibleScheduleSnapshot } from '../lib/training/visibleSchedule';

const painted: VisibleScheduleSnapshot = {
  pending: false,
  error: null,
  enrollments: [{ id: 'en-1', source_key: 'personal', source_kind: 'personal', team_id: null, program_id: 'p1', status: 'active', schedule_visible: true, expectation_enabled: true }],
  programNames: { p1: 'Strength' },
  expectations: [{ id: 'exp-1', workoutId: 'w1', programId: 'p1', scheduledDate: '2026-11-01', title: 'Lower', sourceKey: 'personal', teamId: null, sourceName: 'Personal', excused: false, sessionStatus: null }],
};

const migration = scheduleRefreshResult({ repairPending: true, repairError: 'st_repair_followed_training_schedule does not exist', snapshot: null });
assert.equal(migration.keepPrevious, true);
assert.equal(migration.pending, true);
assert.equal(migration.expectations.length, 0);

const failedRead = scheduleRefreshResult({
  repairPending: false,
  repairError: null,
  snapshot: { pending: false, error: 'network down', enrollments: [], programNames: {}, expectations: [] },
});
assert.equal(failedRead.keepPrevious, true);

const realEmpty = scheduleRefreshResult({
  repairPending: false,
  repairError: null,
  snapshot: { pending: false, error: null, enrollments: [], programNames: {}, expectations: [] },
});
assert.equal(realEmpty.keepPrevious, undefined);
assert.equal(scheduleRefreshResult({ repairPending: false, repairError: null, snapshot: painted }).keepPrevious, undefined);

const rest = classifyTodayTraining({
  loading: false,
  failed: false,
  programConfigured: true,
  plan: { date: '2026-11-01', items: [{ id: 'rest', isRest: true }] } as never,
  scheduleRepairing: true,
  programReady: false,
});
assert.equal(rest.state, 'rest');

const unknown = classifyTodayTraining({
  loading: false,
  failed: false,
  programConfigured: true,
  plan: { date: '2026-11-01', items: [] } as never,
  scheduleRepairing: true,
  programReady: false,
});
assert.equal(unknown.state, 'loading');

assert.equal(directWorkoutOpenAllowed({
  userId: 'user-1',
  workoutId: 'w1',
  programId: 'p1',
  knownWorkoutIds: ['w1'],
  authorizedProgramIds: ['p1'],
  treeReady: false,
}), 'open');
assert.equal(directWorkoutOpenAllowed({
  userId: 'user-1',
  workoutId: 'missing',
  programId: null,
  knownWorkoutIds: ['w1'],
  authorizedProgramIds: ['p1'],
  treeReady: false,
}), 'wait');
assert.equal(directWorkoutOpenAllowed({
  userId: 'user-1',
  workoutId: 'missing',
  programId: null,
  knownWorkoutIds: ['w1'],
  authorizedProgramIds: ['p1'],
  treeReady: true,
}), 'deny');
assert.equal(directWorkoutOpenAllowed({
  userId: 'user-1',
  workoutId: 'w1',
  programId: 'other',
  knownWorkoutIds: ['w1'],
  authorizedProgramIds: ['p1'],
  treeReady: true,
}), 'deny');
assert.equal(directWorkoutOpenAllowed({
  userId: null,
  workoutId: 'w1',
  programId: 'p1',
  knownWorkoutIds: ['w1'],
  authorizedProgramIds: ['p1'],
  treeReady: true,
}), 'deny');
assert.equal(expectationStillMatches(
  { expectationId: 'exp-1', workoutId: 'w1', scheduledDate: '2026-11-01' },
  { id: 'exp-9', workout_id: 'w1', scheduled_date: '2026-11-01', excused: false }
), 'refresh');

async function assertEnrollmentGate() {
  resetEnrollmentSyncGate();
  assert.equal(enrollmentSyncIsIdle(), true);
  armEnrollmentSync();
  assert.equal(enrollmentSyncIsIdle(), false);
  let repairs = 0;
  const unsub = subscribeEnrollmentSync(() => {
    repairs += 1;
  });
  let releaseFirst: () => void = () => {};
  let releaseSecond: () => void = () => {};
  const first = trackTrainingLoad(() => new Promise<string>((resolve) => {
    releaseFirst = () => resolve('one');
  }));
  const second = trackTrainingLoad(() => new Promise<string>((resolve) => {
    releaseSecond = () => resolve('two');
  }));
  assert.equal(enrollmentSyncIsIdle(), false);
  await Promise.resolve();
  releaseFirst();
  await first;
  assert.equal(repairs, 0);
  releaseSecond();
  await second;
  assert.equal(enrollmentSyncIsIdle(), true);
  assert.equal(repairs, 1);
  await enrollmentSyncSettled();
  releaseEnrollmentSyncIfIdle();
  unsub();
}

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const calendar = readFileSync(new URL('../app/components/training/UnifiedTrainingSchedule.tsx', import.meta.url), 'utf8');
const hero = readFileSync(new URL('../app/components/dashboard/TodaysTrainingHero.tsx', import.meta.url), 'utf8');
assert.equal(page.includes('armEnrollmentSync'), true);
assert.equal(page.includes('trackTrainingLoad'), true);
assert.equal(page.includes('directWorkoutOpenAllowed'), true);
assert.equal(page.includes('scheduleRepairGeneration'), true);
assert.equal(calendar.includes('enrollmentSyncSettled'), true);
assert.equal(calendar.includes('scheduleRepairGeneration'), true);
assert.equal(calendar.includes('keepPrevious'), true);
assert.equal(hero.includes('enrollmentSyncSettled'), true);
assert.equal(hero.includes('keepPrevious'), true);
const paintStart = calendar.indexOf('const paint = useCallback');
const repairStart = calendar.indexOf('const repair = useCallback');
assert.ok(paintStart > -1 && repairStart > paintStart);
assert.equal(calendar.slice(paintStart, repairStart).includes('refreshVisibleSchedule'), false);

assertEnrollmentGate().then(() => {
  console.log('test-schedule-hardening: ok');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
