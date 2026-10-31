/**
 * BIQ-0271 Phase E3.3: inline workout feedback and last-exercise collapse.
 * Run: npx tsx scripts/test-session-feedback-inline.ts
 */
import assert from 'node:assert/strict';
import { completedSessionDraft } from '../lib/training/sessionOutcome';
import { shouldTriggerCompletedWorkoutAdaptation } from '../lib/training/adaptationOrchestration';
import {
  finishWorkoutActionLabel,
  nextWorkoutExerciseId,
  pickSessionFeedback,
  SESSION_FEEDBACK_PANEL_ID,
  sessionFeedbackAutoExpandsOnStatus,
  sessionFeedbackDefaultExpanded,
  sessionFeedbackEscapeCollapses,
  sessionFeedbackRevealScroll,
  sessionFeedbackSharedInterface,
  sessionFeedbackShouldReveal,
  sessionFeedbackValuesAfterCollapse,
  shouldCollapseCompletedExercise,
  showFinishWorkoutAction,
} from '../lib/training/sessionFeedback';

const ordered = [{ id: 'ex-1' }, { id: 'ex-2' }, { id: 'ex-3' }];
assert.equal(nextWorkoutExerciseId(ordered, 'ex-1'), 'ex-2');
assert.equal(nextWorkoutExerciseId(ordered, 'ex-2'), 'ex-3');
assert.equal(nextWorkoutExerciseId(ordered, 'ex-3'), null);
assert.equal(nextWorkoutExerciseId(ordered, 'missing'), null);
assert.equal(shouldCollapseCompletedExercise(nextWorkoutExerciseId(ordered, 'ex-1')), true);
assert.equal(shouldCollapseCompletedExercise(nextWorkoutExerciseId(ordered, 'ex-3')), false);

const withCooldown = [{ id: 'strength-last' }, { id: 'cooldown-1' }];
assert.equal(nextWorkoutExerciseId(withCooldown, 'strength-last'), 'cooldown-1');
assert.equal(nextWorkoutExerciseId(withCooldown, 'cooldown-1'), null);

assert.equal(sessionFeedbackDefaultExpanded('completed'), false);
assert.equal(sessionFeedbackDefaultExpanded('partial'), false);
assert.equal(sessionFeedbackDefaultExpanded('skipped'), false);
assert.equal(sessionFeedbackAutoExpandsOnStatus('completed'), false);
assert.equal(sessionFeedbackShouldReveal('completed'), true);
assert.equal(sessionFeedbackShouldReveal('in_progress'), false);

assert.equal(finishWorkoutActionLabel('in_progress'), 'Finish Workout');
assert.equal(finishWorkoutActionLabel('completed'), 'Review Workout Feedback');
assert.equal(finishWorkoutActionLabel('partial'), 'Review Workout Feedback');
assert.equal(finishWorkoutActionLabel('skipped'), 'Review Workout Feedback');
assert.equal(finishWorkoutActionLabel('completed', true), 'Hide Workout Feedback');
assert.equal(finishWorkoutActionLabel('in_progress', true), 'Hide Workout Feedback');
assert.equal(finishWorkoutActionLabel('not_started', false), 'Finish Workout');

assert.equal(showFinishWorkoutAction({ sessionOpen: true, sessionIntent: 'log' }), true);
assert.equal(showFinishWorkoutAction({ sessionOpen: true, sessionIntent: 'edit' }), false);

const shared = sessionFeedbackSharedInterface('finish');
assert.equal(shared.interface, 'session-outcome');
assert.equal(shared.placement, 'inline');
assert.equal(shared.writesOnOpen, false);
assert.equal(shared.writesOnClose, false);
assert.equal(sessionFeedbackSharedInterface('how-did-it-go').interface, shared.interface);
assert.equal(SESSION_FEEDBACK_PANEL_ID, 'session-feedback-panel');
assert.deepEqual(sessionFeedbackRevealScroll(), { behavior: 'smooth', block: 'nearest' });

const answers = { status: 'completed', feel: 'good', pain: 'none', notes: 'Solid', skipReason: '' };
const afterHide = sessionFeedbackValuesAfterCollapse(answers);
assert.deepEqual(afterHide, answers);
assert.equal(sessionFeedbackValuesAfterCollapse(afterHide).notes, 'Solid');

assert.equal(sessionFeedbackEscapeCollapses({ key: 'Escape', expanded: true, overlayOpen: false }), true);
assert.equal(sessionFeedbackEscapeCollapses({ key: 'Escape', expanded: true, overlayOpen: true }), false);
assert.equal(sessionFeedbackEscapeCollapses({ key: 'Escape', expanded: false, overlayOpen: false }), false);
assert.equal(sessionFeedbackEscapeCollapses({ key: 'Tab', expanded: true, overlayOpen: false }), false);

const workout = {
  id: 'wo-1',
  st_exercises: [
    { section: 'strength', st_planned_sets: [{ id: 's1', set_type: 'working' }, { id: 's2', set_type: 'working' }] },
    { section: 'cooldown', st_planned_sets: [{ id: 'c1', set_type: 'working' }] },
  ],
};
assert.equal(
  completedSessionDraft({
    intent: 'log',
    workout,
    logs: { s1: { completed: true, planned_set_id: 's1' }, s2: { completed: true, planned_set_id: 's2' } },
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
      c1: { completed: true, planned_set_id: 'c1' },
    },
    logDate: '2026-10-30',
  })?.status,
  'completed'
);
assert.equal(shouldTriggerCompletedWorkoutAdaptation('completed'), true);
assert.equal(shouldTriggerCompletedWorkoutAdaptation('in_progress'), false);

assert.equal(
  pickSessionFeedback({
    session: { userId: 'user-a', workoutId: 'wo-a', logDate: '2026-10-28', feedbackId: 'fb-1' },
    linked: { id: 'fb-1', user_id: 'user-a', workout_id: 'wo-a', log_date: '2026-10-28', notes: 'Solid' },
    latest: { id: 'fb-2', user_id: 'user-a', workout_id: 'wo-a', log_date: '2026-10-28', notes: 'Later' },
  })?.id,
  'fb-1'
);

console.log('session-feedback inline tests passed');
