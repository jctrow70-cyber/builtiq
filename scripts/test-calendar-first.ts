/**
 * BIQ-0292 — calendar-first paint, start guard, and separate open timings.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-calendar-first.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expectationStillMatches } from '../lib/training/calendarStartGuard';
import { classifyTodayTraining } from '../lib/training/todayTraining';
import {
  beginScreenTiming,
  latestScreenTiming,
  noteCalendarUsable,
  noteWorkoutDetailOpen,
  resetScreenTiming,
} from '../lib/performance/screenTiming';

const schedule = readFileSync(new URL('../lib/training/visibleSchedule.ts', import.meta.url), 'utf8');
const calendar = readFileSync(new URL('../app/components/training/UnifiedTrainingSchedule.tsx', import.meta.url), 'utf8');
const hero = readFileSync(new URL('../app/components/dashboard/TodaysTrainingHero.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const facts = readFileSync(new URL('../lib/groups/loadGroupTrainingFacts.ts', import.meta.url), 'utf8');

const paintStart = schedule.indexOf('export async function loadVisibleSchedule');
const refreshStart = schedule.indexOf('export async function refreshVisibleSchedule');
const paintBody = schedule.slice(paintStart, refreshStart);
assert.ok(paintStart >= 0 && refreshStart > paintStart);
assert.equal(paintBody.includes('repairFollowedTrainingSchedule'), false);
assert.equal(paintBody.includes('fetchFullProgram'), false);
assert.equal(paintBody.includes('st_training_expectations'), true);
assert.equal(paintBody.includes('st_workout_sessions'), true);
assert.equal(schedule.includes('repairFollowedTrainingSchedule'), true);

assert.equal(calendar.includes('refreshVisibleSchedule'), true);
assert.equal(calendar.includes('repairSettled && enrollments.length === 0'), true);
assert.equal(hero.includes('refreshVisibleSchedule'), true);
assert.equal(page.includes('readExpectationForStart'), true);
assert.equal(page.includes('scheduleItemIsCurrent'), true);
const startGuard = page.indexOf('if(!(await scheduleItemIsCurrent(item)))return;');
const startTree = page.indexOf('fetchFullProgram(supabase,item.programId)');
assert.ok(startGuard > -1 && startTree > startGuard);
const previewGuard = page.indexOf('scheduleItemIsCurrent(scheduled)');
const previewTree = page.indexOf('fetchFullProgram(supabase,scheduled.programId)');
assert.ok(previewGuard > -1 && previewTree > previewGuard);
assert.equal(facts.includes('st_apply_group_due_segments'), true);
assert.equal(/await supabase\.rpc\('st_apply_group_due_segments'/.test(facts), false);
assert.equal(page.includes('loggerProtected()'), true);

const shown = { expectationId: 'exp-1', workoutId: 'work-1', scheduledDate: '2026-11-01' };
assert.equal(expectationStillMatches(shown, {
  id: 'exp-1',
  workout_id: 'work-1',
  scheduled_date: '2026-11-01',
  excused: false,
}), 'open');
assert.equal(expectationStillMatches(shown, null), 'refresh');
assert.equal(expectationStillMatches(shown, {
  id: 'exp-1',
  workout_id: 'work-2',
  scheduled_date: '2026-11-01',
  excused: false,
}), 'refresh');
assert.equal(expectationStillMatches(shown, {
  id: 'exp-1',
  workout_id: 'work-1',
  scheduled_date: '2026-11-02',
  excused: false,
}), 'refresh');
assert.equal(expectationStillMatches(shown, {
  id: 'exp-1',
  workout_id: 'work-1',
  scheduled_date: '2026-11-01',
  excused: true,
}), 'refresh');

// Personal day move: stored Sunday, shown Saturday via workout_day_moves.
const movedShown = { expectationId: 'exp-sun', workoutId: 'w-sun', scheduledDate: '2026-11-14' };
const movedRow = {
  id: 'exp-sun',
  workout_id: 'w-sun',
  scheduled_date: '2026-11-15',
  excused: false,
};
assert.equal(expectationStillMatches(movedShown, movedRow), 'refresh');
assert.equal(expectationStillMatches(movedShown, movedRow, { 'w:w-sun': '2026-11-14' }), 'open');
assert.equal(expectationStillMatches(
  { ...movedShown, scheduledDate: '2026-11-15' },
  movedRow,
  { 'w:w-sun': '2026-11-14' }
), 'refresh');
// Card already shows "Moved from Sunday" even if the move ledger is not in React state yet.
assert.equal(expectationStillMatches(
  { ...movedShown, movedFrom: '2026-11-15' },
  movedRow
), 'open');
assert.equal(expectationStillMatches(
  { ...movedShown, movedFrom: '2026-11-10' },
  movedRow
), 'refresh');

const empty = classifyTodayTraining({
  loading: false,
  failed: false,
  programConfigured: false,
  plan: { date: '2026-11-01', items: [] } as never,
  scheduleRepairing: true,
  programReady: false,
});
assert.equal(empty.state, 'loading');

resetScreenTiming();
beginScreenTiming('Training');
noteCalendarUsable('Training');
const calendarMs = latestScreenTiming('Training')?.calendarUsableMs;
assert.equal(typeof calendarMs, 'number');
noteCalendarUsable('Training');
noteWorkoutDetailOpen('Training', (latestScreenTiming('Training')?.startedAt || 0));
assert.equal(latestScreenTiming('Training')?.calendarUsableMs, calendarMs);
assert.equal(typeof latestScreenTiming('Training')?.workoutDetailMs, 'number');
assert.notEqual(latestScreenTiming('Training')?.calendarUsableMs, undefined);

console.log('test-calendar-first: ok');
