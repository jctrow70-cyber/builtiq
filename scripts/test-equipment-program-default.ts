/**
 * BIQ-0310 — program/catalog equipment defaults for logging.
 * Run: npx tsx scripts/test-equipment-program-default.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  defaultCatalogEquipment,
  seedPendingEquipmentDefaults,
} from '../lib/training/exerciseEquipment';
import { equipmentChoiceBlockReason, equipmentForSetSnapshot } from '../lib/training/equipmentSelection';
import {
  remapPendingEquipmentForCopiedWorkout,
  resolveExerciseInWorkout,
} from '../lib/training/exerciseTargetResolve';

const BENCH = {
  name: 'Bench Press',
  equipment: 'Barbell',
  coaching_metadata: {
    default_equipment: 'Barbell',
    compatible_equipment: 'Barbell; Dumbbell; Machine; Smith Machine',
  },
};

assert.equal(defaultCatalogEquipment(BENCH), 'Barbell');
assert.equal(defaultCatalogEquipment(BENCH, { equipment: 'Dumbbell' }), 'Dumbbell');
assert.equal(defaultCatalogEquipment(BENCH, undefined, ['dumbbell']), 'Dumbbell');
assert.equal(defaultCatalogEquipment(BENCH, undefined, ['full_gym']), 'Barbell');
assert.equal(
  defaultCatalogEquipment(
    {
      equipment: 'Machine',
      coaching_metadata: { default_equipment: 'Dumbbell', compatible_equipment: 'Barbell; Dumbbell; Machine' },
    },
    undefined,
    null
  ),
  'Dumbbell',
  'catalog default_equipment wins over the first compatible option'
);

const catalogById = (id: string) => (id === 'bench' ? BENCH : null);
const seeded = seedPendingEquipmentDefaults({
  exercises: [
    { id: 'ex-1', catalog_exercise_id: 'bench', equipment: '' },
    { id: 'ex-2', catalog_exercise_id: 'bench', equipment: 'Smith Machine' },
    { id: 'ex-3', catalog_exercise_id: 'solo', equipment: '' },
  ],
  catalogById: (id) => {
    if (id === 'bench') return BENCH;
    if (id === 'solo') return { equipment: 'Cable', coaching_metadata: { default_equipment: 'Cable', compatible_equipment: 'Cable' } };
    return catalogById(id);
  },
  pending: {},
  availableEquipment: ['dumbbell'],
});
assert.ok(seeded);
assert.equal(seeded!['ex-1'], 'Dumbbell');
assert.equal(Object.prototype.hasOwnProperty.call(seeded!, 'ex-2'), false, 'persisted equipment is left alone');
assert.equal(Object.prototype.hasOwnProperty.call(seeded!, 'ex-3'), false, 'single-option cards do not need a pending seed');

const choice = equipmentForSetSnapshot({
  persisted: '',
  pending: seeded!['ex-1'],
  options: ['Barbell', 'Dumbbell', 'Machine', 'Smith Machine'],
});
assert.equal(choice.ok, true);
assert.equal(choice.ok && choice.equipment, 'Dumbbell');
assert.equal(equipmentChoiceBlockReason(choice), null);

const again = seedPendingEquipmentDefaults({
  exercises: [{ id: 'ex-1', catalog_exercise_id: 'bench', equipment: '' }],
  catalogById,
  pending: seeded!,
  availableEquipment: ['dumbbell'],
});
assert.equal(again, null, 'already-seeded pending is stable');

const source = {
  id: 'old-row',
  name: 'Bench Press',
  catalog_exercise_id: 'cat-bench',
  sort_order: 1,
  section: 'strength',
};
const copied = {
  id: 'new-wo',
  st_exercises: [
    { id: 'new-row', name: 'Bench Press', catalog_exercise_id: 'cat-bench', sort_order: 1, section: 'strength' },
  ],
};
const sectionOf = (ex: { section?: string | null }) => String(ex.section || 'strength');
assert.equal(resolveExerciseInWorkout(copied, source, sectionOf)?.id, 'new-row');
const remapped = remapPendingEquipmentForCopiedWorkout(
  { 'old-row': 'Dumbbell', 'other': 'Cable' },
  [source],
  copied,
  sectionOf
);
assert.deepEqual(remapped, { 'old-row': 'Dumbbell', 'new-row': 'Dumbbell', other: 'Cable' });

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
assert.match(page, /seedPendingEquipmentDefaults/);
assert.match(page, /remapPendingEquipmentForCopiedWorkout/);
assert.match(page, /aliasEquipmentPending/);
assert.match(page, /Alias optimistic equipment onto copied exercise ids/);

const aiPlan = readFileSync(new URL('../lib/training/aiProgramPlan.ts', import.meta.url), 'utf8');
assert.match(aiPlan, /defaultCatalogEquipment/);
assert.match(aiPlan, /equipment,\s*$/m);
assert.match(aiPlan, /availableEquipment/);

console.log('test-equipment-program-default: ok');
