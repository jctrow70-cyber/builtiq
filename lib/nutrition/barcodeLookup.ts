/** BIQ-0041: Packaged food lookup by UPC/EAN via Open Food Facts */

import { parseMacroInput } from './macros';

export type BarcodeLookupResult = {
  found: true;
  barcode: string;
  food_name: string;
  serving_label: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  brand?: string;
  source: 'open_food_facts';
  notes?: string;
};

export type BarcodeLookupNotFound = {
  found: false;
  barcode: string;
  message: string;
};

export type BarcodeLookupResponse = BarcodeLookupResult | BarcodeLookupNotFound;

const OFF_USER_AGENT = 'BuildIQ-Health/1.0 (nutrition@buildiq.health)';
const MAX_CALORIES = 5000;
const MAX_MACRO_G = 400;

export function normalizeBarcode(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

function clampMacro(value: unknown): number {
  const n = parseMacroInput(Number(value));
  return Math.min(MAX_MACRO_G, Math.max(0, Math.round(n * 10) / 10));
}

function clampCalories(value: unknown): number {
  const n = Math.round(Number(value) || 0);
  return Math.min(MAX_CALORIES, Math.max(0, n));
}

function pickNutrient(nutriments: Record<string, unknown>, base: string): number | null {
  const serving = nutriments[`${base}_serving`];
  if (Number.isFinite(Number(serving))) return Number(serving);
  const per100 = nutriments[`${base}_100g`];
  if (Number.isFinite(Number(per100))) return Number(per100);
  return null;
}

function servingLabel(product: Record<string, unknown>, nutriments: Record<string, unknown>): string {
  const servingSize = String(product.serving_size || nutriments.serving_size || '').trim();
  if (servingSize) return servingSize;
  const qty = Number(nutriments.serving_quantity);
  if (Number.isFinite(qty) && qty > 0) return `${qty} g serving`;
  if (nutriments.proteins_serving != null || nutriments['energy-kcal_serving'] != null) return '1 serving';
  return 'per 100 g';
}

function productName(product: Record<string, unknown>): string {
  const name = String(product.product_name || product.generic_name || '').trim();
  const brands = String(product.brands || '').trim();
  if (name && brands) return `${name} (${brands})`;
  return name || brands || 'Packaged food';
}

export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResponse> {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) {
    return { found: false, barcode: String(barcode || ''), message: 'Enter a valid 8–14 digit barcode.' };
  }

  const fields = [
    'product_name',
    'generic_name',
    'brands',
    'serving_size',
    'serving_quantity',
    'nutriments',
  ].join(',');

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(normalized)}.json?fields=${fields}`;

  let payload: any;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': OFF_USER_AGENT },
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      return {
        found: false,
        barcode: normalized,
        message: 'Barcode lookup service unavailable. Try scanning the nutrition label instead.',
      };
    }
    payload = await res.json();
  } catch {
    return {
      found: false,
      barcode: normalized,
      message: 'Could not reach barcode database. Check connection or use label scan.',
    };
  }

  if (payload?.status !== 1 || !payload?.product) {
    return {
      found: false,
      barcode: normalized,
      message: 'Product not found in Open Food Facts. Try label OCR or enter macros manually.',
    };
  }

  const product = payload.product as Record<string, unknown>;
  const nutriments = (product.nutriments || {}) as Record<string, unknown>;

  let calories = pickNutrient(nutriments, 'energy-kcal');
  if (calories == null) {
    const kj = pickNutrient(nutriments, 'energy');
    if (kj != null) calories = Math.round(kj / 4.184);
  }

  const protein_g = pickNutrient(nutriments, 'proteins');
  const carbs_g = pickNutrient(nutriments, 'carbohydrates');
  const fat_g = pickNutrient(nutriments, 'fat');

  const serving_label = servingLabel(product, nutriments);
  const used100g =
    nutriments['energy-kcal_serving'] == null &&
    nutriments.proteins_serving == null &&
    (nutriments['energy-kcal_100g'] != null || nutriments.proteins_100g != null);

  if (calories == null && protein_g == null && carbs_g == null && fat_g == null) {
    return {
      found: false,
      barcode: normalized,
      message: 'Product found but nutrition data is incomplete. Try label OCR or manual entry.',
    };
  }

  return {
    found: true,
    barcode: normalized,
    food_name: productName(product).slice(0, 120),
    serving_label: serving_label.slice(0, 80),
    calories: clampCalories(calories ?? 0),
    protein_g: clampMacro(protein_g ?? 0),
    carbs_g: clampMacro(carbs_g ?? 0),
    fat_g: clampMacro(fat_g ?? 0),
    brand: String(product.brands || '').trim().slice(0, 80) || undefined,
    source: 'open_food_facts',
    notes: used100g
      ? 'Values from Open Food Facts (per 100 g). Adjust serving if your label differs.'
      : 'Values from Open Food Facts. Verify against your package label when precision matters.',
  };
}

export function barcodeResultToDraft(result: BarcodeLookupResult, mealType: import('./macros').MealType) {
  return {
    meal_type: mealType,
    food_name: result.food_name,
    serving_qty: '1',
    calories: String(result.calories),
    protein_g: String(result.protein_g),
    carbs_g: String(result.carbs_g),
    fat_g: String(result.fat_g),
    saveToLibrary: false,
  };
}
