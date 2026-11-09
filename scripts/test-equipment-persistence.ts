/**
 * BIQ-0314 — program equipment persists onto later weeks without reading set logs.
 * Run: npx tsx scripts/test-equipment-persistence.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyPreviousPerformance } from '../lib/training/previousPerformance';
import { previousPerformanceLine } from '../lib/training/previousPerformanceDisplay';
import {
  assignedEquipmentForInsert,
  blankExercisesInheritingProgramEquipment,
  equipmentEditScope,
  equipmentRowsFromProgram,
  equipmentWriteForTarget,
  type EquipmentProgramExercise,
} from '../lib/training/equipmentPersistence';

const chestSupported = {
  id: 'cat-csr',
  name: 'Chest-Supported Row',
  equipment: 'Dumbbell',
  coaching_metadata: {
    default_equipment: 'Dumbbell',
    compatible_equipment: ['Dumbbell', 'Machine', 'Barbell'],
  },
};

function row(partial: Partial<EquipmentProgramExercise> & Pick<EquipmentProgramExercise, 'workoutId' | 'exerciseId' | 'week'>): EquipmentProgramExercise {
  return {
    dayOrder: 1,
    dayLabel: 'Fri',
    catalogExerciseId: 'cat-csr',
    name: 'Chest-Supported Row',
    sortOrder: 2,
    section: 'strength',
    equipment: '',
    ...partial,
  };
}

const week1Machine = row({ workoutId: 'w1', exerciseId: 'e1', week: 1, equipment: 'Machine' });
const week2Blank = row({ workoutId: 'w2', exerciseId: 'e2', week: 2, equipment: '' });
const week2Dumbbell = row({ workoutId: 'w2', exerciseId: 'e2', week: 2, equipment: 'Dumbbell' });
const week3Blank = row({ workoutId: 'w3', exerciseId: 'e3', week: 3, equipment: '' });

const inherited = blankExercisesInheritingProgramEquipment([week1Machine, week2Blank, week3Blank]);
assert.deepEqual(
  inherited.map((item) => item.exerciseId),
  ['e2', 'e3'],
  'blank later weeks inherit the program Machine assignment'
);
assert.equal(inherited.every((item) => item.equipment === 'Machine'), true);

assert.deepEqual(
  blankExercisesInheritingProgramEquipment([week1Machine, week2Dumbbell]),
  [],
  'an explicit Dumbbell assignment is not replaced from an earlier week'
);

assert.deepEqual(
  blankExercisesInheritingProgramEquipment([
    row({ workoutId: 'w1', exerciseId: 'e1', week: 1, equipment: '' }),
    week2Blank,
  ]),
  [],
  'two blank program rows do not invent equipment'
);

assert.equal(
  blankExercisesInheritingProgramEquipment([
    row({ workoutId: 'w1', exerciseId: 'e1a', week: 1, equipment: 'Machine', sortOrder: 2 }),
    row({ workoutId: 'w1', exerciseId: 'e1b', week: 1, equipment: 'Dumbbell', sortOrder: 4 }),
    row({ workoutId: 'w2', exerciseId: 'e2', week: 2, equipment: '', sortOrder: 2 }),
  ])[0]?.equipment,
  'Machine',
  'the same slot inherits its own earlier implement'
);
assert.deepEqual(
  blankExercisesInheritingProgramEquipment([
    row({ workoutId: 'w1', exerciseId: 'e1a', week: 1, equipment: 'Machine', sortOrder: 2 }),
    row({ workoutId: 'w1', exerciseId: 'e1b', week: 1, equipment: 'Dumbbell', sortOrder: 2 }),
    row({ workoutId: 'w2', exerciseId: 'e2', week: 2, equipment: '', sortOrder: 2 }),
  ]),
  [],
  'ambiguous earlier implements are not copied'
);

const saturday = blankExercisesInheritingProgramEquipment([
  week1Machine,
  row({ workoutId: 'sat', exerciseId: 'sat', week: 2, dayOrder: 5, dayLabel: 'Sat', equipment: '' }),
]);
assert.deepEqual(saturday, [], 'another day does not inherit Friday equipment');

assert.deepEqual(
  equipmentWriteForTarget({ selected: 'Machine', previousEquipment: '', targetEquipment: '', isCurrent: true }),
  { write: true, equipment: 'Machine' }
);
assert.deepEqual(
  equipmentWriteForTarget({ selected: 'Machine', previousEquipment: '', targetEquipment: '', isCurrent: false }),
  { write: true, equipment: 'Machine' },
  'a blank later week receives the explicit choice'
);
assert.deepEqual(
  equipmentWriteForTarget({
    selected: 'Machine',
    previousEquipment: '',
    targetEquipment: 'Dumbbell',
    isCurrent: false,
  }),
  { write: false, equipment: 'Dumbbell' },
  'a different explicit implement stays'
);
assert.deepEqual(
  equipmentWriteForTarget({
    selected: 'Dumbbell',
    previousEquipment: 'Machine',
    targetEquipment: 'Machine',
    isCurrent: false,
  }),
  { write: true, equipment: 'Dumbbell' },
  'later weeks still on the previous choice move with the new choice'
);
assert.deepEqual(
  equipmentWriteForTarget({
    selected: 'Dumbbell',
    previousEquipment: 'Machine',
    targetEquipment: 'db',
    isCurrent: false,
  }),
  { write: false, equipment: 'db' },
  'an alias of the selected implement is left as stored'
);

assert.equal(equipmentEditScope({ applyScope: 'current', scopeControlVisible: false }), 'future');
assert.equal(equipmentEditScope({ applyScope: 'future', scopeControlVisible: false }), 'future');
assert.equal(equipmentEditScope({ applyScope: 'current', scopeControlVisible: true }), 'current');

assert.equal(assignedEquipmentForInsert({ assigned: 'Machine', catalogItem: chestSupported }), 'Machine');
assert.equal(assignedEquipmentForInsert({ catalogItem: chestSupported }), '');
assert.equal(
  assignedEquipmentForInsert({
    catalogItem: { equipment: 'Machine', coaching_metadata: { compatible_equipment: ['Machine'] } },
  }),
  'Machine'
);

const program = {
  st_workouts: [
    {
      id: 'w1',
      week: 1,
      day_order: 1,
      day_label: 'Fri',
      st_exercises: [{ id: 'e1', name: 'Chest-Supported Row', catalog_exercise_id: 'cat-csr', sort_order: 2, section: 'strength', equipment: 'Machine' }],
    },
    {
      id: 'w2',
      week: 2,
      day_order: 1,
      day_label: 'Fri',
      st_exercises: [{ id: 'e2', name: 'Chest-Supported Row', catalog_exercise_id: 'cat-csr', sort_order: 2, section: 'strength', equipment: null }],
    },
  ],
};
assert.equal(
  blankExercisesInheritingProgramEquipment(equipmentRowsFromProgram(program, (exercise) => exercise.section))[0]?.equipment,
  'Machine'
);

const machineLog = {
  id: 'log-1',
  user_id: 'user-1',
  log_date: '2026-11-06',
  actual_weight: '50',
  actual_reps: '10',
  completed: true,
  snapshot_catalog_exercise_id: 'cat-csr',
  snapshot_exercise_name: 'Chest-Supported Row',
  snapshot_equipment: 'Machine',
  snapshot_set_type: 'working',
  snapshot_set_number: 1,
  snapshot_provenance: { equipment: 'snapshotted', equipmentDetail: 'existing' },
};

const unspecified = classifyPreviousPerformance({
  catalogExerciseId: 'cat-csr',
  exerciseName: 'Chest-Supported Row',
  equipment: '',
  setType: 'working',
  setNumber: 1,
  sessionDate: '2026-11-08',
  userId: 'user-1',
  rows: [machineLog],
});
assert.equal(unspecified.kind, 'different_equipment');
assert.equal(previousPerformanceLine(unspecified)?.text, 'Last on Machine: 50 × 10 · Nov 6');
assert.equal(previousPerformanceLine(unspecified)?.copyLast, false);

const selected = classifyPreviousPerformance({
  catalogExerciseId: 'cat-csr',
  exerciseName: 'Chest-Supported Row',
  equipment: 'Machine',
  setType: 'working',
  setNumber: 1,
  sessionDate: '2026-11-08',
  userId: 'user-1',
  rows: [machineLog],
});
assert.equal(selected.kind, 'exact');
assert.equal(previousPerformanceLine(selected)?.text, 'Last: 50 × 10 · Machine · Nov 6');

const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
assert.match(page, /equipmentEditScope\(/);
assert.match(page, /blankExercisesInheritingProgramEquipment\(/);
assert.match(page, /equipment\.is\.null,equipment\.eq\./);
assert.doesNotMatch(page, /snapshot_equipment[\s\S]{0,180}blankExercisesInheritingProgramEquipment/);

const plan = readFileSync(join(process.cwd(), 'lib/training/aiProgramPlan.ts'), 'utf8');
assert.match(plan, /assignedEquipmentForInsert\(/);

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261108_079_preserve_program_equipment.sql'),
  'utf8'
);
assert.match(migration, /v_ex\.equipment/);
assert.equal(migration.split('v_ex.equipment').length - 1, 2);
assert.doesNotMatch(migration, /st_set_logs/);
assert.doesNotMatch(migration, /snapshot_equipment/);

console.log('test-equipment-persistence: ok');
