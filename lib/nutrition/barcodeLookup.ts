/** BIQ-0041/0042: Packaged food lookup by UPC/EAN via Open Food Facts */

import { MacroTotals, parseMacroInput } from './macros';

export type BarcodeProductNutrition = MacroTotals & {
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
};

export type BarcodeLookupResult = {
  found: true;
  barcode: string;
  product_name: string;
  brand?: string;
  serving_label: string;
  image_url?: string;
  per_serving: BarcodeProductNutrition;
  source: 'open_food_facts';
  notes?: string;
};

export type BarcodeLookupNotFound = {
  found: false;
  barcode: string;
  message: string;
  error_code?: 'invalid_barcode' | 'product_not_found' | 'incomplete_data' | 'service_unavailable';
};

export type BarcodeLookupResponse = BarcodeLookupResult | BarcodeLookupNotFound;

export function isBarcodeLookupResult(data: BarcodeLookupResponse): data is BarcodeLookupResult {
  return data.found === true;
}

const OFF_USER_AGENT = 'BuildIQ-Health/1.0 (nutrition@buildiq.health)';
const MAX_CALORIES = 5000;
const MAX_MACRO_G = 400;
const MAX_SODIUM_MG = 10000;

/** Strip non-digits only — never remove meaningful leading zeros from the scanned value. */
export function digitsOnly(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * Build lookup candidates for Open Food Facts.
 * UPC-A is often stored as 12 digits or as EAN-13 with a leading 0 — try both without stripping valid zeros.
 */
export function barcodeLookupCandidates(raw: string): string[] {
  const digits = digitsOnly(raw);
  if (digits.length < 8 || digits.length > 14) return [];

  const candidates: string[] = [digits];

  if (digits.length === 13 && digits.startsWith('0')) {
    candidates.push(digits.slice(1));
  }
  if (digits.length === 12) {
    candidates.push(`0${digits}`);
  }

  return [...new Set(candidates)];
}

export function normalizeBarcode(raw: string): string | null {
  const candidates = barcodeLookupCandidates(raw);
  return candidates[0] || null;
}

function clampMacro(value: unknown): number {
  const n = parseMacroInput(Number(value));
  return Math.min(MAX_MACRO_G, Math.max(0, Math.round(n * 10) / 10));
}

function clampCalories(value: unknown): number {
  const n = Math.round(Number(value) || 0);
  return Math.min(MAX_CALORIES, Math.max(0, n));
}

function clampSodiumMg(value: unknown): number | undefined {
  const n = Math.round(Number(value) || 0);
  if (n <= 0) return undefined;
  return Math.min(MAX_SODIUM_MG, n);
}

function pickNutrient(nutriments: Record<string, unknown>, base: string): number | null {
  const serving = nutriments[`${base}_serving`];
  if (Number.isFinite(Number(serving))) return Number(serving);
  const per100 = nutriments[`${base}_100g`];
  if (Number.isFinite(Number(per100))) return Number(per100);
  return null;
}

function pickSodiumMg(nutriments: Record<string, unknown>): number | null {
  const sodium = pickNutrient(nutriments, 'sodium');
  if (sodium != null) return sodium * 1000;
  const salt = pickNutrient(nutriments, 'salt');
  if (salt != null) return salt * 1000 * 0.4;
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

function productImageUrl(product: Record<string, unknown>): string | undefined {
  const direct = String(product.image_front_url || product.image_url || '').trim();
  if (direct) return direct;
  const selected = product.selected_images as Record<string, any> | undefined;
  const front = selected?.front;
  if (front?.display?.en) return String(front.display.en);
  if (front?.display) return String(Object.values(front.display)[0] || '');
  return undefined;
}

function parseProduct(barcode: string, product: Record<string, unknown>): BarcodeLookupResult | BarcodeLookupNotFound {
  const nutriments = (product.nutriments || {}) as Record<string, unknown>;

  let calories = pickNutrient(nutriments, 'energy-kcal');
  if (calories == null) {
    const kj = pickNutrient(nutriments, 'energy');
    if (kj != null) calories = Math.round(kj / 4.184);
  }

  const protein_g = pickNutrient(nutriments, 'proteins');
  const carbs_g = pickNutrient(nutriments, 'carbohydrates');
  const fat_g = pickNutrient(nutriments, 'fat');
  const fiber_g = pickNutrient(nutriments, 'fiber');
  const sugar_g = pickNutrient(nutriments, 'sugars');
  const sodiumRaw = pickSodiumMg(nutriments);

  const serving_label = servingLabel(product, nutriments);
  const used100g =
    nutriments['energy-kcal_serving'] == null &&
    nutriments.proteins_serving == null &&
    (nutriments['energy-kcal_100g'] != null || nutriments.proteins_100g != null);

  if (calories == null && protein_g == null && carbs_g == null && fat_g == null) {
    return {
      found: false,
      barcode,
      error_code: 'incomplete_data',
      message: 'Product found but nutrition data is incomplete. Try a nutrition label photo or enter values manually.',
    };
  }

  const product_name = String(product.product_name || product.generic_name || 'Packaged food').trim().slice(0, 120);
  const brand = String(product.brands || '').trim().slice(0, 80) || undefined;

  return {
    found: true,
    barcode,
    product_name,
    brand,
    serving_label: serving_label.slice(0, 80),
    image_url: productImageUrl(product),
    per_serving: {
      calories: clampCalories(calories ?? 0),
      protein_g: clampMacro(protein_g ?? 0),
      carbs_g: clampMacro(carbs_g ?? 0),
      fat_g: clampMacro(fat_g ?? 0),
      fiber_g: fiber_g != null ? clampMacro(fiber_g) : undefined,
      sugar_g: sugar_g != null ? clampMacro(sugar_g) : undefined,
      sodium_mg: sodiumRaw != null ? clampSodiumMg(sodiumRaw) : undefined,
    },
    source: 'open_food_facts',
    notes: used100g
      ? 'Values from Open Food Facts (per 100 g). Adjust servings if your label differs.'
      : 'Values from Open Food Facts. Verify against your package label when precision matters.',
  };
}

async function fetchOffProduct(barcode: string): Promise<any | null> {
  const fields = [
    'product_name',
    'generic_name',
    'brands',
    'serving_size',
    'serving_quantity',
    'nutriments',
    'image_front_url',
    'image_url',
    'selected_images',
  ].join(',');

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': OFF_USER_AGENT },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const payload = await res.json();
  if (payload?.status !== 1 || !payload?.product) return null;
  return payload.product;
}

export async function lookupBarcode(raw: string): Promise<BarcodeLookupResponse> {
  const candidates = barcodeLookupCandidates(raw);
  if (!candidates.length) {
    return {
      found: false,
      barcode: digitsOnly(raw),
      error_code: 'invalid_barcode',
      message: 'Enter a valid 8–14 digit UPC or EAN barcode.',
    };
  }

  let lastNotFound: BarcodeLookupNotFound | null = null;

  try {
    for (const candidate of candidates) {
      const product = await fetchOffProduct(candidate);
      if (!product) {
        lastNotFound = {
          found: false,
          barcode: candidate,
          error_code: 'product_not_found',
          message: 'Product not found in Open Food Facts for this barcode.',
        };
        continue;
      }
      const parsed = parseProduct(candidate, product);
      if (parsed.found) return parsed;
      lastNotFound = parsed;
    }
  } catch {
    return {
      found: false,
      barcode: candidates[0],
      error_code: 'service_unavailable',
      message: 'Could not reach Open Food Facts. Check your connection and try again.',
    };
  }

  return (
    lastNotFound || {
      found: false,
      barcode: candidates[0],
      error_code: 'product_not_found',
      message: 'Product not found in Open Food Facts for this barcode.',
    }
  );
}

export function scaleBarcodeNutrition(base: BarcodeProductNutrition, qty: number): BarcodeProductNutrition {
  const factor = Math.max(0.25, Number(qty) || 1);
  return {
    calories: Math.round(base.calories * factor),
    protein_g: parseMacroInput(base.protein_g * factor),
    carbs_g: parseMacroInput(base.carbs_g * factor),
    fat_g: parseMacroInput(base.fat_g * factor),
    fiber_g: base.fiber_g != null ? parseMacroInput(base.fiber_g * factor) : undefined,
    sugar_g: base.sugar_g != null ? parseMacroInput(base.sugar_g * factor) : undefined,
    sodium_mg: base.sodium_mg != null ? Math.round(base.sodium_mg * factor) : undefined,
  };
}

export function barcodeExtraNutritionNote(n: BarcodeProductNutrition): string | undefined {
  const parts: string[] = [];
  if (n.fiber_g != null && n.fiber_g > 0) parts.push(`Fiber ${n.fiber_g}g`);
  if (n.sugar_g != null && n.sugar_g > 0) parts.push(`Sugar ${n.sugar_g}g`);
  if (n.sodium_mg != null && n.sodium_mg > 0) parts.push(`Sodium ${n.sodium_mg}mg`);
  return parts.length ? parts.join(' · ') : undefined;
}

export function barcodeDisplayName(result: BarcodeLookupResult): string {
  if (result.brand && !result.product_name.toLowerCase().includes(result.brand.toLowerCase())) {
    return `${result.product_name} (${result.brand})`;
  }
  return result.product_name;
}

export function barcodeResultToDraft(
  result: BarcodeLookupResult,
  mealType: import('./macros').MealType,
  servingQty = 1
) {
  const scaled = scaleBarcodeNutrition(result.per_serving, servingQty);
  return {
    meal_type: mealType,
    food_name: barcodeDisplayName(result),
    serving_qty: String(servingQty),
    calories: String(scaled.calories),
    protein_g: String(scaled.protein_g),
    carbs_g: String(scaled.carbs_g),
    fat_g: String(scaled.fat_g),
    saveToLibrary: false,
  };
}
