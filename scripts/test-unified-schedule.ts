import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyDayPlan, overlayVisibleExpectations, type TrainingDayItem } from '../lib/programDesign/trainingSchedule';
import { weekForDate } from '../lib/training/programCalendar';
import {
  adherenceCounts,
  buildProgramExpectationDates,
  countsForGroup,
  expectationDisplayState,
  pastRowsStay,
  scheduleWeekNumber,
  sessionFulfillsExpectation,
  sourceLabel,
  todayFollowsEdit,
} from '../lib/training/unifiedSchedule';

const monday = '2026-10-05';
const wednesday = '2026-10-07';
const thursday = '2026-10-08';

const personal = buildProgramExpectationDates({
  sourceKind: 'personal',
  programStart: monday,
  startsOn: monday,
  cycleWeeks: 4,
  effectiveOn: monday,
  workouts: [
    { id: 'p-mon', week: 1, dayLabel: 'Mon', title: 'Full Body' },
    { id: 'p-wed', week: 1, dayLabel: 'Wed', title: 'Full Body' },
    { id: 'p-fri', week: 1, dayLabel: 'Fri', title: 'Full Body' },
  ],
});
const basketball = buildProgramExpectationDates({
  sourceKind: 'group',
  programStart: monday,
  startsOn: monday,
  cycleWeeks: 4,
  effectiveOn: monday,
  workouts: [{ id: 'b-tue', week: 1, dayLabel: 'Tue', title: 'Jump Technique' }],
});
const family = buildProgramExpectationDates({
  sourceKind: 'group',
  programStart: monday,
  startsOn: monday,
  cycleWeeks: 4,
  effectiveOn: monday,
  workouts: [{ id: 'f-thu', week: 1, dayLabel: 'Thu', title: 'Family Day' }],
});
const week = [...personal, ...basketball, ...family, { workoutId: 'assign-sun', scheduledDate: '2026-10-11', dayLabel: 'Sun', title: 'Extra' }].filter(
  (row) => row.scheduledDate >= monday && row.scheduledDate <= '2026-10-11'
);
assert.deepEqual(
  week.map((row) => row.scheduledDate).sort(),
  ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-11']
);

const tuesdayPair = buildProgramExpectationDates({
  sourceKind: 'personal',
  programStart: monday,
  cycleWeeks: 1,
  effectiveOn: monday,
  workouts: [
    { id: 'skill', week: 1, dayLabel: 'Tue', title: 'Skill' },
    { id: 'lift', week: 1, dayLabel: 'Tue', title: 'Lift' },
  ],
});
assert.equal(tuesdayPair.filter((row) => row.scheduledDate === '2026-10-06').length, 2);

assert.equal(sourceLabel('group:team-1', 'Basketball'), 'Basketball');
assert.equal(sourceLabel('personal'), 'Personal');

const joinedLate = buildProgramExpectationDates({
  sourceKind: 'group',
  programStart: '2026-09-07',
  startsOn: wednesday,
  cycleWeeks: 8,
  effectiveOn: wednesday,
  workouts: [
    { id: 'early', week: 1, dayLabel: 'Mon', title: 'Week 1' },
    { id: 'now', week: 5, dayLabel: 'Wed', title: 'Current' },
  ],
});
assert.equal(joinedLate.some((row) => row.scheduledDate < wednesday), false);
assert.ok(joinedLate.some((row) => row.workoutId === 'now'));

const oneWeek = buildProgramExpectationDates({
  sourceKind: 'group',
  programStart: monday,
  cycleWeeks: 1,
  effectiveOn: monday,
  workouts: [
    { id: 'only', week: 1, dayLabel: 'Mon', title: 'Only' },
    { id: 'beyond', week: 2, dayLabel: 'Mon', title: 'Beyond' },
  ],
});
assert.deepEqual(oneWeek.map((row) => row.workoutId), ['only']);
assert.equal(oneWeek.some((row) => row.scheduledDate > '2026-10-11'), false);
assert.equal(weekForDate(monday, '2026-10-19', 1), 1);
assert.equal(scheduleWeekNumber(monday, '2026-10-19', 1), null);

const history = [
  { scheduledDate: '2026-10-05', programId: 'old' },
  { scheduledDate: '2026-10-06', programId: 'old' },
  { scheduledDate: '2026-10-07', programId: 'old' },
  { scheduledDate: '2026-10-08', programId: 'old' },
];
assert.deepEqual(
  pastRowsStay(history, wednesday).map((row) => row.scheduledDate),
  ['2026-10-05', '2026-10-06']
);
assert.equal(todayFollowsEdit(false), true);
assert.equal(todayFollowsEdit(true), false);

const mixed = [
  { scheduledDate: '2026-10-05', sessionStatus: 'completed' as const, sourceKey: 'personal', origin: 'program' as const },
  { scheduledDate: '2026-10-05', sessionStatus: 'completed' as const, sourceKey: 'group:ball', origin: 'program' as const, teamId: 'ball' },
  { scheduledDate: '2026-10-06', sourceKey: 'group:ball', origin: 'assignment' as const, teamId: 'ball' },
  { scheduledDate: '2026-10-06', sessionStatus: 'completed' as const, sourceKey: 'group:family', origin: 'program' as const, teamId: 'family' },
];
const ball = countsForGroup(mixed, 'ball', wednesday);
assert.equal(ball.expected_past, 2);
assert.equal(ball.completed_past, 1);
assert.equal(ball.missed, 1);
assert.equal(countsForGroup(mixed, 'family', wednesday).completed_past, 1);
assert.equal(adherenceCounts(mixed.filter((row) => row.sourceKey === 'personal'), wednesday).completed_past, 1);

const hidden = [
  { sourceKey: 'group:old', scheduleVisible: false },
  { sourceKey: 'group:followed', scheduleVisible: true },
];
assert.deepEqual(
  hidden.filter((row) => row.scheduleVisible).map((row) => row.sourceKey),
  ['group:followed']
);

assert.equal(
  sessionFulfillsExpectation({ expectationId: 'exp-1', workoutId: 'other', logDate: wednesday }, { id: 'exp-1', workoutId: 'planned', scheduledDate: wednesday }),
  true
);
assert.equal(
  sessionFulfillsExpectation({ workoutId: 'planned', logDate: wednesday }, { id: 'exp-1', workoutId: 'planned', scheduledDate: wednesday }),
  true
);
assert.equal(
  sessionFulfillsExpectation({ workoutId: 'other', logDate: wednesday }, { id: 'exp-1', workoutId: 'planned', scheduledDate: wednesday }),
  false
);

const wednesdayMorning = adherenceCounts(
  [
    { scheduledDate: '2026-10-05', sessionStatus: 'completed' },
    { scheduledDate: '2026-10-06', sessionStatus: 'completed' },
    { scheduledDate: wednesday },
  ],
  wednesday
);
assert.equal(wednesdayMorning.expected_past, 2);
assert.equal(wednesdayMorning.completed_past, 2);
assert.equal(wednesdayMorning.due_today, 1);
assert.equal(wednesdayMorning.missed, 0);
assert.equal(wednesdayMorning.completion_rate, 100);

const thursdayAfterMiss = adherenceCounts(
  [
    { scheduledDate: '2026-10-05', sessionStatus: 'completed' },
    { scheduledDate: '2026-10-06', sessionStatus: 'completed' },
    { scheduledDate: wednesday },
  ],
  thursday
);
assert.equal(thursdayAfterMiss.expected_past, 3);
assert.equal(thursdayAfterMiss.completed_past, 2);
assert.equal(thursdayAfterMiss.missed, 1);
assert.equal(thursdayAfterMiss.due_today, 0);
assert.equal(thursdayAfterMiss.completion_rate, 66.7);

const trainedEarly = adherenceCounts(
  [
    { scheduledDate: '2026-10-05', sessionStatus: 'completed' },
    { scheduledDate: '2026-10-06', sessionStatus: 'completed' },
    { scheduledDate: wednesday, sessionStatus: 'completed' },
  ],
  wednesday
);
assert.equal(trainedEarly.expected_past, 2);
assert.equal(trainedEarly.completed_today, 1);
assert.equal(trainedEarly.due_today, 0);
assert.equal(trainedEarly.completion_rate, 100);

const partial = adherenceCounts([{ scheduledDate: '2026-10-05', sessionStatus: 'partial' }], wednesday);
assert.equal(partial.completed_past, 0);
assert.equal(partial.partial_past, 1);
assert.equal(partial.missed, 0);
assert.equal(partial.completion_rate, 0);

const skipped = adherenceCounts([{ scheduledDate: '2026-10-05', sessionStatus: 'skipped' }], wednesday);
assert.equal(skipped.expected_past, 1);
assert.equal(skipped.skipped_past, 1);
assert.equal(skipped.completed_past, 0);
assert.equal(skipped.missed, 0);

const excused = adherenceCounts([{ scheduledDate: '2026-10-05', excused: true }], wednesday);
assert.equal(excused.expected_past, 0);
assert.equal(excused.missed, 0);
assert.equal(excused.completion_rate, null);

assert.equal(adherenceCounts([], wednesday).completion_rate, null);
assert.equal(expectationDisplayState({ scheduledDate: wednesday, localToday: wednesday }), 'Today');
assert.equal(expectationDisplayState({ scheduledDate: '2026-10-06', localToday: wednesday }), 'Missed');
assert.equal(expectationDisplayState({ scheduledDate: '2026-10-09', localToday: wednesday }), 'Upcoming');

const sql = readFileSync('supabase/migrations/20261007_059_unified_training_schedule.sql', 'utf8');
assert.match(sql, /schedule_visible boolean not null default false/);
assert.match(sql, /expectation_enabled boolean not null default false/);
assert.match(sql, /starts_on date/);
assert.match(sql, /ended_on date/);
assert.match(sql, /st_training_program_segments/);
assert.match(sql, /st_training_expectations/);
assert.match(sql, /st_training_program_segments_one_open/);
assert.match(sql, /st_training_expectations_program_identity/);
assert.match(sql, /st_training_expectations_assignment_identity/);
assert.match(sql, /expectation_id uuid/);
assert.match(sql, /origin = 'assignment'/);
assert.match(sql, /scheduled_date < p_local_today/);
assert.match(sql, /Past training expectations cannot be removed by a schedule refresh/);
assert.match(sql, /function public.st_group_schedule_adherence/);
assert.match(sql, /e\.program_id = pr\.followed_program_id/);
assert.match(sql, /source_key = \('group:' \|\| p_team_id::text\)/);
assert.doesNotMatch(sql, /assigned_schedule_is_authoritative/);
assert.doesNotMatch(sql, /scheduled_date <= p_local_today/);

const mondayPlan = emptyDayPlan(monday, wednesday);
const personalItem: TrainingDayItem = {
  id: 'legacy-p-mon',
  title: 'Full Body',
  typeLabel: 'Strength',
  activityType: 'strength',
  duration: '',
  workoutId: 'p-mon',
  activityId: null,
  isRest: false,
  source: 'program',
};
const cardioItem: TrainingDayItem = {
  id: 'cal-cardio',
  title: 'Easy run',
  typeLabel: 'Cardio',
  activityType: 'cardio',
  duration: '30 min',
  workoutId: null,
  activityId: 'cal-cardio',
  isRest: false,
  source: 'calendar',
};
mondayPlan.items = [personalItem, cardioItem];
mondayPlan.primary = personalItem;
const overlaidMonday = overlayVisibleExpectations(
  mondayPlan,
  [
    {
      id: 'exp-personal',
      workoutId: 'p-mon',
      programId: 'prog-p',
      scheduledDate: monday,
      title: 'Full Body',
      sourceKey: 'personal',
      teamId: null,
      sourceName: 'Personal',
      excused: false,
      sessionStatus: null,
    },
    {
      id: 'exp-group',
      workoutId: 'b-tue',
      programId: 'prog-g',
      scheduledDate: monday,
      title: 'Jump Technique',
      sourceKey: 'group:team',
      teamId: 'team',
      sourceName: 'Basketball',
      excused: false,
      sessionStatus: null,
    },
  ],
  wednesday
);
assert.equal(overlaidMonday.items.filter((item) => item.workoutId === 'p-mon').length, 1);
assert.equal(overlaidMonday.items.find((item) => item.workoutId === 'p-mon')?.statusLabel, 'Missed');
assert.equal(overlaidMonday.items.find((item) => item.workoutId === 'p-mon')?.expectationId, 'exp-personal');
assert.equal(overlaidMonday.items.find((item) => item.title === 'Easy run')?.statusLabel, 'Scheduled');
assert.equal(overlaidMonday.items.find((item) => item.workoutId === 'b-tue')?.sourceName, 'Basketball');
assert.equal(overlaidMonday.items.find((item) => item.workoutId === 'b-tue')?.canMove, false);
assert.equal(overlaidMonday.items.filter((item) => !item.isRest).length, 3);

const hiddenMonday = overlayVisibleExpectations(mondayPlan, [], wednesday);
assert.equal(hiddenMonday.items.some((item) => item.workoutId === 'b-tue'), false);

const completedMonday = overlayVisibleExpectations(
  mondayPlan,
  [
    {
      id: 'exp-personal',
      workoutId: 'p-mon',
      programId: 'prog-p',
      scheduledDate: monday,
      title: 'Full Body',
      sourceKey: 'personal',
      teamId: null,
      sourceName: 'Personal',
      excused: false,
      sessionStatus: 'completed',
    },
  ],
  wednesday
);
assert.equal(completedMonday.items.find((item) => item.workoutId === 'p-mon')?.statusLabel, 'Completed');
assert.equal(completedMonday.items.find((item) => item.workoutId === 'p-mon')?.completed, true);

console.log('unified schedule tests passed');
