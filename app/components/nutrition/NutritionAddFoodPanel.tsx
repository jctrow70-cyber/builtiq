'use client';

import { RefObject, useRef } from 'react';
import {
  formatMacroLine,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  MealTemplate,
  MealType,
  sumMacros,
} from '../../../lib/nutrition/macros';
import { AI_FOOD_DISCLAIMER, AiFoodEstimateItem, AiFoodEstimateResult } from '../../../lib/nutrition/aiFoodEstimate';
import { BarcodeLookupNotFound, BarcodeLookupResult } from '../../../lib/nutrition/barcodeLookup';
import { LABEL_OCR_DISCLAIMER } from '../../../lib/nutrition/labelOcr';
import { MEAL_PHOTO_DISCLAIMER } from '../../../lib/nutrition/mealPhotoEstimate';
import { foodCatalogLabel, foodCatalogMeta, FoodCatalogItem } from '../../../lib/nutrition/foodCatalogSearch';
import type { FindFoodResult } from '../../../lib/nutrition/findFoodSearch';
import type { QuickAddFood } from '../../../lib/nutrition/recentFoods';
import NutritionBarcodeScanner from '../NutritionBarcodeScanner';
import { NutritionBarcodeNotFoundCard, NutritionBarcodeProductCard } from '../NutritionBarcodeProduct';
import NutritionAiEstimateResults from './NutritionAiEstimateResults';
import type { FoodDraft } from './NutritionAddFoodTypes';

export type AddFoodView = 'hub' | 'barcode' | 'label' | 'meal_photo' | 'find_food' | 'ai_estimate' | 'manual';

const VIEW_TITLES: Record<AddFoodView, string> = {
  hub: 'Add food',
  barcode: 'Scan barcode',
  label: 'Nutrition label',
  meal_photo: 'Meal photo',
  find_food: 'Find food',
  ai_estimate: 'AI estimate',
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
  findFoodResults: FindFoodResult[];
  estimateCatalogMatches: FoodCatalogItem[];
  catalogSearching?: boolean;
  addFoodLibraryLoading?: boolean;
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
    findFoodResults,
    estimateCatalogMatches,
    catalogSearching = false,
    addFoodLibraryLoading = false,
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

  const labelInputRef = useRef<HTMLInputElement>(null);
  const mealPhotoInputRef = useRef<HTMLInputElement>(null);

  const startBarcode = () => {
    onViewChange('barcode');
    onOpenBarcodeScanner();
  };

  const startLabelPhoto = () => {
    onViewChange('label');
    labelInputRef.current?.click();
  };

  const startMealPhoto = () => {
    onViewChange('meal_photo');
    mealPhotoInputRef.current?.click();
  };

  const showBack = view !== 'hub';

  return (
    <>
      <input
        ref={labelInputRef}
        id="label-photo-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="nutrition-add-file-input"
        disabled={saving || labelScanning}
        onChange={(e) => {
          onLabelPhoto(e.target.files?.[0] || null);
          e.target.value = '';
        }}
      />
      <input
        ref={mealPhotoInputRef}
        id="meal-photo-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="nutrition-add-file-input"
        disabled={saving || mealPhotoScanning || labelScanning}
        onChange={(e) => {
          onMealPhoto(e.target.files?.[0] || null);
          e.target.value = '';
        }}
      />

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

      {aiEstimateResult && view !== 'hub' && view !== 'manual' && view !== 'find_food' && (
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
          <div className="nutrition-add-hub-grid nutrition-add-hub-grid--5">
            <button type="button" className="nutrition-add-hub-btn" onClick={startBarcode}>
              <span className="nutrition-add-hub-icon">📷</span>
              <span className="nutrition-add-hub-label">Scan barcode</span>
            </button>
            <button type="button" className="nutrition-add-hub-btn" onClick={startLabelPhoto}>
              <span className="nutrition-add-hub-icon">🏷️</span>
              <span className="nutrition-add-hub-label">Scan nutrition label</span>
            </button>
            <button type="button" className="nutrition-add-hub-btn" onClick={startMealPhoto}>
              <span className="nutrition-add-hub-icon">🍽️</span>
              <span className="nutrition-add-hub-label">AI meal photo</span>
            </button>
            <button type="button" className="nutrition-add-hub-btn" onClick={() => onViewChange('find_food')}>
              <span className="nutrition-add-hub-icon">🔍</span>
              <span className="nutrition-add-hub-label">Find food</span>
            </button>
            <button type="button" className="nutrition-add-hub-btn" onClick={() => onViewChange('ai_estimate')}>
              <span className="nutrition-add-hub-icon">✨</span>
              <span className="nutrition-add-hub-label">AI estimate</span>
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
          {!aiEstimateResult && !labelScanning && (
            <>
              <p className="muted">Take or choose a photo of the Nutrition Facts panel.</p>
              <button type="button" className="btn green" onClick={() => labelInputRef.current?.click()} disabled={saving}>
                Take or choose label photo
              </button>
              <p className="muted nutrition-ai-disclaimer">{LABEL_OCR_DISCLAIMER}</p>
            </>
          )}
          {labelScanError && <p className="nutrition-error">{labelScanError}</p>}
          {labelScanning && <p className="muted">Reading nutrition label…</p>}
        </div>
      )}

      {view === 'meal_photo' && (
        <div className="nutrition-add-view">
          {!aiEstimateResult && !mealPhotoScanning && (
            <>
              <p className="muted">Photograph your plate or bowl — AI estimates each visible food.</p>
              <button type="button" className="btn green" onClick={() => mealPhotoInputRef.current?.click()} disabled={saving}>
                Take or choose meal photo
              </button>
              <p className="muted nutrition-ai-disclaimer">{MEAL_PHOTO_DISCLAIMER}</p>
            </>
          )}
          {mealPhotoScanError && <p className="nutrition-error">{mealPhotoScanError}</p>}
          {mealPhotoScanning && <p className="muted">Analyzing meal photo…</p>}
        </div>
      )}

      {view === 'find_food' && (
        <div className="nutrition-add-view">
          <label htmlFor="estimate-search">Search saved foods and meal templates</label>
          <input
            id="estimate-search"
            value={estimateSearch}
            onChange={(e) => onEstimateSearchChange(e.target.value)}
            placeholder="Search my foods, recent items, or saved meals…"
            autoFocus
          />

          {addFoodLibraryLoading && !findFoodResults.length && (
            <p className="muted">Loading saved foods and meal templates…</p>
          )}

          {findFoodResults.length > 0 && (
            <>
              <h4 className="nutrition-add-section-title">Saved foods &amp; meals</h4>
              <div className="nutrition-food-grid">
                {findFoodResults.map((result) =>
                  result.kind === 'template' ? (
                    <div key={`template:${result.item.id}`} className="nutrition-food-chip">
                      <div>
                        <b>{result.item.name}</b>
                        <span className="muted">
                          Meal template · {result.item.items.length} item(s) ·{' '}
                          {formatMacroLine(sumMacros(result.item.items))}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn small green"
                        onClick={() => onLogTemplate(result.item)}
                        disabled={saving}
                      >
                        Log meal
                      </button>
                    </div>
                  ) : (
                    <div key={result.item.key} className="nutrition-food-chip">
                      <div>
                        <b>{result.item.name}</b>
                        <span className="muted">
                          {quickAddMeta(result.item)} ·{' '}
                          {result.item.source === 'library' ? 'My foods' : 'Recent'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn small green"
                        onClick={() => onQuickAdd(result.item)}
                        disabled={saving}
                      >
                        Add
                      </button>
                    </div>
                  )
                )}
              </div>
            </>
          )}

          {estimateCatalogMatches.length > 0 && (
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

          {catalogSearching && estimateSearch.trim() && (
            <p className="muted">Searching food catalog…</p>
          )}

          {estimateSearch.trim() && !findFoodResults.length && !estimateCatalogMatches.length && !catalogSearching && !addFoodLibraryLoading && (
            <p className="muted">No matches — try AI estimate or enter manually.</p>
          )}

          {!estimateSearch.trim() && !findFoodResults.length && !addFoodLibraryLoading && (
            <p className="muted">Save foods to My foods or create meal templates to find them here quickly.</p>
          )}
        </div>
      )}

      {view === 'ai_estimate' && (
        <div className="nutrition-add-view">
          {!aiEstimateResult && (
            <>
              <label htmlFor="ai-food-describe">Describe what you ate</label>
              <textarea
                id="ai-food-describe"
                rows={3}
                value={aiDescribe}
                onChange={(e) => onAiDescribeChange(e.target.value)}
                placeholder="e.g. 6 oz grilled chicken, rice, and broccoli"
                autoFocus
              />
              <p className="muted nutrition-ai-disclaimer">{AI_FOOD_DISCLAIMER}</p>
              <button type="button" className="btn green" onClick={onEstimateWithAi} disabled={saving || aiEstimating}>
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
