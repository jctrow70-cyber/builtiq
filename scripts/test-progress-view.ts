/**
 * Progress view and comparison checks. No database.
 * Run: node .\node_modules\tsx\dist\cli.mjs scripts\test-progress-view.ts
 */
import assert from 'node:assert/strict';
import { draftToCanonical, type BodyMeasurementRow } from '../lib/body/measurements';
import { rollingDisplay, comparisonGap, metricsFor, overviewInsights, progressComparison } from '../lib/progress/comparison';
import { nutritionReport } from '../lib/progress/nutrition';
import { bodyTrends } from '../lib/progress/bodyTrends';
import { buildProgressReport } from '../lib/progress/report';
import { overviewCards } from '../lib/progress/progressView';
import { seriesIdentityFromParts } from '../lib/progress/identity';
import type { ProgressSetFact } from '../lib/progress/setFacts';

function fact(date: string, weight: number, credits: { muscle: string; contribution: number }[]): ProgressSetFact {
  return {
    id: `set-${date}-${weight}`,
    logDate: date,
    completed: true,
    weight,
    reps: 5,
    rpe: null,
    rir: null,
    setType: 'working',
    exerciseType: 'strength',
    identity: seriesIdentityFromParts({ catalogExerciseId: 'bench', exerciseName: 'Bench Press', equipment: 'Barbell' }),
    movementPattern: 'horizontal_push',
    muscleCredits: credits,
    muscleGroupLabel: null,
    programRole: 'primary',
    provenance: {
      equipment: 'snapshotted',
      equipmentDetail: 'existing',
      movementPattern: 'snapshotted',
      muscleCredits: 'snapshotted',
      variant: 'unknown',
    },
  };
}

const credits = [
  { muscle: 'chest', contribution: 1 },
  { muscle: 'triceps', contribution: 0.5 },
  { muscle: 'shoulders', contribution: 0.5 },
];

const row = (date: string, values: Partial<BodyMeasurementRow>): BodyMeasurementRow => ({
  id: date,
  user_id: 'u',
  measured_on: date,
  weight_lbs: null,
  waist_inches: null,
  notes: null,
  ...values,
});

const meals = [
  { log_date: '2026-06-01', calories: 9000, protein_g: 400, carbs_g: 900, fat_g: 300 },
  { log_date: '2026-10-01', calories: 2500, protein_g: 170, carbs_g: 260, fat_g: 80 },
  { log_date: '2026-10-03', calories: 2300, protein_g: 140, carbs_g: 240, fat_g: 70 },
];
const targets = { calories: 2500, protein: 160, carbs: 250, fat: 80 };

const report = buildProgressReport({
  range: '3M',
  today: '2026-10-08',
  facts: [
    fact('2026-07-15', 100, credits),
    fact('2026-10-01', 120, credits),
    fact('2026-10-01', 125, credits),
  ],
  mealEntries: meals,
  nutritionTargets: targets,
  measurements: [
    row('2026-06-01', { weight_lbs: 200, waist_inches: 40 }),
    row('2026-07-20', { weight_lbs: 180, waist_inches: 32 }),
    row('2026-09-01', { weight_lbs: 181 }),
    row('2026-10-01', { weight_lbs: 182.1, waist_inches: 32.2, body_fat_percent: 14.8 }),
  ],
});

const nutrition = report.nutrition;
assert.equal(nutrition.days.some((day) => day.date === '2026-10-02'), false);
assert.equal(nutrition.days.some((day) => day.date === '2026-06-01'), false);
assert.equal(nutrition.loggedDays, 2);
assert.equal(nutrition.averages?.calories, 2400);
assert.equal(nutrition.averages?.protein, 155);
assert.notEqual(nutrition.averages?.calories, 0);
assert.equal(nutrition.targetDaysMet?.protein, 1);
const calories = progressComparison(report, 'imperial').metrics.find((metric) => metric.id === 'calories');
assert.match(calories?.detail || '', /below your configured daily target/);
assert.equal((calories?.detail || '').toLowerCase().includes('deficit'), false);
assert.equal((calories?.detail || '').includes('10%'), false);

const shortNutrition = nutritionReport(
  [{ date: '2026-10-01', calories: 2500, protein: 170, carbs: 200, fat: 70 }],
  { from: '2026-10-02', to: '2026-10-08' },
  targets
);
assert.equal(shortNutrition.loggedDays, 0);
assert.equal(shortNutrition.averages, null);

const training = overviewCards(report, 'imperial').find((card) => card.id === 'training');
const exposure = report.muscles.groups.reduce((sum, group) => sum + group.effectiveSets, 0);
assert.ok(exposure > report.loggedTrainingDays);
assert.equal(training?.value, String(report.loggedTrainingDays));
assert.equal(training?.label, 'Workouts');
assert.match(training?.lines.join(' ') || '', /working sets/);
assert.equal((training?.lines.join(' ') || '').includes('effective'), false);
assert.notEqual(training?.value, String(exposure));

const body = report.body;
assert.equal(body.find((metric) => metric.key === 'chest'), undefined);
assert.equal(body.find((metric) => metric.key === 'weight')?.samples, 3);
assert.equal(body.find((metric) => metric.key === 'waist')?.samples, 2);
assert.ok(body.find((metric) => metric.key === 'body_fat'));
const weight = body.find((metric) => metric.key === 'weight');
assert.equal(weight?.rollingAverage != null, true);
assert.ok(rollingDisplay(weight?.raw || []).length >= 1);
assert.equal(rollingDisplay([{ date: '2026-10-01', value: 180 }, { date: '2026-10-02', value: 181 }]).length, 0);

const one = bodyTrends([row('2026-10-01', { chest_inches: 40 })], report.view);
assert.deepEqual(one.map((metric) => metric.key), ['chest']);
assert.equal(one[0].last, 40);

const comparison = progressComparison(report, 'imperial');
assert.ok(metricsFor(comparison, ['weight', 'waist', 'strength']).length >= 2);
assert.equal(comparison.observations.every((note) => note.claimsCausation === false), true);
const text = [...comparison.observations, ...overviewInsights(report, 'imperial')].map((item) => 'text' in item ? item.text : item.body).join(' ').toLowerCase();
assert.equal(/\bcaused\b|surplus|deficit/.test(text), false);
assert.match(text, /protein/);
assert.match(text, /while|during this period/);

const nutritionOnly = buildProgressReport({
  range: '4W',
  today: '2026-10-08',
  mealEntries: [{ log_date: '2026-10-06', calories: 2200, protein_g: 150, carbs_g: 200, fat_g: 70 }],
});
assert.match(comparisonGap(progressComparison(nutritionOnly, 'imperial'), 'nutrition') || '', /Log workouts or add a body check-in/);

const strengthWeight = progressComparison(buildProgressReport({
  range: '3M',
  today: '2026-10-08',
  facts: [fact('2026-07-15', 100, credits), fact('2026-10-01', 130, credits)],
  measurements: [row('2026-07-20', { weight_lbs: 180 }), row('2026-09-15', { weight_lbs: 181 }), row('2026-10-01', { weight_lbs: 182.1 })],
}), 'imperial');
assert.ok(strengthWeight.metrics.some((metric) => metric.id === 'strength'));
assert.ok(strengthWeight.metrics.some((metric) => metric.id === 'weight'));
assert.equal(strengthWeight.metrics.some((metric) => metric.id === 'waist'), false);
assert.match(strengthWeight.observations.map((note) => note.text).join(' '), /body weight/i);

const withWaist = progressComparison(report, 'imperial');
assert.ok(withWaist.metrics.some((metric) => metric.id === 'waist'));
assert.match(withWaist.observations.map((note) => note.text).join(' '), /waist/i);

const bodyOnly = buildProgressReport({
  range: '3M',
  today: '2026-10-08',
  measurements: [row('2026-10-01', { weight_lbs: 170 })],
  mealEntries: [{ log_date: '2026-10-01', calories: 2100, protein_g: 140, carbs_g: 180, fat_g: 60 }],
});
const bodyNutrition = progressComparison(bodyOnly, 'imperial');
assert.ok(bodyNutrition.domains.includes('nutrition'));
assert.ok(bodyNutrition.domains.includes('body'));
assert.equal(bodyNutrition.domains.includes('strength'), false);
assert.match(comparisonGap(bodyNutrition, 'body') || '', /Log strength workouts/);

assert.equal(draftToCanonical({ measured_on: '2026-10-01', weight: '', waist: '', neck: '15' }, 'imperial')?.neck_inches, 15);

console.log('test-progress-view: ok');
