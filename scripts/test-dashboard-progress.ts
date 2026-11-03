/**
 * Dashboard progress card checks. No database.
 * Run: node .\node_modules\tsx\dist\cli.mjs scripts\test-dashboard-progress.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatBodyMetric, formatWeight, type BodyMeasurementRow } from '../lib/body/measurements';
import { shouldOpenBodyCheckIn } from '../lib/progress/bodyCheckInLaunch';
import { dashboardProgressModel } from '../lib/progress/dashboardProgress';
import { bodyTrends } from '../lib/progress/bodyTrends';
import { seriesIdentityFromParts } from '../lib/progress/identity';
import { headlineRecords, signedPercent } from '../lib/progress/progressView';
import { loadDashboardProgress } from '../lib/progress/queries';
import { comparableWindows, inclusiveDays, rangeBounds } from '../lib/progress/ranges';
import { buildSeriesWindows, seriesPersonalRecords } from '../lib/progress/strengthSeries';
import { buildStrengthIndex } from '../lib/progress/strengthIndex';
import type { ProgressSetFact } from '../lib/progress/setFacts';
import { addDaysYmd, mondayOfWeek } from '../lib/training/programCalendar';

const today = '2026-10-31';
const view = rangeBounds('4W', today);
const windows = comparableWindows(view);

function row(date: string, values: Partial<BodyMeasurementRow>): BodyMeasurementRow {
  return {
    id: date + JSON.stringify(values),
    user_id: 'signed-in-user',
    measured_on: date,
    weight_lbs: null,
    waist_inches: null,
    notes: null,
    ...values,
  };
}

function fact(date: string, weight: number, equipment: string, exerciseName: string, pattern: string, variant: string | null = null): ProgressSetFact {
  return {
    id: `${date}-${exerciseName}-${equipment}-${variant || ''}-${weight}`,
    logDate: date,
    completed: true,
    weight,
    reps: 5,
    rpe: null,
    rir: null,
    setType: 'working',
    exerciseType: 'strength',
    identity: seriesIdentityFromParts({
      catalogExerciseId: exerciseName.toLowerCase().replace(/\s+/g, '-'),
      exerciseName,
      equipment: equipment === 'unspecified' ? '' : equipment,
      variant,
    }),
    movementPattern: pattern,
    muscleCredits: null,
    muscleGroupLabel: null,
    programRole: 'primary',
    provenance: {
      equipment: 'snapshotted',
      equipmentDetail: 'existing',
      movementPattern: 'snapshotted',
      muscleCredits: 'snapshotted',
      variant: 'snapshotted',
    },
    notes: '',
    setNumber: null,
  };
}

const baseline = windows.baseline.from;
const current = view.to;
const earlier = addDaysYmd(view.to, -5);

const strengthFacts = [
  fact(baseline, 100, 'Barbell', 'Bench Press', 'horizontal_push'),
  fact(current, 110, 'Barbell', 'Bench Press', 'horizontal_push'),
  fact(baseline, 40, 'Dumbbell', 'Bench Press', 'horizontal_push', 'Neutral'),
  fact(addDaysYmd(view.to, -1), 50, 'Dumbbell', 'Bench Press', 'horizontal_push', 'Neutral'),
  fact(baseline, 80, 'Barbell', 'Bent Over Row', 'horizontal_pull'),
  fact(earlier, 90, 'Barbell', 'Bent Over Row', 'horizontal_pull'),
  fact(baseline, 70, 'Barbell', 'Overhead Press', 'vertical_push'),
  fact(addDaysYmd(view.to, -4), 75, 'Barbell', 'Overhead Press', 'vertical_push'),
  fact(baseline, 20, 'Cable', 'Lat Pulldown', 'vertical_pull'),
  fact(addDaysYmd(view.to, -3), 25, 'Cable', 'Lat Pulldown', 'vertical_pull'),
  fact(baseline, 200, 'unspecified', 'Bench Press', 'horizontal_push'),
  fact(addDaysYmd(view.to, -6), 220, 'unspecified', 'Bench Press', 'horizontal_push'),
  fact(baseline, 60, 'Smith machine', 'Bench Press', 'horizontal_push'),
  fact(addDaysYmd(view.to, -2), 65, 'Smith machine', 'Bench Press', 'horizontal_push'),
];

const strength = dashboardProgressModel({ today, units: 'imperial', facts: strengthFacts, measurements: [] });
const series = buildSeriesWindows(strengthFacts, view, windows.baseline, windows.current, mondayOfWeek);
const index = buildStrengthIndex(series);
const withoutUnspecified = buildStrengthIndex(
  buildSeriesWindows(
    strengthFacts.filter((item) => item.identity.equipmentKey !== 'unspecified'),
    view,
    windows.baseline,
    windows.current,
    mondayOfWeek
  )
);
const viewFacts = strengthFacts.filter((item) => item.logDate >= view.from && item.logDate <= view.to);
const headlines = headlineRecords(seriesPersonalRecords(viewFacts)).slice(0, 2);
assert.equal(strength.strengthValue, signedPercent(index.percentChange));
assert.equal(strength.strengthContext, index.coverageLine);
assert.deepEqual(strength.achievements.map((item) => item.key), headlines.map((item) => item.key));
assert.deepEqual(strength.achievements.map((item) => item.label), headlines.map((item) => item.label));
assert.equal(index.percentChange, withoutUnspecified.percentChange);
assert.equal(strength.strengthLabel, 'Overall Strength');
assert.equal(strength.achievements.length, 2);
assert.equal(strength.achievements[0].label.includes('Barbell'), true);
assert.equal(strength.achievements[0].label.includes('Dumbbell'), false);
assert.equal(strength.achievements[0].label.includes('Unspecified'), false);
assert.equal(strength.achievements[1].label, 'Bench Press · Dumbbell · Neutral');
assert.equal(strength.achievements[0].detailText.includes('110 lb × 5'), true);
assert.equal(strength.achievements.some((item) => item.label.includes('Smith machine')), false);
assert.equal(strength.bodyEmpty, 'No body check-ins yet.');
assert.equal(strength.empty, false);

const one = dashboardProgressModel({
  today,
  units: 'imperial',
  facts: [],
  measurements: [row(view.from, { weight_lbs: 180 })],
});
assert.equal(one.bodyLines.length, 1);
assert.equal(one.bodyLines[0].valueText, '180 lb');
assert.equal(one.bodyLines[0].changeText, null);
assert.equal(one.bodyLines[0].note, 'One check-in this period.');
assert.equal((one.bodyLines[0].note || '').includes('unchanged'), false);
assert.equal(one.bodyLines[0].changeText === '0 lb', false);

const rising = [row(view.from, { weight_lbs: 180 }), row(addDaysYmd(view.from, 7), { weight_lbs: 190 }), row(view.to, { weight_lbs: 200 })];
const several = dashboardProgressModel({ today, units: 'imperial', facts: [], measurements: rising });
const weightTrend = bodyTrends(rising, view).find((item) => item.key === 'weight');
assert.equal(several.bodyLines[0].valueText, formatWeight(200, 'imperial'));
assert.notEqual(several.bodyLines[0].valueText, formatWeight(190, 'imperial'));
assert.equal(several.bodyLines[0].changeText, `↑ ${formatBodyMetric(weightTrend?.delta || 0, 'weight', 'imperial')}`);
assert.equal(several.bodyLines[0].note, null);

const flat = dashboardProgressModel({
  today,
  units: 'imperial',
  facts: [],
  measurements: [row(view.from, { weight_lbs: 180 }), row(view.to, { weight_lbs: 180 })],
});
assert.equal(flat.bodyLines[0].changeText, formatBodyMetric(0, 'weight', 'imperial'));
assert.equal(flat.bodyLines[0].note, null);

const older = dashboardProgressModel({
  today,
  units: 'imperial',
  facts: [],
  measurements: [row(addDaysYmd(view.from, -21), { weight_lbs: 175, waist_inches: 34 })],
});
assert.equal(older.bodyLines.length, 2);
assert.equal(older.bodyLines[0].valueText, '175 lb');
assert.equal(older.bodyLines[0].changeText, null);
assert.equal(older.bodyLines[0].note, 'No new check-in in the last 4 weeks.');
assert.equal(older.bodyLines[1].note, 'No new check-in in the last 4 weeks.');
assert.equal(older.bodyLines[0].dateText.length > 0, true);

const split = dashboardProgressModel({
  today,
  units: 'imperial',
  facts: [],
  measurements: [
    row(view.from, { weight_lbs: 180 }),
    row(view.to, { weight_lbs: 182 }),
    row(addDaysYmd(view.from, 3), { waist_inches: 33 }),
  ],
});
assert.equal(split.bodyLines.map((line) => line.key).join(','), 'weight,waist');
assert.equal(split.bodyLines[0].changeText?.startsWith('↑'), true);
assert.equal(split.bodyLines[1].changeText, null);
assert.equal(split.bodyLines[1].note, 'One check-in this period.');
assert.equal(split.bodyLines.some((line) => line.valueText.includes('0')), false);

const metric = dashboardProgressModel({
  today,
  units: 'metric',
  facts: [],
  measurements: [row(view.from, { weight_lbs: 180 })],
});
assert.equal(metric.bodyLines[0].valueText, formatWeight(180, 'metric'));
assert.equal(metric.bodyLines[0].valueText.includes('kg'), true);

const chestOnly = dashboardProgressModel({
  today,
  units: 'imperial',
  facts: [],
  measurements: [row(view.from, { chest_inches: 40 }), row(view.to, { chest_inches: 41 })],
});
assert.equal(chestOnly.bodyLines.length, 1);
assert.equal(chestOnly.bodyLines[0].key, 'chest');
assert.equal(chestOnly.bodyLines[0].changeText?.startsWith('↑'), true);
assert.equal(chestOnly.bodyLines.some((line) => line.key === 'weight' || line.key === 'waist'), false);

const empty = dashboardProgressModel({ today, units: 'imperial', facts: [], measurements: [] });
assert.equal(empty.empty, true);
assert.equal(empty.emptyCopy, 'Your progress will show up after a workout or a body check-in.');
assert.equal(empty.strengthValue, null);
assert.equal(empty.bodyLines.length, 0);
assert.equal(empty.achievements.length, 0);

assert.equal(shouldOpenBodyCheckIn(null, null), false);
assert.equal(shouldOpenBodyCheckIn({ id: 1, openForm: true }, null), true);
assert.equal(shouldOpenBodyCheckIn({ id: 1, openForm: true }, 1), false);
assert.equal(shouldOpenBodyCheckIn({ id: 2, openForm: true }, 1), true);
let consumedId: number | null = null;
const firstLaunch = { id: 7, openForm: true as const };
assert.equal(shouldOpenBodyCheckIn(firstLaunch, consumedId), true);
consumedId = firstLaunch.id;
assert.equal(shouldOpenBodyCheckIn(firstLaunch, consumedId), false);
assert.equal(shouldOpenBodyCheckIn(null, consumedId), false);
assert.equal(shouldOpenBodyCheckIn({ id: 8, openForm: true }, consumedId), true);

async function runPagingCheck() {
  const pageRows = Array.from({ length: 1001 }, (_, index) => ({
    id: `paged-${index}`,
    user_id: 'user-1',
    log_date: index === 1000 ? today : windows.baseline.from,
    completed: true,
    actual_weight: index === 1000 ? 300 : 45,
    actual_reps: 5,
    snapshot_set_type: 'working',
    snapshot_exercise_type: 'strength',
    snapshot_exercise_name: index === 1000 ? 'Pagination Press' : 'Filler Press',
    snapshot_catalog_exercise_id: index === 1000 ? 'pagination-press' : 'filler-press',
    snapshot_equipment: 'Barbell',
    snapshot_movement_pattern: 'horizontal_push',
    snapshot_program_role: 'primary',
    snapshot_provenance: {
      equipment: 'snapshotted',
      equipmentDetail: 'existing',
      movementPattern: 'snapshotted',
      muscleCredits: 'snapshotted',
      variant: 'snapshotted',
    },
  }));
  const pageRanges: { table: string; start: number; end: number; userId?: string; gte?: string; lte?: string }[] = [];
  const pagingClient = {
    from(table: string) {
      const query: { userId?: string; gte?: string; lte?: string } = {};
      const api = {
        select() { return api; },
        eq(_column: string, value: string) { query.userId = value; return api; },
        gte(_column: string, value: string) { query.gte = value; return api; },
        lte(_column: string, value: string) { query.lte = value; return api; },
        order() { return api; },
        async range(start: number, end: number) {
          pageRanges.push({ table, start, end, userId: query.userId, gte: query.gte, lte: query.lte });
          const source = table === 'st_set_logs' ? pageRows : [];
          return { data: source.slice(start, end + 1), error: null };
        },
      };
      return api;
    },
  };
  const paged = await loadDashboardProgress(pagingClient, 'user-1', today, 'imperial');
  const setPages = pageRanges.filter((item) => item.table === 'st_set_logs');
  assert.deepEqual(setPages.map((item) => [item.start, item.end]), [[0, 999], [1000, 1999]]);
  assert.equal(setPages[0].userId, 'user-1');
  assert.equal(setPages[0].gte, windows.baseline.from);
  assert.equal(setPages[0].lte, today);
  assert.equal(inclusiveDays(setPages[0].gte || '', setPages[0].lte || ''), 56);
  assert.equal(paged.achievements.some((item) => item.label.includes('Pagination Press')), true);
}

const card = readFileSync('app/components/dashboard/ProgressDashboardCard.tsx', 'utf8');
assert.equal(card.includes('loadDashboardProgress'), true);
assert.equal(card.includes('loadProgressReport'), false);
assert.equal(card.includes('progressLogs'), false);
assert.equal(card.includes('saveBodyMeasurement'), false);
assert.equal(card.includes('computePersonalRecords'), false);
assert.equal(card.includes('adherence'), false);
assert.equal(card.includes('Loading your progress.'), true);
assert.equal(card.includes('Your progress could not be loaded.'), true);
assert.equal(card.includes('Try again'), true);
assert.equal(card.includes('Best this period'), true);
assert.equal(card.includes("state.status === 'ready'"), true);

const modelSrc = readFileSync('lib/progress/dashboardProgress.ts', 'utf8');
assert.equal(modelSrc.includes('bodyTrends'), true);
assert.equal(modelSrc.includes('buildSeriesWindows'), true);
assert.equal(modelSrc.includes('buildStrengthIndex'), true);
assert.equal(modelSrc.includes('seriesPersonalRecords'), true);
assert.equal(modelSrc.includes('headlineRecords'), true);
assert.equal(modelSrc.includes('rollingAverage'), false);
assert.equal(modelSrc.includes('computePersonalRecords'), false);

const queries = readFileSync('lib/progress/queries.ts', 'utf8');
const loader = queries.slice(queries.indexOf('export async function loadDashboardProgress'), queries.indexOf('export type WeekAdherenceLoad'));
assert.equal(loader.includes('st_set_logs'), true);
assert.equal(loader.includes('st_body_measurements'), true);
assert.equal(loader.includes('userId'), true);
assert.equal(loader.includes("rangeBounds('4W'"), true);
assert.equal(loader.includes('comparableWindows'), true);
assert.equal(loader.includes('st_meal_entries'), false);
assert.equal(loader.includes('st_nutrition_goals'), false);
assert.equal(loader.includes('st_training_expectations'), false);
assert.equal(loader.includes('st_workout_sessions'), false);
assert.equal(loader.includes('st_team_members'), false);
assert.equal(loader.includes('loadProgressReport'), false);
assert.equal(queries.includes(".eq('user_id', userId)"), true);

const page = readFileSync('app/page.tsx', 'utf8');
assert.equal(page.includes('BodyDashboardCard'), false);
const addCheckIn = page.slice(page.indexOf('function openAddCheckIn'), page.indexOf('function openTrainingWeekDay'));
assert.ok(addCheckIn.indexOf("goNav('Progress',{progressSub:'body'})") < addCheckIn.indexOf('setBodyCheckInLaunch'));
assert.equal(addCheckIn.includes('openForm:true'), true);
const overview = page.slice(page.indexOf('function openProgressOverview'), page.indexOf('function openProgressStrength'));
assert.equal(overview.includes("goNav('Progress')"), true);
assert.equal(overview.includes('progressSub'), false);
assert.equal(overview.includes('openForm'), false);
const strengthNav = page.slice(page.indexOf('function openProgressStrength'), page.indexOf('function openProgressBody'));
assert.equal(strengthNav.includes("progressSub:'strength'"), true);
const bodyNav = page.slice(page.indexOf('function openProgressBody'), page.indexOf('function openAddCheckIn'));
assert.equal(bodyNav.includes("progressSub:'body'"), true);
assert.equal(bodyNav.includes('openForm'), false);
const nav = page.slice(page.indexOf('function goNav'), page.indexOf('function openNotificationTarget'));
assert.equal(nav.includes('setBodyCheckInLaunch(null)'), true);
const launchEffect = page.slice(page.indexOf('shouldOpenBodyCheckIn(launch'), page.indexOf('setBodyCheckInLaunch(null)'));
assert.equal(launchEffect.includes('bodyCheckInConsumed.current=launch.id'), true);
assert.equal(page.includes('shouldOpenBodyCheckIn'), true);
assert.equal(page.includes('userId={session.user.id}'), true);

const form = readFileSync('app/components/BodyProgress.tsx', 'utf8');
assert.equal(form.includes('id="body-check-in"'), true);
assert.equal(form.includes('Save check-in'), true);

runPagingCheck().then(() => {
  console.log('dashboard progress tests passed');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
