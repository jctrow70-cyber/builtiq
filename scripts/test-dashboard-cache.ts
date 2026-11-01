/**
 * BIQ-0295: a Dashboard card keeps its own generation.
 * Today's Training can clear the shared dashboard flag first, and the
 * Nutrition or Progress card still reloads inside the 30 second window.
 * Run: npx tsx scripts/test-dashboard-cache.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DASHBOARD_CARDS,
  bindScreenSessionUser,
  bumpDashboardCardEpoch,
  clearScreenSession,
  clearScreenStale,
  dashboardCardEpoch,
  finishScreenPaint,
  isScreenStale,
  markScreenStale,
  readScreenCache,
  setScreenSessionClock,
  subscribeScreenSession,
  writeScreenCache,
  type DashboardCardKey,
  type StaleArea,
} from '../lib/performance/screenSession';

const TODAY = '2026-11-01';
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const nutritionScreen = readFileSync(new URL('../app/components/NutritionTracker.tsx', import.meta.url), 'utf8');
const body = readFileSync(new URL('../app/components/BodyProgress.tsx', import.meta.url), 'utf8');
const hero = readFileSync(new URL('../app/components/dashboard/TodaysTrainingHero.tsx', import.meta.url), 'utf8');
const week = readFileSync(new URL('../app/components/dashboard/WeeklyAdherenceCard.tsx', import.meta.url), 'utf8');
const nutritionCard = readFileSync(new URL('../app/components/dashboard/NutritionDashboardCard.tsx', import.meta.url), 'utf8');
const progressCard = readFileSync(new URL('../app/components/dashboard/ProgressDashboardCard.tsx', import.meta.url), 'utf8');

const areas: Record<DashboardCardKey, StaleArea[]> = {
  training: ['dashboard', 'schedule', 'program'],
  week: ['dashboard'],
  nutrition: ['dashboard', 'nutrition'],
  progress: ['dashboard', 'progress'],
};

const keys: Record<DashboardCardKey, string> = {
  training: 'training|2026-11-01|',
  week: 'adherence|2026-10-26',
  nutrition: 'nutrition|2026-11-01',
  progress: 'progress|imperial',
};

function readCard(userId: string, card: DashboardCardKey) {
  return readScreenCache<{ label: string }>(userId, 'dashboard', keys[card], TODAY, {
    dateScoped: true,
    staleAreas: areas[card],
    dashboardCard: card,
  });
}

function seed(userId = 'user-a') {
  clearScreenSession();
  setScreenSessionClock(() => 1_000_000);
  bindScreenSessionUser(userId);
  DASHBOARD_CARDS.forEach((card) => {
    assert.equal(
      writeScreenCache(userId, 'dashboard', keys[card], { label: `${card}-fresh` }, TODAY, { card, epoch: 0 }),
      true
    );
  });
}

function trainingFinishesFirst(userId = 'user-a') {
  finishScreenPaint('Dashboard', userId, ['dashboard'], false);
  assert.equal(isScreenStale(userId, 'dashboard'), false);
}

seed();
bumpDashboardCardEpoch('user-a', 'nutrition');
markScreenStale('user-a', ['nutrition']);
clearScreenStale('user-a', ['nutrition']);
trainingFinishesFirst();
assert.equal(readCard('user-a', 'nutrition')?.refresh, true);
assert.equal(readCard('user-a', 'nutrition')?.value.label, 'nutrition-fresh');
assert.equal(readCard('user-a', 'training')?.refresh, false);
assert.equal(readCard('user-a', 'progress')?.refresh, false);
assert.equal(readCard('user-a', 'week')?.refresh, false);
assert.equal(
  writeScreenCache('user-a', 'dashboard', keys.nutrition, { label: 'nutrition-next' }, TODAY, {
    card: 'nutrition',
    epoch: dashboardCardEpoch('user-a', 'nutrition'),
  }),
  true
);
assert.equal(readCard('user-a', 'nutrition')?.refresh, false);
assert.equal(readCard('user-a', 'training')?.refresh, false);

seed();
markScreenStale('user-a', ['progress']);
bumpDashboardCardEpoch('user-a', 'progress');
clearScreenStale('user-a', ['progress']);
trainingFinishesFirst();
assert.equal(readCard('user-a', 'progress')?.refresh, true);
assert.equal(readCard('user-a', 'training')?.refresh, false);
assert.equal(readCard('user-a', 'nutrition')?.refresh, false);
assert.equal(readCard('user-a', 'week')?.refresh, false);

seed();
markScreenStale('user-a', ['progress']);
bumpDashboardCardEpoch('user-a', 'progress');
trainingFinishesFirst();
assert.equal(isScreenStale('user-a', 'progress'), true);
assert.equal(readCard('user-a', 'progress')?.refresh, true);
assert.equal(readCard('user-a', 'week')?.refresh, false);
assert.equal(readCard('user-a', 'training')?.refresh, false);
assert.equal(readCard('user-a', 'nutrition')?.refresh, false);

seed();
trainingFinishesFirst();
DASHBOARD_CARDS.forEach((card) => assert.equal(readCard('user-a', card)?.refresh, false, card));

seed();
bumpDashboardCardEpoch('user-a', 'nutrition');
const nutritionFirst = ['nutrition', 'training', 'week', 'progress'] as const;
const progressFirst = ['progress', 'week', 'training', 'nutrition'] as const;
for (const card of nutritionFirst) {
  assert.equal(readCard('user-a', card)?.refresh, card === 'nutrition', `nutrition-first ${card}`);
}
seed();
bumpDashboardCardEpoch('user-a', 'progress');
for (const card of progressFirst) {
  assert.equal(readCard('user-a', card)?.refresh, card === 'progress', `progress-first ${card}`);
}

seed();
assert.equal(
  writeScreenCache('user-a', 'dashboard', keys.nutrition, { label: 'request-1' }, TODAY, { card: 'nutrition', epoch: 1 }),
  false
);
assert.equal(readCard('user-a', 'nutrition')?.value.label, 'nutrition-fresh');
bumpDashboardCardEpoch('user-a', 'nutrition');
const currentNutrition = dashboardCardEpoch('user-a', 'nutrition');
assert.equal(
  writeScreenCache('user-a', 'dashboard', keys.nutrition, { label: 'request-2' }, TODAY, {
    card: 'nutrition',
    epoch: currentNutrition,
  }),
  true
);
bumpDashboardCardEpoch('user-a', 'nutrition');
assert.equal(
  writeScreenCache('user-a', 'dashboard', keys.nutrition, { label: 'request-1-late' }, TODAY, {
    card: 'nutrition',
    epoch: currentNutrition,
  }),
  false
);
assert.equal(readCard('user-a', 'nutrition')?.value.label, 'request-2');
assert.equal(readCard('user-a', 'nutrition')?.refresh, true);

seed();
bumpDashboardCardEpoch('user-a', 'nutrition');
bindScreenSessionUser('user-b');
assert.equal(readCard('user-a', 'nutrition'), null);
assert.equal(readCard('user-b', 'nutrition'), null);
assert.equal(
  writeScreenCache('user-a', 'dashboard', keys.nutrition, { label: 'late-user-a' }, TODAY, { card: 'nutrition', epoch: 1 }),
  false
);
assert.equal(
  writeScreenCache('user-b', 'dashboard', keys.progress, { label: 'user-b-progress' }, TODAY, { card: 'progress', epoch: 0 }),
  true
);
bumpDashboardCardEpoch('user-a', 'progress');
assert.equal(readCard('user-b', 'progress')?.refresh, false);
assert.equal(readCard('user-b', 'progress')?.value.label, 'user-b-progress');
assert.equal(dashboardCardEpoch('user-b', 'nutrition'), 0);

seed();
markScreenStale('user-a', ['dashboard']);
const seen = Object.fromEntries(DASHBOARD_CARDS.map((card) => [card, dashboardCardEpoch('user-a', card)])) as Record<DashboardCardKey, number>;
let restarts = 0;
const stop = subscribeScreenSession(() => {
  DASHBOARD_CARDS.forEach((card) => {
    const next = dashboardCardEpoch('user-a', card);
    if (next !== seen[card]) {
      seen[card] = next;
      restarts += 1;
    }
  });
});
trainingFinishesFirst();
stop();
assert.equal(restarts, 0);
DASHBOARD_CARDS.forEach((card) => {
  assert.equal(dashboardCardEpoch('user-a', card), 1, card);
  assert.equal(readCard('user-a', card)?.refresh, true, `shared ${card}`);
});

const goals = readFileSync(new URL('../app/components/nutrition/NutritionGoalsSettings.tsx', import.meta.url), 'utf8');
for (const name of ['async function saveGoals', 'async function saveSuggestedGoals']) {
  const next = name === 'async function saveGoals' ? 'function applySuggestedGoalsToDraft' : 'if (loading)';
  const slice = goals.slice(goals.indexOf(name), goals.indexOf(next));
  assert.ok(slice.indexOf('if (upsertError) return') < slice.indexOf('onSaved?.()'), name);
}
assert.equal(
  page.includes("onSaved={()=>{if(session?.user?.id)bumpDashboardCardEpoch(session.user.id,'nutrition');}}"),
  true
);

function mealSlice(start: string, end: string) {
  const slice = nutritionScreen.slice(nutritionScreen.indexOf(start), nutritionScreen.indexOf(end));
  assert.ok(slice.length > 0, start);
  return slice;
}
for (const [start, end] of [
  ['async function addQuickAddFood', 'async function saveEntryToLibrary'],
  ['async function addFoodEntry', 'function openEditEntry'],
  ['async function confirmCopyEntries', 'async function copyYesterday'],
  ['async function copyYesterday', 'function openEditFood'],
  ['async function logMealTemplate', 'function pickCatalogFood'],
  ['async function logBarcodeProduct', 'function openManualBarcodeFallback'],
  ['async function logAiEstimates', 'function shiftDate'],
] as const) {
  const slice = mealSlice(start, end);
  const caught = slice.slice(slice.indexOf('catch'));
  assert.equal(slice.includes('notifyParent()'), true, start);
  assert.equal(caught.includes('notifyParent'), false, start);
}
const librarySave = mealSlice('async function saveEntryToLibrary', 'async function insertMealRows');
assert.ok(librarySave.indexOf('if (linkError) throw linkError;') < librarySave.indexOf('notifyParent()'));
assert.equal(librarySave.slice(librarySave.indexOf('catch')).includes('notifyParent'), false);
const editedFood = mealSlice('async function saveEditedFood', 'async function archiveFood');
const archivedFood = mealSlice('async function archiveFood', 'async function saveMealAsTemplate');
assert.equal(editedFood.includes('notifyParent'), false);
assert.equal(archivedFood.includes('notifyParent'), false);
assert.equal(hero.includes('setCardEpoch(dashboardCardEpoch(userId, \'training\'))'), true);
assert.equal(week.includes('setCardEpoch(dashboardCardEpoch(userId, \'week\'))'), true);
assert.equal(nutritionCard.includes('setCardEpoch(dashboardCardEpoch(userId, \'nutrition\'))'), true);
assert.equal(progressCard.includes('setCardEpoch(dashboardCardEpoch(userId, \'progress\'))'), true);

const notify = nutritionScreen.slice(
  nutritionScreen.indexOf('const notifyParent'),
  nutritionScreen.indexOf('const setDate')
);
assert.equal(notify.includes("bumpDashboardCardEpoch(userId, 'nutrition')"), true);
assert.equal(notify.includes("markScreenStale(userId, ['nutrition'])"), true);
assert.equal(notify.includes("'dashboard'"), false);
const edited = nutritionScreen.slice(
  nutritionScreen.indexOf('async function saveEditedEntry'),
  nutritionScreen.indexOf('async function deleteEntry')
);
assert.ok(edited.indexOf('if (updateError) return') < edited.indexOf('notifyParent()'));
const removed = nutritionScreen.slice(
  nutritionScreen.indexOf('async function deleteEntry'),
  nutritionScreen.indexOf('async function duplicateEntry')
);
assert.ok(removed.indexOf("if (!confirm('Remove this food entry?')) return;") < removed.indexOf('notifyParent()'));
assert.ok(removed.indexOf('if (delError) return') < removed.indexOf('notifyParent()'));

const save = body.slice(body.indexOf('async function handleSave'), body.indexOf('async function handleDelete'));
const saveCatch = save.slice(save.indexOf('catch'));
assert.equal(save.includes('onDataChange?.()'), true);
assert.equal(saveCatch.includes("includes('were saved')"), true);
assert.ok(saveCatch.indexOf("includes('were saved')") < saveCatch.indexOf('onDataChange?.()'));
assert.ok(save.indexOf("setError('Body fat needs to be between 0 and 100.')") < save.indexOf('onDataChange?.()'));
const deleted = body.slice(body.indexOf('async function handleDelete'), body.indexOf('function fillFromLatest'));
assert.equal(deleted.includes("if (!confirm('Delete this body check-in?')) return;"), true);
assert.ok(deleted.indexOf('await deleteBodyMeasurement') < deleted.indexOf('onDataChange?.()'));
assert.equal(deleted.slice(deleted.indexOf('catch')).includes('onDataChange'), false);
assert.equal(
  page.includes("onBodyDataChange={()=>{if(session?.user?.id)bumpDashboardCardEpoch(session.user.id,'progress');}}"),
  true
);
assert.equal(page.includes('bodyDashRefreshKey'), false);
assert.equal(page.includes("markScreenStale(session.user.id,['dashboard'])"), false);

assert.equal(hero.includes("dashboardCard: 'training'"), true);
assert.equal(hero.includes('paint.cached && !paint.background && !paint.cached.keepPrevious'), true);
assert.equal(hero.includes('dashboardWriteCurrent(userId, \'training\', epoch)'), true);
assert.equal(week.includes("dashboardCard: 'week'"), true);
assert.equal(week.includes("staleAreas: ['dashboard', 'progress']"), false);
assert.equal(nutritionCard.includes("dashboardCard: 'nutrition'"), true);
assert.equal(nutritionCard.includes('dashboardWriteCurrent(userId, \'nutrition\', epoch)'), true);
assert.equal(progressCard.includes("dashboardCard: 'progress'"), true);
assert.equal(progressCard.includes('refreshKey'), false);

setScreenSessionClock(null);
clearScreenSession();
console.log('dashboard cache tests passed');
