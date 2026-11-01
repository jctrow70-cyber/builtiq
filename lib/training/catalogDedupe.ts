import { catalogItemPreferenceScore, normalizeCatalogNameKey } from './catalogSources';

export type CatalogAliasIndex = {
  canonicalByKey: Map<string, any>;
  idsByKey: Map<string, string[]>;
  keyById: Map<string, string>;
  /** Every catalog id, including archived rows. Distinguishes an id from a name key. */
  ids: Set<string>;
};

export function buildCatalogAliasIndex(items: any[]): CatalogAliasIndex {
  const canonicalByKey = new Map<string, any>();
  const idsByKey = new Map<string, string[]>();
  const keyById = new Map<string, string>();
  const ids = new Set<string>();

  for (const item of items || []) {
    const id = String(item?.id || '');
    if (id) ids.add(id);
    if (item?.is_archived) continue;
    const key = normalizeCatalogNameKey(item?.name);
    if (!key) continue;
    if (id) {
      keyById.set(id, key);
      const grouped = idsByKey.get(key) || [];
      if (!grouped.includes(id)) grouped.push(id);
      idsByKey.set(key, grouped);
    }
    const existing = canonicalByKey.get(key);
    if (!existing || catalogItemPreferenceScore(item) > catalogItemPreferenceScore(existing)) {
      canonicalByKey.set(key, item);
    }
  }

  return { canonicalByKey, idsByKey, keyById, ids };
}

let aliasIndexCache = new WeakMap<object, CatalogAliasIndex>();
let aliasIndexBuilds = 0;

/** One index per catalog array. Logging must not rebuild it for every history row. */
export function sharedCatalogAliasIndex(items: any[] | null | undefined): CatalogAliasIndex {
  const list = items || [];
  const cached = aliasIndexCache.get(list);
  if (cached) return cached;
  aliasIndexBuilds += 1;
  const built = buildCatalogAliasIndex(list);
  aliasIndexCache.set(list, built);
  return built;
}

export function sharedCatalogAliasIndexBuilds() {
  return aliasIndexBuilds;
}

export function resetSharedCatalogAliasIndexCache() {
  aliasIndexCache = new WeakMap();
  aliasIndexBuilds = 0;
}

/** History lookup keys — merges all catalog ids that share the same exercise name. */
export function catalogHistoryAliasKeys(
  catalog: any[],
  catalogId?: string | null,
  name?: string | null
): string[] {
  const index = sharedCatalogAliasIndex(catalog);
  const aliases = new Set<string>();
  const id = String(catalogId || '').trim();
  const nm = String(name || '').trim();
  if (id) aliases.add(id);
  if (nm) aliases.add(nm.toLowerCase());

  const keys = new Set<string>();
  if (id && index.keyById.has(id)) keys.add(index.keyById.get(id)!);
  if (nm) keys.add(normalizeCatalogNameKey(nm));

  keys.forEach((key) => {
    aliases.add(key);
    (index.idsByKey.get(key) || []).forEach((cid) => aliases.add(cid));
  });

  return Array.from(aliases);
}

export function pickCanonicalCatalogItem(catalog: any[], name: string): any | null {
  const key = normalizeCatalogNameKey(name);
  if (!key) return null;
  return sharedCatalogAliasIndex(catalog).canonicalByKey.get(key) || null;
}

export type CatalogDuplicateGroup = {
  matchKey: string;
  canonical: any;
  duplicates: any[];
};

export function findCatalogDuplicateGroups(catalog: any[]): CatalogDuplicateGroup[] {
  const index = buildCatalogAliasIndex(catalog);
  const groups: CatalogDuplicateGroup[] = [];
  index.idsByKey.forEach((ids, matchKey) => {
    if (ids.length < 2) return;
    const items = ids
      .map((cid) => (catalog || []).find((c) => c.id === cid))
      .filter(Boolean);
    if (items.length < 2) return;
    const canonical = index.canonicalByKey.get(matchKey) || items[0];
    const duplicates = items.filter((c) => c.id !== canonical.id);
    groups.push({ matchKey, canonical, duplicates });
  });
  return groups.sort((a, b) => String(a.canonical?.name || '').localeCompare(String(b.canonical?.name || '')));
}
