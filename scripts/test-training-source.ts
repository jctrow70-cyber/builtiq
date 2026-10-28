/**
 * BIQ-0271 Phase D5: Training source identification.
 * Run: npx tsx scripts/test-training-source.ts
 */
import assert from 'node:assert/strict';
import { emptyDayPlan, overlayVisibleExpectations } from '../lib/programDesign/trainingSchedule';
import { trainingCalendarAction } from '../lib/training/trainingPreview';
import {
  previewSourceMatchesCalendar,
  resolveFollowedAssignmentSource,
  trainingSourceLabel,
} from '../lib/training/trainingSource';
import { sourceLabel } from '../lib/training/unifiedSchedule';

const personal = {
  id: 'personal-1',
  sourceKey: 'personal',
  sourceName: 'Personal',
  title: 'Full Body A',
  completed: true,
};
const namedGroup = {
  id: 'group-1',
  sourceKey: 'group:team-family',
  sourceName: 'Family Group',
  title: 'Strength',
  completed: false,
};
const unnamedGroup = {
  id: 'group-2',
  sourceKey: 'group:team-missing',
  sourceName: null,
  title: 'YMCA Strength Group',
  completed: false,
};
const unknownSource = {
  id: 'future-1',
  sourceKey: 'trainer:coach-1',
  sourceName: null,
  title: 'Coach session',
};

assert.equal(trainingSourceLabel(personal), 'Personal');
assert.equal(trainingSourceLabel(namedGroup), 'Family Group');
assert.equal(trainingSourceLabel(unnamedGroup), 'Group training');
assert.equal(trainingSourceLabel({ sourceKey: 'group:x', sourceName: 'Group' }), 'Group training');
assert.equal(trainingSourceLabel({ source: 'calendar', title: 'Family Group' }), 'Personal');
assert.notEqual(trainingSourceLabel(unnamedGroup), unnamedGroup.title);
assert.equal(trainingSourceLabel({ sourceKey: 'personal', sourceName: 'TrowHoes' }), 'Personal');
assert.equal(trainingSourceLabel({ sourceKey: 'group:trowhoes', sourceName: 'Personal' }), 'Group training');
assert.equal(trainingSourceLabel(unknownSource), 'Training');
assert.notEqual(trainingSourceLabel(unknownSource), 'Personal');
assert.equal(sourceLabel('trainer:coach-1'), 'Training');

const personalEnrollment = resolveFollowedAssignmentSource({
  followedProgramId: 'prog-personal',
  enrollments: [{ status: 'active', programId: 'prog-personal', sourceKey: 'personal' }],
});
assert.equal(personalEnrollment?.sourceName, 'Personal');

const groupEnrollment = resolveFollowedAssignmentSource({
  followedProgramId: 'prog-group',
  enrollments: [
    { status: 'active', programId: 'prog-group', sourceKey: 'group:family', teamName: 'Family Group' },
  ],
});
assert.equal(groupEnrollment?.sourceName, 'Family Group');

const personalCopy = resolveFollowedAssignmentSource({
  followedProgramId: 'prog-just-me',
  enrollments: [
    { status: 'active', programId: 'prog-just-me', sourceKey: 'personal', teamName: 'TrowHoes' },
    { status: 'active', programId: 'prog-group-origin', sourceKey: 'group:trowhoes', teamName: 'TrowHoes' },
  ],
});
assert.equal(personalCopy?.sourceKey, 'personal');
assert.equal(personalCopy?.sourceName, 'Personal');

const groupAssignedOrigin = resolveFollowedAssignmentSource({
  followedProgramId: 'prog-group-origin',
  enrollments: [
    { status: 'active', programId: 'prog-group-origin', sourceKey: 'group:trowhoes', teamName: 'TrowHoes' },
  ],
});
assert.equal(groupAssignedOrigin?.sourceName, 'TrowHoes');

const sameDay = overlayVisibleExpectations(
  {
    ...emptyDayPlan('2026-10-27'),
    items: [
      {
        id: 'followed-personal',
        title: 'Full Body A',
        typeLabel: 'Strength',
        activityType: 'strength',
        duration: '1 hr',
        workoutId: 'w-personal',
        activityId: null,
        isRest: false,
        source: 'program',
        completed: true,
      },
    ],
    primary: null,
    later: [],
  },
  [
    {
      id: 'exp-personal',
      workoutId: 'w-personal',
      programId: 'prog-personal',
      scheduledDate: '2026-10-27',
      title: 'Full Body A',
      sourceKey: 'personal',
      teamId: null,
      sourceName: 'Personal',
      excused: false,
      sessionStatus: 'completed',
    },
    {
      id: 'exp-group',
      workoutId: 'w-group',
      programId: 'prog-group',
      scheduledDate: '2026-10-27',
      title: 'Strength',
      sourceKey: 'group:trowhoes',
      teamId: 'trowhoes',
      sourceName: 'TrowHoes',
      excused: false,
      sessionStatus: null,
    },
  ],
  '2026-10-27'
);
const personalCard = sameDay.items.find((item) => item.workoutId === 'w-personal');
const groupCard = sameDay.items.find((item) => item.workoutId === 'w-group');
assert.equal(trainingSourceLabel(personalCard), 'Personal');
assert.equal(trainingSourceLabel(groupCard), 'TrowHoes');
assert.equal(personalCard?.completed, true);
assert.equal(groupCard?.completed, false);
assert.equal(personalCard?.statusLabel, 'Completed');
assert.equal(groupCard?.statusLabel, 'Scheduled');
assert.notEqual(personalCard?.id, groupCard?.id);
assert.equal(previewSourceMatchesCalendar(personalCard, trainingSourceLabel(personalCard)), true);
assert.equal(previewSourceMatchesCalendar(groupCard, trainingSourceLabel(groupCard)), true);
assert.equal(previewSourceMatchesCalendar(groupCard, 'Personal'), false);

const followedUnmatched = overlayVisibleExpectations(
  {
    ...emptyDayPlan('2026-10-28'),
    items: [
      {
        id: 'followed-b',
        title: 'Full Body B - Posterior Chain and Vertical Pull',
        typeLabel: 'Strength',
        activityType: 'strength',
        duration: '1 hr',
        workoutId: 'w-copy',
        activityId: null,
        isRest: false,
        source: 'program',
      },
    ],
    primary: null,
    later: [],
  },
  [],
  '2026-10-28',
  'prog-group-origin',
  personalCopy
);
assert.equal(trainingSourceLabel(followedUnmatched.items[0]), 'Personal');
assert.notEqual(trainingSourceLabel(followedUnmatched.items[0]), followedUnmatched.items[0].title);

assert.equal(trainingCalendarAction('title', { workoutId: 'w-group', completed: false }), 'preview');
assert.equal(trainingCalendarAction('start', { workoutId: 'w-group', completed: false }), 'log');
assert.equal(trainingCalendarAction('review', { workoutId: 'w-personal', completed: true }), 'log');

const compact = [trainingSourceLabel(personal), trainingSourceLabel(namedGroup), trainingSourceLabel(unnamedGroup)];
assert.equal(compact.every((label) => !!label && label.length <= 24), true);

console.log('training source D5 checks passed');
