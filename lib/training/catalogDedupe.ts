import { catalogItemPreferenceScore, normalizeCatalogNameKey } from './catalogSources';

export type CatalogAliasIndex = {
  canonicalByKey: Map<string, any>;
  idsByKey: Map<string, string[]>;
  keyById: Map<string, string>;
};

export function buildCatalogAliasIndex(items: any[]): CatalogAliasIndex {
  const canonicalByKey = new Map<string, any>();
  const idsByKey = new Map<string, string[]>();
  const keyById = new Map<string, string>();

  for (const item of items || []) {
    if (item?.is_archived) continue;
    const key = normalizeCatalogNameKey(item?.name);
    if (!key) continue;
    const id = String(item.id || '');
    if (id) {
      keyById.set(id, key);
      const ids = idsByKey.get(key) || [];
      if (!ids.includes(id)) ids.push(id);
      idsByKey.set(key, ids);
    }
    const existing = canonicalByKey.get(key);
    if (!existing || catalogItemPreferenceScore(item) > catalogItemPreferenceScore(existing)) {
      canonicalByKey.set(key, item);
    }
  }

  return { canonicalByKey, idsByKey, keyById };
}

/** History lookup keys — merges all catalog ids that share the same exercise name. */
export function catalogHistoryAliasKeys(
  catalog: any[],
  catalogId?: string | null,
  name?: string | null
): string[] {
  const index = buildCatalogAliasIndex(catalog);
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
  return buildCatalogAliasIndex(catalog).canonicalByKey.get(key) || null;
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
