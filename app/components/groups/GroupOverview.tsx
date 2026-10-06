'use client';

type GroupOverviewProps = {
  canManage: boolean;
  memberCount: number;
  activeThisWeek: number;
  setsThisWeek: number;
  planName?: string | null;
  planStatus?: string | null;
  planWeeks?: number | null;
  noActivityNames: string[];
  overdueAssignments: number;
  pendingAssignments: number;
  pendingInvites: number;
  selfSets: number;
  selfDays: number;
  selfPlanName?: string | null;
  onViewTraining: () => void;
};

export default function GroupOverview({
  canManage,
  memberCount,
  activeThisWeek,
  setsThisWeek,
  planName,
  planStatus,
  planWeeks,
  noActivityNames,
  overdueAssignments,
  pendingAssignments,
  pendingInvites,
  selfSets,
  selfDays,
  selfPlanName,
  onViewTraining,
}: GroupOverviewProps) {
  if (!canManage) {
    return (
      <div className="card">
        <h2>Your week</h2>
        <div className="dash-metrics" style={{ marginTop: 12 }}>
          <div>
            <b>{selfSets}</b>
            <span className="muted">Sets logged</span>
          </div>
          <div>
            <b>{selfDays}</b>
            <span className="muted">Active days</span>
          </div>
        </div>
        <p style={{ marginTop: 12 }}>
          <span className="muted">Your group program · </span>
          <b>{selfPlanName || planName || 'No group program yet'}</b>
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          Log this plan from the Training tab in the main navigation.
        </p>
        <button type="button" className="btn small secondary" style={{ marginTop: 12 }} onClick={onViewTraining}>
          View group training
        </button>
      </div>
    );
  }

  const attention = noActivityNames.length + overdueAssignments + pendingInvites + pendingAssignments;

  return (
    <>
      <div className="card">
        <h2>Group snapshot</h2>
        <div className="dash-metrics" style={{ marginTop: 12 }}>
          <div>
            <b>{memberCount}</b>
            <span className="muted">Members</span>
          </div>
          <div>
            <b>
              {activeThisWeek}/{memberCount || 0}
            </b>
            <span className="muted">Active this week</span>
          </div>
          <div>
            <b>{setsThisWeek}</b>
            <span className="muted">Sets logged</span>
          </div>
        </div>
        <p style={{ marginTop: 12 }}>
          <span className="muted">Current group program · </span>
          <b>{planName || 'None yet'}</b>
          {planStatus ? <span className="muted"> · {planStatus}</span> : null}
        </p>
      </div>

      <div className="card">
        <h2>Needs attention</h2>
        {attention === 0 ? (
          <p className="muted">No quiet members, overdue assignments, or pending invites right now.</p>
        ) : (
          <div className="group-attention-list">
            {noActivityNames.length > 0 && (
              <p>
                <b>No activity this week</b>
                <span className="muted">
                  {' '}
                  · {noActivityNames.slice(0, 8).join(', ')}
                  {noActivityNames.length > 8 ? ` · +${noActivityNames.length - 8} more` : ''}
                </span>
              </p>
            )}
            <p className="muted">This is logged activity, not a missed-workout score.</p>
            {overdueAssignments > 0 && (
              <p>
                <b>{overdueAssignments}</b> <span className="muted">overdue assigned workout{overdueAssignments === 1 ? '' : 's'}</span>
              </p>
            )}
            {pendingAssignments > 0 && (
              <p>
                <b>{pendingAssignments}</b> <span className="muted">pending assigned workout{pendingAssignments === 1 ? '' : 's'}</span>
              </p>
            )}
            {pendingInvites > 0 && (
              <p>
                <b>{pendingInvites}</b> <span className="muted">pending invitation{pendingInvites === 1 ? '' : 's'}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Current training</h2>
        <p>
          <b>{planName || 'No group program yet'}</b>
        </p>
        <p className="muted">
          {[planStatus, planWeeks ? `${planWeeks} week cycle` : null].filter(Boolean).join(' · ') || 'Set a group program from Training.'}
        </p>
        <button type="button" className="btn small green" style={{ marginTop: 12 }} onClick={onViewTraining}>
          View Training
        </button>
      </div>
    </>
  );
}
