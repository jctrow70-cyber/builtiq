import { addDaysYmd, currentCalendarWeekBounds, formatDisplayDate, parseYmd } from '../training/programCalendar';
import {
  MacroTotals,
  NutritionGoals,
  sumMacros,
  macroProgress,
} from './macros';

export type DayNutritionSummary = {
  date: string;
  label: string;
  totals: MacroTotals;
  entryCount: number;
  caloriePct: number;
  proteinPct: number;
};

export type WeeklyNutritionSummary = {
  monday: string;
  sunday: string;
  days: DayNutritionSummary[];
  weekTotals: MacroTotals;
  goals: NutritionGoals;
  loggedDays: number;
  avgCalories: number;
  avgProteinPct: number;
};

type EntryRow = {
  log_date: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

export function buildWeeklyNutritionSummary(
  entries: EntryRow[],
  goals: NutritionGoals,
  refDateYmd?: string
): WeeklyNutritionSummary {
  const ref = refDateYmd || undefined;
  const { monday, sunday } = currentCalendarWeekBounds(ref ? parseYmd(ref) : new Date());

  const byDate = new Map<string, EntryRow[]>();
  (entries || []).forEach((row) => {
    const d = String(row.log_date || '').slice(0, 10);
    if (!d || d < monday || d > sunday) return;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(row);
  });

  const days: DayNutritionSummary[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDaysYmd(monday, i);
    const dayEntries = byDate.get(date) || [];
    const totals = sumMacros(dayEntries);
    days.push({
      date,
      label: formatDisplayDate(date).replace(/\/\d{2}$/, ''),
      totals,
      entryCount: dayEntries.length,
      caloriePct: macroProgress(totals.calories, goals.calories),
      proteinPct: macroProgress(totals.protein_g, goals.protein_g),
    });
  }

  const weekTotals = sumMacros(days.map((d) => d.totals));
  const loggedDays = days.filter((d) => d.entryCount > 0).length;
  const avgCalories = loggedDays ? Math.round(weekTotals.calories / loggedDays) : 0;
  const avgProteinPct = loggedDays
    ? Math.round(days.filter((d) => d.entryCount > 0).reduce((n, d) => n + d.proteinPct, 0) / loggedDays)
    : 0;

  return {
    monday,
    sunday,
    days,
    weekTotals,
    goals,
    loggedDays,
    avgCalories,
    avgProteinPct,
  };
}
