/**
 * BIQ-0271 Phase E2.3: equipment-aware exercise History labels and filter.
 * Run: npx tsx scripts/test-exercise-history-display.ts
 */
import assert from 'node:assert/strict';
import { buildExerciseSessionHistory, historyEquipmentFromSnapshot } from '../lib/training/exerciseSessionHistory';
import {
  filterExerciseHistorySessions,
  historyEmptyMessage,
  historySetEquipmentKind,
  historySetEquipmentText,
  historySetTypeLabel,
} from '../lib/training/exerciseHistoryDisplay';
import { loggerCopyLastEligible } from '../lib/training/previousPerformanceDisplay';
import { classifyPreviousPerformance } from '../lib/training/previousPerformance';

const SNAPSHOTTED = {
  equipment: 'snapshotted',
  equipmentDetail: 'existing',
  movementPattern: 'snapshotted',
  muscleCredits: 'snapshotted',
  variant: 'snapshotted',
};

function row(partial: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    log_date: '2026-10-21',
    actual_weight: '185',
    actual_reps: '5',
    completed: true,
    snapshot_set_type: 'working',
    snapshot_set_number: 1,
    snapshot_equipment: 'Barbell',
    snapshot_provenance: { ...SNAPSHOTTED },
    snapshot_day_label: 'Wed',
    snapshot_week: 2,
    ...partial,
  };
}

const barbell = row({ id: 'bb', snapshot_equipment: 'Barbell' });
const dumbbell = row({ id: 'db', snapshot_equipment: 'Dumbbell', actual_weight: '70', actual_reps: '8', snapshot_set_number: 2 });
const smith = row({ id: 'sm', snapshot_equipment: 'Smith Machine', actual_weight: '155', actual_reps: '6', log_date: '2026-10-14' });
const unknown = row({
  id: 'unk',
  snapshot_equipment: '',
  snapshot_provenance: { equipment: 'unknown' },
  actual_weight: '135',
  log_date: '2026-10-07',
});
const unverified = row({
  id: 'est',
  snapshot_equipment: 'Barbell',
  snapshot_provenance: { equipment: 'estimated' },
  log_date: '2026-10-07',
  snapshot_set_number: 2,
});
const extra = row({
  id: 'extra',
  is_extra_set: true,
  set_origin: 'extra',
  extra_set_number: 1,
  snapshot_set_number: 1,
  actual_weight: '225',
});
const warmup = row({ id: 'wu', snapshot_set_type: 'warmup', snapshot_set_number: 1, actual_weight: '95' });
const ramp = row({ id: 'ramp', snapshot_set_type: 'ramp', snapshot_set_number: 1, actual_weight: '135' });
const backoff = row({ id: 'bo', snapshot_set_type: 'backoff', snapshot_set_number: 1, actual_weight: '155' });

assert.equal(historyEquipmentFromSnapshot(barbell).equipmentVerified, true);
assert.equal(historyEquipmentFromSnapshot(barbell).equipmentLabel, 'Barbell');
assert.equal(historyEquipmentFromSnapshot(unknown).equipmentVerified, false);
assert.equal(historyEquipmentFromSnapshot(unknown).equipmentLabel, 'Unknown');
assert.equal(historyEquipmentFromSnapshot(unverified).equipmentLabel, 'Unknown');
assert.equal(
  historyEquipmentFromSnapshot({
    snapshot_equipment: 'Dumbbell',
    snapshot_provenance: { ...SNAPSHOTTED },
    currentEquipment: 'Barbell',
  }).equipmentLabel,
  'Dumbbell'
);

assert.equal(historySetTypeLabel({ setType: 'working', setNumber: 1 }), 'WK 1');
assert.equal(historySetTypeLabel({ setType: 'warmup', setNumber: 2 }), 'WU 2');
assert.equal(historySetTypeLabel({ setType: 'ramp', setNumber: 1 }), 'Ramp 1');
assert.equal(historySetTypeLabel({ setType: 'backoff', setNumber: 1 }), 'Backoff 1');
assert.equal(historySetTypeLabel({ setType: 'working', setNumber: 1, extra: true }), 'Extra WK 1');

const mixed = buildExerciseSessionHistory([barbell, dumbbell, extra, warmup], 'strength', { matchDayLabel: false });
assert.ok(mixed.length >= 1);
const mixedSets = mixed[0].sets;
assert.equal(mixedSets.find((s) => s.equipmentKey === 'barbell' && !s.extra)?.equipmentVerified, true);
assert.equal(mixedSets.find((s) => s.equipmentKey === 'dumbbell')?.equipmentLabel, 'Dumbbell');
assert.equal(mixedSets.find((s) => s.extra)?.extra, true);

const originalMixedSetCount = mixed[0].sets.length;
const originalMixedSummary = mixed[0].sessionSummary;
const hiddenDumbbellSummary = mixed[0].sets.find((set) => set.equipmentKey === 'dumbbell')?.summary || '';
assert.ok(hiddenDumbbellSummary);
assert.match(originalMixedSummary, /4×/);

const currentOnly = filterExerciseHistorySessions(mixed, { mode: 'current', currentEquipment: 'Barbell' });
assert.ok(currentOnly.every((session) => session.sets.every((set) => set.equipmentKey === 'barbell' && set.equipmentVerified)));
assert.ok(!currentOnly.some((session) => session.sets.some((set) => set.equipmentKey === 'dumbbell')));
assert.ok(!currentOnly[0].sessionSummary.includes(hiddenDumbbellSummary));
assert.ok(!currentOnly[0].sessionSummary.includes('70'));
assert.ok(!currentOnly[0].sessionSummary.includes('4×'));
assert.equal(currentOnly[0].sets.length, 3);
assert.equal(mixed[0].sets.length, originalMixedSetCount);
assert.equal(mixed[0].sessionSummary, originalMixedSummary);
assert.ok(mixed[0].sets.some((set) => set.equipmentKey === 'dumbbell'));

const all = filterExerciseHistorySessions(mixed, { mode: 'all', currentEquipment: 'Barbell' });
assert.ok(all[0].sets.some((set) => set.equipmentKey === 'dumbbell'));
assert.ok(all[0].sessionSummary.includes(hiddenDumbbellSummary));
assert.equal(mixed[0].sessionSummary, originalMixedSummary);

const noCurrent = filterExerciseHistorySessions(
  buildExerciseSessionHistory([dumbbell, unknown], 'strength', { matchDayLabel: false }),
  { mode: 'current', currentEquipment: 'Barbell' }
);
assert.equal(noCurrent.length, 0);
assert.match(historyEmptyMessage({ mode: 'current', currentEquipment: 'Barbell', allCount: 1 }), /All equipment/);

const aliasRow = row({ snapshot_catalog_exercise_id: 'bench-old', snapshot_exercise_name: 'Bench Press' });
const aliasSessions = buildExerciseSessionHistory([aliasRow], 'strength', { matchDayLabel: false });
assert.equal(historySetEquipmentKind(aliasSessions[0].sets[0], 'Barbell'), 'verified');

const smithSessions = buildExerciseSessionHistory([smith], 'strength', { matchDayLabel: false });
assert.equal(historySetEquipmentKind(smithSessions[0].sets[0], 'Barbell'), 'different');
assert.equal(historySetEquipmentText(smithSessions[0].sets[0]), 'Smith Machine');
assert.equal(filterExerciseHistorySessions(smithSessions, { mode: 'current', currentEquipment: 'Barbell' }).length, 0);

const unknownSessions = buildExerciseSessionHistory([unknown], 'strength', { matchDayLabel: false });
assert.equal(historySetEquipmentKind(unknownSessions[0].sets[0], 'Barbell'), 'unknown');
assert.equal(historySetEquipmentText(unknownSessions[0].sets[0]), 'Unknown');
assert.equal(filterExerciseHistorySessions(unknownSessions, { mode: 'current', currentEquipment: 'Barbell' }).length, 0);
assert.equal(filterExerciseHistorySessions(unknownSessions, { mode: 'all', currentEquipment: 'Barbell' }).length, 1);

const unverifiedSessions = buildExerciseSessionHistory([unverified], 'strength', { matchDayLabel: false });
assert.equal(filterExerciseHistorySessions(unverifiedSessions, { mode: 'current', currentEquipment: 'Barbell' }).length, 0);
assert.equal(filterExerciseHistorySessions(unverifiedSessions, { mode: 'all', currentEquipment: 'Barbell' }).length, 1);
assert.equal(historySetEquipmentText(unverifiedSessions[0].sets[0]), 'Unknown');

const dates = buildExerciseSessionHistory([barbell, smith], 'strength', { matchDayLabel: false });
assert.ok(dates[0].date >= dates[dates.length - 1].date);

const typeSessions = buildExerciseSessionHistory([warmup, barbell, ramp, backoff], 'strength', { matchDayLabel: false });
const labels = typeSessions[0].sets.map((set) => historySetTypeLabel(set));
assert.ok(labels.includes('WU 1'));
assert.ok(labels.includes('WK 1'));
assert.ok(labels.includes('Ramp 1'));
assert.ok(labels.includes('Backoff 1'));

const loggerStillExact = classifyPreviousPerformance({
  catalog: [{ id: 'bench-new', name: 'Bench Press' }],
  catalogExerciseId: 'bench-new',
  exerciseName: 'Bench Press',
  equipment: 'Barbell',
  setType: 'working',
  setNumber: 1,
  sessionDate: '2026-10-28',
  rows: [{ ...barbell, snapshot_catalog_exercise_id: 'bench-new', snapshot_exercise_name: 'Bench Press' }],
});
assert.equal(loggerCopyLastEligible(loggerStillExact), true);

console.log('exercise-history display tests passed');
