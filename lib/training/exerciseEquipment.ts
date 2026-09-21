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
  if (!current) return options[0] || '';
  const match = options.find((item) => item.toLowerCase() === current.toLowerCase());
  return match || current;
}

export function defaultCatalogEquipment(catalogItem?: any, current?: any): string {
  const options = compatibleEquipmentOptions(catalogItem, current?.equipment);
  const currentEq = String(current?.equipment || '').trim();
  if (currentEq && options.some((item) => item.toLowerCase() === currentEq.toLowerCase())) return currentEq;
  return options[0] || String(catalogItem?.equipment || '').trim();
}
