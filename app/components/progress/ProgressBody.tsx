'use client';

import { useEffect, useState } from 'react';
import BodyProgress from '../BodyProgress';
import Card from '../ui/Card';
import SegmentedControl from '../ui/SegmentedControl';
import ProgressTrendChart from './ProgressTrendChart';
import { formatBodyMetric, type UnitsPreference } from '../../../lib/body/measurements';
import { comparisonGap, metricsFor, progressComparison, rollingDisplay } from '../../../lib/progress/comparison';
import type { BodyMetricTrend } from '../../../lib/progress/bodyTrends';
import type { ProgressReport } from '../../../lib/progress/report';

type ProgressBodyProps = {
  report: ProgressReport | null;
  userId: string;
  units: UnitsPreference;
  unitsPreference?: string | null;
  onDataChange?: () => void;
};

export default function ProgressBody({ report, userId, units, unitsPreference, onDataChange }: ProgressBodyProps) {
  const metrics = report?.body || [];
  const [selected, setSelected] = useState(metrics[0]?.key || '');
  const [view, setView] = useState<'trend' | 'checkins'>('trend');
  const active = metrics.find((metric) => metric.key === selected) || metrics[0] || null;

  useEffect(() => {
    if (!metrics.some((metric) => metric.key === selected)) setSelected(metrics[0]?.key || '');
  }, [metrics, selected]);

  const comparison = report ? progressComparison(report, units) : null;
  const aligned = comparison ? metricsFor(comparison, ['weight', 'waist', 'strength']) : [];
  const gap = comparison ? comparisonGap(comparison, 'body') : null;
  const notes = comparison?.observations.filter((note) => ['strength-weight', 'weight-waist', 'strength', 'waist', 'weight'].includes(note.id)) || [];

  return (
    <div className="progress-stack">
      {!report && <Card><p className="progress-lead">Loading your body progress…</p></Card>}
      {report && metrics.length === 0 && (
        <Card>
          <div className="progress-empty">
            <h3>Track changes beyond the workout</h3>
            <p>Add weight, waist, or other measurements to see how your body changes over time.</p>
          </div>
        </Card>
      )}
      {report && metrics.length > 0 && (
        <>
          <div className="progress-card-grid">
            {metrics.map((metric) => (
              <button key={metric.key} type="button" className={`ui-card progress-nav-card${metric.key === active?.key ? ' progress-chip--active' : ''}`} onClick={() => setSelected(metric.key)}>
                <span className="progress-kicker">{metric.label}</span>
                <span className="progress-hero-value">{shown(metric, units)}</span>
                {metric.delta != null && <span className="muted progress-card-line">{changeText(metric, units)}</span>}
              </button>
            ))}
          </div>
          {active && (
            <Card>
              <div className="progress-section-head">
                <div>
                  <h2 className="progress-section-title">{active.label}</h2>
                  <p className="progress-lead">{shown(active, units)} latest{active.delta != null ? ` · ${changeText(active, units)} this period` : ''}</p>
                </div>
                <SegmentedControl<'trend' | 'checkins'>
                  ariaLabel="Body measurement view"
                  size="sm"
                  value={view}
                  onChange={(value) => setView(value)}
                  options={[{ value: 'trend', label: 'Trend' }, { value: 'checkins', label: 'Check-ins' }]}
                />
              </div>
              {view === 'trend' ? <Trend metric={active} units={units} /> : <CheckIns metric={active} units={units} />}
            </Card>
          )}
        </>
      )}

      {comparison && (aligned.length > 0 || gap) && (
        <Card>
          <h2 className="progress-section-title">Body & Performance</h2>
          <p className="muted">{comparison.periodLabel}</p>
          {aligned.length > 0 && (
            <div className="progress-stat-grid">
              {aligned.map((metric) => (
                <div key={metric.id}>
                  <b>{metric.id === 'strength' ? metric.value : (metric.detail || metric.value)}</b>
                  <span className="muted">{metric.label}</span>
                </div>
              ))}
            </div>
          )}
          {notes.map((note) => <p className="progress-lead" key={note.id}>{note.text}</p>)}
          {gap && <p className="progress-lead">{gap}</p>}
        </Card>
      )}

      <BodyProgress
        userId={userId}
        unitsPreference={unitsPreference}
        onDataChange={onDataChange}
        span={report?.view}
        embedded
      />
    </div>
  );
}

function Trend({ metric, units }: { metric: BodyMetricTrend; units: UnitsPreference }) {
  const rolling = metric.key === 'weight' ? rollingDisplay(metric.raw) : [];
  const emphasizeRolling = metric.key === 'weight' && rolling.length > 0;
  if (metric.raw.length < 2) {
    return <p className="progress-lead">One check-in is saved. Add another to see how {metric.label.toLowerCase()} is moving.</p>;
  }
  return (
    <>
      <ProgressTrendChart
        points={emphasizeRolling ? rolling : metric.raw}
        secondaryPoints={emphasizeRolling ? metric.raw : undefined}
        label={`${metric.label} check-ins`}
        gapDays
      />
      {emphasizeRolling && (
        <p className="muted">The colored line is the rolling weight trend. The lighter line is each check-in.</p>
      )}
      {metric.rollingAverage != null && metric.key === 'weight' && (
        <p className="progress-lead">Rolling trend {formatBodyMetric(metric.rollingAverage, 'weight', units)}</p>
      )}
    </>
  );
}

function CheckIns({ metric, units }: { metric: BodyMetricTrend; units: UnitsPreference }) {
  const kind = metric.key === 'weight' ? 'weight' : metric.key === 'body_fat' ? 'percent' : 'length';
  return (
    <div className="progress-summary-list">
      {[...metric.raw].reverse().map((point) => (
        <div className="progress-summary-row" key={point.date}>
          <span>{point.date}</span>
          <b>{formatBodyMetric(point.value, kind, units)}</b>
        </div>
      ))}
    </div>
  );
}

function shown(metric: BodyMetricTrend, units: UnitsPreference): string {
  const kind = metric.key === 'weight' ? 'weight' : metric.key === 'body_fat' ? 'percent' : 'length';
  const value = metric.key === 'weight' && metric.rollingAverage != null ? metric.rollingAverage : metric.last;
  return formatBodyMetric(value, kind, units);
}

function changeText(metric: BodyMetricTrend, units: UnitsPreference): string {
  if (metric.delta == null) return '';
  const kind = metric.key === 'weight' ? 'weight' : metric.key === 'body_fat' ? 'percent' : 'length';
  if (Math.abs(metric.delta) < 0.05) return 'Unchanged';
  const amount = formatBodyMetric(Math.abs(metric.delta), kind, units);
  return `${metric.delta > 0 ? '+' : '-'}${amount}`;
}
