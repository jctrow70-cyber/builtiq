/** BIQ-0041: Nutrition Facts panel OCR via vision model */

import { parseAndValidateFoodEstimate, AI_FOOD_DISCLAIMER, type AiFoodEstimateResult } from './aiFoodEstimate';

export const LABEL_OCR_DISCLAIMER =
  'Label scan reads visible Nutrition Facts text — lighting, blur, or partial labels may reduce accuracy. Verify values when precision matters.';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function validateLabelImage(mimeType: string, byteLength: number): string | null {
  if (!ALLOWED_MIME.has(mimeType)) {
    return 'Use a JPEG, PNG, or WebP photo of the nutrition label.';
  }
  if (byteLength <= 0) return 'Image is empty.';
  if (byteLength > MAX_IMAGE_BYTES) return 'Image is too large (max 5 MB). Try a closer crop of the label.';
  return null;
}

export function buildLabelOcrPrompt(): { system: string; user: string } {
  const system = `You are BuildIQ Health's nutrition label reader for general fitness and wellness tracking.

The user photographed a packaged food Nutrition Facts panel. Extract the primary serving's values visible on the label.

Rules:
- Read calories, protein (g), total carbohydrates (g), and total fat (g) for the standard serving shown.
- Use the product name from the label when visible; otherwise use a short generic name like "Packaged food".
- serving_label should match the label's serving size line (e.g. "1 cup (240ml)" or "2 cookies (30g)").
- If only per-100g values are visible, use those and say so in notes.
- If the label is unreadable, return items: [] and explain in notes.
- This is NOT medical advice. Never recommend unsafe dieting.

Respond with JSON only:
{
  "items": [
    {
      "food_name": "short label",
      "serving_label": "from the label",
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number
    }
  ],
  "notes": "what you read or why values are uncertain"
}`;

  return {
    system,
    user: 'Extract Nutrition Facts macros from this label photo for one serving.',
  };
}

export function parseLabelOcrResponse(raw: string): { result: AiFoodEstimateResult | null; error: string | null } {
  const { result, error } = parseAndValidateFoodEstimate(raw);
  if (error || !result) return { result: null, error: error || 'Could not read label.' };
  return {
    result: {
      ...result,
      disclaimer: `${AI_FOOD_DISCLAIMER} ${LABEL_OCR_DISCLAIMER}`,
    },
    error: null,
  };
}
