/**
 * BIQ-0271 Phase E3.1: Finish Workout entry point.
 * Run: npx tsx scripts/test-finish-workout.ts
 */
import assert from 'node:assert/strict';
import { completedSessionDraft } from '../lib/training/sessionOutcome';
import { shouldTriggerCompletedWorkoutAdaptation } from '../lib/training/adaptationOrchestration';
import { previewDialogKeyCloses, previewDialogTabWrap } from '../lib/training/trainingPreview';
import {
  finishWorkoutActionLabel,
  sessionFeedbackSharedInterface,
  sessionFeedbackSummary,
  sessionFeedbackValuesAfterSheetClose,
  showFinishWorkoutAction,
} from '../lib/training/sessionFeedback';

assert.equal(showFinishWorkoutAction({ sessionOpen: true, sessionIntent: 'log' }), true);
assert.equal(showFinishWorkoutAction({ sessionOpen: true, sessionIntent: 'log', memberPanel: false }), true);
assert.equal(showFinishWorkoutAction({ sessionOpen: true, sessionIntent: 'edit' }), false);
assert.equal(showFinishWorkoutAction({ sessionOpen: true, sessionIntent: 'log', memberPanel: true }), false);
assert.equal(showFinishWorkoutAction({ sessionOpen: false, sessionIntent: 'log' }), false);
assert.equal(finishWorkoutActionLabel('not_started'), 'Finish Workout');
assert.equal(finishWorkoutActionLabel('in_progress'), 'Finish Workout');
assert.equal(finishWorkoutActionLabel(null), 'Finish Workout');
assert.equal(finishWorkoutActionLabel('completed'), 'Review Workout Feedback');
assert.equal(finishWorkoutActionLabel('partial'), 'Review Workout Feedback');
assert.equal(finishWorkoutActionLabel('skipped'), 'Review Workout Feedback');
assert.equal(previewDialogKeyCloses('Escape'), true);
assert.equal(previewDialogTabWrap('Tab', false, 4, 5), 0);
assert.equal(previewDialogTabWrap('Tab', true, 0, 5), 4);

const fromFinish = sessionFeedbackSharedInterface('finish');
const fromTop = sessionFeedbackSharedInterface('how-did-it-go');
assert.equal(fromFinish.interface, 'session-outcome');
assert.equal(fromTop.interface, fromFinish.interface);
assert.equal(fromFinish.usesParentState, true);
assert.equal(fromFinish.writesOnOpen, false);
assert.equal(fromFinish.writesOnClose, false);
assert.equal(fromTop.writesOnOpen, false);
assert.equal(fromTop.writesOnClose, false);
assert.equal(sessionFeedbackSharedInterface(null).opener, null);

const before = {
  status: 'in_progress',
  feel: 'good',
  pain: 'none',
  notes: 'Solid',
  skipReason: '',
};
const afterClose = sessionFeedbackValuesAfterSheetClose(before);
assert.deepEqual(afterClose, before);
assert.equal(afterClose.status, 'in_progress');
assert.equal(afterClose.feel, 'good');
assert.equal(afterClose.notes, 'Solid');
assert.match(sessionFeedbackSummary(afterClose), /good/);

const reopen = sessionFeedbackValuesAfterSheetClose(afterClose);
assert.deepEqual(reopen, before);

const workout = {
  id: 'wo-1',
  st_exercises: [
    { section: 'strength', st_planned_sets: [{ id: 's1', set_type: 'working' }, { id: 's2', set_type: 'working' }] },
  ],
};
assert.equal(
  completedSessionDraft({
    intent: 'log',
    workout,
    logs: { s1: { completed: true, planned_set_id: 's1' } },
    logDate: '2026-10-30',
  }),
  null
);
assert.equal(
  completedSessionDraft({
    intent: 'log',
    workout,
    logs: {
      s1: { completed: true, planned_set_id: 's1' },
      s2: { completed: true, planned_set_id: 's2' },
    },
    logDate: '2026-10-30',
  })?.status,
  'completed'
);
assert.equal(
  completedSessionDraft({
    intent: 'log',
    workout,
    existingStatus: 'skipped',
    logs: {
      s1: { completed: true, planned_set_id: 's1' },
      s2: { completed: true, planned_set_id: 's2' },
    },
    logDate: '2026-10-30',
  }),
  null
);
assert.equal(shouldTriggerCompletedWorkoutAdaptation('completed'), true);
assert.equal(shouldTriggerCompletedWorkoutAdaptation('partial'), true);
assert.equal(shouldTriggerCompletedWorkoutAdaptation('skipped'), false);
assert.equal(shouldTriggerCompletedWorkoutAdaptation('in_progress'), false);

console.log('finish-workout entry tests passed');
