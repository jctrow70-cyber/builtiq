'use client';

import { RefObject } from 'react';
import {
  AiFoodEstimateItem,
  AiFoodEstimateResult,
  FoodCatalogItem,
  formatMacroLine,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  MealTemplate,
  MealType,
  sumMacros,
} from '../../../lib/nutrition/macros';
import { AI_FOOD_DISCLAIMER } from '../../../lib/nutrition/aiFoodEstimate';
import { BarcodeLookupNotFound, BarcodeLookupResult } from '../../../lib/nutrition/barcodeLookup';
import { LABEL_OCR_DISCLAIMER } from '../../../lib/nutrition/labelOcr';
import { MEAL_PHOTO_DISCLAIMER } from '../../../lib/nutrition/mealPhotoEstimate';
import { foodCatalogLabel, foodCatalogMeta } from '../../../lib/nutrition/foodCatalogSearch';
import type { QuickAddFood } from '../../../lib/nutrition/recentFoods';
import NutritionBarcodeScanner from '../NutritionBarcodeScanner';
import { NutritionBarcodeNotFoundCard, NutritionBarcodeProductCard } from '../NutritionBarcodeProduct';
import NutritionAiEstimateResults from './NutritionAiEstimateResults';
import type { FoodDraft } from './NutritionAddFoodTypes';

export type AddFoodView = 'hub' | 'barcode' | 'label' | 'meal_photo' | 'estimate' | 'manual';

const VIEW_TITLES: Record<AddFoodView, string> = {
  hub: 'Add food',
  barcode: 'Scan barcode',
  label: 'Nutrition label',
  meal_photo: 'Meal photo',
  estimate: 'Find or estimate food',
  manual: 'Manual entry',
};

function quickAddMeta(item: QuickAddFood) {
  return `${item.calories} cal · ${item.protein_g}P · ${item.carbs_g}C · ${item.fat_g}F`;
}

export type NutritionAddFoodPanelProps = {
  view: AddFoodView;
  onViewChange: (view: AddFoodView) => void;
  onClose: () => void;
  mealType: MealType;
  onMealTypeChange: (meal: MealType) => void;
  saving: boolean;
  // AI results
  aiEstimateResult: AiFoodEstimateResult | null;
  aiEstimateError: string;
  aiEstimating: boolean;
  onUseAiEstimate: (item: AiFoodEstimateItem) => void;
  onLogAiEstimate: (item: AiFoodEstimateItem) => void;
  onLogAllAiEstimates: (items: AiFoodEstimateItem[]) => void;
  // Estimate view
  estimateSearch: string;
  onEstimateSearchChange: (value: string) => void;
  estimateQuickItems: QuickAddFood[];
  estimateTemplates: MealTemplate[];
  estimateCatalogMatches: FoodCatalogItem[];
  foodCatalogCount: number;
  aiDescribe: string;
  onAiDescribeChange: (value: string) => void;
  onEstimateWithAi: () => void;
  onQuickAdd: (item: QuickAddFood) => void;
  onLogTemplate: (template: MealTemplate) => void;
  onPickCatalog: (item: FoodCatalogItem) => void;
  // Barcode
  showBarcodeScanner: boolean;
  barcodeLoading: boolean;
  barcodeError: string;
  scannerError: string;
  barcodeProduct: BarcodeLookupResult | null;
  barcodeNotFound: BarcodeLookupNotFound | null;
  barcodeServingQty: string;
  onBarcodeServingQtyChange: (value: string) => void;
  barcodeValue: string;
  onBarcodeValueChange: (value: string) => void;
  onOpenBarcodeScanner: () => void;
  onCloseBarcodeScanner: () => void;
  onBarcodeDetected: (code: string) => void;
  onScannerError: (code: string, message: string) => void;
  onLookupBarcode: () => void;
  onLogBarcode: (saveToLibrary: boolean) => void;
  onReviewBarcodeManual: () => void;
  onBarcodeNotFoundActions: {
    onScanAgain: () => void;
    onEnterManualUpc: () => void;
    onLabelPhoto: () => void;
    onManualEntry: () => void;
    onSaveCustom: () => void;
  };
  fallbackDetailsRef: RefObject<HTMLDetailsElement | null>;
  // Label / meal photo
  labelScanning: boolean;
  labelScanError: string;
  onLabelPhoto: (file: File | null) => void;
  mealPhotoScanning: boolean;
  mealPhotoScanError: string;
  onMealPhoto: (file: File | null) => void;
  // Manual
  addDraft: FoodDraft;
  setAddDraft: (next: FoodDraft) => void;
  pickedCatalogId: string | null;
  onClearCatalogPick: () => void;
  onLogManual: () => void;
  renderManualFields: () => React.ReactNode;
};

export default function NutritionAddFoodPanel(props: NutritionAddFoodPanelProps) {
  const {
    view,
    onViewChange,
    onClose,
    mealType,
    onMealTypeChange,
    saving,
    aiEstimateResult,
    aiEstimateError,
    aiEstimating,
    onUseAiEstimate,
    onLogAiEstimate,
    onLogAllAiEstimates,
    estimateSearch,
    onEstimateSearchChange,
    estimateQuickItems,
    estimateTemplates,
    estimateCatalogMatches,
    foodCatalogCount,
    aiDescribe,
    onAiDescribeChange,
    onEstimateWithAi,
    onQuickAdd,
    onLogTemplate,
    onPickCatalog,
    showBarcodeScanner,
    barcodeLoading,
    barcodeError,
    scannerError,
    barcodeProduct,
    barcodeNotFound,
    barcodeServingQty,
    onBarcodeServingQtyChange,
    barcodeValue,
    onBarcodeValueChange,
    onOpenBarcodeScanner,
    onCloseBarcodeScanner,
    onBarcodeDetected,
    onScannerError,
    onLookupBarcode,
    onLogBarcode,
    onReviewBarcodeManual,
    onBarcodeNotFoundActions,
    fallbackDetailsRef,
    labelScanning,
    labelScanError,
    onLabelPhoto,
    mealPhotoScanning,
    mealPhotoScanError,
    onMealPhoto,
    onLogManual,
    renderManualFields,
  } = props;

  const showBack = view !== 'hub';

  return (
    <>
      <div className="topline nutrition-add-head">
        <div>
          {showBack && (
            <button type="button" className="btn small secondary nutrition-add-back" onClick={() => onViewChange('hub')}>
              ← Back
            </button>
          )}
          <h3 id="nutrition-add-title">
            {VIEW_TITLES[view]} · {MEAL_TYPE_LABELS[mealType]}
          </h3>
        </div>
        <button type="button" className="btn small secondary" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="nutrition-add-meal-tabs">
        {MEAL_TYPES.map((meal) => (
          <button
            key={meal}
            type="button"
            className={`nutrition-add-meal-tab${mealType === meal ? ' active' : ''}`}
            onClick={() => onMealTypeChange(meal)}
          >
            {MEAL_TYPE_LABELS[meal]}
          </button>
        ))}
      </div>

      {aiEstimateResult && view !== 'hub' && view !== 'manual' && (
        <NutritionAiEstimateResults
          result={aiEstimateResult}
          saving={saving}
          onUse={(item) => {
            onUseAiEstimate(item);
            onViewChange('manual');
          }}
          onLogOne={onLogAiEstimate}
          onLogAll={onLogAllAiEstimates}
          onEditManual={() => {
            if (aiEstimateResult.items[0]) onUseAiEstimate(aiEstimateResult.items[0]);
            onViewChange('manual');
          }}
        />
      )}

      {view === 'hub' && (
        <div className="nutrition-add-hub">
          <p className="muted nutrition-add-intro">How would you like to log this food?</p>
          <div className="nutrition-add-hub-grid">
            <button type="button" className="nutrition-add-hub-btn" onClick={() => onViewChange('barcode')}>
              <span className="nutrition-add-hub-icon">📷</span>
              <span className="nutrition-add-hub-label">Scan barcode</span>
            </button>
            <button type="button" className="nutrition-add-hub-btn" onClick={() => onViewChange('label')}>
              <span className="nutrition-add-hub-icon">🏷️</span>
              <span className="nutrition-add-hub-label">Scan nutrition label</span>
            </button>
            <button type="button" className="nutrition-add-hub-btn" onClick={() => onViewChange('meal_photo')}>
              <span className="nutrition-add-hub-icon">🍽️</span>
              <span className="nutrition-add-hub-label">AI meal photo</span>
            </button>
            <button type="button" className="nutrition-add-hub-btn" onClick={() => onViewChange('estimate')}>
              <span className="nutrition-add-hub-icon">✨</span>
              <span className="nutrition-add-hub-label">Find or estimate food</span>
            </button>
          </div>
          <button type="button" className="btn secondary nutrition-add-manual-link" onClick={() => onViewChange('manual')}>
            Enter manually
          </button>
        </div>
      )}

      {view === 'barcode' && (
        <div className="nutrition-add-view">
          {!showBarcodeScanner && !barcodeProduct && !barcodeNotFound && (
            <div className="actions" style={{ marginTop: 0 }}>
              <button type="button" className="btn green" onClick={onOpenBarcodeScanner} disabled={saving || barcodeLoading}>
                Open camera scanner
              </button>
            </div>
          )}
          {barcodeLoading && <p className="muted">Looking up product…</p>}
          {showBarcodeScanner && (
            <NutritionBarcodeScanner
              onDetected={onBarcodeDetected}
              onClose={onCloseBarcodeScanner}
              onError={onScannerError}
            />
          )}
          {scannerError && !showBarcodeScanner && <p className="nutrition-error">{scannerError}</p>}
          {barcodeError && <p className="nutrition-error">{barcodeError}</p>}
          {barcodeProduct && (
            <NutritionBarcodeProductCard
              product={barcodeProduct}
              mealType={mealType}
              servingQty={barcodeServingQty}
              onServingQtyChange={onBarcodeServingQtyChange}
              saving={saving}
              onLog={onLogBarcode}
              onReviewManual={onReviewBarcodeManual}
            />
          )}
          {barcodeNotFound && (
            <NutritionBarcodeNotFoundCard result={barcodeNotFound} {...onBarcodeNotFoundActions} />
          )}
          {!showBarcodeScanner && !barcodeProduct && !barcodeNotFound && (
            <details className="nutrition-barcode-fallback" ref={fallbackDetailsRef}>
              <summary>Enter UPC manually</summary>
              <div className="nutrition-barcode-row">
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={barcodeValue}
                  onChange={(e) => onBarcodeValueChange(e.target.value.replace(/\D/g, ''))}
                  placeholder="UPC / EAN"
                />
                <button type="button" className="btn secondary" onClick={onLookupBarcode} disabled={saving || barcodeLoading}>
                  Look up
                </button>
              </div>
            </details>
          )}
        </div>
      )}

      {view === 'label' && (
        <div className="nutrition-add-view">
          {!aiEstimateResult && (
            <>
              <p className="muted">Take or choose a photo of the Nutrition Facts panel.</p>
              <label htmlFor="label-photo-input" className="nutrition-label-upload">
                Choose label photo
              </label>
              <input
                id="label-photo-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                disabled={saving || labelScanning}
                onChange={(e) => {
                  onLabelPhoto(e.target.files?.[0] || null);
                  e.target.value = '';
                }}
              />
              <p className="muted nutrition-ai-disclaimer">{LABEL_OCR_DISCLAIMER}</p>
            </>
          )}
          {labelScanError && <p className="nutrition-error">{labelScanError}</p>}
          {labelScanning && <p className="muted">Reading nutrition label…</p>}
        </div>
      )}

      {view === 'meal_photo' && (
        <div className="nutrition-add-view">
          {!aiEstimateResult && (
            <>
              <p className="muted">Photograph your plate or bowl — AI estimates each visible food.</p>
              <label htmlFor="meal-photo-input" className="nutrition-label-upload">
                Take or choose meal photo
              </label>
              <input
                id="meal-photo-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                disabled={saving || mealPhotoScanning || labelScanning}
                onChange={(e) => {
                  onMealPhoto(e.target.files?.[0] || null);
                  e.target.value = '';
                }}
              />
              <p className="muted nutrition-ai-disclaimer">{MEAL_PHOTO_DISCLAIMER}</p>
            </>
          )}
          {mealPhotoScanError && <p className="nutrition-error">{mealPhotoScanError}</p>}
          {mealPhotoScanning && <p className="muted">Analyzing meal photo…</p>}
        </div>
      )}

      {view === 'estimate' && (
        <div className="nutrition-add-view">
          {!aiEstimateResult && (
            <>
              <label htmlFor="estimate-search">Search recent, saved, templates, or catalog</label>
              <input
                id="estimate-search"
                value={estimateSearch}
                onChange={(e) => onEstimateSearchChange(e.target.value)}
                placeholder="Search foods, meal templates…"
                autoFocus
              />

              {estimateQuickItems.length > 0 && (
                <>
                  <h4 className="nutrition-add-section-title">Recent &amp; saved</h4>
                  <div className="nutrition-food-grid">
                    {estimateQuickItems.map((item) => (
                      <div key={item.key} className="nutrition-food-chip">
                        <div>
                          <b>{item.name}</b>
                          <span className="muted">
                            {quickAddMeta(item)} · {item.source === 'library' ? 'My foods' : 'Recent'}
                          </span>
                        </div>
                        <button type="button" className="btn small green" onClick={() => onQuickAdd(item)} disabled={saving}>
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {estimateTemplates.length > 0 && (
                <>
                  <h4 className="nutrition-add-section-title">Meal templates</h4>
                  <div className="nutrition-food-grid">
                    {estimateTemplates.map((template) => (
                      <div key={template.id} className="nutrition-food-chip">
                        <div>
                          <b>{template.name}</b>
                          <span className="muted">
                            {template.items.length} item(s) · {formatMacroLine(sumMacros(template.items))}
                          </span>
                        </div>
                        <button type="button" className="btn small green" onClick={() => onLogTemplate(template)} disabled={saving}>
                          Log meal
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {foodCatalogCount > 0 && estimateCatalogMatches.length > 0 && (
                <>
                  <h4 className="nutrition-add-section-title">Food catalog</h4>
                  <div className="catalog-results">
                    {estimateCatalogMatches.map((item) => (
                      <button key={item.id} type="button" className="catalog-result" onClick={() => onPickCatalog(item)}>
                        <span>
                          <b>{foodCatalogLabel(item)}</b>
                          <span className="muted">
                            {foodCatalogMeta(item)} · {item.calories} cal
                          </span>
                        </span>
                        <span className="badge">Use</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {estimateSearch.trim() &&
                !estimateQuickItems.length &&
                !estimateTemplates.length &&
                !estimateCatalogMatches.length && (
                  <p className="muted">No matches — try describing your food below.</p>
                )}

              <h4 className="nutrition-add-section-title">Describe for AI</h4>
              <textarea
                id="ai-food-describe"
                rows={2}
                value={aiDescribe}
                onChange={(e) => onAiDescribeChange(e.target.value)}
                placeholder="e.g. 6 oz grilled chicken, rice, and broccoli"
              />
              <p className="muted nutrition-ai-disclaimer">{AI_FOOD_DISCLAIMER}</p>
              <button type="button" className="btn secondary" onClick={onEstimateWithAi} disabled={saving || aiEstimating}>
                {aiEstimating ? 'Estimating…' : 'Estimate with AI'}
              </button>
            </>
          )}
          {aiEstimateError && <p className="nutrition-error">{aiEstimateError}</p>}
        </div>
      )}

      {view === 'manual' && (
        <div className="nutrition-add-view" id="nutrition-manual-entry">
          {renderManualFields()}
          <div className="actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn green" onClick={onLogManual} disabled={saving}>
              {saving ? 'Saving…' : `Log to ${MEAL_TYPE_LABELS[mealType]}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
