/**
 * Shared equipment identity for logging, history, Copy Last, personal records,
 * Progress, and adaptation. Aliases fold at read time. Stored snapshot text is
 * not rewritten here.
 */

const ALIASES: Record<string, string> = {
  db: 'Dumbbell',
  dumbbell: 'Dumbbell',
  dumbbells: 'Dumbbell',
  dumbell: 'Dumbbell',
  bb: 'Barbell',
  barbell: 'Barbell',
  smith: 'Smith Machine',
  'smith machine': 'Smith Machine',
  smithmachine: 'Smith Machine',
  kb: 'Kettlebell',
  kettlebell: 'Kettlebell',
  'ez-bar': 'EZ-Bar',
  'ez bar': 'EZ-Bar',
  ezbar: 'EZ-Bar',
  cable: 'Cable',
  cables: 'Cable',
  'cable machine': 'Cable',
  band: 'Bands',
  bands: 'Bands',
  'resistance band': 'Bands',
  'resistance bands': 'Bands',
  bodyweight: 'Bodyweight',
  'body weight': 'Bodyweight',
  machine: 'Machine',
};

export function canonicalEquipment(value?: string | null): { key: string; label: string } {
  const trimmed = String(value || '').trim();
  if (!trimmed) return { key: 'unspecified', label: 'Unspecified' };
  const folded = trimmed.toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const label = ALIASES[folded];
  if (label) return { key: label.toLowerCase(), label };
  return { key: folded, label: trimmed };
}

/** Both unknown stays comparable. A known implement never matches unknown or a different implement. */
export function equipmentKeysComparable(a?: string | null, b?: string | null): boolean {
  const left = canonicalEquipment(a).key;
  const right = canonicalEquipment(b).key;
  if (left === 'unspecified' && right === 'unspecified') return true;
  if (left === 'unspecified' || right === 'unspecified') return false;
  return left === right;
}

/**
 * Bilateral and a missing variant stay comparable.
 * Unilateral and alternating are their own series and do not match bilateral.
 */
export function comparableVariantKey(value?: string | null): string {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!key || key === 'bilateral' || key === 'both') return '';
  if (key === 'unilateral' || key === 'single arm' || key === 'one arm') return 'unilateral';
  if (key === 'alternating' || key === 'alternate') return 'alternating';
  return key;
}

/**
 * Plate-loaded iso-lateral presses added in BIQ-0319.
 * The typed number is the combined load for both arms, or the working arm when the set is single-arm.
 * Dumbbell series stay per dumbbell: historical logs and PRs already use that scale.
 */
const COMBINED_PLATE_LOAD_IDS = new Set(['268', '269']);
const COMBINED_PLATE_LOAD_NAMES = new Set(['iso-lateral bench press', 'seated iso-lateral chest press']);

export const COMBINED_PLATE_LOAD_CAPTION =
  'Record the combined plate weight across both arms. 45 lb per side is 90 lb total. One arm at a time: record only the working arm.';

export const WORKING_ARM_LOAD_CAPTION = 'Record only the weight loaded on the working arm.';

export function usesCombinedPlateLoad(exercise?: { externalId?: string | null; name?: string | null } | null): boolean {
  const id = String(exercise?.externalId || '').trim();
  if (COMBINED_PLATE_LOAD_IDS.has(id)) return true;
  const name = String(exercise?.name || '').trim().toLowerCase();
  return COMBINED_PLATE_LOAD_NAMES.has(name);
}

/** Caption for the weight the athlete types. Does not change the stored number. */
export function loadEntryCaption(
  equipment?: string | null,
  laterality?: string | null,
  exercise?: { externalId?: string | null; name?: string | null } | null
): string | null {
  const variant = comparableVariantKey(laterality);
  if (usesCombinedPlateLoad(exercise)) {
    if (variant === 'unilateral' || variant === 'alternating') return WORKING_ARM_LOAD_CAPTION;
    return COMBINED_PLATE_LOAD_CAPTION;
  }
  const key = canonicalEquipment(equipment).key;
  if (key === 'dumbbell') {
    if (variant === 'unilateral' || variant === 'alternating') return 'Weight per dumbbell, one arm at a time.';
    return 'Weight is per dumbbell.';
  }
  if (key === 'smith machine') return 'Recorded Smith machine load. No bar weight is added.';
  if (key === 'machine' || key === 'cable') return 'Recorded load. No bar weight or counterbalance is added.';
  return null;
}
