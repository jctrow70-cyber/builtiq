'use client';

import { useEffect, useMemo, useState } from 'react';
import Card from '../ui/Card';
import SegmentedControl from '../ui/SegmentedControl';
import ProgressTrendChart from './ProgressTrendChart';
import { supabase } from '../../../lib/supabaseClient';
import {
  buildExerciseProgress,
  type ExerciseChartRange,
  type ExerciseProgressIdentity,
  type RecentExerciseSession,
} from '../../../lib/progress/exerciseProgress';
import { fetchExerciseProgressRows } from '../../../lib/progress/queries';
import { chartValueDomain, type SeriesChartMetric } from '../../../lib/progress/seriesChart';
import { formatLoad, signedPercent } from '../../../lib/progress/progressView';
import type { ProgressSetFact } from '../../../lib/progress/setFacts';
import { formatDisplayDate, todayYmd } from '../../../lib/training/programCalendar';
import { equipmentSeriesKey, seriesIdentityFromParts } from '../../../lib/progress/identity';
import { historySetLabel } from '../../../lib/training/workoutHistory';

const RANGE_LABELS: { value: ExerciseChartRange; label: string }[] = [
  { value: '4W', label: '4 weeks' },
  { value: '3M', label: '3 months' },
  { value: '6M', label: '6 months' },
  { value: '1Y', label: '1 year' },
  { value: 'All', label: 'All time' },
];

const ADVANCED: { value: SeriesChartMetric; label: string }[] = [
  { value: 'e1rm', label: 'Estimated 1RM' },
  { value: 'load', label: 'Load' },
  { value: 'reps', label: 'Reps' },
  { value: 'volume', label: 'Volume' },
];

type ExerciseProgressDetailProps = {
  userId: string;
  target: ExerciseProgressIdentity;
  weightUnit: string;
  onBack: () => void;
  backLabel?: string;
};

const rowCache = new Map<string, ProgressSetFact[]>();

function exerciseCacheKey(userId: string, target: ExerciseProgressIdentity): string {
  return `${userId}|${target.catalogExerciseId || ''}|${target.exerciseName}`;
}

export function clearExerciseProgressCache() {
  rowCache.clear();
}

export default function ExerciseProgressDetail({ userId, target, weightUnit, onBack, backLabel = 'Back' }: ExerciseProgressDetailProps) {
  const [range, setRange] = useState<ExerciseChartRange>('4W');
  const [metric, setMetric] = useState<SeriesChartMetric>('e1rm');
  const [equipmentKey, setEquipmentKey] = useState(() => equipmentSelectionKey(target));
  const cacheKey = exerciseCacheKey(userId, target);
  const [facts, setFacts] = useState<ProgressSetFact[] | null>(rowCache.get(cacheKey) || null);
  const [loading, setLoading] = useState(!rowCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [openDate, setOpenDate] = useState<string | null>(null);

  useEffect(() => {
    setEquipmentKey(equipmentSelectionKey(target));
    setShowAll(false);
    setOpenDate(null);
    setMetric('e1rm');
  }, [target.catalogExerciseId, target.exerciseName, target.equipment, target.variant]);

  useEffect(() => {
    let cancelled = false;
    const cached = rowCache.get(cacheKey);
    if (cached) {
      setFacts(cached);
      setLoading(false);
      return;
    }
    setFacts(null);
    setLoading(true);
    setError(null);
    fetchExerciseProgressRows(supabase, userId, target)
      .then((rows) => {
        if (cancelled) return;
        rowCache.set(cacheKey, rows);
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
  }, [cacheKey, target, userId]);

  const selected = useMemo(() => {
    const [key, variant] = equipmentKey.split('|');
    const match = (facts || []).find((fact) => equipmentSeriesKey(fact.identity.equipmentLabel, fact.identity.variant) === `${key}|${variant || ''}`);
    return {
      ...target,
      equipment: match?.identity.equipmentLabel === 'Unspecified' ? '' : match?.identity.equipmentLabel || target.equipment,
      variant: variant || null,
    };
  }, [equipmentKey, facts, target]);

  const model = useMemo(() => {
    if (!facts) return null;
    return buildExerciseProgress({ facts, target: selected, range, today: todayYmd(), metric });
  }, [facts, selected, range, metric]);

  const domain = model && model.chart.length ? chartValueDomain(model.chart.map((point) => point.value)) : null;
  const sessions = showAll ? model?.allSessions || [] : model?.recent || [];

  return (
    <div className="progress-stack exercise-progress">
      <button type="button" className="btn secondary progress-back" onClick={onBack}>{backLabel}</button>
      <Card elevated>
        <p className="progress-kicker">Exercise progress</p>
        <h2 className="progress-headline">{model?.identity.exerciseName || target.exerciseName}</h2>
        <p className="progress-lead">{model?.identity.equipmentLabel || 'Unspecified'}{model?.identity.variant ? ` · ${model.identity.variant}` : ''}</p>
        {model?.recordLabel && <p className="muted">{model.recordLabel}</p>}
        <div className="progress-stat-grid">
          <Stat label="Estimated 1RM" value={formatLoad(model?.allTimeE1rm?.e1rm ?? null, weightUnit)} />
          <Stat label="Change in this period" value={changeText(model?.changePercent ?? null, model?.changeLoad ?? null, weightUnit)} />
          <Stat label="All-time best load" value={setText(model?.allTimeLoad || null, weightUnit)} />
          <Stat label="All-time best estimated 1RM" value={e1rmText(model?.allTimeE1rm || null, weightUnit)} />
          <Stat label="Best in this period" value={e1rmText(model?.periodBest || null, weightUnit)} />
        </div>
        <p className="muted">Estimated 1RM is calculated from working sets. It is not a tested one-rep maximum. A period best is not an all-time personal record.</p>
      </Card>

      {model && model.equipmentOptions.length > 1 && (
        <div className="progress-chip-row" role="tablist" aria-label="Equipment">
          {model.equipmentOptions.map((item) => {
            const key = `${item.equipmentKey}|${item.variant || ''}`;
            const label = item.variant ? `${item.equipmentLabel} · ${item.variant}` : item.equipmentLabel;
            return (
              <button key={key} type="button" role="tab" aria-selected={key === equipmentKey} className={`progress-chip${key === equipmentKey ? ' progress-chip--active' : ''}`} onClick={() => setEquipmentKey(key)}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="progress-scroll-tabs">
        <SegmentedControl<ExerciseChartRange> ariaLabel="Exercise date range" size="sm" value={range} onChange={setRange} options={RANGE_LABELS} />
      </div>

      <Card>
        <h3 className="progress-section-title">{metric === 'e1rm' ? 'Estimated strength' : metricLabel(metric)}</h3>
        {metric === 'e1rm' && <p className="muted">Each point is the best estimated 1RM on that workout date.</p>}
        {loading && <p className="muted">Loading this exercise…</p>}
        {error && <p className="progress-error">{error}</p>}
        {!loading && !error && model && model.chart.length > 0 && domain && (
          <ProgressTrendChart
            points={model.chart}
            label={`${model.identity.exerciseName} ${model.identity.equipmentLabel} ${metricLabel(metric)}`}
            domain={domain}
            showDates
            gapDays
            formatValue={(value) => metric === 'reps' ? String(Math.round(value)) : formatLoad(value, weightUnit) || String(Math.round(value))}
          />
        )}
        {!loading && !error && (!model || model.chart.length === 0) && (
          <p className="progress-lead">No comparable working sets for this equipment in this period.</p>
        )}
        <details className="progress-note exercise-progress-advanced">
          <summary>Other metrics</summary>
          <SegmentedControl<SeriesChartMetric> ariaLabel="Advanced strength metric" size="sm" value={metric} onChange={setMetric} options={ADVANCED} />
        </details>
      </Card>

      <Card>
        <div className="progress-section-head">
          <h3 className="progress-section-title">Recent sessions</h3>
          {model && model.allSessions.length > model.recent.length && (
            <button type="button" className="btn small secondary" onClick={() => setShowAll((value) => !value)}>
              {showAll ? 'Show recent' : 'View all history'}
            </button>
          )}
        </div>
        {!loading && sessions.length === 0 && <p className="progress-lead">No sessions for this equipment yet.</p>}
        {sessions.map((session) => (
          <SessionRow key={session.date} session={session} open={openDate === session.date} weightUnit={weightUnit} onToggle={() => setOpenDate(openDate === session.date ? null : session.date)} />
        ))}
      </Card>
    </div>
  );
}

function SessionRow({ session, open, weightUnit, onToggle }: { session: RecentExerciseSession; open: boolean; weightUnit: string; onToggle: () => void }) {
  return (
    <article className="training-history-block">
      <button type="button" className="training-history-row" aria-expanded={open} onClick={onToggle}>
        <span>
          <b>{formatDisplayDate(session.date)}</b>
          <span className="muted"> {setText(session.best, weightUnit) || 'Logged'}</span>
        </span>
        <span className="muted">{session.workingSets} working set{session.workingSets === 1 ? '' : 's'}</span>
      </button>
      {open && (
        <ul className="training-history-sets">
          {session.sets.map((set) => {
            const labeled = historySetLabel(set);
            return (
              <li key={set.id || `${set.setType}-${set.setNumber}`}>
                <span>{labeled.label}</span>
                <span>{set.weight != null ? `${formatLoad(set.weight, weightUnit)}` : '—'}{set.reps != null ? ` × ${set.reps}` : ''}</span>
                <span className="muted">{set.verified ? set.equipmentLabel : `${set.equipmentLabel} · unverified`}</span>
                {labeled.notes ? <span className="muted">{labeled.notes}</span> : null}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <b>{value || '—'}</b>
      <span className="muted">{label}</span>
    </div>
  );
}

function setText(mark: { weight: number | null; reps: number | null } | null, unit: string): string | null {
  if (!mark) return null;
  const load = formatLoad(mark.weight, unit);
  if (load && mark.reps != null) return `${load} × ${mark.reps}`;
  return load;
}

function e1rmText(mark: { weight: number | null; reps: number | null; e1rm: number | null; date: string } | null, unit: string): string | null {
  if (!mark) return null;
  const estimate = formatLoad(mark.e1rm, unit);
  const set = setText(mark, unit);
  const date = formatDisplayDate(mark.date);
  if (estimate && set) return `${estimate} · ${set} · ${date}`;
  if (set) return `${set} · ${date}`;
  return null;
}

function changeText(percent: number | null, delta: number | null, unit: string): string | null {
  const label = signedPercent(percent);
  if (!label) return null;
  if (delta == null || Math.abs(delta) < 0.5) return label;
  const load = formatLoad(Math.abs(delta), unit);
  return load ? `${delta > 0 ? '+' : '-'}${load} / ${label}` : label;
}

function metricLabel(metric: SeriesChartMetric): string {
  return ADVANCED.find((item) => item.value === metric)?.label || metric;
}

function equipmentSelectionKey(target: ExerciseProgressIdentity): string {
  const identity = seriesIdentityFromParts(target);
  return equipmentSeriesKey(identity.equipmentLabel, identity.variant);
}
