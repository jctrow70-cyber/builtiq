'use client';

import { useEffect, useState } from 'react';
import Card from '../ui/Card';
import { supabase } from '../../../lib/supabaseClient';
import { formatLoad, headlineRecords, signedPercent } from '../../../lib/progress/progressView';
import { formatDisplayDate } from '../../../lib/training/programCalendar';
import { fetchLiftIndex } from '../../../lib/progress/queries';
import { discoverLifts, filterLifts, type LiftDiscovery } from '../../../lib/progress/liftIndex';
import type { ExerciseProgressRequest } from '../../../lib/progress/exerciseProgress';
import type { ProgressReport } from '../../../lib/progress/report';
import type { StrengthPatternId } from '../../../lib/progress/strengthIndex';
import type { SeriesWindows } from '../../../lib/progress/strengthSeries';

type StrengthView =
  | { kind: 'home' }
  | { kind: 'pattern'; patternId: StrengthPatternId };

type ProgressStrengthProps = {
  report: ProgressReport;
  userId: string;
  weightUnit: string;
  onOpenExercise: (request: ExerciseProgressRequest) => void;
};

export default function ProgressStrength({ report, userId, weightUnit, onOpenExercise }: ProgressStrengthProps) {
  const [view, setView] = useState<StrengthView>({ kind: 'home' });
  const index = report.strengthIndex;

  useEffect(() => {
    setView({ kind: 'home' });
  }, [report.range, report.view.from, report.view.to]);

  function openSeries(series: SeriesWindows) {
    onOpenExercise({
      catalogExerciseId: series.identity.catalogExerciseId,
      exerciseName: series.identity.exerciseName,
      equipment: series.identity.equipmentKey === 'unspecified' ? '' : series.identity.equipmentLabel,
      variant: series.identity.variant,
      returnTo: 'progress',
      returnSection: 'strength',
    });
  }

  const pattern = view.kind === 'pattern' ? index.patterns.find((item) => item.patternId === view.patternId) : null;
  if (pattern) {
    const others = pattern.secondary.concat(pattern.excluded);
    return (
      <div className="progress-stack">
        <button type="button" className="btn secondary progress-back" onClick={() => setView({ kind: 'home' })}>Back</button>
        <Card elevated>
          <p className="progress-kicker">Movement pattern</p>
          <h2 className="progress-headline">{pattern.label}</h2>
          {pattern.representative ? (
            <>
              <p className="muted">Representative movement</p>
              <button type="button" className="progress-series-link" onClick={() => openSeries(pattern.representative!)}>
                <b>{pattern.representative.identity.exerciseName}</b>
                <span>{pattern.representative.identity.equipmentLabel}</span>
                <span className="progress-pattern-value">{signedPercent(pattern.percentChange) || 'Not enough data'}</span>
              </button>
              <p className="muted">{pattern.reason}</p>
            </>
          ) : (
            <>
              <p className="progress-card-label">Not enough data</p>
              <p className="progress-lead">{pattern.reason}</p>
            </>
          )}
        </Card>
        {others.length > 0 && (
          <Card>
            <h3 className="progress-insight-title">Other equipment</h3>
            <p className="muted">Each implement stays its own history.</p>
            {others.map((series) => (
              <SeriesRow key={series.key} series={series} onOpen={() => openSeries(series)} />
            ))}
          </Card>
        )}
      </div>
    );
  }

  const records = headlineRecords(report.personalRecords).slice(0, 8);

  return (
    <div className="progress-stack">
      <Card elevated>
        <p className="progress-kicker">Strength trend</p>
        {index.headline ? <h2 className="progress-headline">{index.headline}</h2> : <h2 className="progress-headline">Not enough data yet</h2>}
        {index.coverageLine && <p className="progress-lead">{index.coverageLine}</p>}
        {!index.headline && (
          <div className="progress-empty">
            <h3>Start building your strength baseline</h3>
            <p>Log a few strength workouts and BuildIQ will begin tracking your performance.</p>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="progress-section-title">Movement patterns</h2>
        {index.patterns.map((item) => (
          <button key={item.patternId} type="button" className="progress-pattern" onClick={() => setView({ kind: 'pattern', patternId: item.patternId })}>
            <span>{item.label}</span>
            <b>{item.percentChange == null ? 'Not enough data' : signedPercent(item.percentChange)}</b>
          </button>
        ))}
      </Card>

      {records.length > 0 && (
        <Card>
          <h2 className="progress-section-title">Best in this period</h2>
          <p className="muted">Strongest sets in this period. A period best is not an all-time personal record.</p>
          {records.map((record) => (
            <button key={record.key} type="button" className="progress-pr" onClick={() => {
              const series = report.series.find((item) => item.key === record.key);
              if (series) openSeries(series);
            }}>
              <span>
                <b>{record.label}</b>
                <span className="muted">{setLine(record.weight, record.reps, weightUnit)}{record.e1rm != null ? ` · e1RM ${formatLoad(record.e1rm, weightUnit)}` : ''}</span>
              </span>
              <span className="muted">{formatDisplayDate(record.date)}</span>
            </button>
          ))}
        </Card>
      )}

      <LiftBrowser userId={userId} onOpenExercise={onOpenExercise} />

    </div>
  );
}

function LiftBrowser({ userId, onOpenExercise }: { userId: string; onOpenExercise: (request: ExerciseProgressRequest) => void }) {
  const [lifts, setLifts] = useState<LiftDiscovery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchLiftIndex(supabase, userId)
      .then((rows) => {
        if (!cancelled) setLifts(discoverLifts(rows));
      })
      .catch(() => {
        if (!cancelled) setError('Lifts could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const visible = filterLifts(lifts || [], query);
  return (
    <Card>
      <h2 className="progress-section-title">Lifts</h2>
      <p className="muted">Every lift you have logged. Equipment stays separate. The date range above applies to the summary, not this list.</p>
      <input className="lift-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lifts" aria-label="Search lifts" />
      {!lifts && !error && <p className="muted">Loading lifts…</p>}
      {error && <p className="progress-error">{error}</p>}
      {lifts && visible.length === 0 && <p className="progress-lead">{query.trim() ? 'No lifts match that search.' : 'No lifts logged yet.'}</p>}
      {visible.map((lift) => (
        <button
          key={lift.key}
          type="button"
          className="progress-pattern"
          onClick={() => onOpenExercise({
            catalogExerciseId: lift.catalogExerciseId,
            exerciseName: lift.exerciseName,
            equipment: lift.equipment,
            variant: lift.variant,
            returnTo: 'progress',
            returnSection: 'strength',
          })}
        >
          <span>
            <b>{lift.exerciseName}</b>
            <span className="muted">{lift.variant ? `${lift.equipmentLabel} · ${lift.variant}` : lift.equipmentLabel}</span>
          </span>
          <span className="muted">{formatDisplayDate(lift.lastPerformed)}</span>
        </button>
      ))}
    </Card>
  );
}

function SeriesRow({ series, onOpen }: { series: SeriesWindows; onOpen: () => void }) {
  return (
    <button type="button" className="progress-pattern" onClick={onOpen}>
      <span>
        <b>{series.identity.exerciseName}</b>
        <span className="muted">{series.identity.variant ? `${series.identity.equipmentLabel} · ${series.identity.variant}` : series.identity.equipmentLabel}</span>
      </span>
      <b>{series.percentChange == null ? 'Not enough data' : signedPercent(series.percentChange)}</b>
    </button>
  );
}

function setLine(weight: number | null, reps: number | null, unit: string): string {
  const load = formatLoad(weight, unit);
  if (load && reps != null) return `${load} × ${reps}`;
  if (load) return load;
  if (reps != null) return `${reps} reps`;
  return 'Logged set';
}
