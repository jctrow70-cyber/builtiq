import { formatCaloriesRemaining, macroRingArc, macroRingStatus, type MacroRingStatus } from './macroRing';
import { formatMacro, type MacroTotals } from './macros';

export type DashboardMacroTargets = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type GoalTargetRow = {
  calories_target?: unknown;
  protein_g_target?: unknown;
  carbs_g_target?: unknown;
  fat_g_target?: unknown;
} | null;

/** A saved target counts only when it is a positive number. */
export function positiveNutritionTarget(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number;
}

export function dashboardTargetsFromGoalRow(row: GoalTargetRow | undefined): DashboardMacroTargets {
  if (!row) {
    return { calories: null, protein_g: null, carbs_g: null, fat_g: null };
  }
  return {
    calories: positiveNutritionTarget(row.calories_target),
    protein_g: positiveNutritionTarget(row.protein_g_target),
    carbs_g: positiveNutritionTarget(row.carbs_g_target),
    fat_g: positiveNutritionTarget(row.fat_g_target),
  };
}

export type DashboardMacroBar = {
  key: 'protein_g' | 'carbs_g' | 'fat_g';
  label: string;
  actual: number;
  target: number | null;
  actualText: string;
  detailText: string;
  ratio: number | null;
  status: MacroRingStatus | null;
};

export type DashboardNutritionModel = {
  noMeals: boolean;
  zeroCalorieLog: boolean;
  caloriesText: string;
  calorieActual: number;
  calorieTarget: number | null;
  calorieTargetText: string | null;
  calorieRemainingText: string | null;
  calorieRatio: number | null;
  calorieStatus: MacroRingStatus | null;
  macros: DashboardMacroBar[];
  needsGoals: boolean;
};

/**
 * Presentation for the dashboard card.
 * Totals stay on sumMacros. Ring and remaining text stay on the existing helpers.
 */
export function dashboardNutritionModel(
  totals: MacroTotals,
  entryCount: number,
  targets: DashboardMacroTargets
): DashboardNutritionModel {
  const calorieTarget = targets.calories;
  const rows = [
    ['protein_g', 'Protein', totals.protein_g, targets.protein_g],
    ['carbs_g', 'Carbs', totals.carbs_g, targets.carbs_g],
    ['fat_g', 'Fat', totals.fat_g, targets.fat_g],
  ] as const;
  return {
    noMeals: entryCount === 0,
    zeroCalorieLog: entryCount > 0 && totals.calories === 0,
    caloriesText: formatMacro(totals.calories),
    calorieActual: totals.calories,
    calorieTarget,
    calorieTargetText: calorieTarget == null ? null : formatMacro(calorieTarget),
    calorieRemainingText: calorieTarget == null ? null : formatCaloriesRemaining(totals.calories, calorieTarget),
    calorieRatio: calorieTarget == null ? null : macroRingArc(totals.calories, calorieTarget),
    calorieStatus: calorieTarget == null ? null : macroRingStatus(totals.calories, calorieTarget),
    macros: rows.map(([key, label, actual, target]) => {
      const actualText = `${formatMacro(actual)}g`;
      const over = target != null && macroRingStatus(actual, target) === 'over';
      return {
        key,
        label,
        actual,
        target,
        actualText,
        detailText: target == null ? actualText : `${actualText} / ${formatMacro(target)}g${over ? ' Over' : ''}`,
        ratio: target == null ? null : macroRingArc(actual, target),
        status: target == null ? null : macroRingStatus(actual, target),
      };
    }),
    needsGoals: calorieTarget == null || targets.protein_g == null || targets.carbs_g == null || targets.fat_g == null,
  };
}
