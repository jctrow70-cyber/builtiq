'use client';

import { useMemo, useState } from 'react';
import { formatMacro, MacroTotals, NutritionGoals } from '../../lib/nutrition/macros';
import { WeeklyNutritionSummary } from '../../lib/nutrition/weeklySummary';
import { formatDisplayDate } from '../../lib/training/programCalendar';

type WeeklyTrendMetric = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g';

type SeriesConfig = {
  id: WeeklyTrendMetric;
  label: string;
  color: string;
};

const SERIES: SeriesConfig[] = [
  { id: 'calories', label: 'Calories', color: '#7c5cff' },
  { id: 'protein_g', label: 'Protein', color: '#38bdf8' },
  { id: 'carbs_g', label: 'Carbs', color: '#fbbf24' },
  { id: 'fat_g', label: 'Fat', color: '#fb7185' },
];

type NutritionWeeklyTrendChartProps = {
  summary: WeeklyNutritionSummary;
  activeDate?: string;
  onSelectDate?: (date: string) => void;
};

const SVG_W = 360;
const SVG_H = 180;
const PAD = { top: 16, right: 12, bottom: 28, left: 36 };

function metricValue(totals: MacroTotals, metric: WeeklyTrendMetric): number {
  return Number(totals[metric]) || 0;
}

function goalPercent(value: number, goal: number): number {
  if (!goal || goal <= 0) return 0;
  return (value / goal) * 100;
}

function formatMetricDisplay(metric: WeeklyTrendMetric, value: number): string {
  if (metric === 'calories') return `${formatMacro(value)} cal`;
  return `${formatMacro(value)}g`;
}

function buildPolyline(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

export default function NutritionWeeklyTrendChart({
  summary,
  activeDate,
  onSelectDate,
}: NutritionWeeklyTrendChartProps) {
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const chart = useMemo(() => {
    const plotW = SVG_W - PAD.left - PAD.right;
    const plotH = SVG_H - PAD.top - PAD.bottom;
    const days = summary.days;

    const seriesData = SERIES.map((s) => ({
      ...s,
      goal: Number(summary.goals[s.id]) || 0,
      values: days.map((day) => metricValue(day.totals, s.id)),
      pcts: days.map((day) => goalPercent(metricValue(day.totals, s.id), Number(summary.goals[s.id]) || 0)),
    }));

    const allPcts = seriesData.flatMap((s) => s.pcts);
    const maxPct = Math.max(100, ...allPcts, 1);
    const yTicks = [0, 50, 100].filter((t) => t <= maxPct);
    if (!yTicks.includes(100) && maxPct >= 100) yTicks.push(100);

    const xAt = (index: number) =>
      days.length <= 1 ? PAD.left + plotW / 2 : PAD.left + (index / (days.length - 1)) * plotW;
    const yAt = (pct: number) => PAD.top + plotH - (pct / maxPct) * plotH;

    const lines = seriesData.map((s) => ({
      ...s,
      points: s.pcts.map((pct, i) => ({ x: xAt(i), y: yAt(pct), pct, value: s.values[i] })),
    }));

    const goalY = yAt(100);

    return { plotW, plotH, days, maxPct, yTicks, lines, xAt, yAt, goalY };
  }, [summary]);

  const focusDate = hoverDate || activeDate || null;
  const focusDay = chart.days.find((d) => d.date === focusDate);

  return (
    <div className="card nutrition-weekly-card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h3>7-day trend</h3>
        <span className="badge">
          {formatDisplayDate(summary.monday)} – {formatDisplayDate(summary.sunday)}
        </span>
      </div>

      <div className="nutrition-weekly-legend" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.id} className="nutrition-weekly-legend-item">
            <span className="nutrition-weekly-legend-swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <p className="muted nutrition-weekly-chart-note">Lines show % of daily goal per macro</p>

      <div className="nutrition-weekly-line-chart-wrap">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="nutrition-weekly-line-chart"
          role="img"
          aria-label="Seven day nutrition trend for calories, protein, carbs, and fat"
        >
          {chart.yTicks.map((tick) => {
            const y = chart.yAt(tick);
            return (
              <g key={tick}>
                <line x1={PAD.left} y1={y} x2={SVG_W - PAD.right} y2={y} className="nutrition-weekly-grid-line" />
                <text x={PAD.left - 6} y={y + 4} className="nutrition-weekly-axis-label" textAnchor="end">
                  {tick}%
                </text>
              </g>
            );
          })}

          {chart.maxPct >= 100 && (
            <line
              x1={PAD.left}
              y1={chart.goalY}
              x2={SVG_W - PAD.right}
              y2={chart.goalY}
              className="nutrition-weekly-goal-line-svg"
            />
          )}

          {chart.lines.map((line) => (
            <g key={line.id}>
              <polyline points={buildPolyline(line.points)} className="nutrition-weekly-line" style={{ stroke: line.color }} />
              {line.points.map((pt, i) => {
                const day = chart.days[i];
                const isActive = focusDate === day.date;
                return (
                  <circle
                    key={day.date}
                    cx={pt.x}
                    cy={pt.y}
                    r={isActive ? 5 : 3.5}
                    className={`nutrition-weekly-point${isActive ? ' active' : ''}`}
                    style={{ fill: line.color }}
                    onMouseEnter={() => setHoverDate(day.date)}
                    onFocus={() => setHoverDate(day.date)}
                    onClick={() => onSelectDate?.(day.date)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${formatDisplayDate(day.date)} ${line.label} ${Math.round(pt.pct)} percent of goal`}
                  />
                );
              })}
            </g>
          ))}

          {chart.days.map((day, i) => (
            <text
              key={day.date}
              x={chart.xAt(i)}
              y={SVG_H - 8}
              textAnchor="middle"
              className={`nutrition-weekly-x-label${focusDate === day.date ? ' active' : ''}`}
              onClick={() => onSelectDate?.(day.date)}
            >
              {day.label.split('/')[0]}
            </text>
          ))}
        </svg>
      </div>

      {focusDay && (
        <div className="nutrition-weekly-day-detail">
          <b>{formatDisplayDate(focusDay.date)}</b>
          {focusDay.entryCount === 0 ? (
            <span className="muted"> · No entries</span>
          ) : (
            <span className="muted">
              {' · '}
              {SERIES.map((s, idx) => {
                const val = metricValue(focusDay.totals, s.id);
                const goal = Number(summary.goals[s.id]) || 0;
                const pct = goal ? Math.round(goalPercent(val, goal)) : 0;
                return (
                  <span key={s.id}>
                    {idx > 0 ? ' · ' : ''}
                    <span style={{ color: s.color }}>{s.label}</span> {formatMetricDisplay(s.id, val)} ({pct}%)
                  </span>
                );
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
