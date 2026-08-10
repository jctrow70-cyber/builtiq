import { entryToPerServing, FoodLibraryItem, formatMacroLine, MacroTotals, MealEntry, parseMacroInput } from './macros';

export type QuickAddFood = {
  key: string;
  source: 'library' | 'recent';
  name: string;
  serving_label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  food_library_id?: string | null;
  last_log_date?: string;
};

function perServingKey(name: string, macros: MacroTotals): string {
  return [
    String(name || '').trim().toLowerCase(),
    parseMacroInput(macros.calories),
    parseMacroInput(macros.protein_g),
    parseMacroInput(macros.carbs_g),
    parseMacroInput(macros.fat_g),
  ].join('|');
}

function servingLabel(qty: number): string {
  return qty === 1 ? '1 serving' : `${qty} servings`;
}

export function libraryToQuickAdd(food: FoodLibraryItem): QuickAddFood {
  return {
    key: `library:${food.id}`,
    source: 'library',
    name: food.name,
    serving_label: food.serving_label || '1 serving',
    calories: Number(food.calories) || 0,
    protein_g: Number(food.protein_g) || 0,
    carbs_g: Number(food.carbs_g) || 0,
    fat_g: Number(food.fat_g) || 0,
    food_library_id: food.id,
  };
}

export function entryToQuickAdd(entry: MealEntry): QuickAddFood {
  const per = entryToPerServing(entry);
  return {
    key: `recent:${perServingKey(per.food_name, per)}`,
    source: 'recent',
    name: per.food_name,
    serving_label: servingLabel(per.serving_qty),
    calories: per.calories,
    protein_g: per.protein_g,
    carbs_g: per.carbs_g,
    fat_g: per.fat_g,
    food_library_id: entry.food_library_id || null,
    last_log_date: entry.log_date,
  };
}

/** Build deduped recent foods from meal history, newest first. */
export function buildRecentFoods(entries: MealEntry[], limit = 48): QuickAddFood[] {
  const seen = new Set<string>();
  const recent: QuickAddFood[] = [];

  for (const entry of entries || []) {
    const item = entryToQuickAdd(entry);
    if (!item.name.trim()) continue;
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    recent.push(item);
    if (recent.length >= limit) break;
  }

  return recent;
}

export function mergeQuickAddFoods(savedFoods: FoodLibraryItem[], recentFoods: QuickAddFood[]): QuickAddFood[] {
  const libraryItems = (savedFoods || []).map(libraryToQuickAdd);
  const libraryKeys = new Set(
    libraryItems.map((item) =>
      perServingKey(item.name, {
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
      })
    )
  );

  const filteredRecent = (recentFoods || []).filter((item) => {
    const macroKey = perServingKey(item.name, item);
    if (item.food_library_id) return false;
    return !libraryKeys.has(macroKey);
  });

  return [...libraryItems, ...filteredRecent];
}

export function searchQuickAddFoods(
  query: string,
  savedFoods: FoodLibraryItem[],
  recentFoods: QuickAddFood[],
  resultLimit = 24
): QuickAddFood[] {
  const merged = mergeQuickAddFoods(savedFoods, recentFoods);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? merged.filter((item) => item.name.toLowerCase().includes(q))
    : merged;
  return filtered.slice(0, resultLimit);
}

export function quickAddMeta(item: QuickAddFood): string {
  const macros: MacroTotals = {
    calories: item.calories,
    protein_g: item.protein_g,
    carbs_g: item.carbs_g,
    fat_g: item.fat_g,
  };
  const base = formatMacroLine(macros);
  if (item.source === 'recent' && item.last_log_date) {
    return `${base} · Last ${item.last_log_date}`;
  }
  return base;
}
