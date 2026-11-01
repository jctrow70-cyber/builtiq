import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expectationFactsFromSchedule, progressAdherence } from '../lib/progress/adherence';
import { loadWeekAdherence } from '../lib/progress/queries';
import { buildProgressReport } from '../lib/progress/report';
import {
  formatPastDayAdherence,
  WEEK_ADHERENCE_DAY_NOTE,
  WEEK_ADHERENCE_SCOPE_NOTE,
  weekAdherenceSummary,
  weekDayTone,
} from '../lib/progress/weekAdherence';
import { adherenceCounts, type ExpectationFact } from '../lib/training/unifiedSchedule';

const monday = '2026-10-26';
const sunday = '2026-11-01';
const today = '2026-10-28';
const bounds = { monday, sunday };

function fact(partial: ExpectationFact): ExpectationFact {
  return partial;
}

const week = [
  fact({ id: 'mon', workoutId: 'w-mon', scheduledDate: '2026-10-26', sessionStatus: 'completed', sourceKey: 'personal' }),
  fact({ id: 'tue-miss', workoutId: 'w-tue', scheduledDate: '2026-10-27', sessionStatus: null, sourceKey: 'personal' }),
  fact({ id: 'tue-group', workoutId: 'w-group', scheduledDate: '2026-10-27', sessionStatus: 'partial', sourceKey: 'group:team-1', teamId: 'team-1', origin: 'program' }),
  fact({ id: 'wed', workoutId: 'w-wed', scheduledDate: '2026-10-28', sessionStatus: 'in_progress', sourceKey: 'personal' }),
  fact({ id: 'thu', workoutId: 'w-thu', scheduledDate: '2026-10-29', sessionStatus: null, sourceKey: 'personal' }),
  fact({ id: 'fri-skip', workoutId: 'w-fri', scheduledDate: '2026-10-30', sessionStatus: 'skipped', sourceKey: 'personal' }),
  fact({ id: 'hidden', workoutId: 'w-hidden', scheduledDate: '2026-10-30', sessionStatus: null, sourceKey: 'group:hidden-team' }),
  fact({ id: 'excuse', workoutId: 'w-excuse', scheduledDate: '2026-10-26', excused: true, sessionStatus: null, sourceKey: 'personal' }),
  fact({ id: 'outside', workoutId: 'w-old', scheduledDate: '2026-10-19', sessionStatus: 'completed', sourceKey: 'personal' }),
];

const summary = weekAdherenceSummary(week, today, bounds);
const progress = progressAdherence(week.filter((row) => row.scheduledDate >= monday && row.scheduledDate <= sunday), today);
const report = buildProgressReport({
  range: '7D',
  today,
  expectations: week.filter((row) => row.scheduledDate >= monday && row.scheduledDate <= sunday),
});

assert.ok(progress);
assert.deepEqual(summary.counts, progress.counts);
assert.deepEqual(summary.counts, report.adherence?.counts);
assert.equal(summary.pastDayAdherence, progress.counts.completion_rate);
assert.deepEqual(
  summary.counts,
  adherenceCounts(
    week.filter((row) => row.scheduledDate >= monday && row.scheduledDate <= sunday),
    today
  )
);
assert.equal(
  summary.scheduled,
  summary.counts.expected_past + summary.counts.completed_today + summary.counts.due_today + summary.counts.future
);
assert.equal(
  summary.completed + summary.partial + summary.skipped + summary.missed + summary.dueToday + summary.upcoming,
  summary.scheduled
);
assert.equal(summary.scheduled, 7);
assert.equal(summary.excused, 1);
assert.equal(summary.completed, 1);
assert.equal(summary.partial, 1);
assert.equal(summary.skipped, 1);
assert.equal(summary.missed, 1);
assert.equal(summary.dueToday, 1);
assert.equal(summary.upcoming, 2);
assert.equal(summary.pastDayAdherence, 33.3);
assert.equal(summary.days.length, 7);
assert.deepEqual(
  summary.days.map((day) => day.obligations),
  [1, 2, 1, 1, 2, 0, 0]
);
assert.equal(summary.days[1].obligations, 2);
assert.equal(summary.days[2].when, 'today');
assert.equal(summary.days[2].tone, 'today');
assert.equal(summary.days[3].when, 'future');
assert.equal(summary.days[3].tone, 'upcoming');
assert.notEqual(summary.days[3].tone, 'missed');
assert.equal(summary.days[0].tone, 'completed');
assert.equal(summary.days[5].obligations, 0);
assert.equal(formatPastDayAdherence(summary.pastDayAdherence), '33.3%');
assert.equal(formatPastDayAdherence(null), null);
assert.equal(formatPastDayAdherence(0), '0%');
assert.equal(formatPastDayAdherence(66.7), '66.7%');

const empty = weekAdherenceSummary([], today, bounds);
assert.equal(empty.scheduled, 0);
assert.equal(empty.missed, 0);
assert.equal(empty.pastDayAdherence, null);
assert.equal(formatPastDayAdherence(empty.pastDayAdherence), null);
assert.deepEqual(empty.days.map((day) => day.obligations), [0, 0, 0, 0, 0, 0, 0]);

const excusedOnly = weekAdherenceSummary(
  [fact({ id: 'ex', scheduledDate: '2026-10-26', excused: true, sessionStatus: null })],
  today,
  bounds
);
assert.equal(excusedOnly.scheduled, 0);
assert.equal(excusedOnly.excused, 1);
assert.equal(excusedOnly.missed, 0);
assert.equal(excusedOnly.pastDayAdherence, null);
assert.equal(excusedOnly.days[0].obligations, 0);

const todayPartial = weekAdherenceSummary(
  [fact({ id: 'partial-today', scheduledDate: today, sessionStatus: 'partial' })],
  today,
  bounds
);
assert.equal(todayPartial.partial, 1);
assert.equal(todayPartial.missed, 0);
assert.equal(todayPartial.dueToday, 0);
assert.equal(todayPartial.counts.partial_past, 0);
assert.equal(todayPartial.counts.due_today, 1);
assert.equal(todayPartial.pastDayAdherence, null);

const todaySkipped = weekAdherenceSummary(
  [fact({ id: 'skip-today', scheduledDate: today, sessionStatus: 'skipped' })],
  today,
  bounds
);
assert.equal(todaySkipped.skipped, 1);
assert.equal(todaySkipped.counts.due_today, 1);
assert.equal(todaySkipped.counts.skipped_past, 0);

const pastPartial = weekAdherenceSummary(
  [fact({ id: 'partial-past', scheduledDate: '2026-10-26', sessionStatus: 'partial' })],
  today,
  bounds
);
assert.equal(pastPartial.partial, 1);
assert.equal(pastPartial.completed, 0);
assert.equal(pastPartial.counts.partial_past, 1);
assert.equal(pastPartial.counts.completed_past, 0);
assert.equal(pastPartial.pastDayAdherence, 0);

const pastInProgress = weekAdherenceSummary(
  [fact({ id: 'past-open', scheduledDate: '2026-10-27', sessionStatus: 'in_progress' })],
  today,
  bounds
);
assert.equal(pastInProgress.missed, 1);
assert.equal(pastInProgress.dueToday, 0);
assert.equal(pastInProgress.pastDayAdherence, 0);

const futureCompleted = weekAdherenceSummary(
  [fact({ id: 'future-done', scheduledDate: '2026-10-30', sessionStatus: 'completed' })],
  today,
  bounds
);
assert.equal(futureCompleted.completed, 1);
assert.equal(futureCompleted.upcoming, 0);
assert.equal(futureCompleted.missed, 0);
assert.equal(futureCompleted.counts.future, 1);
assert.equal(futureCompleted.counts.completed_today, 0);
assert.equal(futureCompleted.pastDayAdherence, null);

const personalMove = weekAdherenceSummary(
  [fact({ id: 'move', workoutId: 'w-move', scheduledDate: '2026-10-26', sessionStatus: null, sourceKey: 'personal' })],
  today,
  bounds
);
assert.equal(personalMove.days[0].obligations, 1);
assert.equal(personalMove.days[2].obligations, 0);

const groupMove = weekAdherenceSummary(
  [fact({ id: 'group-move', workoutId: 'w-move', scheduledDate: '2026-10-28', sessionStatus: null, sourceKey: 'group:team-1' })],
  today,
  bounds
);
assert.equal(groupMove.days[0].obligations, 0);
assert.equal(groupMove.days[2].obligations, 1);
assert.equal(groupMove.dueToday, 1);
assert.equal(groupMove.missed, 0);

const duplicates = weekAdherenceSummary(
  [
    fact({ id: 'template', workoutId: 'template-wo', scheduledDate: '2026-10-28', sessionStatus: null, sourceKey: 'group:team-1' }),
    fact({ id: 'copy', workoutId: 'copy-wo', scheduledDate: '2026-10-28', sessionStatus: 'completed', sourceKey: 'group:team-1' }),
  ],
  today,
  bounds
);
assert.equal(duplicates.scheduled, 2);
assert.equal(duplicates.days[2].obligations, 2);
assert.equal(duplicates.completed, 1);
assert.equal(duplicates.dueToday, 1);

const ambiguous = expectationFactsFromSchedule(
  [
    { id: 'exp-a', workout_id: 'shared-wo', scheduled_date: '2026-10-26', source_key: 'personal', origin: 'program' },
    { id: 'exp-b', workout_id: 'shared-wo', scheduled_date: '2026-10-26', source_key: 'group:team-1', origin: 'program' },
  ],
  [{ workout_id: 'shared-wo', log_date: '2026-10-26', status: 'completed' }]
);
assert.equal(ambiguous[0].sessionStatus, null);
assert.equal(ambiguous[1].sessionStatus, null);
const ambiguousWeek = weekAdherenceSummary(ambiguous, today, bounds);
assert.equal(ambiguousWeek.completed, 0);
assert.equal(ambiguousWeek.missed, 2);
assert.deepEqual(ambiguousWeek.counts, progressAdherence(ambiguous, today)?.counts);

const linked = expectationFactsFromSchedule(
  [
    { id: 'exp-a', workout_id: 'shared-wo', scheduled_date: '2026-10-26', source_key: 'personal' },
    { id: 'exp-b', workout_id: 'shared-wo', scheduled_date: '2026-10-26', source_key: 'group:team-1' },
  ],
  [{ expectation_id: 'exp-a', workout_id: 'shared-wo', log_date: '2026-10-26', status: 'completed' }]
);
const linkedWeek = weekAdherenceSummary(linked, today, bounds);
assert.equal(linkedWeek.completed, 1);
assert.equal(linkedWeek.missed, 1);
assert.equal(linked[0].sessionStatus, 'completed');
assert.equal(linked[1].sessionStatus, null);

assert.equal(weekDayTone([]), 'empty');
assert.equal(weekDayTone(['Upcoming']), 'upcoming');
assert.equal(weekDayTone(['Missed', 'Completed']), 'missed');
assert.equal(weekDayTone(['Completed']), 'completed');

type QueryResult = { data: unknown[] | null; error: { message: string } | null };
function fakeClient(handlers: Record<string, () => QueryResult>) {
  const calls: Array<{ table: string; select: string; eq: Array<[string, string]>; gte: Array<[string, string]>; lte: Array<[string, string]> }> = [];
  return {
    calls,
    from(table: string) {
      const call = { table, select: '', eq: [] as Array<[string, string]>, gte: [] as Array<[string, string]>, lte: [] as Array<[string, string]> };
      const chain: any = {
        select(columns: string) {
          call.select = columns;
          return chain;
        },
        eq(column: string, value: string) {
          call.eq.push([column, value]);
          return chain;
        },
        gte(column: string, value: string) {
          call.gte.push([column, value]);
          return chain;
        },
        lte(column: string, value: string) {
          call.lte.push([column, value]);
          return chain;
        },
        then(resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) {
          calls.push(call);
          const handler = handlers[table];
          if (!handler) return Promise.reject(new Error(`unexpected table ${table}`)).then(resolve, reject);
          return Promise.resolve(handler()).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

async function runLoaderChecks() {
const loadedClient = fakeClient({
  st_training_expectations: () => ({
    data: [
      { id: 'exp-a', workout_id: 'shared-wo', scheduled_date: '2026-10-26', source_key: 'personal', excused: false, origin: 'program' },
      { id: 'exp-b', workout_id: 'shared-wo', scheduled_date: '2026-10-26', source_key: 'group:team-1', excused: false, origin: 'program' },
    ],
    error: null,
  }),
  st_workout_sessions: () => ({
    data: [{ workout_id: 'shared-wo', log_date: '2026-10-26', status: 'completed', expectation_id: null }],
    error: null,
  }),
});
const loaded = await loadWeekAdherence(loadedClient, 'user-1', monday, sunday);
assert.equal(loaded.status, 'ready');
if (loaded.status === 'ready') {
  assert.equal(loaded.facts[0].sessionStatus, null);
  assert.equal(loaded.facts[1].sessionStatus, null);
  assert.deepEqual(
    weekAdherenceSummary(loaded.facts, today, bounds).counts,
    progressAdherence(loaded.facts, today)?.counts
  );
}
assert.deepEqual(loadedClient.calls.map((call) => call.table).sort(), ['st_training_expectations', 'st_workout_sessions']);
for (const call of loadedClient.calls) {
  assert.deepEqual(call.eq, [['user_id', 'user-1']]);
  assert.equal(call.select.includes('schedule_visible'), false);
}
assert.deepEqual(loadedClient.calls.find((call) => call.table === 'st_training_expectations')?.gte, [['scheduled_date', monday]]);
assert.deepEqual(loadedClient.calls.find((call) => call.table === 'st_training_expectations')?.lte, [['scheduled_date', sunday]]);
assert.deepEqual(loadedClient.calls.find((call) => call.table === 'st_workout_sessions')?.gte, [['log_date', monday]]);
assert.deepEqual(loadedClient.calls.find((call) => call.table === 'st_workout_sessions')?.lte, [['log_date', sunday]]);

const failed = await loadWeekAdherence(
  fakeClient({
    st_training_expectations: () => ({ data: [], error: { message: 'permission denied' } }),
    st_workout_sessions: () => ({ data: [{ status: 'completed' }], error: null }),
  }),
  'user-1',
  monday,
  sunday
);
assert.equal(failed.status, 'error');

const pending = await loadWeekAdherence(
  fakeClient({
    st_training_expectations: () => ({ data: null, error: { message: 'relation st_training_expectations does not exist' } }),
    st_workout_sessions: () => ({ data: [], error: null }),
  }),
  'user-1',
  monday,
  sunday
);
assert.equal(pending.status, 'pending');
}

const presenterSource = readFileSync('lib/progress/weekAdherence.ts', 'utf8');
assert.equal(presenterSource.includes('workoutDayMoves'), false);
assert.equal(presenterSource.includes('schedule_visible'), false);
assert.equal(presenterSource.includes('overlayVisibleExpectations'), false);
assert.equal(presenterSource.includes('pastDayAdherence: counts.completion_rate'), true);
assert.equal(presenterSource.includes('st_set_logs'), false);

const querySource = readFileSync('lib/progress/queries.ts', 'utf8');
const loaderSource = querySource.slice(querySource.indexOf('export async function loadWeekAdherence'));
assert.equal(loaderSource.includes('fetchExpectations'), true);
assert.equal(loaderSource.includes('fetchSessions'), true);
assert.equal(loaderSource.includes('expectationFactsFromSchedule'), true);
assert.equal(loaderSource.includes('st_set_logs'), false);
assert.equal(loaderSource.includes('st_team_members'), false);
assert.equal(loaderSource.includes('schedule_visible'), false);

const page = readFileSync('app/page.tsx', 'utf8');
const navigation = page.slice(page.indexOf('function openTrainingWeekDay'), page.indexOf('function openTodayTraining'));
assert.equal(navigation.includes('setTrainingCalendarView(\'day\')'), true);
assert.equal(navigation.includes('setLogDate(date)'), true);
assert.equal(navigation.includes('setTrainingSessionOpen(false)'), true);
assert.equal(navigation.includes('setAppNav(\'Training\')'), true);
assert.equal(navigation.includes('beginTrainingItem'), false);
assert.equal(navigation.includes('setTrainingSubNav'), false);
assert.equal(navigation.includes('startTrainingSession'), false);
assert.equal(navigation.includes('startScheduledWorkout'), false);
assert.equal(page.includes('Weekly Progress'), false);
assert.equal(page.includes('weeklySetCount'), false);
assert.equal(page.includes('WeeklyAdherenceCard'), true);

const card = readFileSync('app/components/dashboard/WeeklyAdherenceCard.tsx', 'utf8');
assert.equal(card.includes(WEEK_ADHERENCE_SCOPE_NOTE), false);
assert.equal(card.includes('WEEK_ADHERENCE_SCOPE_NOTE'), true);
assert.equal(card.includes('WEEK_ADHERENCE_DAY_NOTE'), true);
assert.equal(card.includes('Past-day adherence'), true);
assert.equal(card.includes('formatPastDayAdherence'), true);
assert.equal(card.includes('beginTrainingItem'), false);
assert.equal(card.includes('st_set_logs'), false);
assert.equal(card.includes('onSelectDate(day.date)'), true);
assert.equal(WEEK_ADHERENCE_SCOPE_NOTE.includes('hidden sources'), true);
assert.equal(WEEK_ADHERENCE_DAY_NOTE.includes('not a complete list'), true);

const moves = readFileSync('lib/programDesign/workoutDayMoves.ts', 'utf8');
assert.equal(moves.includes('st_training_expectations'), false);
const reschedule = readFileSync('supabase/migrations/20261012_064_workout_reschedule.sql', 'utf8');
assert.equal(reschedule.includes('set scheduled_date = v_move.new_scheduled_date'), true);

runLoaderChecks()
  .then(() => {
    console.log('week adherence tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
