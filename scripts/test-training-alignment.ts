/**
 * BIQ-0271 Phase D1/D2: Training summaries and section display.
 * Run: npx tsx scripts/test-training-alignment.ts
 */
import assert from 'node:assert/strict';
import {
  WORKOUT_SECTIONS,
  trainingWorkoutSummary,
  workingExerciseCount,
  workingExerciseCountLabel,
  workoutSectionsForDisplay,
} from '../lib/programDesign/workoutPreview';
import { WORKOUT_TEMPLATE_SECTIONS } from '../lib/training/workoutTemplate';

assert.deepEqual(
  WORKOUT_SECTIONS.map((sec) => sec.id),
  ['warmup', 'strength', 'conditioning', 'cooldown']
);
assert.deepEqual(
  WORKOUT_SECTIONS.map((sec) => sec.label),
  ['Warm-up', 'Strength', 'Conditioning', 'Cooldown']
);
assert.deepEqual(
  WORKOUT_TEMPLATE_SECTIONS.map((sec) => ({ id: sec.id, label: sec.label })),
  WORKOUT_SECTIONS.map((sec) => ({ id: sec.id, label: sec.label }))
);

const fullBodyA = {
  day_label: 'Mon',
  workout_type: 'Full Body A - Chest Priority Strength',
  st_exercises: [
    {
      id: 'bench',
      name: 'Bench Press',
      section: 'strength',
      muscle_group: 'Chest',
      sort_order: 1,
      st_planned_sets: [{ set_type: 'working', target_reps: '8' }],
    },
    {
      id: 'press',
      name: 'Leg Press',
      section: 'strength',
      muscle_group: 'Quads',
      sort_order: 2,
      st_planned_sets: [{ set_type: 'working', target_reps: '10' }],
    },
    {
      id: 'row',
      name: 'Chest-Supported Row',
      section: 'strength',
      muscle_group: 'Mid Back',
      sort_order: 3,
      st_planned_sets: [{ set_type: 'working', target_reps: '8' }],
    },
    {
      id: 'fly',
      name: 'Incline Chest Fly',
      section: 'strength',
      muscle_group: 'Upper Chest',
      sort_order: 4,
      st_planned_sets: [{ set_type: 'working', target_reps: '8' }],
    },
    {
      id: 'pullover',
      name: 'Pullover',
      section: 'strength',
      muscle_group: 'Lats',
      sort_order: 5,
      st_planned_sets: [{ set_type: 'working', target_reps: '8' }],
    },
  ],
};

const summary = trainingWorkoutSummary({
  title: 'Full Body A - Chest Priority Strength',
  workout: fullBodyA,
  duration: '1 hr',
  sourceName: 'Personal',
});
assert.equal(summary.name, 'Full Body A - Chest Priority Strength');
assert.equal(summary.focus, 'Chest + Quads');
assert.equal(summary.duration, '1 hr');
assert.equal(summary.workingCount, 5);
assert.equal(summary.workingLabel, '5 working exercises');
assert.equal(workingExerciseCount(fullBodyA), 5);
assert.equal(workingExerciseCountLabel(1), '1 working exercise');
assert.equal(workingExerciseCountLabel(0), '');
assert.equal(summary.source, 'Personal');
assert.equal(summary.meta, 'Chest + Quads · 1 hr · 5 working exercises · Personal');

const programDesignMeta = [summary.focus, summary.duration, summary.workingLabel].join(' · ');
assert.equal(programDesignMeta, 'Chest + Quads · 1 hr · 5 working exercises');

const sauna = trainingWorkoutSummary({
  title: 'Recovery Sauna',
  duration: '10 min',
});
assert.equal(sauna.name, 'Recovery Sauna');
assert.equal(sauna.focus, '');
assert.equal(sauna.workingCount, 0);
assert.equal(sauna.meta, '10 min');

const overlayOnly = trainingWorkoutSummary({
  title: 'Full Body B',
  sourceName: 'TrowHoes',
});
assert.equal(overlayOnly.name, 'Full Body B');
assert.equal(overlayOnly.meta, 'TrowHoes');

const reviewSections = workoutSectionsForDisplay(fullBodyA, { hideEmpty: true });
assert.deepEqual(
  reviewSections.map((sec) => sec.id),
  ['strength']
);
assert.deepEqual(
  reviewSections.map((sec) => sec.label),
  ['Strength']
);
assert.equal(
  reviewSections.some((sec) => sec.id === 'warmup' || sec.id === 'conditioning' || sec.id === 'cooldown'),
  false
);

const editSections = workoutSectionsForDisplay(fullBodyA, { hideEmpty: false });
assert.deepEqual(
  editSections.map((sec) => sec.id),
  ['warmup', 'strength', 'conditioning', 'cooldown']
);
assert.deepEqual(
  editSections.map((sec) => sec.label),
  ['Warm-up', 'Strength', 'Conditioning', 'Cooldown']
);

const completedReview = {
  ...fullBodyA,
  st_exercises: [
    ...fullBodyA.st_exercises,
    { id: 'march', name: 'March', section: 'warmup', sort_order: 0, muscle_group: 'Full Body' },
  ],
};
const completedSections = workoutSectionsForDisplay(completedReview, { hideEmpty: true });
assert.deepEqual(
  completedSections.map((sec) => sec.id),
  ['warmup', 'strength']
);
assert.equal(workingExerciseCount(completedReview), 5);
assert.equal(
  trainingWorkoutSummary({ title: completedReview.workout_type, workout: completedReview, duration: '1 hr' }).workingCount,
  5
);

console.log('training alignment D1/D2 checks passed');
