/**
 * BIQ-0271 Phase E3.2: restore saved workout feedback.
 * Run: npx tsx scripts/test-session-feedback-hydrate.ts
 */
import assert from 'node:assert/strict';
import { completedSessionDraft } from '../lib/training/sessionOutcome';
import { shouldTriggerCompletedWorkoutAdaptation } from '../lib/training/adaptationOrchestration';
import {
  finishWorkoutActionLabel,
  pickSessionFeedback,
  sessionFeedbackIdentityKey,
  sessionFeedbackMatchesIdentity,
  sessionFeedbackSharedInterface,
  sessionFeedbackStateFromRow,
  sessionFeedbackValuesAfterSheetClose,
  shouldApplySessionFeedbackHydration,
  showFinishWorkoutAction,
} from '../lib/training/sessionFeedback';

const completed = {
  userId: 'user-a',
  workoutId: 'wo-a',
  logDate: '2026-10-28',
  feedbackId: 'fb-1',
};
const saved = {
  id: 'fb-1',
  user_id: 'user-a',
  workout_id: 'wo-a',
  log_date: '2026-10-28',
  workout_feel: 'good',
  pain_flag: 'none',
  notes: 'Solid',
};
assert.equal(sessionFeedbackIdentityKey(completed), 'user-a|wo-a|2026-10-28');
assert.equal(sessionFeedbackMatchesIdentity(saved, completed), true);
assert.deepEqual(sessionFeedbackStateFromRow(pickSessionFeedback({ session: completed, linked: saved })), {
  feel: 'good',
  pain: 'none',
  notes: 'Solid',
});

const partial = pickSessionFeedback({
  session: { userId: 'user-a', workoutId: 'wo-a', logDate: '2026-10-21', feedbackId: 'fb-2' },
  linked: {
    id: 'fb-2',
    user_id: 'user-a',
    workout_id: 'wo-a',
    log_date: '2026-10-21',
    workout_feel: 'hard',
    pain_flag: 'discomfort',
    notes: 'Left knee',
  },
});
assert.equal(sessionFeedbackStateFromRow(partial).feel, 'hard');
assert.equal(sessionFeedbackStateFromRow(partial).pain, 'discomfort');

assert.equal(
  pickSessionFeedback({
    session: { userId: 'user-a', workoutId: 'wo-a', logDate: '2026-10-14', feedbackId: null },
    latest: {
      id: 'fb-skip',
      user_id: 'user-a',
      workout_id: 'wo-a',
      log_date: '2026-10-14',
      workout_feel: 'easy',
      notes: 'Travel',
    },
  })?.id,
  'fb-skip'
);

assert.deepEqual(
  sessionFeedbackStateFromRow(
    pickSessionFeedback({
      session: { userId: 'user-a', workoutId: 'wo-a', logDate: '2026-10-30', feedbackId: null },
      latest: null,
    })
  ),
  { feel: '', pain: '', notes: '' }
);

const otherDate = {
  id: 'fb-old',
  user_id: 'user-a',
  workout_id: 'wo-a',
  log_date: '2026-10-21',
  workout_feel: 'very_hard',
  notes: 'Wrong day',
};
assert.equal(
  pickSessionFeedback({
    session: { userId: 'user-a', workoutId: 'wo-a', logDate: '2026-10-28', feedbackId: 'fb-old' },
    linked: otherDate,
    latest: saved,
  })?.id,
  'fb-1'
);

const groupRow = {
  id: 'fb-group',
  user_id: 'user-a',
  workout_id: 'wo-group',
  log_date: '2026-10-28',
  workout_feel: 'hard',
  notes: 'Group session',
};
assert.equal(
  sessionFeedbackMatchesIdentity(groupRow, { userId: 'user-a', workoutId: 'wo-a', logDate: '2026-10-28' }),
  false
);
assert.equal(
  pickSessionFeedback({
    session: { userId: 'user-a', workoutId: 'wo-a', logDate: '2026-10-28', feedbackId: 'fb-group' },
    linked: groupRow,
    latest: saved,
  })?.notes,
  'Solid'
);

const newerSameSession = {
  id: 'fb-newer',
  user_id: 'user-a',
  workout_id: 'wo-a',
  log_date: '2026-10-28',
  workout_feel: 'hard',
  notes: 'Later insert',
};
assert.equal(
  pickSessionFeedback({
    session: completed,
    linked: saved,
    latest: newerSameSession,
  })?.id,
  'fb-1'
);
assert.equal(
  pickSessionFeedback({
    session: { ...completed, feedbackId: null },
    linked: null,
    latest: newerSameSession,
  })?.id,
  'fb-newer'
);

const switchedEmpty = sessionFeedbackStateFromRow(null);
assert.deepEqual(switchedEmpty, { feel: '', pain: '', notes: '' });
assert.equal(
  shouldApplySessionFeedbackHydration({
    loadKey: 'user-a|wo-a|2026-10-21',
    currentKey: 'user-a|wo-a|2026-10-28',
    loadGeneration: 4,
    currentGeneration: 5,
    dirty: false,
  }),
  false
);

const otherUser = { ...saved, id: 'fb-b', user_id: 'user-b', notes: 'Not yours' };
assert.equal(
  pickSessionFeedback({
    session: { userId: 'user-a', workoutId: 'wo-a', logDate: '2026-10-28', feedbackId: 'fb-b' },
    linked: otherUser,
    latest: saved,
  })?.id,
  'fb-1'
);

assert.equal(
  shouldApplySessionFeedbackHydration({
    loadKey: 'user-a|wo-a|2026-10-28',
    currentKey: 'user-a|wo-a|2026-10-28',
    loadGeneration: 1,
    currentGeneration: 1,
    dirty: false,
  }),
  true
);
assert.equal(
  shouldApplySessionFeedbackHydration({
    loadKey: 'user-a|wo-a|2026-10-28',
    currentKey: 'user-a|wo-a|2026-10-28',
    loadGeneration: 1,
    currentGeneration: 2,
    dirty: false,
  }),
  false
);
assert.equal(
  shouldApplySessionFeedbackHydration({
    loadKey: 'user-a|wo-a|2026-10-28',
    currentKey: 'user-a|wo-a|2026-10-21',
    loadGeneration: 2,
    currentGeneration: 2,
    dirty: false,
  }),
  false
);
assert.equal(
  shouldApplySessionFeedbackHydration({
    loadKey: 'user-a|wo-a|2026-10-28',
    currentKey: 'user-a|wo-a|2026-10-28',
    loadGeneration: 3,
    currentGeneration: 3,
    dirty: true,
  }),
  false
);

const failed = sessionFeedbackStateFromRow(null);
assert.deepEqual(failed, { feel: '', pain: '', notes: '' });

const afterClose = sessionFeedbackValuesAfterSheetClose({
  status: 'completed',
  feel: 'good',
  pain: 'none',
  notes: 'Solid',
});
assert.equal(afterClose.notes, 'Solid');
assert.equal(finishWorkoutActionLabel('completed'), 'Review Workout Feedback');
assert.equal(showFinishWorkoutAction({ sessionOpen: true, sessionIntent: 'edit' }), false);
assert.equal(sessionFeedbackSharedInterface('finish').writesOnOpen, false);

assert.equal(
  completedSessionDraft({
    intent: 'log',
    workout: { id: 'wo-a', st_exercises: [{ section: 'strength', st_planned_sets: [{ id: 's1', set_type: 'working' }] }] },
    logs: { s1: { completed: true, planned_set_id: 's1' } },
    logDate: '2026-10-28',
  })?.status,
  'completed'
);
assert.equal(shouldTriggerCompletedWorkoutAdaptation('completed'), true);
assert.equal(shouldTriggerCompletedWorkoutAdaptation('in_progress'), false);

console.log('session-feedback hydrate tests passed');
