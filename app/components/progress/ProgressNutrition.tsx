'use client';

import { useState } from 'react';
import Card from '../ui/Card';
import SegmentedControl from '../ui/SegmentedControl';
import ProgressTrendChart from './ProgressTrendChart';
import { comparisonGap, metricsFor, progressComparison } from '../../../lib/progress/comparison';
import { formatCount } from '../../../lib/progress/progressView';
import type { UnitsPreference } from '../../../lib/body/measurements';
import type { ProgressReport } from '../../../lib/progress/report';
import type { NutritionDay } from '../../../lib/progress/nutrition';

type Macro = 'calories' | 'protein' | 'carbs' | 'fat';

const MACROS: { value: Macro; label: string }[] = [
  { value: 'calories', label: 'Calories' },
  { value: 'protein', label: 'Protein' },
  { value: 'carbs', label: 'Carbs' },
  { value: 'fat', label: 'Fat' },
];

type ProgressNutritionProps = {
  report: ProgressReport;
  units: UnitsPreference;
  onLogMeals?: () => void;
};

export default function ProgressNutrition({ report, units, onLogMeals }: ProgressNutritionProps) {
  const [macro, setMacro] = useState<Macro>('calories');
  const nutrition = report.nutrition;
  const comparison = progressComparison(report, units);
  const gap = comparisonGap(comparison, 'nutrition');
  const aligned = metricsFor(comparison, ['calories', 'protein', 'weight', 'waist', 'strength', 'training']);

  if (!nutrition.averages) {
    return (
      <Card>
        <div className="progress-empty">
          <h3>Connect nutrition to your training</h3>
          <p>Log meals to see how calories and macros line up with strength, training, and body changes.</p>
          {onLogMeals && <button type="button" className="btn secondary" onClick={onLogMeals}>Log meals</button>}
        </div>
      </Card>
    );
  }

  const selected = MACROS.find((item) => item.value === macro) || MACROS[0];
  const points = nutrition.days
    .map((day) => ({ date: day.date, value: dayValue(day, macro) }))
    .filter((point) => Number.isFinite(point.value));
  const average = nutrition.averages[macro];

  return (
    <div className="progress-stack">
      <Card elevated>
        <p className="progress-kicker">Days logged</p>
        <h2 className="progress-headline">{nutrition.loggedDays} of {nutrition.daysInRange}</h2>
        {nutrition.consistency != null && <p className="progress-lead">{formatPercent(nutrition.consistency)} logged</p>}
        <p className="muted">Averages use logged days only. A day with no meals stays missing.</p>
      </Card>

      <div className="progress-card-grid">
        <MacroCard label="Average calories" value={nutrition.averages.calories} unit="kcal" />
        <MacroCard label="Average protein" value={nutrition.averages.protein} unit="g" />
        <MacroCard label="Average carbohydrates" value={nutrition.averages.carbs} unit="g" />
        <MacroCard label="Average fat" value={nutrition.averages.fat} unit="g" />
      </div>

      {hasTarget(nutrition.targets) && (
        <Card>
          <h2 className="progress-section-title">Configured targets</h2>
          <p className="muted">This compares logged intake with the target you set. It is not a measure of energy expenditure.</p>
          <TargetRow label="Calories" average={nutrition.averages.calories} target={nutrition.targets?.calories ?? null} unit="kcal" />
          <TargetRow label="Protein" average={nutrition.averages.protein} target={nutrition.targets?.protein ?? null} unit="g" />
          <TargetRow label="Carbohydrates" average={nutrition.averages.carbs} target={nutrition.targets?.carbs ?? null} unit="g" />
          <TargetRow label="Fat" average={nutrition.averages.fat} target={nutrition.targets?.fat ?? null} unit="g" />
        </Card>
      )}

      <Card>
        <div className="progress-section-head">
          <h2 className="progress-section-title">Trend</h2>
          <div className="progress-scroll-tabs">
            <SegmentedControl<Macro> ariaLabel="Nutrition trend" size="sm" value={macro} onChange={setMacro} options={MACROS} />
          </div>
        </div>
        {points.length >= 2 ? (
          <>
            <ProgressTrendChart points={points} label={`${selected.label} on logged days`} reference={average} gapDays />
            <p className="muted">Logged days only. Gaps are days with no meals. The dashed line is the logged-day average.</p>
          </>
        ) : (
          <p className="progress-lead">Log this on a few more days to see a {selected.label.toLowerCase()} trend.</p>
        )}
      </Card>

      <Card>
        <h2 className="progress-section-title">Consistency</h2>
        {nutrition.targets?.protein != null && nutrition.targetDaysMet?.protein != null ? (
          <p className="progress-lead"><b>Protein target.</b> Met on {nutrition.targetDaysMet.protein} of {nutrition.loggedDays} logged days.</p>
        ) : (
          <p className="progress-lead">Set a protein target to see how many logged days reached it.</p>
        )}
        {nutrition.targets?.calories != null && nutrition.averages.calories != null ? (
          <p className="progress-lead"><b>Calories.</b> {calorieSentence(nutrition.averages.calories, nutrition.targets.calories)}</p>
        ) : (
          <p className="muted">Calorie consistency uses your configured target. No extra range is applied.</p>
        )}
      </Card>

      <Card>
        <h2 className="progress-section-title">Nutrition & Performance</h2>
        <p className="muted">{comparison.periodLabel}</p>
        {aligned.length > 0 && (
          <div className="progress-stat-grid">
            {aligned.map((metric) => {
              const change = metric.detail != null && /^[+-]|^Unchanged/.test(metric.detail);
              return (
                <div key={metric.id}>
                  <b>{change ? metric.detail : metric.value}</b>
                  <span className="muted">{metric.label}{!change && metric.detail ? ` · ${metric.detail}` : ''}</span>
                </div>
              );
            })}
          </div>
        )}
        {comparison.observations.slice(0, 3).map((note) => (
          <p className="progress-lead" key={note.id}>{note.text}</p>
        ))}
        {gap && <p className="progress-lead">{gap}</p>}
      </Card>
    </div>
  );
}

function MacroCard({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  if (value == null) return null;
  const shown = unit === 'kcal' ? formatCount(value) : String(Math.round(value));
  return (
    <div className="ui-card">
      <span className="progress-kicker">{label}</span>
      <span className="progress-hero-value">{shown}</span>
      <span className="muted">{unit}</span>
    </div>
  );
}

function TargetRow({ label, average, target, unit }: { label: string; average: number | null; target: number | null; unit: string }) {
  if (average == null || target == null) return null;
  const percent = Math.round((average / target) * 1000) / 10;
  const shownAverage = unit === 'kcal' ? formatCount(average) : `${Math.round(average)} ${unit}`;
  const shownTarget = unit === 'kcal' ? formatCount(target) : `${Math.round(target)} ${unit}`;
  return (
    <div className="progress-balance-row">
      <span>{label}</span>
      <span>{shownAverage} average · {shownTarget} target</span>
      <b>{formatPercent(percent)} of target</b>
    </div>
  );
}

function calorieSentence(average: number, target: number): string {
  const gap = Math.round(average - target);
  if (Math.abs(gap) < 1) return 'Logged days match your configured daily target.';
  const direction = gap < 0 ? 'below' : 'above';
  return `Logged days averaged ${formatCount(Math.abs(gap))} calories ${direction} your configured daily target.`;
}

function dayValue(day: NutritionDay, macro: Macro): number {
  if (macro === 'calories') return day.calories;
  if (macro === 'protein') return day.protein;
  if (macro === 'carbs') return day.carbs;
  return day.fat;
}

function hasTarget(targets: ProgressReport['nutrition']['targets']): boolean {
  if (!targets) return false;
  return [targets.calories, targets.protein, targets.carbs, targets.fat].some((value) => value != null && value > 0);
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}
