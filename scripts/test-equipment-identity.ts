/**
 * BIQ-0301 equipment identity.
 * Run: npx tsx scripts/test-equipment-identity.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyProgressionDecision } from '../lib/scienceEngine/adaptation/apply/applyDecision';
import { selectNextEligibleExposure } from '../lib/scienceEngine/adaptation/apply/nextExposure';
import type { CandidateExposure, SourceExposureRef } from '../lib/scienceEngine/adaptation/apply/types';
import { exposuresAreComparable } from '../lib/scienceEngine/adaptation/comparable';
import { evaluateProgressionDecision } from '../lib/scienceEngine/adaptation/decision';
import type { ExerciseExposureInput } from '../lib/scienceEngine/adaptation/inputs';
import { resolveLoadIncrement } from '../lib/scienceEngine/adaptation/increments';
import { inferSnapshotEquipment } from '../lib/progress/equipmentBackfill';
import { seriesIdentityFromParts, seriesKey } from '../lib/progress/identity';
import { exposureFromLoggedExercise } from '../lib/training/adaptationApply';
import { loadEntryCaption } from '../lib/training/equipmentIdentity';
import { createEquipmentWriteQueue, equipmentChoiceBlockReason, equipmentForSetSnapshot } from '../lib/training/equipmentSelection';
import { resolveExerciseEquipment } from '../lib/training/exerciseEquipment';
import { estimateE1rm } from '../lib/training/estimated1Rm';
import { classifyPreviousPerformance } from '../lib/training/previousPerformance';
import { snapshotForLog, withoutSnapshotIdentity } from '../lib/training/setLogSnapshots';

const BENCH = {
  name: 'Bench Press',
  equipment: 'Barbell',
  coaching_metadata: { default_equipment: 'Barbell', compatible_equipment: 'Barbell; Dumbbell; Machine; Smith Machine' },
};
const SNAPSHOTTED = { equipment: 'snapshotted', equipmentDetail: 'existing' };

function exposure(input: {
  equipment?: string | null;
  weight: number;
  date?: string;
  laterality?: string | null;
  rir?: number | null;
}): ExerciseExposureInput {
  return {
    log_date: input.date || '2026-10-08',
    catalog_exercise_id: 'bench',
    exercise_name: 'Bench Press',
    program_role: 'primary',
    measurement_type: 'reps',
    laterality: input.laterality === undefined ? 'bilateral' : input.laterality,
    equipment: input.equipment,
    movement_pattern: 'horizontal_push',
    prescription: { rep_min: 8, rep_max: 10, target_rir: 2, working_set_count: 3 },
    sets: [0, 1, 2].map((index) => ({
      planned_set_id: `set-${input.equipment || 'none'}-${index}`,
      completed: true,
      set_type: 'working',
      actual_weight: input.weight,
      actual_reps: 10,
      actual_rir: input.rir === undefined ? 2 : input.rir,
      snapshot_rep_min: 8,
      snapshot_rep_max: 10,
      snapshot_target_rir: 2,
    })),
  };
}

function candidate(equipment: string | null, exerciseId: string, weight: string): CandidateExposure {
  return {
    user_id: 'user-a',
    program_id: 'prog-a',
    workout_id: `wo-${exerciseId}`,
    exercise_id: exerciseId,
    catalog_exercise_id: 'bench',
    exercise_name: 'Bench Press',
    program_role: 'primary',
    measurement_type: 'reps',
    laterality: 'bilateral',
    equipment,
    week: 2,
    day_order: 1,
    week_status: 'template',
    has_performance: false,
    planned_sets: [
      {
        id: `${exerciseId}-w`,
        exercise_id: exerciseId,
        set_type: 'working',
        set_number: 1,
        target_weight: weight,
        target_reps: '8-10',
        rep_min: 8,
        rep_max: 10,
        target_rir: 2,
      },
    ],
  };
}

function sourceFrom(current: ExerciseExposureInput, equipment: string | null): SourceExposureRef {
  return {
    user_id: 'user-a',
    program_id: 'prog-a',
    workout_id: 'wo-current',
    exercise_id: 'ex-current',
    catalog_exercise_id: 'bench',
    week: 1,
    day_order: 1,
    log_date: current.log_date,
    measurement_type: 'reps',
    program_role: 'primary',
    laterality: 'bilateral',
    equipment,
    exercise_name: 'Bench Press',
  };
}

const options = ['Barbell', 'Dumbbell', 'Machine', 'Smith Machine'];

const blank = resolveExerciseEquipment({ equipment: '' }, BENCH);
assert.equal(blank, '');
assert.equal(resolveExerciseEquipment({ equipment: 'Dumbbell' }, BENCH), 'Dumbbell');
assert.equal(resolveExerciseEquipment({ equipment: 'Smith Machine' }, BENCH), 'Smith Machine');
assert.equal(resolveExerciseEquipment({ equipment: 'DB' }, BENCH), 'Dumbbell');
assert.equal(resolveExerciseEquipment({ equipment: 'Trap Bar' }, { name: 'Custom' }), 'Trap Bar');
assert.equal(resolveExerciseEquipment({ equipment: '' }, { equipment: 'Cable' }), 'Cable');

const needsChoice = equipmentForSetSnapshot({ persisted: '', options });
assert.equal(needsChoice.ok, false);
assert.equal(equipmentChoiceBlockReason(needsChoice), 'Choose the equipment for this exercise before logging a set.');
const pendingDumbbell = equipmentForSetSnapshot({ persisted: 'Barbell', pending: 'Dumbbell', options });
assert.equal(pendingDumbbell.ok && pendingDumbbell.equipment, 'Dumbbell');
assert.equal(equipmentChoiceBlockReason(pendingDumbbell), null);
const aliasPending = equipmentForSetSnapshot({ persisted: 'Barbell', pending: 'DB', options });
assert.equal(aliasPending.ok && aliasPending.equipment, 'Dumbbell');
const unspecified = equipmentForSetSnapshot({ persisted: '', options: [] });
assert.equal(unspecified.ok && unspecified.equipment, '');

const barbellKey = seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: 'Barbell' }));
const dumbbellKey = seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: 'Dumbbell' }));
const smithKey = seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: 'Smith Machine' }));
const dbKey = seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: 'DB' }));
const unknownKey = seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: '' }));
assert.notEqual(barbellKey, dumbbellKey);
assert.notEqual(barbellKey, smithKey);
assert.notEqual(dumbbellKey, smithKey);
assert.equal(dbKey, dumbbellKey);
assert.match(unknownKey, /\|unspecified\|/);
assert.equal(seriesIdentityFromParts({ equipment: 'DB' }).equipmentLabel, 'Dumbbell');

const keptAlias = inferSnapshotEquipment({ existingEquipment: 'DB', exerciseName: 'Bench Press', compatibleEquipment: options });
assert.equal(keptAlias.equipment, 'DB');
assert.equal(keptAlias.provenance, 'snapshotted');
const singleImplement = inferSnapshotEquipment({ exerciseName: 'Bench Press', compatibleEquipment: ['Barbell'] });
assert.equal(singleImplement.equipment, null);
assert.equal(singleImplement.provenance, 'unknown');
assert.equal(singleImplement.detail, 'unspecified');
const named = inferSnapshotEquipment({ exerciseName: 'Dumbbell Bench Press', compatibleEquipment: options });
assert.equal(named.equipment, 'Dumbbell');
assert.equal(named.provenance, 'backfilled');

async function checkEquipmentWrites() {
  let releaseFirst: () => void = () => undefined;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const written: string[] = [];
  const queue = createEquipmentWriteQueue();
  queue.enqueue('Barbell', async (value, isCurrent) => {
    await firstGate;
    if (!isCurrent()) return;
    written.push(value);
  });
  queue.enqueue('Dumbbell', async (value, isCurrent) => {
    if (!isCurrent()) return;
    written.push(value);
  });
  assert.equal(queue.intent()?.value, 'Dumbbell');
  const duringPending = equipmentForSetSnapshot({ persisted: 'Barbell', pending: queue.intent()?.value, options });
  assert.equal(duringPending.ok && duringPending.equipment, 'Dumbbell');
  releaseFirst();
  await queue.done();
  assert.deepEqual(written, ['Dumbbell']);

  const ordered: string[] = [];
  const orderedQueue = createEquipmentWriteQueue();
  orderedQueue.enqueue('Barbell', async (value) => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    ordered.push(value);
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  orderedQueue.enqueue('Smith Machine', async (value) => {
    ordered.push(value);
  });
  await orderedQueue.done();
  assert.deepEqual(ordered, ['Barbell', 'Smith Machine']);
}

function historyRow(id: string, equipment: string, provenance: Record<string, string> | null, weight: string) {
  return {
    id,
    log_date: '2026-10-01',
    actual_weight: weight,
    actual_reps: '8',
    completed: true,
    snapshot_catalog_exercise_id: 'bench',
    snapshot_exercise_name: 'Bench Press',
    snapshot_equipment: equipment,
    snapshot_set_type: 'working',
    snapshot_set_number: 1,
    snapshot_provenance: provenance,
  };
}

const copyMatch = classifyPreviousPerformance({
  catalogExerciseId: 'bench',
  exerciseName: 'Bench Press',
  equipment: 'Dumbbell',
  setType: 'working',
  setNumber: 1,
  sessionDate: '2026-10-08',
  rows: [historyRow('db', 'Dumbbell', SNAPSHOTTED, '70')],
});
assert.equal(copyMatch.kind, 'exact');
assert.equal(copyMatch.copyLastEligible, true);

const copyAlias = classifyPreviousPerformance({
  catalogExerciseId: 'bench',
  exerciseName: 'Bench Press',
  equipment: 'DB',
  setType: 'working',
  setNumber: 1,
  sessionDate: '2026-10-08',
  rows: [historyRow('db', 'Dumbbell', SNAPSHOTTED, '70')],
});
assert.equal(copyAlias.kind, 'exact');

const copyMismatch = classifyPreviousPerformance({
  catalogExerciseId: 'bench',
  exerciseName: 'Bench Press',
  equipment: 'Barbell',
  setType: 'working',
  setNumber: 1,
  sessionDate: '2026-10-08',
  rows: [historyRow('db', 'Dumbbell', SNAPSHOTTED, '70'), historyRow('sm', 'Smith Machine', SNAPSHOTTED, '155')],
});
assert.equal(copyMismatch.kind, 'different_equipment');
assert.equal(copyMismatch.copyLastEligible, false);

const copyUnverified = classifyPreviousPerformance({
  catalogExerciseId: 'bench',
  exerciseName: 'Bench Press',
  equipment: 'Barbell',
  setType: 'working',
  setNumber: 1,
  sessionDate: '2026-10-08',
  rows: [historyRow('old', 'Barbell', { equipment: 'backfilled', equipmentDetail: 'logged_name' }, '185')],
});
assert.equal(copyUnverified.kind, 'unknown_equipment');
assert.equal(copyUnverified.copyLastEligible, false);
assert.equal(copyUnverified.uncertain?.provenance.equipment, 'backfilled');

const dumbbellNow = exposure({ equipment: 'Dumbbell', weight: 70 });
const barbellHistory = exposure({ equipment: 'Barbell', weight: 185, date: '2026-09-01' });
const smithNow = exposure({ equipment: 'Smith Machine', weight: 155 });
assert.equal(exposuresAreComparable(dumbbellNow, barbellHistory), false);
assert.equal(exposuresAreComparable(smithNow, barbellHistory), false);
assert.equal(exposuresAreComparable(exposure({ equipment: 'DB', weight: 70 }), dumbbellNow), true);
assert.equal(exposuresAreComparable(exposure({ equipment: '', weight: 135 }), exposure({ equipment: null, weight: 135, date: '2026-09-01' })), true);
assert.equal(
  exposuresAreComparable(exposure({ equipment: 'Dumbbell', weight: 30, laterality: 'unilateral' }), exposure({ equipment: 'Dumbbell', weight: 30, laterality: 'bilateral', date: '2026-09-01' })),
  false
);

const borrowed = evaluateProgressionDecision({ current: smithNow, history: [barbellHistory] });
assert.equal(borrowed.decision, 'progress_load');
assert.equal(borrowed.proposed_load, 160);
assert.match(borrowed.increment_reason, /Smith machine plate/);
assert.doesNotMatch(borrowed.increment_reason, /stack/);

const isolated = evaluateProgressionDecision({
  current: exposure({ equipment: 'Smith Machine', weight: 155, rir: null }),
  history: [exposure({ equipment: 'Barbell', weight: 155, date: '2026-09-01', rir: null })],
});
assert.equal(isolated.decision, 'hold');
assert.equal(isolated.proposed_load, 155);
const repeatedSmith = evaluateProgressionDecision({
  current: exposure({ equipment: 'Smith Machine', weight: 155, rir: null }),
  history: [exposure({ equipment: 'Smith Machine', weight: 155, date: '2026-09-01', rir: null })],
});
assert.equal(repeatedSmith.decision, 'progress_load');
assert.equal(repeatedSmith.proposed_load, 160);

const matching = evaluateProgressionDecision({
  current: exposure({ equipment: 'Dumbbell', weight: 70 }),
  history: [exposure({ equipment: 'Dumbbell', weight: 70, date: '2026-09-01' })],
});
assert.equal(matching.proposed_load, 75);
assert.match(matching.increment_reason, /per dumbbell/i);

const noHistory = evaluateProgressionDecision({
  current: exposure({ equipment: 'Barbell', weight: 185, date: '2026-10-08' }),
  history: [exposure({ equipment: 'Dumbbell', weight: 70, date: '2026-09-01' })],
});
assert.equal(noHistory.decision, 'progress_load');
assert.equal(noHistory.proposed_load, 190);

const dumbbellTarget = candidate('Dumbbell', 'ex-db', '70');
const barbellTarget = candidate('Barbell', 'ex-bb', '185');
const smithTarget = candidate('Smith Machine', 'ex-sm', '155');
const dumbbellSource = sourceFrom(dumbbellNow, 'Dumbbell');
assert.equal(selectNextEligibleExposure(dumbbellSource, [barbellTarget, smithTarget, dumbbellTarget])?.exercise_id, 'ex-db');
const appliedMatch = applyProgressionDecision({ source: dumbbellSource, decision: matching, candidates: [barbellTarget, smithTarget, dumbbellTarget] });
assert.equal(appliedMatch.mutated, true);
assert.equal(dumbbellTarget.planned_sets[0].target_weight, '75');
assert.equal(barbellTarget.planned_sets[0].target_weight, '185');
assert.equal(smithTarget.planned_sets[0].target_weight, '155');

const onlyBarbell = candidate('Barbell', 'ex-bb-2', '185');
const noComparable = applyProgressionDecision({
  source: sourceFrom(dumbbellNow, 'Dumbbell'),
  decision: matching,
  candidates: [onlyBarbell],
});
assert.equal(noComparable.abort_reason, 'NO_ELIGIBLE_TARGET');
assert.equal(onlyBarbell.planned_sets[0].target_weight, '185');

const fromSnapshot = exposureFromLoggedExercise({
  exercise: {
    id: 'ex',
    name: 'Bench Press',
    catalog_exercise_id: 'bench',
    equipment: 'Barbell',
    laterality: 'bilateral',
    st_planned_sets: [{ id: 's1', set_type: 'working', set_number: 1 }],
  },
  workout: { id: 'wo' },
  logsByPlannedSetId: {
    s1: { completed: true, actual_weight: 70, actual_reps: 8, snapshot_equipment: 'Dumbbell', snapshot_variant: 'unilateral', log_date: '2026-10-01' },
  },
});
assert.equal(fromSnapshot.equipment, 'Dumbbell');
assert.equal(fromSnapshot.laterality, 'unilateral');

const historicalBlank = exposureFromLoggedExercise({
  equipmentSource: 'history',
  exercise: {
    id: 'ex',
    name: 'Bench Press',
    catalog_exercise_id: 'bench',
    equipment: 'Barbell',
    st_planned_sets: [{ id: 's1', set_type: 'working', set_number: 1 }],
  },
  workout: { id: 'wo' },
  logsByPlannedSetId: { s1: { completed: true, actual_weight: 135, actual_reps: 8, log_date: '2026-09-01' } },
});
assert.equal(historicalBlank.equipment, '');

const smithIncrement = resolveLoadIncrement({ equipment: 'Smith Machine', units: 'lb' });
assert.equal(smithIncrement.increment, 5);
assert.match(smithIncrement.reason, /Smith machine plate/);
assert.doesNotMatch(smithIncrement.reason, /stack/);
const machineIncrement = resolveLoadIncrement({ equipment: 'Machine', units: 'lb' });
assert.match(machineIncrement.reason, /stack/);
const dbIncrement = resolveLoadIncrement({ equipment: 'DB', units: 'lb' });
assert.equal(dbIncrement.increment, 5);
assert.match(dbIncrement.reason, /per dumbbell/i);

assert.equal(loadEntryCaption('Dumbbell', 'bilateral'), 'Weight is per dumbbell.');
assert.match(loadEntryCaption('DB', 'unilateral') || '', /one arm/);
assert.match(loadEntryCaption('Smith Machine') || '', /No bar weight/);
assert.match(loadEntryCaption('Machine') || '', /No bar weight or counterbalance/);
const e1rm = estimateE1rm({ weight: 70, reps: 8, setType: 'working' });
assert.equal(e1rm, 70 * (1 + 8 / 30));
assert.notEqual(e1rm, 140 * (1 + 8 / 30));

const original = snapshotForLog(
  { name: 'Bench Press', catalog_exercise_id: 'bench' },
  { set_type: 'working', set_number: 1 },
  { day_label: 'Mon', week: 1 },
  null,
  { equipment: 'Dumbbell' }
);
assert.equal(original.snapshot_equipment, 'Dumbbell');
const update = withoutSnapshotIdentity({ ...original, actual_weight: 80, snapshot_equipment: 'Barbell' });
assert.equal('snapshot_equipment' in update, false);
assert.equal(original.snapshot_equipment, 'Dumbbell');

const foundation = readFileSync('supabase/migrations/20261008_060_progress_snapshot_foundation.sql', 'utf8');
const inference = readFileSync('supabase/migrations/20261103_077_equipment_inference_no_single_implement.sql', 'utf8');
assert.match(foundation, /new\.snapshot_equipment := old\.snapshot_equipment/);
assert.doesNotMatch(inference, /update\s+public\.st_set_logs/i);
assert.doesNotMatch(inference, /single_implement/);

checkEquipmentWrites()
  .then(() => {
    console.log('equipment identity checks passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
