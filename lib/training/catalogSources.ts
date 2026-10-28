/** Exercise catalog source packs — users can enable multiple libraries in search. */

import { hasExerciseGuide } from './exerciseMedia';

export type CatalogSourceId =
  | 'builtiq_master'
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
    id: 'builtiq_master',
    label: 'BuildIQ Master Library',
    description: 'Curated movement library (one card per pattern, compatible equipment)',
    defaultEnabled: true,
    hasGuides: true,
  },
  {
    id: 'exercisedb',
    label: 'Guided Library',
    description: 'Withheld until ExerciseDB commercial rights are verified',
    defaultEnabled: false,
    hasGuides: false,
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
    description: 'Common gym exercises with simple names',
    defaultEnabled: false,
  },
  {
    id: 'free_exercise_db',
    label: 'Photo Library (Legacy)',
    description: 'Imported exercise text. Photos stay hidden until image rights are verified.',
    defaultEnabled: false,
    hasGuides: true,
  },
];

export const DEFAULT_CATALOG_SOURCES: CatalogSourceId[] = CATALOG_SOURCES.filter((s) => s.defaultEnabled).map(
  (s) => s.id
);

/** Built-in libraries in search. ExerciseDB stays out until commercial rights are verified. */
export const UNIFIED_CATALOG_SOURCES: CatalogSourceId[] = CATALOG_SOURCES.map((s) => s.id).filter(
  (id) => id !== 'exercisedb'
);

/** Lower rank = preferred when the same exercise name exists in multiple libraries. */
export const CATALOG_SOURCE_PREFERENCE: Record<CatalogSourceId, number> = {
  builtiq_master: 0,
  exercisedb: 1,
  builtiq_essentials: 2,
  builtiq_basic: 3,
  free_exercise_db: 4,
};

export function normalizeCatalogMatchKey(name: string): string {
  let s = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[''´`]/g, '')
    .replace(/[-_/.,]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 2 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
  return s;
}

export function normalizeCatalogNameKey(name: string): string {
  return normalizeCatalogMatchKey(name) || String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
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
  const allowed = new Set(UNIFIED_CATALOG_SOURCES);
  const list = (raw || []).filter((id): id is CatalogSourceId => allowed.has(id as CatalogSourceId));
  return list.length ? list : [...DEFAULT_CATALOG_SOURCES];
}

/** Map a catalog row to its source pack for filtering. */
export function catalogItemSource(item: any): CatalogSourceId {
  const ext = String(item?.external_source || '').trim().toLowerCase();
  if (ext === 'builtiq_master') return 'builtiq_master';
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
  return hasExerciseGuide(item);
}
