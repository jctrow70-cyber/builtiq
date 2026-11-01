import { beginBackgroundRefresh, endBackgroundRefresh, noteCacheHit, noteCacheMiss, noteUsable } from './screenTiming';

/**
 * In-memory screen cache for the signed-in user.
 * Never written to localStorage and never readable by another account.
 * A 30 second age skips a repeat fetch only when the area is not marked stale,
 * the dashboard card generation still matches, and, for date-scoped snapshots,
 * the local calendar day is unchanged.
 *
 * Dashboard cards each have a generation. finishScreenPaint may clear the shared
 * dashboard flag as soon as the first card finishes. A later card still refetches
 * when its own generation is newer than the cached snapshot.
 */

export const SCREEN_CACHE_TTL_MS = 30_000;

export const SCREEN_CACHE_LIMITS = {
  nutrition: 14,
  schedule: 3,
  progress: 4,
  dashboard: 6,
  groups: 2,
} as const;

export type CacheSlot = keyof typeof SCREEN_CACHE_LIMITS;

export type StaleArea = 'program' | 'schedule' | 'nutrition' | 'progress' | 'groups' | 'dashboard';

export const DASHBOARD_CARDS = ['training', 'week', 'nutrition', 'progress'] as const;

export type DashboardCardKey = (typeof DASHBOARD_CARDS)[number];

export type DashboardCardGeneration = {
  card: DashboardCardKey;
  epoch: number;
};

export type NutritionDraftSnapshot = {
  logDate: string;
  showAdd: boolean;
  addFoodView: string;
  estimateSearch: string;
  showMyFoods: boolean;
  addDraft: { food_name?: string } | null;
  editEntryId: string | null;
  editDraft: unknown;
  editFoodId: string | null;
  foodEditDraft: unknown;
  foodSearch: string;
  pickedCatalogId: string | null;
  aiDescribe: string;
  aiEstimateResult: unknown;
  barcodeValue: string;
  barcodeProduct: unknown;
  barcodeNotFound: unknown;
  barcodeServingQty: string;
  showBarcodeScanner: boolean;
  copySource: unknown;
  copyDraft: unknown;
  expandedMeals: Record<string, boolean> | null;
};

export type ScreenCacheRead<T> = {
  value: T;
  refresh: boolean;
};

type CacheEntry = {
  savedAt: number;
  localDate: string;
  value: unknown;
  cardEpoch?: number;
};

type Bucket = {
  stale: Set<StaleArea>;
  dashboardCardEpoch: Record<DashboardCardKey, number>;
  slots: Record<CacheSlot, Map<string, CacheEntry>>;
};

let activeUserId: string | null = null;
let clock = () => Date.now();
const buckets = new Map<string, Bucket>();
const drafts = new Map<string, NutritionDraftSnapshot>();
const listeners = new Set<() => void>();

function emptyCardEpochs(): Record<DashboardCardKey, number> {
  return { training: 0, week: 0, nutrition: 0, progress: 0 };
}

function emptyBucket(): Bucket {
  return {
    stale: new Set(),
    dashboardCardEpoch: emptyCardEpochs(),
    slots: {
      nutrition: new Map(),
      schedule: new Map(),
      progress: new Map(),
      dashboard: new Map(),
      groups: new Map(),
    },
  };
}

function emit() {
  listeners.forEach((listener) => listener());
}

function bucketFor(userId: string): Bucket | null {
  if (!userId || userId !== activeUserId) return null;
  return buckets.get(userId) || null;
}

export function setScreenSessionClock(next: (() => number) | null) {
  clock = next || (() => Date.now());
}

export function subscribeScreenSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Drop every account's cached screens, then keep only the new user. */
export function bindScreenSessionUser(userId: string | null) {
  if (userId && userId === activeUserId) return;
  buckets.clear();
  drafts.clear();
  activeUserId = userId;
  if (userId) buckets.set(userId, emptyBucket());
  emit();
}

export function clearScreenSession() {
  buckets.clear();
  drafts.clear();
  activeUserId = null;
  emit();
}

export function activeScreenSessionUser() {
  return activeUserId;
}

export function markScreenStale(userId: string, areas: StaleArea[]) {
  const row = bucketFor(userId);
  if (!row || !areas.length) return;
  areas.forEach((area) => row.stale.add(area));
  if (areas.includes('dashboard')) {
    DASHBOARD_CARDS.forEach((card) => {
      row.dashboardCardEpoch[card] += 1;
    });
  }
  emit();
}

/** Advance one Dashboard card. This survives another card clearing the shared dashboard flag. */
export function bumpDashboardCardEpoch(userId: string, card: DashboardCardKey) {
  const row = bucketFor(userId);
  if (!row) return 0;
  row.dashboardCardEpoch[card] += 1;
  emit();
  return row.dashboardCardEpoch[card];
}

export function dashboardCardEpoch(userId: string, card: DashboardCardKey) {
  return bucketFor(userId)?.dashboardCardEpoch[card] ?? 0;
}

/** A response may update the card only when it belongs to the active user and the generation it started with. */
export function dashboardWriteCurrent(userId: string, card: DashboardCardKey, epoch: number) {
  return !!userId && userId === activeUserId && dashboardCardEpoch(userId, card) === epoch;
}

export function clearScreenStale(userId: string, areas: StaleArea[]) {
  const row = bucketFor(userId);
  if (!row) return;
  let changed = false;
  areas.forEach((area) => {
    if (row.stale.delete(area)) changed = true;
  });
  if (changed) emit();
}

export function isScreenStale(userId: string, area: StaleArea) {
  return !!bucketFor(userId)?.stale.has(area);
}

export function writeScreenCache<T>(
  userId: string,
  slot: CacheSlot,
  key: string,
  value: T,
  localDate: string,
  generation?: DashboardCardGeneration
): boolean {
  const row = bucketFor(userId);
  if (!row || !key) return false;
  if (generation && row.dashboardCardEpoch[generation.card] !== generation.epoch) return false;
  const map = row.slots[slot];
  map.delete(key);
  map.set(key, { savedAt: clock(), localDate, value, cardEpoch: generation?.epoch });
  const limit = SCREEN_CACHE_LIMITS[slot];
  while (map.size > limit) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  return true;
}

export function readScreenCache<T>(
  userId: string,
  slot: CacheSlot,
  key: string,
  localDate: string,
  options: { dateScoped: boolean; staleAreas: StaleArea[]; dashboardCard?: DashboardCardKey }
): ScreenCacheRead<T> | null {
  const row = bucketFor(userId);
  const entry = row?.slots[slot].get(key);
  if (!row || !entry) return null;
  if (options.dateScoped && entry.localDate !== localDate) return null;
  const stale = options.staleAreas.some((area) => row.stale.has(area));
  const expired = clock() - entry.savedAt >= SCREEN_CACHE_TTL_MS;
  const cardBehind = options.dashboardCard != null && (entry.cardEpoch ?? 0) < row.dashboardCardEpoch[options.dashboardCard];
  return { value: entry.value as T, refresh: stale || expired || cardBehind };
}

export function deleteScreenCache(userId: string, slot: CacheSlot, key: string) {
  bucketFor(userId)?.slots[slot].delete(key);
}

export function screenCacheCount(userId: string, slot: CacheSlot) {
  return bucketFor(userId)?.slots[slot].size || 0;
}

export function writeNutritionDraft(userId: string, draft: NutritionDraftSnapshot) {
  if (userId !== activeUserId) return;
  drafts.set(userId, draft);
}

export function readNutritionDraft(userId: string) {
  if (userId !== activeUserId) return null;
  return drafts.get(userId) || null;
}

export function clearNutritionDraft(userId: string) {
  drafts.delete(userId);
}

/** Open panels, typed food, and lookup results are unsaved input. */
export function nutritionDraftIsDirty(draft: NutritionDraftSnapshot | null) {
  if (!draft) return false;
  if (draft.showAdd || draft.showMyFoods || draft.showBarcodeScanner) return true;
  if (draft.editEntryId || draft.editFoodId || draft.editDraft || draft.foodEditDraft) return true;
  if (draft.aiDescribe.trim() || draft.aiEstimateResult) return true;
  if (draft.barcodeValue.trim() || draft.barcodeProduct || draft.barcodeNotFound) return true;
  if (draft.estimateSearch.trim() || draft.foodSearch.trim() || draft.pickedCatalogId) return true;
  if (draft.copySource) return true;
  if (String(draft.addDraft?.food_name || '').trim()) return true;
  return false;
}

/**
 * A background nutrition reload may replace saved rows.
 * It must not clear an open draft.
 */
export function nutritionRefreshKeepsDraft(dirty: boolean) {
  return { replaceSavedEntries: true, replaceDraft: false, keepDraft: dirty || true };
}

/** Logged sets and the open workout stay put while a session or set write is in flight. */
export function activeWorkoutIsProtected(sessionOpen: boolean, writesInFlight: boolean) {
  return sessionOpen || writesInFlight;
}

export function beginScreenPaint<T>(
  screen: string,
  userId: string,
  slot: CacheSlot,
  key: string,
  localDate: string,
  options: { dateScoped: boolean; staleAreas: StaleArea[]; dashboardCard?: DashboardCardKey }
): { cached: T | null; background: boolean } {
  const hit = readScreenCache<T>(userId, slot, key, localDate, options);
  if (hit) {
    noteCacheHit(screen);
    noteUsable(screen);
    if (hit.refresh) beginBackgroundRefresh(screen);
    return { cached: hit.value, background: hit.refresh };
  }
  noteCacheMiss(screen);
  return { cached: null, background: false };
}

export function finishScreenPaint(screen: string, userId: string, areas: StaleArea[], background: boolean) {
  if (background) endBackgroundRefresh(screen);
  noteUsable(screen);
  clearScreenStale(userId, areas);
}
