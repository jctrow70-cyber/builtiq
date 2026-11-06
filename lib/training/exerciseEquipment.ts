import { canonicalEquipment } from './equipmentIdentity';
import { exerciseMatchesEquipment, hasEquipmentFilter } from './equipmentFilter';

/** Compatible implements for a master-library movement card. */

function splitValues(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v || '').trim()).filter(Boolean);
  return String(raw || '')
    .split(/[;|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pushUnique(out: string[], seen: Set<string>, raw: unknown) {
  splitValues(raw).forEach((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
}

export function compatibleEquipmentOptions(catalogItem?: any, fallback?: string): string[] {
  const meta = catalogItem?.coaching_metadata;
  const seen = new Set<string>();
  const out: string[] = [];
  pushUnique(out, seen, catalogItem?.equipment);
  pushUnique(out, seen, meta?.default_equipment);
  pushUnique(out, seen, meta?.compatible_equipment);
  pushUnique(out, seen, fallback);
  return out;
}

export function resolveExerciseEquipment(ex?: any, catalogItem?: any): string {
  const options = compatibleEquipmentOptions(catalogItem, ex?.equipment);
  const current = String(ex?.equipment || '').trim();
  if (!current) return options.length === 1 ? options[0] : '';
  const currentKey = canonicalEquipment(current).key;
  const match = options.find((item) => canonicalEquipment(item).key === currentKey);
  return match || current;
}

/**
 * Default implement when creating or seeding an exercise row.
 * Prefers an already-stored value, then catalog default_equipment, then the
 * first compatible option. When the program/athlete has a real equipment
 * filter, prefer an option that matches that gym.
 */
export function defaultCatalogEquipment(
  catalogItem?: any,
  current?: any,
  availableEquipment?: string[] | null
): string {
  const options = compatibleEquipmentOptions(catalogItem, current?.equipment);
  const currentEq = String(current?.equipment || '').trim();
  if (currentEq && options.some((item) => item.toLowerCase() === currentEq.toLowerCase())) return currentEq;

  const preferredDefault = String(
    catalogItem?.coaching_metadata?.default_equipment || catalogItem?.equipment || ''
  ).trim();

  let pool = options;
  if (hasEquipmentFilter(availableEquipment)) {
    const filtered = options.filter((opt) =>
      exerciseMatchesEquipment(
        { equipment: opt, coaching_metadata: { compatible_equipment: [opt] } },
        availableEquipment || []
      )
    );
    if (filtered.length) pool = filtered;
  }

  if (preferredDefault) {
    const preferredKey = preferredDefault.toLowerCase();
    const hit = pool.find((item) => item.toLowerCase() === preferredKey);
    if (hit) return hit;
  }

  return pool[0] || options[0] || preferredDefault || '';
}

/**
 * Seed optimistic equipment for blank multi-implement cards from the catalog /
 * program default so logging is not blocked. Single-option cards already
 * resolve without a pending value. Returns null when nothing changes.
 */
export function seedPendingEquipmentDefaults(input: {
  exercises?: Array<{ id?: string | null; equipment?: string | null; catalog_exercise_id?: string | null }> | null;
  catalogById: (id: string) => any;
  pending: Record<string, string>;
  availableEquipment?: string[] | null;
}): Record<string, string> | null {
  const exercises = input.exercises || [];
  let changed = false;
  const next = { ...input.pending };
  for (const ex of exercises) {
    const id = String(ex?.id || '').trim();
    if (!id || Object.prototype.hasOwnProperty.call(next, id) || String(ex?.equipment || '').trim()) continue;
    const catItem = input.catalogById(String(ex?.catalog_exercise_id || ''));
    const options = compatibleEquipmentOptions(catItem, ex?.equipment);
    if (options.length <= 1) continue;
    const def = defaultCatalogEquipment(catItem, ex, input.availableEquipment);
    if (!def) continue;
    next[id] = def;
    changed = true;
  }
  return changed ? next : null;
}
