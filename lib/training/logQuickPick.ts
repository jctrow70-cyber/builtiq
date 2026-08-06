/** Quick-tap values for workout logging — reduces mobile keyboard use. */

function parseNum(raw?: string | null): number | null {
  const n = Number(String(raw ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function uniqStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((v) => {
    const s = String(v).trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function formatWeight(n: number, unit: 'lb' | 'kg'): string {
  if (unit === 'kg') {
    const rounded = Math.round(n * 2) / 2;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  }
  return String(Math.round(n));
}

/** Rep chips centered on last session, target, or common defaults. */
export function repQuickPickOptions(prevHint?: string, targetReps?: string): string[] {
  const anchor = parseNum(prevHint) ?? parseNum(targetReps) ?? 8;
  const neighborhood = [-2, -1, 0, 1, 2].map((d) => anchor + d).filter((n) => n > 0 && n <= 50);
  const common = [5, 6, 8, 10, 12, 15];
  return uniqStrings([...neighborhood.map(String), ...common.map(String)]).slice(0, 8);
}

/** Weight chips near last logged / current value. */
export function weightQuickPickOptions(
  prevHint?: string,
  currentValue?: string,
  unit: 'lb' | 'kg' = 'lb'
): string[] {
  const anchor = parseNum(currentValue) ?? parseNum(prevHint);
  if (anchor == null) {
    return unit === 'kg'
      ? ['20', '40', '60', '80', '100']
      : ['45', '95', '135', '185', '225'];
  }
  const step = unit === 'kg' ? (anchor >= 80 ? 5 : 2.5) : anchor >= 135 ? 10 : 5;
  const deltas = unit === 'kg' ? [-2, -1, 0, 1, 2] : [-2, -1, 0, 1, 2];
  const picks = deltas
    .map((d) => anchor + d * step)
    .filter((n) => n > 0)
    .map((n) => formatWeight(n, unit));
  return uniqStrings(picks).slice(0, 7);
}

export function fieldUsesQuickPick(fieldKey: string): 'reps' | 'weight' | null {
  if (fieldKey === 'actual_reps') return 'reps';
  if (fieldKey === 'actual_weight' || fieldKey === '_assist_weight') return 'weight';
  return null;
}
