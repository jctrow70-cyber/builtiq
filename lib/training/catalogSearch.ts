import { exerciseMatchesEquipment, hasEquipmentFilter } from './equipmentFilter';
import { filterCatalogBySources, normalizeCatalogSources, type CatalogSourceId } from './catalogSources';

/** System/imported exercises only — excludes user custom rows (no form guides). */
export function builtinCatalogItems(items: any[], sources?: CatalogSourceId[] | null) {
  const pool = (items || []).filter((c) => {
    if (c?.is_archived) return false;
    if (c?.user_id) return false;
    if (c?.is_system === true) return true;
    if (c?.external_source) return true;
    return false;
  });
  return filterCatalogBySources(pool, normalizeCatalogSources(sources));
}

export type CatalogSearchFilters = {
  muscle?: string;
  equipment?: string;
  exerciseType?: string;
  /** When set (and not full_gym), limit to exercises matching user equipment */
  availableEquipment?: string[];
};

export type CatalogSearchOptions = {
  query?: string;
  filters?: CatalogSearchFilters;
  limit?: number;
};

function activeItems(items: any[]) {
  return (items || []).filter((c) => !c?.is_archived);
}

function haystack(item: any): string {
  return [
    item?.name,
    item?.muscle_group,
    item?.equipment,
    item?.category,
    item?.exercise_type,
    item?.movement_pattern,
    item?.instructions,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function relevanceScore(item: any, tokens: string[]): number {
  const name = String(item?.name || '').toLowerCase();
  let score = 0;
  tokens.forEach((t, i) => {
    if (!t) return;
    if (name === t) score += 120;
    else if (name.startsWith(t)) score += 80 - i * 5;
    else if (name.includes(t)) score += 40 - i * 3;
    if (String(item?.muscle_group || '').toLowerCase().includes(t)) score += 12;
    if (String(item?.equipment || '').toLowerCase().includes(t)) score += 8;
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
    hasEquipmentFilter(opts.filters?.availableEquipment)
  );

  let pool = applyFilters(activeItems(items), opts.filters);

  if (tokens.length) {
    pool = pool.filter((c) => tokens.every((t) => haystack(c).includes(t)));
    pool.sort((a, b) => {
      const d = relevanceScore(b, tokens) - relevanceScore(a, tokens);
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
    hasEquipmentFilter(opts.filters?.availableEquipment)
  );
  if (!tokens.length && !hasFilters) return 0;

  let pool = applyFilters(activeItems(items), opts.filters);
  if (tokens.length) pool = pool.filter((c) => tokens.every((t) => haystack(c).includes(t)));
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
  const parts = [item?.muscle_group, item?.equipment, item?.exercise_type].filter(Boolean);
  return parts.join(' · ') || 'Exercise';
}

export function hasCatalogSearchInput(query = '', filters?: CatalogSearchFilters) {
  return (
    !!query.trim() ||
    !!(filters?.muscle || filters?.equipment || filters?.exerciseType) ||
    hasEquipmentFilter(filters?.availableEquipment)
  );
}
