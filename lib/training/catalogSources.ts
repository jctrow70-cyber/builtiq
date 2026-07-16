/** Exercise catalog source packs — users can enable multiple libraries in search. */

export type CatalogSourceId =
  | 'builtiq_essentials'
  | 'builtiq_basic'
  | 'exercisedb'
  | 'free_exercise_db';

export type CatalogSourceMeta = {
  id: CatalogSourceId;
  label: string;
  description: string;
  defaultEnabled: boolean;
  hasGuides?: boolean;
};

export const CATALOG_SOURCES: CatalogSourceMeta[] = [
  {
    id: 'exercisedb',
    label: 'Guided Library',
    description: '1,500+ exercises with animated GIF demos, thumbnails, and step-by-step instructions',
    defaultEnabled: true,
    hasGuides: true,
  },
  {
    id: 'builtiq_essentials',
    label: 'BuildIQ Essentials',
    description: 'Curated staples used in templates and AI plans (squat, bench, rows, etc.)',
    defaultEnabled: true,
  },
  {
    id: 'builtiq_basic',
    label: 'Basic Gym',
    description: 'Common gym exercises with simple names — text only unless linked to Guided Library',
    defaultEnabled: false,
  },
  {
    id: 'free_exercise_db',
    label: 'Photo Library (Legacy)',
    description: '873 imported exercises with still photos — odd names, no GIF demos',
    defaultEnabled: false,
    hasGuides: true,
  },
];

export const DEFAULT_CATALOG_SOURCES: CatalogSourceId[] = CATALOG_SOURCES.filter((s) => s.defaultEnabled).map(
  (s) => s.id
);

/** All built-in libraries merged for seamless user search (no per-user toggles). */
export const UNIFIED_CATALOG_SOURCES: CatalogSourceId[] = CATALOG_SOURCES.map((s) => s.id);

/** Lower rank = preferred when the same exercise name exists in multiple libraries. */
export const CATALOG_SOURCE_PREFERENCE: Record<CatalogSourceId, number> = {
  exercisedb: 0,
  builtiq_essentials: 1,
  builtiq_basic: 2,
  free_exercise_db: 3,
};

export function normalizeCatalogNameKey(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function catalogItemPreferenceScore(item: any): number {
  const src = catalogItemSource(item);
  const rank = CATALOG_SOURCE_PREFERENCE[src] ?? 9;
  let score = (10 - rank) * 100;
  if (catalogItemHasGuide(item)) score += 40;
  if (String(item?.gif_url || '').trim()) score += 25;
  if (String(item?.instructions || '').trim()) score += 10;
  return score;
}

export function normalizeCatalogSources(raw?: string[] | null): CatalogSourceId[] {
  const allowed = new Set(CATALOG_SOURCES.map((s) => s.id));
  const list = (raw || []).filter((id): id is CatalogSourceId => allowed.has(id as CatalogSourceId));
  return list.length ? list : [...DEFAULT_CATALOG_SOURCES];
}

/** Map a catalog row to its source pack for filtering. */
export function catalogItemSource(item: any): CatalogSourceId {
  const ext = String(item?.external_source || '').trim().toLowerCase();
  if (ext === 'exercisedb') return 'exercisedb';
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

export function catalogItemHasGuide(item: any): boolean {
  return !!(
    String(item?.image_url || '').trim() ||
    String(item?.gif_url || '').trim() ||
    String(item?.media_url || '').trim() ||
    String(item?.instructions || '').trim()
  );
}
