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

export type MealTemplateItem = {
  food_name: string;
  serving_qty: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  food_library_id?: string | null;
};

export type MealTemplate = {
  id: string;
  user_id: string;
  name: string;
  meal_type: MealType;
  items: MealTemplateItem[];
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

export function entryToPerServing(entry: Partial<MealEntry>): MacroTotals & { food_name: string; serving_qty: number } {
  const qty = Math.max(0.25, Number(entry.serving_qty) || 1);
  return {
    food_name: String(entry.food_name || ''),
    serving_qty: qty,
    calories: parseMacroInput((Number(entry.calories) || 0) / qty),
    protein_g: parseMacroInput((Number(entry.protein_g) || 0) / qty),
    carbs_g: parseMacroInput((Number(entry.carbs_g) || 0) / qty),
    fat_g: parseMacroInput((Number(entry.fat_g) || 0) / qty),
  };
}

export function mealEntryFromDraft(
  draft: {
    food_name: string;
    serving_qty: string | number;
    calories: string | number;
    protein_g: string | number;
    carbs_g: string | number;
    fat_g: string | number;
  },
  mealType: MealType
): Omit<MealTemplateItem, 'food_library_id'> & { meal_type: MealType } {
  const servingQty = Math.max(0.25, parseMacroInput(draft.serving_qty) || 1);
  const macros = scaleMacros(
    {
      calories: parseMacroInput(draft.calories),
      protein_g: parseMacroInput(draft.protein_g),
      carbs_g: parseMacroInput(draft.carbs_g),
      fat_g: parseMacroInput(draft.fat_g),
    },
    servingQty
  );
  return {
    meal_type: mealType,
    food_name: draft.food_name.trim(),
    serving_qty: servingQty,
    ...macros,
  };
}

export function templateItemsFromEntries(entries: MealEntry[]): MealTemplateItem[] {
  return (entries || []).map((entry) => ({
    food_name: entry.food_name,
    serving_qty: Number(entry.serving_qty) || 1,
    calories: Number(entry.calories) || 0,
    protein_g: Number(entry.protein_g) || 0,
    carbs_g: Number(entry.carbs_g) || 0,
    fat_g: Number(entry.fat_g) || 0,
    food_library_id: entry.food_library_id || null,
  }));
}

export function parseMealTemplate(row: any): MealTemplate | null {
  if (!row?.id) return null;
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    meal_type: MEAL_TYPES.includes(row.meal_type) ? row.meal_type : 'breakfast',
    items: items.map((item: any) => ({
      food_name: String(item.food_name || ''),
      serving_qty: Number(item.serving_qty) || 1,
      calories: Number(item.calories) || 0,
      protein_g: Number(item.protein_g) || 0,
      carbs_g: Number(item.carbs_g) || 0,
      fat_g: Number(item.fat_g) || 0,
      food_library_id: item.food_library_id || null,
    })),
    is_archived: !!row.is_archived,
  };
}
