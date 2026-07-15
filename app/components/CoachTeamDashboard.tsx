'use client';

import type { CoachAlert, TeamCoachOverview } from '../../lib/training/teamCoach/types';

type CoachTeamDashboardProps = {
  teamName: string;
  overview: TeamCoachOverview;
  onRefresh?: () => void;
};

function alertIcon(kind: CoachAlert['kind']) {
  if (kind === 'missed_session') return '⚠';
  if (kind === 'low_compliance') return '↓';
  if (kind === 'new_pr') return '★';
  return '…';
}

export default function CoachTeamDashboard({
  teamName,
  overview,
  onRefresh,
}: CoachTeamDashboardProps) {
  return (
    <div className="card coach-dashboard-card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2>Coach dashboard</h2>
          <p className="muted coach-dashboard-sub">{teamName}</p>
        </div>
        {onRefresh && (
          <button type="button" className="btn small secondary" onClick={onRefresh}>
            Refresh
          </button>
        )}
      </div>

      <div className="dash-metrics coach-dash-metrics">
        <div>
          <b>{overview.athleteCount}</b>
          <span className="muted">Athletes</span>
        </div>
        <div>
          <b>{overview.trainingToday}</b>
          <span className="muted">Training today</span>
        </div>
        <div>
          <b>{overview.completedToday}</b>
          <span className="muted">Completed</span>
        </div>
        <div>
          <b>{overview.missedToday}</b>
          <span className="muted">Not started</span>
        </div>
        <div>
          <b>{overview.compliancePct}%</b>
          <span className="muted">Team compliance</span>
        </div>
        <div>
          <b>{overview.prsThisWeek}</b>
          <span className="muted">PRs this week</span>
        </div>
        <div>
          <b>{overview.totalSetsThisWeek}</b>
          <span className="muted">Team sets (wk)</span>
        </div>
        <div>
          <b>{overview.inProgressToday}</b>
          <span className="muted">In progress</span>
        </div>
      </div>

      {overview.alerts.length > 0 && (
        <div className="coach-alerts">
          <h3>Quick alerts</h3>
          <ul className="coach-alert-list">
            {overview.alerts.map((alert) => (
              <li key={alert.id} className={`coach-alert coach-alert-${alert.kind}`}>
                <span className="coach-alert-icon" aria-hidden>
                  {alertIcon(alert.kind)}
                </span>
                <span>{alert.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {overview.alerts.length === 0 && (
        <p className="muted coach-alerts-empty">No alerts — team is on track today.</p>
      )}
    </div>
  );
}
