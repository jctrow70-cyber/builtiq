import { FoodLibraryItem, MealTemplate } from './macros';
import { QuickAddFood, searchQuickAddFoods } from './recentFoods';

export type FindFoodResult =
  | { kind: 'food'; item: QuickAddFood }
  | { kind: 'template'; item: MealTemplate };

function templateMatchesQuery(template: MealTemplate, query: string): boolean {
  if (template.name.toLowerCase().includes(query)) return true;
  return template.items.some((item) => item.food_name.toLowerCase().includes(query));
}

export function searchMealTemplates(
  query: string,
  templates: MealTemplate[],
  resultLimit = 12
): MealTemplate[] {
  const q = query.trim().toLowerCase();
  const filtered = q ? templates.filter((template) => templateMatchesQuery(template, q)) : templates;
  return filtered.slice(0, resultLimit);
}

/** Unified saved foods + meal template search for Find food. */
export function searchFindFood(
  query: string,
  savedFoods: FoodLibraryItem[],
  recentFoods: QuickAddFood[],
  templates: MealTemplate[],
  resultLimit = 24
): FindFoodResult[] {
  const foodLimit = Math.ceil(resultLimit * 0.6);
  const templateLimit = resultLimit - foodLimit;

  const foods = searchQuickAddFoods(query, savedFoods, recentFoods, foodLimit);
  const matchedTemplates = searchMealTemplates(query, templates, templateLimit);

  const results: FindFoodResult[] = [
    ...foods.map((item) => ({ kind: 'food' as const, item })),
    ...matchedTemplates.map((item) => ({ kind: 'template' as const, item })),
  ];

  results.sort((a, b) => {
    const nameA = a.kind === 'food' ? a.item.name : a.item.name;
    const nameB = b.kind === 'food' ? b.item.name : b.item.name;
    return nameA.localeCompare(nameB);
  });

  return results.slice(0, resultLimit);
}
