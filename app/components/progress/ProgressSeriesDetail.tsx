'use client';

import { useEffect, useState } from 'react';
import Card from '../ui/Card';
import SegmentedControl from '../ui/SegmentedControl';
import ProgressTrendChart from './ProgressTrendChart';
import { supabase } from '../../../lib/supabaseClient';
import { fetchSeriesFacts } from '../../../lib/progress/queries';
import { seriesChartPoints, type SeriesChartMetric } from '../../../lib/progress/seriesChart';
import { formatCount, formatLoad, signedPercent } from '../../../lib/progress/progressView';
import { formatDisplayDate } from '../../../lib/training/programCalendar';
import type { ProgressSetFact } from '../../../lib/progress/setFacts';
import type { SeriesWindows } from '../../../lib/progress/strengthSeries';

const METRICS: { value: SeriesChartMetric; label: string }[] = [
  { value: 'e1rm', label: 'e1RM' },
  { value: 'load', label: 'Load' },
  { value: 'reps', label: 'Reps' },
  { value: 'volume', label: 'Volume' },
  { value: 'sets', label: 'Sets' },
];

type ProgressSeriesDetailProps = {
  series: SeriesWindows;
  related: SeriesWindows[];
  userId: string;
  from: string;
  to: string;
  weightUnit: string;
  rangeLabel: string;
  onBack: () => void;
  onSelectSeries: (key: string) => void;
};

export default function ProgressSeriesDetail({
  series,
  related,
  userId,
  from,
  to,
  weightUnit,
  rangeLabel,
  onBack,
  onSelectSeries,
}: ProgressSeriesDetailProps) {
  const [metric, setMetric] = useState<SeriesChartMetric>('e1rm');
  const [facts, setFacts] = useState<ProgressSetFact[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheKey = `${userId}|${series.key}|${from}|${to}`;

  useEffect(() => {
    let cancelled = false;
    const cached = factCache.get(cacheKey);
    if (cached) {
      setFacts(cached);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchSeriesFacts(
      supabase,
      userId,
      {
        catalogExerciseId: series.identity.catalogExerciseId,
        exerciseName: series.identity.exerciseName,
        equipment: series.identity.equipmentKey === 'unspecified' ? null : series.identity.equipmentLabel,
        variant: series.identity.variant,
      },
      from,
      to
    )
      .then((rows) => {
        if (cancelled) return;
        factCache.set(cacheKey, rows);
        setFacts(rows);
      })
      .catch(() => {
        if (!cancelled) setError('This exercise history could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, from, to, series.identity.catalogExerciseId, series.identity.equipmentKey, series.identity.equipmentLabel, series.identity.exerciseName, series.identity.variant, userId]);

  const points = facts ? seriesChartPoints(facts, metric) : [];
  const change = changeText(series, weightUnit);

  return (
    <div className="progress-stack">
      <button type="button" className="btn secondary progress-back" onClick={onBack}>Back</button>
      <Card elevated>
        <p className="progress-kicker">{series.identity.exerciseName}</p>
        <h2 className="progress-headline">{series.identity.equipmentLabel}</h2>
        {series.identity.variant && <p className="muted">{series.identity.variant}</p>}
        <div className="progress-stat-grid">
          <Stat label="Estimated 1RM" value={formatLoad(series.currentE1rm, weightUnit)} />
          <Stat label={`${rangeLabel} change`} value={change} />
          <Stat label="Best set" value={setText(series.bestSet, weightUnit)} />
          <Stat label="Recent performance" value={setText(series.lastSet, weightUnit)} />
          <Stat label="Volume" value={series.viewVolume > 0 ? `${formatCount(series.viewVolume)} ${weightUnit}` : null} />
          <Stat label="Working sets" value={series.workingSetsInView > 0 ? String(series.workingSetsInView) : null} />
        </div>
      </Card>

      {related.length > 1 && (
        <div className="progress-chip-row" role="tablist" aria-label="Equipment">
          {related.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={item.key === series.key}
              className={`progress-chip${item.key === series.key ? ' progress-chip--active' : ''}`}
              onClick={() => onSelectSeries(item.key)}
            >
              {item.identity.variant ? `${item.identity.equipmentLabel} · ${item.identity.variant}` : item.identity.equipmentLabel}
            </button>
          ))}
        </div>
      )}

      <Card>
        <div className="progress-scroll-tabs">
          <SegmentedControl<SeriesChartMetric>
            ariaLabel="Strength metric"
            size="sm"
            value={metric}
            onChange={(value) => setMetric(value)}
            options={METRICS}
          />
        </div>
        {loading && <p className="muted">Loading this exercise…</p>}
        {error && <p className="progress-error">{error}</p>}
        {!loading && !error && points.length >= 2 && (
          <>
            <ProgressTrendChart points={points} label={`${series.label} ${metricLabel(metric)}`} />
            <p className="muted">{formatDisplayDate(points[0].date)} – {formatDisplayDate(points[points.length - 1].date)}</p>
          </>
        )}
        {!loading && !error && points.length < 2 && (
          <p className="progress-lead">Log this movement a few more times in this period to see a {metricLabel(metric)} trend.</p>
        )}
      </Card>
    </div>
  );
}

const factCache = new Map<string, ProgressSetFact[]>();

export function clearSeriesFactCache() {
  factCache.clear();
}

function Stat({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <b>{value}</b>
      <span className="muted">{label}</span>
    </div>
  );
}

function setText(set: { weight: number; reps: number } | null, unit: string): string | null {
  if (!set) return null;
  const load = formatLoad(set.weight, unit);
  return load ? `${load} × ${set.reps}` : null;
}

function metricLabel(metric: SeriesChartMetric): string {
  return METRICS.find((item) => item.value === metric)?.label || metric;
}

function changeText(series: SeriesWindows, unit: string): string | null {
  const percent = signedPercent(series.percentChange);
  if (!percent) return null;
  if (series.baselineE1rm == null || series.currentE1rm == null) return percent;
  const delta = series.currentE1rm - series.baselineE1rm;
  const load = formatLoad(Math.abs(delta), unit);
  if (!load || Math.abs(delta) < 0.5) return percent;
  return `${delta > 0 ? '+' : '-'}${load} / ${percent}`;
}
