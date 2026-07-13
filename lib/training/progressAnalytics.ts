import { isStrengthLike, type ExerciseType } from './exerciseTypes';
import { formatDisplayDate, mondayOfWeek } from './programCalendar';

export type PersonalRecord = {
  key: string;
  name: string;
  muscleGroup: string;
  maxWeight: number | null;
  maxWeightDate: string;
  bestReps: number | null;
  bestVolume: number | null;
  bestVolumeDate: string;
  est1rm: number | null;
  est1rmDate: string;
  recentPr: boolean;
  summary: string;
};

export type WeeklyTrendPoint = {
  weekStart: string;
  weekLabel: string;
  volume: number;
  sets: number;
  days: number;
};

export type ProgressInsightsSummary = {
  totalSets: number;
  workoutDays: number;
  strengthSets: number;
  totalVolume: number;
  prCount: number;
  recentPrCount: number;
};

export function exerciseKeyFromLog(row: any): string {
  const catalogId = String(row?.snapshot_catalog_exercise_id || '').trim();
  const name = String(row?.snapshot_exercise_name || '').toLowerCase().trim();
  return catalogId || name;
}

export function parseNumeric(value: unknown): number | null {
  const m = String(value || '')
    .replace(/,/g, '')
    .match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function parseReps(value: unknown): number | null {
  const s = String(value || '').trim();
  if (!s) return null;
  const range = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) return Math.max(Number(range[1]), Number(range[2]));
  const m = s.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function est1rm(weight: number, reps: number): number {
  if (reps <= 0) return weight;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

function isRecentDate(ymd: string, withinDays = 14): boolean {
  if (!ymd) return false;
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const then = new Date(y, (m || 1) - 1, d || 1).getTime();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = (now.getTime() - then) / 86400000;
  return diff >= 0 && diff <= withinDays;
}

function strengthType(row: any): ExerciseType {
  const t = String(row?.snapshot_exercise_type || 'strength').toLowerCase();
  return (t as ExerciseType) || 'strength';
}

function isStrengthLog(row: any): boolean {
  return isStrengthLike(strengthType(row));
}

export function computePersonalRecords(logs: any[]): PersonalRecord[] {
  const byKey = new Map<string, PersonalRecord>();

  for (const row of logs || []) {
    if (!row?.completed || !isStrengthLog(row)) continue;
    const weight = parseNumeric(row.actual_weight);
    const reps = parseReps(row.actual_reps);
    if (weight == null && reps == null) continue;

    const key = exerciseKeyFromLog(row);
    if (!key) continue;
    const name = String(row.snapshot_exercise_name || 'Exercise').trim();
    const muscleGroup = String(row.snapshot_muscle_group || '').trim();
    const date = String(row.log_date || '').slice(0, 10);
    const volume = weight != null && reps != null ? weight * reps : null;
    const oneRm = weight != null && reps != null ? est1rm(weight, reps) : null;

    let pr = byKey.get(key);
    if (!pr) {
      pr = {
        key,
        name,
        muscleGroup,
        maxWeight: null,
        maxWeightDate: '',
        bestReps: null,
        bestVolume: null,
        bestVolumeDate: '',
        est1rm: null,
        est1rmDate: '',
        recentPr: false,
        summary: '—',
      };
      byKey.set(key, pr);
    }

    if (weight != null && (pr.maxWeight == null || weight > pr.maxWeight)) {
      pr.maxWeight = weight;
      pr.maxWeightDate = date;
    }
    if (reps != null && (pr.bestReps == null || reps > pr.bestReps)) {
      pr.bestReps = reps;
    }
    if (volume != null && (pr.bestVolume == null || volume > pr.bestVolume)) {
      pr.bestVolume = volume;
      pr.bestVolumeDate = date;
    }
    if (oneRm != null && (pr.est1rm == null || oneRm > pr.est1rm)) {
      pr.est1rm = oneRm;
      pr.est1rmDate = date;
    }
  }

  const list = Array.from(byKey.values())
    .filter((pr) => pr.maxWeight != null || pr.est1rm != null)
    .map((pr) => {
      const parts: string[] = [];
      if (pr.maxWeight != null) parts.push(`${pr.maxWeight} lb`);
      if (pr.bestReps != null && pr.maxWeight != null) parts.push(`${pr.bestReps} reps`);
      if (pr.est1rm != null) parts.push(`est. 1RM ${pr.est1rm} lb`);
      pr.summary = parts.join(' · ') || '—';
      pr.recentPr =
        isRecentDate(pr.maxWeightDate) || isRecentDate(pr.est1rmDate) || isRecentDate(pr.bestVolumeDate);
      return pr;
    });

  return list.sort((a, b) => (b.est1rm || b.maxWeight || 0) - (a.est1rm || a.maxWeight || 0));
}

export function computeWeeklyTrends(logs: any[], weekCount = 8): WeeklyTrendPoint[] {
  const strengthLogs = (logs || []).filter((r) => r?.completed && isStrengthLog(r));
  const anchor = mondayOfWeek(new Date().toISOString().slice(0, 10));
  const anchorDate = parseYmdLocal(anchor);

  const buckets = new Map<string, WeeklyTrendPoint>();
  for (let i = weekCount - 1; i >= 0; i--) {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() - i * 7);
    const weekStart = formatYmdLocal(d);
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    buckets.set(weekStart, {
      weekStart,
      weekLabel: `${formatDisplayDate(weekStart)} – ${formatDisplayDate(formatYmdLocal(end))}`,
      volume: 0,
      sets: 0,
      days: 0,
    });
  }

  const daysByWeek = new Map<string, Set<string>>();
  for (const row of strengthLogs) {
    const date = String(row.log_date || '').slice(0, 10);
    if (!date) continue;
    const weekStart = mondayOfWeek(date);
    const bucket = buckets.get(weekStart);
    if (!bucket) continue;

    bucket.sets += 1;
    if (!daysByWeek.has(weekStart)) daysByWeek.set(weekStart, new Set());
    daysByWeek.get(weekStart)!.add(date);

    const weight = parseNumeric(row.actual_weight);
    const reps = parseReps(row.actual_reps);
    if (weight != null && reps != null) bucket.volume += weight * reps;
  }

  buckets.forEach((b, weekStart) => {
    b.days = daysByWeek.get(weekStart)?.size || 0;
  });

  return Array.from(buckets.values());
}

export function computeProgressSummary(logs: any[], prs: PersonalRecord[]): ProgressInsightsSummary {
  const completed = (logs || []).filter((r) => r?.completed);
  const strength = completed.filter(isStrengthLog);
  let totalVolume = 0;
  strength.forEach((row) => {
    const w = parseNumeric(row.actual_weight);
    const r = parseReps(row.actual_reps);
    if (w != null && r != null) totalVolume += w * r;
  });
  return {
    totalSets: completed.length,
    workoutDays: new Set(completed.map((r) => r.log_date)).size,
    strengthSets: strength.length,
    totalVolume: Math.round(totalVolume),
    prCount: prs.length,
    recentPrCount: prs.filter((p) => p.recentPr).length,
  };
}

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatYmdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function maxTrendVolume(weeks: WeeklyTrendPoint[]): number {
  return Math.max(1, ...weeks.map((w) => w.volume));
}
