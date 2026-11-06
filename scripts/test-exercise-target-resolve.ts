/**
 * BIQ-0306 — exercise identity after personal copy + equipment pending remap.
 * Run: npx tsx scripts/test-exercise-target-resolve.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalEquipment } from '../lib/training/equipmentIdentity';
import { createEquipmentWriteQueue, equipmentForSetSnapshot } from '../lib/training/equipmentSelection';
import {
  clearPendingEquipmentIds,
  exerciseUpdateTouchedRow,
  remapPendingByExerciseId,
  remapPendingEquipmentForCopiedWorkout,
  resolveExerciseInWorkout,
  resolveExerciseTarget,
} from '../lib/training/exerciseTargetResolve';

const sectionOf = (ex: { section?: string | null }) => String(ex.section || 'strength');

const source = {
  id: 'old-row',
  name: 'Chest-Supported Row',
  catalog_exercise_id: 'cat-csr',
  sort_order: 2,
  section: 'strength',
};

const copiedWorkout = {
  id: 'new-wo',
  st_exercises: [
    { id: 'new-a', name: 'Chest-Supported Row', catalog_exercise_id: 'cat-csr', sort_order: 2, section: 'strength' },
    { id: 'new-b', name: 'Chest-Supported Row', catalog_exercise_id: 'cat-csr-other', sort_order: 4, section: 'strength' },
  ],
};

assert.equal(resolveExerciseInWorkout(copiedWorkout, source, sectionOf)?.id, 'new-a');
assert.equal(
  resolveExerciseTarget(copiedWorkout, source, copiedWorkout, sectionOf)?.id,
  'new-a',
  'must not fall back to the stale source id'
);
assert.notEqual(resolveExerciseInWorkout(copiedWorkout, source, sectionOf)?.id, 'old-row');

const sameIdWorkout = {
  id: 'wo',
  st_exercises: [{ id: 'old-row', name: 'Chest-Supported Row', catalog_exercise_id: 'cat-csr', sort_order: 2, section: 'strength' }],
};
assert.equal(resolveExerciseInWorkout(sameIdWorkout, source, sectionOf)?.id, 'old-row');

const duplicateNames = {
  id: 'wo',
  st_exercises: [
    { id: 'a', name: 'Cable Row', catalog_exercise_id: null, sort_order: 1, section: 'strength' },
    { id: 'b', name: 'Cable Row', catalog_exercise_id: null, sort_order: 2, section: 'strength' },
  ],
};
assert.equal(
  resolveExerciseInWorkout(duplicateNames, { id: 'gone', name: 'Cable Row', section: 'strength' }, sectionOf),
  null,
  'ambiguous duplicate names must fail safely'
);
assert.equal(
  resolveExerciseInWorkout(
    duplicateNames,
    { id: 'gone', name: 'Cable Row', sort_order: 2, section: 'strength' },
    sectionOf
  )?.id,
  'b'
);

const duplicateCatalog = {
  id: 'wo',
  st_exercises: [
    { id: 'a', name: 'Row A', catalog_exercise_id: 'cat-x', sort_order: 1, section: 'strength' },
    { id: 'b', name: 'Row B', catalog_exercise_id: 'cat-x', sort_order: 2, section: 'strength' },
  ],
};
assert.equal(
  resolveExerciseInWorkout(duplicateCatalog, { id: 'gone', catalog_exercise_id: 'cat-x', section: 'strength' }, sectionOf),
  null,
  'ambiguous catalog ids must fail safely'
);
assert.equal(
  resolveExerciseInWorkout(
    duplicateCatalog,
    { id: 'gone', catalog_exercise_id: 'cat-x', sort_order: 2, section: 'strength' },
    sectionOf
  )?.id,
  'b'
);

assert.equal(exerciseUpdateTouchedRow([{ id: 'new-a' }]), true);
assert.equal(exerciseUpdateTouchedRow([]), false);
assert.equal(exerciseUpdateTouchedRow(null), false);

let pending: Record<string, string> = { 'old-row': 'Chest-Supported Machine' };
pending = remapPendingByExerciseId(pending, 'old-row', 'new-a');
assert.deepEqual(pending, { 'new-a': 'Chest-Supported Machine' });
assert.equal(
  equipmentForSetSnapshot({
    persisted: '',
    pending: pending['new-a'],
    options: ['Chest-Supported Machine', 'Dumbbell'],
  }).ok,
  true
);

pending = clearPendingEquipmentIds(pending, ['old-row', 'new-a'], 'Chest-Supported Machine', (a, b) => (
  canonicalEquipment(a).key === canonicalEquipment(b).key
));
assert.deepEqual(pending, {});

pending = remapPendingEquipmentForCopiedWorkout(
  { 'old-row': 'Chest-Supported Machine', keep: 'Dumbbell' },
  [source],
  copiedWorkout,
  sectionOf
);
assert.deepEqual(pending, {
  'old-row': 'Chest-Supported Machine',
  'new-a': 'Chest-Supported Machine',
  keep: 'Dumbbell',
});

async function quickSuccession() {
  const written: string[] = [];
  const queue = createEquipmentWriteQueue();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  queue.enqueue('Barbell', async (value, isCurrent) => {
    await gate;
    if (!isCurrent()) return;
    written.push(value);
  });
  queue.enqueue('Dumbbell', async (value, isCurrent) => {
    if (!isCurrent()) return;
    written.push(value);
  });
  assert.equal(queue.intent()?.value, 'Dumbbell');
  release();
  await queue.done();
  assert.deepEqual(written, ['Dumbbell']);
}

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert.match(page, /resolveExerciseTargetSafe/);
assert.match(page, /exerciseUpdateTouchedRow/);
assert.match(page, /remapPendingByExerciseId/);
assert.match(page, /clearPendingEquipmentIds/);
assert.match(page, /onResolved:/);
assert.equal(page.includes('||sourceExercise'), false);
assert.match(page, /\.select\('id'\)/);
assert.match(page, /Could not find this exercise after making your private copy/);
assert.match(
  page,
  /customizeForMeBusy\|\|personalCopyFlightRef\.current\)return \{ok:false/,
  'set saves must wait until private-copy identity is resolved',
);

quickSuccession()
  .then(() => {
    console.log('test-exercise-target-resolve: ok');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
