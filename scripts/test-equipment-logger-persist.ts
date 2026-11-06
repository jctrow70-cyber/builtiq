/**
 * BIQ-0310 — equipment choice must stay visible while the logger is open.
 * Run: npx tsx scripts/test-equipment-logger-persist.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { patchExerciseCatalogInProgram } from '../lib/training/exerciseListEdit';
import { programApplyBlocked } from '../lib/training/programLoadGuard';
import { loggerSelectedEquipment } from '../lib/training/previousPerformanceDisplay';
import { resolveExerciseEquipment } from '../lib/training/exerciseEquipment';

const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');

assert.equal(
  programApplyBlocked({ loggerProtected: false, workoutOpen: true, epochAtStart: 1, epochNow: 1 }),
  true,
  'open logger must block full program replace'
);

assert.match(page, /function applyExercisePatchesWhileLogging/);
assert.match(page, /applyExercisePatchesWhileLogging\(applied/);
assert.match(page, /Logger-open reloads are blocked from replacing the program tree/);
assert.match(page, /private copy into the live tree so equipment edits stick/);
assert.match(page, /setProgram\(copied\.program\)/);

const program = {
  id: 'prog-1',
  st_workouts: [
    {
      id: 'wo-1',
      st_exercises: [
        {
          id: 'ex-1',
          name: 'Chest Supported Row',
          catalog_exercise_id: 'cat-1',
          equipment: '',
          st_planned_sets: [{ id: 'set-1', set_number: 1 }],
        },
      ],
    },
  ],
};

const patched = patchExerciseCatalogInProgram(program, [
  { workoutId: 'wo-1', exerciseId: 'ex-1', patch: { equipment: 'Machine' } },
]);
const exercise = patched?.st_workouts?.[0]?.st_exercises?.[0];
assert.equal(exercise?.equipment, 'Machine');
assert.equal(exercise?.st_planned_sets?.[0]?.id, 'set-1', 'planned sets stay attached');

const catalogItem = {
  id: 'cat-1',
  equipment: 'Cable',
  coaching_metadata: { compatible_equipment: ['Cable', 'Machine', 'Dumbbell'] },
};
const persisted = resolveExerciseEquipment(exercise, catalogItem);
assert.equal(persisted, 'Machine');
assert.equal(loggerSelectedEquipment(persisted, undefined), 'Machine');
assert.equal(loggerSelectedEquipment('', 'Machine'), 'Machine');

console.log('test-equipment-logger-persist: ok');
