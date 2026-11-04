import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildExerciseProgress, exerciseProgressRequest, exerciseProgressTargetFromLogger, historyListLayout } from '../lib/progress/exerciseProgress';
import { displayedEquipmentProvenance } from '../lib/progress/provenance';
import { seriesIdentityFromParts, seriesKey } from '../lib/progress/identity';
import { comparableWindows, rangeBounds } from '../lib/progress/ranges';
import { chartReadout, chartValueDomain, seriesChartPoints } from '../lib/progress/seriesChart';
import type { ProgressSetFact } from '../lib/progress/setFacts';
import { buildSeriesWindows } from '../lib/progress/strengthSeries';
import { mondayOfWeek } from '../lib/training/programCalendar';
import { detectSetPersonalRecord, personalRecordTitle } from '../lib/training/progressAnalytics';
import { discoverLifts, filterLifts } from '../lib/progress/liftIndex';
import { estimateE1rm } from '../lib/training/estimated1Rm';
import { assembleTrainingHistory, historyPageBounds, historySetLabel, historyStatusLabel, setsForSession, summarizeSession, workoutHistoryDetail, workoutHistoryPage, workoutHistoryTitle, type HistorySession, type WorkoutHistoryRow } from '../lib/training/workoutHistory';

let seq = 0;

function fact(input: {
  date: string;
  equipment?: string | null;
  weight: number;
  reps: number;
  equipmentProvenance?: 'snapshotted' | 'backfilled' | 'estimated' | 'unknown';
  notes?: string;
  setNumber?: number | null;
  name?: string;
  catalog?: string;
  variant?: string | null;
}): ProgressSetFact {
  seq += 1;
  const identity = seriesIdentityFromParts({
    catalogExerciseId: input.catalog || 'bench',
    exerciseName: input.name || 'Bench Press',
    equipment: input.equipment,
    variant: input.variant,
  });
  const equipment = input.equipmentProvenance || (identity.equipmentKey === 'unspecified' ? 'unknown' : 'snapshotted');
  return {
    id: `set-${seq}`,
    logDate: input.date,
    completed: true,
    weight: input.weight,
    reps: input.reps,
    rpe: null,
    rir: null,
    setType: 'working',
    exerciseType: 'strength',
    identity,
    movementPattern: 'horizontal_push',
    muscleCredits: null,
    muscleGroupLabel: null,
    programRole: 'primary',
    provenance: {
      equipment,
      equipmentDetail: equipment === 'snapshotted' ? 'existing' : equipment === 'unknown' ? 'unspecified' : 'logged_name',
      movementPattern: 'snapshotted',
      muscleCredits: 'unknown',
      variant: 'unknown',
    },
    notes: input.notes || '',
    setNumber: input.setNumber ?? seq,
  };
}

const today = '2026-11-03';
const barbell = fact({ date: '2026-10-20', equipment: 'Barbell', weight: 185, reps: 5 });
const dumbbell = fact({ date: '2026-10-22', equipment: 'Dumbbell', weight: 50, reps: 8 });
const alias = fact({ date: '2026-10-27', equipment: 'DB', weight: 55, reps: 8 });
const smith = fact({ date: '2026-10-28', equipment: 'Smith Machine', weight: 135, reps: 5 });
const blank = fact({ date: '2026-10-29', equipment: '', weight: 95, reps: 5, equipmentProvenance: 'unknown' });

const barbellModel = buildExerciseProgress({
  facts: [barbell, dumbbell, alias, smith, blank],
  target: { catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: 'Barbell' },
  range: 'All',
  today,
});
assert.equal(barbellModel.chart.length, 1);
assert.ok(barbellModel.chart[0].value > 180);
assert.equal(barbellModel.identity.equipmentLabel, 'Barbell');

const dumbbellModel = buildExerciseProgress({
  facts: [barbell, dumbbell, alias, smith, blank],
  target: { catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: 'DB' },
  range: 'All',
  today,
});
assert.equal(dumbbellModel.chart.length, 2);
assert.ok(dumbbellModel.chart.every((point) => point.value < 100));
assert.equal(dumbbellModel.identity.equipmentKey, 'dumbbell');
assert.ok(dumbbellModel.equipmentOptions.some((item) => item.equipmentKey === 'unspecified'));
assert.ok(dumbbellModel.equipmentOptions.some((item) => item.equipmentKey === 'smith machine'));

const old = fact({ date: '2024-01-02', equipment: 'Barbell', weight: 315, reps: 1 });
const recent = fact({ date: '2026-10-20', equipment: 'Barbell', weight: 225, reps: 5 });
const period = buildExerciseProgress({
  facts: [old, recent],
  target: { catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: 'Barbell' },
  range: '4W',
  today,
});
assert.equal(period.allTimeLoad?.weight, 315);
assert.equal(period.allTimeLoad?.date, '2024-01-02');
assert.equal(period.periodBest?.date, '2026-10-20');
assert.notEqual(period.periodBest?.date, period.allTimeLoad?.date);
assert.ok((period.allTimeE1rm?.e1rm || 0) >= (period.periodBest?.e1rm || 0));

const confirmed = fact({ date: '2026-10-01', equipment: 'Barbell', weight: 185, reps: 5, equipmentProvenance: 'snapshotted' });
const unrecorded = fact({ date: '2026-10-08', equipment: 'Barbell', weight: 190, reps: 5, equipmentProvenance: 'unknown' });
const mixed = buildExerciseProgress({
  facts: [confirmed, unrecorded],
  target: { catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: 'Barbell' },
  range: 'All',
  today,
});
assert.equal(mixed.record, 'mixed');
assert.equal(displayedEquipmentProvenance(['snapshotted', 'unknown']), 'unknown');
assert.ok(!String(mixed.recordLabel || '').toLowerCase().includes('verified'));
assert.ok(!String(mixed.recordLabel || '').includes('snapshotted'));
const view = rangeBounds('All', today, '2026-10-01');
const windows = comparableWindows(view);
const series = buildSeriesWindows([confirmed, unrecorded], view, windows.baseline, windows.current, mondayOfWeek)[0];
assert.equal(series.equipmentRecord, 'mixed');
assert.notEqual(series.equipmentProvenance, 'snapshotted');

function log(input: { equipment: string; name?: string; weight?: string; reps?: string; date?: string }) {
  return {
    completed: true,
    log_date: input.date || '2026-11-03',
    snapshot_set_type: 'working',
    snapshot_exercise_type: 'strength',
    snapshot_exercise_name: input.name || 'Bench Press',
    snapshot_catalog_exercise_id: 'bench',
    snapshot_equipment: input.equipment,
    snapshot_provenance: { equipment: 'snapshotted', equipmentDetail: 'existing' },
    actual_weight: input.weight || '185',
    actual_reps: input.reps || '5',
  };
}

const first = detectSetPersonalRecord(log({ equipment: 'Barbell' }), [], 'lb');
assert.equal(first?.message, 'New Barbell Bench Press PR!');
assert.equal(personalRecordTitle('Barbell Bench Press', 'Barbell', 'barbell'), 'Barbell Bench Press');
const smithPr = detectSetPersonalRecord(log({ equipment: 'Smith Machine', weight: '135' }), [log({ equipment: 'Barbell', weight: '225', date: '2026-10-01' })], 'lb');
assert.equal(smithPr?.message, 'New Smith Machine Bench Press PR!');
const unnamed = detectSetPersonalRecord(log({ equipment: '' }), [], 'lb');
assert.equal(unnamed?.message, 'New Bench Press PR!');

const rows: WorkoutHistoryRow[] = [
  { id: 'a1', log_date: '2026-11-01', completed: true, snapshot_set_type: 'working', snapshot_set_number: 1, snapshot_exercise_name: 'Bench Press', snapshot_catalog_exercise_id: 'bench', snapshot_equipment: 'Barbell', snapshot_day_label: 'Push', snapshot_workout_type: 'Strength', actual_weight: '185.5', actual_reps: '5', log_notes: 'paused' },
  { id: 'a2', log_date: '2026-11-01', completed: true, snapshot_set_type: 'working', snapshot_set_number: 2, snapshot_exercise_name: 'Bench Press', snapshot_catalog_exercise_id: 'bench', snapshot_equipment: 'Barbell', snapshot_day_label: 'Push', snapshot_workout_type: 'Strength', actual_weight: '185', actual_reps: '5', log_notes: '' },
  { id: 'a3', log_date: '2026-11-01', completed: true, snapshot_set_type: 'warmup', snapshot_set_number: 1, snapshot_exercise_name: 'Bench Press', snapshot_catalog_exercise_id: 'bench', snapshot_equipment: 'Dumbbell', snapshot_day_label: 'Pull', snapshot_workout_type: 'Strength', actual_weight: '40', actual_reps: '10', log_notes: 'easy' },
];
const ambiguous = assembleTrainingHistory([], rows);
assert.equal(ambiguous.length, 1);
assert.equal(ambiguous[0].status, 'unknown');
assert.equal(ambiguous[0].workoutName, 'Recorded workout');
assert.equal(historyStatusLabel(ambiguous[0].status), 'Completion unknown');
const ambiguousDetail = workoutHistoryDetail(rows, ambiguous[0].id, ambiguous[0]);
assert.equal(ambiguousDetail?.exercises.length, 2);
assert.equal(ambiguousDetail?.exercises.find((exercise) => exercise.equipment === 'Barbell')?.sets[0].weight, '185.5');
assert.equal(ambiguousDetail?.exercises.find((exercise) => exercise.equipment === 'Barbell')?.sets[0].notes, 'paused');
assert.equal(ambiguousDetail?.exercises.find((exercise) => exercise.equipment === 'Dumbbell')?.sets[0].weight, '40');
const many = Array.from({ length: 11 }, (_, index) => ({ id: `w-${index}`, date: `2026-10-${String(index + 1).padStart(2, '0')}`, workoutName: 'Workout', exerciseCount: 1, workingSets: 1, status: 'completed' as const }));
const paged = workoutHistoryPage(many, 1, 10);
assert.equal(paged.items.length, 10);
assert.equal(paged.pageCount, 2);

const request = exerciseProgressRequest({
  catalogExerciseId: 'bench',
  exerciseName: 'Bench Press',
  equipment: 'Barbell',
  variant: null,
  returnTo: 'training',
  returnSection: 'training',
});
assert.equal(request.returnTo, 'training');
assert.equal(request.returnSection, 'training');
assert.equal(request.catalogExerciseId, 'bench');
assert.equal(request.equipment, 'Barbell');

assert.equal(historyListLayout(390), 'stacked');
assert.equal(historyListLayout(768), 'split');
assert.equal(historyListLayout(1440), 'split');

const tight = chartValueDomain([185, 190]);
assert.ok(tight.min > 0 && tight.min < 185);
assert.ok(tight.max > 190);
const wide = chartValueDomain([100, 180]);
assert.equal(wide.min, 0);

const lifts = discoverLifts([
  { snapshot_catalog_exercise_id: 'squat', snapshot_exercise_name: 'Back Squat', snapshot_equipment: 'Barbell', log_date: '2024-02-01' },
  { snapshot_catalog_exercise_id: 'bench', snapshot_exercise_name: 'Bench Press', snapshot_equipment: 'Dumbbell', log_date: '2026-08-01' },
  { snapshot_catalog_exercise_id: 'bench', snapshot_exercise_name: 'Bench Press', snapshot_equipment: 'DB', log_date: '2026-10-20' },
  { snapshot_catalog_exercise_id: 'bench', snapshot_exercise_name: 'Bench Press', snapshot_equipment: 'Barbell', log_date: '2026-11-01' },
]);
assert.equal(lifts.length, 3);
assert.equal(lifts[0].exerciseName, 'Bench Press');
assert.equal(lifts[0].equipmentLabel, 'Barbell');
assert.equal(lifts.find((lift) => lift.equipmentLabel === 'Dumbbell')?.lastPerformed, '2026-10-20');
assert.equal(lifts.find((lift) => lift.exerciseName === 'Back Squat')?.lastPerformed, '2024-02-01');
assert.deepEqual(filterLifts(lifts, 'dumbbell').map((lift) => lift.equipmentLabel), ['Dumbbell']);
assert.equal(filterLifts(lifts, 'squat').length, 1);
const rpcShape = discoverLifts([
  { catalog_exercise_id: 'row', exercise_name: 'Row', equipment: 'DB', last_performed: '2026-01-01' },
  { catalog_exercise_id: 'row', exercise_name: 'Row', equipment: 'Dumbbell', last_performed: '2026-02-01' },
  { catalog_exercise_id: 'row', exercise_name: 'Row', equipment: null, last_performed: '2026-03-01' },
]);
assert.equal(rpcShape.length, 2);
assert.equal(rpcShape.find((lift) => lift.equipmentLabel === 'Dumbbell')?.lastPerformed, '2026-02-01');
assert.equal(rpcShape.find((lift) => lift.equipmentLabel === 'Unspecified')?.equipment, '');

const firstPage = historyPageBounds(1, 10);
const secondPage = historyPageBounds(2, 10);
assert.equal(firstPage.from, 0);
assert.equal(firstPage.to, 9);
assert.equal(secondPage.from, 10);
assert.ok(secondPage.from > firstPage.to);

const sessions: HistorySession[] = [
  { id: 'session-push', date: '2026-11-03', workoutId: 'w-push', workoutName: 'Push', dayLabel: 'Push', workoutType: 'Strength', status: 'completed' },
  { id: 'session-pull', date: '2026-11-03', workoutId: 'w-pull', workoutName: 'Pull', dayLabel: 'Pull', workoutType: 'Strength', status: 'partial' },
  { id: 'session-skip', date: '2026-11-02', workoutId: 'w-skip', workoutName: 'Legs', dayLabel: 'Legs', workoutType: 'Strength', status: 'skipped' },
];
const historyRows: WorkoutHistoryRow[] = [
  { id: 'modern', log_date: '2026-11-03', completed: true, workout_id: 'w-push', snapshot_set_type: 'working', snapshot_exercise_name: 'Bench Press', snapshot_catalog_exercise_id: 'bench', snapshot_equipment: 'Barbell', actual_weight: '225', actual_reps: '5', log_notes: 'solid' },
  { id: 'both', log_date: '2026-11-03', completed: true, workout_id: 'w-pull', snapshot_set_type: 'working', snapshot_exercise_name: 'Row', snapshot_catalog_exercise_id: 'row', snapshot_equipment: 'Dumbbell', actual_weight: '40', actual_reps: '8', log_notes: 'strict' },
  { id: 'old-a', log_date: '2024-05-01', completed: true, workout_id: 'w-old-a', snapshot_set_type: 'working', snapshot_exercise_name: 'Back Squat', snapshot_catalog_exercise_id: 'squat', snapshot_equipment: 'Barbell', snapshot_day_label: 'Legs', snapshot_workout_type: 'Strength', actual_weight: '315', actual_reps: '3', log_notes: 'belt' },
  { id: 'old-b', log_date: '2024-05-01', completed: true, workout_id: 'w-old-b', snapshot_set_type: 'working', snapshot_exercise_name: 'Romanian Deadlift', snapshot_catalog_exercise_id: 'rdl', snapshot_equipment: 'Dumbbell', snapshot_day_label: 'Legs', snapshot_workout_type: 'Strength', actual_weight: '50', actual_reps: '8', log_notes: '' },
  { id: 'loose-push', log_date: '2023-01-04', completed: true, snapshot_set_type: 'working', snapshot_exercise_name: 'Bench Press', snapshot_catalog_exercise_id: 'bench', snapshot_equipment: 'Barbell', snapshot_day_label: 'Push', snapshot_workout_type: 'Strength', actual_weight: '135', actual_reps: '8', log_notes: 'old' },
  { id: 'loose-pull', log_date: '2023-01-04', completed: true, snapshot_set_type: 'working', snapshot_exercise_name: 'Row', snapshot_catalog_exercise_id: 'row', snapshot_equipment: 'DB', snapshot_day_label: 'Pull', snapshot_workout_type: 'Strength', actual_weight: '30', actual_reps: '10', log_notes: 'kept' },
];
const history = assembleTrainingHistory(sessions, historyRows);
assert.equal(history.filter((item) => item.date === '2026-11-03').length, 2);
assert.equal(history.filter((item) => item.workoutId === 'w-push').length, 1);
assert.equal(history.find((item) => item.id === 'session-push')?.status, 'completed');
assert.equal(history.find((item) => item.id === 'session-pull')?.status, 'partial');
assert.equal(history.find((item) => item.id === 'session-skip')?.status, 'skipped');
assert.equal(history.find((item) => item.id === 'session-skip')?.workingSets, 0);
const oldSquat = history.find((item) => item.workoutId === 'w-old-a');
const oldRdl = history.find((item) => item.workoutId === 'w-old-b');
assert.equal(oldSquat?.status, 'unknown');
assert.equal(oldRdl?.status, 'unknown');
assert.equal(oldSquat?.date, '2024-05-01');
assert.notEqual(oldSquat?.id, oldRdl?.id);
const loose = history.filter((item) => item.date === '2023-01-04');
assert.equal(loose.length, 1);
assert.equal(loose[0].status, 'unknown');
assert.equal(loose[0].workoutName, 'Recorded workout');
assert.equal(loose[0].exerciseCount, 2);
const squatDetail = workoutHistoryDetail(historyRows, oldSquat!.id, oldSquat);
assert.equal(squatDetail?.exercises.length, 1);
assert.equal(squatDetail?.exercises[0].equipment, 'Barbell');
assert.equal(squatDetail?.exercises[0].sets[0].weight, '315');
assert.equal(squatDetail?.exercises[0].sets[0].reps, '3');
assert.equal(squatDetail?.exercises[0].sets[0].notes, 'belt');
const looseDetail = workoutHistoryDetail(historyRows, loose[0].id, loose[0]);
assert.equal(looseDetail?.exercises.map((exercise) => exercise.equipment).sort().join(','), 'Barbell,Dumbbell');
assert.equal(looseDetail?.exercises.find((exercise) => exercise.equipment === 'Dumbbell')?.sets[0].notes, 'kept');
const pushSummary = summarizeSession(sessions[0], historyRows);
assert.equal(pushSummary.status, 'completed');
assert.deepEqual(setsForSession(historyRows, sessions[0]).map((row) => row.id), ['modern']);
assert.equal(historyStatusLabel('skipped'), 'Skipped');
const ordered = history.map((item) => item.id);
const pageOne = workoutHistoryPage(history, 1, 2);
const pageTwo = workoutHistoryPage(history, 2, 2);
assert.deepEqual(pageOne.items.map((item) => item.id), ordered.slice(0, 2));
assert.deepEqual(pageTwo.items.map((item) => item.id), ordered.slice(2, 4));
assert.equal(pageOne.items.some((item) => pageTwo.items.some((other) => other.id === item.id)), false);
assert.equal(history[0].date >= history[history.length - 1].date, true);

const overlapRows: WorkoutHistoryRow[] = [
  { id: 'linked', log_date: '2020-01-01', completed: true, workout_id: 'w', snapshot_set_type: 'working', snapshot_exercise_name: 'Bench Press', snapshot_catalog_exercise_id: 'bench', snapshot_equipment: 'Barbell', actual_weight: '185', actual_reps: '5', log_notes: 'session set' },
  { id: 'orphan', log_date: '2020-01-01', completed: true, snapshot_set_type: 'working', snapshot_exercise_name: 'Curl', snapshot_catalog_exercise_id: 'curl', snapshot_equipment: 'Dumbbell', snapshot_day_label: 'Push', snapshot_workout_type: 'Strength', actual_weight: '25', actual_reps: '12', log_notes: 'unlinked' },
];
const overlap = assembleTrainingHistory([
  { id: 's', date: '2020-01-01', workoutId: 'w', workoutName: 'Push', dayLabel: 'Push', workoutType: 'Strength', status: 'completed' },
], overlapRows);
assert.equal(overlap.length, 2);
assert.equal(overlap.find((item) => item.source === 'session')?.exerciseCount, 1);
assert.equal(overlap.find((item) => item.source === 'set_log')?.status, 'unknown');
assert.deepEqual(workoutHistoryDetail(overlapRows, 's', overlap[0].source === 'session' ? overlap[0] : overlap[1])?.exercises.map((exercise) => exercise.name), ['Bench Press']);
const orphanSummary = overlap.find((item) => item.source === 'set_log')!;
assert.equal(workoutHistoryDetail(overlapRows, orphanSummary.id, orphanSummary)?.exercises[0].sets[0].notes, 'unlinked');

const frontSquatTarget = exerciseProgressTargetFromLogger({
  catalogExerciseId: 'front-squat',
  exerciseName: 'Front Squat',
  equipment: '',
  pendingEquipment: '',
  laterality: 'bilateral',
});
assert.equal(frontSquatTarget.equipment, null);
assert.equal(frontSquatTarget.variant, null);
const frontSquat = buildExerciseProgress({
  facts: [
    fact({ date: '2026-07-04', name: 'Front Squat', catalog: 'front-squat', equipment: '', weight: 155, reps: 6 }),
    fact({ date: '2026-11-03', name: 'Front Squat', catalog: 'front-squat', equipment: 'Barbell', weight: 135, reps: 6 }),
    fact({ date: '2026-10-23', name: 'Front Squat', catalog: 'front-squat', equipment: 'Barbell', variant: 'unilateral', weight: 40, reps: 8 }),
  ],
  target: frontSquatTarget,
  range: 'All',
  today: '2026-11-03',
});
assert.equal(frontSquat.identity.equipmentLabel, 'Unspecified');
assert.equal(frontSquat.identity.variant, null);
assert.equal(frontSquat.allTimeLoad?.weight, 155);
assert.equal(frontSquat.equipmentOptions.some((option) => option.equipmentLabel === 'Barbell' && !option.variant), true);
assert.equal(frontSquat.equipmentOptions.some((option) => option.variant === 'unilateral'), true);
assert.equal(seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'front-squat', exerciseName: 'Front Squat', equipment: '', variant: 'bilateral' })), seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'front-squat', exerciseName: 'Front Squat', equipment: '', variant: null })));
assert.notEqual(seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'front-squat', exerciseName: 'Front Squat', equipment: 'Barbell', variant: 'unilateral' })), seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'front-squat', exerciseName: 'Front Squat', equipment: 'Barbell', variant: 'bilateral' })));
const selectedBarbell = exerciseProgressTargetFromLogger({
  catalogExerciseId: 'front-squat',
  exerciseName: 'Front Squat',
  equipment: '',
  pendingEquipment: 'Barbell',
  laterality: 'bilateral',
});
const barbellSquat = buildExerciseProgress({
  facts: frontSquatFacts(),
  target: selectedBarbell,
  range: 'All',
  today: '2026-11-03',
});
assert.equal(barbellSquat.identity.equipmentLabel, 'Barbell');
assert.equal(barbellSquat.allTimeLoad?.weight, 135);
assert.equal(barbellSquat.identity.variant, null);

function frontSquatFacts(): ProgressSetFact[] {
  return [
    fact({ date: '2026-07-04', name: 'Front Squat', catalog: 'front-squat', equipment: '', weight: 155, reps: 6 }),
    fact({ date: '2026-11-03', name: 'Front Squat', catalog: 'front-squat', equipment: 'Barbell', weight: 135, reps: 6 }),
    fact({ date: '2026-10-23', name: 'Front Squat', catalog: 'front-squat', equipment: 'Barbell', variant: 'unilateral', weight: 40, reps: 8 }),
  ];
}

const inclineDay = [
  fact({ date: '2026-11-02', name: 'Incline Press', catalog: 'incline', equipment: 'Dumbbell', weight: 60, reps: 6 }),
  fact({ date: '2026-11-02', name: 'Incline Press', catalog: 'incline', equipment: 'Dumbbell', weight: 55, reps: 8 }),
];
const inclinePoints = seriesChartPoints(inclineDay, 'e1rm');
const inclineReadout = chartReadout(inclinePoints);
assert.equal(inclinePoints.length, 1);
assert.equal(inclinePoints[0].value, estimateE1rm({ weight: 60, reps: 6, setType: 'working' }));
assert.equal(inclineReadout.showScale, false);
assert.deepEqual(inclineReadout.dates, ['2026-11-02']);
assert.equal(inclineReadout.pointValues[0], 72);
const inclineProgress = buildExerciseProgress({
  facts: inclineDay,
  target: { catalogExerciseId: 'incline', exerciseName: 'Incline Press', equipment: 'Dumbbell', variant: null },
  range: '4W',
  today: '2026-11-03',
});
assert.equal(inclineProgress.changePercent, null);
assert.equal(inclineProgress.allTimeE1rm?.e1rm, 72);
assert.equal(inclineProgress.chart.length, 1);
assert.equal(inclineProgress.chart[0].value, 72);
const twoDays = seriesChartPoints([
  fact({ date: '2026-10-12', name: 'Incline Press', catalog: 'incline', equipment: 'Dumbbell', weight: 50, reps: 8 }),
  fact({ date: '2026-10-28', name: 'Incline Press', catalog: 'incline', equipment: 'Dumbbell', weight: 60, reps: 6 }),
], 'e1rm');
const twoReadout = chartReadout(twoDays);
const twoDomain = chartValueDomain(twoReadout.pointValues);
assert.equal(twoReadout.showScale, true);
assert.equal(twoReadout.dates.length, 2);
assert.equal(twoReadout.pointValues[1], 72);
assert.notEqual(twoDomain.min, twoReadout.pointValues[0]);
assert.notEqual(twoDomain.max, twoReadout.pointValues[1]);

assert.equal(workoutHistoryTitle({ linkedDay: 'Tue', linkedType: 'Lower A - Front Squat Focus', linkedName: 'Workout' }), 'Lower A - Front Squat Focus');
assert.equal(workoutHistoryTitle({ linkedDay: 'Tue', linkedType: 'Strength', linkedName: 'Workout' }), 'Tue · Strength');
assert.equal(workoutHistoryTitle({ persistedType: 'Upper A - Bench and Row', persistedDay: 'Mon' }), 'Upper A - Bench and Row');
assert.equal(workoutHistoryTitle({}), 'Workout');
const namedSession = summarizeSession(
  { id: 'lower-a', date: '2026-11-03', workoutId: 'lower-a', workoutName: 'Workout', dayLabel: 'Tue', workoutType: 'Lower A - Front Squat Focus', status: 'partial' },
  [{ id: 'sq', log_date: '2026-11-03', completed: true, workout_id: 'lower-a', snapshot_set_type: 'working', snapshot_exercise_name: 'Front Squat', snapshot_equipment: 'Barbell', snapshot_day_label: 'Tue', snapshot_workout_type: 'Lower A - Front Squat Focus', actual_weight: '135', actual_reps: '6', log_notes: 'side: left' }]
);
assert.equal(namedSession.workoutName, 'Lower A - Front Squat Focus');
const sameDay = assembleTrainingHistory(
  [
    { id: 'a', date: '2026-11-03', workoutId: 'lower-a', workoutName: 'Workout', dayLabel: 'Tue', workoutType: 'Lower A - Front Squat Focus', status: 'partial' },
    { id: 'b', date: '2026-11-03', workoutId: 'upper-b', workoutName: 'Workout', dayLabel: 'Tue', workoutType: 'Upper B - Incline Press and Pull-Up', status: 'completed' },
  ],
  []
);
assert.equal(sameDay.length, 2);
assert.notEqual(sameDay[0].workoutName, sameDay[1].workoutName);
const left = historySetLabel({ setType: 'working', setNumber: 1, notes: 'side: left' });
const right = historySetLabel({ setType: 'working', setNumber: 1, notes: 'belt · side: right' });
const plain = historySetLabel({ setType: 'working', setNumber: 1, notes: 'paused' });
assert.equal(left.label, 'Left · Working set 1');
assert.equal(left.notes, '');
assert.equal(right.label, 'Right · Working set 1');
assert.equal(right.notes, 'belt');
assert.equal(plain.label, 'Working set 1');
assert.equal(plain.notes, 'paused');

const progressQueries = readFileSync('lib/progress/queries.ts', 'utf8');
assert.match(progressQueries, /st_workouts\(day_label,workout_type\)/);
assert.doesNotMatch(progressQueries, /st_workouts\(name/);
assert.equal(existsSync('app/apple-icon.tsx'), false);
assert.equal(existsSync('app/icon.tsx'), false);
assert.equal(existsSync('app/apple-icon/route.ts'), true);
assert.equal(existsSync('app/icon/route.ts'), true);

const liftIndexSql = readFileSync('supabase/migrations/20261103_078_progress_history_summaries.sql', 'utf8');
assert.match(liftIndexSql, /security invoker/i);
assert.doesNotMatch(liftIndexSql, /security definer/i);
assert.match(liftIndexSql, /user_id = auth\.uid\(\)/);
assert.match(liftIndexSql, /revoke all on function public\.st_lift_index\(\) from public, anon/i);
assert.match(liftIndexSql, /grant execute on function public\.st_lift_index\(\) to authenticated/i);
assert.match(liftIndexSql, /order by max\(log_date\) desc, 2, 1, 3, 4/);
assert.doesNotMatch(liftIndexSql, /p_user_id/);
assert.doesNotMatch(liftIndexSql, /update public\.st_set_logs/i);

console.log('exercise progress checks passed');
