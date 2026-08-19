'use client';

import { AiFoodEstimateItem, AiFoodEstimateResult, formatMacroLine } from '../../../lib/nutrition/macros';

type NutritionAiEstimateResultsProps = {
  result: AiFoodEstimateResult;
  saving: boolean;
  onUse: (item: AiFoodEstimateItem) => void;
  onLogOne: (item: AiFoodEstimateItem) => void;
  onLogAll: (items: AiFoodEstimateItem[]) => void;
  onEditManual?: () => void;
};

export default function NutritionAiEstimateResults({
  result,
  saving,
  onUse,
  onLogOne,
  onLogAll,
  onEditManual,
}: NutritionAiEstimateResultsProps) {
  return (
    <div className="nutrition-ai-results nutrition-ai-results--inline">
      {result.notes && <p className="dash-insight nutrition-ai-notes">{result.notes}</p>}
      <div className="nutrition-food-grid">
        {result.items.map((item, idx) => (
          <div key={`${item.food_name}-${idx}`} className="nutrition-food-chip">
            <div>
              <b>{item.food_name}</b>
              <span className="muted">
                {item.serving_label} · {formatMacroLine(item)}
              </span>
            </div>
            <div className="nutrition-food-chip-actions">
              <button
                type="button"
                className="btn small green"
                onClick={() => onLogOne(item)}
                disabled={saving}
              >
                Log
              </button>
              <button
                type="button"
                className="btn small secondary"
                onClick={() => onUse(item)}
                disabled={saving}
              >
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
      {result.items.length > 1 && (
        <button
          type="button"
          className="btn green"
          style={{ marginTop: 8, width: '100%' }}
          onClick={() => onLogAll(result.items)}
          disabled={saving}
        >
          Log all {result.items.length} items
        </button>
      )}
      {onEditManual && result.items.length === 1 && (
        <button type="button" className="btn small secondary" style={{ marginTop: 8 }} onClick={onEditManual}>
          Fine-tune in manual entry
        </button>
      )}
    </div>
  );
}
