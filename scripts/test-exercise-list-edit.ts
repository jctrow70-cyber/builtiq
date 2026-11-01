/**
 * BIQ-0293 — optimistic exercise add/remove stays on the edited program tree.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-exercise-list-edit.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  beginExerciseEdit,
  noteExerciseEditFailure,
  noteExerciseEditMutation,
  noteExerciseEditVisual,
  recentExerciseEditTimings,
  resetExerciseEditTiming,
} from '../lib/performance/exerciseEditTiming';
import {
  createPendingExerciseId,
  exerciseIsLoggable,
  exerciseRemovalAfterSetEdits,
  insertExercisesIntoProgram,
  isPendingExercise,
  plannedSetIdsOf,
  removeExercisesFromProgram,
  replaceExerciseInProgram,
  restoreRemovedExercises,
  setIdsInPendingFieldKeys,
  workoutsInEditScope,
} from '../lib/training/exerciseListEdit';
import { programApplyBlocked } from '../lib/training/programLoadGuard';

const source = {
  id: 'shared',
  st_workouts: [
    { id: 'w1', week: 1, day_order: 1, st_exercises: [{ id: 'e1', name: 'Squat', st_planned_sets: [{ id: 's1' }] }, { id: 'keep', name: 'Row' }] },
    { id: 'w2', week: 2, day_order: 1, st_exercises: [{ id: 'e2', name: 'Squat', st_planned_sets: [{ id: 's2' }] }] },
    { id: 'w3', week: 1, day_order: 2, st_exercises: [{ id: 'e3', name: 'Squat' }] },
  ],
};

const future = workoutsInEditScope(source.st_workouts, { id: 'w1', week: 1, day_order: 1 }, 'future', false);
assert.deepEqual(future.map((workout) => workout.id), ['w1', 'w2']);
const currentOnly = workoutsInEditScope(source.st_workouts, { id: 'w1', week: 1, day_order: 1 }, 'future', true);
assert.deepEqual(currentOnly.map((workout) => workout.id), ['w1']);

const removed = removeExercisesFromProgram(source, [
  { workoutId: 'w1', exerciseId: 'e1' },
  { workoutId: 'w2', exerciseId: 'e2' },
]);
assert.equal(source.st_workouts[0].st_exercises.length, 2);
assert.equal(source.st_workouts[1].st_exercises[0].id, 'e2');
assert.deepEqual(removed.program?.st_workouts?.[0].st_exercises?.map((exercise: { id: string }) => exercise.id), ['keep']);
assert.equal(removed.program?.st_workouts?.[1].st_exercises?.length, 0);
assert.equal(removed.program?.st_workouts?.[2].st_exercises?.[0].id, 'e3');
assert.equal(removed.program?.id, 'shared');

const otherEdit = removeExercisesFromProgram(removed.program, [{ workoutId: 'w1', exerciseId: 'keep' }]);
const restored = restoreRemovedExercises(otherEdit.program, removed.removed.filter((row) => row.workoutId === 'w1'));
assert.deepEqual(restored?.st_workouts?.[0].st_exercises?.map((exercise: { id: string }) => exercise.id), ['e1']);
assert.equal(otherEdit.program?.st_workouts?.[0].st_exercises?.length, 0);

const pendingId = createPendingExerciseId();
const pending = { id: pendingId, client_pending: true, name: 'Press', st_planned_sets: [] };
assert.equal(isPendingExercise(pending), true);
assert.equal(exerciseIsLoggable(pending), false);
assert.equal(exerciseIsLoggable({ id: 'real', st_planned_sets: [{ id: 'set-1' }] }), true);
const added = insertExercisesIntoProgram(source, [
  { workoutId: 'w1', exercise: pending },
  { workoutId: 'w2', exercise: { ...pending, id: createPendingExerciseId() } },
]);
assert.equal(added?.st_workouts?.[0].st_exercises?.some((exercise: { id: string }) => exercise.id === pendingId), true);
assert.equal(added?.st_workouts?.[1].st_exercises?.length, 2);
assert.equal(source.st_workouts[0].st_exercises.some((exercise) => exercise.id === pendingId), false);
const real = { id: 'real-1', client_pending: false, name: 'Press', st_planned_sets: [{ id: 'ps-1' }] };
const confirmed = replaceExerciseInProgram(added, 'w1', pendingId, real);
assert.equal(confirmed?.st_workouts?.[0].st_exercises?.some((exercise: { id: string }) => exercise.id === 'real-1'), true);
assert.equal(exerciseIsLoggable(real), true);
assert.deepEqual(plannedSetIdsOf([source.st_workouts[0].st_exercises[0], { st_planned_sets: [{ id: 'gone', is_deleted: true }] }]), ['s1']);

assert.equal(programApplyBlocked({ loggerProtected: false, workoutOpen: true, epochAtStart: 1, epochNow: 1 }), true);
assert.equal(programApplyBlocked({ loggerProtected: true, workoutOpen: false, epochAtStart: 1, epochNow: 1 }), true);
assert.equal(programApplyBlocked({ loggerProtected: false, workoutOpen: false, epochAtStart: 1, epochNow: 2 }), true);
assert.equal(programApplyBlocked({ loggerProtected: false, workoutOpen: false, epochAtStart: 2, epochNow: 2 }), false);

resetExerciseEditTiming();
const mark = beginExerciseEdit('remove');
noteExerciseEditVisual(mark);
noteExerciseEditMutation('remove', 12);
noteExerciseEditFailure('add', 'insert failed');
const samples = recentExerciseEditTimings();
assert.equal(samples.some((sample) => sample.kind === 'remove-visual'), true);
assert.equal(samples.some((sample) => sample.kind === 'remove-mutation' && sample.ms === 12), true);
assert.equal(samples.some((sample) => sample.kind === 'add-failure' && sample.error === 'insert failed'), true);

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const removeStart = page.indexOf('async function removeExercise');
const removeEnd = page.indexOf('async function moveExercise');
const removeBody = page.slice(removeStart, removeEnd);
assert.equal(removeBody.includes('reloadKeepDay'), false);
assert.equal(removeBody.includes('st_set_logs'), false);
assert.equal(removeBody.includes('ensurePersonalCopyForTrainingEdit'), true);
assert.equal(removeBody.includes('flushMountedSetEdits'), true);
assert.equal(removeBody.includes('awaitQueuedSetWrites'), true);
assert.equal(removeBody.includes('exerciseWriteHoldRef'), true);
assert.equal(removeBody.includes('ctx.program'), true);
const addStart = page.indexOf('async function confirmAddExercise');
const addEnd = page.indexOf('async function renameSuperset');
const addBody = page.slice(addStart, addEnd);
assert.equal(addBody.includes('reloadKeepDay'), false);
assert.equal(addBody.includes('client_pending:true'), true);
assert.equal(addBody.includes('createPendingExerciseId'), true);
assert.equal(addBody.includes('ensurePersonalCopyForTrainingEdit'), true);
assert.equal(page.includes('programApplyBlocked'), true);
assert.equal(page.includes('exerciseIsLoggable'), true);
assert.equal(exerciseRemovalAfterSetEdits({ pendingSetIds: [], failedSetIds: [] }), 'remove');
assert.equal(exerciseRemovalAfterSetEdits({ pendingSetIds: ['s1'], failedSetIds: [] }), 'wait');
assert.equal(exerciseRemovalAfterSetEdits({ pendingSetIds: ['s1'], failedSetIds: ['s1'] }), 'blocked');
assert.deepEqual(setIdsInPendingFieldKeys(['s1', 's2'], ['s1:weight', 'notes:s2']), ['s1', 's2']);
assert.deepEqual(setIdsInPendingFieldKeys(['s1'], ['other:weight']), []);
const blockedAt = removeBody.indexOf('This exercise was not removed');
const hiddenAt = removeBody.indexOf('setProgram(programResult.program)');
assert.equal(blockedAt >= 0 && blockedAt < hiddenAt, true);
assert.equal(removeBody.includes('exerciseMutationRef.current.add(e.id)'), true);
assert.equal(page.includes('personalCopyFlightRef'), true);
assert.equal(page.includes('Making your private copy so edits stay just for you'), true);

console.log('test-exercise-list-edit: ok');
