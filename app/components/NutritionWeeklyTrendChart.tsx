'use client';

import { useState } from 'react';
import { formatMacro, MacroTotals, NutritionGoals } from '../../lib/nutrition/macros';
import { WeeklyNutritionSummary } from '../../lib/nutrition/weeklySummary';
import { formatDisplayDate } from '../../lib/training/programCalendar';

export type WeeklyTrendMetric = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g';

const METRIC_TABS: { id: WeeklyTrendMetric; label: string }[] = [
  { id: 'calories', label: 'Calories' },
  { id: 'protein_g', label: 'Protein' },
  { id: 'carbs_g', label: 'Carbs' },
  { id: 'fat_g', label: 'Fat' },
];

type NutritionWeeklyTrendChartProps = {
  summary: WeeklyNutritionSummary;
  activeDate?: string;
  onSelectDate?: (date: string) => void;
};

function metricValue(totals: MacroTotals, metric: WeeklyTrendMetric): number {
  return Number(totals[metric]) || 0;
}

function metricGoal(goals: NutritionGoals, metric: WeeklyTrendMetric): number {
  return Number(goals[metric]) || 0;
}

function formatMetricDisplay(metric: WeeklyTrendMetric, value: number): string {
  if (metric === 'calories') return formatMacro(value);
  return `${formatMacro(value)}g`;
}

export default function NutritionWeeklyTrendChart({
  summary,
  activeDate,
  onSelectDate,
}: NutritionWeeklyTrendChartProps) {
  const [metric, setMetric] = useState<WeeklyTrendMetric>('calories');
  const goal = metricGoal(summary.goals, metric);
  const dayValues = summary.days.map((day) => metricValue(day.totals, metric));
  const peak = Math.max(...dayValues, goal, 1);

  return (
    <div className="card nutrition-weekly-card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h3>7-day trend</h3>
        <span className="badge">
          {formatDisplayDate(summary.monday)} – {formatDisplayDate(summary.sunday)}
        </span>
      </div>
      <div className="nutrition-weekly-metric-tabs" role="tablist" aria-label="Weekly chart metric">
        {METRIC_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={metric === tab.id}
            className={`nutrition-weekly-metric-tab${metric === tab.id ? ' active' : ''}`}
            onClick={() => setMetric(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {goal > 0 && (
        <p className="muted nutrition-weekly-goal-hint">
          Daily goal: <b>{formatMetricDisplay(metric, goal)}</b>
        </p>
      )}
      <div className="nutrition-weekly-chart-wrap">
        {goal > 0 && (
          <div
            className="nutrition-weekly-goal-line"
            style={{ bottom: `calc(${Math.min(100, Math.round((goal / peak) * 100))}% + 8px)` }}
            aria-hidden="true"
          />
        )}
        <div className="nutrition-weekly-chart">
          {summary.days.map((day, idx) => {
            const value = dayValues[idx];
            const height = Math.max(8, Math.round((value / peak) * 100));
            const isActive = activeDate === day.date;
            return (
              <button
                key={day.date}
                type="button"
                className={`nutrition-weekly-bar${isActive ? ' active' : ''}${day.entryCount ? '' : ' empty'}`}
                onClick={() => onSelectDate?.(day.date)}
                title={`${formatDisplayDate(day.date)} · ${
                  day.entryCount ? formatMetricDisplay(metric, value) : 'No entries'
                }`}
              >
                <div className="nutrition-weekly-bar-fill" style={{ height: `${height}%` }} />
                <span className="nutrition-weekly-bar-label">{day.label.split('/')[0]}</span>
                <span className="muted nutrition-weekly-bar-cal">
                  {day.entryCount ? formatMetricDisplay(metric, value) : '—'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
