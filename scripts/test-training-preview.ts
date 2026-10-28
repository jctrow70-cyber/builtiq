/**
 * BIQ-0271 Phase D4: Training calendar preview before logging.
 * Run: npx tsx scripts/test-training-preview.ts
 */
import assert from 'node:assert/strict';
import {
  canShowTrainingPreviewEdit,
  previewDialogKeyCloses,
  previewDialogTabWrap,
  resolveTrainingPreviewWorkout,
  trainingCalendarAction,
} from '../lib/training/trainingPreview';

const personalItem = {
  workoutId: 'w-personal',
  completed: false,
  programId: 'prog-personal',
};
const completedItem = { workoutId: 'w-done', completed: true, programId: 'prog-personal' };
const restItem = { workoutId: null, completed: false };

assert.equal(trainingCalendarAction('title', personalItem), 'preview');
assert.equal(trainingCalendarAction('details', personalItem), 'preview');
assert.equal(trainingCalendarAction('start', personalItem), 'log');
assert.equal(trainingCalendarAction('review', completedItem), 'log');
assert.equal(trainingCalendarAction('title', restItem), null);
assert.notEqual(trainingCalendarAction('title', personalItem), 'log');
assert.notEqual(trainingCalendarAction('start', personalItem), 'preview');

const personalProgram = {
  id: 'prog-personal',
  st_workouts: [
    {
      id: 'w-personal',
      program_id: 'prog-personal',
      workout_type: 'Full Body A',
      st_exercises: [{ id: 'ex1', name: 'Bench Press', section: 'strength' }],
    },
  ],
};
const groupProgram = {
  id: 'prog-group',
  st_workouts: [
    {
      id: 'w-group',
      program_id: 'prog-group',
      workout_type: 'Group Strength',
      st_exercises: [{ id: 'ex2', name: 'Squat', section: 'strength' }],
    },
  ],
};

const personalPreview = resolveTrainingPreviewWorkout({
  workoutId: 'w-personal',
  programId: 'prog-personal',
  loadedProgram: personalProgram,
});
assert.equal(personalPreview.reason, 'ok');
assert.equal(personalPreview.workout?.id, 'w-personal');
assert.equal(personalPreview.error, null);

const groupPreview = resolveTrainingPreviewWorkout({
  workoutId: 'w-group',
  programId: 'prog-group',
  loadedProgram: groupProgram,
});
assert.equal(groupPreview.reason, 'ok');
assert.equal(groupPreview.workout?.workout_type, 'Group Strength');

const overlayFallback = resolveTrainingPreviewWorkout({
  workoutId: 'w-overlay',
  programId: 'prog-overlay',
  loadedProgram: { id: 'prog-overlay', st_workouts: [] },
  fallbackWorkouts: [{ id: 'w-overlay', program_id: 'prog-overlay', workout_type: 'Moved Full Body A' }],
});
assert.equal(overlayFallback.reason, 'ok');
assert.equal(overlayFallback.workout?.workout_type, 'Moved Full Body A');

const missing = resolveTrainingPreviewWorkout({
  workoutId: 'missing',
  programId: 'prog-personal',
  loadedProgram: personalProgram,
});
assert.equal(missing.reason, 'missing');
assert.equal(missing.workout, null);

const unauthorized = resolveTrainingPreviewWorkout({
  workoutId: 'w-group',
  programId: 'prog-group',
  loadedProgram: personalProgram,
  loadError: 'row-level security policy',
});
assert.equal(unauthorized.reason, 'unauthorized');
assert.equal(unauthorized.workout, null);
assert.match(String(unauthorized.error), /do not have access/i);

const noSubstitute = resolveTrainingPreviewWorkout({
  workoutId: 'w-personal',
  programId: 'prog-group',
  loadedProgram: personalProgram,
});
assert.equal(noSubstitute.reason, 'unavailable');
assert.equal(noSubstitute.workout, null);
assert.notEqual(noSubstitute.workout?.id, 'w-personal');

const wrongFallback = resolveTrainingPreviewWorkout({
  workoutId: 'w-personal',
  programId: 'prog-group',
  loadedProgram: { id: 'prog-group', st_workouts: [] },
  fallbackWorkouts: [{ id: 'w-personal', program_id: 'prog-personal', workout_type: 'Personal leftover' }],
});
assert.equal(wrongFallback.reason, 'missing');
assert.equal(wrongFallback.workout, null);

assert.equal(previewDialogKeyCloses('Escape'), true);
assert.equal(previewDialogKeyCloses('Enter'), false);
assert.equal(previewDialogKeyCloses('Tab'), false);
assert.equal(previewDialogTabWrap('Tab', false, 2, 3), 0);
assert.equal(previewDialogTabWrap('Tab', true, 0, 3), 2);
assert.equal(previewDialogTabWrap('Tab', false, 1, 3), null);
assert.equal(previewDialogTabWrap('Escape', false, 0, 3), null);

assert.equal(canShowTrainingPreviewEdit({ authorized: true, hasWorkout: true }), true);
assert.equal(canShowTrainingPreviewEdit({ authorized: true, personalCalendar: true, hasWorkout: true }), true);
assert.equal(canShowTrainingPreviewEdit({ authorized: false, personalCalendar: true, hasWorkout: true }), true);
assert.equal(
  canShowTrainingPreviewEdit({ authorized: false, personalCalendar: false, hasWorkout: true }),
  false
);
assert.equal(
  canShowTrainingPreviewEdit({
    authorized: true,
    hasWorkout: false,
    loadError: null,
  }),
  false
);
assert.equal(
  canShowTrainingPreviewEdit({
    authorized: true,
    hasWorkout: true,
    loadError: 'row-level security policy',
  }),
  false
);

console.log('training preview D4 checks passed');
