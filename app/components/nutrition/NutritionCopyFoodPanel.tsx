'use client';

import { forwardRef } from 'react';
import DateInput from '../DateInput';
import { MEAL_TYPE_LABELS, MEAL_TYPES, MealType } from '../../../lib/nutrition/macros';

export type NutritionCopyFoodPanelProps = {
  sourceLabel: string;
  itemCount: number;
  targetDate: string;
  targetMeal: MealType;
  onTargetDateChange: (date: string) => void;
  onTargetMealChange: (meal: MealType) => void;
  saving: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export default function NutritionCopyFoodPanel({
  sourceLabel,
  itemCount,
  targetDate,
  targetMeal,
  onTargetDateChange,
  onTargetMealChange,
  saving,
  onConfirm,
  onClose,
}: NutritionCopyFoodPanelProps) {
  const itemWord = itemCount === 1 ? 'item' : 'items';

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div
        className="nutrition-add-panel card nutrition-copy-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nutrition-copy-title"
      >
        <div className="topline" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 id="nutrition-copy-title">Copy to another day</h3>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted nutrition-copy-source">
          Copy <b>{itemCount}</b> {itemWord} from <b>{sourceLabel}</b>
        </p>
        <div className="nutrition-copy-fields">
          <div>
            <label htmlFor="nutrition-copy-date">Date</label>
            <DateInput id="nutrition-copy-date" value={targetDate} onChange={onTargetDateChange} disabled={saving} />
          </div>
          <div>
            <label htmlFor="nutrition-copy-meal">Meal</label>
            <select
              id="nutrition-copy-meal"
              value={targetMeal}
              onChange={(e) => onTargetMealChange(e.target.value as MealType)}
              disabled={saving}
            >
              {MEAL_TYPES.map((meal) => (
                <option key={meal} value={meal}>
                  {MEAL_TYPE_LABELS[meal]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn green" onClick={onConfirm} disabled={saving}>
            {saving ? 'Copying…' : `Copy ${itemCount} ${itemWord}`}
          </button>
          <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
