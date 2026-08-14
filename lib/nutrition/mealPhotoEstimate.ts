/** BIQ-0119: Meal / plate photo macro estimation via vision model */

import { parseAndValidateFoodEstimate, AI_FOOD_DISCLAIMER, type AiFoodEstimateResult } from './aiFoodEstimate';

export const MEAL_PHOTO_DISCLAIMER =
  'Meal photos are AI approximations — lighting, hidden ingredients, and portion size may affect accuracy. Verify when precision matters.';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function validateMealPhotoImage(mimeType: string, byteLength: number): string | null {
  if (!ALLOWED_MIME.has(mimeType)) {
    return 'Use a JPEG, PNG, or WebP photo of your meal.';
  }
  if (byteLength <= 0) return 'Image is empty.';
  if (byteLength > MAX_IMAGE_BYTES) {
    return 'Image is too large (max 5 MB). Try a closer photo of the plate.';
  }
  return null;
}

export function buildMealPhotoPrompt(mealType?: string): { system: string; user: string } {
  const mealHint = mealType ? `Meal context: ${mealType}.` : '';
  const system = `You are BuildIQ Health's meal photo nutrition estimator for general fitness and wellness tracking.

The user photographed food on a plate, bowl, or similar serving. Estimate macros for what is visibly present.

Rules:
- Identify distinct foods you can see (e.g. chicken, rice, salad, tortilla chips).
- Return separate items when multiple foods are clearly visible; use one combined item only for a single mixed dish (stew, casserole).
- Estimate practical US-style portions from visual cues (plate size, pile height, utensil scale).
- Provide calories, protein_g, carbs_g, fat_g per item for the estimated portion.
- serving_label should describe the portion assumed (e.g. "1 palm-sized chicken breast (~4 oz)" or "1 cup cooked rice").
- If the photo is unclear, return your best estimate and explain uncertainty in notes.
- If no food is visible, return items: [] and explain in notes.
- This is NOT medical advice. Never recommend unsafe dieting.

Respond with JSON only:
{
  "items": [
    {
      "food_name": "short label",
      "serving_label": "estimated portion",
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number
    }
  ],
  "notes": "1-2 sentences on what you saw and assumptions"
}`;

  const user = `${mealHint}
Estimate nutrition for the food visible in this meal photo.`;

  return { system, user };
}

export function parseMealPhotoResponse(raw: string): { result: AiFoodEstimateResult | null; error: string | null } {
  const { result, error } = parseAndValidateFoodEstimate(raw);
  if (error || !result) return { result: null, error: error || 'Could not estimate meal from photo.' };
  return {
    result: {
      ...result,
      disclaimer: `${AI_FOOD_DISCLAIMER} ${MEAL_PHOTO_DISCLAIMER}`,
    },
    error: null,
  };
}
