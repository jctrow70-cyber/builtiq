/**
 * BIQ-0309: copy meal and copy yesterday insert once, keep destination rows,
 * and follow the calendar instead of a UTC date shift.
 * Run: npx tsx scripts/test-copy-meal.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  beginScreenPaint,
  bindScreenSessionUser,
  clearScreenSession,
  finishScreenPaint,
  markScreenStale,
  writeScreenCache,
} from '../lib/performance/screenSession';
import {
  beginCopySubmit,
  copyErrorText,
  copyFailedMessage,
  copyFailureKind,
  copyInsertOutcome,
  copyMealInsertRows,
  copySavedMessage,
  copyUncertainMessage,
  endCopySubmit,
  invalidateNutritionDayCache,
  mergeCopiedEntries,
  sameEntryIds,
  shiftLogDate,
  yesterdayLogDate,
  type CopyMealFood,
} from '../lib/nutrition/copyMeal';
import { groupEntriesByMeal, type MealEntry, type MealType } from '../lib/nutrition/macros';

const tracker = readFileSync(new URL('../app/components/NutritionTracker.tsx', import.meta.url), 'utf8');

function slice(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} -> ${end}`);
  return source.slice(from, to);
}

const food = (overrides: Partial<CopyMealFood> = {}): CopyMealFood => ({
  food_name: 'Eggs',
  food_library_id: 'lib-eggs',
  food_catalog_id: 'cat-eggs',
  serving_qty: 2,
  serving_size: 50,
  serving_unit: 'g',
  calories: 140,
  protein_g: 12,
  carbs_g: 1,
  fat_g: 10,
  notes: 'boiled',
  meal_type: 'breakfast',
  ...overrides,
});

const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
for (const meal of meals) {
  const [row] = copyMealInsertRows('user-1', [food({ meal_type: 'breakfast' })], '2026-11-05', meal);
  assert.equal(row.meal_type, meal);
  assert.equal(row.log_date, '2026-11-05');
  assert.equal(row.user_id, 'user-1');
  assert.equal(row.food_name, 'Eggs');
  assert.equal(row.food_library_id, 'lib-eggs');
  assert.equal(row.food_catalog_id, 'cat-eggs');
  assert.equal(row.serving_qty, 2);
  assert.equal(row.serving_size, 50);
  assert.equal(row.serving_unit, 'g');
  assert.equal(row.calories, 140);
  assert.equal(row.protein_g, 12);
  assert.equal(row.carbs_g, 1);
  assert.equal(row.fat_g, 10);
  assert.equal(row.notes, 'boiled');
}

const [keptMeal] = copyMealInsertRows('user-1', [food({ meal_type: 'dinner', notes: '', serving_size: null })], '2026-11-04');
assert.equal(keptMeal.meal_type, 'dinner');
assert.equal(keptMeal.log_date, '2026-11-04');
assert.equal(keptMeal.notes, null);
assert.equal(keptMeal.serving_size, 1);
assert.equal(keptMeal.food_catalog_id, 'cat-eggs');

assert.equal(shiftLogDate('2026-01-31', 1), '2026-02-01');
assert.equal(shiftLogDate('2026-12-31', 1), '2027-01-01');
assert.equal(shiftLogDate('2026-03-01', -1), '2026-02-28');
assert.equal(yesterdayLogDate('2026-01-01'), '2025-12-31');
assert.equal(yesterdayLogDate('2024-03-01'), '2024-02-29');
assert.equal(yesterdayLogDate('2026-11-04'), '2026-11-03');

/**
 * Local noon in UTC+13, shifted with setDate, then read with toISOString.
 * That path lands on the previous UTC date. Calendar subtraction stays on the local day.
 */
function legacyIsoShift(logDate: string, days: number, offsetHours: number) {
  const [year, month, day] = logDate.split('-').map(Number);
  const localNoonUtc = Date.UTC(year, month - 1, day, 12 - offsetHours, 0, 0);
  const local = new Date(localNoonUtc + offsetHours * 60 * 60 * 1000);
  const shiftedUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + days,
    12 - offsetHours,
    0,
    0
  );
  return new Date(shiftedUtc).toISOString().slice(0, 10);
}

assert.equal(legacyIsoShift('2026-11-04', -1, 13), '2026-11-02');
assert.equal(yesterdayLogDate('2026-11-04'), '2026-11-03');
assert.equal(legacyIsoShift('2026-11-04', 1, 13), '2026-11-04');
assert.equal(shiftLogDate('2026-11-04', 1), '2026-11-05');
assert.equal(legacyIsoShift('2026-01-01', -1, 13), '2025-12-30');
assert.equal(yesterdayLogDate('2026-01-01'), '2025-12-31');

const lock = { current: false };
let inserts = 0;
async function submitCopy() {
  if (beginCopySubmit(lock) === 'ignored') return false;
  try {
    inserts += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return true;
  } finally {
    endCopySubmit(lock);
  }
}
const first = submitCopy();
const overlapping = submitCopy();
overlapping
  .then((ignored) => {
    assert.equal(ignored, false);
    return first;
  })
  .then((started) => {
    assert.equal(started, true);
    assert.equal(inserts, 1);
    return submitCopy();
  })
  .then((again) => {
    assert.equal(again, true);
    assert.equal(inserts, 2);
    console.log('copy meal tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

assert.equal(copyInsertOutcome(3, 3), 'saved');
assert.equal(copyInsertOutcome(3, 0), 'uncertain');
assert.equal(copyInsertOutcome(3, 2), 'uncertain');
assert.equal(copyFailureKind({ message: 'TypeError: Load failed' }), 'uncertain');
assert.equal(copyFailureKind({ message: 'Failed to fetch' }), 'uncertain');
assert.equal(copyFailureKind({ message: 'new row violates row-level security policy' }), 'failed');
assert.equal(copySavedMessage(1, '2026-11-05'), 'Copied 1 food to 11/05/26.');
assert.equal(copySavedMessage(4, '2027-01-01'), 'Copied 4 foods to 01/01/27.');
assert.match(copyUncertainMessage('2026-02-01'), /02\/01\/26/);
assert.equal(/try again/i.test(copyUncertainMessage('2026-11-05')), false);
assert.equal(copyFailedMessage('meal'), 'Could not copy food.');
assert.equal(copyFailedMessage('yesterday'), 'Could not copy yesterday.');
assert.equal(copyErrorText({ message: 'permission denied' }, 'fallback'), 'permission denied');
assert.equal(copyErrorText({}, 'fallback'), 'fallback');

type SavedFood = MealEntry & { id: string };
function saved(id: string, meal: MealType, name: string, logDate: string): SavedFood {
  return {
    id,
    user_id: 'user-1',
    log_date: logDate,
    meal_type: meal,
    food_name: name,
    food_library_id: 'lib-' + id,
    food_catalog_id: 'cat-' + id,
    serving_qty: 1,
    serving_size: 1,
    serving_unit: 'serving',
    calories: 100,
    protein_g: 8,
    carbs_g: 12,
    fat_g: 3,
    notes: name,
  };
}

const existing = [saved('lunch-soup', 'lunch', 'Soup', '2026-11-05')];
const inserted = [saved('breakfast-eggs', 'breakfast', 'Eggs', '2026-11-05')];
const visible = mergeCopiedEntries(existing, inserted);
assert.deepEqual(visible.map((row) => row.id), ['lunch-soup', 'breakfast-eggs']);
assert.equal(sameEntryIds(visible, mergeCopiedEntries(visible, inserted)), true);

const refreshed = [saved('lunch-soup', 'lunch', 'Soup', '2026-11-05'), saved('breakfast-eggs', 'breakfast', 'Eggs', '2026-11-05')];
assert.equal(sameEntryIds(visible, refreshed), true);
const grouped = groupEntriesByMeal(refreshed);
assert.equal(grouped.lunch.length, 1);
assert.equal(grouped.lunch[0].id, 'lunch-soup');
assert.equal(grouped.breakfast.length, 1);
assert.equal(grouped.breakfast[0].food_name, 'Eggs');
assert.equal(grouped.dinner.length, 0);
assert.equal(grouped.snack.length, 0);

const secondCopy = mergeCopiedEntries(refreshed, [saved('breakfast-eggs-2', 'breakfast', 'Eggs', '2026-11-05')]);
assert.deepEqual(secondCopy.map((row) => row.id), ['lunch-soup', 'breakfast-eggs', 'breakfast-eggs-2']);

clearScreenSession();
bindScreenSessionUser('user-copy');
const destination = '2026-11-05';
writeScreenCache(
  'user-copy',
  'nutrition',
  destination,
  { entries: existing, goals: { calories: 2000 }, weekEntries: [] },
  '2026-11-04'
);
markScreenStale('user-copy', ['nutrition']);
finishScreenPaint('Nutrition', 'user-copy', ['nutrition'], true);
const hiddenCopy = beginScreenPaint<{ entries: SavedFood[] }>(
  'Nutrition',
  'user-copy',
  'nutrition',
  destination,
  '2026-11-04',
  { dateScoped: false, staleAreas: ['nutrition'] }
);
assert.equal(hiddenCopy.background, false);
assert.equal(hiddenCopy.cached?.entries.length, 1);
assert.equal(hiddenCopy.cached?.entries[0].id, 'lunch-soup');

invalidateNutritionDayCache('user-copy', destination);
const afterInvalidate = beginScreenPaint<{ entries: SavedFood[] }>(
  'Nutrition',
  'user-copy',
  'nutrition',
  destination,
  '2026-11-04',
  { dateScoped: false, staleAreas: ['nutrition'] }
);
assert.equal(afterInvalidate.cached, null);
const painted = refreshed;
assert.equal(sameEntryIds(painted, refreshed), true);
assert.equal(painted.some((row) => row.id === 'breakfast-eggs'), true);
assert.equal(painted.some((row) => row.id === 'lunch-soup'), true);
clearScreenSession();

const confirm = slice(tracker, 'async function confirmCopyEntries', 'async function copyYesterday');
const confirmCatch = confirm.slice(confirm.indexOf('catch'));
const crossDay = confirm.slice(confirm.indexOf('if (crossDay)'), confirm.indexOf('} else {'));
assert.equal(confirm.includes('beginCopySubmit(copyInFlightRef)'), true);
assert.equal(confirm.includes('endCopySubmit(copyInFlightRef)'), true);
assert.equal(confirm.includes('copyMealInsertRows('), true);
assert.equal(confirm.includes('invalidateNutritionDayCache(userId, targetDate)'), true);
assert.equal(confirm.includes('notifyParent()'), true);
assert.equal(confirm.includes('copySavedMessage('), true);
assert.equal(confirmCatch.includes('notifyParent'), false);
assert.equal(confirmCatch.includes('showCopyFailure('), true);
assert.equal(crossDay.includes('loadDayData'), false);
assert.equal(crossDay.includes('setDate(targetDate)'), true);
assert.ok(confirm.indexOf('invalidateNutritionDayCache(userId, targetDate)') < confirm.indexOf('setDate(targetDate)'));
assert.equal(confirm.includes('await loadDayData()'), true);
assert.ok(confirm.indexOf('setDate(targetDate)') < confirm.indexOf('await loadDayData()'));

const yesterday = slice(tracker, 'async function copyYesterday', 'function openEditFood');
const yesterdayCatch = yesterday.slice(yesterday.indexOf('catch'));
assert.equal(yesterday.includes('yesterdayLogDate(logDate)'), true);
assert.equal(yesterday.includes('toISOString'), false);
assert.equal(yesterday.includes('beginCopySubmit(copyInFlightRef)'), true);
assert.equal(yesterday.includes('copyMealInsertRows(userId, data, targetDate)'), true);
assert.equal(yesterday.includes('notifyParent()'), true);
assert.equal(yesterday.includes('copySavedMessage('), true);
assert.equal(yesterday.includes('Nothing was copied.'), true);
assert.equal(yesterdayCatch.includes('notifyParent'), false);
assert.equal(yesterdayCatch.includes('showCopyFailure('), true);

assert.match(tracker, /function shiftDate\(days: number\) \{\s*setDate\(shiftLogDate\(logDate, days\)\);\s*\}/);
assert.equal(tracker.includes('toISOString()'), false);
assert.equal(tracker.includes('role="status"'), true);
assert.equal(tracker.includes('nutrition-copy-notice'), true);
assert.equal(tracker.includes('mergeCopiedEntries('), true);
