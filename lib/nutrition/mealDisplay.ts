import { formatMacro, MacroTotals } from './macros';

/** Percent of daily calorie goal consumed by this meal (rounded). */
export function mealCalorieGoalPercent(calories: number, dailyCalorieGoal: number): number | null {
  if (!dailyCalorieGoal || dailyCalorieGoal <= 0) return null;
  return Math.round((calories / dailyCalorieGoal) * 100);
}

/** Collapsed meal header: calories, optional % of daily goal, and P/C/F. */
export function formatMealHeaderSummary(totals: MacroTotals, dailyCalorieGoal: number): string {
  const cal = Math.round(totals.calories);
  const parts = [`${cal} cal`];
  const pct = mealCalorieGoalPercent(totals.calories, dailyCalorieGoal);
  if (pct !== null) parts.push(`${pct}% of daily goal`);
  parts.push(
    `${formatMacro(totals.protein_g)}P · ${formatMacro(totals.carbs_g)}C · ${formatMacro(totals.fat_g)}F`
  );
  return parts.join(' · ');
}

export function formatEmptyMealHeaderSummary(dailyCalorieGoal: number): string {
  if (!dailyCalorieGoal || dailyCalorieGoal <= 0) return '0 cal';
  return '0 cal · 0% of daily goal';
}
