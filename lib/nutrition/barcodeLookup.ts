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
  /** Parsed serving weight in grams when available from Open Food Facts. */
  serving_grams?: number;
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

  return Array.from(new Set(candidates));
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

/** Parse serving weight in grams from OFF product fields. */
export function parseServingQuantityGrams(
  product: Record<string, unknown>,
  nutriments: Record<string, unknown>
): number | null {
  const qty = Number(nutriments.serving_quantity ?? product.serving_quantity);
  if (Number.isFinite(qty) && qty > 0) return qty;

  const servingSize = String(product.serving_size || nutriments.serving_size || '').trim();
  if (!servingSize) return null;

  const parenGrams = servingSize.match(/\(\s*(\d+(?:\.\d+)?)\s*g\s*\)/i);
  if (parenGrams) return Number(parenGrams[1]);

  const directGrams = servingSize.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (directGrams) return Number(directGrams[1]);

  return null;
}

function looksLikePer100gCopiedToServing(per100: number, perServing: number, servingGrams: number): boolean {
  if (servingGrams <= 0 || servingGrams >= 100) return false;
  if (!Number.isFinite(per100) || !Number.isFinite(perServing)) return false;
  return Math.abs(perServing - per100) < 0.51;
}

function scalePer100gToServing(per100: number, servingGrams: number): number {
  return per100 * (servingGrams / 100);
}

type NutrientPick = { value: number | null; scaledFrom100g: boolean };

/** Prefer per-serving OFF values; scale per-100g when serving weight is known. */
export function pickNutrientForServing(
  nutriments: Record<string, unknown>,
  base: string,
  servingGrams: number | null
): NutrientPick {
  const per100Raw = nutriments[`${base}_100g`];
  const per100 = Number.isFinite(Number(per100Raw)) ? Number(per100Raw) : null;

  const perServingRaw = nutriments[`${base}_serving`];
  const perServing = Number.isFinite(Number(perServingRaw)) ? Number(perServingRaw) : null;

  if (perServing != null) {
    if (
      per100 != null &&
      servingGrams != null &&
      looksLikePer100gCopiedToServing(per100, perServing, servingGrams)
    ) {
      return { value: scalePer100gToServing(per100, servingGrams), scaledFrom100g: true };
    }
    return { value: perServing, scaledFrom100g: false };
  }

  if (per100 != null) {
    if (servingGrams != null && servingGrams > 0 && servingGrams !== 100) {
      return { value: scalePer100gToServing(per100, servingGrams), scaledFrom100g: true };
    }
    return { value: per100, scaledFrom100g: true };
  }

  return { value: null, scaledFrom100g: false };
}

function pickCalories(nutriments: Record<string, unknown>, servingGrams: number | null): NutrientPick {
  const kcal = pickNutrientForServing(nutriments, 'energy-kcal', servingGrams);
  if (kcal.value != null) return kcal;

  const kj = pickNutrientForServing(nutriments, 'energy-kj', servingGrams);
  if (kj.value != null) return { value: kj.value / 4.184, scaledFrom100g: kj.scaledFrom100g };

  const energy = pickNutrientForServing(nutriments, 'energy', servingGrams);
  if (energy.value != null) return { value: energy.value / 4.184, scaledFrom100g: energy.scaledFrom100g };

  return { value: null, scaledFrom100g: false };
}

function pickSodiumMg(nutriments: Record<string, unknown>, servingGrams: number | null): number | null {
  const sodium = pickNutrientForServing(nutriments, 'sodium', servingGrams);
  if (sodium.value != null) return sodium.value * 1000;
  const salt = pickNutrientForServing(nutriments, 'salt', servingGrams);
  if (salt.value != null) return salt.value * 1000 * 0.4;
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
  const servingGrams = parseServingQuantityGrams(product, nutriments);

  const caloriePick = pickCalories(nutriments, servingGrams);
  const proteinPick = pickNutrientForServing(nutriments, 'proteins', servingGrams);
  const carbsPick = pickNutrientForServing(nutriments, 'carbohydrates', servingGrams);
  const fatPick = pickNutrientForServing(nutriments, 'fat', servingGrams);
  const fiberPick = pickNutrientForServing(nutriments, 'fiber', servingGrams);
  const sugarPick = pickNutrientForServing(nutriments, 'sugars', servingGrams);
  const sodiumRaw = pickSodiumMg(nutriments, servingGrams);

  const scaledFrom100g =
    caloriePick.scaledFrom100g ||
    proteinPick.scaledFrom100g ||
    carbsPick.scaledFrom100g ||
    fatPick.scaledFrom100g;

  const calories = caloriePick.value;
  const protein_g = proteinPick.value;
  const carbs_g = carbsPick.value;
  const fat_g = fatPick.value;
  const fiber_g = fiberPick.value;
  const sugar_g = sugarPick.value;

  const serving_label = servingLabel(product, nutriments);
  const missingServingWeight =
    scaledFrom100g && (servingGrams == null || servingGrams <= 0 || servingGrams === 100);

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

  let notes = 'Values from Open Food Facts. Verify against your package label when precision matters.';
  if (missingServingWeight) {
    notes = 'Values from Open Food Facts (per 100 g). Adjust serving size if your label differs.';
  } else if (scaledFrom100g) {
    notes = `Values scaled to ${serving_label} from Open Food Facts per-100 g data. Verify against your label.`;
  }

  return {
    found: true,
    barcode,
    product_name,
    brand,
    serving_label: serving_label.slice(0, 80),
    serving_grams: servingGrams ?? undefined,
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
    notes,
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
      if (isBarcodeLookupResult(parsed)) return parsed;
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
  const factor = Math.max(0.01, Number(qty) || 1);
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

export function barcodeServingDraftFields(result: BarcodeLookupResult): {
  serving_size: string;
  serving_unit: string;
} {
  const grams = result.serving_grams;
  if (grams != null && grams > 0) {
    return { serving_size: String(grams), serving_unit: 'g' };
  }
  return { serving_size: '1', serving_unit: 'serving' };
}

export function barcodeResultToDraft(
  result: BarcodeLookupResult,
  mealType: import('./macros').MealType,
  amount = 1
) {
  const per = result.per_serving;
  const serving = barcodeServingDraftFields(result);
  return {
    meal_type: mealType,
    food_name: barcodeDisplayName(result),
    ...serving,
    amount: String(amount),
    calories: String(per.calories),
    protein_g: String(per.protein_g),
    carbs_g: String(per.carbs_g),
    fat_g: String(per.fat_g),
    saveToLibrary: false,
  };
}
