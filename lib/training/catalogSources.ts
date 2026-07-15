/** Exercise catalog source packs — users can enable multiple libraries in search. */

export type CatalogSourceId = 'builtiq_essentials' | 'builtiq_basic' | 'free_exercise_db';

export type CatalogSourceMeta = {
  id: CatalogSourceId;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

export const CATALOG_SOURCES: CatalogSourceMeta[] = [
  {
    id: 'builtiq_essentials',
    label: 'BuiltIQ Essentials',
    description: 'Curated staples used in templates and AI plans (squat, bench, rows, etc.)',
    defaultEnabled: true,
  },
  {
    id: 'builtiq_basic',
    label: 'Basic Gym',
    description: 'Common gym exercises with simple names — no obscure variations',
    defaultEnabled: true,
  },
  {
    id: 'free_exercise_db',
    label: 'Full Exercise DB',
    description: 'Large imported library (800+) — includes niche and oddly named exercises',
    defaultEnabled: false,
  },
];

export const DEFAULT_CATALOG_SOURCES: CatalogSourceId[] = CATALOG_SOURCES.filter((s) => s.defaultEnabled).map(
  (s) => s.id
);

export function normalizeCatalogSources(raw?: string[] | null): CatalogSourceId[] {
  const allowed = new Set(CATALOG_SOURCES.map((s) => s.id));
  const list = (raw || []).filter((id): id is CatalogSourceId => allowed.has(id as CatalogSourceId));
  return list.length ? list : [...DEFAULT_CATALOG_SOURCES];
}

/** Map a catalog row to its source pack for filtering. */
export function catalogItemSource(item: any): CatalogSourceId {
  const ext = String(item?.external_source || '').trim().toLowerCase();
  if (ext === 'free_exercise_db') return 'free_exercise_db';
  if (ext === 'builtiq_basic') return 'builtiq_basic';
  if (item?.is_system === true || ext === 'builtiq_essentials') return 'builtiq_essentials';
  return 'builtiq_essentials';
}

export function filterCatalogBySources(items: any[], sources: CatalogSourceId[]) {
  const enabled = new Set(normalizeCatalogSources(sources));
  return (items || []).filter((c) => enabled.has(catalogItemSource(c)));
}

export function catalogSourceLabel(id: CatalogSourceId): string {
  return CATALOG_SOURCES.find((s) => s.id === id)?.label || id;
}
