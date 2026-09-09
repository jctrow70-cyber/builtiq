export type RecentLiftSummary = {
  name: string;
  sessions: number;
  last_date: string;
  best_weight?: string;
};

export function summarizeRecentLogs(
  rows: Array<{
    snapshot_exercise_name?: string | null;
    actual_weight?: string | null;
    log_date?: string | null;
    completed?: boolean | null;
  }> | null
    | undefined,
  limit = 20
): RecentLiftSummary[] {
  const byName = new Map<string, RecentLiftSummary>();
  (rows || []).forEach((row) => {
    if (row.completed === false) return;
    const name = String(row.snapshot_exercise_name || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    const existing = byName.get(key);
    const date = String(row.log_date || '').slice(0, 10);
    const weight = String(row.actual_weight || '').trim();
    if (!existing) {
      byName.set(key, { name, sessions: 1, last_date: date, best_weight: weight || undefined });
      return;
    }
    existing.sessions += 1;
    if (date && date > existing.last_date) existing.last_date = date;
    const n = Number(weight);
    const prev = Number(existing.best_weight || 0);
    if (Number.isFinite(n) && n > prev) existing.best_weight = weight;
  });
  return Array.from(byName.values())
    .sort((a, b) => b.sessions - a.sessions || b.last_date.localeCompare(a.last_date))
    .slice(0, limit);
}
