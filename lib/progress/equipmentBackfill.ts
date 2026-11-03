import type { DataProvenance, EquipmentBackfillDetail } from './provenance';

export type EquipmentInference = {
  equipment: string | null;
  provenance: DataProvenance;
  detail: EquipmentBackfillDetail;
};

/**
 * Conservative equipment recovery.
 * This is the rule the SQL backfill follows. Keep the two in step.
 * An existing snapshot is kept, including its original text.
 * A name match must be one compatible implement.
 * A single legal implement is not assigned. Anything else stays unspecified.
 * This does not rewrite rows that an earlier backfill already filled.
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
