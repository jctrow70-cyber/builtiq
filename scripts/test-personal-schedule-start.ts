import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePersonalEnrollmentStartsOn,
  personalExpectationFloor,
  personalStartsOnPrecedesProgramStart,
  personalWeekAnchorClock,
} from '../lib/training/personalScheduleStart';
import { mondayOfWeek, weekForDate } from '../lib/training/programCalendar';
import {
  adherenceCounts,
  buildProgramExpectationDates,
  expectationDisplayState,
  pickFulfillingSession,
  scheduleAnchorMonday,
  scheduleWeekNumber,
} from '../lib/training/unifiedSchedule';
import { weekAdherenceSummary } from '../lib/progress/weekAdherence';

const programStart = '2026-11-02';
const earlyStartsOn = '2026-10-25';
const week1 = [
  { id: 'w1-mon', week: 1, dayLabel: 'Mon', title: 'Upper A - Bench and Row' },
  { id: 'w1-tue', week: 1, dayLabel: 'Tue', title: 'Lower A - Front Squat Focus' },
  { id: 'w1-wed', week: 1, dayLabel: 'Wed', title: 'Upper B - Incline Press and Pull-Up' },
  { id: 'w1-thu', week: 1, dayLabel: 'Thu', title: 'Lower B - Hinge and Belt Squat' },
  { id: 'w1-fri', week: 1, dayLabel: 'Fri', title: 'Upper C - Chest Press and Shoulders' },
  { id: 'w1-sun', week: 1, dayLabel: 'Sun', title: 'Lower C - Quad Accumulation' },
];
const week3 = [
  { id: 'w3-mon', week: 3, dayLabel: 'Mon', title: 'Upper A - Bench and Row' },
  { id: 'w3-tue', week: 3, dayLabel: 'Tue', title: 'Lower A - Front Squat Focus' },
  { id: 'w3-wed', week: 3, dayLabel: 'Wed', title: 'Upper B - Incline Press and Pull-Up' },
  { id: 'w3-thu', week: 3, dayLabel: 'Thu', title: 'Lower B - Hinge and Belt Squat' },
  { id: 'w3-fri', week: 3, dayLabel: 'Fri', title: 'Upper C - Chest Press and Shoulders' },
  { id: 'w3-sun', week: 3, dayLabel: 'Sun', title: 'Lower C - Quad Accumulation' },
];

// 1. Enrollment begins on program start date.
assert.equal(
  normalizePersonalEnrollmentStartsOn({ startsOn: programStart, programStart }),
  programStart
);
assert.equal(
  personalWeekAnchorClock({ startsOn: programStart, programStart, effectiveOn: programStart }),
  programStart
);

// 2. Enrollment date precedes program start date — clamp / do not shift weeks earlier.
assert.equal(
  normalizePersonalEnrollmentStartsOn({ startsOn: earlyStartsOn, programStart }),
  programStart
);
assert.equal(
  personalWeekAnchorClock({ startsOn: earlyStartsOn, programStart, effectiveOn: earlyStartsOn }),
  programStart
);
assert.equal(
  personalExpectationFloor({ startsOn: earlyStartsOn, programStart, effectiveOn: earlyStartsOn }),
  programStart
);
assert.equal(personalStartsOnPrecedesProgramStart({ startsOn: earlyStartsOn, programStart }), true);

const earlyAnchor = scheduleAnchorMonday({
  sourceKind: 'personal',
  startsOn: earlyStartsOn,
  programStart,
  effectiveOn: programStart,
});
assert.equal(earlyAnchor, mondayOfWeek(programStart));
assert.equal(scheduleWeekNumber(earlyAnchor, '2026-11-02', 4), 1);
assert.equal(scheduleWeekNumber(earlyAnchor, '2026-11-08', 4), 1);
assert.equal(weekForDate(programStart, '2026-11-02', 4), 1);

const novWeek = buildProgramExpectationDates({
  sourceKind: 'personal',
  programStart,
  startsOn: earlyStartsOn,
  cycleWeeks: 4,
  effectiveOn: programStart,
  workouts: [...week1, ...week3],
});
const novIds = novWeek
  .filter((row) => row.scheduledDate >= '2026-11-02' && row.scheduledDate <= '2026-11-08')
  .map((row) => row.workoutId)
  .sort();
assert.deepEqual(novIds, ['w1-fri', 'w1-mon', 'w1-sun', 'w1-thu', 'w1-tue', 'w1-wed']);
assert.equal(
  novWeek.some(
    (row) =>
      row.scheduledDate >= '2026-11-02' &&
      row.scheduledDate <= '2026-11-08' &&
      String(row.workoutId).startsWith('w3-')
  ),
  false
);

// 3. Enrollment begins after program start date (mid-program join).
const lateStartsOn = '2026-11-16';
assert.equal(
  normalizePersonalEnrollmentStartsOn({ startsOn: lateStartsOn, programStart }),
  lateStartsOn
);
const lateAnchor = scheduleAnchorMonday({
  sourceKind: 'personal',
  startsOn: lateStartsOn,
  programStart,
  effectiveOn: lateStartsOn,
});
assert.equal(lateAnchor, mondayOfWeek(programStart));
assert.equal(scheduleWeekNumber(lateAnchor, lateStartsOn, 4), 3);
const lateWeek = buildProgramExpectationDates({
  sourceKind: 'personal',
  programStart,
  startsOn: lateStartsOn,
  cycleWeeks: 4,
  effectiveOn: lateStartsOn,
  workouts: [...week1, ...week3],
});
assert.equal(lateWeek.some((row) => row.scheduledDate < lateStartsOn), false);
assert.ok(lateWeek.some((row) => row.workoutId === 'w3-mon' && row.scheduledDate === '2026-11-16'));

// 4–7. Completions / partial / same-name weeks — match by workout id, not title.
const expectations = novWeek.map((row, index) => ({
  id: `exp-${index}`,
  workoutId: row.workoutId,
  scheduledDate: row.scheduledDate,
  excused: false,
  sessionStatus: null as null,
  sourceKey: 'personal',
  origin: 'program' as const,
}));
const sessions = [
  { expectationId: null, workoutId: 'w1-mon', logDate: '2026-11-02', status: 'completed', completedAt: '2026-11-02T12:00:00Z' },
  { expectationId: null, workoutId: 'w1-tue', logDate: '2026-11-03', status: 'completed', completedAt: '2026-11-03T12:00:00Z' },
  { expectationId: null, workoutId: 'w1-wed', logDate: '2026-11-04', status: 'partial', completedAt: '2026-11-04T12:00:00Z' },
  { expectationId: null, workoutId: 'w1-thu', logDate: '2026-11-05', status: 'completed', completedAt: '2026-11-05T12:00:00Z' },
  { expectationId: null, workoutId: 'w1-fri', logDate: '2026-11-06', status: 'completed', completedAt: '2026-11-06T12:00:00Z' },
  { expectationId: null, workoutId: 'w1-sun', logDate: '2026-11-08', status: 'partial', completedAt: '2026-11-08T12:00:00Z' },
];
const facts = expectations.map((row) => {
  const match = pickFulfillingSession(sessions, { id: row.id, workoutId: row.workoutId, scheduledDate: row.scheduledDate }, expectations);
  return {
    ...row,
    sessionStatus: (match?.status as 'completed' | 'partial' | null) || null,
  };
});
assert.equal(facts.filter((f) => f.sessionStatus === 'completed').length, 4);
assert.equal(facts.filter((f) => f.sessionStatus === 'partial').length, 2);
assert.equal(
  expectationDisplayState({
    scheduledDate: '2026-11-04',
    localToday: '2026-11-06',
    sessionStatus: 'partial',
  }),
  'Partial'
);

// Same titles across weeks: completing week 1 must not fulfill week 3 ids.
const wrongWeekSession = [{ expectationId: null, workoutId: 'w1-mon', logDate: '2026-11-16', status: 'completed' }];
const week3Expectation = [{ id: 'e3', workoutId: 'w3-mon', scheduledDate: '2026-11-16' }];
assert.equal(pickFulfillingSession(wrongWeekSession, week3Expectation[0], week3Expectation), null);

// Before/after adherence for the reported Nov 6 dashboard snapshot.
const afterSummary = weekAdherenceSummary(facts, '2026-11-06', { monday: '2026-11-02', sunday: '2026-11-08' });
assert.equal(afterSummary.scheduled, 6);
assert.equal(afterSummary.completed, 4); // Mon Tue Thu Fri
assert.equal(afterSummary.partial, 2); // Wed + Sun (partial wins over Upcoming)
assert.equal(afterSummary.missed, 0);
assert.equal(afterSummary.dueToday, 0);
assert.equal(afterSummary.upcoming, 0);
// completed_past 3 (Mon Tue Thu) / expected_past 4 (Mon–Thu); Wed partial is not completed
const counts = adherenceCounts(facts, '2026-11-06');
assert.equal(counts.completed_past, 3);
assert.equal(counts.partial_past, 1);
assert.equal(counts.missed, 0);
assert.equal(counts.completion_rate, 75);
assert.equal(afterSummary.pastDayAdherence, 75);

// Old broken anchor (for documentation): starts_on-first would mark Nov 2 as week 3.
const brokenAnchor = mondayOfWeek(earlyStartsOn);
assert.equal(scheduleWeekNumber(brokenAnchor, '2026-11-02', 4), 3);

// 8. Group schedules unchanged (still programStart-first).
const groupLate = buildProgramExpectationDates({
  sourceKind: 'group',
  programStart: '2026-09-07',
  startsOn: '2026-10-07',
  cycleWeeks: 8,
  effectiveOn: '2026-10-07',
  workouts: [
    { id: 'early', week: 1, dayLabel: 'Mon', title: 'Week 1' },
    { id: 'now', week: 5, dayLabel: 'Wed', title: 'Current' },
  ],
});
assert.equal(groupLate.some((row) => row.scheduledDate < '2026-10-07'), false);
assert.ok(groupLate.some((row) => row.workoutId === 'now'));

// Migration present and uses helpers (not applied to LIVE in this change).
const migration = readFileSync('supabase/migrations/20261112_080_personal_schedule_start_clamp.sql', 'utf8');
assert.match(migration, /st_personal_schedule_clock/);
assert.match(migration, /st_personal_expectation_floor/);
assert.match(migration, /st_normalize_personal_enrollment_starts_on/);
assert.match(migration, /st_refresh_enrollment_expectations/);
assert.match(migration, /BIQ-0317/);
assert.doesNotMatch(
  migration,
  /when v_enroll\.source_kind = 'personal' then coalesce\(v_enroll\.starts_on, v_program\.start_date/
);

console.log('test-personal-schedule-start: ok');
