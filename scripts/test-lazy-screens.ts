/**
 * BIQ-0287: lazy screens stay cached, first open waits, and account data stays separate.
 * Run: npx tsx scripts/test-lazy-screens.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ComponentType } from 'react';
import {
  loadLazyScreen,
  readCachedScreen,
  shouldPreloadScreens,
  type ScreenLoader,
} from '../lib/performance/lazyScreen';
import { afterScreenUsable, noteUsable, resetScreenTiming } from '../lib/performance/screenTiming';
import {
  bindScreenSessionUser,
  clearScreenSession,
  readNutritionDraft,
  writeNutritionDraft,
  type NutritionDraftSnapshot,
} from '../lib/performance/screenSession';

function FakeScreen() {
  return null;
}

async function testModuleCache() {
  let calls = 0;
  const loader: ScreenLoader<Record<string, never>> = () => {
    calls += 1;
    return Promise.resolve({ default: FakeScreen as ComponentType<Record<string, never>> });
  };
  assert.equal(readCachedScreen(loader), null);
  const first = loadLazyScreen(loader);
  const joined = loadLazyScreen(loader);
  assert.equal(first, joined);
  const loaded = await first;
  assert.equal(calls, 1);
  assert.equal(readCachedScreen(loader), loaded);
  const again = await loadLazyScreen(loader);
  assert.equal(again, loaded);
  assert.equal(calls, 1);
}

function testPreloadGuards() {
  assert.equal(shouldPreloadScreens({}), true);
  assert.equal(shouldPreloadScreens({ effectiveType: '4g', deviceMemory: 8 }), true);
  assert.equal(shouldPreloadScreens({ saveData: true, effectiveType: '4g' }), false);
  assert.equal(shouldPreloadScreens({ effectiveType: '2g' }), false);
  assert.equal(shouldPreloadScreens({ effectiveType: 'slow-2g' }), false);
  assert.equal(shouldPreloadScreens({ deviceMemory: 2 }), false);
  assert.equal(shouldPreloadScreens({ deviceMemory: 1 }), false);
  assert.equal(shouldPreloadScreens({ deviceMemory: 4 }), true);
}

function testDashboardUsableGate() {
  resetScreenTiming();
  let fired = 0;
  const cancel = afterScreenUsable('Dashboard', () => {
    fired += 1;
  });
  assert.equal(fired, 0);
  noteUsable('Dashboard');
  assert.equal(fired, 1);
  cancel();
  afterScreenUsable('Dashboard', () => {
    fired += 1;
  });
  assert.equal(fired, 2);
  resetScreenTiming();
}

function testAccountIsolation() {
  const loader: ScreenLoader<Record<string, never>> = () => Promise.resolve({ default: FakeScreen as ComponentType<Record<string, never>> });
  const draft: NutritionDraftSnapshot = {
    logDate: '2026-11-01',
    showAdd: true,
    addFoodView: 'barcode',
    estimateSearch: '',
    showMyFoods: false,
    addDraft: { food_name: 'Oats' },
    editEntryId: null,
    editDraft: null,
    editFoodId: null,
    foodEditDraft: null,
    foodSearch: '',
    pickedCatalogId: null,
    aiDescribe: '',
    aiEstimateResult: null,
    barcodeValue: '012345678905',
    barcodeProduct: null,
    barcodeNotFound: null,
    barcodeServingQty: '1',
    showBarcodeScanner: false,
    copySource: null,
    copyDraft: null,
    expandedMeals: null,
  };
  clearScreenSession();
  bindScreenSessionUser('user-a');
  writeNutritionDraft('user-a', draft);
  return loadLazyScreen(loader).then((component) => {
    assert.equal(readCachedScreen(loader), component);
    clearScreenSession();
    assert.equal(readNutritionDraft('user-a'), null);
    assert.equal(readCachedScreen(loader), component);
    bindScreenSessionUser('user-b');
    assert.equal(readNutritionDraft('user-b'), null);
    assert.equal(readNutritionDraft('user-a'), null);
    clearScreenSession();
  });
}

function testSourceBoundaries() {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const addFood = readFileSync(new URL('../app/components/nutrition/NutritionAddFoodPanel.tsx', import.meta.url), 'utf8');
  const groups = readFileSync(new URL('../app/components/groups/GroupsHub.tsx', import.meta.url), 'utf8');
  const meta = readFileSync(new URL('../lib/training/prescriptionMeta.ts', import.meta.url), 'utf8');
  const outcome = page.slice(page.indexOf('async function saveSessionOutcome'), page.indexOf('async function addExtraWorkingSet'));

  assert.equal(page.includes("import NutritionTracker from"), false);
  assert.equal(page.includes("import ProgressScreen from"), false);
  assert.equal(page.includes("import GroupsHub from"), false);
  assert.equal(page.includes("import ProgramDesignHome from"), false);
  assert.equal(page.includes("import UnifiedTrainingSchedule"), false);
  assert.equal(page.includes("import WorkoutPlanSheet from"), false);
  assert.equal(page.includes("import MoveWorkoutSheet from"), false);
  assert.equal(page.includes('preloadLazyScreen(nutritionScreenLoader)'), true);
  assert.equal(page.includes('preloadLazyScreen(trainingScheduleLoader)'), true);
  assert.equal(page.includes('preloadLazyScreen(groupsScreenLoader)'), false);
  assert.equal(page.includes('import WorkoutSetLogger from'), true);
  assert.equal(page.includes('import TodaysTrainingHero from'), true);
  assert.equal(page.includes("await import('../lib/training/adaptationOrchestration')"), true);
  assert.equal(page.includes('import { shouldTriggerCompletedWorkoutAdaptation'), false);
  assert.ok(outcome.indexOf('upsertWorkoutSession') < outcome.indexOf("await import('../lib/training/adaptationOrchestration')"));
  assert.equal(outcome.includes('Workout complete. Adaptation could not finish and can retry safely.'), true);
  const adaptationCatch = outcome.slice(outcome.lastIndexOf('}catch{'));
  assert.equal(adaptationCatch.includes('upsertWorkoutSession'), false);

  assert.equal(addFood.includes("import NutritionBarcodeScanner from"), false);
  assert.equal(addFood.includes("import('../NutritionBarcodeScanner')"), true);
  assert.equal(addFood.includes('barcodeProduct'), true);
  assert.equal(groups.includes('.channel(`group-unread:${teamId}`)'), true);
  assert.equal(groups.includes('removeChannel(channel)'), true);
  assert.equal(meta.includes("scienceEngine/generation/library"), false);
  assert.equal(meta.includes("scienceEngine/catalogAdapter"), false);
  assert.equal(meta.includes('catalogExerciseFromRow'), true);
  assert.equal(meta.includes('lateralityOf'), true);
}

Promise.resolve()
  .then(testModuleCache)
  .then(testAccountIsolation)
  .then(() => {
    testPreloadGuards();
    testDashboardUsableGate();
    testSourceBoundaries();
    console.log('lazy screen tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
