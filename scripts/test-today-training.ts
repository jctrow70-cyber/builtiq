/**
 * BIQ-0281 DSH-B: dashboard Today uses the Training schedule pipeline.
 * Run: npx tsx scripts/test-today-training.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decorateDayPlanCompletion } from '../lib/programDesign/activityCompletion';
import { overlayVisibleExpectations, planForCalendarDate } from '../lib/programDesign/trainingSchedule';
import type { ProgramActivity, ProgramDesignRecord } from '../lib/programDesign/types';
import { detailsWithWorkoutDayMove, workoutDayMovesFromDetails } from '../lib/programDesign/workoutDayMoves';
import { trainingDayCardAction } from '../lib/training/trainingDayCard';
import {
  classifyTodayTraining,
  composeTodayTrainingPlan,
  navigationForTodayTraining,
  presentTodayTrainingRow,
  TODAY_TRAINING_LIMIT,
} from '../lib/training/todayTraining';
import { sessionStatusForExpectation } from '../lib/training/visibleSchedule';

const program: ProgramDesignRecord = {
  id: 'prog-1',
  name: 'Group Plan',
  visibility: 'team',
  weeks: 4,
  start_date: '2026-09-14',
  end_date: '2026-10-11',
  status: 'active',
};

const upper: ProgramActivity = {
  id: 'legacy-w-wed',
  program_id: 'prog-1',
  week_number: 1,
  day_of_week: 2,
  sort_order: 0,
  activity_type: 'strength',
  title: 'Upper Body',
  duration_minutes: 45,
  notes: '',
  details: {},
  workout_id: 'w-wed',
};

const lower: ProgramActivity = {
  id: 'legacy-w-wed-2',
  program_id: 'prog-1',
  week_number: 1,
  day_of_week: 2,
  sort_order: 1,
  activity_type: 'strength',
  title: 'Lower Body',
  duration_minutes: 40,
  notes: '',
  details: {},
  workout_id: 'w-wed-2',
};

const extraA: ProgramActivity = {
  id: 'legacy-w-wed-3',
  program_id: 'prog-1',
  week_number: 1,
  day_of_week: 2,
  sort_order: 2,
  activity_type: 'cardio',
  title: 'Intervals',
  duration_minutes: 20,
  notes: '',
  details: {},
  workout_id: null,
};

const extraB: ProgramActivity = {
  id: 'legacy-w-wed-4',
  program_id: 'prog-1',
  week_number: 1,
  day_of_week: 2,
  sort_order: 3,
  activity_type: 'mobility',
  title: 'Hips',
  duration_minutes: 15,
  notes: '',
  details: {},
  workout_id: null,
};

const rest: ProgramActivity = {
  id: 'rest-thu',
  program_id: 'prog-1',
  week_number: 1,
  day_of_week: 3,
  sort_order: 0,
  activity_type: 'rest',
  title: 'Rest',
  duration_minutes: null,
  notes: '',
  details: {},
};

const wednesday = '2026-09-16';
const thursday = '2026-09-17';
const friday = '2026-09-18';

const one = classifyTodayTraining({
  loading: false,
  failed: false,
  programConfigured: true,
  plan: composeTodayTrainingPlan({
    program,
    activities: [upper],
    calendarActivities: [],
    today: wednesday,
    followedSource: { sourceKey: 'personal', sourceName: 'Personal' },
  }),
  followedProgramName: 'Group Plan',
});
assert.equal(one.state, 'activities');
if (one.state === 'activities') {
  assert.equal(one.rows.length, 1);
  assert.equal(one.hiddenCount, 0);
  assert.equal(one.rows[0].name, 'Upper Body');
  assert.match(one.rows[0].meta, /Personal/);
  assert.match(one.rows[0].meta, /Strength/);
  assert.equal(one.rows[0].status, 'Scheduled');
  assert.equal(one.rows[0].action, 'Start');
}

const manyPlan = composeTodayTrainingPlan({
  program,
  activities: [upper, lower, extraA, extraB],
  calendarActivities: [],
  today: wednesday,
});
const manual = overlayVisibleExpectations(
  decorateDayPlanCompletion(
    planForCalendarDate(program, [upper, lower, extraA, extraB], [], wednesday, wednesday, {}),
    { activities: [], workouts: [], progressLogs: [], sessionLogs: {}, selectedDate: wednesday }
  ),
  [],
  wednesday
);
assert.deepEqual(manyPlan.items.map((item) => item.id), manual.items.map((item) => item.id));
assert.deepEqual(manyPlan.items.map((item) => item.title), manual.items.map((item) => item.title));
const many = classifyTodayTraining({ loading: false, failed: false, programConfigured: true, plan: manyPlan });
assert.equal(many.state, 'activities');
if (many.state === 'activities') {
  assert.equal(many.rows.length, TODAY_TRAINING_LIMIT);
  assert.equal(many.hiddenCount, 1);
  assert.deepEqual(many.rows.map((row) => row.name), ['Upper Body', 'Lower Body', 'Intervals']);
}

const moves = workoutDayMovesFromDetails(detailsWithWorkoutDayMove({}, 'w:w-wed', thursday));
const moved = classifyTodayTraining({
  loading: false,
  failed: false,
  programConfigured: true,
  plan: composeTodayTrainingPlan({
    program,
    activities: [upper],
    calendarActivities: [],
    moves,
    today: thursday,
  }),
});
assert.equal(moved.state, 'activities');
if (moved.state === 'activities') {
  assert.equal(moved.rows.length, 1);
  assert.equal(moved.rows[0].item.workoutId, 'w-wed');
  assert.equal(moved.rows[0].item.movedFrom, wednesday);
  assert.match(moved.rows[0].movedLabel || '', /Moved from/);
}
const cleared = composeTodayTrainingPlan({
  program,
  activities: [upper],
  calendarActivities: [],
  moves,
  today: wednesday,
});
assert.equal(cleared.items.some((item) => item.workoutId === 'w-wed'), false);

const duplicate = composeTodayTrainingPlan({
  program,
  activities: [upper],
  calendarActivities: [],
  today: wednesday,
  followedSourceProgramId: 'prog-template',
  followedSource: { sourceKey: 'personal', sourceName: 'Personal' },
  expectations: [
    {
      id: 'exp-template',
      workoutId: 'template-wed',
      programId: 'prog-template',
      scheduledDate: wednesday,
      title: 'Upper Body',
      sourceKey: 'group:team',
      teamId: 'team',
      sourceName: 'Basketball',
      excused: false,
      sessionStatus: null,
    },
  ],
});
assert.equal(duplicate.items.filter((item) => item.title === 'Upper Body').length, 1);
assert.equal(duplicate.items.find((item) => item.title === 'Upper Body')?.workoutId, 'w-wed');
assert.equal(duplicate.items.find((item) => item.title === 'Upper Body')?.sourceName, 'Personal');

const groupAndPersonal = composeTodayTrainingPlan({
  program,
  activities: [upper],
  calendarActivities: [],
  today: wednesday,
  followedSource: { sourceKey: 'personal', sourceName: 'Personal' },
  expectations: [
    {
      id: 'exp-group',
      workoutId: 'w-group',
      programId: 'prog-g',
      scheduledDate: wednesday,
      title: 'Jump Technique',
      sourceKey: 'group:team',
      teamId: 'team',
      sourceName: 'Basketball',
      excused: false,
      sessionStatus: 'in_progress',
    },
  ],
});
assert.equal(groupAndPersonal.items.filter((item) => !item.isRest).length, 2);
const jump = groupAndPersonal.items.find((item) => item.title === 'Jump Technique');
assert.equal(jump?.sourceName, 'Basketball');
assert.equal(jump?.sessionStatus, 'in_progress');
assert.equal(jump?.statusLabel, 'In progress');
const jumpRow = presentTodayTrainingRow(jump!, {
  programNames: { 'prog-g': 'Team Block' },
  followedProgramName: 'Group Plan',
});
assert.match(jumpRow.meta, /Team Block/);
assert.match(jumpRow.meta, /Basketball/);
assert.equal(jumpRow.status, 'In progress');
assert.equal(jumpRow.action, 'Continue');
assert.equal(navigationForTodayTraining({ item: jump!, date: wednesday, action: jumpRow.action }).kind, 'logger');

const workout = {
  id: 'w-wed',
  st_exercises: [
    {
      section: 'strength',
      st_planned_sets: [
        { id: 's1', set_type: 'working' },
        { id: 's2', set_type: 'working' },
      ],
    },
  ],
};
const baseItem = {
  id: 'legacy-w-wed',
  title: 'Upper Body',
  typeLabel: 'Strength',
  activityType: 'strength',
  duration: '45 min',
  workoutId: 'w-wed',
  activityId: null,
  isRest: false,
  source: 'program' as const,
  sourceKey: 'personal',
  sourceName: 'Personal',
};

function rowFor(patch: Record<string, unknown>, logs: Record<string, { completed?: boolean; planned_set_id?: string }> = {}) {
  return presentTodayTrainingRow({ ...baseItem, ...patch }, { workoutsById: { 'w-wed': workout }, logMap: logs });
}

const started = rowFor({}, { s1: { completed: true, planned_set_id: 's1' } });
assert.equal(started.status, 'In progress');
assert.equal(started.action, 'Continue');
assert.notEqual(started.status, 'Completed');

const done = rowFor({ completed: true, sessionStatus: 'completed', statusLabel: 'Completed' });
assert.equal(done.status, 'Completed');
assert.equal(done.action, 'Review');
assert.equal(navigationForTodayTraining({ item: done.item, date: wednesday, action: done.action }).kind, 'logger');
assert.equal(navigationForTodayTraining({ item: done.item, date: wednesday, action: 'preview' }).kind, 'preview');

const partial = rowFor({ sessionStatus: 'partial', statusLabel: 'Partial' });
assert.equal(partial.status, 'Partial');
assert.equal(partial.action, 'Continue');

const skipped = rowFor({ sessionStatus: 'skipped', statusLabel: 'Skipped' });
assert.equal(skipped.status, 'Skipped');
assert.equal(skipped.action, 'Review');
assert.equal(navigationForTodayTraining({ item: skipped.item, date: wednesday, action: 'Review' }).kind, 'logger');

const missed = rowFor({ statusLabel: 'Missed', sessionStatus: null, completed: false });
assert.equal(missed.status, 'Missed');
assert.equal(missed.action, null);
const missedStarted = rowFor(
  { statusLabel: 'Missed', sessionStatus: 'in_progress', completed: false },
  { s1: { completed: true, planned_set_id: 's1' } }
);
assert.equal(missedStarted.status, 'Missed');
assert.notEqual(missedStarted.status, 'In progress');
const explicitPartial = rowFor(
  { completed: true, sessionStatus: 'partial', statusLabel: 'Partial' },
  { s1: { completed: true, planned_set_id: 's1' }, s2: { completed: true, planned_set_id: 's2' } }
);
assert.equal(explicitPartial.status, 'Partial');
assert.notEqual(explicitPartial.status, 'Completed');
assert.equal(explicitPartial.action, 'Review');
assert.equal(explicitPartial.action, trainingDayCardAction({ canStart: true, completed: !!explicitPartial.item.completed }));
assert.equal(navigationForTodayTraining({ item: explicitPartial.item, date: wednesday, action: explicitPartial.action }).kind, 'logger');
const unfinishedPartial = rowFor(
  { completed: false, sessionStatus: 'partial', statusLabel: 'Partial' },
  { s1: { completed: true, planned_set_id: 's1' } }
);
assert.equal(unfinishedPartial.status, 'Partial');
assert.notEqual(unfinishedPartial.status, 'Completed');
assert.equal(unfinishedPartial.action, 'Continue');
assert.equal(navigationForTodayTraining({ item: unfinishedPartial.item, date: wednesday, action: unfinishedPartial.action }).kind, 'logger');
assert.equal(navigationForTodayTraining({ item: missed.item, date: wednesday, action: 'Start' }).kind, 'logger');

const cardio = {
  id: 'cal-run',
  title: 'Easy run',
  typeLabel: 'Cardio',
  activityType: 'cardio',
  duration: '30 min',
  workoutId: null,
  activityId: 'cal-run',
  isRest: false,
  source: 'calendar' as const,
  sourceKey: 'personal',
  sourceName: 'Personal',
};
const run = presentTodayTrainingRow(cardio, {});
assert.equal(run.action, 'Mark complete');
assert.equal(run.canPreview, false);
assert.equal(navigationForTodayTraining({ item: cardio, date: wednesday, action: 'Mark complete' }).kind, 'checkoff');
assert.equal(navigationForTodayTraining({ item: cardio, date: wednesday, action: 'Start' }).kind, 'none');
assert.equal(navigationForTodayTraining({ item: cardio, date: wednesday, action: 'Continue' }).kind, 'none');

const setupItem = { ...cardio, id: 'cal-strength', title: 'Garage session', activityType: 'strength', typeLabel: 'Strength' };
const setup = presentTodayTrainingRow(setupItem, {});
assert.equal(setup.action, 'Set up');
const setupNav = navigationForTodayTraining({ item: setupItem, date: wednesday, action: 'Set up' });
assert.equal(setupNav.kind, 'setup');
assert.equal(navigationForTodayTraining({ item: setupItem, date: wednesday, action: 'Start' }).kind, 'none');

const restDay = classifyTodayTraining({
  loading: false,
  failed: false,
  programConfigured: true,
  plan: composeTodayTrainingPlan({ program, activities: [rest], calendarActivities: [], today: thursday }),
});
assert.equal(restDay.state, 'rest');

const openDay = classifyTodayTraining({
  loading: false,
  failed: false,
  programConfigured: true,
  plan: composeTodayTrainingPlan({ program, activities: [upper], calendarActivities: [], today: friday }),
});
assert.equal(openDay.state, 'empty');

assert.equal(classifyTodayTraining({ loading: false, failed: false, programConfigured: false, plan: composeTodayTrainingPlan({ program: null, activities: [], calendarActivities: [], today: wednesday }) }).state, 'no-program');
assert.equal(classifyTodayTraining({ loading: true, failed: false, programConfigured: false, plan: null }).state, 'loading');
assert.equal(classifyTodayTraining({ loading: false, failed: true, programConfigured: true, plan: manyPlan }).state, 'error');

const pastOverlay = overlayVisibleExpectations(
  decorateDayPlanCompletion(
    planForCalendarDate(program, [upper], [], wednesday, friday, {}),
    { activities: [], workouts: [], progressLogs: [], sessionLogs: {}, selectedDate: wednesday }
  ),
  [
    {
      id: 'exp-past',
      workoutId: 'w-wed',
      programId: 'prog-1',
      scheduledDate: wednesday,
      title: 'Upper Body',
      sourceKey: 'personal',
      teamId: null,
      sourceName: 'Personal',
      excused: false,
      sessionStatus: 'in_progress',
    },
  ],
  friday
);
assert.equal(pastOverlay.items.find((item) => item.workoutId === 'w-wed')?.statusLabel, 'Missed');

const pendingDay = classifyTodayTraining({
  loading: false,
  failed: false,
  programConfigured: true,
  schedulePending: true,
  plan: composeTodayTrainingPlan({ program, activities: [upper], calendarActivities: [], today: wednesday }),
});
assert.equal(pendingDay.state, 'activities');
if (pendingDay.state === 'activities') assert.equal(pendingDay.notice?.kind, 'pending');

const incompleteDay = classifyTodayTraining({
  loading: false,
  failed: false,
  programConfigured: true,
  scheduleError: 'Could not load expectations.',
  plan: composeTodayTrainingPlan({ program, activities: [upper], calendarActivities: [], today: wednesday }),
});
assert.equal(incompleteDay.state, 'activities');
if (incompleteDay.state === 'activities') {
  assert.equal(incompleteDay.notice?.kind, 'incomplete');
  assert.equal(incompleteDay.rows[0].name, 'Upper Body');
}

assert.equal(sessionStatusForExpectation({ id: 'exp-1', workout_id: 'w-wed', scheduled_date: wednesday }, [{ expectation_id: 'exp-1', status: 'partial' }]), 'partial');
assert.equal(sessionStatusForExpectation({ id: 'exp-2', workout_id: 'w-other', scheduled_date: wednesday }, [{ workout_id: 'w-wed', log_date: wednesday, status: 'in_progress' }]), null);

const page = readFileSync('app/page.tsx', 'utf8');
const opener = page.slice(page.indexOf('function openTodayTraining'), page.indexOf('async function previewTrainingItem'));
assert.match(opener, /function openTodayTraining/);
assert.doesNotMatch(opener, /setTrainingSubNav/);
assert.match(opener, /if\(!nav\.item\.workoutId\)return/);
assert.match(opener, /beginTrainingItem/);
assert.match(opener, /previewTrainingItem/);
assert.doesNotMatch(page, /openDashboardWorkout|loadDashboardProgram|workoutAppearsOnDate|setDashboardTodayLogs/);
assert.match(page, /viewingMember&&viewingMember\.user_id!==session\.user\.id\)\?logs:\{\}/);

const loader = readFileSync('lib/training/visibleSchedule.ts', 'utf8');
assert.match(loader, /\.eq\('user_id', input\.userId\)/);
assert.doesNotMatch(loader, /st_team_members|st_set_logs/);
const hero = readFileSync('app/components/dashboard/TodaysTrainingHero.tsx', 'utf8');
assert.match(hero, /composeTodayTrainingPlan/);
assert.match(hero, /loadVisibleSchedule/);
assert.doesNotMatch(hero, /st_team_members|st_set_logs|memberStats/);

console.log('today training tests passed');
