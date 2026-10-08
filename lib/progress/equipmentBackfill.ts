import type { DataProvenance, EquipmentBackfillDetail } from './provenance';

export type EquipmentInference = {
  equipment: string | null;
  provenance: DataProvenance;
  detail: EquipmentBackfillDetail;
};

/**
 * Conservative equipment recovery.
 * This is the rule the SQL backfill follows. Keep the two in step.
 * An existing snapshot is kept. A name match must be one compatible implement.
 * A single legal implement can be used. Anything else stays unspecified.
 */
export function inferSnapshotEquipment(input: {
  existingEquipment?: string | null;
  exerciseName?: string | null;
  compatibleEquipment?: string[] | null;
}): EquipmentInference {
  const existing = clean(input.existingEquipment);
  if (existing) {
    return { equipment: existing, provenance: 'snapshotted', detail: 'existing' };
  }

  const options = uniqueEquipment(input.compatibleEquipment || []);
  const name = String(input.exerciseName || '').toLowerCase();
  let hits = options.filter((option) => name.includes(option.toLowerCase()));
  if (hits.length > 1) {
    const longest = [...hits].sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
    const ambiguous = hits.filter((hit) => hit.toLowerCase() !== longest.toLowerCase() && !longest.toLowerCase().includes(hit.toLowerCase()));
    hits = ambiguous.length ? hits : [longest];
  }
  if (hits.length === 1) {
    return { equipment: hits[0], provenance: 'backfilled', detail: 'logged_name' };
  }
  if (options.length === 1) {
    return { equipment: options[0], provenance: 'backfilled', detail: 'single_implement' };
  }
  return { equipment: null, provenance: 'unknown', detail: 'unspecified' };
}

export function uniqueEquipment(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((value) => {
    const cleaned = clean(value);
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cleaned);
  });
  return out;
}

function clean(value?: string | null): string {
  return String(value || '').trim();
}
