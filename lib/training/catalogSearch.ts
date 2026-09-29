import { exerciseMatchesEquipment, hasEquipmentFilter } from './equipmentFilter';
import {
  catalogItemHasGuide,
  catalogItemPreferenceScore,
  filterCatalogBySources,
  normalizeCatalogNameKey,
  normalizeCatalogSources,
  UNIFIED_CATALOG_SOURCES,
  type CatalogSourceId,
} from './catalogSources';
import { hasExerciseGuide } from './exerciseMedia';
import {
  inferExerciseType,
  isAuthoritativeCardioCategory,
  isCardioActivityName,
  isStrengthLike,
  type ExerciseType,
} from './exerciseTypes';

function systemCatalogPool(items: any[]) {
  return (items || []).filter((c) => {
    if (c?.is_archived) return false;
    if (c?.user_id) return false;
    if (c?.is_system === true) return true;
    if (c?.external_source) return true;
    return false;
  });
}

/** Prefer guided / curated rows when the same exercise name exists in multiple libraries. */
export function dedupeCatalogByName(items: any[]) {
  const byName = new Map<string, any>();
  for (const item of items) {
    const key = normalizeCatalogNameKey(item?.name);
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing || catalogItemPreferenceScore(item) > catalogItemPreferenceScore(existing)) {
      byName.set(key, item);
    }
  }
  return Array.from(byName.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

/** System/imported exercises only — excludes user custom rows. Merges all built-in libraries by default. */
export function builtinCatalogItems(items: any[], sources?: CatalogSourceId[] | null) {
  const pool = systemCatalogPool(items);
  const enabled = sources == null ? UNIFIED_CATALOG_SOURCES : normalizeCatalogSources(sources);
  return dedupeCatalogByName(filterCatalogBySources(pool, enabled));
}

/** Active custom exercises owned by the signed-in user. */
export function userCustomCatalogItems(items: any[], userId?: string | null) {
  if (!userId) return [];
  return (items || []).filter(
    (c) => !c?.is_archived && c?.is_system === false && c?.user_id === userId
  );
}

/** Built-in library plus the user's custom exercises for Training add/search UI. User rows win same-name collisions. */
export function workoutSearchCatalogItems(
  items: any[],
  userId?: string | null,
  sources?: CatalogSourceId[] | null
) {
  const builtin = builtinCatalogItems(items, sources);
  const custom = userCustomCatalogItems(items, userId);
  if (!custom.length) return builtin;

  const byName = new Map<string, any>();
  for (const item of builtin) {
    const key = normalizeCatalogNameKey(item?.name);
    if (key) byName.set(key, item);
  }
  for (const item of custom) {
    const key = normalizeCatalogNameKey(item?.name);
    if (key) byName.set(key, item);
  }
  return Array.from(byName.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export type CatalogSearchFilters = {
  muscle?: string;
  equipment?: string;
  exerciseType?: string;
  /** When true, only exercises with thumbnail, GIF, or instructions */
  guidesOnly?: boolean;
  /** When set (and not full_gym), limit to exercises matching user equipment */
  availableEquipment?: string[];
};

export type CatalogSearchOptions = {
  query?: string;
  filters?: CatalogSearchFilters;
  limit?: number;
  /** Picker section: strength, cardio, warmup, cooldown */
  section?: string;
};

function activeItems(items: any[]) {
  return (items || []).filter((c) => !c?.is_archived);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-token match so "row" does not hit "Prowler". */
export function textHasToken(text: unknown, token: string) {
  const hay = String(text || '');
  const t = String(token || '').trim();
  if (!hay || !t) return false;
  return new RegExp(`\\b${escapeRegExp(t)}\\b`, 'i').test(hay);
}

function searchableFields(item: any): string[] {
  const aliases = Array.isArray(item?.coaching_metadata?.aliases) ? item.coaching_metadata.aliases : [];
  return [
    item?.name,
    ...aliases,
    item?.muscle_group,
    item?.equipment,
    item?.category,
    item?.exercise_type,
    item?.movement_pattern,
    item?.coaching_metadata?.master_category,
    item?.coaching_metadata?.master_movement,
    ...(Array.isArray(item?.coaching_metadata?.compatible_equipment)
      ? item.coaching_metadata.compatible_equipment
      : []),
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

function itemMatchesTokens(item: any, tokens: string[]) {
  const fields = searchableFields(item);
  return tokens.every((token) => fields.some((field) => textHasToken(field, token)));
}

function resolvedExerciseType(item: any): ExerciseType {
  const masterCategory = item?.coaching_metadata?.master_category || item?.category || '';
  return inferExerciseType(item?.name, item?.muscle_group, masterCategory, item?.exercise_type);
}

export function catalogItemIsCardio(item: any) {
  if (isAuthoritativeCardioCategory(item?.coaching_metadata?.master_category || item?.category)) return true;
  if (isCardioActivityName(item?.name)) return true;
  return resolvedExerciseType(item) === 'cardio';
}

function contextScore(item: any, section?: string) {
  const sec = String(section || '').toLowerCase();
  if (!sec) return 0;
  const cardio = catalogItemIsCardio(item);
  const strengthLike = isStrengthLike(resolvedExerciseType(item)) && !cardio;
  if (sec === 'cardio') return cardio ? 90 : -50;
  if (sec === 'strength') return strengthLike ? 90 : cardio ? -80 : 20;
  if (sec === 'warmup' || sec === 'cooldown') return cardio ? -15 : 10;
  return 0;
}

function relevanceScore(item: any, tokens: string[], section?: string): number {
  const name = String(item?.name || '').toLowerCase();
  const aliases = Array.isArray(item?.coaching_metadata?.aliases)
    ? item.coaching_metadata.aliases.map((a: unknown) => String(a || '').toLowerCase())
    : [];
  let score = contextScore(item, section);
  if (catalogItemHasGuide(item) || hasExerciseGuide(item)) score += 25;
  tokens.forEach((t, i) => {
    if (!t) return;
    if (name === t) score += 120;
    else if (name.startsWith(`${t} `) || name === t) score += 80 - i * 5;
    else if (textHasToken(name, t)) score += 40 - i * 3;
    if (aliases.some((alias) => alias === t)) score += 50;
    else if (aliases.some((alias) => textHasToken(alias, t))) score += 18;
    if (textHasToken(item?.muscle_group, t)) score += 12;
    if (textHasToken(item?.equipment, t)) score += 8;
  });
  return score;
}

function applyFilters(pool: any[], filters?: CatalogSearchFilters) {
  const muscle = String(filters?.muscle || '').trim();
  const equipment = String(filters?.equipment || '').trim();
  const exerciseType = String(filters?.exerciseType || '').trim();
  let out = pool;
  if (muscle) out = out.filter((c) => String(c.muscle_group || '') === muscle);
  if (equipment) out = out.filter((c) => String(c.equipment || '') === equipment);
  if (exerciseType) out = out.filter((c) => String(c.exercise_type || '') === exerciseType);
  if (filters?.guidesOnly) out = out.filter((c) => catalogItemHasGuide(c) || hasExerciseGuide(c));
  if (hasEquipmentFilter(filters?.availableEquipment)) {
    out = out.filter((c) => exerciseMatchesEquipment(c, filters!.availableEquipment!));
  }
  return out;
}

function tokenize(query: string) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function searchCatalog(items: any[], opts: CatalogSearchOptions = {}) {
  const limit = opts.limit ?? 50;
  const tokens = tokenize(opts.query || '');
  const hasFilters = !!(
    opts.filters?.muscle ||
    opts.filters?.equipment ||
    opts.filters?.exerciseType ||
    opts.filters?.guidesOnly ||
    hasEquipmentFilter(opts.filters?.availableEquipment)
  );

  let pool = applyFilters(activeItems(items), opts.filters);

  if (tokens.length) {
    pool = pool.filter((c) => itemMatchesTokens(c, tokens));
    pool.sort((a, b) => {
      const d = relevanceScore(b, tokens, opts.section) - relevanceScore(a, tokens, opts.section);
      if (d) return d;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  } else if (hasFilters) {
    pool.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  } else {
    return [];
  }

  return pool.slice(0, limit);
}

export function countCatalogMatches(items: any[], opts: CatalogSearchOptions = {}) {
  const tokens = tokenize(opts.query || '');
  const hasFilters = !!(
    opts.filters?.muscle ||
    opts.filters?.equipment ||
    opts.filters?.exerciseType ||
    opts.filters?.guidesOnly ||
    hasEquipmentFilter(opts.filters?.availableEquipment)
  );
  if (!tokens.length && !hasFilters) return 0;

  let pool = applyFilters(activeItems(items), opts.filters);
  if (tokens.length) pool = pool.filter((c) => itemMatchesTokens(c, tokens));
  return pool.length;
}

export function buildCatalogFilterOptions(items: any[]) {
  const active = activeItems(items);
  const uniq = (field: string) =>
    Array.from(new Set(active.map((c) => String(c[field] || '').trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  return {
    muscles: uniq('muscle_group'),
    equipment: uniq('equipment'),
    exerciseTypes: uniq('exercise_type'),
  };
}

export function catalogResultMeta(item: any): string {
  const type = resolvedExerciseType(item);
  const parts = [item?.muscle_group, item?.equipment, type].filter(Boolean);
  return parts.join(' · ') || 'Exercise';
}

export function hasCatalogSearchInput(query = '', filters?: CatalogSearchFilters) {
  return (
    !!query.trim() ||
    !!(filters?.muscle || filters?.equipment || filters?.exerciseType || filters?.guidesOnly) ||
    hasEquipmentFilter(filters?.availableEquipment)
  );
}
