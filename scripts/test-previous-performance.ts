/**
 * BIQ-0271 Phase E2.1: equipment-aware previous-performance classifier.
 * Pure library. Does not change live previousFor / Copy last.
 * Run: npx tsx scripts/test-previous-performance.ts
 */
import assert from 'node:assert/strict';
import { normalizeSetType } from '../lib/training/setTypes';
import { snapshotForLog, withoutSnapshotIdentity } from '../lib/training/setLogSnapshots';
import {
  classifyPreviousPerformance,
  previousPerformanceCopyLastEligible,
  previousPerformanceHasValues,
  type PreviousPerformanceLog,
} from '../lib/training/previousPerformance';

const SNAPSHOTTED = {
  equipment: 'snapshotted',
  equipmentDetail: 'existing',
  movementPattern: 'snapshotted',
  muscleCredits: 'snapshotted',
  variant: 'snapshotted',
} as const;

const ESTIMATED = {
  equipment: 'estimated',
  equipmentDetail: 'unspecified',
  movementPattern: 'unknown',
  muscleCredits: 'unknown',
  variant: 'unknown',
} as const;

const CATALOG = [
  { id: 'bench-old', name: 'Bench Press' },
  { id: 'bench-new', name: 'Bench Press' },
  { id: 'incline', name: 'Incline Bench Press' },
  { id: 'rdl', name: 'Romanian Deadlift' },
];

function row(partial: PreviousPerformanceLog): PreviousPerformanceLog {
  return {
    id: 'log-1',
    user_id: 'user-1',
    team_id: null,
    log_date: '2026-10-21',
    updated_at: '2026-10-21T12:00:00Z',
    actual_weight: '135',
    actual_reps: '5',
    completed: true,
    snapshot_catalog_exercise_id: 'bench-new',
    snapshot_exercise_name: 'Bench Press',
    snapshot_equipment: 'Barbell',
    snapshot_set_type: 'working',
    snapshot_set_number: 1,
    snapshot_provenance: { ...SNAPSHOTTED },
    ...partial,
  };
}

function classify(overrides: Parameters<typeof classifyPreviousPerformance>[0] = { sessionDate: '2026-10-28' }) {
  return classifyPreviousPerformance({
    catalog: CATALOG,
    catalogExerciseId: 'bench-new',
    exerciseName: 'Bench Press',
    equipment: 'Barbell',
    setType: 'working',
    setNumber: 1,
    sessionDate: '2026-10-28',
    userId: 'user-1',
    ...overrides,
  });
}

assert.equal(normalizeSetType('ramp'), 'working', 'guard: live normalizeSetType still folds ramp; classifier must not');

const barbell = row({ id: 'bb', snapshot_equipment: 'Barbell', actual_weight: '185', actual_reps: '5' });
const dumbbell = row({ id: 'db', snapshot_equipment: 'Dumbbell', actual_weight: '70', actual_reps: '8' });
const smith = row({ id: 'sm', snapshot_equipment: 'Smith Machine', actual_weight: '155', actual_reps: '6' });
const split = classify({ rows: [barbell, dumbbell, smith] });
assert.equal(split.kind, 'exact');
assert.equal(split.comparable?.sourceId, 'bb');
assert.equal(split.comparable?.weight, '185');
assert.equal(split.comparable?.reps, '5');
assert.equal(split.comparable?.equipment, 'Barbell');
assert.equal(split.copyLastEligible, true);
assert.equal(split.copyLastSource?.sourceId, 'bb');
assert.equal(split.comparable?.identityMatch, 'catalog');
assert.deepEqual(
  split.otherEquipment.map((hit) => hit.equipmentKey).sort(),
  ['dumbbell', 'smith machine']
);
assert.equal(previousPerformanceCopyLastEligible('exact'), true);
assert.equal(previousPerformanceCopyLastEligible('unknown_equipment'), false);
assert.equal(previousPerformanceCopyLastEligible('different_equipment'), false);
assert.equal(previousPerformanceCopyLastEligible('none'), false);

const caps = classify({
  equipment: '  BARBELL ',
  rows: [row({ id: 'caps', snapshot_equipment: 'barbell' })],
});
assert.equal(caps.kind, 'exact');
assert.equal(caps.comparable?.equipmentKey, 'barbell');

const smithNorm = classify({
  equipment: 'smith machine',
  rows: [row({ id: 'smith-caps', snapshot_equipment: 'Smith Machine' })],
});
assert.equal(smithNorm.kind, 'exact');
assert.equal(smithNorm.comparable?.equipmentKey, 'smith machine');

const missingEquip = classify({
  rows: [row({ id: 'missing', snapshot_equipment: '', snapshot_provenance: ESTIMATED })],
});
assert.equal(missingEquip.kind, 'unknown_equipment');
assert.equal(missingEquip.comparable, null);
assert.equal(missingEquip.copyLastEligible, false);
assert.equal(missingEquip.uncertain?.sourceId, 'missing');
assert.equal(missingEquip.uncertain?.equipmentKey, 'unspecified');

const unverified = classify({
  rows: [row({ id: 'est', snapshot_equipment: 'Barbell', snapshot_provenance: ESTIMATED })],
});
assert.equal(unverified.kind, 'unknown_equipment');
assert.equal(unverified.copyLastEligible, false);
assert.equal(unverified.uncertain?.sourceId, 'est');
assert.equal(unverified.uncertain?.provenance.equipment, 'estimated');

const unknownProv = classify({
  rows: [row({ id: 'unk', snapshot_equipment: 'Barbell', snapshot_provenance: null })],
});
assert.equal(unknownProv.kind, 'unknown_equipment');
assert.equal(unknownProv.uncertain?.provenance.equipment, 'unknown');

const aliasExact = classify({
  catalogExerciseId: 'bench-new',
  rows: [row({ id: 'alias', snapshot_catalog_exercise_id: 'bench-old' })],
});
assert.equal(aliasExact.kind, 'exact');
assert.equal(aliasExact.comparable?.sourceId, 'alias');
assert.equal(aliasExact.comparable?.identityMatch, 'catalog');

const aliasDifferentEquip = classify({
  catalogExerciseId: 'bench-new',
  equipment: 'Barbell',
  rows: [row({ id: 'alias-db', snapshot_catalog_exercise_id: 'bench-old', snapshot_equipment: 'Dumbbell' })],
});
assert.equal(aliasDifferentEquip.kind, 'different_equipment');
assert.equal(aliasDifferentEquip.copyLastEligible, false);
assert.equal(aliasDifferentEquip.otherEquipment[0]?.sourceId, 'alias-db');
assert.equal(aliasDifferentEquip.otherEquipment[0]?.identityMatch, 'catalog');

const duplicateNameNotSameMove = classify({
  catalogExerciseId: 'bench-new',
  exerciseName: 'Bench Press',
  rows: [row({ id: 'incline-row', snapshot_catalog_exercise_id: 'incline', snapshot_exercise_name: 'Incline Bench Press' })],
});
assert.equal(duplicateNameNotSameMove.kind, 'none');

const warmupVsWorking = classify({
  setType: 'working',
  rows: [
    row({ id: 'wu', snapshot_set_type: 'warmup', actual_weight: '95', actual_reps: '8' }),
    row({ id: 'wk', snapshot_set_type: 'working', actual_weight: '185', actual_reps: '5' }),
  ],
});
assert.equal(warmupVsWorking.kind, 'exact');
assert.equal(warmupVsWorking.comparable?.sourceId, 'wk');

const warmupQuery = classify({
  setType: 'warmup',
  rows: [row({ id: 'wu-only', snapshot_set_type: 'warmup', actual_weight: '95' })],
});
assert.equal(warmupQuery.kind, 'exact');
assert.equal(warmupQuery.comparable?.sourceId, 'wu-only');

assert.notEqual(normalizeSetType('ramp'), 'ramp');
const rampVsWorking = classify({
  setType: 'working',
  rows: [row({ id: 'ramp', snapshot_set_type: 'ramp', actual_weight: '135' })],
});
assert.equal(rampVsWorking.kind, 'none');

const rampQuery = classify({
  setType: 'ramp',
  rows: [row({ id: 'ramp-ok', snapshot_set_type: 'ramp', actual_weight: '135' })],
});
assert.equal(rampQuery.kind, 'exact');

const backoffVsWorking = classify({
  setType: 'working',
  rows: [row({ id: 'bo', snapshot_set_type: 'backoff', actual_weight: '155' })],
});
assert.equal(backoffVsWorking.kind, 'none');

const extraCollision = classify({
  setNumber: 1,
  rows: [
    row({
      id: 'extra',
      is_extra_set: true,
      set_origin: 'extra',
      extra_set_number: 1,
      snapshot_set_type: 'working',
      snapshot_set_number: 1,
      actual_weight: '225',
    }),
  ],
});
assert.equal(extraCollision.kind, 'none');

const extraOriginOnly = classify({
  rows: [row({ id: 'extra-origin', set_origin: 'extra', snapshot_set_number: 1, actual_weight: '225' })],
});
assert.equal(extraOriginOnly.kind, 'none');

const dates = classify({
  rows: [
    row({ id: 'older', log_date: '2026-10-07', actual_weight: '175', updated_at: '2026-10-07T12:00:00Z' }),
    row({ id: 'newer', log_date: '2026-10-21', actual_weight: '195', updated_at: '2026-10-21T12:00:00Z' }),
    row({ id: 'mid', log_date: '2026-10-14', actual_weight: '185', updated_at: '2026-10-14T12:00:00Z' }),
  ],
});
assert.equal(dates.kind, 'exact');
assert.equal(dates.comparable?.sourceId, 'newer');
assert.equal(dates.comparable?.date, '2026-10-21');
assert.equal(dates.comparable?.weight, '195');

const sameDayNewest = classify({
  rows: [
    row({ id: 'a', log_date: '2026-10-21', updated_at: '2026-10-21T10:00:00Z', actual_weight: '175' }),
    row({ id: 'b', log_date: '2026-10-21', updated_at: '2026-10-21T18:00:00Z', actual_weight: '190' }),
  ],
});
assert.equal(sameDayNewest.comparable?.sourceId, 'b');
assert.equal(sameDayNewest.comparable?.weight, '190');

const personalAndGroup = classify({
  userId: 'user-1',
  rows: [
    row({ id: 'personal', team_id: null, log_date: '2026-10-14', actual_weight: '175' }),
    row({ id: 'group', team_id: 'team-9', log_date: '2026-10-21', actual_weight: '190' }),
  ],
});
assert.equal(personalAndGroup.kind, 'exact');
assert.equal(personalAndGroup.comparable?.sourceId, 'group');
assert.equal(personalAndGroup.comparable?.teamId, 'team-9');

const otherUserDropped = classify({
  userId: 'user-1',
  rows: [row({ id: 'other-user', user_id: 'user-2', actual_weight: '405' })],
});
assert.equal(otherUserDropped.kind, 'none');

const missingCatalogIds = classify({
  catalogExerciseId: '',
  exerciseName: 'Romanian Deadlift',
  rows: [
    row({
      id: 'rdl-name',
      snapshot_catalog_exercise_id: '',
      snapshot_exercise_name: 'Romanian Deadlift',
    }),
  ],
});
assert.equal(missingCatalogIds.kind, 'exact');
assert.equal(missingCatalogIds.comparable?.sourceId, 'rdl-name');
assert.equal(missingCatalogIds.comparable?.identityMatch, 'catalog');

const nameOnly = classify({
  catalog: [],
  catalogExerciseId: '',
  exerciseName: 'Custom Lift',
  rows: [
    row({
      id: 'name-only',
      snapshot_catalog_exercise_id: '',
      snapshot_exercise_name: 'Custom Lift',
    }),
  ],
});
assert.equal(nameOnly.kind, 'exact');
assert.equal(nameOnly.comparable?.identityMatch, 'name');
assert.equal(nameOnly.copyLastEligible, true, 'equipment can still be exact; E2.2 must not treat name identity as fully verified');

const noPerformance = classify({
  rows: [
    row({
      id: 'done-only',
      completed: true,
      actual_weight: '',
      actual_reps: '',
      actual_duration: '',
      actual_distance: '',
      log_notes: '',
    }),
  ],
});
assert.equal(previousPerformanceHasValues(noPerformance.uncertain || noPerformance.comparable || { completed: true }), false);
assert.equal(noPerformance.kind, 'none');
assert.equal(
  previousPerformanceHasValues({ completed: true, actual_weight: '', actual_reps: '' }),
  false
);
assert.equal(previousPerformanceHasValues({ completed: false, actual_weight: '135' }), true);

const currentAndFuture = classify({
  sessionDate: '2026-10-28',
  rows: [
    row({ id: 'today', log_date: '2026-10-28', actual_weight: '200' }),
    row({ id: 'future', log_date: '2026-10-29', actual_weight: '210' }),
    row({ id: 'past', log_date: '2026-10-21', actual_weight: '185' }),
  ],
});
assert.equal(currentAndFuture.comparable?.sourceId, 'past');
assert.equal(currentAndFuture.comparable?.weight, '185');

const joinFallbackUncertain = classify({
  rows: [
    {
      id: 'join',
      user_id: 'user-1',
      log_date: '2026-10-21',
      actual_weight: '135',
      actual_reps: '5',
      st_planned_sets: {
        set_type: 'working',
        set_number: 1,
        st_exercises: { name: 'Bench Press', catalog_exercise_id: 'bench-new' },
      },
    },
  ],
});
assert.equal(joinFallbackUncertain.kind, 'unknown_equipment');
assert.equal(joinFallbackUncertain.copyLastEligible, false);

const frozenRows = [
  Object.freeze(
    row({
      id: 'frozen',
      snapshot_provenance: Object.freeze({ ...SNAPSHOTTED }),
    })
  ),
];
const before = JSON.parse(JSON.stringify(frozenRows));
const frozenResult = classify({ rows: frozenRows });
assert.equal(frozenResult.kind, 'exact');
assert.deepEqual(JSON.parse(JSON.stringify(frozenRows)), before);
frozenResult.comparable!.weight = 'mutated';
assert.equal(frozenRows[0].actual_weight, '135');

const dbOnly = classify({
  equipment: 'Barbell',
  rows: [row({ id: 'only-db', snapshot_equipment: 'Dumbbell' })],
});
assert.equal(dbOnly.kind, 'different_equipment');
assert.equal(dbOnly.copyLastEligible, false);
assert.equal(dbOnly.copyLastSource, null);
assert.equal(dbOnly.otherEquipment[0]?.kind, 'different_equipment');

const none = classify({ rows: [] });
assert.equal(none.kind, 'none');
assert.equal(none.copyLastEligible, false);
assert.equal(none.copyLastSource, null);

const currentUnspecified = classify({
  equipment: '',
  rows: [row({ id: 'known-bb', snapshot_equipment: 'Barbell' })],
});
assert.equal(currentUnspecified.kind, 'different_equipment');
assert.equal(currentUnspecified.copyLastEligible, false);

const savedId = '11111111-1111-1111-1111-111111111111';
const savedSnap = snapshotForLog(
  { name: 'Bench Press', catalog_exercise_id: savedId, equipment: 'Barbell' },
  { set_type: 'working', set_number: 1 },
  { day_label: 'Mon', week: 1 },
  { id: savedId, name: 'Bench Press' },
  { equipment: 'Barbell', exerciseType: 'strength' }
);
assert.equal(savedSnap.snapshot_equipment, 'Barbell');
assert.equal(savedSnap.snapshot_provenance.equipment, 'snapshotted');
const savedRow = {
  id: 'saved-working',
  user_id: 'user-1',
  log_date: '2026-10-21',
  actual_weight: '185',
  actual_reps: '5',
  ...savedSnap,
};
const fromSave = classify({
  catalog: [{ id: savedId, name: 'Bench Press' }],
  catalogExerciseId: savedId,
  exerciseName: 'Bench Press',
  equipment: 'Barbell',
  rows: [savedRow],
});
assert.equal(fromSave.kind, 'exact');
assert.equal(fromSave.copyLastEligible, true);
assert.equal(fromSave.comparable?.identityMatch, 'catalog');
assert.equal(fromSave.comparable?.provenance.equipment, 'snapshotted');

const equipmentChangedLater = classify({
  catalog: [{ id: savedId, name: 'Bench Press' }],
  catalogExerciseId: savedId,
  exerciseName: 'Bench Press',
  equipment: 'Dumbbell',
  rows: [savedRow],
});
assert.equal(equipmentChangedLater.kind, 'different_equipment');
assert.equal(savedRow.snapshot_equipment, 'Barbell');
assert.equal(savedSnap.snapshot_provenance.equipment, 'snapshotted');
const updatePayload = withoutSnapshotIdentity({ ...savedRow, actual_weight: '190' });
assert.equal('snapshot_equipment' in updatePayload, false);
assert.equal('snapshot_provenance' in updatePayload, false);

const emptyEquipSnap = snapshotForLog(
  { name: 'Bench Press', catalog_exercise_id: savedId },
  { set_type: 'working', set_number: 1 },
  { week: 1 },
  { id: savedId, name: 'Bench Press' },
  { equipment: '', exerciseType: 'strength' }
);
assert.equal(emptyEquipSnap.snapshot_equipment, '');
assert.equal(emptyEquipSnap.snapshot_provenance.equipment, 'unknown');
const fromEmptyEquip = classify({
  catalog: [{ id: savedId, name: 'Bench Press' }],
  catalogExerciseId: savedId,
  equipment: 'Barbell',
  rows: [{ id: 'no-eq', user_id: 'user-1', log_date: '2026-10-21', actual_weight: '135', actual_reps: '5', ...emptyEquipSnap }],
});
assert.equal(fromEmptyEquip.kind, 'unknown_equipment');
assert.equal(fromEmptyEquip.copyLastEligible, false);

console.log('previous-performance classifier tests passed');
