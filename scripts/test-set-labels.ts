/**
 * BIQ-0316: set display labels and next planned set_number.
 * Run: npx tsx scripts/test-set-labels.ts
 */
import assert from 'node:assert/strict';
import { addDraftSet, emptyDraftWorkout, removeDraftSet, type DraftWorkout } from '../lib/training/draftWorkout';
import { nextPlannedSetNumber, nextPlannedSortOrder, setDisplayLabel } from '../lib/training/setLabels';

const duplicateWorking = [
  { id: 'a', set_type: 'working', set_number: 1 },
  { id: 'b', set_type: 'working', set_number: 2 },
  { id: 'c', set_type: 'working', set_number: 3 },
  { id: 'd', set_type: 'working', set_number: 4 },
  { id: 'e', set_type: 'working', set_number: 5 },
  { id: 'f', set_type: 'working', set_number: 5 },
];
assert.deepEqual(
  duplicateWorking.map((s) => setDisplayLabel(s, duplicateWorking)),
  ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5', 'Set 6'],
  'duplicate stored set_number must still display as consecutive Set 1…N'
);

const withRamps = [
  { id: 'r1', set_type: 'warmup', set_number: 1 },
  { id: 'r2', set_type: 'warmup', set_number: 2 },
  { id: 'r3', set_type: 'ramp', set_number: 3 },
  { id: 'w1', set_type: 'working', set_number: 4 },
  { id: 'w2', set_type: 'working', set_number: 5 },
  { id: 'w3', set_type: 'working', set_number: 6 },
];
assert.deepEqual(
  withRamps.map((s) => setDisplayLabel(s, withRamps)),
  ['Ramp 1', 'Ramp 2', 'Ramp 3', 'Set 1', 'Set 2', 'Set 3'],
  'ramp/warmup rows label separately from working sets'
);

const plannedPlusExtra = [
  { id: 'p1', set_type: 'working', set_number: 1 },
  { id: 'p2', set_type: 'working', set_number: 2 },
  { id: 'x1', set_type: 'working', set_number: 1 },
];
assert.equal(setDisplayLabel(plannedPlusExtra[2], plannedPlusExtra), 'Set 3', 'extra set continues after planned working sets');

assert.equal(nextPlannedSetNumber([{ set_number: 1 }, { set_number: 2 }, { set_number: 5 }]), 6);
assert.equal(nextPlannedSetNumber([{ set_number: 1 }, { set_number: 2, is_deleted: true }, { set_number: 3 }]), 4);
assert.equal(nextPlannedSetNumber([]), 1);
assert.equal(nextPlannedSortOrder([{ sort_order: 0 }, { sort_order: 2 }]), 3);
assert.equal(nextPlannedSortOrder([]), 0);

let draft: DraftWorkout = emptyDraftWorkout('Test');
draft = {
  ...draft,
  st_exercises: [
    {
      id: 'ex1',
      sort_order: 0,
      name: 'Squat',
      muscle_group: 'Quads',
      notes: '',
      section: 'strength',
      superset_group_id: null,
      superset_label: null,
      superset_order: null,
      catalog_exercise_id: null,
      equipment: null,
      exercise_type: 'strength',
      st_planned_sets: [
        { id: 's1', sort_order: 0, set_number: 1, set_type: 'working', target_weight: '', target_reps: '', target_rir: null, rest_seconds: null },
        { id: 's2', sort_order: 1, set_number: 2, set_type: 'working', target_weight: '', target_reps: '', target_rir: null, rest_seconds: null },
        { id: 's3', sort_order: 2, set_number: 4, set_type: 'working', target_weight: '', target_reps: '', target_rir: null, rest_seconds: null },
      ],
    },
  ],
};
draft = addDraftSet(draft, 'ex1');
const afterAdd = draft.st_exercises[0].st_planned_sets;
assert.equal(afterAdd[afterAdd.length - 1].set_number, 5, 'addDraftSet must use max(set_number)+1 when gaps exist');
assert.equal(afterAdd[afterAdd.length - 1].sort_order, 3);

draft = removeDraftSet(draft, 'ex1', 's2');
const afterRemove = draft.st_exercises[0].st_planned_sets;
assert.deepEqual(
  afterRemove.map((s) => s.set_number),
  [1, 2, 3],
  'removeDraftSet still renumbers remaining draft sets'
);

console.log('test-set-labels: ok');
