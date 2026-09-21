'use client';

import { useMemo, useRef, useState, type TouchEvent } from 'react';
import { formatMacro, MacroTotals } from '../../lib/nutrition/macros';
import { WeeklyNutritionSummary } from '../../lib/nutrition/weeklySummary';
import { dayLabelFromYmd, formatDisplayDate } from '../../lib/training/programCalendar';

type WeeklyTrendMetric = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g';
type VisibleMetric = 'all' | WeeklyTrendMetric;

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
  priorSummary?: WeeklyNutritionSummary | null;
  activeDate?: string;
  onSelectDate?: (date: string) => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onThisWeek?: () => void;
  canGoNext?: boolean;
  isCurrentWeek?: boolean;
  loading?: boolean;
};

const SVG_W = 360;
const SVG_H = 180;
const PAD = { top: 16, right: 12, bottom: 28, left: 40 };

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

function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const step = max <= 40 ? 10 : max <= 100 ? 25 : max <= 250 ? 50 : max <= 600 ? 100 : max <= 2000 ? 250 : 500;
  const ticks: number[] = [];
  const top = Math.ceil(max / step) * step;
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return ticks.length ? ticks : [0, top || 1];
}

function weekLoggedAverage(summary: WeeklyNutritionSummary | null | undefined, metric: WeeklyTrendMetric) {
  if (!summary) return null;
  const logged = summary.days.filter((d) => d.entryCount > 0);
  if (!logged.length) return null;
  const total = logged.reduce((n, d) => n + metricValue(d.totals, metric), 0);
  return { avg: total / logged.length, days: logged.length };
}

export default function NutritionWeeklyTrendChart({
  summary,
  priorSummary,
  activeDate,
  onSelectDate,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  canGoNext = true,
  isCurrentWeek = true,
  loading = false,
}: NutritionWeeklyTrendChartProps) {
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [visibleMetric, setVisibleMetric] = useState<VisibleMetric>('all');
  const weekSwipeStart = useRef<{ x: number; y: number } | null>(null);

  const visibleSeries = visibleMetric === 'all' ? SERIES : SERIES.filter((s) => s.id === visibleMetric);
  const singleMetric = visibleMetric === 'all' ? null : visibleMetric;

  const chart = useMemo(() => {
    const plotW = SVG_W - PAD.left - PAD.right;
    const plotH = SVG_H - PAD.top - PAD.bottom;
    const days = summary.days;
    const usePercent = !singleMetric;

    const seriesData = visibleSeries.map((s) => ({
      ...s,
      goal: Number(summary.goals[s.id]) || 0,
      values: days.map((day) => metricValue(day.totals, s.id)),
      pcts: days.map((day) => goalPercent(metricValue(day.totals, s.id), Number(summary.goals[s.id]) || 0)),
    }));

    const xAt = (index: number) =>
      days.length <= 1 ? PAD.left + plotW / 2 : PAD.left + (index / (days.length - 1)) * plotW;

    if (usePercent) {
      const allPcts = seriesData.flatMap((s) => s.pcts);
      const maxPct = Math.max(100, ...allPcts, 1);
      const yTicks = [0, 50, 100].filter((t) => t <= maxPct);
      if (!yTicks.includes(100) && maxPct >= 100) yTicks.push(100);
      const yAt = (pct: number) => PAD.top + plotH - (pct / maxPct) * plotH;
      const lines = seriesData.map((s) => ({
        ...s,
        points: s.pcts.map((pct, i) => ({ x: xAt(i), y: yAt(pct), plot: pct, value: s.values[i] })),
      }));
      return { plotW, plotH, days, yTicks, lines, xAt, yAt, goalY: yAt(100), axisMode: 'percent' as const, maxPlot: maxPct };
    }

    const goal = seriesData[0]?.goal || 0;
    const maxVal = Math.max(goal, ...seriesData.flatMap((s) => s.values), 1);
    const yTicks = niceTicks(maxVal);
    const maxPlot = yTicks[yTicks.length - 1] || maxVal;
    const yAt = (value: number) => PAD.top + plotH - (value / maxPlot) * plotH;
    const lines = seriesData.map((s) => ({
      ...s,
      points: s.values.map((value, i) => ({
        x: xAt(i),
        y: yAt(value),
        plot: value,
        value,
      })),
    }));
    return {
      plotW,
      plotH,
      days,
      yTicks,
      lines,
      xAt,
      yAt,
      goalY: goal > 0 ? yAt(goal) : null,
      axisMode: 'value' as const,
      maxPlot,
    };
  }, [summary, visibleMetric, visibleSeries, singleMetric]);

  const focusDate = hoverDate || (chart.days.some((d) => d.date === activeDate) ? activeDate : null) || null;
  const focusDay = chart.days.find((d) => d.date === focusDate);
  const selectedSeries = singleMetric ? SERIES.find((s) => s.id === singleMetric) : null;
  const weekAvg = singleMetric ? weekLoggedAverage(summary, singleMetric) : null;
  const priorAvg = singleMetric ? weekLoggedAverage(priorSummary, singleMetric) : null;
  const avgDelta = weekAvg && priorAvg ? weekAvg.avg - priorAvg.avg : null;

  function onWeekSwipeStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    weekSwipeStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onWeekSwipeCancel() {
    weekSwipeStart.current = null;
  }

  function onWeekSwipeEnd(e: TouchEvent) {
    const start = weekSwipeStart.current;
    weekSwipeStart.current = null;
    if (!start || loading) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX < 96) return;
    if (absY > 40) return;
    if (absX < absY * 1.75) return;
    if (deltaX > 0) onPrevWeek?.();
    else if (canGoNext) onNextWeek?.();
  }

  return (
    <div
      className={`card nutrition-weekly-card${loading ? ' is-refreshing' : ''}`}
      onTouchStart={onWeekSwipeStart}
      onTouchEnd={onWeekSwipeEnd}
      onTouchCancel={onWeekSwipeCancel}
    >
      <div className="topline nutrition-weekly-head">
        <h3>Weekly trend</h3>
        <div
          className="nutrition-date-nav"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="btn small secondary nutrition-date-arrow"
            onClick={onPrevWeek}
            aria-label="Previous week"
            disabled={loading}
          >
            ‹
          </button>
          <button
            type="button"
            className="btn small secondary nutrition-date-arrow"
            onClick={onNextWeek}
            aria-label="Next week"
            disabled={loading || !canGoNext}
          >
            ›
          </button>
          <span className="badge">
            {isCurrentWeek ? 'This week' : `${formatDisplayDate(summary.monday)} – ${formatDisplayDate(summary.sunday)}`}
          </span>
        </div>
      </div>
      {!isCurrentWeek && onThisWeek && (
        <div className="nutrition-weekly-subhead">
          <button type="button" className="nutrition-inline-link" onClick={onThisWeek}>
            Jump to this week
          </button>
        </div>
      )}

      <div
        className="nutrition-weekly-metric-tabs"
        role="radiogroup"
        aria-label="Nutrition trend metric"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          role="radio"
          aria-checked={visibleMetric === 'all'}
          className={`nutrition-weekly-metric-tab${visibleMetric === 'all' ? ' active' : ''}`}
          onClick={() => setVisibleMetric('all')}
        >
          All
        </button>
        {SERIES.map((s) => (
          <button
            type="button"
            key={s.id}
            role="radio"
            aria-checked={visibleMetric === s.id}
            className={`nutrition-weekly-metric-tab${visibleMetric === s.id ? ' active' : ''}`}
            onClick={() => setVisibleMetric(s.id)}
          >
            <span className="nutrition-weekly-legend-swatch" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>

      {singleMetric && selectedSeries && weekAvg ? (
        <p className="muted nutrition-weekly-chart-note">
          <span style={{ color: selectedSeries.color }}>{selectedSeries.label}</span>
          {' · '}
          week avg {formatMetricDisplay(singleMetric, weekAvg.avg)}
          {Number(summary.goals[singleMetric]) > 0
            ? ` · ${Math.round(goalPercent(weekAvg.avg, Number(summary.goals[singleMetric])))}% of goal`
            : ''}
          {avgDelta !== null
            ? ` · ${avgDelta >= 0 ? '+' : '−'}${formatMetricDisplay(singleMetric, Math.abs(avgDelta))} vs prior week`
            : ''}
        </p>
      ) : (
        <p className="muted nutrition-weekly-chart-note">
          {visibleMetric === 'all'
            ? 'Lines show % of daily goal. Swipe or use arrows for earlier weeks.'
            : 'No logged days this week. Swipe for earlier weeks.'}
        </p>
      )}

      <div className="nutrition-weekly-line-chart-wrap">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="nutrition-weekly-line-chart"
          role="img"
          aria-label={
            singleMetric
              ? `${SERIES.find((s) => s.id === singleMetric)?.label} trend for the week of ${formatDisplayDate(summary.monday)}`
              : `Weekly nutrition trend for calories, protein, carbs, and fat starting ${formatDisplayDate(summary.monday)}`
          }
        >
          {chart.yTicks.map((tick) => {
            const y = chart.yAt(tick);
            return (
              <g key={tick}>
                <line x1={PAD.left} y1={y} x2={SVG_W - PAD.right} y2={y} className="nutrition-weekly-grid-line" />
                <text x={PAD.left - 6} y={y + 4} className="nutrition-weekly-axis-label" textAnchor="end">
                  {chart.axisMode === 'percent' ? `${tick}%` : tick}
                </text>
              </g>
            );
          })}

          {chart.goalY !== null && (
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
                    key={`${line.id}-${day.date}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={isActive ? 5 : singleMetric ? 4 : 3.5}
                    className={`nutrition-weekly-point${isActive ? ' active' : ''}`}
                    style={{ fill: line.color }}
                    onMouseEnter={() => setHoverDate(day.date)}
                    onFocus={() => setHoverDate(day.date)}
                    onClick={() => onSelectDate?.(day.date)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${formatDisplayDate(day.date)} ${line.label} ${
                      chart.axisMode === 'percent'
                        ? `${Math.round(pt.plot)} percent of goal`
                        : formatMetricDisplay(line.id, pt.value)
                    }`}
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
              {dayLabelFromYmd(day.date)}
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
              {(singleMetric ? SERIES.filter((s) => s.id === singleMetric) : SERIES).map((s, idx) => {
                const val = metricValue(focusDay.totals, s.id);
                const goal = Number(summary.goals[s.id]) || 0;
                const pct = goal ? Math.round(goalPercent(val, goal)) : 0;
                return (
                  <span key={s.id}>
                    {idx > 0 ? ' · ' : ''}
                    <span style={{ color: s.color }}>{s.label}</span> {formatMetricDisplay(s.id, val)}
                    {goal ? ` (${pct}%)` : ''}
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
