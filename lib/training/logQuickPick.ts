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

/** Rep picks centered on last session or target. */
export function repQuickPickOptions(prevHint?: string, targetReps?: string): string[] {
  const anchor = parseNum(prevHint) ?? parseNum(targetReps) ?? 8;
  const neighborhood = [-2, -1, 0, 1, 2].map((d) => anchor + d).filter((n) => n > 0 && n <= 50);
  return uniqStrings(neighborhood.map(String)).slice(0, 5);
}

/** Weight picks near last logged / current value. */
export function weightQuickPickOptions(
  prevHint?: string,
  currentValue?: string,
  unit: 'lb' | 'kg' = 'lb'
): string[] {
  const anchor = parseNum(prevHint) ?? parseNum(currentValue);
  if (anchor == null) {
    return unit === 'kg'
      ? ['20', '40', '60', '80', '100'].slice(0, 5)
      : ['45', '95', '135', '185', '225'].slice(0, 5);
  }
  const step = unit === 'kg' ? (anchor >= 80 ? 5 : 2.5) : anchor >= 135 ? 10 : 5;
  const picks = [-2, -1, 0, 1, 2]
    .map((d) => anchor + d * step)
    .filter((n) => n > 0)
    .map((n) => formatWeight(n, unit));
  return uniqStrings(picks).slice(0, 5);
}

export function fieldUsesQuickPick(fieldKey: string): 'reps' | 'weight' | null {
  if (fieldKey === 'actual_reps') return 'reps';
  if (fieldKey === 'actual_weight' || fieldKey === '_assist_weight') return 'weight';
  return null;
}
