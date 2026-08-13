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

/** EAN-13 check digit for a 12-digit body (no check digit). */
function ean13CheckDigit(body12: string): number {
  const d = body12.replace(/\D/g, '').split('').map(Number);
  if (d.length !== 12) return 0;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const posFromRight = 12 - i;
    sum += d[i] * (posFromRight % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Build lookup candidates for Open Food Facts.
 * UPC-A is often stored as 12 digits or as EAN-13 with a leading 0 — try both without stripping valid zeros.
 */
export function barcodeLookupCandidates(raw: string): string[] {
  const digits = digitsOnly(raw);
  if (digits.length < 8 || digits.length > 14) return [];

  const candidates: string[] = [digits];

  // 10-digit codes from packaging (e.g. 4767100030) map to EAN-13 0647671000306 in OFF.
  if (digits.length === 10) {
    const body12 = `06${digits}`;
    candidates.unshift(`${body12}${ean13CheckDigit(body12)}`);
  }

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

function parseGramsFromServingSizeText(servingSize: string): number | null {
  if (!servingSize) return null;

  const parenGrams = servingSize.match(/\(\s*(\d+(?:\.\d+)?)\s*g\s*\)/i);
  if (parenGrams) return Number(parenGrams[1]);

  const directGrams = servingSize.match(/^(\d+(?:\.\d+)?)\s*g\b/i);
  if (directGrams) return Number(directGrams[1]);

  const anyGrams = servingSize.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (anyGrams) return Number(anyGrams[1]);

  return null;
}

function parseItemCountFromServingSize(servingSize: string): number | null {
  const match = servingSize.trim().match(/^(\d+(?:\.\d+)?)\s+/);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? count : null;
}

/** For "2 tortillas (55 g)" return grams per single tortilla (~27.5 g). */
function parsePerItemGramsFromServingSize(servingSize: string): number | null {
  const totalGrams = parseGramsFromServingSizeText(servingSize);
  const count = parseItemCountFromServingSize(servingSize);
  if (totalGrams == null || count == null || count <= 1) return null;
  return Math.round((totalGrams / count) * 10) / 10;
}

function isSingleUnitServing(servingSize: string): boolean {
  const trimmed = servingSize.trim();
  return /^1\s+(?!0\b)/.test(trimmed);
}

function isTortillaProduct(productName: string, servingSize: string): boolean {
  const text = `${productName} ${servingSize}`.toLowerCase();
  return text.includes('tortilla') && !text.includes('chip');
}

/** FDA standard snack chip serving (1 oz). */
const STANDARD_CHIP_SERVING_GRAMS = 28;

function isChipProduct(productName: string, servingSize: string): boolean {
  const text = `${productName} ${servingSize}`.toLowerCase();
  return /\bchips?\b|\bcrisps?\b/.test(text);
}

function isMultiUnitChipServing(servingSize: string): boolean {
  const count = parseItemCountFromServingSize(servingSize);
  if (count != null && count > 1) return /\bchips?\b|\bcrisps?\b/i.test(servingSize);
  return false;
}

/** Infer gram weight that OFF per-serving nutrients actually represent. */
export function inferServingGramsFromNutriments(nutriments: Record<string, unknown>): number | null {
  const per100Cal = Number(nutriments['energy-kcal_100g']);
  const perServingCal = Number(nutriments['energy-kcal_serving']);
  if (Number.isFinite(per100Cal) && per100Cal > 0 && Number.isFinite(perServingCal) && perServingCal > 0) {
    if (perServingLooksLikePer100g(per100Cal, perServingCal)) return null;
    return Math.round((perServingCal / per100Cal) * 100 * 10) / 10;
  }

  const per100Protein = Number(nutriments.proteins_100g);
  const perServingProtein = Number(nutriments.proteins_serving);
  if (
    Number.isFinite(per100Protein) &&
    per100Protein > 0 &&
    Number.isFinite(perServingProtein) &&
    perServingProtein > 0
  ) {
    if (perServingLooksLikePer100g(per100Protein, perServingProtein)) return null;
    return Math.round((perServingProtein / per100Protein) * 100 * 10) / 10;
  }

  return null;
}

function perServingLooksLikePer100g(per100: number, perServing: number): boolean {
  if (!Number.isFinite(per100) || !Number.isFinite(perServing) || per100 <= 0) return false;
  return Math.abs(perServing - per100) < Math.max(0.51, per100 * 0.02);
}

type ResolvedServingGrams = {
  /** Gram weight shown to the user / stored on the entry. */
  displayGrams: number | null;
  /** Gram weight OFF per-serving nutrient fields are based on. */
  nutrientBasisGrams: number | null;
};

export function resolveBarcodeServingGrams(
  product: Record<string, unknown>,
  nutriments: Record<string, unknown>
): ResolvedServingGrams {
  const productName = String(product.product_name || product.generic_name || '');
  const servingSize = String(product.serving_size || nutriments.serving_size || '').trim();
  const textGrams = parseGramsFromServingSizeText(servingSize);
  const perItemGrams = parsePerItemGramsFromServingSize(servingSize);
  const qtyGramsRaw = Number(nutriments.serving_quantity ?? product.serving_quantity);
  const qtyGrams = Number.isFinite(qtyGramsRaw) && qtyGramsRaw > 0 ? qtyGramsRaw : null;
  const inferredGrams = inferServingGramsFromNutriments(nutriments);

  const nutrientBasisGrams = inferredGrams ?? qtyGrams ?? textGrams;

  let displayGrams: number | null = null;

  if (textGrams != null && isSingleUnitServing(servingSize)) {
    displayGrams = textGrams;
  } else if (
    isChipProduct(productName, servingSize) &&
    isMultiUnitChipServing(servingSize) &&
    textGrams != null &&
    textGrams > STANDARD_CHIP_SERVING_GRAMS + 2
  ) {
    // OFF often lists bulk chip servings (e.g. "20 chips (50 g)") while labels use 28 g (~11 chips).
    displayGrams = STANDARD_CHIP_SERVING_GRAMS;
  } else if (
    isTortillaProduct(productName, servingSize) &&
    perItemGrams != null &&
    perItemGrams >= 20 &&
    perItemGrams <= 90
  ) {
    displayGrams = perItemGrams;
  } else if (textGrams != null && qtyGrams != null && Math.abs(textGrams - qtyGrams) > 0.5) {
    displayGrams = textGrams;
  } else if (
    inferredGrams != null &&
    qtyGrams != null &&
    Math.abs(inferredGrams - qtyGrams) > 0.5
  ) {
    if (textGrams != null && Math.abs(textGrams - inferredGrams) <= 2) {
      displayGrams = textGrams;
    } else {
      displayGrams = inferredGrams;
    }
  } else {
    displayGrams = textGrams ?? inferredGrams ?? qtyGrams;
  }

  if (displayGrams != null) {
    displayGrams = roundDisplayGrams(displayGrams);
  }

  return { displayGrams, nutrientBasisGrams };
}

function roundDisplayGrams(grams: number): number {
  const rounded = Math.round(grams);
  if (Math.abs(grams - rounded) <= 1.5) return rounded;
  return Math.round(grams * 10) / 10;
}

/** @deprecated Use resolveBarcodeServingGrams().displayGrams */
export function parseServingQuantityGrams(
  product: Record<string, unknown>,
  nutriments: Record<string, unknown>
): number | null {
  return resolveBarcodeServingGrams(product, nutriments).displayGrams;
}

function scalePer100gToServing(per100: number, servingGrams: number): number {
  return per100 * (servingGrams / 100);
}

type NutrientPick = { value: number | null; scaledFrom100g: boolean };

type NutrientPickOptions = {
  /** When the packaging text describes one serving (e.g. "1 tortilla (28 g)"). */
  singleUnitLabel?: boolean;
};

/** Prefer per-serving OFF values; scale per-100g when serving weight is known. */
export function pickNutrientForServing(
  nutriments: Record<string, unknown>,
  base: string,
  nutrientBasisGrams: number | null,
  displayGrams: number | null = null,
  options?: NutrientPickOptions
): NutrientPick {
  const per100Raw = nutriments[`${base}_100g`];
  const per100 = Number.isFinite(Number(per100Raw)) ? Number(per100Raw) : null;

  const perServingRaw = nutriments[`${base}_serving`];
  const perServing = Number.isFinite(Number(perServingRaw)) ? Number(perServingRaw) : null;

  const targetGrams = displayGrams ?? nutrientBasisGrams;
  const trustedPerServing =
    perServing != null && per100 != null && !perServingLooksLikePer100g(per100, perServing);

  if (trustedPerServing && options?.singleUnitLabel) {
    return { value: perServing, scaledFrom100g: false };
  }

  if (trustedPerServing) {
    if (nutrientBasisGrams != null && nutrientBasisGrams > 0 && targetGrams != null) {
      return { value: perServing * (targetGrams / nutrientBasisGrams), scaledFrom100g: false };
    }
    return { value: perServing, scaledFrom100g: false };
  }

  if (perServing != null && per100 != null && perServingLooksLikePer100g(per100, perServing)) {
    if (targetGrams != null && targetGrams > 0) {
      return { value: scalePer100gToServing(per100, targetGrams), scaledFrom100g: true };
    }
  }

  if (per100 != null) {
    if (targetGrams != null && targetGrams > 0 && targetGrams !== 100) {
      return { value: scalePer100gToServing(per100, targetGrams), scaledFrom100g: true };
    }
    return { value: per100, scaledFrom100g: true };
  }

  return { value: null, scaledFrom100g: false };
}

function pickCalories(
  nutriments: Record<string, unknown>,
  nutrientBasisGrams: number | null,
  displayGrams: number | null,
  options?: NutrientPickOptions
): NutrientPick {
  const kcal = pickNutrientForServing(nutriments, 'energy-kcal', nutrientBasisGrams, displayGrams, options);
  if (kcal.value != null) return kcal;

  const kj = pickNutrientForServing(nutriments, 'energy-kj', nutrientBasisGrams, displayGrams, options);
  if (kj.value != null) return { value: kj.value / 4.184, scaledFrom100g: kj.scaledFrom100g };

  const energy = pickNutrientForServing(nutriments, 'energy', nutrientBasisGrams, displayGrams, options);
  if (energy.value != null) return { value: energy.value / 4.184, scaledFrom100g: energy.scaledFrom100g };

  return { value: null, scaledFrom100g: false };
}

function pickSodiumMg(
  nutriments: Record<string, unknown>,
  nutrientBasisGrams: number | null,
  displayGrams: number | null,
  options?: NutrientPickOptions
): number | null {
  const sodium = pickNutrientForServing(nutriments, 'sodium', nutrientBasisGrams, displayGrams, options);
  if (sodium.value != null) return sodium.value * 1000;
  const salt = pickNutrientForServing(nutriments, 'salt', nutrientBasisGrams, displayGrams, options);
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
  const servingSize = String(product.serving_size || nutriments.serving_size || '').trim();
  const { displayGrams, nutrientBasisGrams } = resolveBarcodeServingGrams(product, nutriments);
  const pickOptions: NutrientPickOptions = { singleUnitLabel: isSingleUnitServing(servingSize) };

  const caloriePick = pickCalories(nutriments, nutrientBasisGrams, displayGrams, pickOptions);
  const proteinPick = pickNutrientForServing(
    nutriments,
    'proteins',
    nutrientBasisGrams,
    displayGrams,
    pickOptions
  );
  const carbsPick = pickNutrientForServing(
    nutriments,
    'carbohydrates',
    nutrientBasisGrams,
    displayGrams,
    pickOptions
  );
  const fatPick = pickNutrientForServing(nutriments, 'fat', nutrientBasisGrams, displayGrams, pickOptions);
  const fiberPick = pickNutrientForServing(nutriments, 'fiber', nutrientBasisGrams, displayGrams, pickOptions);
  const sugarPick = pickNutrientForServing(nutriments, 'sugars', nutrientBasisGrams, displayGrams, pickOptions);
  const sodiumRaw = pickSodiumMg(nutriments, nutrientBasisGrams, displayGrams, pickOptions);

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
  const sodium_mg = sodiumRaw != null ? clampSodiumMg(sodiumRaw) : undefined;

  const serving_label = servingLabel(product, nutriments);
  const missingServingWeight =
    scaledFrom100g && (displayGrams == null || displayGrams <= 0 || displayGrams === 100);

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

  const chipServingNormalized =
    isChipProduct(product_name, servingSize) &&
    displayGrams === STANDARD_CHIP_SERVING_GRAMS &&
    nutrientBasisGrams != null &&
    nutrientBasisGrams > STANDARD_CHIP_SERVING_GRAMS + 2;

  let notes = 'Values from Open Food Facts. Verify against your package label when precision matters.';
  if (missingServingWeight) {
    notes = 'Values from Open Food Facts (per 100 g). Adjust serving size if your label differs.';
  } else if (chipServingNormalized) {
    notes = `Adjusted to ${STANDARD_CHIP_SERVING_GRAMS} g (~1 oz / about 11 chips) to match typical package labels. Verify against your label.`;
  } else if (scaledFrom100g) {
    notes = `Values scaled to ${displayGrams ?? serving_label} g from Open Food Facts per-100 g data. Verify against your label.`;
  } else if (
    displayGrams != null &&
    nutrientBasisGrams != null &&
    Math.abs(displayGrams - nutrientBasisGrams) > 0.5
  ) {
    notes = `Nutrition adjusted to ${displayGrams} g per serving (package label style). Verify against your label.`;
  }

  return {
    found: true,
    barcode,
    product_name,
    brand,
    serving_label: serving_label.slice(0, 80),
    serving_grams: displayGrams ?? undefined,
    image_url: productImageUrl(product),
    per_serving: {
      calories: clampCalories(calories ?? 0),
      protein_g: clampMacro(protein_g ?? 0),
      carbs_g: clampMacro(carbs_g ?? 0),
      fat_g: clampMacro(fat_g ?? 0),
      fiber_g: fiber_g != null ? clampMacro(fiber_g) : undefined,
      sugar_g: sugar_g != null ? clampMacro(sugar_g) : undefined,
      sodium_mg,
    },
    source: 'open_food_facts',
    notes,
  };
}

/** Test helper — parse raw OFF product JSON without network fetch. */
export function parseOffProductForTest(barcode: string, product: Record<string, unknown>): BarcodeLookupResponse {
  return parseProduct(barcode, product);
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
    cache: 'no-store',
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
