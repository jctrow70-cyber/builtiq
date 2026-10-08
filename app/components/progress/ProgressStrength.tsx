'use client';

import { useEffect, useState } from 'react';
import Card from '../ui/Card';
import ProgressSeriesDetail from './ProgressSeriesDetail';
import { formatLoad, headlineRecords, rangePeriodLabel, signedPercent } from '../../../lib/progress/progressView';
import { formatDisplayDate } from '../../../lib/training/programCalendar';
import type { ProgressReport } from '../../../lib/progress/report';
import type { StrengthPatternId } from '../../../lib/progress/strengthIndex';
import type { SeriesWindows } from '../../../lib/progress/strengthSeries';

type StrengthView =
  | { kind: 'home' }
  | { kind: 'pattern'; patternId: StrengthPatternId }
  | { kind: 'series'; key: string; fromPatternId: StrengthPatternId | null };

type ProgressStrengthProps = {
  report: ProgressReport;
  userId: string;
  weightUnit: string;
};

export default function ProgressStrength({ report, userId, weightUnit }: ProgressStrengthProps) {
  const [view, setView] = useState<StrengthView>({ kind: 'home' });
  const index = report.strengthIndex;
  const period = rangePeriodLabel(report.range);

  useEffect(() => {
    setView({ kind: 'home' });
  }, [report.range, report.view.from, report.view.to]);

  const selected = view.kind === 'series' ? report.series.find((series) => series.key === view.key) : null;
  if (view.kind === 'series' && !selected) {
    return (
      <Card>
        <button type="button" className="btn secondary progress-back" onClick={() => setView({ kind: 'home' })}>Back</button>
        <p className="progress-lead">That exercise is not in this date range.</p>
      </Card>
    );
  }
  if (view.kind === 'series' && selected) {
    return (
      <ProgressSeriesDetail
        series={selected}
        related={relatedSeries(report.series, selected)}
        userId={userId}
        from={report.view.from}
        to={report.view.to}
        weightUnit={weightUnit}
        rangeLabel={period}
        onBack={() => setView(view.fromPatternId ? { kind: 'pattern', patternId: view.fromPatternId } : { kind: 'home' })}
        onSelectSeries={(key) => setView({ kind: 'series', key, fromPatternId: view.fromPatternId })}
      />
    );
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
              <button type="button" className="progress-series-link" onClick={() => setView({ kind: 'series', key: pattern.representative!.key, fromPatternId: pattern.patternId })}>
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
              <SeriesRow key={series.key} series={series} onOpen={() => setView({ kind: 'series', key: series.key, fromPatternId: pattern.patternId })} />
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
          <h2 className="progress-section-title">Best performances</h2>
          <p className="muted">Strongest sets in this period. Each exercise and implement is listed once.</p>
          {records.map((record) => (
            <button key={record.key} type="button" className="progress-pr" onClick={() => setView({ kind: 'series', key: record.key, fromPatternId: null })}>
              <span>
                <b>{record.label}</b>
                <span className="muted">{setLine(record.weight, record.reps, weightUnit)}{record.e1rm != null ? ` · e1RM ${formatLoad(record.e1rm, weightUnit)}` : ''}</span>
              </span>
              <span className="muted">{formatDisplayDate(record.date)}</span>
            </button>
          ))}
        </Card>
      )}

    </div>
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

function relatedSeries(series: SeriesWindows[], current: SeriesWindows): SeriesWindows[] {
  return series.filter((item) => {
    if (current.identity.catalogExerciseId && item.identity.catalogExerciseId === current.identity.catalogExerciseId) return true;
    if (!current.identity.catalogExerciseId && item.identity.exerciseName.toLowerCase() === current.identity.exerciseName.toLowerCase()) return true;
    return false;
  });
}

function setLine(weight: number | null, reps: number | null, unit: string): string {
  const load = formatLoad(weight, unit);
  if (load && reps != null) return `${load} × ${reps}`;
  if (load) return load;
  if (reps != null) return `${reps} reps`;
  return 'Logged set';
}
