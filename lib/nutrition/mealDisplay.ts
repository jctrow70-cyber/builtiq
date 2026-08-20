import { formatMacro, MacroTotals, MealType } from './macros';

/**
 * Default daily calorie split: three main meals plus a small snacks allowance.
 * Must sum to 1.
 */
export const MEAL_CALORIE_SHARE: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.35,
  snack: 0.05,
};

/** Calorie target for one meal from the daily goal. */
export function mealCalorieTarget(dailyCalorieGoal: number, mealType: MealType): number | null {
  if (!dailyCalorieGoal || dailyCalorieGoal <= 0) return null;
  return Math.round(dailyCalorieGoal * MEAL_CALORIE_SHARE[mealType]);
}

/** Meal header: logged cal / meal target cal, plus P/C/F. */
export function formatMealHeaderSummary(
  totals: MacroTotals,
  dailyCalorieGoal: number,
  mealType: MealType
): string {
  const logged = Math.round(totals.calories);
  const target = mealCalorieTarget(dailyCalorieGoal, mealType);
  const calPart = target !== null ? `${logged} / ${target} cal` : `${logged} cal`;
  const parts = [calPart];
  parts.push(
    `${formatMacro(totals.protein_g)}P · ${formatMacro(totals.carbs_g)}C · ${formatMacro(totals.fat_g)}F`
  );
  return parts.join(' · ');
}

export function formatEmptyMealHeaderSummary(dailyCalorieGoal: number, mealType: MealType): string {
  const target = mealCalorieTarget(dailyCalorieGoal, mealType);
  if (target === null) return '0 cal';
  return `0 / ${target} cal`;
}
