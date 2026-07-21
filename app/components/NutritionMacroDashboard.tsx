'use client';

import { MacroTotals, NutritionGoals, formatMacro } from '../../lib/nutrition/macros';
import { formatCaloriesRemaining } from '../../lib/nutrition/macroRing';
import NutritionMacroRing from './NutritionMacroRing';

type NutritionMacroDashboardProps = {
  totals: MacroTotals;
  goals: NutritionGoals;
};

export default function NutritionMacroDashboard({ totals, goals }: NutritionMacroDashboardProps) {
  return (
    <div className="nutrition-macro-dashboard" aria-label="Daily macro progress">
      <NutritionMacroRing
        label="Calories"
        value={formatMacro(totals.calories)}
        subtitle={`of ${formatMacro(goals.calories)}`}
        footer={formatCaloriesRemaining(totals.calories, goals.calories)}
        actual={totals.calories}
        target={goals.calories}
      />
      <NutritionMacroRing
        label="Protein"
        value={`${formatMacro(totals.protein_g)}g`}
        subtitle={`/ ${formatMacro(goals.protein_g)}g`}
        actual={totals.protein_g}
        target={goals.protein_g}
      />
      <NutritionMacroRing
        label="Carbs"
        value={`${formatMacro(totals.carbs_g)}g`}
        subtitle={`/ ${formatMacro(goals.carbs_g)}g`}
        actual={totals.carbs_g}
        target={goals.carbs_g}
      />
      <NutritionMacroRing
        label="Fat"
        value={`${formatMacro(totals.fat_g)}g`}
        subtitle={`/ ${formatMacro(goals.fat_g)}g`}
        actual={totals.fat_g}
        target={goals.fat_g}
      />
    </div>
  );
}
