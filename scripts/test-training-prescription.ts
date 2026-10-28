/**
 * BIQ-0271 Phase D3: Training logger prescription summaries.
 * Run: npx tsx scripts/test-training-prescription.ts
 */
import assert from 'node:assert/strict';
import {
  blockRestLabel,
  summarizeExerciseParts,
  supersetMarks,
  trainingExercisePrescription,
} from '../lib/programDesign/workoutPreview';

function exercise(name: string, sets: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  return {
    name,
    ...extra,
    st_planned_sets: sets.map((set, i) => ({
      set_number: i + 1,
      sort_order: i + 1,
      ...set,
    })),
  };
}

const working = exercise(
  'Bench Press',
  [
    { set_type: 'working', target_reps: '8', target_rir: 2, rest_seconds: 90 },
    { set_type: 'working', target_reps: '8', target_rir: 2, rest_seconds: 90 },
    { set_type: 'working', target_reps: '8', target_rir: 2, rest_seconds: 90 },
  ],
  { equipment: 'Dumbbell' }
);
const standard = trainingExercisePrescription({ exercise: working });
assert.equal(standard?.name, 'Bench Press');
assert.equal(standard?.equipment, 'Dumbbell');
assert.equal(standard?.planned, '3 × 8 reps · 2 RIR · 90 sec rest');
assert.equal(standard?.secondary, '');
assert.equal(standard?.workingCount, 3);
assert.equal(standard?.rampCount, 0);
assert.equal(standard?.mark, '');
assert.equal(blockRestLabel([working]), '90 sec rest');
assert.equal(summarizeExerciseParts(working).primary, '3 × 8 reps · 2 RIR');

const mixed = exercise('Incline Press', [
  { set_type: 'working', target_reps: '8', target_rir: 2 },
  { set_type: 'working', target_reps: '10', target_rir: 2 },
]);
const mixedRx = trainingExercisePrescription({ exercise: mixed });
assert.equal(mixedRx?.planned, '2 working sets · mixed targets');
assert.equal(mixedRx?.secondary, 'Set 1: 8 reps · 2 RIR · Set 2: 10 reps · 2 RIR');
assert.equal(mixedRx?.workingCount, 2);
assert.doesNotMatch(String(mixedRx?.planned), /90 sec rest|Set 1:|Set 4: reps/);
assert.equal(blockRestLabel([mixed]), null);

const missingReps = exercise('Chest-Supported Row', [
  { set_type: 'working', set_number: 1, target_reps: '8-10', target_rir: 2 },
  { set_type: 'warmup', set_number: 2, target_reps: '10' },
  { set_type: 'working', set_number: 3, target_reps: '8-10', target_rir: 2 },
  { set_type: 'working', set_number: 4, rest_seconds: 90 },
]);
const missingRepsRx = trainingExercisePrescription({ exercise: missingReps });
assert.equal(missingRepsRx?.planned, '3 working sets · mixed targets · 90 sec rest');
assert.equal(
  missingRepsRx?.secondary,
  'Set 1: 8–10 reps · 2 RIR · Set 3: 8–10 reps · 2 RIR · Set 4: Reps not specified · 1 ramp-up set'
);
assert.equal(missingRepsRx?.workingCount, 3);
assert.equal(missingRepsRx?.rampCount, 1);
assert.doesNotMatch(String(missingRepsRx?.planned), /Set 4: reps$|Set 4: reps ·/);
assert.doesNotMatch(String(missingRepsRx?.secondary), /Set 4: reps(?! not specified)/);

const missingRir = exercise('Row', [
  { set_type: 'working', target_reps: '8', target_rir: 2 },
  { set_type: 'working', target_reps: '8' },
]);
const missingRirRx = trainingExercisePrescription({ exercise: missingRir });
assert.equal(missingRirRx?.planned, '2 working sets · mixed targets');
assert.equal(missingRirRx?.secondary, 'Set 1: 8 reps · 2 RIR · Set 2: 8 reps');
assert.doesNotMatch(String(missingRirRx?.secondary), /Set 2:.*RIR/);

const interspersed = exercise('Bench Press', [
  { set_type: 'warmup', set_number: 1, target_reps: '10' },
  { set_type: 'working', set_number: 2, target_reps: '8', target_rir: 2, rest_seconds: 90 },
  { set_type: 'warmup', set_number: 3, target_reps: '6' },
  { set_type: 'working', set_number: 4, target_reps: '8', target_rir: 2, rest_seconds: 90 },
  { set_type: 'working', set_number: 5, target_reps: '8', target_rir: 2, rest_seconds: 90 },
]);
const interspersedRx = trainingExercisePrescription({ exercise: interspersed });
assert.equal(interspersedRx?.planned, '3 × 8 reps · 2 RIR · 90 sec rest');
assert.equal(interspersedRx?.secondary, '2 ramp-up sets');
assert.equal(interspersedRx?.workingCount, 3);
assert.equal(interspersedRx?.rampCount, 2);

const nonconsecutive = exercise('Chest-Supported Row', [
  { set_type: 'working', set_number: 1, sort_order: 1, target_reps: '8-10', target_rir: 2 },
  { set_type: 'working', set_number: 4, sort_order: 2 },
  { set_type: 'working', set_number: 6, sort_order: 3, target_reps: '8-10', target_rir: 2 },
]);
const nonconsecutiveRx = trainingExercisePrescription({ exercise: nonconsecutive });
assert.equal(nonconsecutiveRx?.workingCount, 3);
assert.match(String(nonconsecutiveRx?.secondary), /Set 1: 8–10 reps · 2 RIR/);
assert.match(String(nonconsecutiveRx?.secondary), /Set 4: Reps not specified/);
assert.match(String(nonconsecutiveRx?.secondary), /Set 6: 8–10 reps · 2 RIR/);
assert.doesNotMatch(String(nonconsecutiveRx?.secondary), /Set 2:|Set 3:|Set 5:/);

const ramps = exercise(
  'Bench Press',
  [
    { set_type: 'warmup', target_reps: '10' },
    { set_type: 'warmup', target_reps: '6' },
    { set_type: 'working', rep_min: 8, rep_max: 10, target_rir: 2, rest_seconds: 90 },
    { set_type: 'working', rep_min: 8, rep_max: 10, target_rir: 2, rest_seconds: 90 },
    { set_type: 'working', rep_min: 8, rep_max: 10, target_rir: 2, rest_seconds: 90 },
  ],
  { equipment: 'Dumbbell' }
);
const rampRx = trainingExercisePrescription({ exercise: ramps });
assert.equal(rampRx?.planned, '3 × 8–10 reps · 2 RIR · 90 sec rest');
assert.equal(rampRx?.secondary, '2 ramp-up sets');
assert.equal(rampRx?.workingCount, 3);
assert.equal(rampRx?.rampCount, 2);
assert.doesNotMatch(String(rampRx?.planned), /ramp|warmup/i);

const marks = supersetMarks('Superset A', 2);
assert.deepEqual(marks, ['A1', 'A2']);
const fly = trainingExercisePrescription({
  exercise: exercise(
    'Incline Chest Fly',
    [
      { set_type: 'working', target_reps: '8', target_rir: 2 },
      { set_type: 'working', target_reps: '8', target_rir: 2 },
    ],
    { equipment: 'Dumbbell', rest_seconds: 90, superset_label: 'Superset A' }
  ),
  mark: marks[0],
  omitRest: true,
});
const pullover = trainingExercisePrescription({
  exercise: exercise('Pullover', [{ set_type: 'working', target_reps: '8' }], {
    equipment: 'Dumbbell',
    rest_seconds: 90,
    superset_label: 'Superset A',
  }),
  mark: marks[1],
  omitRest: true,
});
assert.equal(fly?.mark, 'A1');
assert.equal(pullover?.mark, 'A2');
assert.equal(fly?.planned, '2 × 8 reps · 2 RIR');
assert.equal(pullover?.planned, '1 × 8 reps');
assert.notEqual(fly?.planned, pullover?.planned);
assert.doesNotMatch(String(fly?.planned), /rest/);

const mixedSupersetA = trainingExercisePrescription({
  exercise: exercise(
    'Incline Chest Fly',
    [
      { set_type: 'working', target_reps: '10-14', target_rir: 2 },
      { set_type: 'working', target_reps: '8', target_rir: 1 },
    ],
    { equipment: 'Dumbbell', rest_seconds: 90 }
  ),
  mark: 'A1',
  omitRest: true,
});
const mixedSupersetB = trainingExercisePrescription({
  exercise: exercise('Pullover', [{ set_type: 'working', target_reps: '10-15', target_rir: 2 }], {
    equipment: 'Dumbbell',
    rest_seconds: 90,
  }),
  mark: 'A2',
  omitRest: true,
});
assert.equal(mixedSupersetA?.planned, '2 working sets · mixed targets');
assert.equal(mixedSupersetA?.secondary, 'Set 1: 10–14 reps · 2 RIR · Set 2: 8 reps · 1 RIR');
assert.equal(mixedSupersetB?.planned, '1 × 10–15 reps · 2 RIR');
assert.notEqual(mixedSupersetA?.planned, mixedSupersetB?.planned);
assert.equal(
  blockRestLabel([
    exercise('Incline Chest Fly', [{ set_type: 'working', target_reps: '8', rest_seconds: 90 }], { rest_seconds: 90 }),
    exercise('Pullover', [{ set_type: 'working', target_reps: '8', rest_seconds: 90 }], { rest_seconds: 90 }),
  ]),
  '90 sec rest'
);

const noEquipment = trainingExercisePrescription({
  exercise: exercise('Mystery Lift', [{ set_type: 'working', target_reps: '8' }], { name: 'Barbell Mystery Lift' }),
});
assert.equal(noEquipment?.equipment, '');
assert.equal(noEquipment?.planned, '1 × 8 reps');

const noRest = trainingExercisePrescription({
  exercise: exercise('Row', [{ set_type: 'working', target_reps: '8', target_rir: 1 }]),
});
assert.equal(noRest?.planned, '1 × 8 reps · 1 RIR');
assert.doesNotMatch(String(noRest?.planned), /rest/);

assert.equal(trainingExercisePrescription({ exercise: exercise('Empty', []) }), null);
assert.equal(trainingExercisePrescription({ exercise: { name: 'No sets' } }), null);

const logged = exercise(
  'Bench Press',
  [
    { set_type: 'working', target_reps: '8', target_rir: 2, rest_seconds: 90 },
    { set_type: 'working', target_reps: '8', target_rir: 2, rest_seconds: 90 },
    { set_type: 'working', target_reps: '8', target_rir: 2, rest_seconds: 90 },
  ],
  {
    equipment: 'Dumbbell',
    logs: [
      { actual_reps: 10, actual_rir: 0, actual_weight: 70 },
      { actual_reps: 10, actual_rir: 0, actual_weight: 70 },
      { actual_reps: 8, actual_rir: 1, actual_weight: 70 },
    ],
  }
);
const fromLogs = trainingExercisePrescription({ exercise: logged });
assert.equal(fromLogs?.planned, '3 × 8 reps · 2 RIR · 90 sec rest');
assert.doesNotMatch(String(fromLogs?.planned), /\b0 RIR\b|\b1 RIR\b|70|10 reps/);

const overlayWorkout = {
  id: 'group-w1',
  workout_type: 'Full Body A - Chest Priority Strength',
  st_exercises: [
    exercise(
      'Bench Press',
      [
        { set_type: 'warmup', target_reps: '10' },
        { set_type: 'working', target_reps: '8', target_rir: 2, rest_seconds: 90 },
        { set_type: 'working', target_reps: '8', target_rir: 2, rest_seconds: 90 },
        { set_type: 'working', target_reps: '8', target_rir: 2, rest_seconds: 90 },
      ],
      { equipment: 'Dumbbell', muscle_group: 'Chest' }
    ),
  ],
};
const overlayRx = trainingExercisePrescription({
  exercise: overlayWorkout.st_exercises[0],
  catalogItem: { equipment: 'Dumbbell' },
});
assert.equal(overlayRx?.name, 'Bench Press');
assert.equal(overlayRx?.equipment, 'Dumbbell');
assert.equal(overlayRx?.planned, '3 × 8 reps · 2 RIR · 90 sec rest');
assert.equal(overlayRx?.secondary, '1 ramp-up set');

console.log('training prescription D3 checks passed');
