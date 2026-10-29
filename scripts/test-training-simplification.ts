/**
 * BIQ-0271 Phase D6 slice 1: selected-day cards, calendar heading, session feedback.
 * Run: npx tsx scripts/test-training-simplification.ts
 */
import assert from 'node:assert/strict';
import { trainingCalendarAction } from '../lib/training/trainingPreview';
import { trainingSourceLabel } from '../lib/training/trainingSource';
import {
  TRAINING_CALENDAR_VIEWS,
  showEmptyDayAdd,
  trainingDayCardAction,
  trainingDayCardLine,
  trainingDayCardShowsStatus,
  trainingDayCardTitleAria,
  trainingPageHeading,
} from '../lib/training/trainingDayCard';
import {
  sessionFeedbackDefaultExpanded,
  sessionFeedbackShouldReveal,
  sessionFeedbackSummary,
  sessionFeedbackValuesAfterToggle,
} from '../lib/training/sessionFeedback';

const personalItem = {
  workoutId: 'w-personal',
  completed: false,
  sourceKey: 'personal',
  sourceName: 'Personal',
  typeLabel: 'Strength',
  title: 'Full Body B',
};
const groupItem = {
  workoutId: 'w-group',
  completed: false,
  sourceKey: 'group:trowhoes',
  sourceName: 'TrowHoes',
  typeLabel: 'Strength',
  title: 'Full Body B',
};
const completedPersonal = { ...personalItem, completed: true, statusLabel: 'Completed' };

assert.equal(trainingCalendarAction('title', personalItem), 'preview');
assert.equal(trainingCalendarAction('start', personalItem), 'log');
assert.equal(trainingCalendarAction('review', completedPersonal), 'log');
assert.notEqual(trainingCalendarAction('title', personalItem), 'log');
assert.notEqual(trainingCalendarAction('start', personalItem), 'preview');

assert.equal(trainingSourceLabel(personalItem), 'Personal');
assert.equal(trainingSourceLabel(groupItem), 'TrowHoes');
assert.equal(
  trainingDayCardLine({
    source: 'Personal',
    typeLabel: 'Strength',
    duration: '62 min',
    focus: 'Full Body',
  }),
  'Personal · Strength · 62 min · Full Body'
);
assert.equal(
  trainingDayCardLine({ source: 'TrowHoes', typeLabel: 'Strength', duration: '62 min' }),
  'TrowHoes · Strength · 62 min'
);
assert.equal(trainingDayCardLine({ source: 'Personal', typeLabel: 'Strength' }), 'Personal · Strength');

assert.equal(trainingDayCardAction({ canStart: true, completed: false }), 'Start');
assert.equal(trainingDayCardAction({ canStart: true, completed: true }), 'Review');
assert.equal(trainingDayCardAction({ canStart: false, completed: false }), null);

assert.equal(trainingDayCardShowsStatus({ statusLabel: 'Scheduled', canStart: true }), false);
assert.equal(trainingDayCardShowsStatus({ statusLabel: 'Completed', canStart: true }), false);
assert.equal(trainingDayCardShowsStatus({ statusLabel: 'Missed', canStart: true }), true);
assert.equal(trainingDayCardShowsStatus({ statusLabel: 'Partial', canStart: true }), true);
assert.equal(trainingDayCardShowsStatus({ statusLabel: 'Scheduled', canStart: false }), true);

assert.equal(
  trainingDayCardTitleAria({ name: 'Full Body B', canPreview: true }),
  'View details for Full Body B'
);
assert.equal(trainingDayCardTitleAria({ name: 'Full Body B', canPreview: false }), undefined);

assert.equal(showEmptyDayAdd(true), false);
assert.equal(showEmptyDayAdd(false), true);

assert.deepEqual(TRAINING_CALENDAR_VIEWS, ['day', 'week', 'month']);

const calendarHeading = trainingPageHeading({
  sessionOpen: false,
  selectedDateLabel: 'Wednesday, October 28',
});
assert.equal(calendarHeading.title, 'Training');
assert.equal(calendarHeading.subtitle, 'Wednesday, October 28');
assert.notEqual(calendarHeading.title, 'Today');
assert.notEqual(calendarHeading.title, 'This day');

const workoutHeading = trainingPageHeading({ sessionOpen: true, sessionIntent: 'log' });
assert.equal(workoutHeading.title, 'Workout');
assert.equal(workoutHeading.subtitle, undefined);

const editHeading = trainingPageHeading({ sessionOpen: true, sessionIntent: 'edit' });
assert.equal(editHeading.title, 'Edit workout');

assert.equal(sessionFeedbackDefaultExpanded('not_started'), false);
assert.equal(sessionFeedbackDefaultExpanded('in_progress'), false);
assert.equal(sessionFeedbackDefaultExpanded('completed'), true);
assert.equal(sessionFeedbackDefaultExpanded('partial'), true);
assert.equal(sessionFeedbackDefaultExpanded('skipped'), true);

assert.equal(sessionFeedbackShouldReveal('not_started'), false);
assert.equal(sessionFeedbackShouldReveal('skipped'), true);
assert.equal(sessionFeedbackShouldReveal('completed'), true);

assert.equal(
  sessionFeedbackSummary({ status: 'completed', feel: 'good', pain: 'none', notes: 'Solid' }),
  'Completed · good · Notes'
);
assert.equal(sessionFeedbackSummary({ status: 'skipped', skipReason: 'time' }), 'Skipped · time');
assert.equal(sessionFeedbackSummary({ status: 'not_started' }), '');

const saved = { status: 'completed', feel: 'good', pain: 'none', notes: 'Solid', skipReason: '' };
assert.deepEqual(sessionFeedbackValuesAfterToggle(saved), saved);
assert.equal(sessionFeedbackValuesAfterToggle(saved).notes, 'Solid');
assert.equal(sessionFeedbackValuesAfterToggle(saved).feel, 'good');

console.log('training-simplification: ok');
