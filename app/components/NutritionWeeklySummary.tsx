'use client';

import { WeeklyNutritionSummary } from '../../lib/nutrition/weeklySummary';
import { formatMacro, formatMacroLine } from '../../lib/nutrition/macros';
import { formatDisplayDate } from '../../lib/training/programCalendar';

type NutritionWeeklySummaryProps = {
  summary: WeeklyNutritionSummary;
  activeDate?: string;
  onSelectDate?: (date: string) => void;
};

export default function NutritionWeeklySummary({
  summary,
  activeDate,
  onSelectDate,
}: NutritionWeeklySummaryProps) {
  const peakCal = Math.max(...summary.days.map((d) => d.totals.calories), summary.goals.calories, 1);

  return (
    <div className="card nutrition-weekly-card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h3>This week</h3>
        <span className="badge">
          {formatDisplayDate(summary.monday)} – {formatDisplayDate(summary.sunday)}
        </span>
      </div>
      <div className="nutrition-weekly-metrics">
        <div>
          <b>{summary.loggedDays}/7</b>
          <span className="muted">Days logged</span>
        </div>
        <div>
          <b>{formatMacro(summary.avgCalories)}</b>
          <span className="muted">Avg cal/day</span>
        </div>
        <div>
          <b>{summary.avgProteinPct}%</b>
          <span className="muted">Avg protein goal</span>
        </div>
        <div>
          <b>{formatMacroLine(summary.weekTotals)}</b>
          <span className="muted">Week total</span>
        </div>
      </div>
      <div className="nutrition-weekly-chart">
        {summary.days.map((day) => {
          const height = Math.max(8, Math.round((day.totals.calories / peakCal) * 100));
          const isActive = activeDate === day.date;
          return (
            <button
              key={day.date}
              type="button"
              className={`nutrition-weekly-bar${isActive ? ' active' : ''}${day.entryCount ? '' : ' empty'}`}
              onClick={() => onSelectDate?.(day.date)}
              title={`${formatDisplayDate(day.date)} · ${day.entryCount ? formatMacroLine(day.totals) : 'No entries'}`}
            >
              <div className="nutrition-weekly-bar-fill" style={{ height: `${height}%` }} />
              <span className="nutrition-weekly-bar-label">{day.label.split('/')[0]}</span>
              <span className="muted nutrition-weekly-bar-cal">
                {day.entryCount ? formatMacro(day.totals.calories) : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
