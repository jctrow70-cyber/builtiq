/** BIQ-0037: AI natural-language food macro estimation */

import { parseMacroInput, type MealType } from './macros';

export type AiFoodEstimateItem = {
  food_name: string;
  serving_label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type AiFoodEstimateResult = {
  items: AiFoodEstimateItem[];
  notes?: string;
  disclaimer: string;
};

export const AI_FOOD_DISCLAIMER =
  'AI macro estimates are general wellness approximations for fitness tracking — not medical or dietary advice. Verify values when precision matters.';

const MAX_ITEMS = 6;
const MAX_CALORIES = 5000;
const MAX_MACRO_G = 400;

function clampMacro(value: unknown, max = MAX_MACRO_G): number {
  const n = parseMacroInput(Number(value));
  return Math.min(max, Math.max(0, n));
}

function clampCalories(value: unknown): number {
  const n = Math.round(Number(value) || 0);
  return Math.min(MAX_CALORIES, Math.max(0, n));
}

function cleanText(value: unknown, maxLen: number): string {
  return String(value || '')
    .trim()
    .slice(0, maxLen);
}

export function buildFoodEstimatePrompt(description: string, mealType?: string): { system: string; user: string } {
  const mealHint = mealType ? `Meal context: ${mealType}.` : '';
  const system = `You are BuildIQ Health's nutrition estimation assistant for general fitness and wellness tracking.

Rules:
- Provide practical macro estimates (calories, protein_g, carbs_g, fat_g) for foods the user describes.
- This is NOT medical advice, NOT for diagnosing conditions, and NOT a substitute for professional nutrition guidance.
- If the description is vague, use typical US serving assumptions and say so in notes.
- If the user describes multiple distinct foods, return separate items in the items array.
- If they describe one combined meal, you may return one item with combined totals.
- Use whole numbers for calories; macros may have one decimal at most.
- Never recommend extreme restriction, fasting for medical conditions, or unsafe dieting.

Respond with JSON only:
{
  "items": [
    {
      "food_name": "short label",
      "serving_label": "what serving you assumed",
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number
    }
  ],
  "notes": "1-2 sentence explanation of assumptions"
}`;

  const user = `${mealHint}
User description:
${description.trim()}`;

  return { system, user };
}

export function parseAndValidateFoodEstimate(raw: string): { result: AiFoodEstimateResult | null; error: string | null } {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { result: null, error: 'AI response was not valid JSON.' };
  }

  const rawItems = Array.isArray(parsed?.items) ? parsed.items : parsed?.item ? [parsed.item] : [];
  if (!rawItems.length) {
    return { result: null, error: 'AI did not return any food items.' };
  }

  const items: AiFoodEstimateItem[] = [];
  for (const row of rawItems.slice(0, MAX_ITEMS)) {
    const food_name = cleanText(row?.food_name, 120);
    if (food_name.length < 2) continue;
    const calories = clampCalories(row?.calories);
    const protein_g = clampMacro(row?.protein_g);
    const carbs_g = clampMacro(row?.carbs_g);
    const fat_g = clampMacro(row?.fat_g);
    if (calories === 0 && protein_g === 0 && carbs_g === 0 && fat_g === 0) continue;
    items.push({
      food_name,
      serving_label: cleanText(row?.serving_label, 80) || '1 serving',
      calories,
      protein_g,
      carbs_g,
      fat_g,
    });
  }

  if (!items.length) {
    return { result: null, error: 'AI items failed validation. Try a clearer description with amounts.' };
  }

  return {
    result: {
      items,
      notes: cleanText(parsed?.notes, 500) || undefined,
      disclaimer: AI_FOOD_DISCLAIMER,
    },
    error: null,
  };
}

export function aiEstimateToDraft(item: AiFoodEstimateItem, mealType: MealType) {
  return {
    meal_type: mealType,
    food_name: item.food_name,
    serving_qty: '1',
    calories: String(item.calories),
    protein_g: String(item.protein_g),
    carbs_g: String(item.carbs_g),
    fat_g: String(item.fat_g),
    saveToLibrary: false,
  };
}
