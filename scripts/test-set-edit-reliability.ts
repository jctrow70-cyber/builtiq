/**
 * BIQ-0296 planned-set type correction and soft delete.
 * Disposable fixtures only. No database connection.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-set-edit-reliability.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeWorkoutIsProtected } from '../lib/performance/screenSession';
import { isCountedWorkingSet, setFactFromRow } from '../lib/progress/setFacts';
import { workoutsInEditScope } from '../lib/training/exerciseListEdit';
import { programApplyBlocked } from '../lib/training/programLoadGuard';
import { canRewritePlannedSetPrescription } from '../lib/training/plannedSetGuard';
import {
  applyLogSnapshotType,
  applyProgramSetDeleted,
  applyProgramSetType,
  correctPlannedSetType,
  createPlannedSetEditQueue,
  LOGGED_SET_REMOVAL_CONFIRMATION,
  plannedExerciseKey,
  resolvePlannedSetTargets,
  sessionLogMayChange,
  softDeletePlannedSets,
} from '../lib/training/setTypeCorrection';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../app/components/training/WorkoutTemplateEditor.tsx', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL('../supabase/migrations/20261102_076_planned_set_type_correction.sql', import.meta.url),
  'utf8'
);

const squat = {
  id: 'ex-squat',
  name: 'Squat',
  section: 'strength',
  catalog_exercise_id: 'cat-squat',
  equipment: 'barbell',
  variant: 'high-bar',
  sort_order: 1,
  st_planned_sets: [
    { id: 'shared-set', sort_order: 0, set_number: 1, set_type: 'working', is_deleted: false },
    { id: 'shared-set-2', sort_order: 1, set_number: 2, set_type: 'working', is_deleted: false },
  ],
};
const copySquat = {
  ...squat,
  id: 'copy-ex',
  st_planned_sets: [
    { id: 'copy-set', sort_order: 0, set_number: 1, set_type: 'working', is_deleted: false },
    { id: 'copy-set-2', sort_order: 1, set_number: 2, set_type: 'working', is_deleted: false },
  ],
};
const futureSquat = {
  ...squat,
  id: 'future-ex',
  st_planned_sets: [
    { id: 'deleted-row', sort_order: 0, set_number: 1, set_type: 'working', is_deleted: true },
    { id: 'future-set', sort_order: 0, set_number: 1, set_type: 'working', is_deleted: false },
    { id: 'future-set-2', sort_order: 1, set_number: 2, set_type: 'working', is_deleted: false },
  ],
};
const thisWeek = { id: 'week-1', st_exercises: [squat] };
const copiedWeek = { id: 'week-copy', st_exercises: [copySquat] };
const nextWeek = { id: 'week-2', st_exercises: [futureSquat] };

const copied = resolvePlannedSetTargets({
  sourceExercise: squat,
  sourceSet: squat.st_planned_sets[0],
  targetWorkouts: [copiedWeek],
});
assert.equal(copied.ok, true);
if (copied.ok) assert.deepEqual(copied.ids, ['copy-set']);

const future = resolvePlannedSetTargets({
  sourceExercise: squat,
  sourceSet: squat.st_planned_sets[0],
  targetWorkouts: [thisWeek, nextWeek],
});
assert.equal(future.ok, true);
if (future.ok) assert.deepEqual(future.ids, ['shared-set', 'future-set']);

const pastWeek = {
  id: 'week-0',
  week: 0,
  day_order: 1,
  st_exercises: [{
    ...squat,
    id: 'past-ex',
    st_planned_sets: [{ id: 'past-set', sort_order: 0, set_number: 1, set_type: 'working', is_deleted: false }],
  }],
};
const currentWeek = { ...thisWeek, week: 1, day_order: 1 };
const laterWeek = { ...nextWeek, week: 2, day_order: 1 };
const futureScope = workoutsInEditScope([pastWeek, currentWeek, laterWeek], currentWeek, 'future', false);
assert.deepEqual(futureScope.map((workout) => workout.id), ['week-1', 'week-2']);
const futureScoped = resolvePlannedSetTargets({
  sourceExercise: squat,
  sourceSet: squat.st_planned_sets[0],
  targetWorkouts: futureScope,
});
assert.equal(futureScoped.ok, true);
if (futureScoped.ok) {
  assert.equal(futureScoped.ids.includes('past-set'), false);
  assert.deepEqual(futureScoped.ids, ['shared-set', 'future-set']);
}
const openSessionScope = workoutsInEditScope([pastWeek, currentWeek, laterWeek], currentWeek, 'future', true);
assert.deepEqual(openSessionScope.map((workout) => workout.id), ['week-1']);

const duplicateExercise = resolvePlannedSetTargets({
  sourceExercise: squat,
  sourceSet: squat.st_planned_sets[0],
  targetWorkouts: [{ id: 'dup', st_exercises: [copySquat, { ...copySquat, id: 'copy-ex-2' }] }],
});
assert.equal(duplicateExercise.ok, false);

const otherEquipment = {
  ...copySquat,
  id: 'dumbbell-ex',
  equipment: 'dumbbell',
  st_planned_sets: [{ id: 'db-set', sort_order: 0, set_number: 1, set_type: 'working' }],
};
const equipment = resolvePlannedSetTargets({
  sourceExercise: squat,
  sourceSet: squat.st_planned_sets[0],
  targetWorkouts: [{ id: 'equip', st_exercises: [otherEquipment] }],
});
assert.equal(equipment.ok, false);
assert.notEqual(plannedExerciseKey(squat), plannedExerciseKey(otherEquipment));

const otherVariant = { ...copySquat, variant: 'low-bar', st_planned_sets: [{ id: 'low-set', sort_order: 0, set_number: 1, set_type: 'working' }] };
const variant = resolvePlannedSetTargets({
  sourceExercise: squat,
  sourceSet: squat.st_planned_sets[0],
  targetWorkouts: [{ id: 'variant', st_exercises: [otherVariant] }],
});
assert.equal(variant.ok, false);

const twoLive = {
  ...copySquat,
  st_planned_sets: [
    { id: 'a', sort_order: 0, set_number: 1, set_type: 'working' },
    { id: 'b', sort_order: 0, set_number: 1, set_type: 'working' },
  ],
};
const ambiguous = resolvePlannedSetTargets({
  sourceExercise: squat,
  sourceSet: squat.st_planned_sets[0],
  targetWorkouts: [{ id: 'ambiguous', st_exercises: [twoLive] }],
});
assert.equal(ambiguous.ok, false);

const program = { id: 'personal', st_workouts: [thisWeek, nextWeek] };
const warmed = applyProgramSetType(program, ['shared-set', 'future-set'], 'warmup');
assert.equal(program.st_workouts?.[0].st_exercises?.[0].st_planned_sets?.[0].set_type, 'working');
assert.equal(warmed.st_workouts?.[0].st_exercises?.[0].st_planned_sets?.[0].set_type, 'warmup');
assert.equal(warmed.st_workouts?.[0].st_exercises?.[0].st_planned_sets?.[1].set_type, 'working');
assert.equal(warmed.st_workouts?.[1].st_exercises?.[0].st_planned_sets?.[1].set_type, 'warmup');
assert.equal(warmed.st_workouts?.[1].st_exercises?.[0].st_planned_sets?.[2].set_type, 'working');
assert.equal(warmed.st_workouts?.[1].st_exercises?.[0].st_planned_sets?.[0].is_deleted, true);

const logs = {
  'shared-set': { id: 'log-today', planned_set_id: 'shared-set', log_date: '2026-11-02', user_id: 'me', snapshot_set_type: 'working', actual_weight: '185', actual_reps: '5', completed: true },
  'other-day': { id: 'log-old', planned_set_id: 'shared-set', log_date: '2026-10-01', user_id: 'me', snapshot_set_type: 'working', actual_weight: '175', actual_reps: '5', completed: true },
};
const patchedLogs = applyLogSnapshotType(logs, ['shared-set'], 'warmup');
assert.equal(patchedLogs['shared-set'].snapshot_set_type, 'warmup');
assert.equal(patchedLogs['shared-set'].actual_weight, '185');
assert.equal(patchedLogs['shared-set'].actual_reps, '5');
assert.equal(patchedLogs['shared-set'].completed, true);
assert.equal(patchedLogs['other-day'].snapshot_set_type, 'working');

const before = setFactFromRow(logs['shared-set']);
const after = setFactFromRow(patchedLogs['shared-set']);
assert.equal(isCountedWorkingSet(before), true);
assert.equal(isCountedWorkingSet(after), false);
const restored = applyLogSnapshotType(patchedLogs, ['shared-set'], 'working');
assert.equal(isCountedWorkingSet(setFactFromRow(restored['shared-set'])), true);

const removed = applyProgramSetDeleted(warmed, ['shared-set']);
assert.equal(removed.st_workouts?.[0].st_exercises?.[0].st_planned_sets?.[0].is_deleted, true);
assert.equal(removed.st_workouts?.[0].st_exercises?.[0].st_planned_sets?.[1].is_deleted, false);
assert.equal(patchedLogs['shared-set'].actual_weight, '185');

assert.equal(sessionLogMayChange({ callerId: 'me', logUserId: 'me', logDate: '2026-11-02', requestedDate: '2026-11-02', plannedSetAuthorized: true }), true);
assert.equal(sessionLogMayChange({ callerId: 'me', logUserId: 'member', logDate: '2026-11-02', requestedDate: '2026-11-02', plannedSetAuthorized: true }), false);
assert.equal(sessionLogMayChange({ callerId: 'coach', logUserId: 'me', logDate: '2026-11-02', requestedDate: '2026-11-02', plannedSetAuthorized: true }), false);
assert.equal(sessionLogMayChange({ callerId: 'me', logUserId: 'me', logDate: '2026-10-01', requestedDate: '2026-11-02', plannedSetAuthorized: true }), false);
assert.equal(sessionLogMayChange({ callerId: 'me', logUserId: 'me', logDate: '2026-11-02', requestedDate: '2026-11-02', plannedSetAuthorized: false }), false);
assert.equal(sessionLogMayChange({ callerId: null, logUserId: 'me', logDate: '2026-11-02', requestedDate: '2026-11-02', plannedSetAuthorized: true }), false);

assert.equal(canRewritePlannedSetPrescription({ plannedSetId: 'shared-set', logs: [logs['shared-set']] }).ok, false);

const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
const failing = {
  async rpc(name: string) {
    calls.push({ name, args: {} });
    return { error: { message: 'You cannot edit one of those sets. Nothing was changed.' } };
  },
};
function runReliabilityChecks() {
  return Promise.resolve()
    .then(() => correctPlannedSetType(failing, ['shared-set'], 'warmup', '2026-11-02'))
    .then((failed) => {
      assert.equal(failed.ok, false);
      if (!failed.ok) assert.match(failed.error, /Nothing was changed/);
      assert.equal(program.st_workouts?.[0].st_exercises?.[0].st_planned_sets?.[0].set_type, 'working');
      return correctPlannedSetType(okClient, ['copy-set'], 'warmup', '2026-11-02');
    })
    .then((corrected) => {
      assert.equal(corrected.ok, true);
      assert.equal(saved[0].name, 'st_correct_planned_set_type');
      assert.deepEqual(saved[0].p_planned_set_ids, ['copy-set']);
      assert.equal(saved[0].p_set_type, 'warmup');
      assert.equal(saved[0].p_log_date, '2026-11-02');
      assert.equal(Object.prototype.hasOwnProperty.call(saved[0], 'p_user_id'), false);
      return softDeletePlannedSets(okClient, ['copy-set']);
    })
    .then((deleted) => {
      assert.equal(deleted.ok, true);
      assert.equal(saved[1].name, 'st_soft_delete_planned_sets');
      const queue = createPlannedSetEditQueue();
      const order: string[] = [];
      const first = queue(['shared-set'], () => new Promise((resolve) => setTimeout(() => {
        order.push('first');
        resolve('first');
      }, 20)));
      const second = queue(['shared-set'], () => {
        order.push('second');
        return Promise.resolve('second');
      });
      return first.then((firstResult) => second.then((secondResult) => {
        assert.equal(firstResult, 'first');
        assert.equal(secondResult, 'second');
        assert.deepEqual(order, ['first', 'second']);
      }));
    });
}

const saved: Array<Record<string, unknown>> = [];
const okClient = {
  async rpc(name: string, args: Record<string, unknown>) {
    saved.push({ name, ...args });
    return { error: null };
  },
};
assert.equal(activeWorkoutIsProtected(true, false), true);
assert.equal(programApplyBlocked({ loggerProtected: true, workoutOpen: true, epochAtStart: 1, epochNow: 1 }), true);
const editStart = page.indexOf('async function editSet');
const editEnd = page.indexOf('function loggingSessionLinks');
const editBody = page.slice(editStart, editEnd);
assert.equal(editBody.includes('correctPlannedSetType'), true);
assert.equal(editBody.includes('softDeletePlannedSets'), true);
assert.equal(LOGGED_SET_REMOVAL_CONFIRMATION, 'Remove this set from the plan? The numbers already logged stay in history.');
assert.equal(editBody.includes('LOGGED_SET_REMOVAL_CONFIRMATION'), true);
assert.equal(editor.includes('correctPlannedSetType(supabase, resolved.ids, String(value), null)'), true);
assert.equal(editor.includes('softDeletePlannedSets'), true);
assert.equal(editBody.includes('applyOpenPlannedSetChange'), true);
assert.equal(editBody.includes('p_user_id'), false);
assert.equal(editBody.indexOf("field==='set_type'") < editBody.indexOf('canRewritePlannedSetPrescription'), true);

const correctStart = migration.indexOf('function public.st_correct_planned_set_type');
const correctEnd = migration.indexOf('function public.st_soft_delete_planned_sets');
const correctBody = migration.slice(correctStart, correctEnd);
assert.equal(correctBody.includes('p_user_id'), false);
assert.equal(correctBody.includes('auth.uid()'), true);
assert.equal(correctBody.indexOf('st_require_planned_set_edit') < correctBody.indexOf('update public.st_planned_sets'), true);
assert.equal(correctBody.indexOf('update public.st_planned_sets') < correctBody.indexOf('update public.st_set_logs'), true);
assert.equal(correctBody.includes('when others then'), true);
assert.equal(correctBody.includes('raise;'), true);
assert.equal(correctBody.includes('commit;'), false);
assert.equal(correctBody.includes('user_id = auth.uid()'), true);
assert.equal(correctBody.includes('log_date = p_log_date'), true);
assert.equal(migration.includes('revoke all on table public.st_set_type_correction_nonce from public, anon, authenticated'), true);
assert.equal(migration.includes('grant execute on function public.st_correct_planned_set_type(uuid[], text, date) to authenticated'), true);
assert.equal(migration.includes('grant execute on function public.st_correct_planned_set_type(uuid[], text, date) to anon'), false);
assert.equal(migration.includes('n.caller = auth.uid()'), true);
assert.equal(migration.includes("set search_path = pg_catalog"), true);
assert.equal(migration.includes('new.snapshot_equipment := old.snapshot_equipment'), true);
assert.equal(migration.includes('new.snapshot_target_weight := old.snapshot_target_weight'), true);
assert.equal(migration.includes('new.target_reps,'), true);
assert.equal(migration.includes('is_deleted = true'), true);
assert.equal(migration.includes('delete from public.st_set_logs'), false);

runReliabilityChecks().then(() => {
  console.log('test-set-edit-reliability: ok');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
