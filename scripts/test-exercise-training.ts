import assert from 'node:assert/strict';
import { buildExerciseProgress } from '../lib/progress/exerciseProgress';
import { exerciseTrainingObservation, exerciseTrainingSummary } from '../lib/progress/exerciseTraining';
import { seriesIdentityFromParts } from '../lib/progress/identity';
import { comparableWindows, rangeBounds } from '../lib/progress/ranges';
import type { ProgressSetFact } from '../lib/progress/setFacts';
import { estimateE1rm } from '../lib/training/estimated1Rm';

let seq = 0;

function fact(input: {
  date: string;
  equipment?: string | null;
  weight: number;
  reps: number;
  setType?: string;
  completed?: boolean;
  variant?: string | null;
  name?: string;
}): ProgressSetFact {
  seq += 1;
  const identity = seriesIdentityFromParts({
    catalogExerciseId: 'bench',
    exerciseName: input.name || 'Bench Press',
    equipment: input.equipment,
    variant: input.variant,
  });
  return {
    id: `set-${seq}`,
    logDate: input.date,
    completed: input.completed !== false,
    weight: input.weight,
    reps: input.reps,
    rpe: null,
    rir: null,
    setType: input.setType || 'working',
    exerciseType: 'strength',
    identity,
    movementPattern: 'horizontal_push',
    muscleCredits: null,
    muscleGroupLabel: null,
    programRole: 'primary',
    provenance: {
      equipment: 'snapshotted',
      equipmentDetail: 'existing',
      movementPattern: 'snapshotted',
      muscleCredits: 'unknown',
      variant: 'unknown',
    },
    notes: '',
    setNumber: seq,
  };
}

const target = { catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: 'Barbell' };

function summaryFor(facts: ProgressSetFact[], from: string, to: string) {
  return exerciseTrainingSummary({ facts, view: { from, to } });
}

function modelFor(facts: ProgressSetFact[], today: string, equipment = 'Barbell', variant?: string | null) {
  return buildExerciseProgress({
    facts,
    target: { ...target, equipment, variant },
    range: '4W',
    today,
  });
}

const mixedDay = [
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 100, reps: 5, setType: 'warmup' }),
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 100, reps: 5, setType: 'warm-up' }),
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 100, reps: 5, setType: 'ramp' }),
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 100, reps: 5, setType: 'backoff' }),
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 90, reps: 8, setType: 'dropset' }),
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 80, reps: 10, setType: 'amrap' }),
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 200, reps: 5, setType: 'working', completed: false }),
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 110, reps: 5, setType: 'working' }),
];
const counted = summaryFor(mixedDay, '2026-10-07', '2026-11-03');
assert.equal(counted.workingSets, 4);
assert.equal(counted.trainingDays, 1);
assert.equal(counted.latestTrainingDay, '2026-11-03');
assert.equal(counted.weeks.length, 1);
assert.equal(counted.weeks[0].workingSets, 4);
assert.equal(counted.weeks[0].trainingDays, 1);
assert.ok((counted.weeks[0].bestE1rm || 0) > 110);

const sameDay = summaryFor([
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 100, reps: 5 }),
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 105, reps: 5 }),
], '2026-11-01', '2026-11-03');
assert.equal(sameDay.workingSets, 2);
assert.equal(sameDay.trainingDays, 1);
assert.equal(sameDay.averageSetsPerWeek, null);
assert.equal(sameDay.averageNote, 'too_short');

const partial = summaryFor([
  fact({ date: '2026-11-04', equipment: 'Barbell', weight: 100, reps: 5 }),
  fact({ date: '2026-11-09', equipment: 'Barbell', weight: 100, reps: 5 }),
], '2026-10-24', '2026-11-20');
assert.deepEqual(partial.weeks.map((week) => week.weekStart), ['2026-11-02', '2026-11-09', '2026-11-16']);
assert.equal(partial.weeks[0].partial, 'first');
assert.equal(partial.weeks[0].workingSets, 1);
assert.equal(partial.weeks[1].workingSets, 1);
assert.equal(partial.weeks[1].partial, null);
assert.equal(partial.weeks[2].workingSets, 0);
assert.equal(partial.weeks[2].partial, 'current');
assert.equal(partial.weeks[2].bestE1rm, null);
assert.equal(partial.observedDays, 17);
assert.equal(partial.averageSetsPerWeek, 0.8);
assert.equal(partial.averageNote, 'includes_open_week');

const gap = summaryFor([
  fact({ date: '2026-11-02', equipment: 'Barbell', weight: 100, reps: 5 }),
  fact({ date: '2026-11-16', equipment: 'Barbell', weight: 100, reps: 5 }),
], '2026-11-02', '2026-11-22');
assert.equal(gap.weeks[1].weekStart, '2026-11-09');
assert.equal(gap.weeks[1].workingSets, 0);
assert.equal(gap.averageNote, 'full_days');
assert.equal(gap.averageSetsPerWeek, 0.7);

const highRep = summaryFor([
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 100, reps: 15 }),
], '2026-11-03', '2026-11-03');
assert.equal(highRep.workingSets, 1);
assert.equal(highRep.weeks[0].bestE1rm, null);
assert.equal(estimateE1rm({ weight: 100, reps: 15, setType: 'working', exerciseType: 'strength' }), null);

const onePoint = modelFor([
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 100, reps: 5 }),
], '2026-11-06');
assert.equal(onePoint.chart.length, 1);
assert.equal(onePoint.changePercent, null);
assert.equal(onePoint.observation?.id, 'insufficient_strength');

const missingWindow = modelFor([
  fact({ date: '2026-10-20', equipment: 'Barbell', weight: 100, reps: 5 }),
  fact({ date: '2026-11-03', equipment: 'Barbell', weight: 120, reps: 5 }),
], '2026-11-03');
assert.equal(missingWindow.changePercent, null);
assert.equal(missingWindow.observation?.id, 'insufficient_strength');
assert.ok(missingWindow.observation?.text.toLowerCase().includes('strength'));
assert.equal(/because|caused|plateau/i.test(missingWindow.observation?.text || ''), false);

const rising = modelFor([
  fact({ date: '2026-09-15', equipment: 'Barbell', weight: 100, reps: 5 }),
  fact({ date: '2026-10-20', equipment: 'Barbell', weight: 120, reps: 5 }),
  fact({ date: '2026-10-22', equipment: 'Barbell', weight: 120, reps: 5 }),
], '2026-11-03');
assert.ok((rising.changePercent || 0) > 0);
assert.equal(rising.observation?.id, 'strength_and_sets_up');
assert.equal(/because|caused|led to/i.test(rising.observation?.text || ''), false);

const stable = modelFor([
  fact({ date: '2026-09-15', equipment: 'Barbell', weight: 100, reps: 5 }),
  fact({ date: '2026-09-22', equipment: 'Barbell', weight: 100, reps: 5 }),
  fact({ date: '2026-10-20', equipment: 'Barbell', weight: 100, reps: 5 }),
], '2026-11-03');
assert.equal(stable.changePercent, 0);
assert.equal(stable.observation?.id, 'strength_stable_days_down');

const unevenFacts = [
  fact({ date: '2026-10-05', equipment: 'Barbell', weight: 100, reps: 5 }),
];
const unevenView = { from: '2026-10-05', to: '2026-11-08' };
const unevenSummary = exerciseTrainingSummary({ facts: unevenFacts, view: unevenView });
const unevenWindows = comparableWindows(unevenView);
const uneven = exerciseTrainingObservation({
  facts: unevenFacts,
  baseline: unevenWindows.baseline,
  current: unevenWindows.current,
  weeks: unevenSummary.weeks,
  today: '2026-11-08',
  changePercent: null,
  changeLoad: null,
  periodWorkingSets: unevenSummary.workingSets,
});
assert.equal(unevenSummary.weeks.length >= 4, true);
assert.equal(uneven?.id, 'uneven_weeks');

const quiet = modelFor([
  fact({ date: '2026-09-15', equipment: 'Barbell', weight: 100, reps: 5 }),
  fact({ date: '2026-10-20', equipment: 'Barbell', weight: 100, reps: 5 }),
], '2026-11-03');
assert.equal(quiet.changePercent, 0);
assert.equal(quiet.observation, null);

const equipmentFacts = [
  fact({ date: '2026-10-20', equipment: 'Barbell', weight: 185, reps: 5 }),
  fact({ date: '2026-10-22', equipment: 'Dumbbell', weight: 50, reps: 8 }),
  fact({ date: '2026-10-27', equipment: 'DB', weight: 55, reps: 8 }),
  fact({ date: '2026-10-28', equipment: 'Smith Machine', weight: 135, reps: 5 }),
];
assert.equal(modelFor(equipmentFacts, '2026-11-03', 'Barbell').training.workingSets, 1);
assert.equal(modelFor(equipmentFacts, '2026-11-03', 'Dumbbell').training.workingSets, 2);
assert.equal(modelFor(equipmentFacts, '2026-11-03', 'Smith Machine').training.workingSets, 1);

const sided = [
  fact({ date: '2026-10-20', equipment: 'Dumbbell', weight: 40, reps: 8, variant: 'unilateral' }),
  fact({ date: '2026-10-22', equipment: 'Dumbbell', weight: 50, reps: 8, variant: 'bilateral' }),
  fact({ date: '2026-10-27', equipment: 'Dumbbell', weight: 50, reps: 8, variant: null }),
];
assert.equal(modelFor(sided, '2026-11-03', 'Dumbbell', 'unilateral').training.workingSets, 1);
assert.equal(modelFor(sided, '2026-11-03', 'Dumbbell', 'bilateral').training.workingSets, 2);
assert.equal(modelFor(sided, '2026-11-03', 'Dumbbell', null).training.workingSets, 2);

const records = buildExerciseProgress({
  facts: [
    fact({ date: '2024-01-02', equipment: 'Barbell', weight: 315, reps: 1 }),
    fact({ date: '2026-10-20', equipment: 'Barbell', weight: 225, reps: 5 }),
  ],
  target,
  range: '4W',
  today: '2026-11-03',
});
assert.equal(records.allTimeLoad?.weight, 315);
assert.equal(records.allTimeLoad?.date, '2024-01-02');
assert.equal(records.periodBest?.date, '2026-10-20');
assert.ok((records.allTimeE1rm?.e1rm || 0) >= (records.periodBest?.e1rm || 0));

const bounds = rangeBounds('4W', '2026-11-03', '2024-01-02');
assert.equal(records.training.observedFrom >= bounds.from, true);
assert.equal(records.training.weeks.some((week) => week.weekStart < bounds.from), false);

console.log('OK: exercise training checks passed');
