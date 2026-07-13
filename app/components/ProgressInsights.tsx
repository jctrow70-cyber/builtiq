'use client';

import {
  computePersonalRecords,
  computeProgressSummary,
  computeWeeklyTrends,
  maxTrendVolume,
  type PersonalRecord,
} from '../../lib/training/progressAnalytics';
import { formatDisplayDate } from '../../lib/training/programCalendar';

type ProgressInsightsProps = {
  logs: any[];
  weightUnit?: string;
};

function PrRow({ pr, weightUnit }: { pr: PersonalRecord; weightUnit: string }) {
  return (
    <div className="progress-pr-row">
      <div className="progress-pr-main">
        <b>{pr.name}</b>
        {pr.recentPr && <span className="badge progress-pr-badge">New PR</span>}
        <span className="muted">
          {pr.muscleGroup || 'Muscle'}
          {pr.maxWeight != null ? ` · ${pr.maxWeight} ${weightUnit}` : ''}
          {pr.bestReps != null ? ` × ${pr.bestReps}` : ''}
          {pr.est1rm != null ? ` · est. 1RM ${pr.est1rm} ${weightUnit}` : ''}
        </span>
      </div>
      <span className="muted progress-pr-date">
        {formatDisplayDate(pr.est1rmDate || pr.maxWeightDate || pr.bestVolumeDate)}
      </span>
    </div>
  );
}

export default function ProgressInsights({ logs, weightUnit = 'lb' }: ProgressInsightsProps) {
  const prs = computePersonalRecords(logs);
  const weeks = computeWeeklyTrends(logs, 8);
  const summary = computeProgressSummary(logs, prs);
  const peakVolume = maxTrendVolume(weeks);
  const hasStrength = summary.strengthSets > 0;

  if (!hasStrength) {
    return (
      <div className="card">
        <p className="muted">Log completed strength sets in Training to see personal records and volume trends.</p>
      </div>
    );
  }

  return (
    <>
      <div className="card progress-summary-card">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2>Strength overview</h2>
          <span className="badge">{summary.workoutDays} days</span>
        </div>
        <div className="dash-metrics progress-summary-metrics">
          <div>
            <b>{summary.prCount}</b>
            <span className="muted">Exercises tracked</span>
          </div>
          <div>
            <b>{summary.recentPrCount}</b>
            <span className="muted">PRs (14d)</span>
          </div>
          <div>
            <b>{summary.totalVolume.toLocaleString()}</b>
            <span className="muted">Total volume ({weightUnit})</span>
          </div>
          <div>
            <b>{summary.strengthSets}</b>
            <span className="muted">Sets logged</span>
          </div>
        </div>
      </div>

      {prs.length > 0 && (
        <div className="card progress-pr-card">
          <div className="topline" style={{ justifyContent: 'space-between' }}>
            <h2>Personal records</h2>
            <span className="badge">{prs.length}</span>
          </div>
          <p className="muted">Best weight and estimated 1RM per exercise from completed sets.</p>
          <div className="progress-pr-list">
            {prs.slice(0, 15).map((pr) => (
              <PrRow key={pr.key} pr={pr} weightUnit={weightUnit} />
            ))}
          </div>
          {prs.length > 15 && <p className="muted" style={{ marginTop: 8 }}>Showing top 15 by estimated 1RM.</p>}
        </div>
      )}

      <div className="card progress-trend-card">
        <div className="topline" style={{ justifyContent: 'space-between' }}>
          <h2>Weekly volume</h2>
          <span className="muted">Last 8 weeks</span>
        </div>
        <p className="muted">Strength volume = weight × reps per completed set (Mon–Sun weeks).</p>
        <div className="progress-trend-chart" role="img" aria-label="Weekly training volume chart">
          {weeks.map((w) => {
            const pct = Math.round((w.volume / peakVolume) * 100);
            return (
              <div className="progress-trend-bar-wrap" key={w.weekStart} title={`${w.weekLabel}: ${w.volume.toLocaleString()} ${weightUnit}`}>
                <div className="progress-trend-bar" style={{ height: `${Math.max(4, pct)}%` }} />
                <span className="progress-trend-label">{formatDisplayDate(w.weekStart).slice(0, 5)}</span>
                <span className="progress-trend-meta muted">{w.days}d · {w.sets}s</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
