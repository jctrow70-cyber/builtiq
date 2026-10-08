import { inSpan, inclusiveDays, type DateSpan } from './ranges';

export type NutritionDay = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type NutritionTargets = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type NutritionAverages = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type NutritionReport = {
  loggedDays: number;
  daysInRange: number;
  /** Logged days divided by days in the range. Null when the range has no days. */
  consistency: number | null;
  /** Averages over logged days only. A day with no entries is omitted, not counted as zero. */
  averages: NutritionAverages | null;
  targets: NutritionTargets | null;
  /** Share of logged days that met each target. Null when that target is missing. */
  targetAdherence: NutritionAverages | null;
  loggedDates: string[];
};

export function nutritionDaysFromEntries(
  entries: Array<{ log_date?: string; calories?: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null }>
): NutritionDay[] {
  const byDate = new Map<string, NutritionDay>();
  entries.forEach((entry) => {
    const date = String(entry.log_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const day = byDate.get(date) || { date, calories: 0, protein: 0, carbs: 0, fat: 0 };
    day.calories += Number(entry.calories) || 0;
    day.protein += Number(entry.protein_g) || 0;
    day.carbs += Number(entry.carbs_g) || 0;
    day.fat += Number(entry.fat_g) || 0;
    byDate.set(date, day);
  });
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function nutritionReport(days: NutritionDay[], span: DateSpan, targets?: NutritionTargets | null): NutritionReport {
  const logged = days.filter((day) => inSpan(day.date, span));
  const daysInRange = Math.max(0, inclusiveDays(span.from, span.to));
  if (!logged.length) {
    return {
      loggedDays: 0,
      daysInRange,
      consistency: daysInRange ? 0 : null,
      averages: null,
      targets: targets || null,
      targetAdherence: null,
      loggedDates: [],
    };
  }
  const averages = {
    calories: round(mean(logged.map((day) => day.calories))),
    protein: round(mean(logged.map((day) => day.protein))),
    carbs: round(mean(logged.map((day) => day.carbs))),
    fat: round(mean(logged.map((day) => day.fat))),
  };
  return {
    loggedDays: logged.length,
    daysInRange,
    consistency: daysInRange ? round((logged.length / daysInRange) * 100) : null,
    averages,
    targets: targets || null,
    targetAdherence: adherence(logged, targets),
    loggedDates: logged.map((day) => day.date),
  };
}

function adherence(days: NutritionDay[], targets?: NutritionTargets | null): NutritionAverages | null {
  if (!targets) return null;
  return {
    calories: share(days, targets.calories, (day) => day.calories),
    protein: share(days, targets.protein, (day) => day.protein),
    carbs: share(days, targets.carbs, (day) => day.carbs),
    fat: share(days, targets.fat, (day) => day.fat),
  };
}

function share(days: NutritionDay[], target: number | null | undefined, read: (day: NutritionDay) => number): number | null {
  if (target == null || !(target > 0)) return null;
  const met = days.filter((day) => read(day) + 1e-9 >= target).length;
  return round((met / days.length) * 100);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
