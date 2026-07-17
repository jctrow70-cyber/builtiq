'use client';

import {
  BarcodeLookupNotFound,
  BarcodeLookupResult,
  BarcodeProductNutrition,
  barcodeDisplayName,
  barcodeExtraNutritionNote,
  scaleBarcodeNutrition,
} from '../../lib/nutrition/barcodeLookup';
import { formatMacro, parseMacroInput } from '../../lib/nutrition/macros';
import { MEAL_TYPE_LABELS, MealType } from '../../lib/nutrition/macros';

type NutritionBarcodeProductProps = {
  product: BarcodeLookupResult;
  mealType: MealType;
  servingQty: string;
  onServingQtyChange: (value: string) => void;
  saving: boolean;
  onLog: (saveToLibrary: boolean) => void;
  onReviewManual: () => void;
};

function NutrientRow({ label, value, unit = 'g' }: { label: string; value?: number; unit?: 'g' | 'mg' | 'cal' }) {
  if (value == null || value <= 0) return null;
  const suffix = unit === 'cal' ? ' cal' : unit;
  return (
    <div className="nutrition-barcode-nutrient">
      <span className="muted">{label}</span>
      <b>
        {formatMacro(value, unit === 'g' ? 1 : 0)}
        {suffix}
      </b>
    </div>
  );
}

export function NutritionBarcodeProductCard({
  product,
  mealType,
  servingQty,
  onServingQtyChange,
  saving,
  onLog,
  onReviewManual,
}: NutritionBarcodeProductProps) {
  const qty = Math.max(0.25, parseMacroInput(servingQty) || 1);
  const scaled: BarcodeProductNutrition = scaleBarcodeNutrition(product.per_serving, qty);
  const extraNote = barcodeExtraNutritionNote(scaled);

  return (
    <div className="nutrition-barcode-product card">
      <div className="nutrition-barcode-product-head">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt=""
            className="nutrition-barcode-product-image"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="nutrition-barcode-product-image nutrition-barcode-product-image-fallback">📦</div>
        )}
        <div>
          <b>{barcodeDisplayName(product)}</b>
          {product.brand && <p className="muted">{product.brand}</p>}
          <p className="muted">{product.serving_label}</p>
          <p className="muted">Barcode {product.barcode}</p>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <div>
          <label htmlFor="barcode-serving-qty">Servings</label>
          <input
            id="barcode-serving-qty"
            type="number"
            min="0.25"
            step="0.25"
            value={servingQty}
            onChange={(e) => onServingQtyChange(e.target.value)}
          />
        </div>
      </div>

      <div className="nutrition-barcode-nutrient-grid">
        <NutrientRow label="Calories" value={scaled.calories} unit="cal" />
        <NutrientRow label="Protein" value={scaled.protein_g} />
        <NutrientRow label="Carbs" value={scaled.carbs_g} />
        <NutrientRow label="Fat" value={scaled.fat_g} />
        <NutrientRow label="Fiber" value={scaled.fiber_g} />
        <NutrientRow label="Sugar" value={scaled.sugar_g} />
        <NutrientRow label="Sodium" value={scaled.sodium_mg} unit="mg" />
      </div>

      {product.notes && <p className="muted nutrition-scan-notes">{product.notes}</p>}
      {extraNote && <p className="muted nutrition-scan-notes">{extraNote}</p>}

      <div className="actions" style={{ marginTop: 10 }}>
        <button type="button" className="btn green" onClick={() => onLog(false)} disabled={saving}>
          {saving ? 'Saving...' : `Add to ${MEAL_TYPE_LABELS[mealType]}`}
        </button>
        <button type="button" className="btn secondary" onClick={() => onLog(true)} disabled={saving}>
          Save food & log
        </button>
        <button type="button" className="btn secondary" onClick={onReviewManual} disabled={saving}>
          Review & edit
        </button>
      </div>
    </div>
  );
}

type NutritionBarcodeNotFoundProps = {
  result: BarcodeLookupNotFound;
  onEnterManualUpc: () => void;
  onLabelPhoto: () => void;
  onManualEntry: () => void;
  onSaveCustom: () => void;
  onScanAgain: () => void;
};

export function NutritionBarcodeNotFoundCard({
  result,
  onEnterManualUpc,
  onLabelPhoto,
  onManualEntry,
  onSaveCustom,
  onScanAgain,
}: NutritionBarcodeNotFoundProps) {
  return (
    <div className="nutrition-barcode-not-found card">
      <h4>Product not found</h4>
      <p className="nutrition-error">{result.message}</p>
      <p className="muted">Barcode tried: {result.barcode || 'unknown'}</p>
      <div className="actions" style={{ marginTop: 10 }}>
        <button type="button" className="btn green" onClick={onScanAgain}>
          Scan again
        </button>
        <button type="button" className="btn secondary" onClick={onEnterManualUpc}>
          Enter UPC manually
        </button>
        <button type="button" className="btn secondary" onClick={onLabelPhoto}>
          Photograph nutrition label
        </button>
        <button type="button" className="btn secondary" onClick={onManualEntry}>
          Enter nutrition manually
        </button>
        <button type="button" className="btn secondary" onClick={onSaveCustom}>
          Save as custom food
        </button>
      </div>
    </div>
  );
}
