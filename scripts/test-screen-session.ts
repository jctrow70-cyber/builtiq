/**
 * BIQ-0286: user-scoped screen cache, unsaved nutrition, and an open workout
 * stay isolated from background refresh.
 * Run: npx tsx scripts/test-screen-session.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SCREEN_CACHE_LIMITS,
  SCREEN_CACHE_TTL_MS,
  activeScreenSessionUser,
  activeWorkoutIsProtected,
  bindScreenSessionUser,
  clearScreenSession,
  nutritionDraftIsDirty,
  markScreenStale,
  nutritionRefreshKeepsDraft,
  readNutritionDraft,
  readScreenCache,
  screenCacheCount,
  setScreenSessionClock,
  writeNutritionDraft,
  writeScreenCache,
  type NutritionDraftSnapshot,
} from '../lib/performance/screenSession';
import {
  beginBackgroundRefresh,
  beginScreenTiming,
  completeScreenPhase,
  endBackgroundRefresh,
  latestScreenTiming,
  noteCacheHit,
  noteCacheMiss,
  noteUsable,
  resetScreenTiming,
  screenTimingPhases,
  screenTimingSummary,
} from '../lib/performance/screenTiming';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const nutrition = readFileSync(new URL('../app/components/NutritionTracker.tsx', import.meta.url), 'utf8');
const schedule = readFileSync(new URL('../app/components/training/UnifiedTrainingSchedule.tsx', import.meta.url), 'utf8');
const progress = readFileSync(new URL('../app/components/progress/ProgressScreen.tsx', import.meta.url), 'utf8');

function emptyDraft(overrides: Partial<NutritionDraftSnapshot> = {}): NutritionDraftSnapshot {
  return {
    logDate: '2026-11-01',
    showAdd: false,
    addFoodView: 'hub',
    estimateSearch: '',
    showMyFoods: false,
    addDraft: { food_name: '' },
    editEntryId: null,
    editDraft: null,
    editFoodId: null,
    foodEditDraft: null,
    foodSearch: '',
    pickedCatalogId: null,
    aiDescribe: '',
    aiEstimateResult: null,
    barcodeValue: '',
    barcodeProduct: null,
    barcodeNotFound: null,
    barcodeServingQty: '1',
    showBarcodeScanner: false,
    copySource: null,
    copyDraft: null,
    expandedMeals: null,
    ...overrides,
  };
}

clearScreenSession();
setScreenSessionClock(() => 1_000_000);
bindScreenSessionUser('user-a');
writeScreenCache('user-a', 'nutrition', '2026-11-01', { entries: ['oats'] }, '2026-11-01');
const first = readScreenCache<{ entries: string[] }>('user-a', 'nutrition', '2026-11-01', '2026-11-01', {
  dateScoped: false,
  staleAreas: ['nutrition'],
});
const second = readScreenCache<{ entries: string[] }>('user-a', 'nutrition', '2026-11-01', '2026-11-01', {
  dateScoped: false,
  staleAreas: ['nutrition'],
});
assert.equal(first?.refresh, false);
assert.equal(second?.refresh, false);
assert.deepEqual(second?.value.entries, ['oats']);

setScreenSessionClock(() => 1_000_000 + SCREEN_CACHE_TTL_MS);
const expired = readScreenCache('user-a', 'nutrition', '2026-11-01', '2026-11-01', {
  dateScoped: false,
  staleAreas: ['nutrition'],
});
assert.equal(expired?.refresh, true);
assert.deepEqual((expired?.value as { entries: string[] }).entries, ['oats']);

setScreenSessionClock(() => 2_000_000);
writeScreenCache('user-a', 'schedule', 'today', { title: 'Push' }, '2026-10-31');
assert.equal(
  readScreenCache('user-a', 'schedule', 'today', '2026-11-01', { dateScoped: true, staleAreas: ['schedule'] }),
  null
);

markScreenStale('user-a', ['nutrition']);
setScreenSessionClock(() => 2_000_000);
writeScreenCache('user-a', 'nutrition', '2026-11-01', { entries: ['oats'] }, '2026-11-01');
const stale = readScreenCache('user-a', 'nutrition', '2026-11-01', '2026-11-01', {
  dateScoped: false,
  staleAreas: ['nutrition'],
});
assert.equal(stale?.refresh, true);

for (let day = 0; day < SCREEN_CACHE_LIMITS.nutrition + 1; day += 1) {
  writeScreenCache('user-a', 'nutrition', `day-${day}`, day, '2026-11-01');
}
assert.equal(screenCacheCount('user-a', 'nutrition'), SCREEN_CACHE_LIMITS.nutrition);
assert.equal(
  readScreenCache('user-a', 'nutrition', 'day-0', '2026-11-01', { dateScoped: false, staleAreas: [] }),
  null
);

const dirty = emptyDraft({ showAdd: true, aiDescribe: 'chicken and rice', barcodeValue: '0123' });
assert.equal(nutritionDraftIsDirty(dirty), true);
assert.equal(nutritionDraftIsDirty(emptyDraft()), false);
const refresh = nutritionRefreshKeepsDraft(true);
assert.equal(refresh.replaceSavedEntries, true);
assert.equal(refresh.replaceDraft, false);
assert.equal(refresh.keepDraft, true);
writeNutritionDraft('user-a', dirty);
assert.equal(readNutritionDraft('user-a')?.showAdd, true);

bindScreenSessionUser('user-b');
assert.equal(readNutritionDraft('user-a'), null);
assert.equal(
  readScreenCache('user-a', 'nutrition', '2026-11-01', '2026-11-01', { dateScoped: false, staleAreas: [] }),
  null
);
assert.equal(readNutritionDraft('user-b'), null);
writeScreenCache('user-b', 'dashboard', 'card', { ok: true }, '2026-11-01');
bindScreenSessionUser('user-a');
assert.equal(
  readScreenCache('user-b', 'dashboard', 'card', '2026-11-01', { dateScoped: true, staleAreas: [] }),
  null
);
clearScreenSession();
assert.equal(activeScreenSessionUser(), null);
assert.equal(readNutritionDraft('user-a'), null);

assert.equal(activeWorkoutIsProtected(true, false), true);
assert.equal(activeWorkoutIsProtected(false, true), true);
assert.equal(activeWorkoutIsProtected(false, false), false);

assert.equal(page.includes('function loggerProtected()'), true);
assert.equal(page.includes('if(ownLog&&loggerProtected())return'), true);
assert.equal(page.includes('if(loggerProtected())return'), true);
assert.equal(page.includes('clearScreenSession()'), true);
assert.equal(page.includes('bindScreenSessionUser(session.user.id)'), true);
assert.equal(nutrition.includes('writeNutritionDraft'), true);
assert.equal(nutrition.includes('nutritionDraftIsDirty(draftRef.current)'), true);
assert.equal(schedule.includes("beginScreenPaint<VisibleScheduleSnapshot>('Training'"), true);
assert.equal(schedule.includes('loadVisibleSchedule'), true);
assert.equal(progress.includes("beginScreenPaint<ProgressReport>('Progress'"), true);
assert.deepEqual(screenTimingPhases('Groups'), ['data']);

resetScreenTiming();
beginScreenTiming('Training');
noteCacheMiss('Training');
noteCacheHit('Training');
noteUsable('Training');
const usable = latestScreenTiming('Training')?.usableMs;
beginBackgroundRefresh('Training');
endBackgroundRefresh('Training');
completeScreenPhase('Training', 'schedule');
const span = latestScreenTiming('Training');
assert.equal(span?.measurement, 'browser');
assert.equal(span?.cacheHit, true);
assert.equal(span?.usableMs, usable);
assert.equal(typeof span?.backgroundRefreshMs, 'number');
const summary = screenTimingSummary();
assert.equal(summary.measurement, 'browser');
assert.equal(summary.cacheHits, 1);
assert.equal(summary.cacheHitRate, 1);

setScreenSessionClock(null);
console.log('screen session cache ok');
