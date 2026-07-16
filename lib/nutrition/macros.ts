export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type MealType = (typeof MEAL_TYPES)[number];

export type MacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type NutritionGoals = MacroTotals;

export type MealEntry = {
  id: string;
  user_id: string;
  log_date: string;
  meal_type: MealType;
  food_name: string;
  food_library_id?: string | null;
  serving_qty: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type FoodLibraryItem = {
  id: string;
  user_id: string;
  name: string;
  serving_label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  is_archived?: boolean;
};

export const DEFAULT_NUTRITION_GOALS: NutritionGoals = {
  calories: 2000,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 65,
};

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

export function parseMacroInput(value: string | number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10) / 10;
}

export function emptyMacroTotals(): MacroTotals {
  return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
}

export function scaleMacros(base: MacroTotals, qty: number): MacroTotals {
  const factor = Math.max(0, Number(qty) || 0);
  return {
    calories: Math.round(base.calories * factor),
    protein_g: parseMacroInput(base.protein_g * factor),
    carbs_g: parseMacroInput(base.carbs_g * factor),
    fat_g: parseMacroInput(base.fat_g * factor),
  };
}

export function sumMacros(items: Array<Partial<MacroTotals>>): MacroTotals {
  return items.reduce<MacroTotals>(
    (acc, item) => ({
      calories: acc.calories + (Number(item.calories) || 0),
      protein_g: parseMacroInput(acc.protein_g + (Number(item.protein_g) || 0)),
      carbs_g: parseMacroInput(acc.carbs_g + (Number(item.carbs_g) || 0)),
      fat_g: parseMacroInput(acc.fat_g + (Number(item.fat_g) || 0)),
    }),
    emptyMacroTotals()
  );
}

export function groupEntriesByMeal(entries: MealEntry[]): Record<MealType, MealEntry[]> {
  const grouped = Object.fromEntries(MEAL_TYPES.map((m) => [m, [] as MealEntry[]])) as Record<
    MealType,
    MealEntry[]
  >;
  (entries || []).forEach((entry) => {
    const meal = MEAL_TYPES.includes(entry.meal_type) ? entry.meal_type : 'snack';
    grouped[meal].push(entry);
  });
  MEAL_TYPES.forEach((meal) => {
    grouped[meal].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  });
  return grouped;
}

export function macroProgress(actual: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.round((actual / target) * 100));
}

export function formatMacro(value: number, decimals = 0): string {
  const n = Number(value) || 0;
  if (decimals <= 0) return String(Math.round(n));
  return n.toFixed(decimals);
}

export function formatMacroLine(totals: MacroTotals): string {
  return `${formatMacro(totals.calories)} cal · ${formatMacro(totals.protein_g)}P · ${formatMacro(totals.carbs_g)}C · ${formatMacro(totals.fat_g)}F`;
}

export function goalsFromRow(row: any | null | undefined): NutritionGoals {
  if (!row) return { ...DEFAULT_NUTRITION_GOALS };
  return {
    calories: Number(row.calories_target) || DEFAULT_NUTRITION_GOALS.calories,
    protein_g: Number(row.protein_g_target) || DEFAULT_NUTRITION_GOALS.protein_g,
    carbs_g: Number(row.carbs_g_target) || DEFAULT_NUTRITION_GOALS.carbs_g,
    fat_g: Number(row.fat_g_target) || DEFAULT_NUTRITION_GOALS.fat_g,
  };
}
