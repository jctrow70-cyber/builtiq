/**
 * BIQ-0263 Phase 3B group strength workout draft, assignment, and calendar display.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-group-strength-workout.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGroupCalendar } from '../lib/groups/groupCalendar';
import { mapListedGroupActivity } from '../lib/groups/groupActivities';
import { groupRepeatSave } from '../lib/groups/groupActivityRepeat';
import {
  eligibleGroupProgramWorkouts,
  groupStrengthSaveArgs,
  resolveGroupStrengthRecipients,
} from '../lib/groups/groupStrengthWorkout';
import { addActivityChoices } from '../lib/groups/trainingWorkspace';
import {
  addDraftExercise,
  addDraftSet,
  emptyDraftWorkout,
  groupStrengthExercisePayload,
  moveDraftExercise,
  updateDraftExercise,
  updateDraftSet,
  validateGroupStrengthDraft,
} from '../lib/training/draftWorkout';
import { emptyAddPanelConfig } from '../lib/training/workoutTemplate';

const barbell = {
  id: 'cat-barbell-squat',
  name: 'Back Squat',
  muscle_group: 'Quads',
  equipment: 'Barbell',
  coaching_metadata: { compatible_equipment: ['Barbell', 'Dumbbell'] },
  exercise_type: 'strength',
};
const dumbbell = {
  id: 'cat-dumbbell-squat',
  name: 'Back Squat',
  muscle_group: 'Quads',
  equipment: 'Dumbbell',
  exercise_type: 'strength',
};
const row = {
  id: 'cat-row',
  name: 'Chest Supported Row',
  muscle_group: 'Back',
  equipment: 'Dumbbell',
  exercise_type: 'strength',
};

function add(workout: ReturnType<typeof emptyDraftWorkout>, picked: typeof barbell, section: string, extra: Partial<ReturnType<typeof emptyAddPanelConfig>> = {}) {
  const result = addDraftExercise(workout, {
    section,
    picked,
    config: { ...emptyAddPanelConfig(), setCount: section === 'warmup' ? 1 : 2, ...extra },
  });
  assert.equal(result.error, null);
  return result;
}

let draft = emptyDraftWorkout('Shelf');
assert.equal(validateGroupStrengthDraft(draft), 'Add at least one exercise.');

const warmup = add(draft, { ...barbell, id: 'cat-warmup', name: 'Bodyweight Squat', equipment: 'Bodyweight' }, 'warmup');
draft = warmup.workout;
const strength = add(draft, barbell, 'strength', { targetReps: '5', targetWeight: '185' });
draft = strength.workout;
const paired = add(draft, dumbbell, 'strength', { mode: 'superset', supersetGroupId: '__new__' });
draft = paired.workout;
const second = add(draft, row, 'strength', { mode: 'superset', supersetGroupId: paired.supersetGroupId || '' });
draft = second.workout;
assert.equal(second.openAnother, true);
assert.equal(paired.supersetGroupId, second.supersetGroupId);

const squat = draft.st_exercises.find((exercise) => exercise.catalog_exercise_id === barbell.id);
const dbSquat = draft.st_exercises.find((exercise) => exercise.catalog_exercise_id === dumbbell.id);
assert.ok(squat && dbSquat);
assert.notEqual(squat.catalog_exercise_id, dbSquat.catalog_exercise_id);
assert.equal(squat.equipment, 'Barbell');
assert.equal(dbSquat.equipment, 'Dumbbell');
assert.equal(squat.st_planned_sets[0].set_type, 'working');
assert.equal(squat.st_planned_sets[0].target_reps, '5');
assert.equal(squat.st_planned_sets[0].target_weight, '185');
assert.equal(draft.st_exercises.find((exercise) => exercise.section === 'warmup')?.st_planned_sets[0].set_type, 'warmup');

draft = updateDraftSet(draft, squat.id, squat.st_planned_sets[0].id, 'target_rir', '2');
draft = updateDraftSet(draft, squat.id, squat.st_planned_sets[0].id, 'rest_seconds', '90');
draft = updateDraftSet(draft, squat.id, squat.st_planned_sets[1].id, 'set_type', 'warmup');
draft = addDraftSet(draft, squat.id);
const moved = moveDraftExercise(draft, dbSquat.id, -1);
assert.notEqual(
  moved.st_exercises.find((exercise) => exercise.id === dbSquat.id)?.sort_order,
  dbSquat.sort_order
);
draft = updateDraftExercise(moved, squat.id, { equipment: 'Dumbbell' });
assert.equal(draft.st_exercises.find((exercise) => exercise.id === squat.id)?.equipment, 'Dumbbell');
assert.equal(draft.st_exercises.find((exercise) => exercise.id === squat.id)?.catalog_exercise_id, barbell.id);

const payload = groupStrengthExercisePayload(draft);
const savedSquat = payload.find((exercise) => exercise.catalog_exercise_id === barbell.id);
const savedDumbbell = payload.find((exercise) => exercise.catalog_exercise_id === dumbbell.id);
const savedRow = payload.find((exercise) => exercise.catalog_exercise_id === row.id);
assert.ok(savedSquat && savedDumbbell && savedRow);
assert.equal(savedSquat.equipment, 'Dumbbell');
assert.equal(savedSquat.sets[0].target_rir, 2);
assert.equal(savedSquat.sets[0].rest_seconds, 90);
assert.equal(savedSquat.sets[1].set_type, 'warmup');
assert.equal(savedSquat.sets.length, 3);
assert.equal(savedDumbbell.superset_key, savedRow.superset_key);
assert.equal(savedSquat.superset_key, null);
assert.equal(validateGroupStrengthDraft(draft), null);

const repeat = groupRepeatSave({ mode: 'custom', weekdays: [0, 2], until: '2026-12-31' }, '2026-10-21');
const args = groupStrengthSaveArgs({
  teamId: 'team-1',
  title: '  Lower  ',
  scheduledDate: '2026-10-21',
  memberUserIds: ['amy', 'mike'],
  requestKey: 'req-1',
  notes: ' optional ',
  required: true,
  exercises: payload,
  ...repeat,
});
assert.equal(args.p_title, 'Lower');
assert.equal(args.p_recurrence, 'weekly');
assert.deepEqual(args.p_recurrence_weekdays, [0, 2]);
assert.equal(args.p_recurrence_until, '2026-12-31');
assert.equal(args.p_notes, 'optional');
assert.equal(args.p_required, true);
assert.equal(args.p_exercises, payload);
const once = groupStrengthSaveArgs({
  teamId: 'team-1',
  title: '',
  scheduledDate: '2026-10-21',
  memberUserIds: ['amy'],
  requestKey: 'req-2',
  exercises: payload,
  ...groupRepeatSave({ mode: 'none', weekdays: [2], until: '2026-12-31' }, '2026-10-21'),
});
assert.equal(once.p_title, 'Workout');
assert.equal(once.p_recurrence, 'none');
assert.deepEqual(once.p_recurrence_weekdays, []);
assert.equal(once.p_recurrence_until, null);

assert.deepEqual(
  resolveGroupStrengthRecipients({ mode: 'self', viewerUserId: 'amy', selectedUserIds: [], groupUserIds: ['amy', 'mike'], canAssign: false }),
  { userIds: ['amy'] }
);
assert.deepEqual(
  resolveGroupStrengthRecipients({ mode: 'members', viewerUserId: 'owner', selectedUserIds: ['mike'], groupUserIds: ['owner', 'amy', 'mike'], canAssign: true }),
  { userIds: ['mike'] }
);
const several = resolveGroupStrengthRecipients({
  mode: 'members',
  viewerUserId: 'owner',
  selectedUserIds: ['amy', 'mike', 'amy'],
  groupUserIds: ['owner', 'amy', 'mike'],
  canAssign: true,
});
assert.ok('userIds' in several);
assert.deepEqual(several.userIds, ['amy', 'mike']);
assert.deepEqual(
  resolveGroupStrengthRecipients({ mode: 'group', viewerUserId: 'owner', selectedUserIds: [], groupUserIds: ['owner', 'amy', 'mike'], canAssign: true }),
  { userIds: ['owner', 'amy', 'mike'] }
);
assert.match(
  String(resolveGroupStrengthRecipients({ mode: 'members', viewerUserId: 'amy', selectedUserIds: ['mike'], groupUserIds: ['amy', 'mike'], canAssign: false }).error),
  /yourself/
);
assert.match(
  String(resolveGroupStrengthRecipients({ mode: 'group', viewerUserId: 'amy', selectedUserIds: [], groupUserIds: ['amy', 'mike'], canAssign: false }).error),
  /yourself/
);
assert.match(
  String(resolveGroupStrengthRecipients({ mode: 'self', viewerUserId: 'amy', selectedUserIds: [], groupUserIds: ['amy'], canAssign: false, required: true }).error),
  /required/
);
assert.match(
  String(resolveGroupStrengthRecipients({ mode: 'members', viewerUserId: 'owner', selectedUserIds: ['outsider'], groupUserIds: ['owner', 'amy'], canAssign: true }).error),
  /Member not found/
);
assert.match(
  String(resolveGroupStrengthRecipients({ mode: 'members', viewerUserId: 'owner', selectedUserIds: [], groupUserIds: ['owner'], canAssign: true }).error),
  /at least one member/
);

const choices = eligibleGroupProgramWorkouts([
  { id: 'personal', name: 'My plan', visibility: 'personal', st_workouts: [{ id: 'personal-day', day_label: 'Push' }] },
  { id: 'shelf', name: 'Group strength workouts', visibility: 'team', program_use: 'group_strength_shelf', st_workouts: [{ id: 'shelf-day', day_label: 'Custom' }] },
  {
    id: 'team-program',
    name: 'Team Base',
    visibility: 'team',
    program_use: 'training',
    st_workouts: [
      { id: 'day-b', week: 1, day_order: 2, day_label: 'Pull' },
      { id: 'day-a', week: 1, day_order: 1, day_label: 'Push' },
    ],
  },
]);
assert.deepEqual(choices.map((choice) => choice.workoutId), ['day-a', 'day-b']);
assert.equal(choices[0].programId, 'team-program');
assert.equal(addActivityChoices({ id: 'personal', name: 'My plan', visibility: 'personal', workouts: [] }, 'ready').reason, 'personal');

const listed = mapListedGroupActivity(
  {
    series_id: 'series-1',
    occurrence_id: 'occ-1',
    user_id: 'amy',
    original_date: '2026-10-21',
    occurrence_date: '2026-10-21',
    activity_type: 'strength',
    title: 'Lower',
    workout_id: 'occurrence-copy',
    virtual: false,
  },
  { id: 'series-1', workout_id: 'series-workout', recurrence: 'weekly', recurrence_weekdays: [2] }
);
assert.equal(listed?.workoutId, 'occurrence-copy');

const week = buildGroupCalendar({
  weekStart: '2026-10-19',
  today: '2026-10-21',
  teamId: 'team-1',
  expectations: [],
  members: [
    { userId: 'amy', name: 'Amy' },
    { userId: 'mike', name: 'Mike' },
  ],
  visibleUserIds: ['amy'],
  completionKnown: true,
  extras: [
    {
      id: 'amy-today',
      userId: 'amy',
      date: '2026-10-21',
      title: 'Lower',
      activityType: 'strength',
      workoutId: 'shelf-workout',
      required: false,
      completed: false,
      recurrence: 'weekly',
    },
    {
      id: 'mike-today',
      userId: 'mike',
      date: '2026-10-21',
      title: 'Lower',
      activityType: 'strength',
      workoutId: 'shelf-workout',
      required: false,
      completed: false,
    },
    {
      id: 'amy-next',
      userId: 'amy',
      date: '2026-10-28',
      title: 'Lower',
      activityType: 'strength',
      workoutId: 'shelf-workout',
      required: false,
      completed: false,
      virtual: true,
    },
  ],
});
const wednesday = week.days.find((day) => day.date === '2026-10-21');
assert.equal(wednesday?.workouts.length, 1);
assert.equal(wednesday?.workouts[0].memberName, 'Amy');
assert.equal(wednesday?.workouts[0].title, 'Lower');
assert.equal(wednesday?.workouts[0].workoutId, 'shelf-workout');
assert.equal(wednesday?.workouts[0].origin, 'extra');
assert.equal(week.days.some((day) => day.workouts.some((card) => card.userId === 'mike' || card.date === '2026-10-28')), false);

const nextWeek = buildGroupCalendar({
  weekStart: '2026-10-26',
  today: '2026-10-21',
  teamId: 'team-1',
  expectations: [],
  members: [{ userId: 'amy', name: 'Amy' }],
  visibleUserIds: ['amy'],
  completionKnown: true,
  extras: [
    {
      id: 'amy-next',
      userId: 'amy',
      date: '2026-10-28',
      title: 'Lower',
      activityType: 'strength',
      workoutId: 'shelf-workout',
      required: false,
      completed: false,
      virtual: true,
      recurrence: 'weekly',
    },
  ],
});
assert.equal(nextWeek.days.find((day) => day.date === '2026-10-28')?.workouts[0].title, 'Lower');

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const editor = source('../app/components/training/WorkoutTemplateEditor.tsx');
assert.match(editor, /st_exercises/);
assert.doesNotMatch(editor, /st_save_group_strength_workout/);
const memberProfile = source('../app/components/groups/MemberTrainingWorkspace.tsx');
assert.match(memberProfile, /Add Activity/);
assert.doesNotMatch(memberProfile, /st_save_group_strength_workout/);
const calendar = source('../app/components/groups/GroupTrainingCalendar.tsx');
assert.match(calendar, /Add Activity/);
assert.match(calendar, /GroupCalendarActivitySheet/);
const sheet = source('../app/components/groups/GroupCalendarActivitySheet.tsx');
assert.match(sheet, /saveGroupStrengthWorkout/);
assert.match(sheet, /saveGroupActivity/);
assert.doesNotMatch(sheet, /st_training_enrollments|st_training_expectations/);
const saveModule = source('../lib/groups/groupStrengthWorkout.ts');
assert.match(saveModule, /st_save_group_strength_workout/);
assert.doesNotMatch(saveModule, /st_training_enrollments|st_training_expectations/);
const css = source('../app/globals.css');
assert.match(css, /group-calendar-mobile/);
assert.match(css, /group-strength-sheet/);

console.log('group strength workout phase 3b checks passed');
