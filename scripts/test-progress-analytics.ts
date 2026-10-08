/**
 * Progress analytics foundation. No database.
 * Run: npx tsx scripts/test-progress-analytics.ts
 */
import assert from 'node:assert/strict';
import { hasAnyBodyMeasurement, type BodyMeasurementRow } from '../lib/body/measurements';
import { inferSnapshotEquipment } from '../lib/progress/equipmentBackfill';
import { seriesKey } from '../lib/progress/identity';
import { muscleVolumeReport } from '../lib/progress/muscleVolume';
import { nutritionDaysFromEntries, nutritionReport } from '../lib/progress/nutrition';
import { bodyTrends } from '../lib/progress/bodyTrends';
import { progressAdherence } from '../lib/progress/adherence';
import { buildProgressReport } from '../lib/progress/report';
import { comparableWindows, rangeBounds } from '../lib/progress/ranges';
import type { ProgressSetFact } from '../lib/progress/setFacts';
import { columnsWithoutMissing } from '../lib/progress/queries';
import { seriesChartPoints } from '../lib/progress/seriesChart';
import { overviewInsights } from '../lib/progress/comparison';
import { headlineRecords, overviewCards, overviewSummary } from '../lib/progress/progressView';
import { buildSeriesWindows, seriesPersonalRecords } from '../lib/progress/strengthSeries';
import { buildStrengthIndex, selectRepresentativeSeries, type RepresentativeCandidate } from '../lib/progress/strengthIndex';
import { seriesIdentityFromParts } from '../lib/progress/identity';
import { SCIENCE_RULES_V1 } from '../lib/scienceEngine/rules';
import { contributionsForExercise } from '../lib/scienceEngine/contributions';
import { estimateE1rm } from '../lib/training/estimated1Rm';
import { exerciseKeyFromLog } from '../lib/training/progressAnalytics';
import { snapshotForLog, withoutSnapshotIdentity } from '../lib/training/setLogSnapshots';
import { extraSetInsertPayload, type ExtraSetLog } from '../lib/training/extraSets';
import { mondayOfWeek } from '../lib/training/programCalendar';

let seq = 0;

function fact(input: {
  date: string;
  catalogExerciseId?: string | null;
  exerciseName?: string;
  equipment?: string | null;
  variant?: string | null;
  weight?: number | null;
  reps?: number | null;
  setType?: string;
  exerciseType?: string;
  movementPattern?: string | null;
  programRole?: string | null;
  muscleCredits?: { muscle: string; contribution: number }[] | null;
  creditProvenance?: 'snapshotted' | 'estimated' | 'unknown';
  equipmentProvenance?: 'snapshotted' | 'backfilled' | 'estimated' | 'unknown';
  patternProvenance?: 'snapshotted' | 'estimated' | 'unknown';
  rpe?: number | null;
  rir?: number | null;
  completed?: boolean;
}): ProgressSetFact {
  seq += 1;
  const identity = seriesIdentityFromParts({
    catalogExerciseId: input.catalogExerciseId === undefined ? 'bench' : input.catalogExerciseId,
    exerciseName: input.exerciseName || 'Bench Press',
    equipment: input.equipment === undefined ? 'Barbell' : input.equipment,
    variant: input.variant,
  });
  return {
    id: `set-${seq}`,
    logDate: input.date,
    completed: input.completed !== false,
    weight: input.weight === undefined ? 200 : input.weight,
    reps: input.reps === undefined ? 5 : input.reps,
    rpe: input.rpe ?? null,
    rir: input.rir ?? null,
    setType: input.setType || 'working',
    exerciseType: input.exerciseType || 'strength',
    identity,
    movementPattern: input.movementPattern === undefined ? 'horizontal_push' : input.movementPattern,
    muscleCredits: input.muscleCredits === undefined ? null : input.muscleCredits,
    muscleGroupLabel: null,
    programRole: input.programRole === undefined ? 'primary' : input.programRole,
    provenance: {
      equipment: input.equipmentProvenance || (identity.equipmentKey === 'unspecified' ? 'unknown' : 'snapshotted'),
      equipmentDetail: identity.equipmentKey === 'unspecified' ? 'unspecified' : 'existing',
      movementPattern: input.patternProvenance || (input.movementPattern ? 'snapshotted' : 'unknown'),
      muscleCredits: input.creditProvenance || (input.muscleCredits ? 'snapshotted' : 'unknown'),
      variant: input.variant ? 'snapshotted' : 'unknown',
    },
  };
}

function dates(start: string, count: number, step = 7): string[] {
  const out: string[] = [];
  let cursor = start;
  for (let i = 0; i < count; i += 1) {
    out.push(cursor);
    const [year, month, day] = cursor.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + step);
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    cursor = `${date.getFullYear()}-${m}-${d}`;
  }
  return out;
}

const view = { from: '2026-07-01', to: '2026-10-08' };
const windows = comparableWindows(view);

assert.equal(SCIENCE_RULES_V1.primaryContribution, 1);
assert.equal(SCIENCE_RULES_V1.secondaryContribution, 0.5);
assert.equal(SCIENCE_RULES_V1.minorContribution, 0.25);

assert.equal(estimateE1rm({ weight: 205, reps: 5, setType: 'working', exerciseType: 'strength' }), 205 * (1 + 5 / 30));
assert.equal(estimateE1rm({ weight: 205, reps: 11, setType: 'working', exerciseType: 'strength' }), null);
assert.equal(estimateE1rm({ weight: 205, reps: 5, setType: 'warmup', exerciseType: 'strength' }), null);
assert.equal(estimateE1rm({ weight: 205, reps: 5, setType: 'ramp', exerciseType: 'strength' }), null);
assert.equal(estimateE1rm({ weight: 0, reps: 5, setType: 'working', exerciseType: 'strength' }), null);
assert.equal(estimateE1rm({ weight: null, reps: 8, setType: 'working', exerciseType: 'bodyweight' }), null);
assert.equal(estimateE1rm({ weight: 25, reps: 5, setType: 'working', exerciseType: 'bodyweight' }), 25 * (1 + 5 / 30));
assert.equal(estimateE1rm({ weight: 100, reps: 5, setType: 'working', exerciseType: 'cardio' }), null);
assert.equal(estimateE1rm({ weight: 100, reps: 5, setType: 'working', exerciseType: 'timed' }), null);

const barbell = [
  ...dates('2026-07-06', 4).map((date) => fact({ date, equipment: 'Barbell', weight: 205, reps: 5 })),
  ...dates('2026-09-14', 4).map((date) => fact({ date, equipment: 'Barbell', weight: 205, reps: 5 })),
];
const smith = [fact({ date: '2026-10-06', equipment: 'Smith Machine', weight: 225, reps: 5 })];
const series = buildSeriesWindows([...barbell, ...smith], view, windows.baseline, windows.current, mondayOfWeek);
const barbellSeries = series.find((item) => item.identity.equipmentKey === 'barbell');
const smithSeries = series.find((item) => item.identity.equipmentKey === 'smith machine');
assert.ok(barbellSeries && smithSeries);
assert.notEqual(barbellSeries.key, smithSeries.key);
assert.notEqual(barbellSeries.currentE1rm, smithSeries.currentE1rm);
assert.ok((barbellSeries.currentE1rm || 0) < 240);
assert.ok((smithSeries.currentE1rm || 0) > 260);
assert.equal(smithSeries.percentChange, null);

const switched = buildSeriesWindows(
  [
    fact({ date: '2026-07-06', equipment: 'Barbell', weight: 205, reps: 5 }),
    fact({ date: '2026-10-06', equipment: 'Smith Machine', weight: 225, reps: 5 }),
  ],
  view,
  windows.baseline,
  windows.current,
  mondayOfWeek
);
assert.equal(switched.every((item) => item.percentChange == null), true);

const records = seriesPersonalRecords([...barbell, ...smith]);
const loadRecords = records.filter((record) => record.kind === 'load');
assert.equal(loadRecords.length, 2);
assert.equal(loadRecords.find((record) => record.key === barbellSeries.key)?.weight, 205);
assert.equal(loadRecords.find((record) => record.key === smithSeries.key)?.weight, 225);

assert.notEqual(
  exerciseKeyFromLog({ snapshot_catalog_exercise_id: 'bench', snapshot_exercise_name: 'Bench Press', snapshot_equipment: 'Barbell' }),
  exerciseKeyFromLog({ snapshot_catalog_exercise_id: 'bench', snapshot_exercise_name: 'Bench Press', snapshot_equipment: 'Smith Machine' })
);
assert.notEqual(
  seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: 'Barbell' })),
  seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: null }))
);

const benchDates = { baseline: dates('2026-07-06', 4), current: dates('2026-09-14', 4) };
const flyDates = { baseline: dates('2026-07-07', 2), current: dates('2026-09-15', 2) };
const representativeFacts: ProgressSetFact[] = [];
benchDates.baseline.concat(benchDates.current).forEach((date) => {
  representativeFacts.push(fact({ date, equipment: 'Barbell', weight: 200, reps: 1, programRole: 'primary' }));
});
flyDates.baseline.concat(flyDates.current).forEach((date) => {
  for (let set = 0; set < 15; set += 1) {
    representativeFacts.push(
      fact({
        date,
        catalogExerciseId: 'fly',
        exerciseName: 'Cable Fly',
        equipment: 'Cable',
        weight: 40,
        reps: 10,
        programRole: 'accessory',
      })
    );
  }
});
const ranked = buildStrengthIndex(buildSeriesWindows(representativeFacts, view, windows.baseline, windows.current, mondayOfWeek));
const push = ranked.patterns.find((pattern) => pattern.patternId === 'horizontal_push');
assert.equal(push?.representative?.identity.equipmentKey, 'barbell');
assert.ok((push?.representative?.workingSetCount || 0) < 20);
assert.ok((push?.secondary[0]?.workingSetCount || 0) > 40);

const smithHeavy = [
  ...dates('2026-07-06', 6).map((date) => fact({ date, equipment: 'Smith Machine', weight: 200, reps: 1 })),
  ...dates('2026-09-14', 6).map((date) => fact({ date, equipment: 'Smith Machine', weight: 210, reps: 1 })),
  ...dates('2026-07-08', 2).map((date) => fact({ date, equipment: 'Barbell', weight: 180, reps: 1 })),
  ...dates('2026-09-16', 2).map((date) => fact({ date, equipment: 'Barbell', weight: 220, reps: 1 })),
];
const smithPreferred = buildStrengthIndex(buildSeriesWindows(smithHeavy, view, windows.baseline, windows.current, mondayOfWeek));
assert.equal(smithPreferred.patterns.find((pattern) => pattern.patternId === 'horizontal_push')?.representative?.identity.equipmentKey, 'smith machine');

const smithOnly = buildStrengthIndex(
  buildSeriesWindows(
    [
      ...dates('2026-07-06', 4).map((date) => fact({ date, equipment: 'Smith Machine', weight: 200, reps: 1 })),
      ...dates('2026-09-14', 4).map((date) => fact({ date, equipment: 'Smith Machine', weight: 210, reps: 1 })),
    ],
    view,
    windows.baseline,
    windows.current,
    mondayOfWeek
  )
);
assert.equal(smithOnly.patterns.find((pattern) => pattern.patternId === 'horizontal_push')?.representative?.identity.equipmentKey, 'smith machine');

const unspecified = fact({ date: '2026-10-06', equipment: null, weight: 300, reps: 1, equipmentProvenance: 'unknown' });
const withKnown = buildSeriesWindows(
  [
    ...dates('2026-07-06', 3).map((date) => fact({ date, weight: 200, reps: 1 })),
    ...dates('2026-09-14', 3).map((date) => fact({ date, weight: 210, reps: 1 })),
    fact({ date: '2026-07-06', equipment: null, weight: 300, reps: 1 }),
    fact({ date: '2026-09-14', equipment: null, weight: 320, reps: 1 }),
  ],
  view,
  windows.baseline,
  windows.current,
  mondayOfWeek
);
const unspecifiedIndex = buildStrengthIndex(withKnown);
assert.equal(unspecifiedIndex.patterns.find((pattern) => pattern.patternId === 'horizontal_push')?.representative?.identity.equipmentKey, 'barbell');
assert.equal(withKnown.some((item) => item.identity.equipmentKey === 'unspecified'), true);
assert.notEqual(unspecified.identity.equipmentKey, 'barbell');

function candidate(partial: Partial<RepresentativeCandidate> & Pick<RepresentativeCandidate, 'key' | 'workingSetCount' | 'compound' | 'baselineSessions' | 'currentSessions'>): RepresentativeCandidate {
  return {
    identity: seriesIdentityFromParts({ catalogExerciseId: partial.key, exerciseName: partial.key, equipment: 'Barbell' }),
    label: partial.key,
    baselineE1rm: 200,
    currentE1rm: 210,
    percentChange: 5,
    baselineQualifyingSets: 1,
    currentQualifyingSets: 1,
    distinctWeeks: 4,
    programRole: partial.compound ? 'primary' : 'accessory',
    movementPattern: 'horizontal_push',
    equipmentProvenance: 'snapshotted',
    patternProvenance: 'snapshotted',
    bestSet: null,
    lastSet: null,
    viewVolume: 0,
    patternId: 'horizontal_push',
    confidence: 'high',
    ...partial,
  };
}
const picked = selectRepresentativeSeries({
  patternId: 'horizontal_push',
  candidates: [
    candidate({ key: 'high-sets', workingSetCount: 40, compound: false, baselineSessions: 2, currentSessions: 2 }),
    candidate({ key: 'steady-compound', workingSetCount: 6, compound: true, baselineSessions: 4, currentSessions: 4 }),
  ],
});
assert.equal(picked.representative?.key, 'steady-compound');

const twoPatternFacts = [
  ...dates('2026-07-06', 3).map((date) => fact({ date, weight: 200, reps: 1, movementPattern: 'horizontal_push' })),
  ...dates('2026-09-14', 3).map((date) => fact({ date, weight: 212, reps: 1, movementPattern: 'horizontal_push' })),
  ...dates('2026-07-07', 3).map((date) =>
    fact({ date, catalogExerciseId: 'row', exerciseName: 'Row', equipment: 'Barbell', weight: 150, reps: 1, movementPattern: 'horizontal_pull' })
  ),
  ...dates('2026-09-15', 3).map((date) =>
    fact({ date, catalogExerciseId: 'row', exerciseName: 'Row', equipment: 'Barbell', weight: 160, reps: 1, movementPattern: 'horizontal_pull' })
  ),
];
const trend = buildStrengthIndex(buildSeriesWindows(twoPatternFacts, view, windows.baseline, windows.current, mondayOfWeek));
assert.equal(trend.label, 'trend');
assert.equal(trend.patternsCovered, 2);
assert.match(trend.headline || '', /^Strength Trend /);
assert.equal(trend.coverageLine, 'Based on 2 movement patterns');
assert.equal(trend.patterns.filter((pattern) => !pattern.includedInIndex && pattern.percentChange == null).length >= 4, true);

const patternIds = ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'squat', 'hinge'] as const;
const names = ['Bench Press', 'Row', 'Overhead Press', 'Pull-Up', 'Back Squat', 'Deadlift'];
const five: ProgressSetFact[] = [];
patternIds.slice(0, 5).forEach((pattern, index) => {
  dates('2026-07-06', 3).forEach((date) => {
    five.push(fact({ date, catalogExerciseId: pattern, exerciseName: names[index], weight: 100, reps: 1, movementPattern: pattern }));
  });
  dates('2026-09-14', 3).forEach((date) => {
    five.push(fact({ date, catalogExerciseId: pattern, exerciseName: names[index], weight: 110, reps: 1, movementPattern: pattern }));
  });
});
const overall = buildStrengthIndex(buildSeriesWindows(five, view, windows.baseline, windows.current, mondayOfWeek));
assert.equal(overall.label, 'overall');
assert.equal(overall.patternsCovered, 5);
assert.match(overall.headline || '', /^Overall Strength /);
assert.equal(overall.coverageLine, 'Based on 5 of 6 movement patterns');
assert.equal(overall.percentChange, 10);

const credits = [
  { muscle: 'chest', contribution: SCIENCE_RULES_V1.primaryContribution },
  { muscle: 'triceps', contribution: SCIENCE_RULES_V1.secondaryContribution },
  { muscle: 'front_delts', contribution: SCIENCE_RULES_V1.secondaryContribution },
  { muscle: 'abs', contribution: SCIENCE_RULES_V1.minorContribution },
];
const muscleFacts = [
  fact({ date: '2026-10-06', weight: 200, reps: 5, muscleCredits: credits, rir: 2 }),
  fact({ date: '2026-10-06', weight: 100, reps: 5, setType: 'warmup', muscleCredits: credits, rir: 1 }),
  fact({
    date: '2026-10-06',
    catalogExerciseId: 'row',
    exerciseName: 'Row',
    movementPattern: 'horizontal_pull',
    muscleCredits: [
      { muscle: 'lats', contribution: 1 },
      { muscle: 'upper_back', contribution: 0.5 },
    ],
  }),
];
const muscles = muscleVolumeReport(muscleFacts, { from: '2026-09-28', to: '2026-10-08' });
const chest = muscles.groups.find((group) => group.id === 'chest');
const triceps = muscles.groups.find((group) => group.id === 'triceps');
const shoulders = muscles.groups.find((group) => group.id === 'shoulders');
const core = muscles.groups.find((group) => group.id === 'core');
const back = muscles.groups.find((group) => group.id === 'back');
assert.equal(chest?.directSets, 1);
assert.equal(chest?.effectiveSets, 1);
assert.equal(triceps?.directSets, 0);
assert.equal(triceps?.effectiveSets, 0.5);
assert.equal(shoulders?.effectiveSets, 0.5);
assert.equal(core?.effectiveSets, 0.25);
assert.equal(back?.directSets, 1);
assert.equal(back?.effectiveSets, 1.5);
assert.equal(chest?.hardSets, 1);
assert.match(muscles.estimateNote, /estimates/i);

const unknownMuscle = muscleVolumeReport(
  [fact({ date: '2026-10-06', muscleCredits: null, creditProvenance: 'unknown' })],
  { from: '2026-10-05', to: '2026-10-08' }
);
assert.equal(unknownMuscle.unattributedSets, 1);
assert.equal(unknownMuscle.groups.every((group) => group.effectiveSets === 0), true);

assert.equal(mondayOfWeek('2026-10-04'), '2026-09-28');
assert.equal(mondayOfWeek('2026-10-05'), '2026-10-05');
const weekReport = muscleVolumeReport(
  [
    fact({ date: '2026-10-04', muscleCredits: [{ muscle: 'chest', contribution: 1 }] }),
    fact({ date: '2026-10-05', muscleCredits: [{ muscle: 'chest', contribution: 1 }] }),
  ],
  { from: '2026-09-28', to: '2026-10-11' }
);
const chestWeeks = weekReport.groups.find((group) => group.id === 'chest')?.weeks || [];
assert.equal(chestWeeks.find((week) => week.weekStart === '2026-09-28')?.directSets, 1);
assert.equal(chestWeeks.find((week) => week.weekStart === '2026-10-05')?.directSets, 1);

const meals = nutritionDaysFromEntries([
  { log_date: '2026-10-01', calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 },
  { log_date: '2026-10-02', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
]);
const nutrition = nutritionReport(meals, { from: '2026-10-01', to: '2026-10-03' }, { calories: 1800, protein: 140, carbs: null, fat: null });
assert.equal(nutrition.loggedDays, 2);
assert.equal(nutrition.daysInRange, 3);
assert.equal(nutrition.averages?.calories, 1000);
assert.notEqual(nutrition.averages?.calories, 2000 / 3);
assert.equal(nutrition.targetAdherence?.calories != null, true);
assert.equal(nutrition.targetAdherence?.carbs, null);
assert.equal(nutrition.days.length, 2);
assert.equal(nutrition.days.some((day) => day.date === '2026-10-03'), false);
assert.equal(nutrition.targetDaysMet?.protein, 1);

const emptyNutrition = nutritionReport([], { from: '2026-10-01', to: '2026-10-03' });
assert.equal(emptyNutrition.averages, null);
assert.equal(emptyNutrition.loggedDays, 0);

const measurements: BodyMeasurementRow[] = [
  { id: '1', user_id: 'u', measured_on: '2026-09-01', weight_lbs: 180, waist_inches: null, notes: null },
  { id: '2', user_id: 'u', measured_on: '2026-09-15', weight_lbs: 178, waist_inches: 34, notes: null },
  { id: '3', user_id: 'u', measured_on: '2026-10-01', weight_lbs: 176, waist_inches: null, notes: null },
];
const trends = bodyTrends(measurements, { from: '2026-09-01', to: '2026-10-08' });
const weight = trends.find((metric) => metric.key === 'weight');
assert.equal(weight?.samples, 3);
assert.equal(weight?.delta, -4);
assert.equal(weight?.rollingAverage, 178);
assert.deepEqual(weight?.raw.map((point) => point.value), [180, 178, 176]);
const shortWeight = bodyTrends(measurements.slice(0, 2), { from: '2026-09-01', to: '2026-09-20' }).find((metric) => metric.key === 'weight');
assert.equal(shortWeight?.rollingAverage, null);
assert.equal(hasAnyBodyMeasurement({ chest_inches: 40 }), true);
assert.equal(hasAnyBodyMeasurement({ weight_lbs: null, waist_inches: null }), false);

const bounds = rangeBounds('7D', '2026-10-08');
assert.equal(bounds.from, '2026-10-02');
assert.equal(bounds.to, '2026-10-08');
assert.equal(comparableWindows(bounds).mode, 'previous_window');
assert.equal(comparableWindows({ from: '2026-07-01', to: '2026-10-08' }).mode, 'within_range');

assert.equal(progressAdherence(null, '2026-10-08'), null);
const adherence = progressAdherence(
  [{ scheduledDate: '2026-10-05', sessionStatus: 'completed' }, { scheduledDate: '2026-10-06', sessionStatus: null }],
  '2026-10-08'
);
assert.equal(adherence?.source, 'training_expectations');
assert.equal(adherence?.counts.completed_past, 1);
assert.equal(adherence?.counts.missed, 1);

const report = buildProgressReport({
  range: '4W',
  today: '2026-10-08',
  facts: twoPatternFacts,
  mealEntries: [{ log_date: '2026-10-01', calories: 2100, protein_g: 160, carbs_g: 180, fat_g: 70 }],
  measurements,
  expectations: null,
});
assert.equal(report.adherence, null);
assert.equal(report.associations.every((note) => note.claimsCausation === false), true);
assert.match(report.associations.map((note) => note.text).join(' '), /During this period|averaged/i);
assert.equal('facts' in report, false);

const backfillSamples = [
  inferSnapshotEquipment({ existingEquipment: 'Barbell', exerciseName: 'Bench Press', compatibleEquipment: ['Dumbbell'] }),
  inferSnapshotEquipment({
    exerciseName: 'Dumbbell Bench Press',
    compatibleEquipment: ['Barbell', 'Dumbbell', 'Smith Machine'],
  }),
  inferSnapshotEquipment({
    exerciseName: 'Bench Press',
    compatibleEquipment: ['Barbell', 'Dumbbell', 'Smith Machine'],
  }),
  inferSnapshotEquipment({ exerciseName: 'Bench Press', compatibleEquipment: ['Barbell'] }),
  inferSnapshotEquipment({
    exerciseName: 'Smith Machine Bench Press',
    compatibleEquipment: ['Machine', 'Smith Machine'],
  }),
];
const recovered = backfillSamples.filter((item) => item.equipment && item.provenance !== 'unknown');
const unspecifiedBackfill = backfillSamples.filter((item) => item.detail === 'unspecified');
assert.equal(recovered.length, 4);
assert.equal(unspecifiedBackfill.length, 1);
assert.equal(backfillSamples[2].equipment, null);
assert.equal(backfillSamples[1].equipment, 'Dumbbell');
assert.equal(backfillSamples[3].equipment, 'Barbell');
assert.equal(backfillSamples[4].equipment, 'Smith Machine');
console.log(
  `equipment backfill fixtures: recovered ${recovered.length}, unspecified ${unspecifiedBackfill.length} (generic Bench Press was not called Barbell)`
);

const snapshot = snapshotForLog(
  { name: 'Example Lift', catalog_exercise_id: '11111111-1111-1111-1111-111111111111', muscle_group: 'chest', program_role: 'primary' },
  { set_type: 'working', set_number: 1 },
  { day_label: 'Mon', week: 1 },
  {
    name: 'Example Lift',
    movement_pattern: 'horizontal_push',
    coaching_metadata: {
      primary_muscles: ['chest'],
      secondary_muscles: ['triceps'],
      minor_muscles: ['abs'],
      compatible_equipment: ['Barbell', 'Dumbbell'],
    },
  },
  { equipment: 'Barbell', exerciseType: 'strength' }
);
assert.equal(snapshot.snapshot_equipment, 'Barbell');
assert.equal(snapshot.snapshot_movement_pattern, 'horizontal_push');
assert.equal(snapshot.snapshot_provenance.equipment, 'snapshotted');
assert.ok(snapshot.snapshot_muscle_credits?.some((credit) => credit.muscle === 'chest' && credit.contribution === 1));
assert.ok(snapshot.snapshot_muscle_credits?.some((credit) => credit.muscle === 'abs' && credit.contribution === SCIENCE_RULES_V1.minorContribution));
const performed = withoutSnapshotIdentity({ ...snapshot, actual_weight: '205', actual_reps: '5' });
assert.equal('snapshot_equipment' in performed, false);
assert.equal(performed.actual_weight, '205');

const extra = extraSetInsertPayload({
  user_id: 'u',
  exercise_id: 'e',
  log_date: '2026-10-08',
  extra_set_number: 1,
  ...snapshot,
} as ExtraSetLog);
assert.equal(extra.snapshot_equipment, 'Barbell');
assert.equal(extra.snapshot_movement_pattern, 'horizontal_push');
assert.equal(extra.is_extra_set, true);

const renamed = fact({ date: '2026-10-06', catalogExerciseId: 'old-id', exerciseName: 'Bench Press', equipment: 'Barbell' });
assert.equal(
  seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'old-id', exerciseName: 'New Catalog Name', equipment: 'Barbell' })),
  seriesKey(renamed.identity)
);
assert.notEqual(
  seriesKey(seriesIdentityFromParts({ catalogExerciseId: 'other', exerciseName: 'Bench Press', equipment: 'Barbell' })),
  seriesKey(renamed.identity)
);

const minor = contributionsForExercise(
  {
    name: 'Example',
    primaryMuscles: [],
    secondaryMuscles: [],
    raw: { muscle_targets: [{ muscle: 'abs', role: 'minor', percentage: 10 }] },
  },
  undefined,
  { allowNameDefaults: false }
);
assert.equal(minor[0]?.contribution, SCIENCE_RULES_V1.minorContribution);

const chartFacts = [
  fact({ date: '2026-10-01', weight: 100, reps: 5 }),
  fact({ date: '2026-10-01', weight: 80, reps: 8, setType: 'warmup' }),
  fact({ date: '2026-10-03', weight: 110, reps: 5 }),
];
const e1rmPoints = seriesChartPoints(chartFacts, 'e1rm');
assert.equal(e1rmPoints.length, 2);
assert.equal(e1rmPoints[0].date, '2026-10-01');
assert.ok(e1rmPoints[1].value > e1rmPoints[0].value);
assert.equal(seriesChartPoints(chartFacts, 'sets')[0].value, 1);

const periodRecords = seriesPersonalRecords(chartFacts);
const headlines = headlineRecords(periodRecords);
assert.equal(headlines.length, 1);
assert.equal(new Set(headlines.map((record) => record.key)).size, 1);

const emptyReport = buildProgressReport({ range: '4W', today: '2026-10-08' });
const summary = overviewSummary(emptyReport, 'imperial');
assert.equal(summary.baseline, true);
assert.equal(summary.rows.length, 0);
assert.equal(overviewCards(emptyReport, 'imperial').every((card) => card.value == null), true);

const insights = overviewInsights({
  ...emptyReport,
  strengthIndex: { ...emptyReport.strengthIndex, percentChange: 4.8 },
  nutrition: nutritionReport(
    [{ date: '2026-10-01', calories: 2438, protein: 158, carbs: 220, fat: 70 }],
    { from: '2026-09-11', to: '2026-10-08' },
    null
  ),
}, 'imperial');
const insightText = insights.map((insight) => `${insight.title} ${insight.body}`).join(' ').toLowerCase();
assert.equal(insightText.includes('caused'), false);
assert.equal(insightText.includes('surplus'), false);
assert.equal(insightText.includes('deficit'), false);
assert.match(insightText, /4\.8%/);
assert.match(insightText, /158 g of protein/);
assert.ok(insights.length <= 4);

assert.equal(
  columnsWithoutMissing('id,snapshot_movement_pattern,snapshot_equipment', "Could not find the 'snapshot_movement_pattern' column"),
  'id,snapshot_equipment'
);
assert.equal(
  columnsWithoutMissing('id,snapshot_catalog_exercise_id', "Could not find the 'snapshot_catalog_exercise_id' column"),
  'id'
);

console.log('test-progress-analytics: ok');
