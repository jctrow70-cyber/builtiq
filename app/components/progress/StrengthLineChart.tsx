'use client';

import { useState } from 'react';
import { strengthAxisDates, strengthChartModel, strengthGridValues, type SeriesChartPoint } from '../../../lib/progress/seriesChart';
import { signedPercent } from '../../../lib/progress/progressView';
import { formatDisplayDate } from '../../../lib/training/programCalendar';

const WIDTH = 360;
const HEIGHT = 156;
const LEFT = 66;
const RIGHT = 12;
const TOP = 14;
const BOTTOM = 124;

type StrengthLineChartProps = {
  points: SeriesChartPoint[];
  label: string;
  domain: { min: number; max: number };
  formatValue: (value: number) => string;
  summaryLabels?: { start: string; latest: string; change: string } | null;
  caption: string;
};

export default function StrengthLineChart({ points, label, domain, formatValue, summaryLabels, caption }: StrengthLineChartProps) {
  const model = strengthChartModel(points);
  const [active, setActive] = useState<number | null>(null);
  if (!model.points.length) return null;

  const grids = strengthGridValues(domain.min, domain.max);
  const axisDates = strengthAxisDates(model.points.map((point) => point.date), 4);
  const spots = model.points.map((point) => ({ point, x: xFor(point.date, model.points), y: yFor(point.value, domain) }));
  const line = model.connect ? spots.map((spot) => `${spot.x},${spot.y}`).join(' ') : '';
  const shown = active != null ? spots[active] : null;
  const tipRight = shown != null && shown.x > WIDTH * 0.62;
  const tipBelow = shown != null && shown.y < TOP + 36;

  return (
    <div className="strength-chart">
      {summaryLabels && model.start && model.latest && (
        <div className="strength-chart-stats">
          <Metric label={summaryLabels.start} value={formatValue(model.start.value)} />
          <Metric label={summaryLabels.latest} value={formatValue(model.latest.value)} />
          <Metric label={summaryLabels.change} value={signedPercent(model.changePercent) || '—'} />
        </div>
      )}
      <div className="strength-chart-plot">
        <svg className="strength-chart-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={chartLabel(label, model.points.length)}>
          {grids.map((value) => {
            const y = yFor(value, domain);
            return (
              <g key={value}>
                <line className="strength-chart-grid" x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} />
                <text className="strength-chart-label" x="2" y={y + 4}>{formatValue(value)}</text>
              </g>
            );
          })}
          {axisDates.map((date) => (
            <text key={date} className="strength-chart-label" x={xFor(date, model.points)} y={HEIGHT - 6} textAnchor={anchorFor(date, model.points)}>
              {formatDisplayDate(date)}
            </text>
          ))}
          {line && <polyline className="strength-chart-line" points={line} />}
          {spots.map((spot, index) => (
            <g key={spot.point.date}>
              <circle className="strength-chart-marker" cx={spot.x} cy={spot.y} r={model.points.length === 1 ? 5 : 4} />
              <circle
                className="strength-chart-hit"
                cx={spot.x}
                cy={spot.y}
                r="14"
                tabIndex={0}
                role="button"
                aria-label={`${formatDisplayDate(spot.point.date)}, ${formatValue(spot.point.value)}`}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={(event) => {
                  if (event.currentTarget === document.activeElement) return;
                  setActive((current) => (current === index ? null : current));
                }}
                onFocus={() => setActive(index)}
                onBlur={() => setActive((current) => (current === index ? null : current))}
                onClick={() => setActive(index)}
              />
            </g>
          ))}
        </svg>
        {shown && (
          <div
            className={`strength-chart-tip${tipRight ? ' strength-chart-tip--right' : ''}${tipBelow ? ' strength-chart-tip--below' : ''}`}
            style={{ left: `${(shown.x / WIDTH) * 100}%`, top: `${(shown.y / HEIGHT) * 100}%` }}
          >
            <b>{formatDisplayDate(shown.point.date)}</b>
            <span>{formatValue(shown.point.value)}</span>
          </div>
        )}
      </div>
      <p className="strength-chart-note">{caption}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function chartLabel(label: string, count: number): string {
  if (count < 2) return `${label}. One recorded workout date. No line is drawn.`;
  return `${label}. The line connects ${count} recorded workout dates.`;
}

function xFor(date: string, points: SeriesChartPoint[]): number {
  if (points.length < 2) return (LEFT + WIDTH - RIGHT) / 2;
  const start = timeOf(points[0].date);
  const end = timeOf(points[points.length - 1].date);
  const span = end - start || 1;
  return LEFT + ((timeOf(date) - start) / span) * (WIDTH - LEFT - RIGHT);
}

function yFor(value: number, domain: { min: number; max: number }): number {
  if (domain.max === domain.min) return (TOP + BOTTOM) / 2;
  return BOTTOM - ((value - domain.min) / (domain.max - domain.min)) * (BOTTOM - TOP);
}

function anchorFor(date: string, points: SeriesChartPoint[]): 'start' | 'middle' | 'end' {
  if (points.length < 2) return 'middle';
  if (date === points[0].date) return 'start';
  if (date === points[points.length - 1].date) return 'end';
  return 'middle';
}

function timeOf(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}
