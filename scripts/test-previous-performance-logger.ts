/**
 * BIQ-0271 Phase E2.2: logger previous-performance line and Copy last gating.
 * Run: npx tsx scripts/test-previous-performance-logger.ts
 */
import assert from 'node:assert/strict';
import { extraSetLogPermissions } from '../lib/training/exerciseLogChrome';
import { classifyPreviousPerformance } from '../lib/training/previousPerformance';
import {
  loggerCopyLastEligible,
  loggerSelectedEquipment,
  previousPerformanceCopyLastAriaLabel,
  previousPerformanceFieldHint,
  previousPerformanceLine,
} from '../lib/training/previousPerformanceDisplay';

const SNAPSHOTTED = {
  equipment: 'snapshotted',
  equipmentDetail: 'existing',
  movementPattern: 'snapshotted',
  muscleCredits: 'snapshotted',
  variant: 'snapshotted',
} as const;

const CATALOG = [
  { id: 'bench-old', name: 'Bench Press' },
  { id: 'bench-new', name: 'Bench Press' },
];

function row(partial: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    user_id: 'user-1',
    team_id: null,
    log_date: '2026-10-21',
    updated_at: '2026-10-21T12:00:00Z',
    actual_weight: '185',
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

function classify(equipment: string, rows: any[], extra: Record<string, unknown> = {}) {
  return classifyPreviousPerformance({
    catalog: CATALOG,
    catalogExerciseId: 'bench-new',
    exerciseName: 'Bench Press',
    equipment,
    setType: 'working',
    setNumber: 1,
    sessionDate: '2026-10-28',
    userId: 'user-1',
    rows,
    ...extra,
  });
}

const barbell = row({ id: 'bb', snapshot_equipment: 'Barbell', actual_weight: '185', actual_reps: '5' });
const dumbbell = row({ id: 'db', snapshot_equipment: 'Dumbbell', actual_weight: '70', actual_reps: '8' });
const smith = row({ id: 'sm', snapshot_equipment: 'Smith Machine', actual_weight: '155', actual_reps: '6' });

const barbellNow = classify('Barbell', [barbell, dumbbell, smith]);
assert.equal(barbellNow.kind, 'exact');
assert.equal(loggerCopyLastEligible(barbellNow), true);
assert.equal(previousPerformanceLine(barbellNow)?.kind, 'exact');
assert.equal(previousPerformanceLine(barbellNow)?.text, 'Last: 185 × 5 · Barbell · Oct 21');
assert.equal(previousPerformanceLine(barbellNow)?.copyLast, true);
assert.equal(previousPerformanceFieldHint(barbellNow, 'actual_weight'), '185');
assert.equal(previousPerformanceFieldHint(barbellNow, 'actual_reps'), '5');

const dumbbellNow = classify('Dumbbell', [barbell, dumbbell, smith]);
assert.equal(dumbbellNow.kind, 'exact');
assert.equal(dumbbellNow.copyLastSource?.sourceId, 'db');
assert.equal(loggerCopyLastEligible(dumbbellNow), true);
assert.equal(previousPerformanceLine(dumbbellNow)?.text, 'Last: 70 × 8 · Dumbbell · Oct 21');

const smithNow = classify('Smith Machine', [barbell, dumbbell, smith]);
assert.equal(smithNow.copyLastSource?.sourceId, 'sm');
assert.equal(previousPerformanceLine(smithNow)?.text, 'Last: 155 × 6 · Smith Machine · Oct 21');

const onlyDumbbellWhileBarbell = classify('Barbell', [dumbbell]);
assert.equal(onlyDumbbellWhileBarbell.kind, 'different_equipment');
assert.equal(loggerCopyLastEligible(onlyDumbbellWhileBarbell), false);
assert.equal(previousPerformanceLine(onlyDumbbellWhileBarbell)?.kind, 'different_equipment');
assert.equal(previousPerformanceLine(onlyDumbbellWhileBarbell)?.text, 'Last on Dumbbell: 70 × 8 · Oct 21');
assert.equal(previousPerformanceFieldHint(onlyDumbbellWhileBarbell, 'actual_weight'), undefined);

const unknown = classify('Barbell', [row({ id: 'unk', snapshot_equipment: '', snapshot_provenance: null })]);
assert.equal(unknown.kind, 'unknown_equipment');
assert.equal(loggerCopyLastEligible(unknown), false);
assert.equal(previousPerformanceLine(unknown)?.kind, 'unknown_equipment');
assert.match(previousPerformanceLine(unknown)?.text || '', /equipment unknown/);
assert.equal(previousPerformanceFieldHint(unknown, 'actual_weight'), undefined);

const unverified = classify('Barbell', [
  row({ id: 'est', snapshot_provenance: { equipment: 'estimated', equipmentDetail: 'unspecified' } }),
]);
assert.equal(loggerCopyLastEligible(unverified), false);
assert.equal(previousPerformanceLine(unverified)?.kind, 'unknown_equipment');

const aliasSameEquip = classify('Barbell', [row({ id: 'alias', snapshot_catalog_exercise_id: 'bench-old' })]);
assert.equal(aliasSameEquip.comparable?.identityMatch, 'catalog');
assert.equal(loggerCopyLastEligible(aliasSameEquip), true);

const nameOnly = classifyPreviousPerformance({
  catalog: [],
  catalogExerciseId: '',
  exerciseName: 'Custom Lift',
  equipment: 'Barbell',
  setType: 'working',
  setNumber: 1,
  sessionDate: '2026-10-28',
  userId: 'user-1',
  rows: [row({ id: 'name', snapshot_catalog_exercise_id: '', snapshot_exercise_name: 'Custom Lift' })],
});
assert.equal(nameOnly.kind, 'exact');
assert.equal(nameOnly.comparable?.identityMatch, 'name');
assert.equal(nameOnly.copyLastEligible, true);
assert.equal(loggerCopyLastEligible(nameOnly), false);
assert.equal(previousPerformanceLine(nameOnly)?.kind, 'name_only');
assert.match(previousPerformanceLine(nameOnly)?.text || '', /Last by name/);
assert.equal(previousPerformanceFieldHint(nameOnly, 'actual_weight'), undefined);

const warmupHistory = classifyPreviousPerformance({
  catalog: CATALOG,
  catalogExerciseId: 'bench-new',
  exerciseName: 'Bench Press',
  equipment: 'Barbell',
  setType: 'working',
  setNumber: 1,
  sessionDate: '2026-10-28',
  rows: [row({ id: 'wu', snapshot_set_type: 'warmup', actual_weight: '95' })],
});
assert.equal(warmupHistory.kind, 'none');
assert.equal(previousPerformanceLine(warmupHistory), null);
assert.equal(loggerCopyLastEligible(warmupHistory), false);

const extras = extraSetLogPermissions();
assert.equal(extras.showCopyLast, false);
assert.equal(extras.showPrevious, false);

const extraHistory = classify('Barbell', [
  row({ id: 'extra', is_extra_set: true, set_origin: 'extra', snapshot_set_number: 1, actual_weight: '225' }),
]);
assert.equal(extraHistory.kind, 'none');
assert.equal(loggerCopyLastEligible(extraHistory), false);

assert.equal(loggerSelectedEquipment('Barbell', ''), 'Barbell');
assert.equal(loggerSelectedEquipment('Barbell', 'Dumbbell'), 'Dumbbell');
assert.equal(loggerSelectedEquipment('Barbell', 'Smith Machine'), 'Smith Machine');
assert.equal(loggerSelectedEquipment('Dumbbell', null), 'Dumbbell');
const pendingSwitch = classify(loggerSelectedEquipment('Barbell', 'Dumbbell'), [barbell, dumbbell, smith]);
assert.equal(pendingSwitch.copyLastSource?.sourceId, 'db');
assert.equal(previousPerformanceLine(pendingSwitch)?.text, 'Last: 70 × 8 · Dumbbell · Oct 21');
assert.equal(loggerCopyLastEligible(pendingSwitch), true, 'new equipment is eligible after persist; Copy last stays off while save is pending');

assert.equal(previousPerformanceLine(null), null);
assert.equal(previousPerformanceCopyLastAriaLabel(), 'Copy last verified workout values');

console.log('previous-performance logger tests passed');
